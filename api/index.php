<?php
/**
 * OGC API Features - Main Entry Point
 *
 * Endpoints:
 * - GET /api/                                      - Landing page
 * - GET /api/collections                           - List all collections
 * - GET /api/collections/{collectionId}            - Collection metadata
 * - GET /api/collections/{collectionId}/items      - Get features from collection
 * - GET /api/collections/{collectionId}/items/{id} - Get single feature (id = fid)
 */

require_once 'config.php';

// Set CORS headers
setCORSHeaders();

// Handle OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Parse request path
$requestUri = $_SERVER['REQUEST_URI'];
$scriptName = dirname($_SERVER['SCRIPT_NAME']);
$path       = str_replace($scriptName, '', parse_url($requestUri, PHP_URL_PATH));
$path       = trim($path, '/');
$pathParts  = explode('/', $path);

// Route the request
if (empty($pathParts[0]) || $pathParts[0] === 'index.php') {
    landingPage();
} elseif ($pathParts[0] === 'collections') {
    if (!isset($pathParts[1])) {
        listCollections();
    } elseif (!isset($pathParts[2])) {
        collectionMetadata($pathParts[1]);
    } elseif ($pathParts[2] === 'items') {
        if (isset($pathParts[3])) {
            getItem($pathParts[1], $pathParts[3]);
        } else {
            getItems($pathParts[1]);
        }
    } else {
        sendError('Invalid endpoint', 404);
    }
} else {
    sendError('Invalid endpoint', 404);
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Landing page with API information
 */
function landingPage() {
    $baseUrl = getBaseUrl();

    $response = [
        'title'       => API_TITLE,
        'description' => 'OGC API Features implementation for Unkenprojekt GIS data',
        'links'       => [
            [
                'href'  => $baseUrl,
                'rel'   => 'self',
                'type'  => 'application/json',
                'title' => 'This document',
            ],
            [
                'href'  => $baseUrl . '/collections',
                'rel'   => 'data',
                'type'  => 'application/json',
                'title' => 'Collections',
            ],
        ],
    ];

    sendJSON($response);
}

/**
 * List all available collections
 */
function listCollections() {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;

    $query = "
        SELECT
            table_name,
            obj_description(
                (quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass
            ) AS description
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type   = 'BASE TABLE'
        ORDER BY table_name
    ";

    $result = pg_query_params($conn, $query, [$schema]);
    if (!$result) {
        sendError('Failed to query collections: ' . pg_last_error($conn), 500);
    }

    $collections = [];
    $baseUrl     = getBaseUrl();

    while ($row = pg_fetch_assoc($result)) {
        $tableName = $row['table_name'];

        // Skip image tables — they are not map collections
        if (str_ends_with($tableName, '_images')) {
            continue;
        }

        $stats = getCollectionStats($conn, $schema, $tableName);

        $collection = [
            'id'          => $tableName,
            'title'       => ucfirst($tableName),
            'description' => $row['description'] ?: "Collection: $tableName",
            'links'       => [
                [
                    'href'  => $baseUrl . '/collections/' . $tableName,
                    'rel'   => 'self',
                    'type'  => 'application/json',
                    'title' => 'This collection',
                ],
                [
                    'href'  => $baseUrl . '/collections/' . $tableName . '/items',
                    'rel'   => 'items',
                    'type'  => 'application/geo+json',
                    'title' => 'Items in this collection',
                ],
            ],
            'extent'   => [
                'spatial' => [
                    'bbox' => [$stats['bbox']],
                    'crs'  => DEFAULT_CRS,
                ],
            ],
            'itemType' => 'feature',
            'crs'      => [DEFAULT_CRS],
        ];

        if ($stats['count'] !== null) {
            $collection['itemCount'] = $stats['count'];
        }

        $collections[] = $collection;
    }

    $response = [
        'links' => [
            [
                'href'  => $baseUrl . '/collections',
                'rel'   => 'self',
                'type'  => 'application/json',
                'title' => 'This document',
            ],
        ],
        'collections' => $collections,
    ];

    sendJSON($response);
}

/**
 * Get metadata for a specific collection
 */
function collectionMetadata($collectionId) {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;

    if (!tableExists($conn, $schema, $collectionId)) {
        sendError("Collection '$collectionId' not found", 404);
    }

    $stats   = getCollectionStats($conn, $schema, $collectionId);
    $baseUrl = getBaseUrl();

    $response = [
        'id'          => $collectionId,
        'title'       => ucfirst($collectionId),
        'description' => "GIS collection: $collectionId",
        'links'       => [
            [
                'href'  => $baseUrl . '/collections/' . $collectionId,
                'rel'   => 'self',
                'type'  => 'application/json',
                'title' => 'This collection',
            ],
            [
                'href'  => $baseUrl . '/collections/' . $collectionId . '/items',
                'rel'   => 'items',
                'type'  => 'application/geo+json',
                'title' => 'Items',
            ],
        ],
        'extent'   => [
            'spatial' => [
                'bbox' => [$stats['bbox']],
                'crs'  => DEFAULT_CRS,
            ],
        ],
        'itemType' => 'feature',
        'crs'      => [DEFAULT_CRS],
    ];

    if ($stats['count'] !== null) {
        $response['itemCount'] = $stats['count'];
    }

    sendJSON($response);
}

/**
 * Get items (features) from a collection, with embedded photos array.
 *
 * Internally joins on uuid. Exposes fid as the public "id" field so the
 * frontend response is identical to the previous schema.
 */
function getItems($collectionId) {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;

    if (!tableExists($conn, $schema, $collectionId)) {
        sendError("Collection '$collectionId' not found", 404);
    }

    // Pagination parameters
    $limit  = isset($_GET['limit'])  ? intval($_GET['limit'])  : DEFAULT_LIMIT;
    $limit  = min(max($limit, 1), MAX_LIMIT);
    $offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;
    $offset = max($offset, 0);

    // Columns to include as properties:
    // - always exclude raw geometry, internal uuid, and legacy photo columns
    // - always include uuid under the alias __uuid for internal image lookup
    // - expose fid as "id" to keep the frontend response unchanged
    $columns         = getTableColumns($conn, $schema, $collectionId);
    $propertyColumns = array_filter($columns, function ($col) {
        return !in_array($col, ['geom', 'uuid', 'photo', 'photo_hyperlink']);
    });

    // Build SELECT list: rename fid → id, pass everything else through as-is
    $selectParts = [];
    foreach ($propertyColumns as $col) {
        if ($col === 'fid') {
            $selectParts[] = '"fid" AS "id"';
        } else {
            $selectParts[] = '"' . $col . '"';
        }
    }
    // Also pull uuid for the image join — aliased so it doesn't collide with
    // any property named "uuid" that the frontend might accidentally see
    $selectParts[] = '"uuid" AS "__uuid"';
    $selectParts[] = 'ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry';

    $selectList = implode(', ', $selectParts);

    $query = sprintf(
        "SELECT %s
         FROM \"%s\".\"%s\"
         ORDER BY fid
         LIMIT %d OFFSET %d",
        $selectList,
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $collectionId),
        $limit,
        $offset
    );

    $result = pg_query($conn, $query);
    if (!$result) {
        sendError('Failed to query items: ' . pg_last_error($conn), 500);
    }

    // Collect rows; track uuids for image lookup and fids for response ordering
    $rows  = [];
    $uuids = [];

    while ($row = pg_fetch_assoc($result)) {
        $uuids[] = $row['__uuid'];
        $rows[]  = $row;
    }

    // Fetch all images keyed by uuid in one query
    $imageMap = getFeatureImages($conn, $schema, $collectionId, $uuids);

    // Build GeoJSON features
    $features = [];
    foreach ($rows as $row) {
        $geometryJson = $row['geometry'];
        $rowUuid      = $row['__uuid'];

        // Remove internal fields before building properties
        unset($row['geometry']);
        unset($row['__uuid']);

        // Attach photos array (empty array if none)
        $row['photos'] = $imageMap[$rowUuid] ?? [];

        $features[] = [
            'type'       => 'Feature',
            'geometry'   => json_decode($geometryJson),
            'properties' => $row,
        ];
    }

    // Total count for pagination
    $countQuery = sprintf(
        "SELECT COUNT(*) AS count FROM \"%s\".\"%s\"",
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $collectionId)
    );
    $countResult = pg_query($conn, $countQuery);
    if (!$countResult) {
        sendError('Failed to get count: ' . pg_last_error($conn), 500);
    }
    $totalCount = intval(pg_fetch_assoc($countResult)['count']);

    $baseUrl = getBaseUrl();
    $selfUrl = $baseUrl . '/collections/' . $collectionId . '/items';

    $response = [
        'type'           => 'FeatureCollection',
        'links'          => [
            [
                'href'  => $selfUrl . '?limit=' . $limit . '&offset=' . $offset,
                'rel'   => 'self',
                'type'  => 'application/geo+json',
                'title' => 'This page',
            ],
        ],
        'numberMatched'  => $totalCount,
        'numberReturned' => count($features),
        'features'       => $features,
    ];

    // Pagination links
    if ($offset + $limit < $totalCount) {
        $response['links'][] = [
            'href'  => $selfUrl . '?limit=' . $limit . '&offset=' . ($offset + $limit),
            'rel'   => 'next',
            'type'  => 'application/geo+json',
            'title' => 'Next page',
        ];
    }
    if ($offset > 0) {
        $response['links'][] = [
            'href'  => $selfUrl . '?limit=' . $limit . '&offset=' . max(0, $offset - $limit),
            'rel'   => 'prev',
            'type'  => 'application/geo+json',
            'title' => 'Previous page',
        ];
    }

    sendJSON($response);
}

/**
 * Get a single feature by fid (the public-facing integer id), with embedded
 * photos array. Internally resolves uuid for the image join.
 */
function getItem($collectionId, $itemId) {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;

    if (!tableExists($conn, $schema, $collectionId)) {
        sendError("Collection '$collectionId' not found", 404);
    }

    $columns         = getTableColumns($conn, $schema, $collectionId);
    $propertyColumns = array_filter($columns, function ($col) {
        return !in_array($col, ['geom', 'uuid', 'photo', 'photo_hyperlink']);
    });

    $selectParts = [];
    foreach ($propertyColumns as $col) {
        if ($col === 'fid') {
            $selectParts[] = '"fid" AS "id"';
        } else {
            $selectParts[] = '"' . $col . '"';
        }
    }
    $selectParts[] = '"uuid" AS "__uuid"';
    $selectParts[] = 'ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry';

    $selectList = implode(', ', $selectParts);

    // $itemId is the public fid
    $query = sprintf(
        "SELECT %s
         FROM \"%s\".\"%s\"
         WHERE fid = $1",
        $selectList,
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $collectionId)
    );

    $result = pg_query_params($conn, $query, [intval($itemId)]);
    if (!$result) {
        sendError('Failed to query item: ' . pg_last_error($conn), 500);
    }

    $row = pg_fetch_assoc($result);
    if (!$row) {
        sendError("Item with fid '$itemId' not found in collection '$collectionId'", 404);
    }

    $geometryJson = $row['geometry'];
    $rowUuid      = $row['__uuid'];

    unset($row['geometry']);
    unset($row['__uuid']);

    $imageMap      = getFeatureImages($conn, $schema, $collectionId, [$rowUuid]);
    $row['photos'] = $imageMap[$rowUuid] ?? [];

    $response = [
        'type'       => 'Feature',
        'geometry'   => json_decode($geometryJson),
        'properties' => $row,
    ];

    sendJSON($response);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch images for a set of feature UUIDs from the matching _images table.
 *
 * The images tables now reference the parent via {collection}_uuid rather than
 * the old integer {collection}_id, so we join on uuid throughout.
 *
 * Returns: [ 'uuid-string' => ['DCIM/a.jpg', 'DCIM/b.jpg'], … ]
 * Returns [] if no _images table exists for this collection.
 */
function getFeatureImages($conn, $schema, $collectionId, array $uuids) {
    if (empty($uuids)) {
        return [];
    }

    $imagesTable = $collectionId . '_images';
    $fkColumn    = $collectionId . '_uuid';   // e.g. biotope_uuid, species_uuid

    if (!tableExists($conn, $schema, $imagesTable)) {
        return [];
    }

    // Build a parameterised UUID list: $1, $2, $3, …
    $placeholders = implode(', ', array_map(function ($i) {
        return '$' . ($i + 1);
    }, array_keys($uuids)));

    $query = sprintf(
        "SELECT \"%s\", photo
         FROM \"%s\".\"%s\"
         WHERE \"%s\" IN (%s)
         ORDER BY datum ASC NULLS LAST, fid ASC",
        pg_escape_string($conn, $fkColumn),
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $imagesTable),
        pg_escape_string($conn, $fkColumn),
        $placeholders
    );

    $result = pg_query_params($conn, $query, array_values($uuids));
    if (!$result) {
        error_log("getFeatureImages failed for $schema.$imagesTable: " . pg_last_error($conn));
        return [];
    }

    $imageMap = [];
    while ($row = pg_fetch_assoc($result)) {
        $uuid = $row[$fkColumn];
        $imageMap[$uuid][] = $row['photo'];
    }

    return $imageMap;
}

/**
 * Get bounding box and feature count for a collection
 */
function getCollectionStats($conn, $schema, $tableName) {
    $query = sprintf(
        "SELECT
            COUNT(*) AS count,
            ST_XMin(ST_Transform(ST_Extent(geom), 4326)) AS minx,
            ST_YMin(ST_Transform(ST_Extent(geom), 4326)) AS miny,
            ST_XMax(ST_Transform(ST_Extent(geom), 4326)) AS maxx,
            ST_YMax(ST_Transform(ST_Extent(geom), 4326)) AS maxy
         FROM \"%s\".\"%s\"
         WHERE geom IS NOT NULL",
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $tableName)
    );

    $result = pg_query($conn, $query);
    if (!$result) {
        error_log("getCollectionStats failed for $schema.$tableName: " . pg_last_error($conn));
        return ['count' => 0, 'bbox' => [0, 0, 0, 0]];
    }

    $stats = pg_fetch_assoc($result);
    if (!$stats || is_null($stats['minx'])) {
        return ['count' => 0, 'bbox' => [0, 0, 0, 0]];
    }

    return [
        'count' => intval($stats['count']),
        'bbox'  => [
            floatval($stats['minx']),
            floatval($stats['miny']),
            floatval($stats['maxx']),
            floatval($stats['maxy']),
        ],
    ];
}

/**
 * Check whether a table exists in the given schema
 */
function tableExists($conn, $schema, $tableName) {
    $query = "
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name   = $2
        ) AS exists
    ";

    $result = pg_query_params($conn, $query, [$schema, $tableName]);
    if (!$result) {
        return false;
    }

    $row = pg_fetch_assoc($result);
    return $row && $row['exists'] === 't';
}

/**
 * Return an ordered list of column names for a table
 */
function getTableColumns($conn, $schema, $tableName) {
    $query = "
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name   = $2
        ORDER BY ordinal_position
    ";

    $result = pg_query_params($conn, $query, [$schema, $tableName]);
    if (!$result) {
        return [];
    }

    $columns = [];
    while ($row = pg_fetch_assoc($result)) {
        $columns[] = $row['column_name'];
    }

    return $columns;
}

/**
 * Build the base URL for this API endpoint
 */
function getBaseUrl() {
    $protocol   = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $host       = $_SERVER['HTTP_HOST'];
    $scriptName = dirname($_SERVER['SCRIPT_NAME']);

    return $protocol . '://' . $host . $scriptName;
}