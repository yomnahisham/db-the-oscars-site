# The OSCARS (Academy Awards) Explorer

A web application for exploring Academy Awards data, including nominations, statistics, and creating dream teams of award-winning filmmakers.

## Features

- View and submit movie nominations
- Explore Oscar statistics and winners
- Create dream teams of award-winning filmmakers
- Search through comprehensive database of Oscar nominees and winners
- User authentication system
- Interactive statistics and visualizations

## Tech Stack

- Node.js
- Express.js
- MySQL (AWS RDS)
- Prisma ORM
- Bootstrap 5
- jQuery & Select2
- Font Awesome

## Prerequisites

- Node.js >= 14.0.0
- MySQL Database

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/db-the-oscars-site.git
cd db-the-oscars-site
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory and add:
```
PORT=3012
DATABASE_URL="your_database_url"
```

4. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3012`

## Deployment

This application is deployed on Render.com and uses AWS RDS for the database.

## License

ISC

## Author

Yomna Othman - CSCE2501 