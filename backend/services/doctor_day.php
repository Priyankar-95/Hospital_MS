<?php
declare(strict_types=1);

require_once __DIR__ . '/booking.php';
require_once __DIR__ . '/format.php';
require_once __DIR__ . '/pdf.php';

/**
 * The doctor's view of one day's bookings, and the daily summary PDF.
 * Everything here is scoped to ONE doctor: a doctor only ever sees bookings made with them.
 */

function doctor_day_select(): string
{
    return "SELECT a.id, a.booking_code, a.slot_time, a.token_number, a.treatment_name, a.fee_amount,
                   a.payment_type, a.payment_status, a.status, a.payment_marked_at, a.payment_marked_by_user_id,
                   a.cancelled_by_role, a.cancel_reason,
                   s.id AS schedule_id, s.work_date, s.start_time, s.end_time, s.booking_mode,
                   p.name AS patient_name, p.email AS patient_email, p.phone AS patient_phone
            FROM appointments a
            JOIN doctor_schedules s ON s.id = a.schedule_id
            JOIN users p ON p.id = a.patient_id";
}

/** Validate a YYYY-MM-DD query value (a real date). */
function day_param(mixed $value, ?string $default = null): string
{
    if ($value === null || $value === '') {
        if ($default !== null) {
            return $default;
        }
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['date' => 'Enter a date as YYYY-MM-DD.']);
    }
    $d = is_string($value) ? DateTimeImmutable::createFromFormat('!Y-m-d', $value) : false;
    if (!$d || $d->format('Y-m-d') !== $value || $value < '2000-01-01' || $value > '2100-12-31') {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['date' => 'Enter a date as YYYY-MM-DD.']);
    }
    return $value;
}

/** What the doctor may do with one booking right now. */
function doctor_day_item(array $r, array $doctor, string $today, string $now): array
{
    $is_slot = $r['booking_mode'] === 'SLOTS';
    $active = in_array($r['status'], ['BOOKED', 'COMPLETED', 'NO_SHOW'], true);
    $started = $r['work_date'] <= $today;                                   // the visit day has come
    $session_over = $r['work_date'] < $today || ($r['work_date'] === $today && $r['end_time'] <= $now);
    $private = $doctor['doctor_type'] === 'PRIVATE';
    $pay_at_visit = $r['payment_type'] === 'VISIT';

    return [
        'booking_code'   => $r['booking_code'],
        'status'         => $r['status'],
        'mode'           => $r['booking_mode'],
        'time'           => $is_slot ? substr($r['slot_time'], 11, 5) : null,
        'window'         => ['start' => substr($r['start_time'], 0, 5), 'end' => substr($r['end_time'], 0, 5)],
        'token_number'   => $r['token_number'] !== null ? (int) $r['token_number'] : null,
        'patient'        => ['name' => $r['patient_name'], 'email' => $r['patient_email'], 'phone' => $r['patient_phone']],
        'treatment_name' => $r['treatment_name'],
        'fee_amount'     => $r['fee_amount'],
        'payment_type'   => $r['payment_type'],
        'payment_status' => $r['payment_status'],
        'payment_marked_at' => $r['payment_marked_at'],
        'cancellation'   => $r['status'] === 'CANCELLED' ? ['by' => $r['cancelled_by_role'] === 'PATIENT' ? 'PATIENT' : 'DOCTOR', 'reason' => $r['cancel_reason']] : null,
        // Private doctors record cash received; hospital doctors only look (the front desk records it, Phase 2)
        'can_mark_paid'   => $private && $pay_at_visit && $r['payment_status'] === 'PENDING' && in_array($r['status'], ['BOOKED', 'COMPLETED'], true) && $started,
        'can_unmark_paid' => $private && $pay_at_visit && $r['payment_status'] === 'PAID' && $r['payment_marked_by_user_id'] !== null && (int) $r['payment_marked_by_user_id'] === (int) $doctor['user_id'],
        'can_complete'    => $active && $r['status'] !== 'COMPLETED' && $started,
        'can_no_show'     => $active && $r['status'] !== 'NO_SHOW' && $started,
        'can_reopen'      => in_array($r['status'], ['COMPLETED', 'NO_SHOW'], true),
        'can_cancel'      => $r['status'] === 'BOOKED' && !$session_over,
    ];
}

function doctor_day_items(array $doctor, string $date): array
{
    $rows = db_all(
        doctor_day_select() . ' WHERE a.doctor_id = ? AND s.work_date = ? ORDER BY s.start_time, a.slot_time, a.token_number, a.id',
        [$doctor['id'], $date]
    );
    $today = date('Y-m-d');
    $now = date('H:i:s');
    return array_map(fn (array $r): array => doctor_day_item($r, $doctor, $today, $now), $rows);
}

/** Counts and money for a day. Cancelled bookings are not part of the money. */
function doctor_day_summary(array $items): array
{
    $s = ['total' => 0, 'booked' => 0, 'completed' => 0, 'no_show' => 0, 'cancelled' => 0, 'expected' => 0.0, 'collected' => 0.0, 'pending' => 0.0];
    foreach ($items as $i) {
        $s['total']++;
        $key = ['BOOKED' => 'booked', 'COMPLETED' => 'completed', 'NO_SHOW' => 'no_show', 'CANCELLED' => 'cancelled'][$i['status']];
        $s[$key]++;
        if ($i['status'] === 'CANCELLED') {
            continue;
        }
        $amount = (float) $i['fee_amount'];
        $s['expected'] += $amount;
        if ($i['payment_status'] === 'PAID') {
            $s['collected'] += $amount;
        } elseif ($i['payment_status'] === 'PENDING') {
            $s['pending'] += $amount;
        }
    }
    foreach (['expected', 'collected', 'pending'] as $k) {
        $s[$k] = number_format($s[$k], 2, '.', '');
    }
    return $s;
}

/** Booking counts for every date from..to (inclusive), for the date strip. */
function doctor_range_summary(array $doctor, string $from, string $to): array
{
    $rows = db_all(
        "SELECT s.work_date AS d, a.status AS st, COUNT(*) AS n
         FROM appointments a JOIN doctor_schedules s ON s.id = a.schedule_id
         WHERE a.doctor_id = ? AND s.work_date BETWEEN ? AND ? GROUP BY s.work_date, a.status",
        [$doctor['id'], $from, $to]
    );
    $by = [];
    foreach ($rows as $r) {
        $by[$r['d']][$r['st']] = (int) $r['n'];
    }
    $days = [];
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $d = date('Y-m-d', $t);
        $c = $by[$d] ?? [];
        $days[] = [
            'date'      => $d,
            'weekday'   => (int) date('N', $t),
            'booked'    => $c['BOOKED'] ?? 0,
            'completed' => $c['COMPLETED'] ?? 0,
            'no_show'   => $c['NO_SHOW'] ?? 0,
            'cancelled' => $c['CANCELLED'] ?? 0,
            'active'    => ($c['BOOKED'] ?? 0) + ($c['COMPLETED'] ?? 0) + ($c['NO_SHOW'] ?? 0),
        ];
    }
    return $days;
}

/** The booking row for this doctor (any status), or a 404. Same answer for "not yours" and "does not exist". */
function doctor_booking_or_404(array $doctor, string $code): array
{
    $row = preg_match('/^HB-[A-Z0-9]{8}$/', $code)
        ? db_one(doctor_day_select() . ' WHERE a.booking_code = ? AND a.doctor_id = ?', [$code, $doctor['id']])
        : null;
    if ($row === null) {
        api_fail(404, 'NOT_FOUND', 'Appointment not found.');
    }
    return $row;
}

const PAYMENT_STATUS_LABEL = ['PENDING' => 'Pending', 'PAID' => 'Paid', 'REFUND_PENDING' => 'Refund in progress', 'REFUNDED' => 'Refunded'];
const BOOKING_STATUS_LABEL = ['BOOKED' => 'Booked', 'COMPLETED' => 'Completed', 'NO_SHOW' => 'No-show', 'CANCELLED' => 'Cancelled'];

/** The daily summary as HTML (turned into a PDF). Names and other text from people are escaped. */
function daily_summary_html(array $doctor, string $date, array $items): string
{
    $name = db_value('SELECT name FROM users WHERE id = ?', [$doctor['user_id']]) ?? 'Doctor';
    $sum = doctor_day_summary($items);
    $place = $doctor['hospital_id'] ? db_value('SELECT name FROM hospitals WHERE id = ?', [$doctor['hospital_id']]) : $doctor['clinic_name'];

    $stat = fn (string $label, string $value): string => '<td style="border:0;padding:0 18px 0 0;"><div class="muted">' . e($label) . '</div><div style="font-size:15px;font-weight:bold;">' . e($value) . '</div></td>';

    $rows = '';
    $n = 0;
    foreach ($items as $i) {
        $n++;
        $when = $i['mode'] === 'SLOTS' ? format_time12($i['time']) : '#' . (int) $i['token_number'] . ' &middot; ' . e(format_time12($i['window']['start']) . ' - ' . format_time12($i['window']['end']));
        $cancelled = $i['status'] === 'CANCELLED';
        $pay = ($i['payment_type'] === 'VISIT' ? 'Pay at visit' : 'Online') . ' - ' . (PAYMENT_STATUS_LABEL[$i['payment_status']] ?? $i['payment_status']);
        $rows .= '<tr' . ($cancelled ? ' style="color:#9ca3af;"' : '') . '>'
            . '<td>' . $n . '</td>'
            . '<td>' . ($i['mode'] === 'SLOTS' ? e($when) : $when) . '</td>'
            . '<td><strong>' . e($i['patient']['name']) . '</strong>' . ($i['patient']['phone'] ? '<br><span class="muted">' . e($i['patient']['phone']) . '</span>' : '') . '</td>'
            . '<td>' . e((string) $i['treatment_name']) . '</td>'
            . '<td>' . e($pay) . '</td>'
            . '<td>' . e(BOOKING_STATUS_LABEL[$i['status']] ?? $i['status']) . '</td>'
            . '<td class="right">' . ($cancelled ? '<s>' . e(format_inr($i['fee_amount'])) . '</s>' : e(format_inr($i['fee_amount']))) . '</td>'
            . '</tr>';
    }
    if ($rows === '') {
        $rows = '<tr><td colspan="7" class="muted" style="text-align:center;padding:18px;">No bookings on this day.</td></tr>';
    }

    $body = '
      <div style="font-size:18px;font-weight:bold;">Daily appointment summary</div>
      <div class="muted">' . e(format_date_long($date)) . ' &middot; ' . e($name) . ($place ? ' &middot; ' . e($place) : '') . '</div>
      <table style="border:0;margin:14px 0 4px;"><tr>'
        . $stat('Bookings', (string) ($sum['total'] - $sum['cancelled']))
        . $stat('Completed', (string) $sum['completed'])
        . $stat('No-show', (string) $sum['no_show'])
        . $stat('Cancelled', (string) $sum['cancelled'])
        . $stat('Expected', format_inr($sum['expected']))
        . $stat('Collected', format_inr($sum['collected']))
        . $stat('To collect', format_inr($sum['pending']))
      . '</tr></table>
      <table><tr><th>#</th><th>Time / number</th><th>Patient</th><th>Treatment</th><th>Payment</th><th>Status</th><th class="right">Fee</th></tr>' . $rows . '</table>
      <p class="muted" style="margin-top:14px;">Cancelled bookings are shown greyed out and are not counted in the money totals. Generated on ' . e(date('j M Y, g:i A')) . '.</p>';

    return pdf_document('Daily summary - ' . format_date_long($date), $body);
}
