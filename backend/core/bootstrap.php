<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/router.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/rbac.php';

date_default_timezone_set('Asia/Kolkata');
load_env();
session_boot();

/** Send the browser to another URL (used by the Google OAuth flow). */
function redirect_to(string $url): never
{
    header('Location: ' . $url, true, 302);
    exit;
}

$debug = config('app.debug');
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', project_root() . '/storage/logs/php-error.log');

set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

function handle_uncaught(Throwable $e): never
{
    if ($e instanceof ApiException) {
        json_error($e->status, $e->error_code, $e->getMessage(), $e->details);
    }
    error_log(sprintf("[%s] %s in %s:%d\n%s", get_class($e), $e->getMessage(), $e->getFile(), $e->getLine(), $e->getTraceAsString()));
    $message = config('app.debug') ? get_class($e) . ': ' . $e->getMessage() : 'Something went wrong. Please try again.';
    json_error(500, 'SERVER_ERROR', $message);
}
set_exception_handler('handle_uncaught');
