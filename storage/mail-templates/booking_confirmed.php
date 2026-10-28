<?php
/** Vars: $name, $booking_code, $doctor_name, $specialty, $place, $address, $date_text, $when_label, $when_text, $token_text, $treatment, $fee_text, $payment_text, $appointments_url */
$subject = 'Booking confirmed: ' . $booking_code;
$row = fn (string $k, string $v) => '<tr><td style="padding:6px 0;color:#6b7280;width:130px;vertical-align:top;">' . e($k) . '</td><td style="padding:6px 0;font-weight:bold;">' . e($v) . '</td></tr>';
?>
<h2 style="margin:0 0 12px;font-size:20px;">Your appointment is confirmed</h2>
<p>Hello <?= e($name) ?>,</p>
<p>Your booking with <strong><?= e($doctor_name) ?></strong> is confirmed. Your booking ID is:</p>
<p style="margin:16px 0;font-size:24px;font-weight:bold;letter-spacing:3px;color:#0f766e;"><?= e($booking_code) ?></p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin:8px 0 16px;">
  <?= $row('Doctor', $doctor_name . ' (' . $specialty . ')') ?>
  <?= $row('Where', trim($place . ', ' . $address, ', ')) ?>
  <?= $row('Date', $date_text) ?>
  <?= $row($when_label, $when_text) ?>
  <?php if ($token_text !== '') { echo $row('Your number', $token_text); } ?>
  <?= $row('Treatment', $treatment) ?>
  <?= $row('Fee', $fee_text) ?>
  <?= $row('Payment', $payment_text) ?>
</table>
<p>Your invoice is attached to this email as a PDF. You can also find it, and all your bookings, under My Appointments.</p>
<p>You can cancel up to 24 hours before your appointment.</p>
<p style="margin:24px 0;"><a href="<?= e($appointments_url) ?>" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block;">View my appointments</a></p>
