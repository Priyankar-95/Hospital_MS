<?php /** Vars: $hospital_name, $district, $invited_by, $invite_url, $expires_text */
$subject = 'You are invited to list ' . $hospital_name . ' on ' . config('app.name');
?>
<h2 style="margin:0 0 12px;font-size:20px;">Join <?= e(config('app.name')) ?></h2>
<p>Hello,</p>
<p>A Branch Admin for <?= e($district) ?> (<strong><?= e($invited_by) ?></strong>) has invited <strong><?= e($hospital_name) ?></strong> to be listed on <?= e(config("app.name")) ?>.</p>
<p>Open the link below to fill in your hospital's details, upload your license or registration documents and choose a password. After that the Branch Admin will check your details. Once approved, your hospital is listed and you can manage doctors, departments and front-desk staff.</p>
<p style="margin:24px 0;"><a href="<?= e($invite_url) ?>" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block;">Set up your hospital</a></p>
<p style="color:#6b7280;font-size:13px;">This link works once and expires on <?= e($expires_text) ?>. If the button does not work, copy this link into your browser:<br><?= e($invite_url) ?></p>
<p style="color:#6b7280;font-size:13px;">If you were not expecting this invitation, you can ignore this email.</p>
