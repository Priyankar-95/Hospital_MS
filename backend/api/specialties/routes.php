<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/directory.php';

// Public: list of specialties (departments) for browsing, with how many bookable doctors each has.
// Optional ?state_id= / ?district_id= count only doctors in that place.
route('GET', '/api/specialties', function (): array {
    $v = new Validator($_GET);
    $state_id = $v->int('state_id', 1, PHP_INT_MAX, false);
    $district_id = $v->int('district_id', 1, PHP_INT_MAX, false);
    $v->fail_if_invalid();

    $where = VISIBLE_DOCTOR_SQL . ' AND d.specialty_id = s.id';
    $params = [];
    if ($state_id !== null)    { $where .= ' AND dist.state_id = ?'; $params[] = $state_id; }
    if ($district_id !== null) { $where .= ' AND d.district_id = ?'; $params[] = $district_id; }

    $from = 'FROM doctors d JOIN users u ON u.id = d.user_id JOIN districts dist ON dist.id = d.district_id LEFT JOIN hospitals h ON h.id = d.hospital_id';
    $rows = db_all(
        "SELECT s.id, s.name, s.slug, s.description,
                (SELECT COUNT(*) {$from} WHERE {$where}) AS doctor_count,
                (SELECT MIN(f.fee) {$from} JOIN doctor_fees f ON f.doctor_id = d.id AND f.is_active = 1 WHERE {$where}) AS fee_from
         FROM specialties s ORDER BY s.name",
        [...$params, ...$params]
    );
    return ['items' => array_map(fn (array $r): array => [
        'id'           => (int) $r['id'],
        'name'         => $r['name'],
        'slug'         => $r['slug'],
        'description'  => $r['description'],
        'doctor_count' => (int) $r['doctor_count'],
        'fee_from'     => $r['fee_from'],
    ], $rows)];
}, ['auth' => false]);
