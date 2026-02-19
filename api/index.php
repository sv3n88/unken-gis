<?php
/**
 * OGC API Features - Main Entry Point
 *
 * Endpoints:
 * - GET /api/                                    - Landing page
 * - GET /api/collections                         - List all collections
 * - GET /api/collections/{collectionId}          - Collection metadata
 * - GET /api/collections/{collectionId}/items    - Get features from collection
 * - GET /api/collections/{collectionId}/items/{id} - Get single feature
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
 * Get items (features) from a collection, with embedded photos array
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

    // Build property column list (exclude raw geometry and legacy photo columns)
    $columns         = getTableColumns($conn, $schema, $collectionId);
    $propertyColumns = array_filter($columns, function ($col) {
        return !in_array($col, ['geom', 'photo', 'photo_hyperlink']);
    });

    $propertyList = implode(', ', array_map(function ($col) {
        return '"' . $col . '"';
    }, $propertyColumns));

    $query = sprintf(
        "SELECT
            %s,
            ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry
         FROM \"%s\".\"%s\"
         ORDER BY id
         LIMIT %d OFFSET %d",
        $propertyList,
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $collectionId),
        $limit,
        $offset
    );

    $result = pg_query($conn, $query);
    if (!$result) {
        sendError('Failed to query items: ' . pg_last_error($conn), 500);
    }

    // Collect rows and track IDs for image lookup
    $rows       = [];
    $featureIds = [];

    while ($row = pg_fetch_assoc($result)) {
        $featureIds[] = intval($row['id']);
        $rows[]       = $row;
    }

    // Fetch all images for these features in one query
    $imageMap = getFeatureImages($conn, $schema, $collectionId, $featureIds);

    // Build GeoJSON features
    $features = [];
    foreach ($rows as $row) {
        $geometryJson = $row['geometry'];
        unset($row['geometry']);

        $fid               = intval($row['id']);
        $row['photos']     = $imageMap[$fid] ?? [];   // always an array

        $features[] = [
            'type'       => 'Feature',
            'geometry'   => json_decode($geometryJson),
            'properties' => $row,
        ];
    }

    // Total count for pagination headers
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
        'type'          => 'FeatureCollection',
        'links'         => [
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
 * Get a single feature by ID, with embedded photos array
 */
function getItem($collectionId, $itemId) {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;

    if (!tableExists($conn, $schema, $collectionId)) {
        sendError("Collection '$collectionId' not found", 404);
    }

    $columns         = getTableColumns($conn, $schema, $collectionId);
    $propertyColumns = array_filter($columns, function ($col) {
        return !in_array($col, ['geom', 'photo', 'photo_hyperlink']);
    });

    $propertyList = implode(', ', array_map(function ($col) {
        return '"' . $col . '"';
    }, $propertyColumns));

    $query = sprintf(
        "SELECT
            %s,
            ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry
         FROM \"%s\".\"%s\"
         WHERE id = $1",
        $propertyList,
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $collectionId)
    );

    $result = pg_query_params($conn, $query, [$itemId]);
    if (!$result) {
        sendError('Failed to query item: ' . pg_last_error($conn), 500);
    }

    $row = pg_fetch_assoc($result);
    if (!$row) {
        sendError("Item '$itemId' not found in collection '$collectionId'", 404);
    }

    $geometryJson = $row['geometry'];
    unset($row['geometry']);

    $fid         = intval($row['id']);
    $imageMap    = getFeatureImages($conn, $schema, $collectionId, [$fid]);
    $row['photos'] = $imageMap[$fid] ?? [];

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
 * Fetch images for a set of feature IDs from the matching _images table.
 * Returns an array keyed by feature ID, each value an array of photo URLs.
 *
 * Example:  [ 7 => ['photos/a.jpg', 'photos/b.jpg'], 12 => ['photos/c.jpg'] ]
 *
 * If no _images table exists for this collection the function returns [].
 */
function getFeatureImages($conn, $schema, $collectionId, array $featureIds) {
    if (empty($featureIds)) {
        return [];
    }

    $imagesTable = $collectionId . '_images';
    $fkColumn    = $collectionId . '_id';

    if (!tableExists($conn, $schema, $imagesTable)) {
        return [];
    }

    // Safe integer list — no user input reaches sprintf directly
    $idList = implode(',', array_map('intval', $featureIds));

    $query = sprintf(
        "SELECT \"%s\", photo
         FROM \"%s\".\"%s\"
         WHERE \"%s\" IN (%s)
         ORDER BY datum ASC NULLS LAST, id ASC",
        pg_escape_string($conn, $fkColumn),
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $imagesTable),
        pg_escape_string($conn, $fkColumn),
        $idList
    );

    $result = pg_query($conn, $query);
    if (!$result) {
        error_log("getFeatureImages failed for $schema.$imagesTable: " . pg_last_error($conn));
        return [];
    }

    $imageMap = [];
    while ($row = pg_fetch_assoc($result)) {
        $fid = intval($row[$fkColumn]);
        $imageMap[$fid][] = $row['photo'];
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