<?php /** Shared wrapper for all emails. Vars: $subject, $content (trusted HTML from a template), $app_name */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($subject) ?></title>
</head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fa;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0b6e8a;padding:18px 28px;color:#ffffff;font-size:20px;font-weight:bold;"><?= e($app_name) ?></td></tr>
      <tr><td style="padding:28px;font-size:15px;line-height:1.6;"><?= $content ?></td></tr>
      <tr><td style="padding:16px 28px;background:#f4f7fa;color:#6b7280;font-size:12px;">
        This is an automated message from <?= e($app_name) ?>. Please do not reply to this email.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
