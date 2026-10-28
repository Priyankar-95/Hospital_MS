<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/doctors.php';
require_once __DIR__ . '/../../services/cancellation.php';
require_once __DIR__ . '/../../services/booking_notify.php';
require_once __DIR__ . '/../../services/doctor_day.php';

// One day's bookings for the signed-in doctor. ?date=YYYY-MM-DD (default today). Also returns a strip of
// the surrounding days (?strip_from, 14 days from `date` - 3) so the screen can show booking counts per day.
route('GET', '/api/doctors/me/appointments', function (): array {
    $doctor = require_approved_doctor();
    $date = day_param($_GET['date'] ?? null, date('Y-m-d'));
    $items = doctor_day_items($doctor, $date);
    $from = date('Y-m-d', strtotime($date . ' -3 days'));
    $to = date('Y-m-d', strtotime($date . ' +10 days'));
    return [
        'date'         => $date,
        'is_today'     => $date === date('Y-m-d'),
        'doctor_type'  => $doctor['doctor_type'],
        'summary'      => doctor_day_summary($items),
        'appointments' => $items,
        'days'         => doctor_range_summary($doctor, $from, $to),
    ];
}, ['roles' => ['DOCTOR']]);

// The daily summary as a PDF. ?date=YYYY-MM-DD (default today), &download=1 to force a download.
route('GET', '/api/doctors/me/appointments/daily-pdf', function (): void {
    $doctor = require_approved_doctor();
    $date = day_param($_GET['date'] ?? null, date('Y-m-d'));
    $html = daily_summary_html($doctor, $date, doctor_day_items($doctor, $date));
    send_pdf(pdf_from_html($html, 'A4', 'landscape'), 'daily-summary-' . $date . '.pdf', ($_GET['download'] ?? '') === '1');
}, ['roles' => ['DOCTOR']]);

/**
 * Change one booking under a row lock. $apply gets the locked row and returns the UPDATE (sql, params)
 * or calls api_fail(). Returns the refreshed item.
 */
function doctor_change_booking(array $doctor, string $code, callable $apply): array
{
    $code = strtoupper($code);
    doctor_booking_or_404($doctor, $code);
    db_transaction(function () use ($doctor, $code, $apply): void {
        $r = db_one(doctor_day_select() . ' WHERE a.booking_code = ? AND a.doctor_id = ? FOR UPDATE', [$code, $doctor['id']]);
        if ($r === null) {
            api_fail(404, 'NOT_FOUND', 'Appointment not found.');
        }
        [$sql, $params] = $apply($r);
        db_query($sql, $params);
    });
    $r = doctor_booking_or_404($doctor, $code);
    return doctor_day_item($r, $doctor, date('Y-m-d'), date('H:i:s'));
}

/** Allowed-by-flag guard: the same rules the list shows (can_*), enforced again on the server. */
function require_doctor_action(array $r, array $doctor, string $flag, string $code, string $message): void
{
    $item = doctor_day_item($r, $doctor, date('Y-m-d'), date('H:i:s'));
    if (!$item[$flag]) {
        api_fail(409, $code, $message);
    }
}

// Pay-at-visit money received. Private doctors only; hospital doctors can look but not mark.
route('POST', '/api/doctors/me/appointments/{code}/paid', function (): array {
    $doctor = require_approved_doctor();
    if ($doctor['doctor_type'] !== 'PRIVATE') {
        api_fail(403, 'FORBIDDEN', 'Payments for hospital doctors are marked by the hospital front desk.');
    }
    $uid = (int) $doctor['user_id'];
    return ['appointment' => doctor_change_booking($doctor, route_param('code'), function (array $r) use ($doctor, $uid): array {
        require_doctor_action($r, $doctor, 'can_mark_paid', 'NOT_PAYABLE', 'This booking cannot be marked as paid (it must be a pay-at-visit booking that is still unpaid, on or after the visit day).');
        return ["UPDATE appointments SET payment_status = 'PAID', payment_marked_by_user_id = ?, payment_marked_at = NOW() WHERE id = ?", [$uid, $r['id']]];
    })];
}, ['roles' => ['DOCTOR']]);

// Undo a "paid" mark made by mistake (only the doctor who marked it).
route('POST', '/api/doctors/me/appointments/{code}/unpaid', function (): array {
    $doctor = require_approved_doctor();
    if ($doctor['doctor_type'] !== 'PRIVATE') {
        api_fail(403, 'FORBIDDEN', 'Payments for hospital doctors are marked by the hospital front desk.');
    }
    return ['appointment' => doctor_change_booking($doctor, route_param('code'), function (array $r) use ($doctor): array {
        require_doctor_action($r, $doctor, 'can_unmark_paid', 'NOT_UNPAYABLE', 'Only a payment you marked yourself can be undone.');
        return ["UPDATE appointments SET payment_status = 'PENDING', payment_marked_by_user_id = NULL, payment_marked_at = NULL WHERE id = ?", [$r['id']]];
    })];
}, ['roles' => ['DOCTOR']]);

foreach (['complete' => ['COMPLETED', 'can_complete', 'Only a booking on or after its visit day can be marked completed.'],
          'no-show'  => ['NO_SHOW', 'can_no_show', 'Only a booking on or after its visit day can be marked as a no-show.'],
          'reopen'   => ['BOOKED', 'can_reopen', 'Only a completed or no-show booking can be reopened.']] as $action => [$target, $flag, $msg]) {
    route('POST', '/api/doctors/me/appointments/{code}/' . $action, function () use ($target, $flag, $msg): array {
        $doctor = require_approved_doctor();
        return ['appointment' => doctor_change_booking($doctor, route_param('code'), function (array $r) use ($doctor, $target, $flag, $msg): array {
            require_doctor_action($r, $doctor, $flag, 'INVALID_STATE', $msg);
            return ['UPDATE appointments SET status = ? WHERE id = ?', [$target, $r['id']]];
        })];
    }, ['roles' => ['DOCTOR']]);
}

// A doctor cancels a booking of their own, at any time (for example an emergency) until the session is over.
// The patient is emailed with the reason. Body: { "reason": "5-300 characters" } (required).
route('POST', '/api/doctors/me/appointments/{code}/cancel', function (): array {
    $doctor = require_approved_doctor();
    $code = strtoupper(route_param('code'));
    $reason = cancel_reason_input(request_body()['reason'] ?? null, true);
    if (!preg_match('/^HB-[A-Z0-9]{8}$/', $code)) {
        api_fail(404, 'NOT_FOUND', 'Appointment not found.');
    }
    $row = cancel_booking($code, ['user_id' => (int) $doctor['user_id'], 'role' => 'DOCTOR'], $reason);
    $emails = send_cancellation_emails($code);

    $online_paid = $row['payment_type'] === 'ONLINE' && in_array($row['payment_status'], ['REFUND_PENDING', 'REFUNDED'], true);
    return [
        'booking_code'   => $row['booking_code'],
        'status'         => $row['status'],
        'payment_status' => $row['payment_status'],
        'refund'         => ['required' => $online_paid, 'status' => $online_paid ? $row['payment_status'] : 'NONE'],
        'emails'         => $emails,
    ];
}, ['roles' => ['DOCTOR']]);
