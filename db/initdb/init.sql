-- Initialize PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Create schema
CREATE SCHEMA IF NOT EXISTS unkenprojekt;

-- Create tables
CREATE TABLE IF NOT EXISTS unkenprojekt.biotope (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fid BIGSERIAL UNIQUE,
    huepferlinge INTEGER,
    region TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt.species (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fid BIGSERIAL UNIQUE,
    anzahl INTEGER,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt.gewaesser (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fid BIGSERIAL UNIQUE,
    region TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt.biotope_metadata (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fid BIGSERIAL UNIQUE,
    biotope_uuid UUID REFERENCES unkenprojekt.biotope(uuid),
    bemerkung TEXT,
    photo TEXT,
    datum TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS unkenprojekt.species_metadata (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fid BIGSERIAL UNIQUE,
    species_uuid UUID REFERENCES unkenprojekt.species(uuid),
    bemerkung TEXT,
    photo TEXT,
    datum TIMESTAMPTZ
);

-- Create spatial indexes
CREATE INDEX IF NOT EXISTS idx_biotope_2025_geom ON unkenprojekt.biotope USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_species_2025_geom ON unkenprojekt.species USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_gewaesser_2025_geom ON unkenprojekt.gewaesser USING GIST(geom);
