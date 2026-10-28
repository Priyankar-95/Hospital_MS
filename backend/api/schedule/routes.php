<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/doctors.php';
require_once __DIR__ . '/../../services/schedule.php';

// Schedule and fees belong to approved doctors only (private and hospital doctors alike).

route('GET', '/api/doctors/me/schedule', function (): array {
    return schedule_overview(require_approved_doctor());
}, ['roles' => ['DOCTOR']]);

// Replace the weekly working hours (and how many days ahead patients can book).
// Body: { "advance_booking_days": 14, "windows": [ { weekday, start, end, mode: "COUNT"|"SLOTS", max_patients, slot_minutes } ] }
route('POST', '/api/doctors/me/schedule/weekly', function (): array {
    $doctor = require_approved_doctor();
    $input = request_body();
    $advance = $input['advance_booking_days'] ?? null;
    if (!is_int($advance) || $advance < MIN_ADVANCE_DAYS || $advance > MAX_ADVANCE_DAYS) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['advance_booking_days' => 'Choose between ' . MIN_ADVANCE_DAYS . ' and ' . MAX_ADVANCE_DAYS . ' days.']);
    }
    $windows = normalize_weekly_windows($input['windows'] ?? null);

    $summary = save_weekly_schedule((int) $doctor['id'], $windows, $advance);
    return ['schedule' => schedule_overview($doctor), 'summary' => $summary];
}, ['roles' => ['DOCTOR']]);

/** Validate a YYYY-MM-DD route parameter: a real date from today up to the end of the publishing window. */
function schedule_date_param(array $doctor): string
{
    $date = route_param('date');
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['date' => 'Enter a date as YYYY-MM-DD.']);
    }
    if ($date < schedule_today()) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['date' => 'That date has already passed.']);
    }
    return $date;
}

// Close a day (leave, holiday). Not possible once patients have booked it.
route('POST', '/api/doctors/me/schedule/dates/{date}/close', function (): array {
    $doctor = require_approved_doctor();
    $date = schedule_date_param($doctor);

    $result = db_transaction(function () use ($doctor, $date): array {
        $rows = db_all('SELECT id, booked_count FROM doctor_schedules WHERE doctor_id = ? AND work_date = ? FOR UPDATE', [$doctor['id'], $date]);
        if (!$rows) {
            api_fail(404, 'NOT_FOUND', 'You have no working hours on that date.');
        }
        $booked = array_sum(array_map(fn (array $r): int => (int) $r['booked_count'], $rows));
        if ($booked > 0) {
            api_fail(409, 'HAS_BOOKINGS', "{$booked} patient" . ($booked === 1 ? ' has' : 's have') . ' booked this day. You cannot close it while there are bookings.');
        }
        db_query('UPDATE doctor_schedules SET is_closed = 1 WHERE doctor_id = ? AND work_date = ?', [$doctor['id'], $date]);
        return ['date' => $date];
    });
    return $result + ['schedule' => schedule_overview($doctor)];
}, ['roles' => ['DOCTOR']]);

route('POST', '/api/doctors/me/schedule/dates/{date}/open', function (): array {
    $doctor = require_approved_doctor();
    $date = schedule_date_param($doctor);
    $n = db_query('UPDATE doctor_schedules SET is_closed = 0 WHERE doctor_id = ? AND work_date = ?', [$doctor['id'], $date])->rowCount();
    if ($n === 0 && db_value('SELECT 1 FROM doctor_schedules WHERE doctor_id = ? AND work_date = ?', [$doctor['id'], $date]) === null) {
        api_fail(404, 'NOT_FOUND', 'You have no working hours on that date.');
    }
    return ['date' => $date, 'schedule' => schedule_overview($doctor)];
}, ['roles' => ['DOCTOR']]);

// ---- Fees ----------------------------------------------------------------------------------------

route('GET', '/api/doctors/me/fees', function (): array {
    return ['fees' => fees_for_doctor((int) require_approved_doctor()['id'])];
}, ['roles' => ['DOCTOR']]);

route('POST', '/api/doctors/me/fees', function (): array {
    $doctor = require_approved_doctor();
    $input = request_body();
    $v = new Validator($input);
    $name = $v->string('treatment_name', 2, 150);
    $fee = normalize_fee($input['fee'] ?? null);
    if ($fee === null) {
        $v->add_error('fee', 'Enter an amount between 0 and ' . number_format(MAX_FEE_AMOUNT) . ' (up to 2 decimals).');
    }
    $v->fail_if_invalid();

    if (db_value('SELECT 1 FROM doctor_fees WHERE doctor_id = ? AND treatment_name = ?', [$doctor['id'], $name]) !== null) {
        api_fail(409, 'FEE_EXISTS', 'You already have a fee called "' . $name . '".', ['treatment_name' => 'You already have a fee with this name.']);
    }
    db_query(
        "INSERT INTO doctor_fees (doctor_id, treatment_name, fee, is_active, last_updated_by_user_id, last_updated_by_role) VALUES (?, ?, ?, 1, ?, 'DOCTOR')",
        [$doctor['id'], $name, $fee, current_user()['id']]
    );
    return ['fees' => fees_for_doctor((int) $doctor['id'])];
}, ['roles' => ['DOCTOR']]);

/** The doctor's own fee row, or 404 (same answer whether it does not exist or belongs to someone else). */
function own_fee(array $doctor): array
{
    $fee = db_one('SELECT * FROM doctor_fees WHERE id = ? AND doctor_id = ?', [(int) route_param('id'), $doctor['id']]);
    if ($fee === null) {
        api_fail(404, 'NOT_FOUND', 'Fee not found.');
    }
    return $fee;
}

// Partial update: any of treatment_name, fee, is_active.
route('POST', '/api/doctors/me/fees/{id}', function (): array {
    $doctor = require_approved_doctor();
    $current = own_fee($doctor);
    $input = request_body();
    $changes = [];
    $errors = [];

    if (array_key_exists('treatment_name', $input)) {
        $v = new Validator($input);
        $name = $v->string('treatment_name', 2, 150);
        try {
            $v->fail_if_invalid();
        } catch (ApiException $e) {
            $errors += $e->details;
        }
        if ($name !== null && $name !== $current['treatment_name']) {
            if (db_value('SELECT 1 FROM doctor_fees WHERE doctor_id = ? AND treatment_name = ? AND id <> ?', [$doctor['id'], $name, $current['id']]) !== null) {
                $errors['treatment_name'] = 'You already have a fee with this name.';
            }
            $changes['treatment_name'] = $name;
        }
    }
    if (array_key_exists('fee', $input)) {
        $fee = normalize_fee($input['fee']);
        if ($fee === null) {
            $errors['fee'] = 'Enter an amount between 0 and ' . number_format(MAX_FEE_AMOUNT) . ' (up to 2 decimals).';
        } else {
            $changes['fee'] = $fee;
        }
    }
    if (array_key_exists('is_active', $input)) {
        if (!is_bool($input['is_active'])) {
            $errors['is_active'] = 'Invalid value.';
        } else {
            $changes['is_active'] = $input['is_active'] ? 1 : 0;
        }
    }
    if ($errors) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', $errors);
    }
    if ($changes) {
        $sets = implode(', ', array_map(fn (string $c): string => "{$c} = ?", array_keys($changes)));
        db_query(
            "UPDATE doctor_fees SET {$sets}, last_updated_by_user_id = ?, last_updated_by_role = 'DOCTOR' WHERE id = ?",
            [...array_values($changes), current_user()['id'], $current['id']]
        );
    }
    return ['fees' => fees_for_doctor((int) $doctor['id'])];
}, ['roles' => ['DOCTOR']]);

// Past appointments keep their own copy of the treatment name and amount, so deleting a fee is safe.
route('DELETE', '/api/doctors/me/fees/{id}', function (): array {
    $doctor = require_approved_doctor();
    $fee = own_fee($doctor);
    db_query('DELETE FROM doctor_fees WHERE id = ?', [$fee['id']]);
    return ['fees' => fees_for_doctor((int) $doctor['id'])];
}, ['roles' => ['DOCTOR']]);
