<?php
declare(strict_types=1);

/**
 * Dev router for PHP's built-in server:  php -S localhost:8000 router.php
 *  /api/*       -> backend/index.php
 *  /            -> frontend/patient/index.html
 *  /frontend/*  -> static files
 * Everything else (.env, backend/, database/, vendor/, uploads/, docs/) is NOT served.
 */

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($path === '/api' || str_starts_with($path, '/api/')) {
    require __DIR__ . '/backend/index.php';
    return true;
}

if ($path === '/') {
    $path = '/frontend/patient/index.html';
}

if (str_starts_with($path, '/frontend/')) {
    $file = realpath(__DIR__ . $path);
    $base = realpath(__DIR__ . '/frontend');
    if ($file !== false && $base !== false && str_starts_with($file, $base . DIRECTORY_SEPARATOR) && is_file($file)) {
        $types = [
            'html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8',
            'js' => 'application/javascript; charset=utf-8', 'json' => 'application/json',
            'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'ico' => 'image/x-icon',
            'woff2' => 'font/woff2',
        ];
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (isset($types[$ext])) {
            header('Content-Type: ' . $types[$ext]);
            header('X-Content-Type-Options: nosniff');
            readfile($file);
            return true;
        }
    }
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Not found';
return true;
