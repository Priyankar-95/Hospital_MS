<?php
declare(strict_types=1);

// Public: states and districts for dropdowns and filters.
route('GET', '/api/locations/states', function (): array {
    return ['items' => db_all('SELECT id, state_name AS name FROM states ORDER BY state_name')];
}, ['auth' => false]);

route('GET', '/api/locations/districts', function (): array {
    $v = new Validator($_GET);
    $state_id = $v->int('state_id');
    $v->fail_if_invalid();
    return ['items' => db_all('SELECT id, district_name AS name FROM districts WHERE state_id = ? ORDER BY district_name', [$state_id])];
}, ['auth' => false]);
