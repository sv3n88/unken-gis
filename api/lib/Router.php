<?php

// ─────────────────────────────────────────────────────────────────────────────
// lib/Router.php
//
// A simple HTTP router that matches method + path to a handler callback.
//
// Routes are defined with plain strings — no regex, no magic.
// Dynamic segments are written as {name} in the pattern and captured
// by position in the URL.
//
// Usage in index.php:
//   $router = new Router($_SERVER['REQUEST_METHOD'], $path);
//   $router->get('collections/{id}/items', fn($p) => $handler->getItems($p['id']));
//   $router->dispatch();
// ─────────────────────────────────────────────────────────────────────────────

namespace lib;

class Router
{
    private array  $routes = [];
    private string $method;
    private array  $parts;   // the request path split into segments


    // ── Constructor ───────────────────────────────────────────────────────
    //
    // Splits the path into segments immediately so match() only deals
    // with arrays, not strings.
    //
    // "collections/biotope/items/3" → ["collections", "biotope", "items", "3"]
    // "" (root)                     → [""]

    public function __construct(string $method, string $path)
    {
        $this->method = strtoupper($method);
        $this->parts  = explode('/', trim($path, '/'));
    }


    // ── Public route registration ─────────────────────────────────────────
    //
    // One method per HTTP verb. Adding a new verb in the future is one line.

    public function get(string $pattern, callable $handler): void
    {
        $this->register('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->register('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable $handler): void
    {
        $this->register('PUT', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): void
    {
        $this->register('DELETE', $pattern, $handler);
    }


    // ── dispatch() ────────────────────────────────────────────────────────
    //
    // Loops through registered routes and calls the first full match.
    //
    // Two-pass logic — same as before but now readable without regex:
    //   1. Does the path match the pattern? (ignore method)
    //   2. Does the method also match?
    //
    // This means a wrong method returns 405, not 404.

    public function dispatch(): never
    {
        $pathMatched = false;

        foreach ($this->routes as $route) {
            $params = $this->match($this->parts, $route['pattern']);

            if ($params === false) {
                // Path does not match this route at all
                continue;
            }

            $pathMatched = true;

            if ($route['method'] !== $this->method) {
                // Path matches but method is wrong — keep looking
                continue;
            }

            // Full match — call the handler with extracted params
            ($route['handler'])($params);
            exit;
        }

        if ($pathMatched) {
            Response::error('Method not allowed', 405);
        } else {
            Response::error('Invalid endpoint', 404);
        }
    }


    // ── Private helpers ───────────────────────────────────────────────────

    /**
     * Stores a route as a method, a pattern array, and a handler.
     *
     * The pattern string is split into segments once at registration time:
     *   'collections/{id}/items' → ['collections', '{id}', 'items']
     *
     * Splitting here means match() only ever compares arrays — no string
     * splitting happens during the actual request.
     */
    private function register(string $method, string $pattern, callable $handler): void
    {
        $this->routes[] = [
            'method'  => strtoupper($method),
            // Split pattern into segments, same as we split the request path
            'pattern' => explode('/', trim($pattern, '/')),
            'handler' => $handler,
        ];
    }

    /**
     * Compares a request path (as segments) against a route pattern (as segments).
     *
     * Returns an array of captured dynamic params on match, or false on no match.
     *
     * How it works — compare segment by segment:
     *   pattern segment '{id}'         → dynamic, capture whatever is in $parts
     *   pattern segment 'collections'  → literal, must equal $parts segment exactly
     *
     * Example:
     *   pattern: ['collections', '{id}', 'items']
     *   parts:   ['collections', 'biotope', 'items']
     *   result:  ['id' => 'biotope']
     *
     * Example (no match):
     *   pattern: ['collections', '{id}', 'items']
     *   parts:   ['collections', 'biotope']
     *   result:  false  (different number of segments)
     */
    private function match(array $parts, array $pattern): array|false
    {
        // Different number of segments → can never match
        if (count($parts) !== count($pattern)) {
            return false;
        }

        $params = [];

        foreach ($pattern as $i => $segment) {
            if (str_starts_with($segment, '{')) {
                // Dynamic segment — strip the braces to get the param name
                // '{id}' → 'id', then capture the actual value from the request
                $name          = trim($segment, '{}');
                $params[$name] = $parts[$i];
            } elseif ($parts[$i] !== $segment) {
                // Literal segment that doesn't match → whole route fails
                return false;
            }
            // Literal segment that matches → continue to next segment
        }

        return $params;
    }
}
