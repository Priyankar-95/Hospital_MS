<?php
declare(strict_types=1);

require_once __DIR__ . '/booking.php';

/**
 * Cancelling a booking, by the patient or by the doctor.
 *
 *  - PATIENT: only their own booking, only while it is BOOKED, and only until 24 hours before the appointment.
 *  - DOCTOR:  only a booking of their own, at any time, as long as the session has not ended (emergencies).
 *
 * Like booking, it runs in one transaction that first locks the schedule row, so it can never clash with a
 * booking for the same day. The place is freed straight away (booked_count goes down, the booking stays as
 * history with status CANCELLED, and its slot / serial number no longer counts as taken).
 *
 * Money: a pay-at-visit booking has nothing to refund. A paid online booking moves to REFUND_PENDING here;
 * the Razorpay refund call itself is added together with online payments.
 */

const CANCEL_REASON_MAX = 300;

/**
 * @param array{user_id:int, role:string} $actor  role is PATIENT or DOCTOR
 * @return array the updated appointment row (appointment_select shape)
 */
function cancel_booking(string $booking_code, array $actor, ?string $reason): array
{
    $is_patient = $actor['role'] === 'PATIENT';

    $row_id = db_transaction(function () use ($booking_code, $actor, $reason, $is_patient): int {
        // Find it first without locking, to know which schedule to lock (and to check ownership)
        $probe = db_one(
            'SELECT a.id, a.schedule_id, a.patient_id, d.user_id AS doctor_user_id
             FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.booking_code = ?',
            [$booking_code]
        );
        $mine = $probe !== null && ($is_patient ? (int) $probe['patient_id'] === $actor['user_id'] : (int) $probe['doctor_user_id'] === $actor['user_id']);
        if (!$mine) {
            api_fail(404, 'NOT_FOUND', 'Appointment not found.'); // same answer for "not yours" and "does not exist"
        }

        // Same lock order as booking: schedule row first, then the booking
        $s = db_one('SELECT id, booked_count FROM doctor_schedules WHERE id = ? FOR UPDATE', [$probe['schedule_id']]);
        $a = db_one(appointment_select() . ' WHERE a.id = ? FOR UPDATE', [$probe['id']]);
        if ($s === null || $a === null) {
            api_fail(404, 'NOT_FOUND', 'Appointment not found.');
        }

        if ($a['status'] === 'CANCELLED') {
            api_fail(409, 'ALREADY_CANCELLED', 'This booking has already been cancelled.');
        }
        if ($a['status'] !== 'BOOKED') {
            api_fail(409, 'NOT_CANCELLABLE', 'This appointment can no longer be cancelled.');
        }
        if ($is_patient) {
            if (!patient_can_cancel($a)) {
                api_fail(409, 'CANCEL_WINDOW_CLOSED', 'You can cancel up to ' . PATIENT_CANCEL_HOURS . ' hours before the appointment. That time has passed, so this booking can no longer be cancelled online.');
            }
        } else {
            // A doctor can cancel at any time for an emergency, but not a session that is already over
            if ($a['work_date'] < date('Y-m-d') || ($a['work_date'] === date('Y-m-d') && $a['end_time'] <= date('H:i:s'))) {
                api_fail(409, 'NOT_CANCELLABLE', 'That session is already over, so there is nothing to cancel.');
            }
        }

        // An online payment that has been paid is refunded in full (the refund call itself comes with online payments)
        $refund_pending = $a['payment_type'] === 'ONLINE' && $a['payment_status'] === 'PAID';
        db_query(
            "UPDATE appointments SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_by_role = ?, cancelled_at = NOW(), cancel_reason = ?,
                    payment_status = IF(?, 'REFUND_PENDING', payment_status)
             WHERE id = ? AND status = 'BOOKED'",
            [$actor['user_id'], $actor['role'], $reason, $refund_pending ? 1 : 0, $a['id']]
        );
        if ($refund_pending) {
            db_query("UPDATE payments SET status = 'REFUND_PENDING' WHERE appointment_id = ? AND status = 'PAID'", [$a['id']]);
        }
        // Give the place back (never below zero)
        db_query('UPDATE doctor_schedules SET booked_count = GREATEST(booked_count - 1, 0) WHERE id = ?', [$s['id']]);
        return (int) $a['id'];
    });

    return appointment_row_by_id($row_id);
}

/** Clean up the optional / required reason typed by a person. */
function cancel_reason_input(mixed $value, bool $required): ?string
{
    if ($value === null || (is_string($value) && trim($value) === '')) {
        if ($required) {
            api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['reason' => 'Please give a reason. The patient will see it.']);
        }
        return null;
    }
    if (!is_string($value)) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['reason' => 'Invalid value.']);
    }
    $v = new Validator(['reason' => $value]);
    $clean = $v->string('reason', $required ? 5 : 1, CANCEL_REASON_MAX, $required);
    $v->fail_if_invalid();
    return $clean;
}
