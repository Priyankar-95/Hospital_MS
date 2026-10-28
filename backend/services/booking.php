<?php
declare(strict_types=1);

require_once __DIR__ . '/directory.php';

/**
 * Creating a booking. Everything that decides "is there still room?" happens inside ONE transaction
 * that first locks the schedule row (SELECT ... FOR UPDATE). Every booking for that day/window has to
 * take the same lock, so two patients can never both take the last place or the same slot.
 * A unique key on (schedule_id, active_token) is a second, database-level guard.
 *
 * Online (Razorpay) payment is added later; for now only pay-at-visit bookings are created.
 */

const BOOKING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L so codes are easy to read out

function new_booking_code(): string
{
    $code = '';
    for ($i = 0; $i < 8; $i++) {
        $code .= BOOKING_CODE_ALPHABET[random_int(0, strlen(BOOKING_CODE_ALPHABET) - 1)];
    }
    return 'HB-' . $code;
}

function new_uuid_v4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return sprintf('%s-%s-%s-%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 12, 4), substr($h, 16, 4), substr($h, 20));
}

function booking_conflict(string $code, string $message): never
{
    api_fail(409, $code, $message);
}

/**
 * Book a place for a patient.
 * @param array{schedule_id:int, treatment_id:int, slot_time:?string, payment_type:string} $input already validated
 * @return array the appointment as returned by appointment_payload()
 */
function create_booking(int $patient_id, array $input): array
{
    $appointment_id = db_transaction(function () use ($patient_id, $input): int {
        // 1. Lock the schedule row. Anyone else booking this day/window waits here until we commit.
        $s = db_one('SELECT * FROM doctor_schedules WHERE id = ? FOR UPDATE', [$input['schedule_id']]);
        if ($s === null) {
            api_fail(404, 'SCHEDULE_NOT_FOUND', 'That session does not exist any more. Please choose another one.');
        }
        $doctor = visible_doctor((int) $s['doctor_id']);
        if ($doctor === null) {
            api_fail(404, 'DOCTOR_NOT_AVAILABLE', 'This doctor is not available for booking.');
        }

        $today = date('Y-m-d');
        $now = date('H:i:s');
        $last_day = date('Y-m-d', strtotime('+' . (int) $doctor['advance_booking_days'] . ' days'));
        if ($s['work_date'] < $today || $s['work_date'] > $last_day) {
            booking_conflict('SLOT_UNAVAILABLE', 'That day is outside the days you can book.');
        }
        if ((int) $s['is_closed'] === 1) {
            booking_conflict('DAY_CLOSED', 'The doctor is not seeing patients in that session.');
        }
        if ($s['work_date'] === $today && $s['end_time'] <= $now) {
            booking_conflict('WINDOW_ENDED', 'That session has already ended.');
        }

        // 2. Treatment and fee: must be one of this doctor's active fees. The amount is copied onto the booking.
        $fee = db_one('SELECT id, treatment_name, fee FROM doctor_fees WHERE id = ? AND doctor_id = ? AND is_active = 1', [$input['treatment_id'], $s['doctor_id']]);
        if ($fee === null) {
            api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['treatment_id' => 'Choose one of the doctor\'s treatments.']);
        }

        // 3. Capacity (counts every booking that still holds a place)
        $max = (int) $s['max_patients'];
        if ((int) $s['booked_count'] >= $max) {
            booking_conflict('FULL', $s['booking_mode'] === 'SLOTS' ? 'All slots in this session are booked.' : 'This session is full.');
        }

        // 4. One place per patient per session
        if (db_value("SELECT 1 FROM appointments WHERE schedule_id = ? AND patient_id = ? AND status <> 'CANCELLED' LIMIT 1", [$s['id'], $patient_id]) !== null) {
            booking_conflict('ALREADY_BOOKED', 'You already have a booking in this session.');
        }

        // 5. Which place exactly
        $start_minutes = time_to_minutes($s['start_time']) ?? 0;
        if ($s['booking_mode'] === 'SLOTS') {
            $time = $input['slot_time'];
            $minutes = $time !== null ? time_to_minutes($time) : null;
            $step = (int) $s['slot_minutes'];
            if ($minutes === null || $minutes < $start_minutes || ($minutes - $start_minutes) % $step !== 0 || intdiv($minutes - $start_minutes, $step) >= $max) {
                api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['slot_time' => 'Choose a time from the list.']);
            }
            if ($s['work_date'] === $today && minutes_to_hhmm($minutes) . ':00' <= $now) {
                booking_conflict('SLOT_PASSED', 'That time has already passed. Please choose a later slot.');
            }
            $token = intdiv($minutes - $start_minutes, $step) + 1;
            $slot_datetime = $s['work_date'] . ' ' . minutes_to_hhmm($minutes) . ':00';
            if (db_value("SELECT 1 FROM appointments WHERE schedule_id = ? AND token_number = ? AND status <> 'CANCELLED' LIMIT 1", [$s['id'], $token]) !== null) {
                booking_conflict('SLOT_TAKEN', 'Sorry, someone just booked that slot. Please choose another one.');
            }
        } else {
            if ($input['slot_time'] !== null) {
                api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['slot_time' => 'This session does not use time slots.']);
            }
            // Serial numbers only go up (a cancelled number is not handed out again)
            $token = (int) db_value('SELECT COALESCE(MAX(token_number), 0) FROM appointments WHERE schedule_id = ?', [$s['id']]) + 1;
            $slot_datetime = $s['work_date'] . ' ' . $s['start_time'];
        }

        // 6. Save it and use up the place
        try {
            db_query(
                'INSERT INTO appointments (booking_uuid, booking_code, patient_id, doctor_id, schedule_id, slot_time, token_number, treatment_name, fee_amount, payment_type, payment_status, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [new_uuid_v4(), new_booking_code(), $patient_id, $s['doctor_id'], $s['id'], $slot_datetime, $token, $fee['treatment_name'], $fee['fee'], 'VISIT', 'PENDING', 'BOOKED']
            );
        } catch (PDOException $e) {
            // The unique key caught a clash the checks above did not (should not happen under the lock)
            if ($e->getCode() === '23000' && str_contains($e->getMessage(), 'uq_appt_active_token')) {
                booking_conflict('SLOT_TAKEN', 'Sorry, someone just booked that place. Please choose another one.');
            }
            throw $e;
        }
        $id = (int) db()->lastInsertId();
        db_query('UPDATE doctor_schedules SET booked_count = booked_count + 1 WHERE id = ?', [$s['id']]);
        return $id;
    });

    return appointment_payload(appointment_row_by_id($appointment_id));
}

/** Appointment with everything needed to show it. */
function appointment_row_by_id(int $id): array
{
    $row = db_one(appointment_select() . ' WHERE a.id = ?', [$id]);
    if ($row === null) {
        throw new RuntimeException('Appointment vanished after being saved.');
    }
    return $row;
}

function appointment_select(): string
{
    return "SELECT a.id, a.booking_code, a.patient_id, a.doctor_id, a.schedule_id, a.slot_time, a.token_number, a.treatment_name, a.fee_amount,
                   a.payment_type, a.payment_status, a.status, a.created_at,
                   a.cancelled_by_role, a.cancelled_at, a.cancel_reason,
                   s.work_date, s.start_time, s.end_time, s.booking_mode, s.slot_minutes,
                   u.name AS doctor_name, d.photo_url, d.id AS doctor_row_id, d.clinic_name, d.address, d.hospital_id,
                   sp.name AS specialty_name, dist.district_name, st.state_name,
                   h.name AS hospital_name, h.address AS hospital_address
            FROM appointments a
            JOIN doctor_schedules s ON s.id = a.schedule_id
            JOIN doctors d ON d.id = a.doctor_id
            JOIN users u ON u.id = d.user_id
            JOIN specialties sp ON sp.id = d.specialty_id
            JOIN districts dist ON dist.id = d.district_id
            JOIN states st ON st.id = dist.state_id
            LEFT JOIN hospitals h ON h.id = d.hospital_id";
}

/** A patient may cancel until 24 hours before the appointment (the slot time, or the start of the session). */
const PATIENT_CANCEL_HOURS = 24;

function patient_cancel_deadline(array $a): int
{
    return strtotime($a['slot_time']) - PATIENT_CANCEL_HOURS * 3600;
}

function patient_can_cancel(array $a): bool
{
    return $a['status'] === 'BOOKED' && time() <= patient_cancel_deadline($a);
}

function appointment_payload(array $a): array
{
    $is_slot = $a['booking_mode'] === 'SLOTS';
    $cancelled = $a['status'] === 'CANCELLED';
    return [
        'booking_code'   => $a['booking_code'],
        'status'         => $a['status'],
        'date'           => $a['work_date'],
        'mode'           => $a['booking_mode'],
        // SLOTS: the exact time. COUNT: the session window and the patient's serial number.
        'time'           => $is_slot ? substr($a['slot_time'], 11, 5) : null,
        'window'         => ['start' => substr($a['start_time'], 0, 5), 'end' => substr($a['end_time'], 0, 5)],
        'token_number'   => $a['token_number'] !== null ? (int) $a['token_number'] : null,
        'treatment_name' => $a['treatment_name'],
        'fee_amount'     => $a['fee_amount'],
        'payment_type'   => $a['payment_type'],
        'payment_status' => $a['payment_status'],
        'created_at'     => $a['created_at'],
        // The patient's cancel rule: only while status is BOOKED and until 24 hours before the appointment
        'can_cancel'      => patient_can_cancel($a),
        'cancel_deadline' => $a['status'] === 'BOOKED' ? date('Y-m-d H:i', patient_cancel_deadline($a)) : null,
        'cancellation'    => $cancelled ? [
            'by'     => $a['cancelled_by_role'] === 'PATIENT' ? 'PATIENT' : 'DOCTOR',
            'at'     => $a['cancelled_at'],
            'reason' => $a['cancel_reason'],
        ] : null,
        'doctor'         => [
            'id'        => (int) $a['doctor_id'],
            'name'      => $a['doctor_name'],
            'photo_url' => doctor_photo_url(['id' => $a['doctor_id'], 'photo_url' => $a['photo_url']]),
            'specialty' => $a['specialty_name'],
            'place'     => $a['hospital_id'] ? $a['hospital_name'] : $a['clinic_name'],
            'place_kind' => $a['hospital_id'] ? 'HOSPITAL' : 'CHAMBER',
            'address'   => $a['hospital_id'] ? $a['hospital_address'] : $a['address'],
            'district'  => $a['district_name'],
            'state'     => $a['state_name'],
        ],
    ];
}
