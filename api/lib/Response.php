<?php
// ─────────────────────────────────────────────────────────────────────────────
// Api/Response.php
//
// Responsible for exactly one thing: sending HTTP responses.
// Every response in the application goes through here — nothing else
// should call header() or echo directly.
//
// All methods are static because Response holds no state.
// You never need "new Response()" — just call Response::send() or
// Response::error() from anywhere.
// ─────────────────────────────────────────────────────────────────────────────

namespace lib;

class Response {

    // ── Public static methods ─────────────────────────────────────────────
    //
    // PHP static methods use the "::" operator instead of "->".
    // The "static" keyword in the declaration is what makes them callable
    // without an instance.
    //
    // Why static here and not in CollectionHandler or Database?
    // Because those classes have state (a database connection, request
    // parameters). Response has none — it's a pure input/output utility,
    // like the el() helper in popup.js.

    /**
     * Send a successful JSON response and exit.
     *
     * @param mixed $data  Anything json_encode() can handle: array, object, etc.
     * @param int   $code  HTTP status code. 200 = OK (the default).
     */
    public static function send(mixed $data, int $code = 200): never {
        // "never" as a return type means this function never returns normally —
        // it always exits. PHP 8.1+ supports this as a type hint, which helps
        // static analysis tools understand that code after this call is unreachable.
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Send an error response and exit.
     *
     * @param string $message  Human-readable error description.
     * @param int    $code     HTTP status code. 404, 400, 500 etc.
     */
    public static function error(string $message, int $code): never {
        // HTTP has a convention: 4xx = client error (bad request, not found),
        // 5xx = server error (database down, bug in code).
        // Sending the right code matters because browsers, proxies, and
        // OpenLayers all behave differently depending on the status code.
        self::send(['error' => $message, 'code' => $code], $code);
        // self:: refers to the current class, like "this." in JS but for
        // static methods. We call self::send() rather than repeating the
        // header/echo/exit logic here.
    }

    /**
     * Set CORS headers so the API can be called from other origins.
     * Called once at the top of index.php before any routing happens.
     */
    public static function setCORSHeaders(): void {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
}