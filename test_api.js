const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test that the movie_crew endpoint works as expected
async function testMovieCrew() {
  try {
    // First, get a valid movie ID
    console.log('Fetching movies...');
    const movies = await prisma.movie.findMany({
      take: 5,
      select: {
        id: true,
        name: true
      }
    });
    
    if (movies.length === 0) {
      console.log('No movies found in the database');
      return;
    }
    
    console.log('Found movies:', movies);
    
    // Get the first movie ID
    const movieId = movies[0].id;
    console.log(`Testing with movie ID: ${movieId}`);
    
    // Query movie_crew table directly
    console.log('Fetching movie crew from database...');
    const movieCrew = await prisma.movieCrew.findMany({
      where: {
        movieId: movieId
      },
      include: {
        person: true,
        position: true
      }
    });
    
    console.log(`Found ${movieCrew.length} crew members for movie ID ${movieId}`);
    
    if (movieCrew.length === 0) {
      console.log('No crew members found for this movie');
      
      // Check if there are any crew members in the database at all
      const totalCrew = await prisma.movieCrew.count();
      console.log(`Total crew members in the database: ${totalCrew}`);
      
      if (totalCrew === 0) {
        console.log('The movie_crew table is empty - this is the root cause of the problem');
      }
    } else {
      // Format the response like the API does
      const formattedCrew = movieCrew.map(crew => ({
        id: crew.personId,
        name: `${crew.person.firstName}${crew.person.middleName ? ' ' + crew.person.middleName : ''} ${crew.person.lastName}`,
        position: {
          id: crew.positionId,
          title: crew.position.title
        },
        movieId: crew.movieId
      }));
      
      console.log('Formatted crew data:');
      console.log(JSON.stringify(formattedCrew, null, 2));
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testMovieCrew(); 