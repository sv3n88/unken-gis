<?php
/**
 * OGC API Features - Main Entry Point (GEOMETRY FIX)
 * 
 * Endpoints:
 * - GET /api/ - Landing page
 * - GET /api/collections - List all collections
 * - GET /api/collections/{collectionId} - Collection metadata
 * - GET /api/collections/{collectionId}/items - Get features from collection
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
$path = str_replace($scriptName, '', parse_url($requestUri, PHP_URL_PATH));
$path = trim($path, '/');
$pathParts = explode('/', $path);

// Route the request
if (empty($pathParts[0]) || $pathParts[0] === 'index.php') {
    // Landing page
    landingPage();
} elseif ($pathParts[0] === 'collections') {
    if (!isset($pathParts[1])) {
        // List all collections
        listCollections();
    } elseif (!isset($pathParts[2])) {
        // Collection metadata
        collectionMetadata($pathParts[1]);
    } elseif ($pathParts[2] === 'items') {
        // Get items from collection
        if (isset($pathParts[3])) {
            // Single item by ID
            getItem($pathParts[1], $pathParts[3]);
        } else {
            // All items in collection
            getItems($pathParts[1]);
        }
    } else {
        sendError('Invalid endpoint', 404);
    }
} else {
    sendError('Invalid endpoint', 404);
}

/**
 * Landing page with API information
 */
function landingPage() {
    $baseUrl = getBaseUrl();
    
    $response = [
        'title' => API_TITLE,
        'description' => 'OGC API Features implementation for Unkenprojekt GIS data',
        'links' => [
            [
                'href' => $baseUrl,
                'rel' => 'self',
                'type' => 'application/json',
                'title' => 'This document'
            ],
            [
                'href' => $baseUrl . '/collections',
                'rel' => 'data',
                'type' => 'application/json',
                'title' => 'Collections'
            ]
        ]
    ];
    
    sendJSON($response);
}

/**
 * List all available collections
 */
function listCollections() {
    $conn = getDBConnection();
    $schema = DB_SCHEMA;
    
    // Query to get all tables in the schema
    $query = "
        SELECT 
            table_name,
            obj_description((quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass) as description
        FROM information_schema.tables
        WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
    ";
    
    $result = pg_query_params($conn, $query, [$schema]);
    
    if (!$result) {
        sendError('Failed to query collections: ' . pg_last_error($conn), 500);
    }
    
    $collections = [];
    $baseUrl = getBaseUrl();
    
    while ($row = pg_fetch_assoc($result)) {
        $tableName = $row['table_name'];
        
        // Get extent and count for this collection
        $stats = getCollectionStats($conn, $schema, $tableName);
        
        $collection = [
            'id' => $tableName,
            'title' => ucfirst($tableName),
            'description' => $row['description'] ?: "Collection: $tableName",
            'links' => [
                [
                    'href' => $baseUrl . '/collections/' . $tableName,
                    'rel' => 'self',
                    'type' => 'application/json',
                    'title' => 'This collection'
                ],
                [
                    'href' => $baseUrl . '/collections/' . $tableName . '/items',
                    'rel' => 'items',
                    'type' => 'application/geo+json',
                    'title' => 'Items in this collection'
                ]
            ],
            'extent' => [
                'spatial' => [
                    'bbox' => [$stats['bbox']],
                    'crs' => DEFAULT_CRS
                ]
            ],
            'itemType' => 'feature',
            'crs' => [DEFAULT_CRS]
        ];
        
        if ($stats['count'] !== null) {
            $collection['itemCount'] = $stats['count'];
        }
        
        $collections[] = $collection;
    }
    
    $response = [
        'links' => [
            [
                'href' => $baseUrl . '/collections',
                'rel' => 'self',
                'type' => 'application/json',
                'title' => 'This document'
            ]
        ],
        'collections' => $collections
    ];
    
    sendJSON($response);
}

/**
 * Get metadata for a specific collection
 */
function collectionMetadata($collectionId) {
    $conn = getDBConnection();
    $schema = DB_SCHEMA;
    
    // Verify collection exists
    if (!tableExists($conn, $schema, $collectionId)) {
        sendError("Collection '$collectionId' not found", 404);
    }
    
    $stats = getCollectionStats($conn, $schema, $collectionId);
    $baseUrl = getBaseUrl();
    
    $response = [
        'id' => $collectionId,
        'title' => ucfirst($collectionId),
        'description' => "GIS collection: $collectionId",
        'links' => [
            [
                'href' => $baseUrl . '/collections/' . $collectionId,
                'rel' => 'self',
                'type' => 'application/json',
                'title' => 'This collection'
            ],
            [
                'href' => $baseUrl . '/collections/' . $collectionId . '/items',
                'rel' => 'items',
                'type' => 'application/geo+json',
                'title' => 'Items'
            ]
        ],
        'extent' => [
            'spatial' => [
                'bbox' => [$stats['bbox']],
                'crs' => DEFAULT_CRS
            ]
        ],
        'itemType' => 'feature',
        'crs' => [DEFAULT_CRS]
    ];
    
    if ($stats['count'] !== null) {
        $response['itemCount'] = $stats['count'];
    }
    
    sendJSON($response);
}

/**
 * Get items (features) from a collection
 */
function getItems($collectionId) {
    $conn = getDBConnection();
    $schema = DB_SCHEMA;
    
    // Verify collection exists
    if (!tableExists($conn, $schema, $collectionId)) {
        sendError("Collection '$collectionId' not found", 404);
    }
    
    // Parse query parameters
    $limit = isset($_GET['limit']) ? intval($_GET['limit']) : DEFAULT_LIMIT;
    $limit = min($limit, MAX_LIMIT);
    $limit = max($limit, 1);
    
    $offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;
    $offset = max($offset, 0);
    
    // Get column names (exclude geometry for properties)
    $columns = getTableColumns($conn, $schema, $collectionId);
    $propertyColumns = array_filter($columns, function($col) {
        return $col !== 'geom';
    });
    
    $propertyList = implode(', ', array_map(function($col) {
        return '"' . pg_escape_string($col) . '"';
    }, $propertyColumns));
    
    // Build query - return geometry as TEXT (not json) so we can parse it
    $query = sprintf(
        "SELECT 
            %s,
            ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry
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
    
    // Build GeoJSON FeatureCollection
    $features = [];
    while ($row = pg_fetch_assoc($result)) {
        // Parse the geometry JSON string
        $geometryJson = $row['geometry'];
        unset($row['geometry']);
        
        // Decode the geometry string to object
        $geometry = json_decode($geometryJson);
        
        $feature = [
            'type' => 'Feature',
            'geometry' => $geometry,
            'properties' => $row
        ];
        
        $features[] = $feature;
    }
    
    // Get total count for pagination
    $countQuery = sprintf(
        "SELECT COUNT(*) as count FROM \"%s\".\"%s\"",
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $collectionId)
    );
    $countResult = pg_query($conn, $countQuery);
    
    if (!$countResult) {
        sendError('Failed to get count: ' . pg_last_error($conn), 500);
    }
    
    $totalCount = pg_fetch_assoc($countResult)['count'];
    
    $baseUrl = getBaseUrl();
    $selfUrl = $baseUrl . '/collections/' . $collectionId . '/items';
    
    $response = [
        'type' => 'FeatureCollection',
        'links' => [
            [
                'href' => $selfUrl . '?limit=' . $limit . '&offset=' . $offset,
                'rel' => 'self',
                'type' => 'application/geo+json',
                'title' => 'This page'
            ]
        ],
        'numberMatched' => intval($totalCount),
        'numberReturned' => count($features),
        'features' => $features
    ];
    
    // Add pagination links
    if ($offset + $limit < $totalCount) {
        $response['links'][] = [
            'href' => $selfUrl . '?limit=' . $limit . '&offset=' . ($offset + $limit),
            'rel' => 'next',
            'type' => 'application/geo+json',
            'title' => 'Next page'
        ];
    }
    
    if ($offset > 0) {
        $prevOffset = max(0, $offset - $limit);
        $response['links'][] = [
            'href' => $selfUrl . '?limit=' . $limit . '&offset=' . $prevOffset,
            'rel' => 'prev',
            'type' => 'application/geo+json',
            'title' => 'Previous page'
        ];
    }
    
    sendJSON($response);
}

/**
 * Get single item by ID
 */
function getItem($collectionId, $itemId) {
    $conn = getDBConnection();
    $schema = DB_SCHEMA;
    
    // Verify collection exists
    if (!tableExists($conn, $schema, $collectionId)) {
        sendError("Collection '$collectionId' not found", 404);
    }
    
    $columns = getTableColumns($conn, $schema, $collectionId);
    $propertyColumns = array_filter($columns, function($col) {
        return $col !== 'geom';
    });
    
    $propertyList = implode(', ', array_map(function($col) {
        return '"' . pg_escape_string($col) . '"';
    }, $propertyColumns));
    
    $query = sprintf(
        "SELECT 
            %s,
            ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry
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
        sendError("Item with id '$itemId' not found in collection '$collectionId'", 404);
    }
    
    // Parse the geometry JSON string
    $geometryJson = $row['geometry'];
    unset($row['geometry']);
    $geometry = json_decode($geometryJson);
    
    $response = [
        'type' => 'Feature',
        'geometry' => $geometry,
        'properties' => $row
    ];
    
    sendJSON($response);
}

/**
 * Helper: Get collection statistics (bbox, count)
 */
function getCollectionStats($conn, $schema, $tableName) {
    // Get bounding box and count with proper escaping
    $query = sprintf(
        "SELECT 
            COUNT(*) as count,
            ST_XMin(ST_Transform(ST_Extent(geom), 4326)) as minx,
            ST_YMin(ST_Transform(ST_Extent(geom), 4326)) as miny,
            ST_XMax(ST_Transform(ST_Extent(geom), 4326)) as maxx,
            ST_YMax(ST_Transform(ST_Extent(geom), 4326)) as maxy
        FROM \"%s\".\"%s\"
        WHERE geom IS NOT NULL",
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $tableName)
    );
    
    $result = pg_query($conn, $query);
    
    // Better error handling
    if (!$result) {
        error_log("Failed to get collection stats for $schema.$tableName: " . pg_last_error($conn));
        // Return default values instead of failing
        return [
            'count' => 0,
            'bbox' => [0, 0, 0, 0]
        ];
    }
    
    $stats = pg_fetch_assoc($result);
    
    if (!$stats) {
        return [
            'count' => 0,
            'bbox' => [0, 0, 0, 0]
        ];
    }
    
    $bbox = [
        floatval($stats['minx']),
        floatval($stats['miny']),
        floatval($stats['maxx']),
        floatval($stats['maxy'])
    ];
    
    // Handle case where there's no data
    if (is_null($stats['minx'])) {
        $bbox = [0, 0, 0, 0];
    }
    
    return [
        'count' => intval($stats['count']),
        'bbox' => $bbox
    ];
}

/**
 * Helper: Check if table exists
 */
function tableExists($conn, $schema, $tableName) {
    $query = "
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_name = $2
        ) as exists
    ";
    
    $result = pg_query_params($conn, $query, [$schema, $tableName]);
    
    if (!$result) {
        return false;
    }
    
    $row = pg_fetch_assoc($result);
    
    return $row && $row['exists'] === 't';
}

/**
 * Helper: Get table columns
 */
function getTableColumns($conn, $schema, $tableName) {
    $query = "
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
        AND table_name = $2
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
 * Helper: Get base URL for the API
 */
function getBaseUrl() {
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $scriptName = dirname($_SERVER['SCRIPT_NAME']);
    
    return $protocol . '://' . $host . $scriptName;
}

?>
