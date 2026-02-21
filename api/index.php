<?php
/**
 * OGC API Features - Main Entry Point
 */

require_once 'config.php';

setCORSHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$requestUri = $_SERVER['REQUEST_URI'];
$scriptName = dirname($_SERVER['SCRIPT_NAME']);
$path       = str_replace($scriptName, '', parse_url($requestUri, PHP_URL_PATH));
$path       = trim($path, '/');
$pathParts  = explode('/', $path);

if (empty($pathParts[0]) || $pathParts[0] === 'index.php') {
    landingPage();
} elseif ($pathParts[0] === 'collections') {
    if (!isset($pathParts[1]))       listCollections();
    elseif (!isset($pathParts[2]))   collectionMetadata($pathParts[1]);
    elseif ($pathParts[2] === 'items') {
        isset($pathParts[3]) ? getItem($pathParts[1], $pathParts[3]) : getItems($pathParts[1]);
    } else sendError('Invalid endpoint', 404);
} else sendError('Invalid endpoint', 404);

// ─────────────────────────────────────────────────────────────────────────────

function landingPage() {
    $baseUrl = getBaseUrl();
    sendJSON([
        'title'       => API_TITLE,
        'description' => 'OGC API Features implementation for Unkenprojekt GIS data',
        'links'       => [
            ['href' => $baseUrl,                  'rel' => 'self', 'type' => 'application/json', 'title' => 'This document'],
            ['href' => $baseUrl . '/collections', 'rel' => 'data', 'type' => 'application/json', 'title' => 'Collections'],
        ],
    ]);
}

function listCollections() {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;

    $result = pg_query_params($conn,
        "SELECT table_name, obj_description((quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass) AS description
         FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
        [$schema]
    );
    if (!$result) sendError('Failed to query collections: ' . pg_last_error($conn), 500);

    $collections = [];
    $baseUrl     = getBaseUrl();

    while ($row = pg_fetch_assoc($result)) {
        $t = $row['table_name'];
        // Skip side tables
        if (str_ends_with($t, '_metadata') || str_ends_with($t, '_images')) continue;

        $stats         = getCollectionStats($conn, $schema, $t);
        $collections[] = [
            'id'          => $t,
            'title'       => ucfirst($t),
            'description' => $row['description'] ?: "Collection: $t",
            'links'       => [
                ['href' => $baseUrl.'/collections/'.$t,          'rel' => 'self',  'type' => 'application/json',     'title' => 'This collection'],
                ['href' => $baseUrl.'/collections/'.$t.'/items', 'rel' => 'items', 'type' => 'application/geo+json', 'title' => 'Items'],
            ],
            'extent'    => ['spatial' => ['bbox' => [$stats['bbox']], 'crs' => DEFAULT_CRS]],
            'itemType'  => 'feature',
            'crs'       => [DEFAULT_CRS],
            'itemCount' => $stats['count'],
        ];
    }

    sendJSON([
        'links'       => [['href' => $baseUrl.'/collections', 'rel' => 'self', 'type' => 'application/json', 'title' => 'This document']],
        'collections' => $collections,
    ]);
}

function collectionMetadata($collectionId) {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;
    if (!tableExists($conn, $schema, $collectionId)) sendError("Collection '$collectionId' not found", 404);

    $stats   = getCollectionStats($conn, $schema, $collectionId);
    $baseUrl = getBaseUrl();

    sendJSON([
        'id'          => $collectionId,
        'title'       => ucfirst($collectionId),
        'description' => "GIS collection: $collectionId",
        'links'       => [
            ['href' => $baseUrl.'/collections/'.$collectionId,          'rel' => 'self',  'type' => 'application/json',     'title' => 'This collection'],
            ['href' => $baseUrl.'/collections/'.$collectionId.'/items', 'rel' => 'items', 'type' => 'application/geo+json', 'title' => 'Items'],
        ],
        'extent'    => ['spatial' => ['bbox' => [$stats['bbox']], 'crs' => DEFAULT_CRS]],
        'itemType'  => 'feature',
        'crs'       => [DEFAULT_CRS],
        'itemCount' => $stats['count'],
    ]);
}

function getItems($collectionId) {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;
    if (!tableExists($conn, $schema, $collectionId)) sendError("Collection '$collectionId' not found", 404);

    $limit  = min(max(isset($_GET['limit'])  ? intval($_GET['limit'])  : DEFAULT_LIMIT, 1), MAX_LIMIT);
    $offset = max(isset($_GET['offset']) ? intval($_GET['offset']) : 0, 0);

    [$selectList, $uuidAlias] = buildSelectList($conn, $schema, $collectionId);

    $query = sprintf(
        "SELECT %s FROM \"%s\".\"%s\" ORDER BY fid LIMIT %d OFFSET %d",
        $selectList,
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $collectionId),
        $limit, $offset
    );

    $result = pg_query($conn, $query);
    if (!$result) sendError('Failed to query items: ' . pg_last_error($conn), 500);

    $rows = []; $uuids = [];
    while ($row = pg_fetch_assoc($result)) { $uuids[] = $row['__uuid']; $rows[] = $row; }

    $metadataMap = getFeatureMetadata($conn, $schema, $collectionId, $uuids);

    $features = [];
    foreach ($rows as $row) {
        $geo  = $row['geometry'];
        $uuid = $row['__uuid'];
        unset($row['geometry'], $row['__uuid']);
        $meta = $metadataMap[$uuid] ?? ['photos' => [], 'bemerkungen' => []];
        $row['photos']      = $meta['photos'];
        $row['bemerkungen'] = $meta['bemerkungen'];
        $features[] = ['type' => 'Feature', 'geometry' => json_decode($geo), 'properties' => $row];
    }

    $countRes = pg_query($conn, sprintf("SELECT COUNT(*) AS count FROM \"%s\".\"%s\"",
        pg_escape_string($conn, $schema), pg_escape_string($conn, $collectionId)));
    if (!$countRes) sendError('Failed to get count: ' . pg_last_error($conn), 500);
    $total = intval(pg_fetch_assoc($countRes)['count']);

    $baseUrl = getBaseUrl();
    $selfUrl = $baseUrl.'/collections/'.$collectionId.'/items';

    $response = [
        'type'           => 'FeatureCollection',
        'links'          => [['href' => $selfUrl.'?limit='.$limit.'&offset='.$offset, 'rel' => 'self', 'type' => 'application/geo+json', 'title' => 'This page']],
        'numberMatched'  => $total,
        'numberReturned' => count($features),
        'features'       => $features,
    ];
    if ($offset + $limit < $total)
        $response['links'][] = ['href' => $selfUrl.'?limit='.$limit.'&offset='.($offset+$limit), 'rel' => 'next', 'type' => 'application/geo+json', 'title' => 'Next page'];
    if ($offset > 0)
        $response['links'][] = ['href' => $selfUrl.'?limit='.$limit.'&offset='.max(0,$offset-$limit), 'rel' => 'prev', 'type' => 'application/geo+json', 'title' => 'Previous page'];

    sendJSON($response);
}

function getItem($collectionId, $itemId) {
    $conn   = getDBConnection();
    $schema = DB_SCHEMA;
    if (!tableExists($conn, $schema, $collectionId)) sendError("Collection '$collectionId' not found", 404);

    [$selectList] = buildSelectList($conn, $schema, $collectionId);

    $result = pg_query_params($conn,
        sprintf("SELECT %s FROM \"%s\".\"%s\" WHERE fid = $1",
            $selectList, pg_escape_string($conn, $schema), pg_escape_string($conn, $collectionId)),
        [intval($itemId)]
    );
    if (!$result) sendError('Failed to query item: ' . pg_last_error($conn), 500);

    $row = pg_fetch_assoc($result);
    if (!$row) sendError("Item with fid '$itemId' not found in collection '$collectionId'", 404);

    $geo  = $row['geometry'];
    $uuid = $row['__uuid'];
    unset($row['geometry'], $row['__uuid']);

    $meta               = getFeatureMetadata($conn, $schema, $collectionId, [$uuid])[$uuid] ?? ['photos' => [], 'bemerkungen' => []];
    $row['photos']      = $meta['photos'];
    $row['bemerkungen'] = $meta['bemerkungen'];

    sendJSON(['type' => 'Feature', 'geometry' => json_decode($geo), 'properties' => $row]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the SELECT list for a feature query, returning [selectString, unusedAlias].
 */
function buildSelectList($conn, $schema, $collectionId) {
    $columns         = getTableColumns($conn, $schema, $collectionId);
    $propertyColumns = array_filter($columns, fn($c) => !in_array($c, ['geom','uuid','photo','photo_hyperlink']));

    $parts = [];
    foreach ($propertyColumns as $col) {
        $parts[] = $col === 'fid' ? '"fid" AS "id"' : '"'.$col.'"';
    }
    $parts[] = '"uuid" AS "__uuid"';
    $parts[] = 'ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geometry';

    return [implode(', ', $parts), '__uuid'];
}

/**
 * Fetch metadata for a set of feature UUIDs from the _metadata table.
 *
 * Each row can have photo, bemerkung, or both — all are independent.
 *
 * Returns per UUID:
 *   photos:      [ {src, datum}, … ]          rows where photo IS NOT NULL
 *   bemerkungen: [ {datum, text}, … ]          rows where bemerkung IS NOT NULL
 *
 * Falls back to legacy _images table if no _metadata table exists.
 */
function getFeatureMetadata($conn, $schema, $collectionId, array $uuids) {
    if (empty($uuids)) return [];

    $fkColumn      = $collectionId . '_uuid';
    $metadataTable = $collectionId . '_metadata';
    $imagesTable   = $collectionId . '_images';

    $result = null;
    $hasMetadata = tableExists($conn, $schema, $metadataTable);
    $hasImages   = !$hasMetadata && tableExists($conn, $schema, $imagesTable);

    $table    = $hasMetadata ? $metadataTable : ($hasImages ? $imagesTable : null);
    if (!$table) return [];

    $placeholders = implode(', ', array_map(fn($i) => '$'.($i+1), array_keys($uuids)));

    // For legacy _images: no bemerkung column exists, cast NULL
    $bemerkungCol = $hasMetadata ? 'bemerkung' : 'NULL::TEXT AS bemerkung';

    $query = sprintf(
        "SELECT \"%s\", photo, %s,
                TO_CHAR(datum AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY') AS datum_fmt
         FROM \"%s\".\"%s\"
         WHERE \"%s\" IN (%s)
         ORDER BY datum ASC NULLS LAST, fid ASC",
        pg_escape_string($conn, $fkColumn),
        $bemerkungCol,
        pg_escape_string($conn, $schema),
        pg_escape_string($conn, $table),
        pg_escape_string($conn, $fkColumn),
        $placeholders
    );

    $result = pg_query_params($conn, $query, array_values($uuids));
    if (!$result) {
        error_log("getFeatureMetadata failed for $schema.$table: " . pg_last_error($conn));
        return [];
    }

    $map = [];
    while ($row = pg_fetch_assoc($result)) {
        $uuid = $row[$fkColumn];
        if (!isset($map[$uuid])) $map[$uuid] = ['photos' => [], 'bemerkungen' => []];

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

function getCollectionStats($conn, $schema, $tableName) {
    $result = pg_query($conn, sprintf(
        "SELECT COUNT(*) AS count,
                ST_XMin(ST_Transform(ST_Extent(geom),4326)) AS minx,
                ST_YMin(ST_Transform(ST_Extent(geom),4326)) AS miny,
                ST_XMax(ST_Transform(ST_Extent(geom),4326)) AS maxx,
                ST_YMax(ST_Transform(ST_Extent(geom),4326)) AS maxy
         FROM \"%s\".\"%s\" WHERE geom IS NOT NULL",
        pg_escape_string($conn, $schema), pg_escape_string($conn, $tableName)
    ));
    if (!$result) { error_log("getCollectionStats failed: ".pg_last_error($conn)); return ['count'=>0,'bbox'=>[0,0,0,0]]; }
    $s = pg_fetch_assoc($result);
    if (!$s || is_null($s['minx'])) return ['count'=>0,'bbox'=>[0,0,0,0]];
    return ['count'=>intval($s['count']),'bbox'=>[floatval($s['minx']),floatval($s['miny']),floatval($s['maxx']),floatval($s['maxy'])]];
}

function tableExists($conn, $schema, $tableName) {
    $result = pg_query_params($conn,
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2) AS exists",
        [$schema,$tableName]
    );
    if (!$result) return false;
    $row = pg_fetch_assoc($result);
    return $row && $row['exists'] === 't';
}

function getTableColumns($conn, $schema, $tableName) {
    $result = pg_query_params($conn,
        "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position",
        [$schema,$tableName]
    );
    if (!$result) return [];
    $cols = [];
    while ($row = pg_fetch_assoc($result)) $cols[] = $row['column_name'];
    return $cols;
}

function getBaseUrl() {
    $proto = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https' : 'http';
    return $proto.'://'.$_SERVER['HTTP_HOST'].dirname($_SERVER['SCRIPT_NAME']);
}