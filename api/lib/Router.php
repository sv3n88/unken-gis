<?php
// ─────────────────────────────────────────────────────────────────────────────
// lib/Router.php
//
// A small HTTP router that matches method + path to a handler callback.
//
// Usage in index.php:
//   $router = new Router($_SERVER['REQUEST_METHOD'], $parsedPath);
//   $router->get('collections/{id}', fn($p) => $handler->collectionMetadata($p['id']));
//   $router->dispatch();
//
// Dynamic segments like {id} are extracted and passed to the callback
// as an associative array — $params['id'], $params['fid'] etc.
// This is the same idea as Flask's @app.route('/collections/<id>') in Python.
// ─────────────────────────────────────────────────────────────────────────────

namespace lib;

class Router {

    // Each registered route is stored as:
    // ['method' => 'GET', 'pattern' => '#^collections/([^/]+)$#', 'params' => ['id'], 'handler' => fn]
    private array $routes = [];

    private string $method;
    private string $path;


    // ── Constructor ───────────────────────────────────────────────────────
    //
    // Receives the HTTP method and path rather than reading $_SERVER itself.
    // Same dependency injection principle — easier to test, no hidden inputs.
    //
    // index.php passes:
    //   new Router($_SERVER['REQUEST_METHOD'], $parsedPath)

    public function __construct(string $method, string $path) {
        $this->method = strtoupper($method);
        $this->path   = trim($path, '/');
    }


    // ── Public route registration methods ─────────────────────────────────
    //
    // One method per HTTP verb. Currently only GET is needed, but adding
    // POST/PUT/DELETE in the future is just adding a new one-liner method.
    //
    // Each is a thin wrapper around register() — they only differ
    // in the HTTP method string they pass.

    public function get(string $pattern, callable $handler): void {
        $this->register('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void {
        $this->register('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable $handler): void {
        $this->register('PUT', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): void {
        $this->register('DELETE', $pattern, $handler);
    }


    // ── dispatch() ────────────────────────────────────────────────────────
    //
    // Called once after all routes are registered.
    // Loops through routes and calls the first matching handler.
    //
    // Two-pass approach:
    //   Pass 1: check if the path matches any route at all (ignoring method)
    //   Pass 2: among path matches, check if the method matches
    //
    // This lets us return 405 Method Not Allowed instead of 404 Not Found
    // when the path exists but the method is wrong — which is correct
    // HTTP behaviour and helpful for debugging.

    public function dispatch(): never {
        $pathMatched = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['pattern'], $this->path, $matches)) {
                continue;
            }

            // Path matched — remember this even if method doesn't match
            $pathMatched = true;

            if ($route['method'] !== $this->method) {
                continue;
            }

            // Both path and method match.
            // $matches[0] is the full string, $matches[1..n] are capture groups.
            // array_combine zips param names with captured values:
            //   ['id', 'fid'] + ['biotope', '3'] → ['id' => 'biotope', 'fid' => '3']
            $params = !empty($route['params'])
                ? array_combine($route['params'], array_slice($matches, 1))
                : [];

            ($route['handler'])($params);

            // Handler should have called Response::send() which exits.
            // This is a safety net in case it somehow didn't.
            exit;
        }

        if ($pathMatched) {
            // Path was valid but wrong method — e.g. POST to a GET-only route
            Response::error('Method not allowed', 405);
        } else {
            Response::error('Invalid endpoint', 404);
        }
    }


    // ── Private helpers ───────────────────────────────────────────────────

    /**
     * Registers a route by converting the human-readable pattern into a regex.
     *
     * Pattern:  'collections/{id}/items/{fid}'
     * Regex:    '#^collections/([^/]+)/items/([^/]+)$#'
     * Params:   ['id', 'fid']
     *
     * The regex is compiled once here at registration time, not on every
     * request — so dispatch() just runs preg_match on the pre-compiled regex.
     */
    private function register(string $method, string $pattern, callable $handler): void {
        // Step 1: extract param names from {placeholders}
        // preg_match_all finds every {word} and puts the words in $paramNames[1]
        preg_match_all('/\{(\w+)\}/', $pattern, $paramNames);
        $params = $paramNames[1];   // e.g. ['id', 'fid']

        // Step 2: replace {placeholders} with a regex capture group.
        // ([^/]+) means "one or more characters that are not a forward slash"
        // which correctly captures a single URL segment like "biotope" or "3"
        $regex = preg_replace('/\{\w+\}/', '([^/]+)', $pattern);

        // Step 3: wrap in delimiters and anchor to start/end of string.
        // ^ = must start here, $ = must end here — so "collections/x/items/extra"
        // does NOT accidentally match the pattern "collections/{id}/items"
        $regex = '#^' . $regex . '$#';

        $this->routes[] = [
            'method'  => strtoupper($method),
            'pattern' => $regex,
            'params'  => $params,
            'handler' => $handler,
        ];
    }
}