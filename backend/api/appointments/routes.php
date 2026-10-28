<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/booking.php';
require_once __DIR__ . '/../../services/cancellation.php';
require_once __DIR__ . '/../../services/booking_notify.php';

// Patients book, list, view and cancel their own appointments and download invoices.

route('POST', '/api/appointments', function (): array {
    $user = current_user();
    $input = request_body();
    $v = new Validator($input);
    $schedule_id = $v->int('schedule_id');
    $treatment_id = $v->int('treatment_id');
    $payment_type = $v->enum('payment_type', ['VISIT', 'ONLINE'], false) ?? 'VISIT';
    $phone = $v->phone('phone');

    // slot_time is "HH:MM" for time-slot sessions and must be left out for per-day-count sessions
    $slot_time = $input['slot_time'] ?? null;
    if ($slot_time === '') {
        $slot_time = null;
    }
    if ($slot_time !== null && (!is_string($slot_time) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $slot_time))) {
        $v->add_error('slot_time', 'Choose a time from the list.');
    }
    $v->fail_if_invalid();

    if ($payment_type === 'ONLINE') {
        api_fail(422, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not available yet. Please choose "Pay at visit".', ['payment_type' => 'Online payment is not available yet.']);
    }

    $appointment = create_booking((int) $user['id'], [
        'schedule_id'  => $schedule_id,
        'treatment_id' => $treatment_id,
        'slot_time'    => $slot_time,
        'payment_type' => $payment_type,
    ]);

    // A contact number given while booking is kept on the account (the doctor's office may need it)
    if ($phone !== null) {
        db_query('UPDATE users SET phone = ? WHERE id = ?', [$phone, $user['id']]);
    }

    // The booking is saved. Email is a courtesy: a failure is logged in email_log and never changes the answer.
    $emailed = send_booking_confirmation($appointment['booking_code']);
    return ['appointment' => $appointment, 'email_sent' => $emailed];
}, ['roles' => ['PATIENT']]);

/** Is this booking still ahead of us? (booked, and the session has not ended) */
function appointment_is_upcoming(array $a, string $today, string $now): bool
{
    return $a['status'] === 'BOOKED' && ($a['work_date'] > $today || ($a['work_date'] === $today && $a['end_time'] > $now));
}

// My Appointments: ?scope=upcoming|past (default upcoming), ?page=, ?per_page= (1-50, default 10).
route('GET', '/api/appointments', function (): array {
    $user = current_user();
    $v = new Validator($_GET);
    $scope = $v->enum('scope', ['upcoming', 'past'], false) ?? 'upcoming';
    $page = $v->int('page', 1, 100000, false) ?? 1;
    $per_page = $v->int('per_page', 1, 50, false) ?? 10;
    $v->fail_if_invalid();

    $today = date('Y-m-d');
    $now = date('H:i:s');
    $upcoming = "(a.status = 'BOOKED' AND (s.work_date > ? OR (s.work_date = ? AND s.end_time > ?)))";
    $where = $scope === 'upcoming' ? $upcoming : "NOT {$upcoming}";
    $params = [$user['id'], $today, $today, $now];

    $total = (int) db_value("SELECT COUNT(*) FROM appointments a JOIN doctor_schedules s ON s.id = a.schedule_id WHERE a.patient_id = ? AND {$where}", $params);
    $pages = max(1, (int) ceil($total / $per_page));
    $page = min($page, $pages);
    $order = $scope === 'upcoming' ? 'a.slot_time ASC, a.id ASC' : 'a.slot_time DESC, a.id DESC';
    $rows = db_all(appointment_select() . " WHERE a.patient_id = ? AND {$where} ORDER BY {$order} LIMIT {$per_page} OFFSET " . (($page - 1) * $per_page), $params);

    return [
        'items' => array_map(fn (array $r): array => appointment_payload($r) + ['upcoming' => appointment_is_upcoming($r, $today, $now)], $rows),
        'total' => $total, 'page' => $page, 'per_page' => $per_page, 'pages' => $pages, 'scope' => $scope,
    ];
}, ['roles' => ['PATIENT']]);

/** The patient's own appointment row for the code in the URL, or a 404. */
function own_appointment_row(): array
{
    $user = current_user();
    $code = strtoupper(route_param('code'));
    $row = preg_match('/^HB-[A-Z0-9]{8}$/', $code)
        ? db_one(appointment_select() . ' WHERE a.booking_code = ? AND a.patient_id = ?', [$code, $user['id']])
        : null;
    if ($row === null) {
        api_fail(404, 'NOT_FOUND', 'Appointment not found.');
    }
    return $row;
}

// One of the patient's own bookings, by code. Anyone else gets 404.
route('GET', '/api/appointments/{code}', function (): array {
    $row = own_appointment_row();
    return ['appointment' => appointment_payload($row) + ['upcoming' => appointment_is_upcoming($row, date('Y-m-d'), date('H:i:s'))]];
}, ['roles' => ['PATIENT']]);

/** What a cancellation means for the patient's money, for the API response. */
function refund_summary(array $row): array
{
    $online_paid = $row['payment_type'] === 'ONLINE' && in_array($row['payment_status'], ['REFUND_PENDING', 'REFUNDED'], true);
    return ['required' => $online_paid, 'status' => $online_paid ? $row['payment_status'] : 'NONE', 'message' => refund_text_for($row)];
}

// Cancel one of my bookings: allowed until 24 hours before the appointment. Body: { "reason": "optional" }.
route('POST', '/api/appointments/{code}/cancel', function (): array {
    $user = current_user();
    $code = strtoupper(route_param('code'));
    $reason = cancel_reason_input(request_body()['reason'] ?? null, false);
    if (!preg_match('/^HB-[A-Z0-9]{8}$/', $code)) {
        api_fail(404, 'NOT_FOUND', 'Appointment not found.');
    }
    $row = cancel_booking($code, ['user_id' => (int) $user['id'], 'role' => 'PATIENT'], $reason);

    // The cancellation is saved. Emails are a courtesy and never change the answer.
    $emails = send_cancellation_emails($code);
    return [
        'appointment' => appointment_payload($row) + ['upcoming' => false],
        'refund'      => refund_summary($row),
        'emails'      => $emails,
    ];
}, ['roles' => ['PATIENT']]);

// Invoice PDF for both payment types. ?download=1 saves the file, otherwise it opens in the browser.
route('GET', '/api/appointments/{code}/invoice', function (): never {
    $row = own_appointment_row();
    require_once __DIR__ . '/../../services/pdf.php';
    send_pdf(invoice_pdf($row), 'invoice-' . $row['booking_code'] . '.pdf', ($_GET['download'] ?? '') === '1');
}, ['roles' => ['PATIENT']]);
