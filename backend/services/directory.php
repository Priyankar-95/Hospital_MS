<?php
declare(strict_types=1);

require_once __DIR__ . '/schedule.php';
require_once __DIR__ . '/doctors.php'; // doctor_photo_url()

/**
 * Public doctor directory used by patients: search, details, comparison and availability.
 *
 * Who is listed: APPROVED doctors whose account is active; hospital doctors only while their hospital is APPROVED.
 *
 * Availability rules (one place, used by every public endpoint and later by booking):
 *  - A day/window is OPEN while it is not closed, still has room, and has not ended.
 *  - COUNT windows can be booked until the window ends; patients get the next serial number.
 *  - SLOTS windows: a slot can be booked until its start time; each slot holds one patient.
 *  - A slot is taken when a non-cancelled appointment exists for it.
 */

const DIRECTORY_MAX_PER_PAGE = 24;
const COMPARE_MAX_DOCTORS = 4;

/** SQL fragment: which doctors patients may see. Needs aliases d (doctors), u (users), h (hospitals, LEFT JOIN). */
const VISIBLE_DOCTOR_SQL = "d.verification_status = 'APPROVED' AND u.status = 'ACTIVE' AND (d.hospital_id IS NULL OR h.verification_status = 'APPROVED')";

const DOCTOR_CARD_SELECT = "d.id, d.user_id, u.name, d.doctor_type, d.qualifications, d.about, d.clinic_name, d.address, d.facilities, d.photo_url,
        d.advance_booking_days, d.district_id, dist.district_name, st.id AS state_id, st.state_name,
        s.id AS specialty_id, s.name AS specialty_name,
        h.id AS hospital_id, h.name AS hospital_name, h.address AS hospital_address, h.phone AS hospital_phone,
        h.facilities AS hospital_facilities,
        (SELECT MIN(f.fee) FROM doctor_fees f WHERE f.doctor_id = d.id AND f.is_active = 1) AS fee_from";

const DOCTOR_CARD_FROM = "FROM doctors d
        JOIN users u ON u.id = d.user_id
        JOIN specialties s ON s.id = d.specialty_id
        JOIN districts dist ON dist.id = d.district_id
        JOIN states st ON st.id = dist.state_id
        LEFT JOIN hospitals h ON h.id = d.hospital_id";

/** Make sure the next N days exist for a doctor who has weekly hours (cheap check first). */
function ensure_published(int $doctor_id, int $advance_days): void
{
    $latest = db_value('SELECT MAX(work_date) FROM doctor_schedules WHERE doctor_id = ?', [$doctor_id]);
    $target = date('Y-m-d', strtotime("+{$advance_days} days"));
    if ($latest === null || $latest < $target) {
        if (db_value('SELECT 1 FROM doctor_weekly_hours WHERE doctor_id = ? LIMIT 1', [$doctor_id]) !== null) {
            publish_schedule($doctor_id);
        }
    }
}

/** @return array<int, array<int,string>> schedule_id => taken 'HH:MM' slot times */
function taken_slots_for(array $schedule_ids): array
{
    if (!$schedule_ids) {
        return [];
    }
    $marks = implode(',', array_fill(0, count($schedule_ids), '?'));
    $rows = db_all(
        "SELECT schedule_id, DATE_FORMAT(slot_time, '%H:%i') AS t FROM appointments WHERE schedule_id IN ({$marks}) AND status <> 'CANCELLED'",
        array_values($schedule_ids)
    );
    $taken = [];
    foreach ($rows as $r) {
        $taken[(int) $r['schedule_id']][] = $r['t'];
    }
    return $taken;
}

/**
 * Everything a patient needs to know about one dated window.
 * @param array $r        a doctor_schedules row
 * @param array $taken    'HH:MM' slot times already booked in this window
 */
/** @return array<int,int> schedule_id => highest serial number ever handed out (cancelled ones included: numbers are never reused) */
function max_tokens_for(array $schedule_ids): array
{
    if (!$schedule_ids) {
        return [];
    }
    $marks = implode(',', array_fill(0, count($schedule_ids), '?'));
    $rows = db_all("SELECT schedule_id, MAX(token_number) AS m FROM appointments WHERE schedule_id IN ({$marks}) GROUP BY schedule_id", array_values($schedule_ids));
    return array_column(array_map(fn (array $r): array => [(int) $r['schedule_id'], (int) $r['m']], $rows), 1, 0);
}

function window_view(array $r, string $today, string $now_time, array $taken, bool $with_slots, int $max_token = 0): array
{
    $max = (int) $r['max_patients'];
    $booked = (int) $r['booked_count'];
    $is_today = $r['work_date'] === $today;
    $ended = $is_today && $r['end_time'] <= $now_time;

    $view = [
        'schedule_id'  => (int) $r['id'],
        'start'        => substr($r['start_time'], 0, 5),
        'end'          => substr($r['end_time'], 0, 5),
        'mode'         => $r['booking_mode'],
        'slot_minutes' => $r['slot_minutes'] !== null ? (int) $r['slot_minutes'] : null,
        'max_patients' => $max,
        'booked_count' => $booked,
        'remaining'    => 0,
        'status'       => 'OPEN',
    ];

    if ((int) $r['is_closed'] === 1) {
        $view['status'] = 'CLOSED';
    } elseif ($ended) {
        $view['status'] = 'ENDED';
    } elseif ($r['booking_mode'] === 'COUNT') {
        $view['remaining'] = max(0, $max - $booked);
        $view['status'] = $view['remaining'] > 0 ? 'OPEN' : 'FULL';
        if ($view['remaining'] > 0) {
            // The same number create_booking() will hand out: one more than the highest used so far
            $view['next_serial'] = $max_token + 1;
        }
    } else {
        $slots = [];
        $start = time_to_minutes($r['start_time']) ?? 0;
        $step = (int) $r['slot_minutes'];
        $available = 0;
        for ($i = 0; $i < $max; $i++) {
            $time = minutes_to_hhmm($start + $i * $step);
            $is_taken = in_array($time, $taken, true);
            $is_past = $is_today && ($time . ':00') <= $now_time;
            $ok = !$is_taken && !$is_past;
            $available += $ok ? 1 : 0;
            $slots[] = ['time' => $time, 'available' => $ok, 'reason' => $ok ? null : ($is_taken ? 'TAKEN' : 'PAST')];
        }
        $view['remaining'] = $available;
        // FULL = every slot booked; ENDED = what is left has already passed
        $view['status'] = $available > 0 ? 'OPEN' : ($booked >= $max ? 'FULL' : 'ENDED');
        if ($with_slots) {
            $view['slots'] = $slots;
        }
        $view['next_slot'] = null;
        foreach ($slots as $s) {
            if ($s['available']) {
                $view['next_slot'] = $s['time'];
                break;
            }
        }
    }
    return $view;
}

/** The earliest bookable window or slot for a doctor, or null. */
function doctor_next_available(int $doctor_id, int $advance_days): ?array
{
    $today = date('Y-m-d');
    $now = date('H:i:s');
    $rows = db_all(
        'SELECT * FROM doctor_schedules
         WHERE doctor_id = ? AND work_date BETWEEN ? AND ? AND is_closed = 0 AND booked_count < max_patients
         ORDER BY work_date, start_time LIMIT 40',
        [$doctor_id, $today, date('Y-m-d', strtotime("+{$advance_days} days"))]
    );
    $taken = taken_slots_for(array_map(fn (array $r): int => (int) $r['id'], array_filter($rows, fn (array $r): bool => $r['booking_mode'] === 'SLOTS')));
    $tokens = max_tokens_for(array_map(fn (array $r): int => (int) $r['id'], array_filter($rows, fn (array $r): bool => $r['booking_mode'] === 'COUNT')));
    foreach ($rows as $r) {
        $w = window_view($r, $today, $now, $taken[(int) $r['id']] ?? [], false, $tokens[(int) $r['id']] ?? 0);
        if ($w['status'] !== 'OPEN') {
            continue;
        }
        return [
            'date'        => $r['work_date'],
            'is_today'    => $r['work_date'] === $today,
            'mode'        => $w['mode'],
            'start'       => $w['start'],
            'end'         => $w['end'],
            'slot_time'   => $w['next_slot'] ?? null,
            'remaining'   => $w['remaining'],
            'schedule_id' => $w['schedule_id'],
        ];
    }
    return null;
}

function doctor_place(array $r): array
{
    return $r['hospital_id']
        ? ['name' => $r['hospital_name'], 'address' => $r['hospital_address'], 'kind' => 'HOSPITAL']
        : ['name' => $r['clinic_name'], 'address' => $r['address'], 'kind' => 'CHAMBER'];
}

function doctor_card(array $r, bool $with_next = true): array
{
    if ($with_next) {
        ensure_published((int) $r['id'], (int) $r['advance_booking_days']);
    }
    return [
        'id'             => (int) $r['id'],
        'name'           => $r['name'],
        'photo_url'      => doctor_photo_url($r),
        'doctor_type'    => $r['doctor_type'],
        'specialty'      => ['id' => (int) $r['specialty_id'], 'name' => $r['specialty_name']],
        'qualifications' => $r['qualifications'],
        'location'       => ['district_id' => (int) $r['district_id'], 'district' => $r['district_name'], 'state_id' => (int) $r['state_id'], 'state' => $r['state_name']],
        'place'          => doctor_place($r),
        'fee_from'       => $r['fee_from'],
        'next_available' => $with_next ? doctor_next_available((int) $r['id'], (int) $r['advance_booking_days']) : null,
    ];
}

/** Escape % and _ so patient text is matched literally in LIKE. */
function like_term(string $text): string
{
    return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $text) . '%';
}

/**
 * @param array{specialty_id:?int,state_id:?int,district_id:?int,type:?string,q:?string,sort:string,page:int,per_page:int} $f
 * @return array{items:array,total:int,page:int,per_page:int,pages:int}
 */
function directory_search(array $f): array
{
    $where = [VISIBLE_DOCTOR_SQL];
    $params = [];
    if ($f['specialty_id'] !== null) { $where[] = 'd.specialty_id = ?'; $params[] = $f['specialty_id']; }
    if ($f['state_id'] !== null)     { $where[] = 'dist.state_id = ?';  $params[] = $f['state_id']; }
    if ($f['district_id'] !== null)  { $where[] = 'd.district_id = ?';  $params[] = $f['district_id']; }
    if ($f['type'] !== null)         { $where[] = 'd.doctor_type = ?';  $params[] = $f['type']; }
    if ($f['q'] !== null && $f['q'] !== '') {
        $where[] = "(u.name LIKE ? OR d.clinic_name LIKE ? OR h.name LIKE ? OR d.qualifications LIKE ? OR s.name LIKE ?)";
        $like = like_term($f['q']);
        array_push($params, $like, $like, $like, $like, $like);
    }
    $where_sql = implode(' AND ', $where);

    $total = (int) db_value('SELECT COUNT(*) ' . DOCTOR_CARD_FROM . " WHERE {$where_sql}", $params);

    $today = date('Y-m-d');
    $now = date('H:i:s');
    // Soonest first: earliest open window that has not ended (an approximation of the exact next slot, which is worked out per page)
    $next_key = "(SELECT MIN(CONCAT(sc.work_date, ' ', sc.start_time)) FROM doctor_schedules sc
                  WHERE sc.doctor_id = d.id AND sc.is_closed = 0 AND sc.booked_count < sc.max_patients
                    AND sc.work_date BETWEEN '{$today}' AND DATE_ADD('{$today}', INTERVAL d.advance_booking_days DAY)
                    AND (sc.work_date > '{$today}' OR sc.end_time > '{$now}'))";
    $order = match ($f['sort']) {
        'fee_low'  => 'fee_from IS NULL, fee_from ASC, u.name ASC',
        'fee_high' => 'fee_from IS NULL, fee_from DESC, u.name ASC',
        'name'     => 'u.name ASC',
        default    => "{$next_key} IS NULL, {$next_key} ASC, u.name ASC",
    };

    $per_page = $f['per_page'];
    $pages = max(1, (int) ceil($total / $per_page));
    $page = min($f['page'], $pages);
    $rows = db_all(
        'SELECT ' . DOCTOR_CARD_SELECT . ' ' . DOCTOR_CARD_FROM . " WHERE {$where_sql} ORDER BY {$order} LIMIT {$per_page} OFFSET " . (($page - 1) * $per_page),
        $params
    );
    return ['items' => array_map('doctor_card', $rows), 'total' => $total, 'page' => $page, 'per_page' => $per_page, 'pages' => $pages];
}

/** One visible doctor row (full card columns) or null. */
function visible_doctor(int $id): ?array
{
    return db_one(
        'SELECT ' . DOCTOR_CARD_SELECT . ' ' . DOCTOR_CARD_FROM . ' WHERE d.id = ? AND ' . VISIBLE_DOCTOR_SQL,
        [$id]
    );
}

function active_fees(int $doctor_id): array
{
    return array_map(fn (array $f): array => ['id' => (int) $f['id'], 'treatment_name' => $f['treatment_name'], 'fee' => $f['fee']], db_all(
        'SELECT id, treatment_name, fee FROM doctor_fees WHERE doctor_id = ? AND is_active = 1 ORDER BY fee, treatment_name',
        [$doctor_id]
    ));
}

/** The facilities text patients see: the hospital's for hospital doctors, the chamber's for private doctors. */
function doctor_facilities(array $r): ?string
{
    return $r['hospital_id'] ? $r['hospital_facilities'] : $r['facilities'];
}

function doctor_detail(array $r): array
{
    $card = doctor_card($r);
    return $card + [
        'about'                => $r['about'],
        'facilities'           => doctor_facilities($r),
        'phone'                => $r['hospital_id'] ? $r['hospital_phone'] : null,
        'advance_booking_days' => (int) $r['advance_booking_days'],
        'fees'                 => active_fees((int) $r['id']),
    ];
}

/**
 * Day-by-day availability for the date strip: every date from today to today + advance days.
 * status: AVAILABLE | FULL | CLOSED | ENDED | NOT_WORKING
 */
function doctor_availability(array $r): array
{
    $did = (int) $r['id'];
    $advance = (int) $r['advance_booking_days'];
    ensure_published($did, $advance);
    $today = date('Y-m-d');
    $now = date('H:i:s');

    $rows = db_all(
        'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date, start_time',
        [$did, $today, date('Y-m-d', strtotime("+{$advance} days"))]
    );
    $taken = taken_slots_for(array_map(fn (array $s): int => (int) $s['id'], array_filter($rows, fn (array $s): bool => $s['booking_mode'] === 'SLOTS')));
    $tokens = max_tokens_for(array_map(fn (array $s): int => (int) $s['id'], array_filter($rows, fn (array $s): bool => $s['booking_mode'] === 'COUNT')));
    $by_date = [];
    foreach ($rows as $s) {
        $by_date[$s['work_date']][] = window_view($s, $today, $now, $taken[(int) $s['id']] ?? [], false, $tokens[(int) $s['id']] ?? 0);
    }

    $days = [];
    for ($i = 0; $i <= $advance; $i++) {
        $date = date('Y-m-d', strtotime("{$today} +{$i} days"));
        $windows = $by_date[$date] ?? [];
        $statuses = array_column($windows, 'status');
        $remaining = array_sum(array_column($windows, 'remaining'));
        $status = match (true) {
            !$windows                          => 'NOT_WORKING',
            in_array('OPEN', $statuses, true)  => 'AVAILABLE',
            in_array('FULL', $statuses, true)  => 'FULL',
            in_array('ENDED', $statuses, true) => 'ENDED',
            default                            => 'CLOSED',
        };
        $days[] = ['date' => $date, 'weekday' => (int) date('N', strtotime($date)), 'status' => $status, 'remaining' => $remaining, 'window_count' => count($windows)];
    }
    return ['advance_booking_days' => $advance, 'days' => $days];
}

/** The windows (and, for slot windows, every slot) for one date. Returns null if the date is outside the booking range. */
function doctor_slots_for_date(array $r, string $date): ?array
{
    $advance = (int) $r['advance_booking_days'];
    $today = date('Y-m-d');
    if ($date < $today || $date > date('Y-m-d', strtotime("+{$advance} days"))) {
        return null;
    }
    ensure_published((int) $r['id'], $advance);
    $rows = db_all('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND work_date = ? ORDER BY start_time', [$r['id'], $date]);
    $taken = taken_slots_for(array_map(fn (array $s): int => (int) $s['id'], array_filter($rows, fn (array $s): bool => $s['booking_mode'] === 'SLOTS')));
    $now = date('H:i:s');
    $tokens = max_tokens_for(array_map(fn (array $s): int => (int) $s['id'], array_filter($rows, fn (array $s): bool => $s['booking_mode'] === 'COUNT')));
    return [
        'date'    => $date,
        'windows' => array_map(fn (array $s): array => window_view($s, $today, $now, $taken[(int) $s['id']] ?? [], true, $tokens[(int) $s['id']] ?? 0), $rows),
    ];
}
