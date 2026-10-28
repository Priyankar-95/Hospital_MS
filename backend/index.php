<?php
declare(strict_types=1);

/** API front controller. Every /api/* request lands here. */

require_once __DIR__ . '/core/bootstrap.php';

load_routes();

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $path);
