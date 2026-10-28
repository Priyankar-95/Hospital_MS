<?php
declare(strict_types=1);

route('GET', '/api/health', function (): array {
    $db_ok = false;
    try {
        $db_ok = db_value('SELECT 1') === 1;
    } catch (Throwable $e) {
        $db_ok = false;
    }
    return [
        'status' => $db_ok ? 'ok' : 'degraded',
        'app'    => config('app.name'),
        'db'     => $db_ok,
        'time'   => date('c'),
    ];
}, ['auth' => false]);
