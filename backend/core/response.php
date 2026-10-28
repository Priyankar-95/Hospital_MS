<?php
declare(strict_types=1);

/**
 * One response shape for the whole API:
 * { "success": bool, "data": ..., "error": { "code": "...", "message": "..." } }
 */

class ApiException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $error_code,
        string $message,
        public readonly array $details = []
    ) {
        parent::__construct($message);
    }
}

function send_json(int $status, array $payload): never
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

function json_success(mixed $data = null, int $status = 200): never
{
    send_json($status, ['success' => true, 'data' => $data, 'error' => null]);
}

function json_error(int $status, string $code, string $message, array $details = []): never
{
    $error = ['code' => $code, 'message' => $message];
    if ($details) {
        $error['details'] = $details;
    }
    send_json($status, ['success' => false, 'data' => null, 'error' => $error]);
}

/** Throw from anywhere inside a handler; the router turns it into the JSON error shape. */
function api_fail(int $status, string $code, string $message, array $details = []): never
{
    throw new ApiException($status, $code, $message, $details);
}
