<?php /** Vars: $name, $hospital_name, $reason, $login_url */
$subject = 'Your hospital application needs changes';
?>
<h2 style="margin:0 0 12px;font-size:20px;">Your application was not approved yet</h2>
<p>Hello <?= e($name) ?>,</p>
<p>A Branch Admin reviewed <strong><?= e($hospital_name) ?></strong> and could not approve it. The reason given:</p>
<blockquote style="margin:12px 0;padding:12px 16px;background:#fdecea;border-radius:8px;"><?= e($reason) ?></blockquote>
<p>Please correct your details or documents and send the application back for review.</p>
<p style="margin:24px 0;"><a href="<?= e($login_url) ?>" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block;">Update and resubmit</a></p>
<p style="color:#6b7280;font-size:13px;">Log in from the Staff tab. If the button does not work, copy this link into your browser:<br><?= e($login_url) ?></p>
