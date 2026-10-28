<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/directory.php';
// Symptoms are public (the home page shows them). Everything about a doctor (search, compare, detail, availability, slots)
// needs a signed-in account: guests can only look at the home page.
// This folder loads after api/doctors, so "/api/doctors/me" is matched there first.
// Static paths (search, compare) are registered before "/api/doctors/{id}".

// Symptoms and the departments they point to (a plain list, no AI).
route('GET', '/api/symptoms', function (): array {
    $symptoms = db_all('SELECT id, name FROM symptoms ORDER BY name');
    $map = db_all('SELECT ss.symptom_id, sp.id, sp.name FROM symptom_specialties ss JOIN specialties sp ON sp.id = ss.specialty_id ORDER BY sp.name');
    $by_symptom = [];
    foreach ($map as $m) {
        $by_symptom[(int) $m['symptom_id']][] = ['id' => (int) $m['id'], 'name' => $m['name']];
    }
    return ['items' => array_map(fn (array $s): array => [
        'id'          => (int) $s['id'],
        'name'        => $s['name'],
        'specialties' => $by_symptom[(int) $s['id']] ?? [],
    ], $symptoms)];
}, ['auth' => false]);

route('GET', '/api/doctors/search', function (): array {
    $v = new Validator($_GET);
    $filters = [
        'specialty_id' => $v->int('specialty_id', 1, PHP_INT_MAX, false),
        'state_id'     => $v->int('state_id', 1, PHP_INT_MAX, false),
        'district_id'  => $v->int('district_id', 1, PHP_INT_MAX, false),
        'type'         => $v->enum('type', ['HOSPITAL', 'PRIVATE'], false),
        'q'            => $v->string('q', 1, 100, false),
        'sort'         => $v->enum('sort', ['soonest', 'fee_low', 'fee_high', 'name'], false) ?? 'soonest',
        'page'         => $v->int('page', 1, 100000, false) ?? 1,
        'per_page'     => $v->int('per_page', 1, DIRECTORY_MAX_PER_PAGE, false) ?? 10,
    ];
    $v->fail_if_invalid();
    return directory_search($filters);
});

// Side-by-side comparison: /api/doctors/compare?ids=3,5,9 (2 to 4 doctors, in the order given).
route('GET', '/api/doctors/compare', function (): array {
    $raw = $_GET['ids'] ?? '';
    $ids = is_string($raw) && preg_match('/^\d{1,18}(,\d{1,18})*$/', $raw) ? array_values(array_unique(array_map('intval', explode(',', $raw)))) : [];
    if (count($ids) < 2 || count($ids) > COMPARE_MAX_DOCTORS) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['ids' => 'Choose between 2 and ' . COMPARE_MAX_DOCTORS . ' doctors to compare.']);
    }
    $items = [];
    foreach ($ids as $id) {
        $row = visible_doctor($id);
        if ($row !== null) {
            $items[] = doctor_detail($row);
        }
    }
    return ['items' => $items, 'requested' => count($ids)];
});

/** The visible doctor named in the URL, or a 404 (same answer for unknown, unapproved and malformed ids). */
function public_doctor_from_url(): array
{
    $id = route_param('id');
    $row = ctype_digit($id) && strlen($id) < 19 ? visible_doctor((int) $id) : null;
    if ($row === null) {
        api_fail(404, 'NOT_FOUND', 'Doctor not found.');
    }
    return $row;
}

route('GET', '/api/doctors/{id}', function (): array {
    return ['doctor' => doctor_detail(public_doctor_from_url())];
});

route('GET', '/api/doctors/{id}/availability', function (): array {
    return doctor_availability(public_doctor_from_url());
});

route('GET', '/api/doctors/{id}/slots', function (): array {
    $doctor = public_doctor_from_url();
    $date = $_GET['date'] ?? '';
    $d = is_string($date) ? DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
    if (!$d || $d->format('Y-m-d') !== $date) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['date' => 'Enter a date as YYYY-MM-DD.']);
    }
    $result = doctor_slots_for_date($doctor, $date);
    if ($result === null) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['date' => 'Choose a date from today up to ' . (int) $doctor['advance_booking_days'] . ' days ahead.']);
    }
    return $result;
});
