<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/hospitals.php';

// The Hospital Admin portal (Phase 2, step 2): overview, departments, beds, facilities and profile.
// Everything here needs an APPROVED hospital and only ever touches the signed-in admin's own hospital.

const FACILITY_OPTIONS = [
    '24x7 Emergency', 'ICU', 'NICU', 'Operation Theatre', 'Pharmacy', 'Laboratory', 'X-Ray', 'MRI / CT Scan',
    'Ambulance', 'Blood Bank', 'Dialysis', 'Parking', 'Cafeteria', 'Wheelchair Access',
];
const MAX_FACILITIES = 25;
const MAX_BEDS = 100000;

/** The facilities text ("ICU, Pharmacy") as a clean list. */
function facilities_list(?string $text): array
{
    $out = [];
    foreach (preg_split('/[,\n]+/', (string) $text) ?: [] as $f) {
        $f = trim($f);
        if ($f !== '' && !in_array(mb_strtolower($f), array_map('mb_strtolower', $out), true)) {
            $out[] = $f;
        }
    }
    return $out;
}

/** Name and place for the portal's top bar (sent with each page's data so the page needs no extra call). */
function hospital_brief(array $h): array
{
    return ['name' => $h['name'], 'district' => $h['district_name'], 'state' => $h['state_name']];
}

function bed_summary(array $h): array
{
    $total = (int) $h['total_beds'];
    $available = (int) $h['available_beds'];
    $occupied = max(0, $total - $available);
    return [
        'total_beds'        => $total,
        'available_beds'    => $available,
        'occupied_beds'     => $occupied,
        'occupancy_percent' => $total > 0 ? (int) round($occupied / $total * 100) : 0,
    ];
}

/** Departments with their bed capacity and how many approved doctors work in each. One query, no per-row lookups. */
function department_rows(int $hospital_id): array
{
    return array_map(fn (array $r): array => [
        'id'           => (int) $r['id'],
        'specialty_id' => (int) $r['specialty_id'],
        'name'         => $r['name'],
        'bed_count'    => (int) $r['bed_count'],
        'doctor_count' => (int) $r['doctor_count'],
    ], db_all(
        "SELECT hd.id, hd.specialty_id, s.name, hd.bed_count,
                (SELECT COUNT(*) FROM doctors d WHERE d.hospital_id = hd.hospital_id AND d.specialty_id = hd.specialty_id AND d.verification_status = 'APPROVED') AS doctor_count
         FROM hospital_departments hd JOIN specialties s ON s.id = hd.specialty_id
         WHERE hd.hospital_id = ? ORDER BY s.name",
        [$hospital_id]
    ));
}

function find_department(int $id, int $hospital_id): array
{
    $row = db_one('SELECT * FROM hospital_departments WHERE id = ? AND hospital_id = ?', [$id, $hospital_id]);
    if ($row === null) {
        api_fail(404, 'NOT_FOUND', 'Department not found.'); // same answer for "missing" and "another hospital's"
    }
    return $row;
}

function bed_count_input(Validator $v, string $field = 'bed_count'): ?int
{
    return $v->int($field, 0, MAX_BEDS);
}

// ---- overview: everything the dashboard needs in ONE call ------------------------------------------

route('GET', '/api/hospitals/me/overview', function (): array {
    $h = require_approved_hospital();
    $id = (int) $h['id'];

    $doctors = db_one(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(verification_status = 'APPROVED'), 0) AS approved,
                COALESCE(SUM(verification_status = 'PENDING'), 0) AS pending
         FROM doctors WHERE hospital_id = ?",
        [$id]
    );
    $invited = (int) db_value("SELECT COUNT(*) FROM doctor_invites WHERE hospital_id = ? AND status = 'INVITED' AND expires_at > NOW()", [$id]);
    $dept = db_one('SELECT COUNT(*) AS n, COALESCE(SUM(bed_count), 0) AS beds FROM hospital_departments WHERE hospital_id = ?', [$id]);
    $today = (int) db_value(
        "SELECT COUNT(*) FROM appointments a JOIN doctors d ON d.id = a.doctor_id
         WHERE d.hospital_id = ? AND a.slot_time >= CURDATE() AND a.slot_time < CURDATE() + INTERVAL 1 DAY AND a.status <> 'CANCELLED'",
        [$id]
    );
    $upcoming = (int) db_value(
        "SELECT COUNT(*) FROM appointments a JOIN doctors d ON d.id = a.doctor_id
         WHERE d.hospital_id = ? AND a.slot_time >= CURDATE() AND a.status = 'BOOKED'",
        [$id]
    );
    return [
        'hospital'    => ['name' => $h['name'], 'district' => $h['district_name'], 'state' => $h['state_name'], 'verified_at' => $h['verified_at']],
        'doctors'     => ['total' => (int) $doctors['total'], 'approved' => (int) $doctors['approved'], 'pending' => (int) $doctors['pending'], 'invited' => $invited],
        'departments' => ['count' => (int) $dept['n'], 'beds_assigned' => (int) $dept['beds'], 'list' => department_rows($id)],
        'beds'        => bed_summary($h),
        'facilities'  => facilities_list($h['facilities']),
        'bookings'    => ['today' => $today, 'upcoming' => $upcoming],
    ];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// ---- departments ---------------------------------------------------------------------------------------

route('GET', '/api/hospitals/me/departments', function (): array {
    $h = require_approved_hospital();
    $rows = department_rows((int) $h['id']);
    $taken = array_column($rows, 'specialty_id');
    $available = array_values(array_filter(
        db_all('SELECT id, name FROM specialties ORDER BY name'),
        fn (array $s): bool => !in_array((int) $s['id'], $taken, true)
    ));
    return [
        'hospital'             => hospital_brief($h),
        'departments'          => $rows,
        'available_specialties' => array_map(fn (array $s): array => ['id' => (int) $s['id'], 'name' => $s['name']], $available),
        'beds'                 => bed_summary($h) + ['beds_assigned' => array_sum(array_column($rows, 'bed_count'))],
    ];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// { specialty_id, bed_count? }
route('POST', '/api/hospitals/me/departments', function (): array {
    $h = require_approved_hospital();
    $v = new Validator(request_body());
    $specialty_id = $v->int('specialty_id', 1, PHP_INT_MAX);
    $beds = $v->int('bed_count', 0, MAX_BEDS, false) ?? 0;
    $v->fail_if_invalid();
    if (db_value('SELECT 1 FROM specialties WHERE id = ?', [$specialty_id]) === null) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['specialty_id' => 'Choose a department from the list.']);
    }
    if (db_value('SELECT 1 FROM hospital_departments WHERE hospital_id = ? AND specialty_id = ?', [$h['id'], $specialty_id]) !== null) {
        api_fail(409, 'DEPARTMENT_EXISTS', 'This department is already added.');
    }
    db_query('INSERT INTO hospital_departments (hospital_id, specialty_id, bed_count) VALUES (?, ?, ?)', [$h['id'], $specialty_id, $beds]);
    return ['departments' => department_rows((int) $h['id'])];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// { bed_count }
route('PATCH', '/api/hospitals/me/departments/{id}', function (): array {
    $h = require_approved_hospital();
    $dept = find_department((int) route_param('id'), (int) $h['id']);
    $v = new Validator(request_body());
    $beds = bed_count_input($v);
    $v->fail_if_invalid();
    db_query('UPDATE hospital_departments SET bed_count = ? WHERE id = ?', [$beds, $dept['id']]);
    return ['departments' => department_rows((int) $h['id'])];
}, ['roles' => ['HOSPITAL_ADMIN']]);

route('DELETE', '/api/hospitals/me/departments/{id}', function (): array {
    $h = require_approved_hospital();
    $dept = find_department((int) route_param('id'), (int) $h['id']);
    db_query('DELETE FROM hospital_departments WHERE id = ?', [$dept['id']]);
    return ['departments' => department_rows((int) $h['id'])];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// ---- beds ----------------------------------------------------------------------------------------------

route('GET', '/api/hospitals/me/beds', function (): array {
    $h = require_approved_hospital();
    $rows = department_rows((int) $h['id']);
    return ['hospital' => hospital_brief($h), 'beds' => bed_summary($h) + ['beds_assigned' => array_sum(array_column($rows, 'bed_count'))], 'departments' => $rows];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// { total_beds, available_beds }  (available can never be more than total)
route('PUT', '/api/hospitals/me/beds', function (): array {
    $h = require_approved_hospital();
    $v = new Validator(request_body());
    $total = $v->int('total_beds', 0, MAX_BEDS);
    $available = $v->int('available_beds', 0, MAX_BEDS);
    $v->fail_if_invalid();
    if ($available > $total) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['available_beds' => 'Available beds cannot be more than the total beds.']);
    }
    db_query('UPDATE hospitals SET total_beds = ?, available_beds = ? WHERE id = ?', [$total, $available, $h['id']]);
    return ['beds' => bed_summary(['total_beds' => $total, 'available_beds' => $available])];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// ---- facilities ----------------------------------------------------------------------------------------

route('GET', '/api/hospitals/me/facilities', function (): array {
    $h = require_approved_hospital();
    return ['hospital' => hospital_brief($h), 'options' => FACILITY_OPTIONS, 'selected' => facilities_list($h['facilities'])];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// { facilities: ["ICU", "Pharmacy", "Any other text"] }
route('PUT', '/api/hospitals/me/facilities', function (): array {
    $h = require_approved_hospital();
    $body = request_body();
    $list = $body['facilities'] ?? null;
    if (!is_array($list)) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['facilities' => 'Send the facilities as a list.']);
    }
    $clean = [];
    foreach ($list as $item) {
        if (!is_string($item)) {
            api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['facilities' => 'Each facility must be text.']);
        }
        // a comma would split the stored list, so it becomes a space; then extra spaces are squeezed to one
        $item = trim(preg_replace('/\s+/', ' ', preg_replace('/[,\n\r]+/', ' ', $item) ?? '') ?? '');
        if ($item === '') {
            continue;
        }
        if (mb_strlen($item) < 2 || mb_strlen($item) > 60) {
            api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['facilities' => 'Each facility must be 2 to 60 characters.']);
        }
        if (!in_array(mb_strtolower($item), array_map('mb_strtolower', $clean), true)) {
            $clean[] = $item;
        }
    }
    if (count($clean) > MAX_FACILITIES) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['facilities' => 'You can list at most ' . MAX_FACILITIES . ' facilities.']);
    }
    db_query('UPDATE hospitals SET facilities = ? WHERE id = ?', [$clean ? implode(', ', $clean) : null, $h['id']]);
    return ['selected' => $clean];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// ---- profile (the name and district were verified by the Branch Admin, so they are locked) ----------------

// { address, phone?, email? }
route('PUT', '/api/hospitals/me', function (): array {
    $h = require_approved_hospital();
    $v = new Validator(request_body());
    $address = $v->string('address', 5, 500);
    $phone = $v->phone('phone');
    $email = $v->string('email', 3, 190, false);
    if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $v->add_error('email', 'Enter a valid email address.');
    }
    $v->fail_if_invalid();
    db_query('UPDATE hospitals SET address = ?, phone = ?, email = ? WHERE id = ?', [$address, $phone, $email !== null ? strtolower($email) : null, $h['id']]);
    return ['hospital' => hospital_self_payload(hospital_for_user((int) $h['admin_user_id']))];
}, ['roles' => ['HOSPITAL_ADMIN']]);
