<?php

/**
 * Database Configuration
 * Loads configuration from .env file
 */

/**
 * Load environment variables from .env file
 */
function loadEnv($path)
{
    if (!file_exists($path)) {
        throw new Exception('.env file not found. Please copy .env.example to .env and configure it.');
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        // Skip comments
        if (strpos(trim($line), '#') === 0) {
            continue;
        }

        // Parse KEY=VALUE
        if (strpos($line, '=') !== false) {
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);

            // Remove quotes if present
            if ((substr($value, 0, 1) === '"' && substr($value, -1) === '"')
                || (substr($value, 0, 1) === "'" && substr($value, -1) === "'")) {
                $value = substr($value, 1, -1);
            }

            // Set as environment variable
            putenv("$key=$value");
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}

// Load .env file from the same directory as config.php
loadEnv(__DIR__ . '/../.env');

// Database connection parameters
define('DB_HOST', getenv('DB_HOST'));
define('DB_PORT', getenv('DB_PORT'));
define('DB_NAME', getenv('DB_NAME'));
define('DB_USER', getenv('DB_USER'));
define('DB_PASSWORD', getenv('DB_PASSWORD'));
define('DB_SCHEMA', getenv('DB_SCHEMA'));

// API Configuration
define('API_TITLE', getenv('API_TITLE') ?: 'Unkenprojekt GIS API');
define('API_VERSION', getenv('API_VERSION') ?: '1.0.0');
define('DEFAULT_CRS', 'EPSG:4326'); // WGS84 for GeoJSON output
define('STORAGE_CRS', 'EPSG:25832'); // Your database storage CRS

// CORS settings (for local development)
$allowCors = getenv('ALLOW_CORS');
define('ALLOW_CORS', $allowCors === 'true' || $allowCors === '1');

// Pagination defaults
define('DEFAULT_LIMIT', intval(getenv('DEFAULT_LIMIT') ?: 100));
define('MAX_LIMIT', intval(getenv('MAX_LIMIT') ?: 1000));

/**
 * Get database connection
 */
function getDBConnection()
{
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
                'message' => pg_last_error(),
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
function setCORSHeaders()
{
    if (ALLOW_CORS) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
}

/**
 * Send JSON response
 */
function sendJSON($data, $statusCode = 200)
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Send error response
 */
function sendError($message, $statusCode = 400, $code = null)
{
    sendJSON([
        'code' => $code ?: $statusCode,
        'description' => $message,
    ], $statusCode);
}
