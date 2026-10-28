<?php
declare(strict_types=1);

require_once __DIR__ . '/pdf.php';
require_once __DIR__ . '/format.php';
require_once __DIR__ . '/booking.php';

/**
 * Patient invoice (one A4 page). Works for pay-at-visit and online bookings, and for cancelled bookings.
 * Every value that came from a person is escaped with e().
 */

function invoice_html(array $a): string
{
    $patient = db_one('SELECT name, email, phone FROM users WHERE id = ?', [$a['patient_id']]) ?? ['name' => '', 'email' => '', 'phone' => null];
    $p = appointment_payload($a);
    $is_slot = $p['mode'] === 'SLOTS';
    $when = format_date_long($p['date']) . ', ' . ($is_slot ? format_time12($p['time']) : format_time12($p['window']['start']) . ' - ' . format_time12($p['window']['end']));
    $cancelled = $p['status'] === 'CANCELLED';
    $place = trim(($p['doctor']['place'] ?? '') . ', ' . ($p['doctor']['address'] ?? ''), ', ');
    $description = ($p['treatment_name'] ?? 'Consultation') . ' with ' . $p['doctor']['name'];

    $block = fn (string $title, array $lines): string =>
        '<td style="width:50%;vertical-align:top;padding-right:12px;"><div class="muted">' . e($title) . '</div>'
        . implode('', array_map(fn (string $l): string => '<div>' . $l . '</div>', $lines)) . '</td>';

    $body = '
      <table style="border:0;margin:0 0 6px;"><tr>
        <td style="border:0;padding:0;"><div style="font-size:22px;font-weight:bold;">INVOICE</div>
          <div class="muted">Booking ID ' . e($p['booking_code']) . '</div></td>
        <td style="border:0;padding:0;text-align:right;">
          <div class="muted">Issued on</div><div>' . e(format_date_long(substr($a['created_at'], 0, 10))) . '</div>'
          . ($cancelled ? '<div style="margin-top:6px;color:#b91c1c;font-weight:bold;">CANCELLED</div>' : '') . '</td>
      </tr></table>

      <table style="border:0;margin-top:14px;"><tr>'
        . $block('Patient', ['<strong>' . e($patient['name']) . '</strong>', e($patient['email']), e($patient['phone'] ?? '')])
        . $block('Doctor', ['<strong>' . e($p['doctor']['name']) . '</strong>', e($p['doctor']['specialty']), e($place), e(($p['doctor']['district'] ?? '') . ', ' . ($p['doctor']['state'] ?? ''))])
      . '</tr></table>

      <h2>Appointment</h2>
      <table>
        <tr><th>Description</th><th>Date and time</th><th class="right">Amount</th></tr>
        <tr><td>' . e($description) . '</td>
            <td>' . e($when) . ($p['mode'] === 'COUNT' && $p['token_number'] ? '<br><span class="muted">Patient number ' . (int) $p['token_number'] . '</span>' : '') . '</td>
            <td class="right">' . e(format_inr($p['fee_amount'])) . '</td></tr>
        <tr><td colspan="2" class="right"><strong>Total</strong></td><td class="right"><strong>' . e(format_inr($p['fee_amount'])) . '</strong></td></tr>
      </table>

      <h2>Payment</h2>
      <p style="margin:0;">' . e(payment_text($p['payment_type'], $p['payment_status'], $p['fee_amount'])) . '</p>'
      . ($cancelled ? '<p style="margin:10px 0 0;color:#b91c1c;">This booking was cancelled. Any online payment is refunded in full to the original payment method.</p>' : '')
      . '<p class="muted" style="margin-top:36px;">This is a computer-generated invoice and does not need a signature.</p>';

    return pdf_document('Invoice ' . $p['booking_code'], $body);
}

function invoice_pdf(array $appointment_row): string
{
    return pdf_from_html(invoice_html($appointment_row));
}
