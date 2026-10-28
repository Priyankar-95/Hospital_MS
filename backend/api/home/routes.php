<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/directory.php';

// Public data for the patient home page: verified hospitals and platform counts. Everything is counted live.

// Verified hospitals that have at least one bookable doctor. ?state_id= / ?district_id= narrow it; ?limit= (1-12, default 6).
route('GET', '/api/home/hospitals', function (): array {
    $v = new Validator($_GET);
    $state_id = $v->int('state_id', 1, PHP_INT_MAX, false);
    $district_id = $v->int('district_id', 1, PHP_INT_MAX, false);
    $limit = $v->int('limit', 1, 12, false) ?? 6;
    $v->fail_if_invalid();

    $where = "h.verification_status = 'APPROVED'";
    $params = [];
    if ($state_id !== null)    { $where .= ' AND dist.state_id = ?'; $params[] = $state_id; }
    if ($district_id !== null) { $where .= ' AND h.district_id = ?'; $params[] = $district_id; }

    $hospitals = db_all(
        "SELECT h.id, h.name, h.address, h.phone, h.facilities, h.total_beds, h.available_beds,
                dist.district_name AS district_name, st.state_name AS state_name
         FROM hospitals h
         JOIN districts dist ON dist.id = h.district_id
         JOIN states st ON st.id = dist.state_id
         WHERE {$where}
         ORDER BY h.name",
        $params
    );

    $out = [];
    foreach ($hospitals as $h) {
        // Only doctors a patient can actually book count (approved, active)
        $docs = db_all(
            "SELECT d.id, d.advance_booking_days, (SELECT MIN(f.fee) FROM doctor_fees f WHERE f.doctor_id = d.id AND f.is_active = 1) AS fee_from
             FROM doctors d JOIN users u ON u.id = d.user_id
             WHERE d.hospital_id = ? AND d.verification_status = 'APPROVED' AND u.status = 'ACTIVE'",
            [$h['id']]
        );
        if (!$docs) {
            continue;
        }
        $fee_from = null;
        $next = null;
        foreach ($docs as $d) {
            if ($d['fee_from'] !== null && ($fee_from === null || (float) $d['fee_from'] < (float) $fee_from)) {
                $fee_from = $d['fee_from'];
            }
            ensure_published((int) $d['id'], (int) $d['advance_booking_days']);
            $n = doctor_next_available((int) $d['id'], (int) $d['advance_booking_days']);
            if ($n !== null) {
                $key = $n['date'] . ' ' . ($n['slot_time'] ?? $n['start']);
                if ($next === null || $key < $next['key']) {
                    $next = ['key' => $key, 'date' => $n['date'], 'is_today' => $n['is_today'], 'time' => $n['slot_time'] ?? $n['start']];
                }
            }
        }
        $facilities = array_values(array_filter(array_map('trim', preg_split('/[,\n]+/', (string) $h['facilities']) ?: [])));
        $out[] = [
            'id'            => (int) $h['id'],
            'name'          => $h['name'],
            'address'       => $h['address'],
            'phone'         => $h['phone'],
            'district'      => $h['district_name'],
            'state'         => $h['state_name'],
            'doctor_count'  => count($docs),
            'fee_from'      => $fee_from,
            'total_beds'    => (int) $h['total_beds'],
            'facilities'    => array_slice($facilities, 0, 3),
            'next_available' => $next ? ['date' => $next['date'], 'is_today' => $next['is_today'], 'time' => $next['time']] : null,
            '_key'          => $next['key'] ?? '9999',
        ];
    }
    // Soonest available first, then by name
    usort($out, fn (array $a, array $b): int => [$a['_key'], $a['name']] <=> [$b['_key'], $b['name']]);
    $total = count($out);
    $out = array_map(function (array $h): array { unset($h['_key']); return $h; }, array_slice($out, 0, $limit));
    return ['items' => $out, 'total' => $total];
}, ['auth' => false]);

// Platform counts for the home page band.
// Platform counts for the home page band, with real growth over the last 30 days.
// Growth is counted from the real dates (doctor and hospital approval date, booking date), never made up:
// a chip is only shown when something really was added in the period.
route('GET', '/api/home/stats', function (): array {
    $visible = 'FROM doctors d JOIN users u ON u.id = d.user_id LEFT JOIN hospitals h ON h.id = d.hospital_id WHERE ' . VISIBLE_DOCTOR_SQL;
    $days = 30;
    $since = date('Y-m-d H:i:s', strtotime("-{$days} days"));

    $doctors = (int) db_value("SELECT COUNT(*) {$visible}");
    $hospitals = (int) db_value("SELECT COUNT(*) FROM hospitals WHERE verification_status = 'APPROVED'");
    $appointments = (int) db_value("SELECT COUNT(*) FROM appointments WHERE status <> 'CANCELLED'");

    $growth = function (int $total, int $new): array {
        $base = $total - $new; // how many there were before the period
        return ['new' => $new, 'percent' => ($new > 0 && $base > 0) ? (int) round($new / $base * 100) : null];
    };
    return [
        'doctors'      => $doctors,
        'hospitals'    => $hospitals,
        'districts'    => (int) db_value("SELECT COUNT(DISTINCT d.district_id) {$visible}"),
        'specialties'  => (int) db_value("SELECT COUNT(DISTINCT d.specialty_id) {$visible}"),
        'appointments' => $appointments,
        'growth_days'  => $days,
        'growth'       => [
            'doctors'      => $growth($doctors, (int) db_value("SELECT COUNT(*) {$visible} AND d.verified_at >= ?", [$since])),
            'hospitals'    => $growth($hospitals, (int) db_value("SELECT COUNT(*) FROM hospitals WHERE verification_status = 'APPROVED' AND verified_at >= ?", [$since])),
            'appointments' => $growth($appointments, (int) db_value("SELECT COUNT(*) FROM appointments WHERE status <> 'CANCELLED' AND created_at >= ?", [$since])),
        ],
    ];
}, ['auth' => false]);
