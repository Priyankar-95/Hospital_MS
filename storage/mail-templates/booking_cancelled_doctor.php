<?php
/** Vars: $doctor_name, $patient_name, $booking_code, $date_text, $when_text, $treatment, $reason (string, may be '') */
$subject = 'A patient cancelled: ' . $booking_code;
?>
<h2 style="margin:0 0 12px;font-size:20px;">A booking was cancelled</h2>
<p>Hello <?= e($doctor_name) ?>,</p>
<p><strong><?= e($patient_name) ?></strong> cancelled booking <strong><?= e($booking_code) ?></strong> (<?= e($treatment) ?>) on <strong><?= e($date_text) ?></strong>, <?= e($when_text) ?>. The place is free again for other patients.</p>
<?php if ($reason !== '') { ?><p style="background:#f4f7fa;border-radius:8px;padding:10px 14px;"><strong>Reason given:</strong> <?= e($reason) ?></p><?php } ?>
