<?php
/** Vars: $name, $booking_code, $doctor_name, $date_text, $when_text, $by ('PATIENT'|'DOCTOR'), $reason (string, may be ''), $refund_text, $find_url */
$subject = 'Booking cancelled: ' . $booking_code;
?>
<h2 style="margin:0 0 12px;font-size:20px;"><?= $by === 'DOCTOR' ? 'Your appointment has been cancelled' : 'You cancelled your appointment' ?></h2>
<p>Hello <?= e($name) ?>,</p>
<?php if ($by === 'DOCTOR') { ?>
<p>We are sorry: <strong><?= e($doctor_name) ?></strong> had to cancel your appointment (booking <strong><?= e($booking_code) ?></strong>) on <strong><?= e($date_text) ?></strong>, <?= e($when_text) ?>.</p>
<?php if ($reason !== '') { ?><p style="background:#f4f7fa;border-radius:8px;padding:10px 14px;"><strong>Reason given:</strong> <?= e($reason) ?></p><?php } ?>
<?php } else { ?>
<p>Your appointment with <strong><?= e($doctor_name) ?></strong> (booking <strong><?= e($booking_code) ?></strong>) on <strong><?= e($date_text) ?></strong>, <?= e($when_text) ?> has been cancelled, and the place has been released.</p>
<?php } ?>
<p><?= e($refund_text) ?></p>
<p style="margin:24px 0;"><a href="<?= e($find_url) ?>" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block;">Find another appointment</a></p>
