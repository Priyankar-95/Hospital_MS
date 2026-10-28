<?php
/** Vars: $name (string) */
$subject = 'Test email from ' . config('app.name');
?>
<h2 style="margin:0 0 12px;font-size:20px;">Email is working</h2>
<p>Hello <?= e($name ?? 'there') ?>,</p>
<p>This is a test message. If you can read it, your SMTP settings are correct.</p>
<p style="color:#6b7280;font-size:13px;">Sent at <?= e(date('d M Y, h:i A')) ?> (IST).</p>
