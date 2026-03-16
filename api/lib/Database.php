<?php
// ─────────────────────────────────────────────────────────────────────────────
// Api/Database.php
//
// Responsible for exactly one thing: talking to PostgreSQL.
// All SQL in the application lives here and nowhere else.
//
// CollectionHandler never writes SQL — it calls methods on Database.
// Database never knows about HTTP — it just returns PHP arrays.
//
// This separation means:
//   - You can read all database logic in one place
//   - If a query breaks, you know exactly where to look
//   - If you switch databases, only this file changes
// ─────────────────────────────────────────────────────────────────────────────

namespace Api;

class Database {

    // ── Private properties ────────────────────────────────────────────────
    //
    // $conn is the PostgreSQL connection resource.
    // $schema is the database schema name (from config.php).
    //
    // Private properties in PHP use the "->" operator with "$this":
    //   $this->conn
    //   $this->schema
    //
    // This is equivalent to "this.#conn" in the JS classes we wrote —
    // PHP just uses "private" as a keyword instead of "#" as a prefix.

    private $conn;
    private string $schema;


    // ── Constructor ───────────────────────────────────────────────────────
    //
    // Receives the connection and schema rather than creating them itself.
    // Same dependency injection pattern as PopupController(map, overlay).
    //
    // index.php creates the connection once and passes it in:
    //   $db = new Database($conn, DB_SCHEMA);

    public function __construct($conn, string $schema) {
        $this->conn   = $conn;
        $this->schema = $schema;
    }


    // ── Public methods ────────────────────────────────────────────────────
    //
    // These are what CollectionHandler calls. No SQL leaks past this boundary.
    // Each method returns a plain PHP array — nothing HTTP-related.

    /**
     * Returns true if a table exists in the schema.
     */
    public function tableExists(string $tableName): bool {
        $result = pg_query_params(
            $this->conn,
            "SELECT EXISTS(
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = $1 AND table_name = $2
            ) AS exists",
            [$this->schema, $tableName]
        );
        if (!$result) return false;
        $row = pg_fetch_assoc($result);
        return $row && $row['exists'] === 't';
    }

    /**
     * Returns an ordered list of column names for a table.
     */
    public function getColumns(string $tableName): array {
        $result = pg_query_params(
            $this->conn,
            "SELECT column_name FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position",
            [$this->schema, $tableName]
        );
        if (!$result) return [];
        $columns = [];
        while ($row = pg_fetch_assoc($result)) {
            $columns[] = $row['column_name'];
        }
        return $columns;
    }

    /**
     * Returns bounding box and feature count for a collection.
     */
    public function getCollectionStats(string $tableName): array {
        $result = pg_query(
            $this->conn,
            sprintf(
                "SELECT COUNT(*) AS count,
                        ST_XMin(ST_Transform(ST_Extent(geom), 4326)) AS minx,
                        ST_YMin(ST_Transform(ST_Extent(geom), 4326)) AS miny,
                        ST_XMax(ST_Transform(ST_Extent(geom), 4326)) AS maxx,
                        ST_YMax(ST_Transform(ST_Extent(geom), 4326)) AS maxy
                 FROM \"%s\".\"%s\"
                 WHERE geom IS NOT NULL",
                pg_escape_string($this->conn, $this->schema),
                pg_escape_string($this->conn, $tableName)
            )
        );

        if (!$result) {
            error_log("getCollectionStats failed: " . pg_last_error($this->conn));
            return ['count' => 0, 'bbox' => [0, 0, 0, 0]];
        }

        $row = pg_fetch_assoc($result);
        if (!$row || is_null($row['minx'])) {
            return ['count' => 0, 'bbox' => [0, 0, 0, 0]];
        }

        return [
            'count' => intval($row['count']),
            'bbox'  => [
                floatval($row['minx']),
                floatval($row['miny']),
                floatval($row['maxx']),
                floatval($row['maxy']),
            ],
        ];
    }

    /**
     * Returns all table names in the schema, excluding side tables
     * (_metadata, _images) that are not map collections.
     */
    public function getCollectionNames(): array {
        $result = pg_query_params(
            $this->conn,
            "SELECT table_name,
                    obj_description(
                        (quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass
                    ) AS description
             FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'
             ORDER BY table_name",
            [$this->schema]
        );
        if (!$result) return [];

        $names = [];
        while ($row = pg_fetch_assoc($result)) {
            $t = $row['table_name'];
            if (str_ends_with($t, '_metadata') || str_ends_with($t, '_images')) continue;
            $names[] = ['name' => $t, 'description' => $row['description']];
        }
        return $names;
    }

    /**
     * Fetches feature rows for a collection with pagination.
     * Returns raw rows including geometry as GeoJSON strings and __uuid.
     */
    public function fetchRows(string $collectionId, int $limit, int $offset): array {
        $selectList = $this->buildSelectList($collectionId);

        $result = pg_query(
            $this->conn,
            sprintf(
                "SELECT %s FROM \"%s\".\"%s\" ORDER BY fid LIMIT %d OFFSET %d",
                $selectList,
                pg_escape_string($this->conn, $this->schema),
                pg_escape_string($this->conn, $collectionId),
                $limit,
                $offset
            )
        );

        if (!$result) {
            Response::error('Failed to query items: ' . pg_last_error($this->conn), 500);
        }

        $rows = [];
        while ($row = pg_fetch_assoc($result)) {
            $rows[] = $row;
        }
        return $rows;
    }

    /**
     * Fetches a single feature row by fid.
     * Returns the raw row, or null if not found.
     */
    public function fetchRow(string $collectionId, int $fid): ?array {
        $selectList = $this->buildSelectList($collectionId);

        $result = pg_query_params(
            $this->conn,
            sprintf(
                "SELECT %s FROM \"%s\".\"%s\" WHERE fid = $1",
                $selectList,
                pg_escape_string($this->conn, $this->schema),
                pg_escape_string($this->conn, $collectionId)
            ),
            [$fid]
        );

        if (!$result) {
            Response::error('Failed to query item: ' . pg_last_error($this->conn), 500);
        }

        // pg_fetch_assoc returns false when there are no more rows.
        // We convert that to null to make the "not found" case explicit
        // for the caller — CollectionHandler can then do:
        //   if ($row === null) Response::error('Not found', 404);
        $row = pg_fetch_assoc($result);
        return $row ?: null;
    }

    /**
     * Returns the total feature count for a collection.
     */
    public function fetchCount(string $collectionId): int {
        $result = pg_query(
            $this->conn,
            sprintf(
                "SELECT COUNT(*) AS count FROM \"%s\".\"%s\"",
                pg_escape_string($this->conn, $this->schema),
                pg_escape_string($this->conn, $collectionId)
            )
        );
        if (!$result) return 0;
        return intval(pg_fetch_assoc($result)['count']);
    }

    /**
     * Fetches metadata (photos + bemerkungen) for a set of feature UUIDs.
     *
     * Returns an array keyed by UUID:
     *   [ 'uuid' => ['photos' => [...], 'bemerkungen' => [...]], ... ]
     *
     * Falls back to legacy _images table if no _metadata table exists.
     */
    public function fetchMetadata(string $collectionId, array $uuids): array {
        if (empty($uuids)) return [];

        $fkColumn      = $collectionId . '_uuid';
        $metadataTable = $collectionId . '_metadata';
        $imagesTable   = $collectionId . '_images';

        $hasMetadata = $this->tableExists($metadataTable);
        $hasImages   = !$hasMetadata && $this->tableExists($imagesTable);

        if (!$hasMetadata && !$hasImages) return [];

        $table        = $hasMetadata ? $metadataTable : $imagesTable;
        $bemerkungCol = $hasMetadata ? 'bemerkung' : 'NULL::TEXT AS bemerkung';

        // Build parameterised placeholders: $1, $2, $3, ...
        // array_keys gives [0, 1, 2, ...], we add 1 to get [1, 2, 3, ...]
        $placeholders = implode(', ', array_map(
            fn($i) => '$' . ($i + 1),
            array_keys($uuids)
        ));

        $query = sprintf(
            "SELECT \"%s\", photo, %s,
                    TO_CHAR(datum AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY') AS datum_fmt
             FROM \"%s\".\"%s\"
             WHERE \"%s\" IN (%s)
             ORDER BY datum ASC NULLS LAST, fid ASC",
            pg_escape_string($this->conn, $fkColumn),
            $bemerkungCol,
            pg_escape_string($this->conn, $this->schema),
            pg_escape_string($this->conn, $table),
            pg_escape_string($this->conn, $fkColumn),
            $placeholders
        );

        $result = pg_query_params($this->conn, $query, array_values($uuids));
        if (!$result) {
            error_log("fetchMetadata failed for $this->schema.$table: " . pg_last_error($this->conn));
            return [];
        }

        $map = [];
        while ($row = pg_fetch_assoc($result)) {
            $uuid = $row[$fkColumn];
            if (!isset($map[$uuid])) {
                $map[$uuid] = ['photos' => [], 'bemerkungen' => []];
            }

            if (!empty($row['photo'])) {
                $map[$uuid]['photos'][] = [
                    'src'   => $row['photo'],
                    'datum' => $row['datum_fmt'] ?: null,
                ];
            }

            if ($hasMetadata && !empty($row['bemerkung'])) {
                $map[$uuid]['bemerkungen'][] = [
                    'datum' => $row['datum_fmt'] ?: null,
                    'text'  => $row['bemerkung'],
                ];
            }
        }

        return $map;
    }


    // ── Private methods ───────────────────────────────────────────────────
    //
    // Implementation details used only inside this class.
    // CollectionHandler never calls these.

    /**
     * Builds the SELECT column list for a feature query.
     * Excludes geometry/internal columns, aliases fid as id,
     * and adds __uuid and geometry as GeoJSON.
     */
    private function buildSelectList(string $collectionId): string {
        $columns = $this->getColumns($collectionId);
        $skip    = ['geom', 'uuid', 'photo', 'photo_hyperlink'];

        $parts = [];
        foreach ($columns as $col) {
            if (in_array($col, $skip)) continue;
            // Alias fid as "id" so the frontend response stays unchanged
            $parts[] = $col === 'fid'
                ? '"fid" AS "id"'
                : '"' . $col . '"';
        }

        $parts[] = '"uuid" AS "__uuid"';
        $parts[] = 'ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry';

        return implode(', ', $parts);
    }
}