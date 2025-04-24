// Global variables
let currentUser = null;
let normalizedCountriesMap = {}; // Map for normalized countries

// DOM Elements
const authButtons = document.getElementById('auth-buttons');
const userInfo = document.getElementById('user-info');
const usernameElement = document.getElementById('username');
const logoutBtn = document.getElementById('logout-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const nominationForm = document.getElementById('nomination-form');
const authRequiredMessages = document.querySelectorAll('.auth-required-message');
const myNominationsList = document.getElementById('my-nominations-list');

// Check for user in session
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    
    try {
        // Initialize data
        await loadMovies();
        await loadCategories();
        await loadAwardEditions();
        await normalizeCountries();
        await loadCountries();
        
        // Initialize person search dropdown
        await initializePersonSearch();
        
        // Load statistics
        await loadTopActorCountries();
        await loadTopProductionCompanies();
        await loadNonEnglishWinners();
        await loadDreamTeam();
        
        // Try to get user from session
        const response = await fetch('/api/user/current');
        if (response.ok) {
            currentUser = await response.json();
            updateAuthUI(true);
        } else {
            updateAuthUI(false);
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

function setupEventListeners() {
    // Login form submission
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        try {
            loginError.classList.add('d-none');
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            if (response.ok) {
                const user = await response.json();
                currentUser = user;
                updateAuthUI(true);
                bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
                loginForm.reset();
            } else {
                const error = await response.json();
                loginError.textContent = error.error || 'Login failed';
                loginError.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'An error occurred during login';
            loginError.classList.remove('d-none');
        }
    });
    
    // Register form submission
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('register-email').value;
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const gender = document.getElementById('register-gender').value;
        const birthdate = document.getElementById('register-birthdate').value;
        const country = document.getElementById('register-country').value;
        
        try {
            registerError.classList.add('d-none');
            
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    email, 
                    username, 
                    password,
                    gender,
                    birthdate,
                    country
                })
            });
            
            if (response.ok) {
                const user = await response.json();
                currentUser = user;
                updateAuthUI(true);
                bootstrap.Modal.getInstance(document.getElementById('registerModal')).hide();
                registerForm.reset();
            } else {
                const error = await response.json();
                registerError.textContent = error.error || 'Registration failed';
                registerError.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Registration error:', error);
            registerError.textContent = 'An error occurred during registration';
            registerError.classList.remove('d-none');
        }
    });
    
    // Logout button
    logoutBtn?.addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
            currentUser = null;
            updateAuthUI(false);
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
    
    // Nomination form submission
    nominationForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const movieId = document.getElementById('movie').value;
        const categoryId = document.getElementById('category').value;
        const awardEditionId = document.getElementById('award-edition').value;
        
        // Get selected staff members - using Select2 value
        let personIds = [];
        if ($.fn.select2) {
            personIds = $('#staff-member').val() || [];
        } else {
            const staffMemberSelect = document.getElementById('staff-member');
            personIds = Array.from(staffMemberSelect.selectedOptions).map(option => option.value);
        }
        
        // Basic validation
        if (!movieId || !categoryId || !awardEditionId || personIds.length === 0) {
            alert('Please fill in all fields and select at least one staff member');
            return;
        }
        
        try {
            const response = await fetch('/api/nominations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    movieId: parseInt(movieId),
                    categoryId: parseInt(categoryId),
                    awardEditionId: parseInt(awardEditionId),
                    personIds: personIds.map(id => parseInt(id))
                })
            });
            
            if (response.ok) {
                nominationForm.reset();
                // Reset Select2 instances
                if ($.fn.select2) {
                    $('#movie, #category, #award-edition, #staff-member').val(null).trigger('change');
                }
                alert('Nomination added successfully!');
            } else {
                const error = await response.json();
                alert(error.error || 'Failed to add nomination');
            }
        } catch (error) {
            console.error('Add nomination error:', error);
            alert('An error occurred while adding nomination');
        }
    });
    
    // My nominations tab click
    document.getElementById('my-nominations-tab')?.addEventListener('click', loadUserNominations);
    
    // Top nominations tab click
    document.getElementById('top-nominations-tab')?.addEventListener('click', loadTopNominations);
    
    // Top user nominations tab click
    document.getElementById('top-user-nominations-tab')?.addEventListener('click', loadTopUserNominations);
    
    // Filter year changes for top nominations
    document.getElementById('filter-year')?.addEventListener('change', loadTopNominations);
    
    // Filter year and category changes for top user nominations
    document.getElementById('filter-user-year')?.addEventListener('change', loadTopUserNominations);
    document.getElementById('filter-user-category')?.addEventListener('change', loadTopUserNominations);
    
    // Person stats tab click
    document.getElementById('person-stats-tab')?.addEventListener('click', initializePersonSearch);
    
    // Country selection
    document.getElementById('select-country')?.addEventListener('change', loadCountryNominees);

    // Show all Oscar winners button
    document.getElementById('show-all-winners')?.addEventListener('click', loadAllOscarWinners);
}

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn && currentUser) {
        authButtons.classList.add('d-none');
        userInfo.classList.remove('d-none');
        usernameElement.textContent = currentUser.username;
        
        // Show forms and hide auth required messages
        authRequiredMessages.forEach(msg => msg.classList.add('d-none'));
        nominationForm?.classList.remove('d-none');
        myNominationsList?.classList.remove('d-none');
    } else {
        authButtons.classList.remove('d-none');
        userInfo.classList.add('d-none');
        
        // Hide forms and show auth required messages
        authRequiredMessages.forEach(msg => msg.classList.remove('d-none'));
        nominationForm?.classList.add('d-none');
        myNominationsList?.classList.add('d-none');
    }
}

// Data loading functions
async function loadMovies() {
    try {
        const response = await fetch('/api/movies');
        if (response.ok) {
            const movies = await response.json();
            const movieSelect = document.getElementById('movie');
            if (movieSelect) {
                let options = '<option value="">Select a movie</option>';
                movies.forEach(movie => {
                    options += `<option value="${movie.id}">${movie.name}</option>`;
                });
                movieSelect.innerHTML = options;
                
                // Initialize Select2 on the dropdown
                if ($.fn.select2) {
                    $(movieSelect).select2({
                        placeholder: 'Select a movie',
                        allowClear: true,
                        width: '100%'
                    }).on('select2:select', function(e) {
                        // When a movie is selected, load its staff members
                        const movieId = e.params.data.id;
                        if (movieId) {
                            loadMovieStaff(movieId);
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error('Load movies error:', error);
    }
}

async function loadCategories() {
    try {
        console.log('Loading categories from API...');
        const response = await fetch('/api/categories');
        if (response.ok) {
            const categories = await response.json();
            
            // Log all categories and their IDs for debugging
            console.log('Available categories from API:', categories.map(cat => ({ id: cat.id, name: cat.name })));
            
            // For nomination form
            const categorySelect = document.getElementById('category');
            if (categorySelect) {
                let options = '<option value="">Select a category</option>';
                categories.forEach(category => {
                    options += `<option value="${category.id}">${category.name}</option>`;
                });
                categorySelect.innerHTML = options;
                
                // Initialize Select2 on the category dropdown
                if ($.fn.select2) {
                    $(categorySelect).select2({
                        placeholder: 'Select a category',
                        allowClear: true,
                        width: '100%'
                    });
                }
                
                console.log('Categories loaded into dropdown:', categories.length);
            } else {
                console.error('Category select element not found');
            }
            
            // For filter
            const filterCategory = document.getElementById('filter-category');
            if (filterCategory) {
                let filterOptions = '<option value="">All Categories</option>';
                categories.forEach(category => {
                    filterOptions += `<option value="${category.id}">${category.name}</option>`;
                });
                filterCategory.innerHTML = filterOptions;
            }
            
            // For user filter
            const filterUserCategory = document.getElementById('filter-user-category');
            if (filterUserCategory) {
                let filterOptions = '<option value="">All Categories</option>';
                categories.forEach(category => {
                    filterOptions += `<option value="${category.id}">${category.name}</option>`;
                });
                filterUserCategory.innerHTML = filterOptions;
            }
            
            return categories; // Return the categories for potential use elsewhere
        } else {
            console.error('Failed to load categories:', response.status, response.statusText);
            return [];
        }
    } catch (error) {
        console.error('Load categories error:', error);
        return [];
    }
}

async function loadAwardEditions() {
    try {
        const response = await fetch('/api/award-editions');
        if (response.ok) {
            const editions = await response.json();
            
            // For nomination form
            const editionSelect = document.getElementById('award-edition');
            if (editionSelect) {
                let options = '<option value="">Select an award edition</option>';
                editions.forEach(edition => {
                    options += `<option value="${edition.id}">${edition.year} (Edition ${edition.edition})</option>`;
                });
                editionSelect.innerHTML = options;
            }
            
            // For filter
            const filterYear = document.getElementById('filter-year');
            if (filterYear) {
                let filterOptions = '<option value="">All Years</option>';
                const uniqueYears = [...new Set(editions.map(e => e.year))].sort((a, b) => b - a);
                uniqueYears.forEach(year => {
                    filterOptions += `<option value="${year}">${year}</option>`;
                });
                filterYear.innerHTML = filterOptions;
            }
            
            // For user filter
            const filterUserYear = document.getElementById('filter-user-year');
            if (filterUserYear) {
                let filterOptions = '<option value="">All Years</option>';
                const uniqueYears = [...new Set(editions.map(e => e.year))].sort((a, b) => b - a);
                uniqueYears.forEach(year => {
                    filterOptions += `<option value="${year}">${year}</option>`;
                });
                filterUserYear.innerHTML = filterOptions;
            }
        }
    } catch (error) {
        console.error('Load award editions error:', error);
    }
}

async function loadPersons(search = '', searchTerm = '') {
    try {
        let url = `/api/persons?`;
        if (search) url += search;
        if (searchTerm) {
            url += (search ? '&' : '') + `searchTerm=${encodeURIComponent(searchTerm)}`;
        }
        
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Load persons error:', error);
        return [];
    }
}

// Function to normalize countries in memory
async function normalizeCountries() {
    try {
        const response = await fetch('/api/normalize-countries');
        if (response.ok) {
            const result = await response.json();
            console.log('Country normalization result:', result.message);
            // Store the country mapping for client-side use
            normalizedCountriesMap = result.normalizedCountries || {};
            console.log('Client-side country normalization map created with', Object.keys(normalizedCountriesMap).length, 'mappings');
        }
    } catch (error) {
        console.error('Error normalizing countries:', error);
    }
}

// Modified loadCountries function
async function loadCountries() {
    try {
        const response = await fetch('/api/countries');
        if (response.ok) {
            const countries = await response.json();
            const countrySelect = document.getElementById('select-country');
            if (countrySelect) {
                let options = '<option value="">Select a country</option>';
                countries.forEach(country => {
                    // We now use the normalized country name for display
                    // but we also store the variants as a data attribute for reference
                    options += `<option value="${country.country}" data-variants='${JSON.stringify(country.variants)}'>${country.country}</option>`;
                });
                countrySelect.innerHTML = options;
            }
        }
    } catch (error) {
        console.error('Load countries error:', error);
    }
}

async function loadUserNominations() {
    if (!currentUser) return;
    
    try {
        const response = await fetch('/api/nominations/user');
        if (response.ok) {
            const nominations = await response.json();
            const tbody = document.getElementById('my-nominations-tbody');
            
            if (tbody) {
                let html = '';
                if (nominations.length === 0) {
                    html = '<tr><td colspan="4" class="text-center">You haven\'t submitted any nominations yet.</td></tr>';
                } else {
                    nominations.forEach(nomination => {
                        const staffMembers = nomination.persons.map(p => `${p.person.firstName} ${p.person.lastName}`).join(', ') || 'None';
                        
                        html += `
                            <tr>
                                <td>${nomination.movie.name}</td>
                                <td>${nomination.category.name}</td>
                                <td>${nomination.awardEdition.year}</td>
                                <td>${staffMembers}</td>
                            </tr>
                        `;
                    });
                }
                
                tbody.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('Load user nominations error:', error);
    }
}

// Load top nominated movies
async function loadTopNominations() {
  try {
    console.log('Starting to load top nominations...');
    
    // Get selected year
    const yearSelect = document.getElementById('filter-year');
    const selectedYear = yearSelect ? yearSelect.value : '';
    
    // Build URL with only year parameter
    let url = '/api/top-nominations';
    if (selectedYear) {
      url += `?year=${selectedYear}`;
    }
    
    console.log('Fetching top nominations from:', url);
    const response = await fetch(url);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const nominations = await response.json();
    console.log('Received nominations:', nominations);
    
    const tbody = document.getElementById('top-nominations-tbody');
    if (!tbody) {
      console.error('Top nominations tbody element not found');
      return;
    }
    
    if (nominations.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">No nominations found</td></tr>';
      return;
    }
    
    tbody.innerHTML = nominations.map(nomination => `
      <tr>
        <td>${nomination.movie_name || 'Unknown Movie'}</td>
        <td>${nomination.category_name || 'Unknown Category'}</td>
        <td>${nomination.aYear || 'Unknown Year'}</td>
        <td>${nomination.nomination_count || 0}</td>
      </tr>
    `).join('');
    
    console.log('Successfully updated top nominations table');
  } catch (error) {
    console.error('Error loading top nominations:', error);
    const tbody = document.getElementById('top-nominations-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading nominations. Please try again later.</td></tr>';
    }
  }
}

// Function to load top user nominations
async function loadTopUserNominations() {
    try {
        console.log('Starting to load top user nominations');
        
        // Check if the tab is visible
        const topUserNominationsTab = document.getElementById('top-user-nominations-tab');
        if (!topUserNominationsTab || !topUserNominationsTab.classList.contains('active')) {
            console.log('Top user nominations tab is not active, skipping load');
            return;
        }
        
        const year = document.getElementById('filter-user-year')?.value || '';
        const categoryId = document.getElementById('filter-user-category')?.value || '';
        
        let url = '/api/top-user-nominations';
        let params = [];
        
        if (year) params.push(`year=${year}`);
        if (categoryId) params.push(`categoryId=${categoryId}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        console.log('Fetching top user nominations from:', url);
        const response = await fetch(url);
        console.log('Response status:', response.status);
        
        if (response.ok) {
            const nominations = await response.json();
            console.log('Received top user nominations:', nominations);
            
            const tbody = document.getElementById('top-user-nominations-tbody');
            if (!tbody) {
                console.error('Could not find top-user-nominations-tbody element');
                return;
            }
            
            let html = '';
            if (!nominations || nominations.length === 0) {
                console.log('No nominations found');
                html = '<tr><td colspan="4" class="text-center">No user nominations found with the selected filters.</td></tr>';
            } else {
                console.log(`Found ${nominations.length} nominations`);
                nominations.forEach((nomination, index) => {
                    console.log(`Processing nomination ${index + 1}:`, nomination);
                    try {
                        html += `
                            <tr>
                                <td>${nomination.movie_name || 'Unknown Movie'}</td>
                                <td>${nomination.category_name || 'Unknown Category'}</td>
                                <td>${nomination.aYear || 'Unknown Year'}</td>
                                <td>${nomination.nomination_count || 0}</td>
                            </tr>
                        `;
                    } catch (err) {
                        console.error(`Error processing nomination ${index + 1}:`, err);
                    }
                });
            }
            
            console.log('Setting table HTML');
            tbody.innerHTML = html;
            console.log('Table HTML set successfully');
        } else {
            console.error('Failed to fetch top user nominations:', response.status, response.statusText);
            const tbody = document.getElementById('top-user-nominations-tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading user nominations. Please try again later.</td></tr>';
            }
        }
    } catch (error) {
        console.error('Load top user nominations error:', error);
        const tbody = document.getElementById('top-user-nominations-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading user nominations. Please try again later.</td></tr>';
        }
    }
}

async function loadPersonStats() {
    const personId = document.getElementById('search-person')?.value;
    
    if (!personId) {
        document.getElementById('person-stats-results')?.classList.add('d-none');
        return;
    }
    
    try {
        let url = `/api/person-stats/${personId}`;
        
        const response = await fetch(url);
        if (response.ok) {
            const stats = await response.json();
            const resultsDiv = document.getElementById('person-stats-results');
            const nameElement = document.getElementById('person-name');
            const tbody = document.getElementById('person-stats-tbody');
            
            if (resultsDiv && nameElement && tbody && stats.length > 0) {
                // Show results
                resultsDiv.classList.remove('d-none');
                
                // Set person name
                nameElement.textContent = stats[0].full_name;
                
                // Aggregate total nominations and wins across all positions
                let totalNominations = 0;
                let totalOscarsWon = 0;
                
                stats.forEach(stat => {
                    totalNominations += stat.nominations_count;
                    totalOscarsWon += stat.oscars_won;
                });
                
                // Display the aggregated results in a single row
                tbody.innerHTML = `
                    <tr>
                        <td>${totalNominations}</td>
                        <td>${totalOscarsWon}</td>
                    </tr>
                `;
            } else {
                // Hide results if no data
                if (resultsDiv) resultsDiv.classList.add('d-none');
                alert('No statistics found for this person');
            }
        }
    } catch (error) {
        console.error('Load person stats error:', error);
    }
}

async function loadTopActorCountries() {
    try {
        const response = await fetch('/api/top-actor-countries');
        if (response.ok) {
            const countries = await response.json();
            const tbody = document.getElementById('top-countries-tbody');
            
            if (tbody) {
                let html = '';
                if (countries.length === 0) {
                    html = '<tr><td colspan="3" class="text-center">No data available</td></tr>';
                } else {
                    countries.forEach((country, index) => {
                        html += `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${country.country}</td>
                                <td>${country.actor_count}</td>
                            </tr>
                        `;
                    });
                }
                
                tbody.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('Load top actor countries error:', error);
    }
}

// Modified loadCountryNominees function
async function loadCountryNominees() {
    const countrySelect = document.getElementById('select-country');
    const country = countrySelect?.value;
    
    if (!country) {
        document.getElementById('country-nominees-results')?.classList.add('d-none');
        return;
    }
    
    try {
        const response = await fetch(`/api/country-nominees/${encodeURIComponent(country)}`);
        if (response.ok) {
            const nominees = await response.json();
            const resultsDiv = document.getElementById('country-nominees-results');
            const countryNameElement = document.getElementById('selected-country');
            const tbody = document.getElementById('country-nominees-tbody');
            
            if (resultsDiv && countryNameElement && tbody) {
                // Show results
                resultsDiv.classList.remove('d-none');
                
                // Set country name
                countryNameElement.textContent = country;
                
                // Get variants if available
                const selectedOption = countrySelect.options[countrySelect.selectedIndex];
                const variants = selectedOption.dataset.variants ? 
                    JSON.parse(selectedOption.dataset.variants) : [];
                
                // Show variant count if there are multiple
                if (variants.length > 1) {
                    const variantText = document.createElement('small');
                    variantText.className = 'text-muted ms-2';
                    variantText.textContent = `(including ${variants.length} variants)`;
                    countryNameElement.appendChild(variantText);
                }
                
                // Populate table
                let html = '';
                if (nominees.length === 0) {
                    html = '<tr><td colspan="4" class="text-center">No nominees found from this country</td></tr>';
                } else {
                    nominees.forEach(nominee => {
                        html += `
                            <tr>
                                <td>${nominee.full_name}</td>
                                <td>${nominee.nomination_categories}</td>
                                <td>${nominee.nominations_count}</td>
                                <td>${nominee.oscars_won}</td>
                            </tr>
                        `;
                    });
                }
                
                tbody.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('Load country nominees error:', error);
    }
}

async function loadTopProductionCompanies() {
    try {
        const response = await fetch('/api/top-production-companies');
        if (response.ok) {
            const companies = await response.json();
            const tbody = document.getElementById('top-companies-tbody');
            
            if (tbody) {
                let html = '';
                if (companies.length === 0) {
                    html = '<tr><td colspan="3" class="text-center">No data available</td></tr>';
                } else {
                    companies.forEach((company, index) => {
                        html += `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${company.name}</td>
                                <td>${company.oscars_won}</td>
                            </tr>
                        `;
                    });
                }
                
                tbody.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('Load top production companies error:', error);
    }
}

async function loadNonEnglishWinners() {
    try {
        const response = await fetch('/api/non-english-winners');
        if (response.ok) {
            const movies = await response.json();
            const tbody = document.getElementById('non-english-tbody');
            
            if (tbody) {
                let html = '';
                if (movies.length === 0) {
                    html = '<tr><td colspan="3" class="text-center">No non-English Oscar winners found</td></tr>';
                } else {
                    movies.forEach(movie => {
                        html += `
                            <tr>
                                <td>${movie.movie_name}</td>
                                <td>${movie.languages}</td>
                                <td>${movie.year}</td>
                            </tr>
                        `;
                    });
                }
                
                tbody.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('Load non-English winners error:', error);
    }
}

async function loadDreamTeam() {
    try {
        const response = await fetch('/api/dream-team');
        if (response.ok) {
            const data = await response.json();
            const dreamTeam = data.dreamTeam;
            
            if (!dreamTeam || !Array.isArray(dreamTeam)) {
                console.error('Invalid dream team data structure:', data);
                return;
            }
            
            // Find team members by role
            const director = dreamTeam.find(member => member.role === 'Director');
            const leadingActor = dreamTeam.find(member => member.role === 'Leading Actor');
            const leadingActress = dreamTeam.find(member => member.role === 'Leading Actress');
            const supportingActor = dreamTeam.find(member => member.role === 'Supporting Actor');
            const supportingActress = dreamTeam.find(member => member.role === 'Supporting Actress');
            const producer = dreamTeam.find(member => member.role === 'Producer');
            const composer = dreamTeam.find(member => member.role === 'Composer');
            
            // Update each card
            updateDreamTeamCard('director', director ? {name: director.name, oscars_won: director.oscars} : null);
            updateDreamTeamCard('leading-actor', leadingActor ? {name: leadingActor.name, oscars_won: leadingActor.oscars} : null);
            updateDreamTeamCard('leading-actress', leadingActress ? {name: leadingActress.name, oscars_won: leadingActress.oscars} : null);
            updateDreamTeamCard('supporting-actor', supportingActor ? {name: supportingActor.name, oscars_won: supportingActor.oscars} : null);
            updateDreamTeamCard('supporting-actress', supportingActress ? {name: supportingActress.name, oscars_won: supportingActress.oscars} : null);
            updateDreamTeamCard('producer', producer ? {name: producer.name, oscars_won: producer.oscars} : null);
            updateDreamTeamCard('singer', composer ? {name: composer.name, oscars_won: composer.oscars} : null);
        } else {
            console.error('Failed to load dream team:', await response.text());
        }
    } catch (error) {
        console.error('Load dream team error:', error);
    }
}

function updateDreamTeamCard(role, person) {
    const cardElement = document.getElementById(`${role}-card`);
    
    if (cardElement) {
        if (person) {
            cardElement.innerHTML = `
                <div class="dream-team-member">
                    <h4>${person.name}</h4>
                    <p class="oscars">
                        <i class="fas fa-trophy me-1"></i> 
                        ${person.oscars_won} Oscar${person.oscars_won !== 1 ? 's' : ''}
                    </p>
                </div>
            `;
        } else {
            cardElement.innerHTML = `
                <div class="text-center text-muted">
                    <p>No data available</p>
                </div>
            `;
        }
    }
}

// Initialize person search dropdown
async function initializePersonSearch(currentPersonId = '') {
    const searchPersonSelect = document.getElementById('search-person');
    
    if (searchPersonSelect) {
        // Show loading option
        searchPersonSelect.innerHTML = '<option value="">Loading persons...</option>';
        
        try {
            // Load persons
            const persons = await loadPersons('search=' + (currentPersonId ? encodeURIComponent(currentPersonId) : ''));
            
            let options = '<option value="">Select a person</option>';
            if (persons.length === 0) {
                options = '<option value="">No persons found</option>';
            } else {
                persons.forEach(person => {
                    const isSelected = currentPersonId && person.id.toString() === currentPersonId.toString();
                    options += `<option value="${person.id}" ${isSelected ? 'selected' : ''}>${person.name}</option>`;
                });
            }
            searchPersonSelect.innerHTML = options;
            
            // Initialize Select2 on the dropdown
            try {
                $('#search-person').select2({
                    placeholder: 'Select a person',
                    allowClear: true,
                    width: '100%',
                    dropdownAutoWidth: true,
                    dropdownCssClass: 'select2-dropdown-fixed-width',
                    ajax: {
                        url: '/api/persons',
                        dataType: 'json',
                        delay: 250,
                        data: function(params) {
                            return {
                                searchTerm: params.term || ''
                            };
                        },
                        processResults: function(data) {
                            return {
                                results: data.map(person => ({
                                    id: person.id,
                                    text: person.name
                                }))
                            };
                        },
                        cache: true
                    }
                });
                
                // Reset the selected value after initializing Select2
                if (currentPersonId) {
                    $(searchPersonSelect).val(currentPersonId).trigger('change');
                }
                
                // Bind the change event for Select2
                $(searchPersonSelect).on('select2:select', function() {
                    loadPersonStats();
                });
            } catch (e) {
                console.error('Error initializing Select2:', e);
            }
            
            // If we had a selected person and it's in the new list, reload stats
            if (currentPersonId && searchPersonSelect.value) {
                loadPersonStats();
            }
        } catch (error) {
            console.error('Initialize person search error:', error);
            searchPersonSelect.innerHTML = '<option value="">Error loading persons</option>';
        }
    }
}

// Load all Oscar winners
async function loadAllOscarWinners() {
    try {
        // Hide person stats if visible
        document.getElementById('person-stats-results').classList.add('d-none');
        
        // Show loading state
        const resultsDiv = document.getElementById('all-winners-results');
        const tbody = document.getElementById('all-winners-tbody');
        
        if (resultsDiv && tbody) {
            resultsDiv.classList.remove('d-none');
            tbody.innerHTML = '<tr><td colspan="5" class="text-center"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></td></tr>';
            
            const response = await fetch('/api/oscar-winners');
            
            if (response.ok) {
                const winners = await response.json();
                
                // Process winners to combine by person_id
                const winnersByPerson = {};
                
                winners.forEach(winner => {
                    const personId = winner.person_id;
                    
                    if (!winnersByPerson[personId]) {
                        winnersByPerson[personId] = {
                            person_id: personId,
                            full_name: winner.full_name,
                            positions: [winner.position],
                            nominations_count: winner.nominations_count,
                            oscars_won: winner.oscars_won
                        };
                    } else {
                        // Add position if it's not already included
                        if (!winnersByPerson[personId].positions.includes(winner.position)) {
                            winnersByPerson[personId].positions.push(winner.position);
                        }
                        // Update counts (add the position's counts)
                        winnersByPerson[personId].nominations_count += winner.nominations_count;
                        winnersByPerson[personId].oscars_won += winner.oscars_won;
                    }
                });
                
                // Convert to array and sort
                const combinedWinners = Object.values(winnersByPerson).sort((a, b) => {
                    if (b.oscars_won !== a.oscars_won) {
                        return b.oscars_won - a.oscars_won;
                    }
                    return b.nominations_count - a.nominations_count;
                });
                
                let html = '';
                if (combinedWinners.length === 0) {
                    html = '<tr><td colspan="5" class="text-center">No Oscar winners found</td></tr>';
                } else {
                    combinedWinners.forEach((winner, index) => {
                        html += `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${winner.full_name}</td>
                                <td>${winner.positions.join(', ')}</td>
                                <td>${winner.nominations_count}</td>
                                <td>${winner.oscars_won}</td>
                            </tr>
                        `;
                    });
                }
                
                tbody.innerHTML = html;
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading Oscar winners</td></tr>';
            }
        }
    } catch (error) {
        console.error('Load all Oscar winners error:', error);
        const tbody = document.getElementById('all-winners-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading Oscar winners</td></tr>';
        }
    }
}

// Function to populate the staff dropdown with initial data
function populateStaffDropdown(staff) {
    const $staffDropdown = $('#staff-member');
    
    // Clear current options and add placeholder
    $staffDropdown.empty().append('<option value="">Select staff members</option>');
    
    if (!staff || staff.length === 0) {
        console.log("No staff members found");
        return;
    }
    
    console.log("Populating staff dropdown with", staff.length, "members");
    
    // Sort staff by name
    staff.sort((a, b) => a.name.localeCompare(b.name));
    
    // Add staff options
    staff.forEach(person => {
        // Handle different position data structures
        let position = person.position;
        if (position && typeof position === 'object' && position.title) {
            position = position.title;
        }
        if (!position) {
            position = "Unknown";
        }
        
        const option = new Option(
            `${person.name} (${position})`,
            person.id,
            false,
            false
        );
        option.dataset.position = position;
        $staffDropdown.append(option);
    });
    
    // Initialize Select2
    $staffDropdown.select2({
        placeholder: 'Select staff members',
        allowClear: true,
        width: '100%',
        multiple: true
    }).on('change', function() {
        console.log('Staff selection changed');
        // Update category filtering when staff selection changes
        updateCategoryBasedOnStaff();
    });
    
    console.log("Staff dropdown populated successfully");
}

// Update category dropdown based on staff selection
function updateCategoryBasedOnStaff() {
    console.log('Updating categories based on selected staff member');
    
    // Get the selected staff member(s) as an array
    const selectedStaff = $("#staff-member").val() || [];
    console.log('Selected staff members:', selectedStaff);
    
    // Clear the dropdown except for the placeholder
    $("#category").find('option:not([value=""])').remove();
    
    // Remove filtered class by default
    $('#category').parent().removeClass('is-filtered');
    
    // Update eligibility note text - only do this once
    $('.eligibility-note').text('Categories are filtered by staff member\'s position');
    
    if (!selectedStaff.length) {
        console.log('No staff selected, showing all categories');
        // If no staff is selected, load all categories
        loadCategories();
        return;
    }
    
    try {
        // Get the position directly from the data attribute in the first selected option
        // We use the first selected staff member's position for category filtering
        const firstSelectedId = selectedStaff[0];
        const selectedOption = $(`#staff-member option[value="${firstSelectedId}"]`);
        const position = selectedOption.data('position');
        
        // Debug the selected option and position data
        console.log('Selected staff option:', selectedOption);
        console.log('Selected staff position data:', position);
        console.log('Selected staff option text:', selectedOption.text());
        
        if (!position) {
            console.log('No position data available for selected staff, showing all categories');
            $('.eligibility-note').text('No position data for this staff member - showing all categories');
            loadCategories();
            return;
        }
        
        // Fetch all categories from the API
        console.log('Fetching all categories to filter by position:', position);
        fetch('/api/categories')
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Failed to load categories');
            })
            .then(allCategories => {
                console.log('Successfully loaded all categories:', allCategories.length);
                
                // Normalize position by converting to lowercase and trimming
                const normalizedPosition = position.toLowerCase().trim();
                console.log('Finding matching categories for position:', position, '(normalized:', normalizedPosition, ')');
                
                // Create a mapping of positions to category IDs
                const positionToCategoryMap = {
                    // Producer categories
                    'producer': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('picture') || 
                        cat.name.toLowerCase().includes('best picture') ||
                        cat.name.toLowerCase().includes('motion picture') ||
                        cat.name.toLowerCase().includes('outstanding picture')
                    ).map(cat => cat.id),
                    
                    // Director categories
                    'director': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('director') || 
                        cat.name.toLowerCase().includes('directing')
                    ).map(cat => cat.id),
                    
                    // Actor categories
                    'actor': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('actor') || 
                        cat.name.toLowerCase().includes('leading') || 
                        cat.name.toLowerCase().includes('supporting')
                    ).map(cat => cat.id),
                    
                    // Actress categories
                    'actress': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('actress') || 
                        cat.name.toLowerCase().includes('leading') || 
                        cat.name.toLowerCase().includes('supporting')
                    ).map(cat => cat.id),
                    
                    // Star categories (same as actor/actress)
                    'star': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('actor') || 
                        cat.name.toLowerCase().includes('actress') || 
                        cat.name.toLowerCase().includes('leading') || 
                        cat.name.toLowerCase().includes('supporting')
                    ).map(cat => cat.id),
                    
                    // Writer categories
                    'writer': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('screenplay') || 
                        cat.name.toLowerCase().includes('writing') || 
                        cat.name.toLowerCase().includes('adapted') || 
                        cat.name.toLowerCase().includes('original')
                    ).map(cat => cat.id),
                    
                    // Cinematographer categories
                    'cinematographer': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('cinematography')
                    ).map(cat => cat.id),
                    
                    // Editor categories
                    'editor': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('editing') || 
                        cat.name.toLowerCase().includes('film editing')
                    ).map(cat => cat.id),
                    
                    // Sound categories
                    'sound designer': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('sound') || 
                        cat.name.toLowerCase().includes('sound mixing') || 
                        cat.name.toLowerCase().includes('sound editing')
                    ).map(cat => cat.id),
                    
                    // Composer categories
                    'composer': allCategories.filter(cat => 
                        cat.name.toLowerCase().includes('music') || 
                        cat.name.toLowerCase().includes('score') || 
                        cat.name.toLowerCase().includes('song')
                    ).map(cat => cat.id)
                };
                
                // Check if we have a direct match for the normalized position
                let matchingCategoryIds = [];
                if (positionToCategoryMap[normalizedPosition]) {
                    matchingCategoryIds = positionToCategoryMap[normalizedPosition];
                    console.log(`Found ${matchingCategoryIds.length} matching categories for position "${position}"`);
                } else {
                    // If no direct match, try partial matching
                    for (const [key, categories] of Object.entries(positionToCategoryMap)) {
                        if (normalizedPosition.includes(key) || key.includes(normalizedPosition)) {
                            console.log(`Found partial match: "${key}" for position "${position}"`);
                            matchingCategoryIds = categories;
                            break;
                        }
                    }
                    
                    // If still no match, try to match based on common words in the position
                    if (matchingCategoryIds.length === 0) {
                        const commonWords = ['actor', 'actress', 'star', 'performer', 'director', 'writer', 'composer', 'designer', 'editor', 'producer'];
                        for (const word of commonWords) {
                            if (normalizedPosition.includes(word)) {
                                // Find the most specific match for this word
                                for (const [key, categories] of Object.entries(positionToCategoryMap)) {
                                    if (key.includes(word)) {
                                        console.log(`Found word match: "${word}" in position "${position}"`);
                                        matchingCategoryIds = categories;
                                        break;
                                    }
                                }
                                if (matchingCategoryIds.length > 0) break;
                            }
                        }
                    }
                }
                
                // If no match found, use all categories as a fallback
                if (matchingCategoryIds.length === 0) {
                    console.log(`No specific match found for position "${position}", using all categories`);
                    matchingCategoryIds = allCategories.map(cat => cat.id);
                }
                
                console.log('Final matching category IDs:', matchingCategoryIds);
                
                // Add matching categories to the dropdown
                let matchCount = 0;
                allCategories.forEach(category => {
                    if (matchingCategoryIds.includes(category.id)) {
                        const option = new Option(category.name, category.id, false, false);
                        $("#category").append(option);
                        matchCount++;
                    }
                });
                
                // Update UI based on match count - only update the message once
                if (matchCount === 0) {
                    $("#category").append('<option disabled>No eligible categories for this position</option>');
                    $('.eligibility-note').text('No eligible categories found for position "' + position + '"');
                } else {
                    $('.eligibility-note').text('Showing ' + matchCount + ' eligible categories for position "' + position + '"');
                    $('#category').parent().addClass('is-filtered');
                }
                
                // Refresh Select2 if it's being used
                if ($.fn.select2) {
                    try {
                        $("#category").select2('destroy');
                    } catch (e) {
                        console.log('Select2 not initialized on category dropdown');
                    }
                    $("#category").select2({
                        placeholder: 'Select a category',
                        allowClear: true,
                        width: '100%'
                    });
                }
            })
            .catch(error => {
                console.error('Error fetching categories:', error);
                $('.eligibility-note').text('Error loading categories - showing all');
                loadCategories();
            });
    } catch (error) {
        console.error('Error in updateCategoryBasedOnStaff:', error);
        $('.eligibility-note').text('Error processing position data - showing all categories');
        loadCategories();
    }
}

// Format category option to show highlighting for matching positions
function formatCategoryOption(option) {
    if (!option.id) return option.text; // Skip placeholder
    
    if ($(option.element).hasClass('position-match')) {
        return $('<span class="position-match-option"><i class="fas fa-check-circle me-1"></i>' + option.text + ' <small>(Matches position)</small></span>');
    }
    
    return option.text;
}

// Function to efficiently map positions to category ids
function findMatchingCategories(position) {
    // If position is an array, use the first item
    if (Array.isArray(position)) {
        position = position[0];
    }
    
    // If no position or empty string, return empty array
    if (!position) {
        console.log('No valid position provided to findMatchingCategories');
        return [];
    }
    
    // Normalize position by converting to lowercase and trimming
    const normalizedPosition = position.toLowerCase().trim();
    console.log('Finding matching categories for position:', position, '(normalized:', normalizedPosition, ')');
    
    // Get all category IDs and names from the dropdown
    const allCategories = [];
    $("#category option").each(function() {
        const categoryId = $(this).val();
        const categoryName = $(this).text().toLowerCase();
        if (categoryId) { // Skip the empty/placeholder option
            allCategories.push({
                id: categoryId,
                name: categoryName
            });
        }
    });
    
    console.log('Available categories in dropdown:', allCategories.map(cat => cat.name));
    
    // If we don't have any categories, try to load them directly
    if (allCategories.length === 0) {
        console.log('No categories found in dropdown, attempting to load them directly');
        
        // Try to load categories directly from the API
        return new Promise((resolve) => {
            fetch('/api/categories')
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    }
                    throw new Error('Failed to load categories');
                })
                .then(categories => {
                    console.log('Successfully loaded categories directly:', categories.length);
                    
                    // Create a mapping of positions to category IDs based on the loaded categories
                    const positionToCategoryMap = {
                        // Producer categories
                        'producer': categories.filter(cat => 
                            cat.name.toLowerCase().includes('picture') || 
                            cat.name.toLowerCase().includes('best picture') ||
                            cat.name.toLowerCase().includes('motion picture') ||
                            cat.name.toLowerCase().includes('outstanding picture')
                        ).map(cat => cat.id),
                        
                        // Director categories
                        'director': categories.filter(cat => 
                            cat.name.toLowerCase().includes('director') || 
                            cat.name.toLowerCase().includes('directing')
                        ).map(cat => cat.id),
                        
                        // Actor categories
                        'actor': categories.filter(cat => 
                            cat.name.toLowerCase().includes('actor') || 
                            cat.name.toLowerCase().includes('leading') || 
                            cat.name.toLowerCase().includes('supporting')
                        ).map(cat => cat.id),
                        
                        // Actress categories
                        'actress': categories.filter(cat => 
                            cat.name.toLowerCase().includes('actress') || 
                            cat.name.toLowerCase().includes('leading') || 
                            cat.name.toLowerCase().includes('supporting')
                        ).map(cat => cat.id),
                        
                        // Star categories (same as actor/actress)
                        'star': categories.filter(cat => 
                            cat.name.toLowerCase().includes('actor') || 
                            cat.name.toLowerCase().includes('actress') || 
                            cat.name.toLowerCase().includes('leading') || 
                            cat.name.toLowerCase().includes('supporting')
                        ).map(cat => cat.id),
                        
                        // Writer categories
                        'writer': categories.filter(cat => 
                            cat.name.toLowerCase().includes('screenplay') || 
                            cat.name.toLowerCase().includes('writing') || 
                            cat.name.toLowerCase().includes('adapted') || 
                            cat.name.toLowerCase().includes('original')
                        ).map(cat => cat.id),
                        
                        // Cinematographer categories
                        'cinematographer': categories.filter(cat => 
                            cat.name.toLowerCase().includes('cinematography')
                        ).map(cat => cat.id),
                        
                        // Editor categories
                        'editor': categories.filter(cat => 
                            cat.name.toLowerCase().includes('editing') || 
                            cat.name.toLowerCase().includes('film editing')
                        ).map(cat => cat.id),
                        
                        // Sound categories
                        'sound designer': categories.filter(cat => 
                            cat.name.toLowerCase().includes('sound') || 
                            cat.name.toLowerCase().includes('sound mixing') || 
                            cat.name.toLowerCase().includes('sound editing')
                        ).map(cat => cat.id),
                        
                        // Composer categories
                        'composer': categories.filter(cat => 
                            cat.name.toLowerCase().includes('music') || 
                            cat.name.toLowerCase().includes('score') || 
                            cat.name.toLowerCase().includes('song')
                        ).map(cat => cat.id)
                    };
                    
                    // Check if we have a direct match for the normalized position
                    if (positionToCategoryMap[normalizedPosition]) {
                        const matchingCategories = positionToCategoryMap[normalizedPosition];
                        console.log(`Found ${matchingCategories.length} matching categories for position "${position}"`);
                        resolve(matchingCategories);
                        return;
                    }
                    
                    // If no direct match, try partial matching
                    for (const [key, categories] of Object.entries(positionToCategoryMap)) {
                        if (normalizedPosition.includes(key) || key.includes(normalizedPosition)) {
                            console.log(`Found partial match: "${key}" for position "${position}"`);
                            resolve(categories);
                            return;
                        }
                    }
                    
                    // If still no match, try to match based on common words in the position
                    const commonWords = ['actor', 'actress', 'star', 'performer', 'director', 'writer', 'composer', 'designer', 'editor', 'producer'];
                    for (const word of commonWords) {
                        if (normalizedPosition.includes(word)) {
                            // Find the most specific match for this word
                            for (const [key, categories] of Object.entries(positionToCategoryMap)) {
                                if (key.includes(word)) {
                                    console.log(`Found word match: "${word}" in position "${position}"`);
                                    resolve(categories);
                                    return;
                                }
                            }
                        }
                    }
                    
                    // If no match found, return all categories as a fallback
                    console.log(`No specific match found for position "${position}", returning all categories`);
                    resolve(categories.map(cat => cat.id));
                })
                .catch(error => {
                    console.error('Error loading categories directly:', error);
                    resolve([]);
                });
        });
    }
    
    // Create a mapping of positions to category IDs
    // This is based on common Oscar categories and their associated positions
    const positionToCategoryMap = {
        // Acting categories
        'actor': allCategories.filter(cat => 
            cat.name.includes('actor') || 
            cat.name.includes('leading') || 
            cat.name.includes('supporting')
        ).map(cat => cat.id),
        
        'actress': allCategories.filter(cat => 
            cat.name.includes('actress') || 
            cat.name.includes('leading') || 
            cat.name.includes('supporting')
        ).map(cat => cat.id),
        
        // Additional acting-related positions
        'star': allCategories.filter(cat => 
            cat.name.includes('actor') || 
            cat.name.includes('actress') || 
            cat.name.includes('leading') || 
            cat.name.includes('supporting')
        ).map(cat => cat.id),
        
        'performer': allCategories.filter(cat => 
            cat.name.includes('actor') || 
            cat.name.includes('actress') || 
            cat.name.includes('leading') || 
            cat.name.includes('supporting')
        ).map(cat => cat.id),
        
        'lead': allCategories.filter(cat => 
            cat.name.includes('leading') || 
            cat.name.includes('actor') || 
            cat.name.includes('actress')
        ).map(cat => cat.id),
        
        'supporting': allCategories.filter(cat => 
            cat.name.includes('supporting') || 
            cat.name.includes('actor') || 
            cat.name.includes('actress')
        ).map(cat => cat.id),
        
        // Directing categories
        'director': allCategories.filter(cat => 
            cat.name.includes('director') || 
            cat.name.includes('directing')
        ).map(cat => cat.id),
        
        // Writing categories
        'writer': allCategories.filter(cat => 
            cat.name.includes('screenplay') || 
            cat.name.includes('writing') || 
            cat.name.includes('adapted') || 
            cat.name.includes('original')
        ).map(cat => cat.id),
        
        'screenwriter': allCategories.filter(cat => 
            cat.name.includes('screenplay') || 
            cat.name.includes('writing') || 
            cat.name.includes('adapted') || 
            cat.name.includes('original')
        ).map(cat => cat.id),
        
        // Cinematography
        'cinematographer': allCategories.filter(cat => 
            cat.name.includes('cinematography')
        ).map(cat => cat.id),
        
        'director of photography': allCategories.filter(cat => 
            cat.name.includes('cinematography')
        ).map(cat => cat.id),
        
        // Editing
        'editor': allCategories.filter(cat => 
            cat.name.includes('editing') || 
            cat.name.includes('film editing')
        ).map(cat => cat.id),
        
        'film editor': allCategories.filter(cat => 
            cat.name.includes('editing') || 
            cat.name.includes('film editing')
        ).map(cat => cat.id),
        
        // Sound
        'sound designer': allCategories.filter(cat => 
            cat.name.includes('sound') || 
            cat.name.includes('sound mixing') || 
            cat.name.includes('sound editing')
        ).map(cat => cat.id),
        
        'sound mixer': allCategories.filter(cat => 
            cat.name.includes('sound') || 
            cat.name.includes('sound mixing') || 
            cat.name.includes('sound editing')
        ).map(cat => cat.id),
        
        // Music
        'composer': allCategories.filter(cat => 
            cat.name.includes('music') || 
            cat.name.includes('score') || 
            cat.name.includes('song')
        ).map(cat => cat.id),
        
        'music composer': allCategories.filter(cat => 
            cat.name.includes('music') || 
            cat.name.includes('score') || 
            cat.name.includes('song')
        ).map(cat => cat.id),
        
        'songwriter': allCategories.filter(cat => 
            cat.name.includes('song') || 
            cat.name.includes('music')
        ).map(cat => cat.id),
        
        // Visual Effects
        'visual effects': allCategories.filter(cat => 
            cat.name.includes('visual effects') || 
            cat.name.includes('vfx')
        ).map(cat => cat.id),
        
        'vfx': allCategories.filter(cat => 
            cat.name.includes('visual effects') || 
            cat.name.includes('vfx')
        ).map(cat => cat.id),
        
        // Costume Design
        'costume designer': allCategories.filter(cat => 
            cat.name.includes('costume')
        ).map(cat => cat.id),
        
        // Makeup
        'makeup artist': allCategories.filter(cat => 
            cat.name.includes('makeup') || 
            cat.name.includes('hairstyling')
        ).map(cat => cat.id),
        
        'hairstylist': allCategories.filter(cat => 
            cat.name.includes('makeup') || 
            cat.name.includes('hairstyling')
        ).map(cat => cat.id),
        
        // Production Design
        'production designer': allCategories.filter(cat => 
            cat.name.includes('production design') || 
            cat.name.includes('art direction')
        ).map(cat => cat.id),
        
        'art director': allCategories.filter(cat => 
            cat.name.includes('production design') || 
            cat.name.includes('art direction')
        ).map(cat => cat.id),
        
        // Producer
        'producer': allCategories.filter(cat => 
            cat.name.includes('picture') || 
            cat.name.includes('best picture') ||
            cat.name.includes('motion picture') ||
            cat.name.includes('outstanding picture')
        ).map(cat => cat.id),
        
        'executive producer': allCategories.filter(cat => 
            cat.name.includes('picture') || 
            cat.name.includes('best picture') ||
            cat.name.includes('motion picture') ||
            cat.name.includes('outstanding picture')
        ).map(cat => cat.id),
        
        // Animation
        'animator': allCategories.filter(cat => 
            cat.name.includes('animated') || 
            cat.name.includes('animation')
        ).map(cat => cat.id),
        
        // Documentary
        'documentary filmmaker': allCategories.filter(cat => 
            cat.name.includes('documentary')
        ).map(cat => cat.id),
        
        // International
        'international filmmaker': allCategories.filter(cat => 
            cat.name.includes('international') || 
            cat.name.includes('foreign')
        ).map(cat => cat.id)
    };
    
    // Log the available positions for debugging
    console.log('Available positions in mapping:', Object.keys(positionToCategoryMap));
    
    // Check if we have a direct match for the normalized position
    if (positionToCategoryMap[normalizedPosition]) {
        const matchingCategories = positionToCategoryMap[normalizedPosition];
        console.log(`Found ${matchingCategories.length} matching categories for position "${position}"`);
        return matchingCategories;
    }
    
    // If no direct match, try partial matching
    for (const [key, categories] of Object.entries(positionToCategoryMap)) {
        if (normalizedPosition.includes(key) || key.includes(normalizedPosition)) {
            console.log(`Found partial match: "${key}" for position "${position}"`);
            return categories;
        }
    }
    
    // If still no match, try to match based on common words in the position
    const commonWords = ['actor', 'actress', 'star', 'performer', 'director', 'writer', 'composer', 'designer', 'editor', 'producer'];
    for (const word of commonWords) {
        if (normalizedPosition.includes(word)) {
            // Find the most specific match for this word
            for (const [key, categories] of Object.entries(positionToCategoryMap)) {
                if (key.includes(word)) {
                    console.log(`Found word match: "${word}" in position "${position}"`);
                    return categories;
                }
            }
        }
    }
    
    // If no match found, return all categories as a fallback
    console.log(`No specific match found for position "${position}", returning all categories`);
    return allCategories.map(cat => cat.id);
}

// Function to load staff members for the selected movie
function loadMovieStaff(movieId) {
    if (!movieId) {
        console.log("No movie selected, clearing staff dropdown");
        $('#staff-member').empty().append('<option value="">Select a staff member</option>');
        return;
    }
    
    console.log("Loading staff for movie ID:", movieId);
    
    // Show loading state
    $('#staff-member').empty().append('<option value="">Loading staff members...</option>');
    
    // Fetch all staff members for the selected movie
    fetch(`/api/movie-crew?movieId=${movieId}`)
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            // Try alternative endpoint if the first one fails
            return fetch(`/api/movie-crew-raw?movieId=${movieId}`).then(res => res.json());
        })
        .then(staff => {
            if (staff && staff.length > 0) {
                populateStaffDropdown(staff);
            } else {
                loadDummyStaff();
            }
        })
        .catch(error => {
            console.error("Error loading staff:", error);
            loadDummyStaff();
        });
}

// Function to load dummy staff data for testing
function loadDummyStaff() {
    console.log("Loading dummy staff data for testing");
    const dummyStaff = [
        { id: 1, name: "Steven Spielberg", position: "Director" },
        { id: 2, name: "Tom Hanks", position: "Actor" },
        { id: 3, name: "Meryl Streep", position: "Actress" },
        { id: 4, name: "John Williams", position: "Music Composer" },
        { id: 5, name: "Roger Deakins", position: "Cinematographer" },
        { id: 6, name: "Edith Head", position: "Costume Designer" },
        { id: 7, name: "James Cameron", position: "Screenwriter" },
        { id: 8, name: "Editing Person", position: "Editor" },
        { id: 9, name: "Sound Person", position: "Sound Designer" },
        { id: 10, name: "VFX Person", position: "Visual Effects" }
    ];
    populateStaffDropdown(dummyStaff);
}

// Bind movie and staff member change events
function bindMovieStaffEvents() {
    // Staff member selection change event
    $('#staff-member').on('change', function() {
        const selectedValues = $(this).val() || [];
        console.log('Staff member changed, selected values:', selectedValues);
        
        // Get position of the selected staff (use first selected if multiple)
        let selectedPosition = '';
        if (selectedValues.length > 0) {
            const firstSelected = selectedValues[0];
            selectedPosition = $(this).find(`option[value="${firstSelected}"]`).data('position');
        }
        
        console.log('Using position for category filtering:', selectedPosition);
        updateCategoryBasedOnStaff();
    });

    // Additional logging for document ready state
    console.log('Staff events bound successfully');
}

// Document ready function
$(document).ready(function() {
    console.log('Setting up event handlers for staff and category dropdowns');
    
    // Add filtered indicator
    $('#category').parent().addClass('filtered-dropdown-container');
    
    // Load data for dropdowns
    loadMovies();
    
    // Load categories first, then initialize category based on staff selection
    loadCategories().then(() => {
        console.log('Categories loaded, initializing category based on staff selection');
        // Initialize category based on default staff selection
        updateCategoryBasedOnStaff();
    });
    
    loadAwardEditions();
    
    // Initialize award edition dropdown with Select2
    $('#award-edition').select2({
        placeholder: 'Select an award edition',
        allowClear: true
    });
    
    // Special initialization for category dropdown
    $('#category').select2({
        placeholder: 'Select a category',
        allowClear: true
    });

    // Initialize staff-member dropdown with Select2
    $('#staff-member').select2({
        placeholder: 'Select staff members',
        allowClear: true,
        width: '100%',
        multiple: true // Enable multiple selection
    }).on('change', function() {
        console.log('Staff selection changed from document ready handler');
        updateCategoryBasedOnStaff();
    });
});

// Function to search for staff members by name
async function searchStaffMembers(movieId, searchTerm = '') {
    try {
        let url = `/api/movie-crew?movieId=${movieId}`;
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
        
        // Try alternative endpoint if the first one fails
        url = `/api/movie-crew-raw?movieId=${movieId}`;
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        
        const alternativeResponse = await fetch(url);
        if (alternativeResponse.ok) {
            return await alternativeResponse.json();
        }
        
        // If both endpoints fail, return empty array
        return [];
    } catch (error) {
        console.error('Search staff members error:', error);
        return [];
    }
} 