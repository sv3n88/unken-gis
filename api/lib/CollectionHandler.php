<?php
// ─────────────────────────────────────────────────────────────────────────────
// Api/CollectionHandler.php
//
// Handles OGC API Features requests for collections and features.
// Each public method corresponds to one API endpoint.
//
// Handler methods are deliberately thin:
//   1. Validate and sanitise input
//   2. Call Database to get data
//   3. Shape the response array
//   4. Call Response::send()
//
// No SQL here. No header() calls. No echo.
// ─────────────────────────────────────────────────────────────────────────────

namespace Api;

class CollectionHandler {

    private Database $db;
    private string   $baseUrl;

    // ── Constructor ───────────────────────────────────────────────────────
    //
    // Receives a Database instance rather than creating one itself.
    // Same dependency injection pattern as before.
    //
    // $baseUrl is computed once here so every method can build links
    // without repeating the protocol/host/path logic.

    public function __construct(Database $db, string $baseUrl) {
        $this->db      = $db;
        $this->baseUrl = $baseUrl;
    }


    // ── Public endpoint handlers ──────────────────────────────────────────
    //
    // index.php calls exactly one of these per request.
    // Each one calls Response::send() which exits, so they never return.

    public function landingPage(): never {
        Response::send([
            'title'       => API_TITLE,
            'description' => 'OGC API Features implementation for Unkenprojekt GIS data',
            'links'       => [
                $this->link($this->baseUrl,                  'self', 'This document'),
                $this->link($this->baseUrl . '/collections', 'data', 'Collections'),
            ],
        ]);
    }

    public function listCollections(): never {
        $collections = [];

        foreach ($this->db->getCollectionNames() as $entry) {
            $name  = $entry['name'];
            $stats = $this->db->getCollectionStats($name);
            $url   = $this->baseUrl . '/collections/' . $name;

            $collections[] = [
                'id'          => $name,
                'title'       => ucfirst($name),
                'description' => $entry['description'] ?: "Collection: $name",
                'links'       => [
                    $this->link($url,           'self',  'This collection'),
                    $this->link($url . '/items', 'items', 'Items'),
                ],
                'extent'    => $this->extent($stats['bbox']),
                'itemType'  => 'feature',
                'crs'       => [DEFAULT_CRS],
                'itemCount' => $stats['count'],
            ];
        }

        Response::send([
            'links'       => [$this->link($this->baseUrl . '/collections', 'self', 'This document')],
            'collections' => $collections,
        ]);
    }

    public function collectionMetadata(string $collectionId): never {
        $this->requireCollection($collectionId);

        $stats = $this->db->getCollectionStats($collectionId);
        $url   = $this->baseUrl . '/collections/' . $collectionId;

        Response::send([
            'id'          => $collectionId,
            'title'       => ucfirst($collectionId),
            'description' => "GIS collection: $collectionId",
            'links'       => [
                $this->link($url,           'self',  'This collection'),
                $this->link($url . '/items', 'items', 'Items'),
            ],
            'extent'    => $this->extent($stats['bbox']),
            'itemType'  => 'feature',
            'crs'       => [DEFAULT_CRS],
            'itemCount' => $stats['count'],
        ]);
    }

    public function getItems(string $collectionId): never {
        $this->requireCollection($collectionId);

        // Validate and clamp pagination parameters.
        // intval() converts strings to integers safely — "abc" becomes 0.
        // We clamp limit between 1 and MAX_LIMIT so clients can't request
        // an unlimited number of features.
        $limit  = min(max(intval($_GET['limit']  ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
        $offset = max(intval($_GET['offset'] ?? 0), 0);

        $rows  = $this->db->fetchRows($collectionId, $limit, $offset);
        $uuids = array_column($rows, '__uuid');
        // array_column is a PHP built-in that extracts one column from a
        // 2D array — like doing $rows.map(r => r.__uuid) in JS.

        $metadataMap = $this->db->fetchMetadata($collectionId, $uuids);
        $features    = $this->buildFeatures($rows, $metadataMap);
        $total       = $this->db->fetchCount($collectionId);

        $selfUrl = $this->baseUrl . '/collections/' . $collectionId . '/items';
        $links   = [$this->link("$selfUrl?limit=$limit&offset=$offset", 'self', 'This page')];

        if ($offset + $limit < $total) {
            $links[] = $this->link("$selfUrl?limit=$limit&offset=" . ($offset + $limit), 'next', 'Next page');
        }
        if ($offset > 0) {
            $links[] = $this->link("$selfUrl?limit=$limit&offset=" . max(0, $offset - $limit), 'prev', 'Previous page');
        }

        Response::send([
            'type'           => 'FeatureCollection',
            'links'          => $links,
            'numberMatched'  => $total,
            'numberReturned' => count($features),
            'features'       => $features,
        ]);
    }

    public function getItem(string $collectionId, string $rawId): never {
        $this->requireCollection($collectionId);

        $fid = intval($rawId);
        if ($fid <= 0) {
            Response::error("Invalid item id '$rawId'", 400);
        }

        $row = $this->db->fetchRow($collectionId, $fid);
        if ($row === null) {
            Response::error("Item '$fid' not found in '$collectionId'", 404);
        }

        $uuid        = $row['__uuid'];
        $metadataMap = $this->db->fetchMetadata($collectionId, [$uuid]);
        $features    = $this->buildFeatures([$row], $metadataMap);

        Response::send($features[0]);
    }


    // ── Private helpers ───────────────────────────────────────────────────

    /**
     * Abort with 404 if the collection does not exist.
     * Called at the top of every endpoint handler that needs a collection.
     *
     * This is a "guard clause" — it exits early on invalid input so the
     * rest of the method can assume the input is valid. Much cleaner than
     * wrapping everything in an if/else.
     */
    private function requireCollection(string $collectionId): void {
        if (!$this->db->tableExists($collectionId)) {
            Response::error("Collection '$collectionId' not found", 404);
        }
    }

    /**
     * Converts raw database rows into GeoJSON Feature arrays.
     * Attaches photos and bemerkungen from the metadata map.
     */
    private function buildFeatures(array $rows, array $metadataMap): array {
        $features = [];

        foreach ($rows as $row) {
            $geoJson = $row['geometry'];
            $uuid    = $row['__uuid'];

            // Remove internal fields before building properties.
            // These were needed for the query but should not appear in output.
            unset($row['geometry'], $row['__uuid']);

            $meta           = $metadataMap[$uuid] ?? ['photos' => [], 'bemerkungen' => []];
            $row['photos']      = $meta['photos'];
            $row['bemerkungen'] = $meta['bemerkungen'];

            $features[] = [
                'type'       => 'Feature',
                // json_decode turns the GeoJSON geometry string from PostGIS
                // into a PHP object so it encodes as a JSON object (not a
                // quoted string) when we json_encode the whole response.
                'geometry'   => json_decode($geoJson),
                'properties' => $row,
            ];
        }

        return $features;
    }

    /**
     * Builds an OGC API link object.
     * Extracted as a helper because every endpoint produces several of these.
     */
    private function link(string $href, string $rel, string $title, string $type = 'application/json'): array {
        return ['href' => $href, 'rel' => $rel, 'type' => $type, 'title' => $title];
    }

    /**
     * Builds an OGC API spatial extent object from a bounding box array.
     */
    private function extent(array $bbox): array {
        return ['spatial' => ['bbox' => [$bbox], 'crs' => DEFAULT_CRS]];
    }
}