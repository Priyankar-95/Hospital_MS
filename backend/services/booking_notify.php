<?php
declare(strict_types=1);

require_once __DIR__ . '/email.php';
require_once __DIR__ . '/invoice.php';

/**
 * Emails about bookings. A problem here must never undo or hide something that was already saved,
 * so every failure is only logged (and recorded in email_log).
 */

/** Short text for "when": a time for slot bookings, a session window for per-day-count bookings. */
function booking_when_text(array $p): string
{
    return $p['mode'] === 'SLOTS'
        ? format_time12($p['time'])
        : format_time12($p['window']['start']) . ' - ' . format_time12($p['window']['end']);
}

/** Tell the patient their booking is confirmed, with the invoice PDF attached. */
function send_booking_confirmation(string $booking_code): bool
{
    try {
        $row = db_one(appointment_select() . ' WHERE a.booking_code = ?', [$booking_code]);
        if ($row === null) {
            return false;
        }
        $patient = db_one('SELECT name, email FROM users WHERE id = ?', [$row['patient_id']]);
        if ($patient === null) {
            return false;
        }
        $p = appointment_payload($row);
        $is_slot = $p['mode'] === 'SLOTS';

        $tmp = tempnam(sys_get_temp_dir(), 'inv');
        try {
            file_put_contents($tmp, invoice_pdf($row));
            return send_email($patient['email'], 'booking_confirmed', [
                'name'              => $patient['name'],
                'booking_code'      => $p['booking_code'],
                'doctor_name'       => $p['doctor']['name'],
                'specialty'         => $p['doctor']['specialty'],
                'place'             => (string) ($p['doctor']['place'] ?? ''),
                'address'           => (string) ($p['doctor']['address'] ?? ''),
                'date_text'         => format_date_long($p['date']),
                'when_label'        => $is_slot ? 'Time' : 'Session',
                'when_text'         => booking_when_text($p),
                'token_text'        => !$is_slot && $p['token_number'] ? '#' . $p['token_number'] : '',
                'treatment'         => (string) $p['treatment_name'],
                'fee_text'          => format_inr($p['fee_amount']),
                'payment_text'      => payment_text($p['payment_type'], $p['payment_status'], $p['fee_amount']),
                'appointments_url'  => config('app.url') . '/frontend/patient/appointments.html',
            ], [['path' => $tmp, 'name' => 'invoice-' . $p['booking_code'] . '.pdf', 'type' => 'application/pdf']]);
        } finally {
            @unlink($tmp);
        }
    } catch (Throwable $e) {
        error_log('Booking confirmation email failed for ' . $booking_code . ': ' . $e->getMessage());
        return false;
    }
}

/** What the patient is told about money when a booking is cancelled. */
function refund_text_for(array $row): string
{
    $amount = format_inr($row['fee_amount']);
    if ($row['payment_type'] === 'ONLINE' && in_array($row['payment_status'], ['REFUND_PENDING', 'REFUNDED'], true)) {
        return "Your online payment of {$amount} will be refunded in full to your original payment method. It reaches your account within 48 hours.";
    }
    if ($row['payment_type'] === 'VISIT' && $row['payment_status'] === 'PAID') {
        return "You paid {$amount} at the clinic. Please ask the clinic to return it.";
    }
    return 'You had chosen to pay at the visit, so no payment was taken and there is nothing to refund.';
}

/**
 * After a cancellation: tell the patient (always) and the doctor (when the patient cancelled).
 * @return array{patient:bool, doctor:bool}
 */
function send_cancellation_emails(string $booking_code): array
{
    $result = ['patient' => false, 'doctor' => false];
    try {
        $row = db_one(appointment_select() . ' WHERE a.booking_code = ?', [$booking_code]);
        if ($row === null || $row['status'] !== 'CANCELLED') {
            return $result;
        }
        $p = appointment_payload($row);
        $patient = db_one('SELECT name, email FROM users WHERE id = ?', [$row['patient_id']]);
        $doctor_user = db_one('SELECT u.name, u.email FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = ?', [$row['doctor_id']]);
        $by = $p['cancellation']['by'];
        $reason = (string) ($p['cancellation']['reason'] ?? '');

        if ($patient !== null) {
            $result['patient'] = send_email($patient['email'], 'booking_cancelled', [
                'name'         => $patient['name'],
                'booking_code' => $p['booking_code'],
                'doctor_name'  => $p['doctor']['name'],
                'date_text'    => format_date_long($p['date']),
                'when_text'    => booking_when_text($p),
                'by'           => $by,
                'reason'       => $reason,
                'refund_text'  => refund_text_for($row),
                'find_url'     => config('app.url') . '/frontend/patient/doctors.html',
            ]);
        }
        if ($by === 'PATIENT' && $doctor_user !== null && $patient !== null) {
            $result['doctor'] = send_email($doctor_user['email'], 'booking_cancelled_doctor', [
                'doctor_name'  => $doctor_user['name'],
                'patient_name' => $patient['name'],
                'booking_code' => $p['booking_code'],
                'date_text'    => format_date_long($p['date']),
                'when_text'    => booking_when_text($p),
                'treatment'    => (string) $p['treatment_name'],
                'reason'       => $reason,
            ]);
        }
    } catch (Throwable $e) {
        error_log('Cancellation email failed for ' . $booking_code . ': ' . $e->getMessage());
    }
    return $result;
}
