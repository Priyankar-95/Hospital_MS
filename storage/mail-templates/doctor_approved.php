<?php
/** Vars: $name, $login_url */
$subject = 'Your doctor account has been approved';
?>
<h2 style="margin:0 0 12px;font-size:20px;">You are verified</h2>
<p>Hello <?= e($name) ?>,</p>
<p>Good news: a Branch Admin has verified your credentials and your account is now active. You can set your working days, daily capacity and fees, and patients will be able to find and book you.</p>
<p style="margin:24px 0;"><a href="<?= e($login_url) ?>" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block;">Open your dashboard</a></p>
<p style="color:#6b7280;font-size:13px;">If the button does not work, copy this link into your browser:<br><?= e($login_url) ?></p>
