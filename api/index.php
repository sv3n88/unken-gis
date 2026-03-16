<?php
// ─────────────────────────────────────────────────────────────────────────────
// index.php
//
// Entry point and router. Does three things only:
//   1. Bootstrap: load config, set CORS headers, handle OPTIONS preflight
//   2. Parse the URL into path segments
//   3. Call the right handler method based on the path
//
// No SQL here. No response formatting. No business logic.
// If you find yourself writing any of those here, it belongs in
// Database.php or CollectionHandler.php instead.
// ─────────────────────────────────────────────────────────────────────────────

require_once 'config.php';

// PHP namespaces work like JS modules — they prevent name collisions and
// make it clear where a class comes from. "use" is like "import" in JS.
// After these lines we can write "new Database()" instead of "new Api\Database()".
use lib\Response;
use lib\Database;
use lib\CollectionHandler;

// Autoloader: instead of require_once-ing every class file manually,
// we register a function that PHP calls automatically whenever it sees
// a class it doesn't know yet. It maps "Api\Database" to "Api/Database.php".
//
// This is the standard pattern — in larger projects Composer handles this,
// but for a small project a simple manual autoloader is fine.
spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/' . str_replace('\\', '/', $class) . '.php';
    if (file_exists($file)) {
        require_once $file;
    }
});


// ── Bootstrap ─────────────────────────────────────────────────────────────────

Response::setCORSHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}


// ── Build handler ─────────────────────────────────────────────────────────────
//
// Create the database and handler once, before routing.
// Every route uses the same $handler instance.

$conn    = getDBConnection();
$db      = new Database($conn, DB_SCHEMA);
$baseUrl = getBaseUrl();
$handler = new CollectionHandler($db, $baseUrl);


// ── Parse URL ─────────────────────────────────────────────────────────────────
//
// Turn "/api/collections/biotope/items/3" into ["collections","biotope","items","3"]

$path  = trim(str_replace(dirname($_SERVER['SCRIPT_NAME']), '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');
$parts = explode('/', $path);


// ── Route ─────────────────────────────────────────────────────────────────────
//
// Match URL segments to handler methods.
// Each branch does one thing: call the right handler.
//
// Guard clauses exit early on invalid paths — no deeply nested if/else.

if (empty($parts[0]) || $parts[0] === 'index.php') {
    $handler->landingPage();
}

if ($parts[0] !== 'collections') {
    Response::error('Invalid endpoint', 404);
}

$collectionId = $parts[1] ?? null;

if ($collectionId === null) {
    $handler->listCollections();
}

$sub = $parts[2] ?? null;

if ($sub === null) {
    $handler->collectionMetadata($collectionId);
}

if ($sub !== 'items') {
    Response::error('Invalid endpoint', 404);
}

$itemId = $parts[3] ?? null;

if ($itemId === null) {
    $handler->getItems($collectionId);
} else {
    $handler->getItem($collectionId, $itemId);
}