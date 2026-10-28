<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

/**
 * Email service. Templates live in storage/mail-templates/<name>.php.
 * A template sets $subject and echoes its HTML body; $vars are available as variables (always escape with e()).
 * Every send attempt is written to email_log. Sending never throws: it returns true/false.
 */

function mail_templates_dir(): string
{
    return project_root() . '/storage/mail-templates';
}

function mail_is_configured(): bool
{
    $m = config('mail');
    return $m['host'] !== '' && $m['from_address'] !== '';
}

/** @return array{0:string,1:string} [subject, full html] */
function render_mail_template(string $template, array $vars): array
{
    if (!preg_match('/^[a-z0-9_]+$/', $template) || !is_file(mail_templates_dir() . "/{$template}.php")) {
        throw new InvalidArgumentException("Unknown mail template: {$template}");
    }
    $render = function (string $__file, array $__vars): array {
        $subject = '';
        extract($__vars, EXTR_OVERWRITE);
        ob_start();
        include $__file;
        return [$subject, (string) ob_get_clean()];
    };

    [$subject, $content] = $render(mail_templates_dir() . "/{$template}.php", $vars);
    [, $html] = $render(mail_templates_dir() . '/_layout.php', ['subject' => $subject, 'content' => $content, 'app_name' => config('app.name')]);
    return [$subject, $html];
}

function mail_log(string $to, string $template, ?string $subject, string $status, ?string $error = null): void
{
    try {
        db_query(
            'INSERT INTO email_log (to_email, template, subject, status, error_message) VALUES (?, ?, ?, ?, ?)',
            [mb_substr($to, 0, 190), $template, $subject !== null ? mb_substr($subject, 0, 255) : null, $status, $error !== null ? mb_substr($error, 0, 500) : null]
        );
    } catch (Throwable $e) {
        error_log('email_log insert failed: ' . $e->getMessage());
    }
}

/** In local dev without SMTP, keep a copy of the email as an HTML file so it can be inspected. */
function mail_save_to_outbox(string $to, string $template, string $subject, string $html): ?string
{
    if (config('app.env') !== 'local') {
        return null;
    }
    $dir = project_root() . '/storage/logs/outbox';
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        return null;
    }
    $file = $dir . '/' . date('Ymd-His') . '-' . $template . '-' . bin2hex(random_bytes(3)) . '.html';
    $header = '<!-- To: ' . e($to) . ' | Subject: ' . e($subject) . " -->\n";
    return file_put_contents($file, $header . $html) !== false ? $file : null;
}

/**
 * @param array<int,array{path:string,name:string,type?:string}> $attachments
 */
function send_email(string $to, string $template, array $vars = [], array $attachments = []): bool
{
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        mail_log($to, $template, null, 'FAILED', 'Invalid recipient address');
        return false;
    }

    try {
        [$subject, $html] = render_mail_template($template, $vars);
    } catch (Throwable $e) {
        mail_log($to, $template, null, 'FAILED', 'Template error: ' . $e->getMessage());
        return false;
    }

    // Automated tests send "X-Test-No-Mail: 1" so they do not use up the real mailbox. Local development only.
    if (config('app.env') === 'local' && ($_SERVER['HTTP_X_TEST_NO_MAIL'] ?? '') === '1') {
        $saved = mail_save_to_outbox($to, $template, $subject, $html);
        mail_log($to, $template, $subject, 'SUPPRESSED', 'Test request: not sent' . ($saved ? ' (copy saved to storage/logs/outbox)' : ''));
        return false;
    }

    if (!mail_is_configured()) {
        $saved = mail_save_to_outbox($to, $template, $subject, $html);
        mail_log($to, $template, $subject, 'FAILED', 'SMTP not configured' . ($saved ? ' (copy saved to storage/logs/outbox)' : ''));
        return false;
    }

    $m = config('mail');
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = $m['host'];
        $mail->Port = $m['port'];
        $mail->CharSet = 'UTF-8';
        $mail->Timeout = 15;
        if ($m['username'] !== '') {
            $mail->SMTPAuth = true;
            $mail->Username = $m['username'];
            $mail->Password = $m['password'];
        }
        if ($m['encryption'] === 'tls') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } elseif ($m['encryption'] === 'ssl') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } else {
            $mail->SMTPSecure = '';
            $mail->SMTPAutoTLS = false;
        }
        $mail->setFrom($m['from_address'], $m['from_name']);
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $html;
        $mail->AltBody = trim(html_entity_decode(strip_tags(preg_replace('/<(br|\/p|\/h[1-6]|\/tr)>/i', "\n", $html) ?? ''), ENT_QUOTES, 'UTF-8'));
        foreach ($attachments as $a) {
            // The type is given explicitly: it must not be guessed from a temporary file name that has no extension
            $mail->addAttachment($a['path'], $a['name'], PHPMailer::ENCODING_BASE64, $a['type'] ?? '');
        }
        $mail->send();
        mail_log($to, $template, $subject, 'SENT');
        return true;
    } catch (MailException|Throwable $e) {
        mail_log($to, $template, $subject, 'FAILED', $mail->ErrorInfo !== '' ? $mail->ErrorInfo : $e->getMessage());
        return false;
    }
}
