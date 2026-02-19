# unken-gis

A web-based GIS application built with PHP and JavaScript. It provides an interactive map interface backed by a PostgreSQL/PostGIS database and a PHP API layer.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (Leaflet or similar map library)
- **Backend:** PHP API
- **Database:** PostgreSQL with PostGIS
- **Infrastructure:** Docker / Docker Compose

---

## Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed

### 1. Clone the repository

```bash
git clone https://github.com/sv3n88/unken-gis.git
cd unken-gis
```

### 2. Configure environment variables

Copy the example env file to create both required env files:

```bash
cp .env.example .env
cp .env.example .env.docker
```

Then open `.env` and `.env.docker` and adjust the values to match your local setup (database credentials, API keys, etc.).

> `.env` contains the environment variables for the PostGIS container (database credentials, etc.) and is referenced in `compose.yml`. `.env.docker` is copied into the PHP API Docker container and holds the API's configuration, therefore the DB_HOST must be 
the name of the docker container (postgis).

### 3. Start the application

**Production / Docker:**

```bash
docker compose up -d
```

**Development mode** (with live reload / dev settings):

Use a local PostGIS instance for dev mode.

```bash
docker compose -f compose.dev.yml up -d
```

The application should now be available at [http://localhost](http://localhost).

---

## Database

Initial database setup (tables, extensions, seed data) is handled automatically via scripts in `db/initdb/`, which are executed on first container start.
