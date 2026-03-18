<?php

// ─────────────────────────────────────────────────────────────────────────────
// index.php
//
// Bootstrap and route table. Does three things only:
//   1. Bootstrap: config, CORS headers, OPTIONS preflight
//   2. Build dependencies: Database, CollectionHandler
//   3. Register routes and dispatch
//
// To add a new endpoint in the future:
//   $router->post('collections/{id}/items', fn($p) => $handler->createItem($p['id']));
// That's it — one line.
// ─────────────────────────────────────────────────────────────────────────────

require_once 'config.php';

use lib\Router;
use lib\Response;
use lib\Database;
use lib\CollectionHandler;

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


// ── Build dependencies ────────────────────────────────────────────────────────

$db      = new Database(getDBConnection(), DB_SCHEMA);
$handler = new CollectionHandler($db, getBaseUrl());


// ── Parse path ────────────────────────────────────────────────────────────────
//
// Strip the script directory prefix and trim slashes so the router
// receives a clean relative path: "collections/biotope/items/3"

$path = trim(
    str_replace(
        dirname($_SERVER['SCRIPT_NAME']),
        '',
        parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)
    ),
    '/'
);


// ── Route table ───────────────────────────────────────────────────────────────
//
// Each line registers one endpoint: method, pattern, handler.
// Reading this block tells you everything the API can do.
//
// fn($p) => ... is a PHP arrow function — equivalent to (p) => ... in JS.
// $p is the array of extracted URL parameters: $p['id'], $p['fid'] etc.
// Routes with no dynamic segments receive an empty array.

$router = new Router($_SERVER['REQUEST_METHOD'], $path);

$router->get('', fn($p) => $handler->landingPage());
$router->get('collections', fn($p) => $handler->listCollections());
$router->get('collections/{id}', fn($p) => $handler->collectionMetadata($p['id']));
$router->get('collections/{id}/items', fn($p) => $handler->getItems($p['id']));
$router->get('collections/{id}/items/{fid}', fn($p) => $handler->getItem($p['id'], $p['fid']));

// Future write endpoints would go here:
// $router->post('collections/{id}/items',          fn($p) => $handler->createItem($p['id']));
// $router->put('collections/{id}/items/{fid}',     fn($p) => $handler->updateItem($p['id'], $p['fid']));
// $router->delete('collections/{id}/items/{fid}',  fn($p) => $handler->deleteItem($p['id'], $p['fid']));

$router->dispatch();
