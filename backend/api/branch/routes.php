<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/doctors.php';
require_once __DIR__ . '/../../services/email.php';

// Branch Admin verification of doctors. A Branch Admin only ever sees doctors in their own districts.
// (Phase 1 minimal screen; hospitals, vendors, support and history arrive in Phase 2.)

/** Ids of the districts this Branch Admin covers. */
function branch_district_ids(int $branch_admin_id): array
{
    return array_map('intval', array_column(
        db_all('SELECT district_id FROM branch_admin_districts WHERE branch_admin_id = ?', [$branch_admin_id]),
        'district_id'
    ));
}

/** A doctor in the admin's districts, or a 404 (same answer for "missing" and "not yours"). */
function branch_find_doctor(int $doctor_id, int $branch_admin_id): array
{
    $doctor = db_one(
        'SELECT d.*, u.name AS doctor_name, u.email AS doctor_email, u.phone AS doctor_phone,
                s.name AS specialty_name, dist.district_name, st.state_name, st.id AS state_id
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         JOIN specialties s ON s.id = d.specialty_id
         JOIN districts dist ON dist.id = d.district_id
         JOIN states st ON st.id = dist.state_id
         JOIN branch_admin_districts bad ON bad.district_id = d.district_id AND bad.branch_admin_id = ?
         WHERE d.id = ?',
        [$branch_admin_id, $doctor_id]
    );
    if ($doctor === null) {
        api_fail(404, 'NOT_FOUND', 'Doctor not found.');
    }
    return $doctor;
}

function branch_doctor_summary(array $d): array
{
    return [
        'id'                  => (int) $d['id'],
        'name'                => $d['doctor_name'],
        'email'               => $d['doctor_email'],
        'phone'               => $d['doctor_phone'],
        'doctor_type'         => $d['doctor_type'],
        'verification_status' => $d['verification_status'],
        'rejection_reason'    => $d['rejection_reason'],
        'specialty'           => $d['specialty_name'],
        'district'            => $d['district_name'],
        'state'               => $d['state_name'],
        'qualifications'      => $d['qualifications'],
        'clinic_name'         => $d['clinic_name'],
        'address'             => $d['address'],
        'about'               => $d['about'],
        'submitted_at'        => $d['updated_at'],
        'verified_at'         => $d['verified_at'],
    ];
}

/**
 * Paging, search and district filter shared by the Branch Admin lists: ?page=1&per_page=10&q=text&district_id=5
 * Returns [page, per_page, q, district_id|null]. A district outside the admin's own districts is a 422.
 */
function branch_list_params(int $branch_admin_id): array
{
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $per_page = min(50, max(1, (int) ($_GET['per_page'] ?? 10)));
    $q = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100);
    $district_id = null;
    if (isset($_GET['district_id']) && $_GET['district_id'] !== '') {
        $district_id = (int) $_GET['district_id'];
        if (!in_array($district_id, branch_district_ids($branch_admin_id), true)) {
            api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['district_id' => 'Choose one of your own districts.']);
        }
    }
    return [$page, $per_page, $q, $district_id];
}

/** Escape % and _ so a search for "50%" is literal. */
function branch_like(string $q): string
{
    return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
}

function branch_pagination(int $page, int $per_page, int $total): array
{
    return ['page' => $page, 'per_page' => $per_page, 'total' => $total, 'pages' => max(1, (int) ceil($total / $per_page))];
}

route('GET', '/api/branch/doctors', function (): array {
    $admin = current_user();
    $status = $_GET['status'] ?? 'PENDING';
    if (!is_string($status) || !in_array($status, ['PENDING', 'APPROVED', 'REJECTED'], true)) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['status' => 'Invalid status.']);
    }
    [$page, $per_page, $q, $district_id] = branch_list_params((int) $admin['id']);

    $district_sql = $district_id !== null ? ' AND d.district_id = ' . $district_id : '';
    $search_sql = '';
    $search_args = [];
    if ($q !== '') {
        $search_sql = ' AND (u.name LIKE ? OR u.email LIKE ? OR s.name LIKE ?)';
        $like = branch_like($q);
        $search_args = [$like, $like, $like];
    }
    $from = 'FROM doctors d
         JOIN users u ON u.id = d.user_id
         JOIN specialties s ON s.id = d.specialty_id
         JOIN districts dist ON dist.id = d.district_id
         JOIN states st ON st.id = dist.state_id
         JOIN branch_admin_districts bad ON bad.district_id = d.district_id AND bad.branch_admin_id = ?
         WHERE d.verification_status = ?' . $district_sql . $search_sql;
    $args = array_merge([$admin['id'], $status], $search_args);

    $total = (int) db_value('SELECT COUNT(*) ' . $from, $args);
    $rows = db_all(
        'SELECT d.*, u.name AS doctor_name, u.email AS doctor_email, u.phone AS doctor_phone,
                s.name AS specialty_name, dist.district_name, st.state_name,
                (SELECT COUNT(*) FROM doctor_documents dd WHERE dd.doctor_id = d.id) AS document_count '
        . $from . ' ORDER BY d.updated_at ASC, d.id ASC LIMIT ' . $per_page . ' OFFSET ' . (($page - 1) * $per_page),
        $args
    );
    $counts = db_all(
        'SELECT d.verification_status AS status, COUNT(*) AS n
         FROM doctors d JOIN branch_admin_districts bad ON bad.district_id = d.district_id AND bad.branch_admin_id = ?
         WHERE d.verification_status IN (\'PENDING\', \'APPROVED\', \'REJECTED\')' . $district_sql . ' GROUP BY d.verification_status',
        [$admin['id']]
    );
    return [
        'items'      => array_map(fn (array $d): array => branch_doctor_summary($d) + ['document_count' => (int) $d['document_count']], $rows),
        'counts'     => array_merge(['PENDING' => 0, 'APPROVED' => 0, 'REJECTED' => 0], array_map('intval', array_column($counts, 'n', 'status'))),
        'pagination' => branch_pagination($page, $per_page, $total),
    ];
}, ['roles' => ['BRANCH_ADMIN']]);

// The Regional Overview: numbers for the admin's own districts, a row per district, and the oldest waiting items.
route('GET', '/api/branch/overview', function (): array {
    $admin = current_user();
    $ids = branch_district_ids((int) $admin['id']);
    if (!$ids) {
        return ['stats' => ['hospitals' => 0, 'hospitals_pending' => 0, 'invites_open' => 0, 'doctors' => 0, 'doctors_pending' => 0, 'bookings_month' => 0], 'districts' => [], 'waiting' => []];
    }
    $in = implode(',', $ids); // integers read from our own table

    $hosp = db_one("SELECT COALESCE(SUM(verification_status = 'APPROVED'), 0) AS ok, COALESCE(SUM(verification_status = 'PENDING'), 0) AS pending FROM hospitals WHERE district_id IN ($in)");
    $doc = db_one("SELECT COALESCE(SUM(verification_status = 'APPROVED'), 0) AS ok, COALESCE(SUM(verification_status = 'PENDING'), 0) AS pending FROM doctors WHERE district_id IN ($in)");
    $invites = (int) db_value("SELECT COUNT(*) FROM hospital_invites WHERE district_id IN ($in) AND status = 'INVITED' AND expires_at > NOW()");
    $bookings = (int) db_value(
        "SELECT COUNT(*) FROM appointments a JOIN doctors d ON d.id = a.doctor_id
         WHERE d.district_id IN ($in) AND a.status <> 'CANCELLED'
           AND a.slot_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND a.slot_time < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH"
    );

    $per = db_all(
        "SELECT dist.id, dist.district_name AS name, st.state_name AS state,
                (SELECT COUNT(*) FROM hospitals h WHERE h.district_id = dist.id AND h.verification_status = 'APPROVED') AS hospitals,
                (SELECT COUNT(*) FROM doctors d WHERE d.district_id = dist.id AND d.verification_status = 'APPROVED') AS doctors,
                (SELECT COUNT(*) FROM hospitals h WHERE h.district_id = dist.id AND h.verification_status = 'PENDING')
                  + (SELECT COUNT(*) FROM doctors d WHERE d.district_id = dist.id AND d.verification_status = 'PENDING') AS waiting
         FROM districts dist JOIN states st ON st.id = dist.state_id
         WHERE dist.id IN ($in) ORDER BY st.state_name, dist.district_name"
    );

    $waiting = db_all(
        "(SELECT 'HOSPITAL' AS kind, h.id, h.name, dist.district_name AS district, h.updated_at AS submitted_at
            FROM hospitals h JOIN districts dist ON dist.id = h.district_id WHERE h.district_id IN ($in) AND h.verification_status = 'PENDING')
         UNION ALL
         (SELECT 'DOCTOR', d.id, u.name, dist.district_name, d.updated_at
            FROM doctors d JOIN users u ON u.id = d.user_id JOIN districts dist ON dist.id = d.district_id WHERE d.district_id IN ($in) AND d.verification_status = 'PENDING')
         ORDER BY submitted_at ASC LIMIT 6"
    );

    return [
        'stats' => [
            'hospitals' => (int) $hosp['ok'], 'hospitals_pending' => (int) $hosp['pending'], 'invites_open' => $invites,
            'doctors' => (int) $doc['ok'], 'doctors_pending' => (int) $doc['pending'], 'bookings_month' => $bookings,
        ],
        'districts' => array_map(fn (array $r): array => ['id' => (int) $r['id'], 'name' => $r['name'], 'state' => $r['state'], 'hospitals' => (int) $r['hospitals'], 'doctors' => (int) $r['doctors'], 'waiting' => (int) $r['waiting']], $per),
        'waiting'   => array_map(fn (array $r): array => ['kind' => $r['kind'], 'id' => (int) $r['id'], 'name' => $r['name'], 'district' => $r['district'], 'submitted_at' => $r['submitted_at']], $waiting),
    ];
}, ['roles' => ['BRANCH_ADMIN']]);

route('GET', '/api/branch/doctors/{id}', function (): array {
    $doctor = branch_find_doctor((int) route_param('id'), (int) current_user()['id']);
    return ['doctor' => branch_doctor_summary($doctor) + ['documents' => doctor_documents((int) $doctor['id'])]];
}, ['roles' => ['BRANCH_ADMIN']]);

route('POST', '/api/branch/doctors/{id}/approve', function (): array {
    $admin = current_user();
    $doctor = branch_find_doctor((int) route_param('id'), (int) $admin['id']);

    // The WHERE clause makes this safe if two reviewers click at once: only one UPDATE can match.
    $stmt = db_query(
        "UPDATE doctors SET verification_status = 'APPROVED', rejection_reason = NULL, verified_by = ?, verified_at = NOW()
         WHERE id = ? AND verification_status = 'PENDING'",
        [$admin['id'], $doctor['id']]
    );
    if ($stmt->rowCount() === 0) {
        api_fail(409, 'NOT_PENDING', 'This application is no longer waiting for review.');
    }

    $emailed = send_email($doctor['doctor_email'], 'doctor_approved', [
        'name'      => $doctor['doctor_name'],
        'login_url' => config('app.url') . '/frontend/doctor/dashboard.html',
    ]);
    return ['doctor_id' => (int) $doctor['id'], 'verification_status' => 'APPROVED', 'email_sent' => $emailed];
}, ['roles' => ['BRANCH_ADMIN']]);

route('POST', '/api/branch/doctors/{id}/reject', function (): array {
    $admin = current_user();
    $v = new Validator(request_body());
    $reason = $v->string('reason', 5, 500);
    $v->fail_if_invalid();

    $doctor = branch_find_doctor((int) route_param('id'), (int) $admin['id']);
    $stmt = db_query(
        "UPDATE doctors SET verification_status = 'REJECTED', rejection_reason = ?, verified_by = ?, verified_at = NOW()
         WHERE id = ? AND verification_status = 'PENDING'",
        [$reason, $admin['id'], $doctor['id']]
    );
    if ($stmt->rowCount() === 0) {
        api_fail(409, 'NOT_PENDING', 'This application is no longer waiting for review.');
    }

    $emailed = send_email($doctor['doctor_email'], 'doctor_rejected', [
        'name'      => $doctor['doctor_name'],
        'reason'    => $reason,
        'login_url' => config('app.url') . '/frontend/doctor/dashboard.html',
    ]);
    return ['doctor_id' => (int) $doctor['id'], 'verification_status' => 'REJECTED', 'email_sent' => $emailed];
}, ['roles' => ['BRANCH_ADMIN']]);
