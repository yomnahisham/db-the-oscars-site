# The OSCARS (Academy Awards) Website

A comprehensive web application for exploring Academy Awards data, built with Node.js, Express, and MySQL. This project provides an interactive platform for viewing Oscar nominations, discovering statistics about winners, and creating dream teams of award-winning filmmakers.

## Live Demo

Visit the live site at: [https://db-the-oscars-site.onrender.com/](https://db-the-oscars-site.onrender.com/)

## Features

- **User Authentication**: Secure login and registration system
- **Nomination Management**: Add and view Oscar nominations
- **Statistics Dashboard**: View detailed statistics about Oscar winners
- **Dream Team Builder**: Create your ideal team of Oscar-winning filmmakers
- **Search Functionality**: Search for movies, people, and nominations
- **Filtering Options**: Filter nominations by year, category, and more

## Getting Started

### Option 1: Use the Live Demo
Simply visit [https://db-the-oscars-site.onrender.com/](https://db-the-oscars-site.onrender.com/) to explore the application.

### Option 2: Set Up Your Own Database
1. Create a MySQL database
2. Use the provided schema in `prisma/schema.prisma`
3. Import the required data using one of these methods:
   - Use the data scraper at [https://github.com/yomnahisham/py-academy-awards-wiki-scrape](https://github.com/yomnahisham/py-academy-awards-wiki-scrape)
   - Import your own Academy Awards data following the schema structure

### Option 3: Local Development
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the following variables in `.env`:
     ```
     DATABASE_URL="mysql://user:password@localhost:3306/database_name"
     PORT=3000
     NODE_ENV=development
     SESSION_SECRET="your_session_secret_here"
     ```
4. Run database migrations: `npx prisma migrate dev`
5. Start the server: `node server.js`

## Technology Stack

- **Backend**: Node.js, Express
- **Database**: MySQL
- **ORM**: Prisma
- **Frontend**: HTML, CSS, JavaScript
- **Authentication**: JWT

## Database Schema

The application uses a relational database with the following main entities:
- Movies
- People (actors, directors, etc.)
- Nominations
- Categories
- Production Companies
- Countries
- Languages

## API Endpoints

- `/api/nominations`: Manage nominations
- `/api/statistics`: Access Oscar statistics
- `/api/dream-team`: Create dream teams
- `/api/movies`: Movie-related operations
- `/api/people`: People-related operations

## Security Notes

- Never commit the `.env` file to version control
- Keep your database credentials secure
- Use strong session secrets in production
- Regularly update dependencies for security patches

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

Yomna Othman - CSCE2501 