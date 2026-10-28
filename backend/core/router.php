<?php
declare(strict_types=1);

/**
 * Tiny router. Routes are registered per resource in backend/api/<resource>/routes.php:
 *   route('POST', '/api/auth/login', fn () => ..., ['auth' => false]);
 * Path params: '/api/doctors/{id}' -> available via route_param('id').
 * Options: 'auth' (bool, default true), 'roles' (array of allowed roles; empty = any logged-in user),
 * 'csrf' (bool, default true; only false for server-to-server callbacks).
 * A handler may return data (sent as success JSON) or call json_success()/redirect() itself.
 */

$GLOBALS['__routes'] = [];
$GLOBALS['__route_params'] = [];

function route(string $method, string $path, callable $handler, array $options = []): void
{
    $pattern = '#^' . preg_replace('#\{([a-z_]+)\}#', '(?P<$1>[^/]+)', $path) . '$#';
    $GLOBALS['__routes'][] = [
        'method'  => strtoupper($method),
        'pattern' => $pattern,
        'handler' => $handler,
        'options' => $options + ['auth' => true, 'roles' => [], 'csrf' => true],
    ];
}

function route_param(string $name): string
{
    return (string) ($GLOBALS['__route_params'][$name] ?? '');
}

function load_routes(): void
{
    foreach (glob(__DIR__ . '/../api/*/routes.php') ?: [] as $file) {
        require $file;
    }
}

function dispatch(string $method, string $path): never
{
    $method = strtoupper($method);
    $path = '/' . trim($path, '/');
    $path_matched = false;

    foreach ($GLOBALS['__routes'] as $r) {
        if (!preg_match($r['pattern'], $path, $m)) {
            continue;
        }
        $path_matched = true;
        if ($r['method'] !== $method) {
            continue;
        }

        $GLOBALS['__route_params'] = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);

        if ($r['options']['auth']) {
            require_login();
            if ($r['options']['roles']) {
                require_role(...$r['options']['roles']);
            }
        }
        // Every state-changing request needs a CSRF token, logged in or not (login/register too).
        // Only server-to-server callbacks such as the Razorpay webhook opt out with 'csrf' => false.
        if ($r['options']['csrf'] && !in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            require_csrf();
        }

        $result = ($r['handler'])();
        json_success($result);
    }

    if ($path_matched) {
        json_error(405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this endpoint.');
    }
    json_error(404, 'NOT_FOUND', 'Endpoint not found.');
}
