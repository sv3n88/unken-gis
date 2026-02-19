-- Initialize PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Create schema
CREATE SCHEMA IF NOT EXISTS unkenprojekt;

-- Create tables
CREATE TABLE IF NOT EXISTS unkenprojekt.biotope (
    id SERIAL PRIMARY KEY,
    huepferlinge INTEGER,
    datum DATE,
    photo TEXT,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    region TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt.species (
    id SERIAL PRIMARY KEY,
    name TEXT,
    datum DATE,
    photo TEXT,
    anzahl INTEGER,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt.gewaesser (
    id SERIAL PRIMARY KEY,
    name TEXT,
    datum DATE,
    photo TEXT,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    region TEXT,
    geom GEOMETRY(POINT, 25832)
);

-- Create spatial indexes
CREATE INDEX IF NOT EXISTS idx_biotope_2025_geom ON unkenprojekt.biotope USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_species_2025_geom ON unkenprojekt.species USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_gewaesser_2025_geom ON unkenprojekt.gewaesser USING GIST(geom);
