<?php
/**
 * Database Configuration
 * Connects to your existing PostGIS database
 */

// Database connection parameters
define('DB_HOST', 'localhost');
define('DB_PORT', '5432');
define('DB_NAME', 'gisdb');
define('DB_USER', 'gisuser');
define('DB_PASSWORD', 'gispassword');
define('DB_SCHEMA', 'unkenprojekt_2025'); // Change to unkenprojekt_2026 when needed

// API Configuration
define('API_TITLE', 'Unkenprojekt GIS API');
define('API_VERSION', '1.0.0');
define('DEFAULT_CRS', 'EPSG:4326'); // WGS84 for GeoJSON output
define('STORAGE_CRS', 'EPSG:25832'); // Your database storage CRS

// CORS settings (for local development)
define('ALLOW_CORS', true);

// Pagination defaults
define('DEFAULT_LIMIT', 100);
define('MAX_LIMIT', 1000);

/**
 * Get database connection
 */
function getDBConnection() {
    static $conn = null;
    
    if ($conn === null) {
        $connString = sprintf(
            "host=%s port=%s dbname=%s user=%s password=%s",
            DB_HOST,
            DB_PORT,
            DB_NAME,
            DB_USER,
            DB_PASSWORD
        );
        
        $conn = pg_connect($connString);
        
        if (!$conn) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode([
                'error' => 'Database connection failed',
                'message' => pg_last_error()
            ]);
            exit;
        }
        
        // Set client encoding to UTF8
        pg_set_client_encoding($conn, 'UTF8');
    }
    
    return $conn;
}

/**
 * Set CORS headers if enabled
 */
function setCORSHeaders() {
    if (ALLOW_CORS) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
}

/**
 * Send JSON response
 */
function sendJSON($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Send error response
 */
function sendError($message, $statusCode = 400, $code = null) {
    sendJSON([
        'code' => $code ?: $statusCode,
        'description' => $message
    ], $statusCode);
}

?>
