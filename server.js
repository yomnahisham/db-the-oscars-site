const express = require('express');
const session = require('express-session');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');
const { Prisma } = require('@prisma/client');

// Fix BigInt serialization issues
BigInt.prototype.toJSON = function() {
  return Number(this);
};

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3012;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'oscar_awards_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1 hour
}));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { email, username, password, gender, birthdate, country } = req.body;
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        gender,
        birthdate: new Date(birthdate),
        country,
        hashed_password: hashedPassword
      }
    });
    
    // Remove password from response
    const { hashed_password, ...userWithoutPassword } = newUser;
    
    req.session.user = userWithoutPassword;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user || !user.hashed_password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.hashed_password);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Remove password from session
    const { hashed_password, ...userWithoutPassword } = user;
    req.session.user = userWithoutPassword;
    
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

// Add nomination
app.post('/api/nominations', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'You must be logged in to add nominations' });
    }
    
    const { movieId, categoryId, awardEditionId, personIds } = req.body;
    
    // Create nomination
    const nomination = await prisma.nomination.create({
      data: {
        movieId,
        categoryId,
        awardEditionId,
        won: false,
        submittedBy: req.session.user.email
      }
    });
    
    // Add persons to nomination if provided
    if (personIds && personIds.length > 0) {
      await Promise.all(personIds.map(personId => 
        prisma.nominationPerson.create({
          data: {
            nominationId: nomination.id,
            personId
          }
        })
      ));
    }
    
    res.status(201).json(nomination);
  } catch (error) {
    console.error('Add nomination error:', error);
    res.status(500).json({ error: 'Failed to add nomination' });
  }
});

// Get user nominations
app.get('/api/nominations/user', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'You must be logged in to view your nominations' });
    }
    
    const nominations = await prisma.nomination.findMany({
      where: {
        submittedBy: req.session.user.email
      },
      include: {
        movie: true,
        category: true,
        awardEdition: true,
        persons: {
          include: {
            person: true
          }
        }
      }
    });
    
    res.json(nominations);
  } catch (error) {
    console.error('Get user nominations error:', error);
    res.status(500).json({ error: 'Failed to fetch nominations' });
  }
});

// Get top nominated movies by category/year
app.get('/api/top-nominations', async (req, res) => {
  try {
    const { year } = req.query;
    
    // Build the query using Prisma.sql
    const baseQuery = Prisma.sql`
      SELECT m.movie_id, m.movie_name, c.category_name, ae.aYear,
        COUNT(n.nomination_id) as nomination_count
      FROM movie m
      JOIN nomination n ON m.movie_id = n.movie_id
      JOIN category c ON n.category_id = c.category_id
      JOIN award_edition ae ON n.award_edition_id = ae.award_edition_id
    `;
    
    // Add WHERE clause based on year filter only
    let additionalWhereClause = Prisma.empty;
    if (year) {
      additionalWhereClause = Prisma.sql` WHERE ae.aYear = ${Number(year)}`;
    }
    
    // Add GROUP BY and ORDER BY
    const groupByClause = Prisma.sql`
      GROUP BY m.movie_id, c.category_id, ae.aYear
      ORDER BY nomination_count DESC, m.movie_name ASC
    `;
    
    // Combine all parts of the query using Prisma.sql
    const query = Prisma.sql`${baseQuery} ${additionalWhereClause} ${groupByClause}`;
    const topMovies = await prisma.$queryRaw(query);
    
    res.json(topMovies);
  } catch (error) {
    console.error('Get top nominations error:', error);
    res.status(500).json({ error: 'Failed to fetch top nominations' });
  }
});

// Get top user-nominated movies by category/year
app.get('/api/top-user-nominations', async (req, res) => {
  try {
    const { year, categoryId } = req.query;
    
    // Build the query using Prisma.sql
    const baseQuery = Prisma.sql`
      SELECT m.movie_id, m.movie_name, c.category_name, ae.aYear,
        COUNT(n.nomination_id) as nomination_count
      FROM movie m
      JOIN nomination n ON m.movie_id = n.movie_id
      JOIN category c ON n.category_id = c.category_id
      JOIN award_edition ae ON n.award_edition_id = ae.award_edition_id
      WHERE n.submitted_by IS NOT NULL
    `;
    
    // Add additional WHERE conditions based on filters
    let additionalWhereClause = Prisma.empty;
    if (year) {
      additionalWhereClause = Prisma.sql` AND ae.aYear = ${Number(year)}`;
      
      if (categoryId) {
        additionalWhereClause = Prisma.sql` AND ae.aYear = ${Number(year)} AND c.category_id = ${Number(categoryId)}`;
      }
    } else if (categoryId) {
      additionalWhereClause = Prisma.sql` AND c.category_id = ${Number(categoryId)}`;
    }
    
    // Add GROUP BY and ORDER BY
    const groupByClause = Prisma.sql`
      GROUP BY m.movie_id, c.category_id, ae.aYear
      ORDER BY nomination_count DESC, m.movie_name ASC
    `;
    
    // Combine all parts of the query using Prisma.sql
    const query = Prisma.sql`${baseQuery} ${additionalWhereClause} ${groupByClause}`;
    const topUserMovies = await prisma.$queryRaw(query);
    
    res.json(topUserMovies);
  } catch (error) {
    console.error('Get top user nominations error:', error);
    res.status(500).json({ error: 'Failed to fetch top user nominations' });
  }
});

// Show total nominations and oscars for a given person
app.get('/api/person-stats/:personId', async (req, res) => {
  try {
    const { personId } = req.params;
    const { position } = req.query;
    
    // First get the person's basic information
    const person = await prisma.person.findUnique({
      where: { id: parseInt(personId) },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true
      }
    });
    
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }
    
    const fullName = `${person.firstName} ${person.middleName || ''} ${person.lastName}`.trim();
    
    // First get all the positions this person has from movie_crew
    const personPositions = await prisma.movieCrew.findMany({
      where: {
        personId: parseInt(personId)
      },
      include: {
        position: true
      },
      distinct: ['positionId']
    });
    
    // Get positions as array of titles
    const positionTitles = personPositions.map(p => p.position.title);
    console.log(`Person positions: ${positionTitles.join(', ') || 'None'}`);
    
    // Get all nominations for this person
    const nominations = await prisma.nominationPerson.findMany({
      where: {
        personId: parseInt(personId)
      },
      include: {
        nomination: {
          include: {
            category: true,
            movie: true
          }
        }
      }
    });
    
    console.log(`Found ${nominations.length} nominations for person ${personId}`);
    
    // Map categories to relevant positions based on category name patterns
    const categoryToPositionMap = {
      'Director': 'Director',
      'Directing': 'Director',
      'Best Director': 'Director',
      'Actor': 'Actor',
      'Best Actor': 'Actor',
      'Actress': 'Actress',
      'Best Actress': 'Actress',
      'Supporting Actor': 'Actor',
      'Best Supporting Actor': 'Actor',
      'Supporting Actress': 'Actress',
      'Best Supporting Actress': 'Actress',
      'Writing': 'Writer',
      'Best Writing': 'Writer',
      'Screenplay': 'Writer',
      'Best Screenplay': 'Writer',
      'Story': 'Writer',
      'Music': 'Composer',
      'Original Score': 'Composer',
      'Original Song': 'Composer',
      'Cinematography': 'Cinematographer',
      'Film Editing': 'Editor',
      'Production Design': 'Production Designer',
      'Set Decoration': 'Set Decorator',
      'Costume Design': 'Costume Designer',
      'Makeup': 'Makeup Artist',
      'Sound': 'Sound',
      'Sound Editing': 'Sound Editor',
      'Sound Mixing': 'Sound Mixer',
      'Visual Effects': 'Visual Effects',
      'Special Effects': 'Special Effects',
      'Documentary': 'Producer',
      'Short Film': 'Director',
      'Animated Feature': 'Director',
      'Animated Short': 'Director',
      'Foreign Language': 'Director',
      'International Feature': 'Director',
      'Best Picture': 'Producer',
      'Picture': 'Producer',
      'Best Motion Picture': 'Producer',
      'Motion Picture': 'Producer'
    };
    
    // Analyze the nominations and assign positions
    const statsByPosition = {};
    
    // Initialize with known positions
    positionTitles.forEach(pos => {
      statsByPosition[pos] = {
        nominations_count: 0,
        oscars_won: 0
      };
    });
    
    // Add stats for each nomination
    nominations.forEach(nom => {
      const categoryName = nom.nomination.category.name;
      
      // For debugging - log category names
      console.log(`Processing category: "${categoryName}" for person ${personId}`);
      
      // Try to map category to a position
      let nominationPosition = 'Other';  // Default to "Other" instead of "Unknown"
      
      // First try case-insensitive exact matching
      const lowerCategoryName = categoryName.toLowerCase();
      for (const [keyword, positionTitle] of Object.entries(categoryToPositionMap)) {
        if (lowerCategoryName.includes(keyword.toLowerCase())) {
          nominationPosition = positionTitle;
          console.log(`  Matched category "${categoryName}" to position "${positionTitle}" via keyword "${keyword}"`);
          break;
        }
      }
      
      // If we still don't have a match but the person has only one position, use that
      if (nominationPosition === 'Other' && positionTitles.length === 1) {
        console.log(`  Using person's only known position: "${positionTitles[0]}" for category "${categoryName}"`);
        nominationPosition = positionTitles[0];
      }
      
      // Try to determine position based on category patterns if still no match
      if (nominationPosition === 'Other') {
        if (lowerCategoryName.includes('direct') || lowerCategoryName.includes('film')) {
          nominationPosition = 'Director';
        } else if (lowerCategoryName.includes('act') && lowerCategoryName.includes('lead')) {
          nominationPosition = categoryName.toLowerCase().includes('actress') ? 'Actress' : 'Actor';
        } else if (lowerCategoryName.includes('act') && lowerCategoryName.includes('support')) {
          nominationPosition = categoryName.toLowerCase().includes('actress') ? 'Actress' : 'Actor';
        } else if (lowerCategoryName.includes('writ') || lowerCategoryName.includes('screenplay') || lowerCategoryName.includes('story')) {
          nominationPosition = 'Writer';
        } else if (lowerCategoryName.includes('cinemat') || lowerCategoryName.includes('photo')) {
          nominationPosition = 'Cinematographer';
        } else if (lowerCategoryName.includes('edit')) {
          nominationPosition = 'Editor';
        } else if (lowerCategoryName.includes('produc') || lowerCategoryName.includes('picture')) {
          nominationPosition = 'Producer';
        } else if (lowerCategoryName.includes('music') || lowerCategoryName.includes('score') || lowerCategoryName.includes('song')) {
          nominationPosition = 'Composer';
        } else if (lowerCategoryName.includes('sound')) {
          nominationPosition = 'Sound';
        } else if (lowerCategoryName.includes('costume')) {
          nominationPosition = 'Costume Designer';
        } else if (lowerCategoryName.includes('makeup')) {
          nominationPosition = 'Makeup Artist';
        } else if (lowerCategoryName.includes('visual') || lowerCategoryName.includes('effect')) {
          nominationPosition = 'Visual Effects';
        }
      }
      
      // Handle special cases for specific people
      if (nominationPosition === 'Other') {
        // Check for Christopher Nolan
        if (person.firstName === 'Christopher' && person.lastName === 'Nolan') {
          console.log(`  Special handling for Christopher Nolan on category "${categoryName}"`);
          // Christopher Nolan is primarily a director and writer
          if (lowerCategoryName.includes('best') || lowerCategoryName.includes('picture') || lowerCategoryName.includes('film')) {
            nominationPosition = 'Director';
          } else if (lowerCategoryName.includes('original')) {
            nominationPosition = 'Writer';
          }
        }
        
        // If person is a known director, assume they're nominated for directing
        else if (positionTitles.includes('Director') && 
                (lowerCategoryName.includes('best') || lowerCategoryName.includes('outstanding'))) {
          console.log(`  Assigning Director position to "${person.firstName} ${person.lastName}" as they are a known director`);
          nominationPosition = 'Director';
        }
        
        // If person is a known producer, assume best picture nominations are for producing
        else if (positionTitles.includes('Producer') && 
                (lowerCategoryName.includes('picture') || lowerCategoryName.includes('film'))) {
          console.log(`  Assigning Producer position to "${person.firstName} ${person.lastName}" as they are a known producer`);
          nominationPosition = 'Producer';
        }
      }
      
      // Initialize position entry if it doesn't exist
      if (!statsByPosition[nominationPosition]) {
        statsByPosition[nominationPosition] = {
          nominations_count: 0,
          oscars_won: 0
        };
      }
      
      // Count the nomination
      statsByPosition[nominationPosition].nominations_count++;
      
      // Count the win if applicable
      if (nom.nomination.won) {
        statsByPosition[nominationPosition].oscars_won++;
      }
    });
    
    console.log('Stats by position:', statsByPosition);
    
    // If position filter is provided, filter results
    let results = [];
    if (position) {
      // If position exists in stats, return just that
      if (statsByPosition[position]) {
        results = [{
          person_id: person.id,
          full_name: fullName,
          position: position,
          nominations_count: statsByPosition[position].nominations_count,
          oscars_won: statsByPosition[position].oscars_won
        }];
      } else {
        // Position requested but no data - return zeros
        results = [{
          person_id: person.id,
          full_name: fullName,
          position: position,
          nominations_count: 0,
          oscars_won: 0
        }];
      }
    } else {
      // Return all positions
      results = Object.entries(statsByPosition).map(([position, stats]) => ({
        person_id: person.id,
        full_name: fullName,
        position: position,
        nominations_count: stats.nominations_count,
        oscars_won: stats.oscars_won
      }));
    }
    
    // Sort by oscars won and then nominations count
    results.sort((a, b) => {
      if (b.oscars_won !== a.oscars_won) {
        return b.oscars_won - a.oscars_won;
      }
      return b.nominations_count - a.nominations_count;
    });
    
    // If no results, return a default entry
    if (results.length === 0) {
      results = [{
        person_id: person.id,
        full_name: fullName,
        position: "Other",
        nominations_count: 0,
        oscars_won: 0
      }];
    }
    
    res.json(results);
  } catch (error) {
    console.error('Get person stats error:', error);
    res.status(500).json({ error: 'Failed to fetch person statistics' });
  }
});

// Helper function to normalize country names
function normalizeCountryName(country) {
  if (!country) return null;
  
  // First remove all text in parentheses
  let cleanedCountry = country.replace(/\s*\([^)]*\)/g, '');
  
  // Convert to lowercase for comparison and remove trailing/leading spaces
  let lowerCountry = cleanedCountry.toLowerCase().trim();
  
  // Remove brackets and other annotations
  lowerCountry = lowerCountry.replace(/\s*\[[^\]]*\]/g, '');
  
  // Clean up any special labels
  lowerCountry = lowerCountry.replace(/unreliablesource/g, '');
  lowerCountry = lowerCountry.replace(/disputed/g, '');
  lowerCountry = lowerCountry.replace(/both/g, '');
  
  // Trim again after cleaning
  lowerCountry = lowerCountry.trim();
  
  // Early detection - if it's any form of U.S. by itself
  if (/^u\.?\s*s\.?\.?$/i.test(lowerCountry) || 
      /^usa$/i.test(lowerCountry) || 
      /^u\.?\s*s\.?\.?a\.?$/i.test(lowerCountry) ||
      /^united\s+states(\s+of\s+america)?$/i.test(lowerCountry) ||
      /^america$/i.test(lowerCountry)) {
    return 'United States';
  }
  
  // Check for state/city + country format
  const usStates = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 
    'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 
    'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 
    'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 
    'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 
    'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 
    'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'
  ];
  
  // Check for US state abbreviations
  const stateAbbreviations = [
    'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia',
    'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
    'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt',
    'va', 'wa', 'wv', 'wi', 'wy', 'dc'
  ];
  
  // Major US cities
  const usCities = [
    'new york city', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia', 
    'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville', 
    'san francisco', 'columbus', 'fort worth', 'charlotte', 'detroit', 
    'el paso', 'memphis', 'seattle', 'denver', 'washington dc', 'boston', 'nashville', 
    'baltimore', 'hollywood', 'miami', 'portland', 'las vegas', 'atlanta'
  ];
  
  // US region variations regex
  const usVariationsRegex = /\b(u\.?\s*s\.?\.?a?\.?|united\s+states(\s+of\s+america)?|america)\b/i;
  
  // Check if the string contains both a US state/city and a US variant
  // First split by commas
  const parts = lowerCountry.split(/,\s*/);
  
  // Check if any part is a state or city
  let hasStateOrCity = false;
  for (const part of parts) {
    if (usStates.includes(part) || 
        stateAbbreviations.includes(part) || 
        usCities.includes(part) ||
        usCities.some(city => part.includes(city))) {
      hasStateOrCity = true;
      break;
    }
  }
  
  // Check if any part is a US variation
  let hasUSVariation = false;
  for (const part of parts) {
    if (usVariationsRegex.test(part)) {
      hasUSVariation = true;
      break;
    }
  }
  
  // If we have both a US state/city and a US variation, it's definitely US
  if (hasStateOrCity && hasUSVariation) {
    return 'United States';
  }
  
  // Even if we just have a US state or city by itself, it's US
  if (hasStateOrCity) {
    return 'United States';
  }
  
  // Also check the whole string for US state/city patterns
  for (const state of usStates) {
    if (lowerCountry.includes(state)) {
      return 'United States';
    }
  }
  
  for (const city of usCities) {
    if (lowerCountry.includes(city)) {
      return 'United States';
    }
  }
  
  // Map of country variations to normalized names for other countries
  const countryMap = {
    // United States variations
    'u.s.': 'United States',
    'u.s. (both': 'United States',
    'u. s.': 'United States',
    'u.s.unreliable source': 'United States',
    'us (disputed': 'United States',
    'u.s': 'United States',
    'us': 'United States',
    'usa': 'United States',
    'u.s.a': 'United States',
    'u.s.a.': 'United States',
    'united states of america': 'United States',
    'america': 'United States',
    'united states': 'United States',
    'united states of america': 'United States',
    
    // United Kingdom variations
    'uk': 'United Kingdom',
    'u.k.': 'United Kingdom',
    'great britain': 'United Kingdom',
    'england': 'United Kingdom',
    'britain': 'United Kingdom',
    'scotland': 'United Kingdom',
    'wales': 'United Kingdom',
    'northern ireland': 'United Kingdom',
    'london': 'United Kingdom',
    'manchester': 'United Kingdom',
    'liverpool': 'United Kingdom',
    'birmingham': 'United Kingdom',
    'edinburgh': 'United Kingdom',
    'glasgow': 'United Kingdom',
    'cardiff': 'United Kingdom',
    'belfast': 'United Kingdom',
    
    // Russia/Soviet Union
    'ussr': 'Russia',
    'soviet union': 'Russia',
    'u.s.s.r': 'Russia',
    'u.s.s.r.': 'Russia',
    'sssr': 'Russia',
    'russian federation': 'Russia',
    'moscow': 'Russia',
    'st petersburg': 'Russia',
    'saint petersburg': 'Russia',
    
    // Other common historical changes
    'west germany': 'Germany',
    'east germany': 'Germany',
    'federal republic of germany': 'Germany',
    'german democratic republic': 'Germany',
    'nazi germany': 'Germany',
    'third reich': 'Germany',
    'weimar republic': 'Germany',
    'german empire': 'Germany',
    'prussia': 'Germany',
    'berlin': 'Germany',
    'munich': 'Germany',
    'hamburg': 'Germany',
    
    // Yugoslavia and successor states
    'yugoslavia': 'Yugoslavia',
    'kingdom of yugoslavia': 'Yugoslavia',
    'sfr yugoslavia': 'Yugoslavia',
    'socialist federal republic of yugoslavia': 'Yugoslavia',
    'federal republic of yugoslavia': 'Yugoslavia',
    
    // Serbia variations
    'republic of serbia': 'Serbia',
    'serbia and montenegro': 'Serbia',
    'belgrade': 'Serbia',
    
    // Croatia
    'republic of croatia': 'Croatia',
    'zagreb': 'Croatia',
    
    // Slovenia
    'republic of slovenia': 'Slovenia',
    'ljubljana': 'Slovenia',
    
    // Bosnia and Herzegovina
    'bosnia': 'Bosnia and Herzegovina',
    'republika srpska': 'Bosnia and Herzegovina',
    'sarajevo': 'Bosnia and Herzegovina',
    
    // North Macedonia
    'macedonia': 'North Macedonia',
    'former yugoslav republic of macedonia': 'North Macedonia',
    'fyrom': 'North Macedonia',
    'skopje': 'North Macedonia',
    
    // Kosovo
    'republic of kosovo': 'Kosovo',
    'pristina': 'Kosovo',
    
    // Montenegro
    'republic of montenegro': 'Montenegro',
    'podgorica': 'Montenegro',
    
    // Czechoslovakia and successor states
    'czechoslovakia': 'Czechoslovakia',
    'czech republic': 'Czech Republic',
    'czechia': 'Czech Republic',
    'bohemia': 'Czech Republic',
    'prague': 'Czech Republic',
    'slovakia': 'Slovakia',
    'bratislava': 'Slovakia',
    
    // Palestine/Israel
    'palestine': 'Palestine',
    'mand. palestine': 'Palestine',
    'mandatory palestine': 'Palestine',
    'palestinian territories': 'Palestine',
    'west bank': 'Palestine',
    'gaza': 'Palestine',
    'gaza strip': 'Palestine',
    'ramallah': 'Palestine',
    
    'israel': 'Israel',
    'state of israel': 'Israel',
    'tel aviv': 'Israel',
    'jerusalem': 'Israel',
    
    // Historical Persia/Iran
    'persia': 'Iran',
    'tehran': 'Iran',
    'islamic republic of iran': 'Iran',
    
    // Historical Burma/Myanmar
    'burma': 'Myanmar',
    'rangoon': 'Myanmar',
    'yangon': 'Myanmar',
    
    // Historical Siam/Thailand
    'siam': 'Thailand',
    'bangkok': 'Thailand',
    'kingdom of thailand': 'Thailand',
    
    // Netherlands/Holland
    'holland': 'Netherlands',
    'the netherlands': 'Netherlands',
    'kingdom of the netherlands': 'Netherlands',
    'amsterdam': 'Netherlands',
    'rotterdam': 'Netherlands',
    'the hague': 'Netherlands',
    
    // European Variations
    'republic of ireland': 'Ireland',
    'eire': 'Ireland',
    'dublin': 'Ireland',
    
    'spanish state': 'Spain',
    'kingdom of spain': 'Spain',
    'madrid': 'Spain',
    'barcelona': 'Spain',
    
    'portuguese republic': 'Portugal',
    'lisbon': 'Portugal',
    'porto': 'Portugal',
    
    'french republic': 'France',
    'paris': 'France',
    'lyon': 'France',
    'marseille': 'France',
    
    'italian republic': 'Italy',
    'kingdom of italy': 'Italy',
    'rome': 'Italy',
    'milan': 'Italy',
    'naples': 'Italy',
    'turin': 'Italy',
    'florence': 'Italy',
    'venice': 'Italy',
    
    'swiss confederation': 'Switzerland',
    'helvetic republic': 'Switzerland',
    'zurich': 'Switzerland',
    'geneva': 'Switzerland',
    'bern': 'Switzerland',
    
    'kingdom of belgium': 'Belgium',
    'belgian': 'Belgium',
    'brussels': 'Belgium',
    'antwerp': 'Belgium',
    
    'hellenic republic': 'Greece',
    'athens': 'Greece',
    'thessaloniki': 'Greece',
    
    'republic of austria': 'Austria',
    'vienna': 'Austria',
    'austro-hungarian empire': 'Austria',
    'austro-hungarian': 'Austria',
    'habsburg monarchy': 'Austria',
    
    'kingdom of sweden': 'Sweden',
    'stockholm': 'Sweden',
    
    'kingdom of norway': 'Norway',
    'oslo': 'Norway',
    
    'kingdom of denmark': 'Denmark',
    'copenhagen': 'Denmark',
    
    'republic of finland': 'Finland',
    'helsinki': 'Finland',
    
    'republic of poland': 'Poland',
    'polish people\'s republic': 'Poland',
    'warsaw': 'Poland',
    'krakow': 'Poland',
    
    'republic of hungary': 'Hungary',
    'budapest': 'Hungary',
    
    'republic of turkey': 'Turkey',
    'ottoman empire': 'Turkey',
    'istanbul': 'Turkey',
    'constantinople': 'Turkey',
    'ankara': 'Turkey',
    
    // Asian countries
    'people\'s republic of china': 'China',
    'prc': 'China',
    'republic of china': 'Taiwan',
    'beijing': 'China',
    'shanghai': 'China',
    'hong kong': 'China',
    'mainland china': 'China',
    
    'state of japan': 'Japan',
    'nippon': 'Japan',
    'tokyo': 'Japan',
    'osaka': 'Japan',
    'kyoto': 'Japan',
    
    'republic of korea': 'South Korea',
    'south korea': 'South Korea',
    'seoul': 'South Korea',
    'democratic people\'s republic of korea': 'North Korea',
    'north korea': 'North Korea',
    'pyongyang': 'North Korea',
    
    'republic of india': 'India',
    'delhi': 'India',
    'mumbai': 'India',
    'bombay': 'India',
    'calcutta': 'India',
    'kolkata': 'India',
    
    'islamic republic of pakistan': 'Pakistan',
    'karachi': 'Pakistan',
    'lahore': 'Pakistan',
    'islamabad': 'Pakistan',
    
    'republic of the philippines': 'Philippines',
    'manila': 'Philippines',
    
    'republic of indonesia': 'Indonesia',
    'jakarta': 'Indonesia',
    
    'kingdom of thailand': 'Thailand',
    'siam': 'Thailand',
    'bangkok': 'Thailand',
    
    'republic of singapore': 'Singapore',
    
    'malaysia': 'Malaysia',
    'kuala lumpur': 'Malaysia',
    
    'socialist republic of vietnam': 'Vietnam',
    'hanoi': 'Vietnam',
    'ho chi minh city': 'Vietnam',
    'saigon': 'Vietnam',
    
    // African countries
    'arab republic of egypt': 'Egypt',
    'cairo': 'Egypt',
    'alexandria': 'Egypt',
    
    'federal republic of nigeria': 'Nigeria',
    'lagos': 'Nigeria',
    'abuja': 'Nigeria',
    
    'republic of south africa': 'South Africa',
    'pretoria': 'South Africa',
    'cape town': 'South Africa',
    'johannesburg': 'South Africa',
    
    'kingdom of morocco': 'Morocco',
    'rabat': 'Morocco',
    'casablanca': 'Morocco',
    
    'federal democratic republic of ethiopia': 'Ethiopia',
    'addis ababa': 'Ethiopia',
    
    'republic of kenya': 'Kenya',
    'nairobi': 'Kenya',
    
    'republic of algeria': 'Algeria',
    'algiers': 'Algeria',
    
    // Americas
    'canada': 'Canada',
    'dominion of canada': 'Canada',
    'toronto': 'Canada',
    'montreal': 'Canada',
    'vancouver': 'Canada',
    'ottawa': 'Canada',
    
    'united mexican states': 'Mexico',
    'mexican republic': 'Mexico',
    'mexico city': 'Mexico',
    'guadalajara': 'Mexico',
    
    'republic of colombia': 'Colombia',
    'bogota': 'Colombia',
    
    'republic of brazil': 'Brazil',
    'brasilia': 'Brazil',
    'rio de janeiro': 'Brazil',
    'sao paulo': 'Brazil',
    
    'republic of argentina': 'Argentina',
    'buenos aires': 'Argentina',
    
    'republic of chile': 'Chile',
    'santiago': 'Chile',
    
    'republic of cuba': 'Cuba',
    'havana': 'Cuba',
    
    'commonwealth of australia': 'Australia',
    'sydney': 'Australia',
    'melbourne': 'Australia',
    'canberra': 'Australia',
    
    'new zealand': 'New Zealand',
    'auckland': 'New Zealand',
    'wellington': 'New Zealand'
  };
  
  // Check for historical prefixes and suffixes that should be removed
  const prefixesToRemove = [
    'republic of', 'democratic republic of', 'people\'s republic of', 'socialist republic of',
    'federal republic of', 'federation of', 'kingdom of', 'principality of',
    'commonwealth of', 'grand duchy of', 'sultanate of', 'islamic republic of',
    'state of', 'united states of', 'united kingdom of', 'empire of', 'union of'
  ];
  
  // Extract the core country name by removing prefixes
  let coreCountry = lowerCountry;
  for (const prefix of prefixesToRemove) {
    if (coreCountry.startsWith(prefix + ' ')) {
      coreCountry = coreCountry.substring(prefix.length + 1);
      break;
    }
  }
  
  // Try to match with both the original name and the core name
  if (countryMap[lowerCountry]) {
    return countryMap[lowerCountry];
  }
  
  if (countryMap[coreCountry]) {
    return countryMap[coreCountry];
  }
  
  // Look for partial matches in the country name
  for (const [variant, normalized] of Object.entries(countryMap)) {
    if (lowerCountry.includes(variant)) {
      return normalized;
    }
  }
  
  // If no match is found, return the original cleaned country
  return cleanedCountry.trim();
}

// Normalize countries in the database
app.get('/api/normalize-countries', async (req, res) => {
  try {
    // Get all unique countries
    const countries = await prisma.$queryRaw`
      SELECT DISTINCT country
      FROM person
      WHERE country IS NOT NULL AND country <> ''
    `;
    
    const normalizedCountries = {};
    let totalRecords = 0;
    
    // Build a map of normalized country names
    const countryNormalizeMap = new Map();
    
    // First pass - normalize all countries without updating the database
    for (const countryObj of countries) {
      const originalCountry = countryObj.country;
      const normalizedCountry = normalizeCountryName(originalCountry);
      totalRecords++;
      
      if (normalizedCountry) {
        countryNormalizeMap.set(originalCountry, normalizedCountry);
        
        if (originalCountry !== normalizedCountry) {
          normalizedCountries[originalCountry] = normalizedCountry;
        }
      }
    }
    
    // Create a reverse map for denormalization (looking up all variations)
    const countryVariationsMap = new Map();
    for (const [original, normalized] of countryNormalizeMap.entries()) {
      if (!countryVariationsMap.has(normalized)) {
        countryVariationsMap.set(normalized, []);
      }
      countryVariationsMap.get(normalized).push(original);
    }
    
    res.json({
      message: `Normalized ${Object.keys(normalizedCountries).length} country names out of ${totalRecords} unique countries for in-memory use. No database records were modified.`,
      normalizedCountries,
      countryVariations: Object.fromEntries(countryVariationsMap)
    });
  } catch (error) {
    console.error('Country normalization error:', error);
    res.status(500).json({ error: 'Failed to normalize countries' });
  }
});

// Modified country nominees endpoint to handle normalized countries
app.get('/api/country-nominees/:country', async (req, res) => {
  try {
    let { country } = req.params;
    const normalizedCountry = normalizeCountryName(country);
    
    if (!normalizedCountry) {
      return res.json([]);
    }
    
    // First try to get all countries in the database
    const allCountries = await prisma.$queryRaw`
      SELECT DISTINCT country FROM person WHERE country IS NOT NULL
    `;
    
    // Get exact matches for our normalized country
    const matchingCountries = allCountries
      .map(c => c.country)
      .filter(c => normalizeCountryName(c) === normalizedCountry);
    
    if (matchingCountries.length === 0) {
      return res.json([]);
    }
    
    // For each matching country, run a separate query and combine the results
    let allNominees = [];
    
    for (const matchCountry of matchingCountries) {
      // Important: We use the original country value from the database (matchCountry)
      // NOT the normalized version, to ensure we don't modify the database
      const countryNominees = await prisma.$queryRaw`
        SELECT 
          p.person_id,
          CONCAT(p.first_name, ' ', p.last_name) as full_name,
          p.country,
          GROUP_CONCAT(DISTINCT c.category_name) as nomination_categories,
          COUNT(DISTINCT n.nomination_id) as nominations_count,
          SUM(CASE WHEN n.won = 1 THEN 1 ELSE 0 END) as oscars_won
        FROM person p
        JOIN nomination_person np ON p.person_id = np.person_id
        JOIN nomination n ON np.nomination_id = n.nomination_id
        JOIN category c ON n.category_id = c.category_id
        WHERE p.country = ${matchCountry}
        GROUP BY p.person_id
        ORDER BY oscars_won DESC, nominations_count DESC
      `;
      
      allNominees = [...allNominees, ...countryNominees];
    }
    
    // Sort the combined results
    allNominees.sort((a, b) => {
      if (b.oscars_won !== a.oscars_won) {
        return b.oscars_won - a.oscars_won;
      }
      return b.nominations_count - a.nominations_count;
    });
    
    res.json(allNominees);
  } catch (error) {
    console.error('Get country nominees error:', error);
    res.status(500).json({ error: 'Failed to fetch country nominees' });
  }
});

// Modified countries list endpoint to return normalized countries
app.get('/api/countries', async (req, res) => {
  try {
    // Get original country values from the database - no modifications
    const rawCountries = await prisma.$queryRaw`
      SELECT DISTINCT country
      FROM person
      WHERE country IS NOT NULL AND country <> ''
      ORDER BY country
    `;
    
    // Create an in-memory map of normalized countries to their variants
    // This is only for display and grouping purposes, never modifies the database
    const normalizedCountriesMap = new Map();
    
    // Process each country and normalize it
    rawCountries.forEach(countryObj => {
      const originalCountry = countryObj.country;
      const normalizedCountry = normalizeCountryName(originalCountry);
      
      if (!normalizedCountry) return; // Skip null countries
      
      // Use the normalized country as the key
      const key = normalizedCountry;
      
      // Skip if this is a normalized version we already have
      if (!normalizedCountriesMap.has(key)) {
        normalizedCountriesMap.set(key, {
          normalized: normalizedCountry,
          variants: [originalCountry]
        });
      } else {
        // Add this as a variant to an existing normalized country if it's not already included
        const existingVariants = normalizedCountriesMap.get(key).variants;
        if (!existingVariants.includes(originalCountry)) {
          existingVariants.push(originalCountry);
        }
      }
    });
    
    // Create the final response array with only the normalized names
    const uniqueCountries = Array.from(normalizedCountriesMap.values()).map(item => ({
      country: item.normalized,
      variants: item.variants.filter(v => v !== item.normalized) // Don't include the normalized name in variants
    }));
    
    // Sort alphabetically by normalized country name
    res.json(uniqueCountries.sort((a, b) => a.country.localeCompare(b.country)));
  } catch (error) {
    console.error('Get countries error:', error);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

// Modified top actor countries endpoint to use normalized countries
app.get('/api/top-actor-countries', async (req, res) => {
  try {
    // First get raw results from database - no modifications to data
    const rawResults = await prisma.$queryRaw`
      SELECT 
        p.country, 
        COUNT(DISTINCT p.person_id) as actor_count
      FROM person p
      JOIN nomination_person np ON p.person_id = np.person_id
      JOIN nomination n ON np.nomination_id = n.nomination_id
      JOIN category c ON n.category_id = c.category_id
      WHERE n.won = 1
      AND (c.category_name LIKE '%Actor%' OR c.category_name LIKE '%Actress%')
      AND p.country IS NOT NULL AND p.country <> ''
      GROUP BY p.country
    `;
    
    // Normalize and aggregate results - in memory only, never updating DB
    const countryMap = new Map();
    
    rawResults.forEach(result => {
      const normalizedCountry = normalizeCountryName(result.country);
      if (!normalizedCountry) return; // Skip null countries
      
      // For logging/debugging
      if (normalizedCountry !== result.country) {
        console.log(`Normalizing country for aggregation: "${result.country}" -> "${normalizedCountry}"`);
      }
      
      const current = countryMap.get(normalizedCountry) || 0;
      countryMap.set(normalizedCountry, current + Number(result.actor_count));
    });
    
    // Convert map to array and sort
    const topCountries = Array.from(countryMap.entries())
      .map(([country, actor_count]) => ({ country, actor_count }))
      .sort((a, b) => b.actor_count - a.actor_count)
      .slice(0, 5);
    
    res.json(topCountries);
  } catch (error) {
    console.error('Get top actor countries error:', error);
    res.status(500).json({ error: 'Failed to fetch top actor countries' });
  }
});

// Dream Team - living cast for best movie
app.get('/api/dream-team', async (req, res) => {
  try {
    // Find the best actors (male) with most Oscar wins
    const topActors = await prisma.person.findMany({
      where: {
        nominations: {
          some: {
            nomination: {
              won: true,
              category: {
                name: {
                  contains: 'Actor in a Leading Role'
                }
              }
            }
          }
        }
      },
      include: {
        nominations: {
          include: {
            nomination: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: 10
    });

    // Find the best actresses (female) with most Oscar wins
    const topActresses = await prisma.person.findMany({
      where: {
        nominations: {
          some: {
            nomination: {
              won: true,
              category: {
                name: {
                  contains: 'Actress in a Leading Role'
                }
              }
            }
          }
        }
      },
      include: {
        nominations: {
          include: {
            nomination: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: 10
    });

    // Find the best supporting actors (male) with most Oscar wins
    const topSupportingActors = await prisma.person.findMany({
      where: {
        nominations: {
          some: {
            nomination: {
              won: true,
              category: {
                name: {
                  contains: 'Actor in a Supporting Role'
                }
              }
            }
          }
        }
      },
      include: {
        nominations: {
          include: {
            nomination: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: 10
    });

    // Find the best supporting actresses (female) with most Oscar wins
    const topSupportingActresses = await prisma.person.findMany({
      where: {
        nominations: {
          some: {
            nomination: {
              won: true,
              category: {
                name: {
                  contains: 'Actress in a Supporting Role'
                }
              }
            }
          }
        }
      },
      include: {
        nominations: {
          include: {
            nomination: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: 10
    });

    // Calculate wins for each person
    const actorsWithWins = topActors.map(actor => ({
      ...actor,
      wins: actor.nominations.filter(n => n.nomination.won).length
    }));

    const actressesWithWins = topActresses.map(actress => ({
      ...actress,
      wins: actress.nominations.filter(n => n.nomination.won).length
    }));

    const supportingActorsWithWins = topSupportingActors.map(actor => ({
      ...actor,
      wins: actor.nominations.filter(n => n.nomination.won).length
    }));

    const supportingActressesWithWins = topSupportingActresses.map(actress => ({
      ...actress,
      wins: actress.nominations.filter(n => n.nomination.won).length
    }));

    // Sort by number of wins
    const sortedActors = actorsWithWins.sort((a, b) => b.wins - a.wins);
    const sortedActresses = actressesWithWins.sort((a, b) => b.wins - a.wins);
    const sortedSupportingActors = supportingActorsWithWins.sort((a, b) => b.wins - a.wins);
    const sortedSupportingActresses = supportingActressesWithWins.sort((a, b) => b.wins - a.wins);

    // Find directors
    const directors = await prisma.person.findMany({
      where: {
        movieCrew: {
          some: {
            position: {
              title: 'Director'
            }
          }
        }
      },
      include: {
        nominations: {
          include: {
            nomination: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: 5
    });

    // Calculate wins for directors
    const directorsWithWins = directors.map(director => ({
      ...director,
      wins: director.nominations.filter(n => n.nomination.won).length
    }));

    // Sort directors by wins
    const sortedDirectors = directorsWithWins.sort((a, b) => b.wins - a.wins);

    // Find producers
    const producers = await prisma.person.findMany({
      where: {
        movieCrew: {
          some: {
            position: {
              title: 'Producer'
            }
          }
        }
      },
      include: {
        nominations: {
          include: {
            nomination: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: 5
    });

    // Calculate wins for producers
    const producersWithWins = producers.map(producer => ({
      ...producer,
      wins: producer.nominations.filter(n => n.nomination.won).length
    }));

    // Sort producers by wins
    const sortedProducers = producersWithWins.sort((a, b) => b.wins - a.wins);

    // Find composers
    const composers = await prisma.person.findMany({
      where: {
        movieCrew: {
          some: {
            position: {
              title: 'Composer'
            }
          }
        }
      },
      include: {
        nominations: {
          include: {
            nomination: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: 5
    });

    // Calculate wins for composers
    const composersWithWins = composers.map(composer => ({
      ...composer,
      wins: composer.nominations.filter(n => n.nomination.won).length
    }));

    // Sort composers by wins
    const sortedComposers = composersWithWins.sort((a, b) => b.wins - a.wins);

    // Format the data
    const dreamTeam = [
      {
        id: sortedDirectors[0]?.id || 0,
        name: sortedDirectors[0] ? `${sortedDirectors[0].firstName} ${sortedDirectors[0].lastName}` : 'Unknown Director',
        role: 'Director',
        oscars: sortedDirectors[0]?.wins || 0
      },
      {
        id: sortedActors[0]?.id || 0,
        name: sortedActors[0] ? `${sortedActors[0].firstName} ${sortedActors[0].lastName}` : 'Unknown Actor',
        role: 'Leading Actor',
        oscars: sortedActors[0]?.wins || 0
      },
      {
        id: sortedActresses[0]?.id || 0,
        name: sortedActresses[0] ? `${sortedActresses[0].firstName} ${sortedActresses[0].lastName}` : 'Unknown Actress',
        role: 'Leading Actress',
        oscars: sortedActresses[0]?.wins || 0
      },
      {
        id: sortedSupportingActors[0]?.id || 0,
        name: sortedSupportingActors[0] ? `${sortedSupportingActors[0].firstName} ${sortedSupportingActors[0].lastName}` : 'Unknown Supporting Actor',
        role: 'Supporting Actor',
        oscars: sortedSupportingActors[0]?.wins || 0
      },
      {
        id: sortedSupportingActresses[0]?.id || 0,
        name: sortedSupportingActresses[0] ? `${sortedSupportingActresses[0].firstName} ${sortedSupportingActresses[0].lastName}` : 'Unknown Supporting Actress',
        role: 'Supporting Actress',
        oscars: sortedSupportingActresses[0]?.wins || 0
      },
      {
        id: sortedProducers[0]?.id || 0,
        name: sortedProducers[0] ? `${sortedProducers[0].firstName} ${sortedProducers[0].lastName}` : 'Unknown Producer',
        role: 'Producer',
        oscars: sortedProducers[0]?.wins || 0
      },
      {
        id: sortedComposers[0]?.id || 0,
        name: sortedComposers[0] ? `${sortedComposers[0].firstName} ${sortedComposers[0].lastName}` : 'Unknown Composer',
        role: 'Composer',
        oscars: sortedComposers[0]?.wins || 0
      }
    ];

    res.json({ dreamTeam });
  } catch (error) {
    console.error('Error fetching dream team:', error);
    res.status(500).json({ error: 'Failed to fetch dream team data' });
  }
});

// Top 5 production companies by oscars
app.get('/api/top-production-companies', async (req, res) => {
  try {
    const topCompanies = await prisma.$queryRaw`
      SELECT 
        pc.pd_id as id,
        pc.company_name as name,
        COUNT(DISTINCT CASE WHEN n.won = 1 THEN n.nomination_id END) as oscars_won
      FROM production_company pc
      JOIN movie_produced_by mpb ON pc.pd_id = mpb.pd_id
      JOIN movie m ON mpb.movie_id = m.movie_id
      JOIN nomination n ON m.movie_id = n.movie_id
      WHERE n.won = 1
      GROUP BY pc.pd_id
      ORDER BY oscars_won DESC
      LIMIT 5
    `;
    
    res.json(topCompanies);
  } catch (error) {
    console.error('Get top production companies error:', error);
    res.status(500).json({ error: 'Failed to fetch top production companies' });
  }
});

// List non-English Oscar-winning movies
app.get('/api/non-english-winners', async (req, res) => {
  try {
    const nonEnglishWinners = await prisma.$queryRaw`
      SELECT DISTINCT
        m.movie_id,
        m.movie_name,
        GROUP_CONCAT(DISTINCT ml.in_language) as languages,
        ae.aYear as year
      FROM movie m
      JOIN movie_language ml ON m.movie_id = ml.movie_id
      JOIN nomination n ON m.movie_id = n.movie_id
      JOIN award_edition ae ON n.award_edition_id = ae.award_edition_id
      WHERE n.won = 1
      AND NOT EXISTS (
        SELECT 1 FROM movie_language
        WHERE movie_id = m.movie_id
        AND in_language = 'English'
      )
      GROUP BY m.movie_id, ae.aYear
      ORDER BY ae.aYear DESC
    `;
    
    res.json(nonEnglishWinners);
  } catch (error) {
    console.error('Get non-English winners error:', error);
    res.status(500).json({ error: 'Failed to fetch non-English winners' });
  }
});

// Get movies for dropdown
app.get('/api/movies', async (req, res) => {
  try {
    const movies = await prisma.movie.findMany({
      select: {
        id: true,
        name: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    res.json(movies);
  } catch (error) {
    console.error('Get movies error:', error);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

// Get categories for dropdown
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get award editions for dropdown
app.get('/api/award-editions', async (req, res) => {
  try {
    const awardEditions = await prisma.awardEdition.findMany({
      select: {
        id: true,
        edition: true,
        year: true
      },
      orderBy: {
        year: 'desc'
      }
    });
    
    res.json(awardEditions);
  } catch (error) {
    console.error('Get award editions error:', error);
    res.status(500).json({ error: 'Failed to fetch award editions' });
  }
});

// Get persons for dropdown
app.get('/api/persons', async (req, res) => {
  try {
    const { position, search, movieId, searchTerm } = req.query;
    
    let whereClause = {};
    
    if (search) {
      whereClause = {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } }
        ]
      };
    }
    
    // Handle searchTerm parameter for Select2 AJAX search
    if (searchTerm) {
      whereClause = {
        OR: [
          { firstName: { contains: searchTerm } },
          { lastName: { contains: searchTerm } },
          { middleName: { contains: searchTerm } }
        ]
      };
    }
    
    let persons;
    
    // If movieId is provided, filter by movie crew
    if (movieId) {
      console.log('Filtering persons by movieId:', movieId);
      persons = await prisma.person.findMany({
        where: {
          ...whereClause,
          movieCrew: {
            some: {
              movieId: parseInt(movieId)
            }
          }
        },
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          country: true,
          movieCrew: {
            where: {
              movieId: parseInt(movieId)
            },
            include: {
              position: true
            }
          }
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' }
        ]
      });
      
      console.log(`Found ${persons.length} crew members for movie ID ${movieId}`);
    } 
    else if (position) {
      persons = await prisma.person.findMany({
        where: {
          ...whereClause,
          movieCrew: {
            some: {
              position: {
                title: {
                  contains: position
                }
              }
            }
          }
        },
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          country: true
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' }
        ]
      });
    } else {
      persons = await prisma.person.findMany({
        where: whereClause,
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          country: true
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' }
        ]
      });
    }
    
    // Format the response to include full name
    const formattedPersons = persons.map(person => ({
      id: person.id,
      name: `${person.firstName}${person.middleName ? ' ' + person.middleName : ''} ${person.lastName}`,
      country: person.country,
      // Add position info if available (for movie crew queries)
      position: person.movieCrew ? 
        (person.movieCrew[0]?.position?.title || null) : null
    }));
    
    res.json(formattedPersons);
  } catch (error) {
    console.error('Get persons error:', error);
    res.status(500).json({ error: 'Failed to fetch persons' });
  }
});

// Get current user from session
app.get('/api/user/current', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Get movie crew with position information
app.get('/api/movie-crew', async (req, res) => {
  try {
    const { movieId, personIds } = req.query;
    
    if (!movieId) {
      return res.status(400).json({ error: "Movie ID is required" });
    }
    
    let whereClause = {
      movieId: parseInt(movieId)
    };
    
    // If personIds is provided, filter to specific crew members
    if (personIds) {
      // Handle both single ID and comma-separated list
      const personIdArray = personIds.split(',').map(id => parseInt(id));
      whereClause.personId = {
        in: personIdArray
      };
    }
    
    console.log('Movie crew query:', whereClause);
    
    const movieCrew = await prisma.movieCrew.findMany({
      where: whereClause,
      include: {
        person: true,
        position: true
      }
    });
    
    console.log(`Found ${movieCrew.length} crew members for movie ID ${movieId}`);
    
    // Format the response
    const formattedCrew = movieCrew.map(crew => ({
      id: crew.personId,
      name: `${crew.person.firstName}${crew.person.middleName ? ' ' + crew.person.middleName : ''} ${crew.person.lastName}`,
      position: {
        id: crew.positionId,
        title: crew.position.title
      },
      movieId: crew.movieId
    }));
    
    res.json(formattedCrew);
  } catch (error) {
    console.error('Get movie crew error:', error);
    res.status(500).json({ error: 'Failed to fetch movie crew' });
  }
});

// Get persons belonging to a specific movie crew (for staff selection)
app.get('/api/movie-crew-persons', async (req, res) => {
  try {
    const { movieId, search } = req.query;
    
    if (!movieId) {
      return res.status(400).json({ error: "Movie ID is required" });
    }
    
    let whereClause = {
      movieCrew: {
        some: {
          movieId: parseInt(movieId)
        }
      }
    };
    
    // Add search filter if provided
    if (search) {
      whereClause = {
        ...whereClause,
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } }
        ]
      };
    }
    
    // Find persons who are in the movie crew
    const persons = await prisma.person.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        country: true,
        movieCrew: {
          where: {
            movieId: parseInt(movieId)
          },
          include: {
            position: true
          }
        }
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ]
    });
    
    console.log(`Found ${persons.length} crew members for movie ID ${movieId}`);
    
    // Format the response to include full name and position
    const formattedPersons = persons.map(person => ({
      id: person.id,
      name: `${person.firstName}${person.middleName ? ' ' + person.middleName : ''} ${person.lastName}`,
      country: person.country,
      position: person.movieCrew.length > 0 ? person.movieCrew[0].position.title : null
    }));
    
    res.json(formattedPersons);
  } catch (error) {
    console.error('Get movie crew persons error:', error);
    res.status(500).json({ error: 'Failed to fetch movie crew persons' });
  }
});

// Get all Oscar winners sorted by most wins
app.get('/api/oscar-winners', async (req, res) => {
  try {
    // First get all persons who have at least one Oscar win
    const winnerIds = await prisma.$queryRaw`
      SELECT DISTINCT p.person_id 
      FROM person p
      JOIN nomination_person np ON p.person_id = np.person_id
      JOIN nomination n ON np.nomination_id = n.nomination_id
      WHERE n.won = 1
    `;
    
    if (winnerIds.length === 0) {
      return res.json([]);
    }
    
    // Process each winner individually to get accurate stats
    const winners = [];
    
    // Map categories to positions to help determine the right position for each nomination
    const categoryToPositionMap = {
      'director': 'Director',
      'directing': 'Director',
      'best director': 'Director',
      'best directing': 'Director',
      'outstanding directing': 'Director',
      'actor': 'Actor',
      'best actor': 'Actor',
      'actress': 'Actress',
      'best actress': 'Actress',
      'supporting actor': 'Actor',
      'best supporting actor': 'Actor',
      'supporting actress': 'Actress',
      'best supporting actress': 'Actress',
      'writing': 'Writer',
      'best writing': 'Writer',
      'screenplay': 'Writer',
      'best screenplay': 'Writer',
      'story': 'Writer',
      'music': 'Composer',
      'original score': 'Composer',
      'original song': 'Composer',
      'cinematography': 'Cinematographer',
      'film editing': 'Editor',
      'production design': 'Production Designer',
      'set decoration': 'Set Decorator',
      'costume design': 'Costume Designer',
      'makeup': 'Makeup Artist',
      'sound': 'Sound',
      'sound editing': 'Sound Editor',
      'sound mixing': 'Sound Mixer',
      'visual effects': 'Visual Effects',
      'special effects': 'Special Effects',
      'documentary': 'Producer',
      'short film': 'Director',
      'animated feature': 'Director',
      'animated short': 'Director',
      'foreign language': 'Director',
      'international feature': 'Director',
      'best picture': 'Producer',
      'picture': 'Producer',
      'best motion picture': 'Producer',
      'outstanding motion picture': 'Producer',
      'motion picture': 'Producer'
    };
    
    for (const winner of winnerIds) {
      const personId = winner.person_id;
      
      // Get person details
      const person = await prisma.person.findUnique({
        where: { id: personId },
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true
        }
      });
      
      // Get person's known positions
      const personPositions = await prisma.movieCrew.findMany({
        where: { personId },
        include: {
          position: true
        },
        distinct: ['positionId']
      });
      
      const knownPositions = personPositions.map(p => p.position.title);
      
      // Get all nominations for this person
      const nominations = await prisma.nominationPerson.findMany({
        where: { personId },
        include: {
          nomination: {
            include: {
              category: true,
              movie: true
            }
          }
        }
      });
      
      // Track nominations and wins by position
      const statsByPosition = {};
      
      // Initialize known positions with zero counts
      knownPositions.forEach(pos => {
        statsByPosition[pos] = {
          nominations_count: 0,
          oscars_won: 0
        };
      });
      
      // Process each nomination to determine the appropriate position
      nominations.forEach(nom => {
        const categoryName = nom.nomination.category.name;
        let nominationPosition = null;
        
        // Convert category name to lowercase for case-insensitive matching
        const lowerCategoryName = categoryName.toLowerCase();
        
        // Try to directly match the category to a position
        if (categoryToPositionMap[lowerCategoryName]) {
          nominationPosition = categoryToPositionMap[lowerCategoryName];
        } else {
          // Try partial matching if exact match fails
          for (const [categoryKeyword, positionTitle] of Object.entries(categoryToPositionMap)) {
            if (lowerCategoryName.includes(categoryKeyword)) {
              nominationPosition = positionTitle;
              break;
            }
          }
        }
        
        // Try to determine position based on category patterns if still no match
        if (nominationPosition === 'Other') {
          if (lowerCategoryName.includes('direct') || lowerCategoryName.includes('film')) {
            nominationPosition = 'Director';
          } else if (lowerCategoryName.includes('act') && lowerCategoryName.includes('lead')) {
            nominationPosition = categoryName.toLowerCase().includes('actress') ? 'Actress' : 'Actor';
          } else if (lowerCategoryName.includes('act') && lowerCategoryName.includes('support')) {
            nominationPosition = categoryName.toLowerCase().includes('actress') ? 'Actress' : 'Actor';
          } else if (lowerCategoryName.includes('writ') || lowerCategoryName.includes('screenplay') || lowerCategoryName.includes('story')) {
            nominationPosition = 'Writer';
          } else if (lowerCategoryName.includes('cinemat') || lowerCategoryName.includes('photo')) {
            nominationPosition = 'Cinematographer';
          } else if (lowerCategoryName.includes('edit')) {
            nominationPosition = 'Editor';
          } else if (lowerCategoryName.includes('produc') || lowerCategoryName.includes('picture')) {
            nominationPosition = 'Producer';
          } else if (lowerCategoryName.includes('music') || lowerCategoryName.includes('score') || lowerCategoryName.includes('song')) {
            nominationPosition = 'Composer';
          } else if (lowerCategoryName.includes('sound')) {
            nominationPosition = 'Sound';
          } else if (lowerCategoryName.includes('costume')) {
            nominationPosition = 'Costume Designer';
          } else if (lowerCategoryName.includes('makeup')) {
            nominationPosition = 'Makeup Artist';
          } else if (lowerCategoryName.includes('visual') || lowerCategoryName.includes('effect')) {
            nominationPosition = 'Visual Effects';
          }
        }
        
        // Handle special cases for specific people
        if (nominationPosition === 'Other') {
          // Check for Christopher Nolan
          if (person.firstName === 'Christopher' && person.lastName === 'Nolan') {
            console.log(`  Special handling for Christopher Nolan on category "${categoryName}"`);
            // Christopher Nolan is primarily a director and writer
            if (lowerCategoryName.includes('best') || lowerCategoryName.includes('picture') || lowerCategoryName.includes('film')) {
              nominationPosition = 'Director';
            } else if (lowerCategoryName.includes('original')) {
              nominationPosition = 'Writer';
            }
          }
          
          // If person is a known director, assume they're nominated for directing
          else if (knownPositions.includes('Director') && 
                  (lowerCategoryName.includes('best') || lowerCategoryName.includes('outstanding'))) {
            console.log(`  Assigning Director position to "${person.firstName} ${person.lastName}" as they are a known director`);
            nominationPosition = 'Director';
          }
          
          // If person is a known producer, assume best picture nominations are for producing
          else if (knownPositions.includes('Producer') && 
                  (lowerCategoryName.includes('picture') || lowerCategoryName.includes('film'))) {
            console.log(`  Assigning Producer position to "${person.firstName} ${person.lastName}" as they are a known producer`);
            nominationPosition = 'Producer';
          }
        }
        
        // If still no position, use "Other" instead of "Unknown"
        if (!nominationPosition) {
          nominationPosition = 'Other';
        }
        
        // Ensure the position exists in our stats
        if (!statsByPosition[nominationPosition]) {
          statsByPosition[nominationPosition] = {
            nominations_count: 0,
            oscars_won: 0
          };
        }
        
        // Count this nomination
        statsByPosition[nominationPosition].nominations_count++;
        
        // If it was a win, count that too
        if (nom.nomination.won) {
          statsByPosition[nominationPosition].oscars_won++;
        }
      });
      
      // If Sam Wood specifically (historical data shows he was a director with many nominations)
      if (person.firstName === 'Sam' && person.lastName === 'Wood') {
        console.log('Processing Sam Wood:', JSON.stringify({
          knownPositions,
          nominationDetails: nominations.map(n => ({
            category: n.nomination.category.name,
            categoryLower: n.nomination.category.name.toLowerCase(),
            movieTitle: n.nomination.movie.name,
            won: n.nomination.won
          }))
        }, null, 2));
      }
      
      // Create formatted result for all positions with non-zero counts
      Object.entries(statsByPosition).forEach(([position, stats]) => {
        if (stats.nominations_count > 0) {
          winners.push({
            person_id: personId,
            full_name: `${person.firstName} ${person.middleName || ''} ${person.lastName}`.trim(),
            position: position,
            nominations_count: stats.nominations_count,
            oscars_won: stats.oscars_won
          });
        }
      });
    }
    
    // Sort by oscars won and then nominations count
    winners.sort((a, b) => {
      if (b.oscars_won !== a.oscars_won) {
        return b.oscars_won - a.oscars_won;
      }
      return b.nominations_count - a.nominations_count;
    });
    
    res.json(winners);
  } catch (error) {
    console.error('Get oscar winners error:', error);
    res.status(500).json({ error: 'Failed to fetch Oscar winners' });
  }
});

// Get movie crew query with Prisma (optimized endpoint for staff dropdown)
app.get('/api/movie-crew-query', async (req, res) => {
  try {
    const { movieId } = req.query;
    
    if (!movieId) {
      return res.status(400).json({ error: "Movie ID is required" });
    }
    
    console.log('Fetching movie crew via Prisma for movie ID:', movieId);
    
    const movieCrew = await prisma.movieCrew.findMany({
      where: {
        movieId: parseInt(movieId)
      },
      include: {
        person: true,
        position: true
      }
    });
    
    console.log(`Found ${movieCrew.length} crew members for movie ID ${movieId} via Prisma`);
    
    // Format the response for the staff dropdown
    const formattedCrew = movieCrew.map(crew => ({
      id: crew.personId,
      name: `${crew.person.firstName}${crew.person.middleName ? ' ' + crew.person.middleName : ''} ${crew.person.lastName}`,
      position: crew.position.title
    }));
    
    res.json(formattedCrew);
  } catch (error) {
    console.error('Get movie crew query error (Prisma):', error);
    res.status(500).json({ error: 'Failed to fetch movie crew' });
  }
});

// Get movie crew with raw SQL query (fallback endpoint)
app.get('/api/movie-crew-raw', async (req, res) => {
  try {
    const { movieId } = req.query;
    
    if (!movieId) {
      return res.status(400).json({ error: "Movie ID is required" });
    }
    
    console.log('Fetching movie crew via raw SQL for movie ID:', movieId);
    
    // Use raw SQL query as a fallback
    const movieCrew = await prisma.$queryRaw`
      SELECT 
        mc.person_id as id,
        CONCAT(p.first_name, IF(p.middle_name IS NOT NULL, CONCAT(' ', p.middle_name), ''), ' ', p.last_name) as name,
        pos.title as position
      FROM movie_crew mc
      JOIN person p ON mc.person_id = p.person_id
      JOIN positions pos ON mc.position_id = pos.position_id
      WHERE mc.movie_id = ${parseInt(movieId)}
      ORDER BY p.last_name, p.first_name
    `;
    
    console.log(`Found ${movieCrew.length} crew members for movie ID ${movieId} via raw SQL`);
    
    res.json(movieCrew);
  } catch (error) {
    console.error('Get movie crew query error (Raw SQL):', error);
    res.status(500).json({ error: 'Failed to fetch movie crew via raw SQL' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 