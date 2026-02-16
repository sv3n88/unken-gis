-- Initialize PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS unkenprojekt_2025;
CREATE SCHEMA IF NOT EXISTS unkenprojekt_2026;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA unkenprojekt_2025 TO gisuser;
GRANT ALL PRIVILEGES ON SCHEMA unkenprojekt_2026 TO gisuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA unkenprojekt_2025 TO gisuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA unkenprojekt_2026 TO gisuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA unkenprojekt_2025 TO gisuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA unkenprojekt_2026 TO gisuser;

-- Create 2025 tables
CREATE TABLE IF NOT EXISTS unkenprojekt_2025.biotope (
    id SERIAL PRIMARY KEY,
    huepferlinge INTEGER,
    datum DATE,
    photo TEXT,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    region TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt_2025.species (
    id SERIAL PRIMARY KEY,
    name TEXT,
    datum DATE,
    photo TEXT,
    anzahl INTEGER,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt_2025.gewaesser (
    id SERIAL PRIMARY KEY,
    name TEXT,
    datum DATE,
    photo TEXT,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    region TEXT,
    geom GEOMETRY(POINT, 25832)
);

-- Create 2026 tables
CREATE TABLE IF NOT EXISTS unkenprojekt_2026.biotope (
    id SERIAL PRIMARY KEY,
    huepferlinge INTEGER,
    datum DATE,
    photo TEXT,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    region TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt_2026.species (
    id SERIAL PRIMARY KEY,
    name TEXT,
    datum DATE,
    photo TEXT,
    anzahl INTEGER,
    bemerkung TEXT,
    photo_hyperlink TEXT,
    geom GEOMETRY(POINT, 25832)
);

CREATE TABLE IF NOT EXISTS unkenprojekt_2026.gewaesser (
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
CREATE INDEX IF NOT EXISTS idx_biotope_2025_geom ON unkenprojekt_2025.biotope USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_species_2025_geom ON unkenprojekt_2025.species USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_gewaesser_2025_geom ON unkenprojekt_2025.gewaesser USING GIST(geom);

CREATE INDEX IF NOT EXISTS idx_biotope_2026_geom ON unkenprojekt_2026.biotope USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_species_2026_geom ON unkenprojekt_2026.species USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_gewaesser_2026_geom ON unkenprojekt_2026.gewaesser USING GIST(geom);

-- Grant permissions on tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA unkenprojekt_2025 TO gisuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA unkenprojekt_2026 TO gisuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA unkenprojekt_2025 TO gisuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA unkenprojekt_2026 TO gisuser;

-- Log completion
DO $$ 
BEGIN 
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Unkenprojekt Database Initialized!';
    RAISE NOTICE 'Schemas: unkenprojekt_2025, unkenprojekt_2026';
    RAISE NOTICE 'Tables: biotope, species, gewaesser';
    RAISE NOTICE '============================================';
END $$;
