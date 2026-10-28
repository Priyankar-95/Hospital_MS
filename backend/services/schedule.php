<?php
declare(strict_types=1);

/**
 * Doctor schedule: weekly working hours (the pattern) -> dated rows in doctor_schedules (what patients book).
 * Booking modes:  COUNT = per-day patient count;  SLOTS = fixed-length slots, one patient each.
 * Weekdays are ISO numbers: 1 = Monday ... 7 = Sunday.
 */

const WEEKDAY_NAMES = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];
const MIN_ADVANCE_DAYS = 1;
const MAX_ADVANCE_DAYS = 60;
const MAX_WINDOWS_PER_DAY = 4;
const MAX_COUNT_CAPACITY = 500;
const MAX_SLOTS_PER_WINDOW = 200;
const MIN_SLOT_MINUTES = 5;
const MAX_SLOT_MINUTES = 120;

function schedule_today(): string
{
    return date('Y-m-d');
}

/** 'HH:MM' or 'HH:MM:SS' -> minutes after midnight, or null if invalid. */
function time_to_minutes(mixed $time): ?int
{
    if (!is_string($time) || !preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/', $time, $m)) {
        return null;
    }
    return (int) $m[1] * 60 + (int) $m[2];
}

function minutes_to_hhmm(int $minutes): string
{
    return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
}

function slots_in_window(int $start_minutes, int $end_minutes, int $slot_minutes): int
{
    return intdiv($end_minutes - $start_minutes, max(1, $slot_minutes));
}

/**
 * Validate the weekly windows sent by the client and return them normalised (sorted by day and start time).
 * Fails with a 422 whose message names the window that is wrong.
 * @return array<int,array{weekday:int,start:string,end:string,mode:string,max_patients:int,slot_minutes:?int}>
 */
function normalize_weekly_windows(mixed $input): array
{
    $fail = fn (string $message) => api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['windows' => $message]);

    if (!is_array($input) || !array_is_list($input)) {
        $fail('Send the working hours as a list.');
    }
    if (count($input) > 7 * MAX_WINDOWS_PER_DAY) {
        $fail('Too many working-hour entries.');
    }

    $windows = [];
    foreach ($input as $i => $w) {
        if (!is_array($w)) {
            $fail('Working hours entry ' . ($i + 1) . ' is not valid.');
        }
        $weekday = $w['weekday'] ?? null;
        if (!is_int($weekday) || $weekday < 1 || $weekday > 7) {
            $fail('Working hours entry ' . ($i + 1) . ': choose a day of the week.');
        }
        $label = WEEKDAY_NAMES[$weekday];
        $start = time_to_minutes($w['start'] ?? null);
        $end = time_to_minutes($w['end'] ?? null);
        if ($start === null || $end === null) {
            $fail("{$label}: enter a start and an end time.");
        }
        if ($end <= $start) {
            $fail("{$label} " . minutes_to_hhmm($start) . ': the end time must be after the start time.');
        }
        $mode = $w['mode'] ?? null;
        if ($mode !== 'COUNT' && $mode !== 'SLOTS') {
            $fail("{$label} " . minutes_to_hhmm($start) . ': choose how patients book (per-day count or time slots).');
        }

        if ($mode === 'COUNT') {
            $max = $w['max_patients'] ?? null;
            if (!is_int($max) || $max < 1 || $max > MAX_COUNT_CAPACITY) {
                $fail("{$label} " . minutes_to_hhmm($start) . ': patients per day must be between 1 and ' . MAX_COUNT_CAPACITY . '.');
            }
            $slot = null;
        } else {
            $slot = $w['slot_minutes'] ?? null;
            if (!is_int($slot) || $slot < MIN_SLOT_MINUTES || $slot > MAX_SLOT_MINUTES) {
                $fail("{$label} " . minutes_to_hhmm($start) . ': slot length must be between ' . MIN_SLOT_MINUTES . ' and ' . MAX_SLOT_MINUTES . ' minutes.');
            }
            $max = slots_in_window($start, $end, $slot);
            if ($max < 1) {
                $fail("{$label} " . minutes_to_hhmm($start) . ': the working hours are shorter than one slot.');
            }
            if ($max > MAX_SLOTS_PER_WINDOW) {
                $fail("{$label} " . minutes_to_hhmm($start) . ": that makes {$max} slots (the limit is " . MAX_SLOTS_PER_WINDOW . '). Use longer slots or shorter hours.');
            }
        }
        $windows[] = ['weekday' => $weekday, 'start' => minutes_to_hhmm($start), 'end' => minutes_to_hhmm($end), 'mode' => $mode, 'max_patients' => $max, 'slot_minutes' => $slot];
    }

    usort($windows, fn (array $a, array $b): int => [$a['weekday'], $a['start']] <=> [$b['weekday'], $b['start']]);

    $per_day = [];
    foreach ($windows as $i => $w) {
        $per_day[$w['weekday']] = ($per_day[$w['weekday']] ?? 0) + 1;
        if ($per_day[$w['weekday']] > MAX_WINDOWS_PER_DAY) {
            $fail(WEEKDAY_NAMES[$w['weekday']] . ': at most ' . MAX_WINDOWS_PER_DAY . ' time windows per day.');
        }
        $prev = $windows[$i - 1] ?? null;
        if ($prev && $prev['weekday'] === $w['weekday'] && $w['start'] < $prev['end']) {
            $fail(WEEKDAY_NAMES[$w['weekday']] . ": {$prev['start']}-{$prev['end']} and {$w['start']}-{$w['end']} overlap.");
        }
    }
    return $windows;
}

function weekly_windows_for_doctor(int $doctor_id): array
{
    $rows = db_all(
        'SELECT id, weekday, start_time, end_time, booking_mode, max_patients, slot_minutes
         FROM doctor_weekly_hours WHERE doctor_id = ? ORDER BY weekday, start_time',
        [$doctor_id]
    );
    return array_map(fn (array $r): array => [
        'id'           => (int) $r['id'],
        'weekday'      => (int) $r['weekday'],
        'start'        => substr($r['start_time'], 0, 5),
        'end'          => substr($r['end_time'], 0, 5),
        'mode'         => $r['booking_mode'],
        'max_patients' => (int) $r['max_patients'],
        'slot_minutes' => $r['slot_minutes'] !== null ? (int) $r['slot_minutes'] : null,
    ], $rows);
}

/**
 * Create the dated rows for the next N days from the weekly hours. Safe to run any number of times:
 * rows that already exist (same doctor, date and start time) are left alone.
 * Today's windows are only created if they have not finished yet.
 * @return int number of rows created
 */
function publish_schedule(int $doctor_id): int
{
    $advance = (int) db_value('SELECT advance_booking_days FROM doctors WHERE id = ?', [$doctor_id]);
    $windows = db_all('SELECT id, weekday, start_time, end_time, booking_mode, max_patients, slot_minutes FROM doctor_weekly_hours WHERE doctor_id = ?', [$doctor_id]);
    if (!$windows || $advance < 1) {
        return 0;
    }

    $by_weekday = [];
    foreach ($windows as $w) {
        $by_weekday[(int) $w['weekday']][] = $w;
    }

    $insert = db()->prepare(
        'INSERT IGNORE INTO doctor_schedules (doctor_id, work_date, start_time, end_time, booking_mode, slot_minutes, max_patients, weekly_hours_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $created = 0;
    $now_minutes = (int) date('G') * 60 + (int) date('i');
    $day = new DateTimeImmutable('today');
    for ($i = 0; $i <= $advance; $i++, $day = $day->modify('+1 day')) {
        foreach ($by_weekday[(int) $day->format('N')] ?? [] as $w) {
            if ($i === 0 && (time_to_minutes($w['end_time']) ?? 0) <= $now_minutes) {
                continue;
            }
            $insert->execute([$doctor_id, $day->format('Y-m-d'), $w['start_time'], $w['end_time'], $w['booking_mode'], $w['slot_minutes'], $w['max_patients'], $w['id']]);
            $created += $insert->rowCount();
        }
    }
    return $created;
}

/**
 * Replace the doctor's weekly hours and refresh the published days.
 * Future days that have no bookings and are not closed are rebuilt from the new hours.
 * Days that already have bookings (or that the doctor closed) are never touched.
 * @return array{created:int, removed:int, kept_with_bookings:int}
 */
function save_weekly_schedule(int $doctor_id, array $windows, int $advance_days): array
{
    return db_transaction(function () use ($doctor_id, $windows, $advance_days): array {
        // Lock the doctor row so two saves cannot interleave
        db_query('SELECT id FROM doctors WHERE id = ? FOR UPDATE', [$doctor_id]);

        db_query('DELETE FROM doctor_weekly_hours WHERE doctor_id = ?', [$doctor_id]);
        foreach ($windows as $w) {
            db_query(
                'INSERT INTO doctor_weekly_hours (doctor_id, weekday, start_time, end_time, booking_mode, max_patients, slot_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$doctor_id, $w['weekday'], $w['start'] . ':00', $w['end'] . ':00', $w['mode'], $w['max_patients'], $w['slot_minutes']]
            );
        }
        db_query('UPDATE doctors SET advance_booking_days = ? WHERE id = ?', [$advance_days, $doctor_id]);

        $today = schedule_today();
        $removed = db_query(
            'DELETE FROM doctor_schedules WHERE doctor_id = ? AND work_date >= ? AND booked_count = 0 AND is_closed = 0',
            [$doctor_id, $today]
        )->rowCount();
        $kept = (int) db_value(
            'SELECT COUNT(*) FROM doctor_schedules WHERE doctor_id = ? AND work_date >= ? AND booked_count > 0',
            [$doctor_id, $today]
        );
        return ['created' => publish_schedule($doctor_id), 'removed' => $removed, 'kept_with_bookings' => $kept];
    });
}

/** The published days (today .. today + advance days) grouped by date, for the doctor's schedule screen. */
function upcoming_days(int $doctor_id, int $advance_days): array
{
    $rows = db_all(
        'SELECT id, work_date, start_time, end_time, booking_mode, slot_minutes, max_patients, booked_count, is_closed
         FROM doctor_schedules WHERE doctor_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date, start_time',
        [$doctor_id, schedule_today(), date('Y-m-d', strtotime("+{$advance_days} days"))]
    );
    $days = [];
    foreach ($rows as $r) {
        $date = $r['work_date'];
        $days[$date] ??= ['date' => $date, 'weekday' => (int) date('N', strtotime($date)), 'is_closed' => true, 'booked' => 0, 'windows' => []];
        $days[$date]['windows'][] = [
            'id'           => (int) $r['id'],
            'start'        => substr($r['start_time'], 0, 5),
            'end'          => substr($r['end_time'], 0, 5),
            'mode'         => $r['booking_mode'],
            'slot_minutes' => $r['slot_minutes'] !== null ? (int) $r['slot_minutes'] : null,
            'max_patients' => (int) $r['max_patients'],
            'booked_count' => (int) $r['booked_count'],
            'is_closed'    => (bool) $r['is_closed'],
        ];
        $days[$date]['booked'] += (int) $r['booked_count'];
        $days[$date]['is_closed'] = $days[$date]['is_closed'] && (bool) $r['is_closed'];
    }
    return array_values($days);
}

function schedule_overview(array $doctor): array
{
    $doctor_id = (int) $doctor['id'];
    publish_schedule($doctor_id); // top up so the screen always shows the full window
    $advance = (int) db_value('SELECT advance_booking_days FROM doctors WHERE id = ?', [$doctor_id]);
    return [
        'advance_booking_days' => $advance,
        'windows'              => weekly_windows_for_doctor($doctor_id),
        'days'                 => upcoming_days($doctor_id, $advance),
    ];
}

// ---- Fees ---------------------------------------------------------------------------------------

const MAX_FEE_AMOUNT = 100000;

/** Fee as a decimal string ('500' or '500.50'): no floats for money. Returns null if invalid. */
function normalize_fee(mixed $value): ?string
{
    if (is_int($value)) {
        $value = (string) $value;
    }
    if (!is_string($value) || !preg_match('/^\d{1,6}(\.\d{1,2})?$/', trim($value))) {
        return null;
    }
    $value = trim($value);
    if ((float) $value > MAX_FEE_AMOUNT) {
        return null;
    }
    return number_format((float) $value, 2, '.', '');
}

function fee_payload(array $r): array
{
    return [
        'id'             => (int) $r['id'],
        'treatment_name' => $r['treatment_name'],
        'fee'            => $r['fee'],
        'is_active'      => (bool) $r['is_active'],
        'updated_at'     => $r['updated_at'],
        'updated_by'     => [
            'role' => $r['last_updated_by_role'],
            'name' => $r['updater_name'],
        ],
    ];
}

function fees_for_doctor(int $doctor_id): array
{
    return array_map('fee_payload', db_all(
        'SELECT f.id, f.treatment_name, f.fee, f.is_active, f.updated_at, f.last_updated_by_role, u.name AS updater_name
         FROM doctor_fees f LEFT JOIN users u ON u.id = f.last_updated_by_user_id
         WHERE f.doctor_id = ? ORDER BY f.is_active DESC, f.treatment_name',
        [$doctor_id]
    ));
}
