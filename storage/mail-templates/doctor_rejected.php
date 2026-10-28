<?php
/** Vars: $name, $reason, $login_url */
$subject = 'Your doctor application needs changes';
?>
<h2 style="margin:0 0 12px;font-size:20px;">Your application was not approved</h2>
<p>Hello <?= e($name) ?>,</p>
<p>A Branch Admin reviewed your application and could not approve it yet. The reviewer wrote:</p>
<blockquote style="margin:16px 0;padding:12px 16px;background:#fff1f0;border-left:4px solid #ba1a1a;border-radius:6px;"><?= nl2br(e($reason)) ?></blockquote>
<p>You can correct your details, add the missing documents and send your application back for review.</p>
<p style="margin:24px 0;"><a href="<?= e($login_url) ?>" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block;">Update and resubmit</a></p>
<p style="color:#6b7280;font-size:13px;">If the button does not work, copy this link into your browser:<br><?= e($login_url) ?></p>
