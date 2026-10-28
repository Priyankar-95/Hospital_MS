<?php /** Vars: $name, $hospital_name, $login_url */
$subject = $hospital_name . ' has been approved';
?>
<h2 style="margin:0 0 12px;font-size:20px;">Your hospital is verified</h2>
<p>Hello <?= e($name) ?>,</p>
<p>Good news: a Branch Admin has verified <strong><?= e($hospital_name) ?></strong> and it is now listed. You can invite doctors, set up departments, facilities and beds, and create front-desk accounts.</p>
<p style="margin:24px 0;"><a href="<?= e($login_url) ?>" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block;">Open your dashboard</a></p>
<p style="color:#6b7280;font-size:13px;">Log in from the Staff tab. If the button does not work, copy this link into your browser:<br><?= e($login_url) ?></p>
