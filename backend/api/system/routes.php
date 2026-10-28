<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/email.php';
require_once __DIR__ . '/../../services/uploads.php';
require_once __DIR__ . '/../../services/pdf.php';
require_once __DIR__ . '/../../services/doctors.php';

// Super Admin: send a test email to check SMTP settings, and read the email log.
route('POST', '/api/system/test-email', function (): array {
    $v = new Validator(request_body());
    $to = $v->email('to');
    $v->fail_if_invalid();

    $sent = send_email($to, 'test_email', ['name' => current_user()['name']]);
    $last = db_one('SELECT id, to_email, template, status, error_message, created_at FROM email_log ORDER BY id DESC LIMIT 1');
    return ['sent' => $sent, 'log' => $last];
}, ['roles' => ['SUPER_ADMIN']]);

route('GET', '/api/system/email-log', function (): array {
    return ['items' => db_all('SELECT id, to_email, template, subject, status, error_message, created_at FROM email_log ORDER BY id DESC LIMIT 50')];
}, ['roles' => ['SUPER_ADMIN']]);

// Everything below exists only in local development.
if (config('app.env') !== 'local') {
    return;
}

// Role-guard probes, used to prove one role cannot open another role's API.
$probes = [
    'patient'   => ['PATIENT'],
    'doctor'    => ['DOCTOR'],
    'hospital'  => ['HOSPITAL_ADMIN'],
    'frontdesk' => ['HOSPITAL_FRONTDESK'],
    'branch'    => ['BRANCH_ADMIN'],
    'vendor'    => ['VENDOR_ADMIN'],
    'admin'     => ['SUPER_ADMIN'],
];
foreach ($probes as $name => $roles) {
    route('GET', '/api/system/probe/' . $name, function () use ($name): array {
        return ['probe' => $name, 'role' => current_user()['role']];
    }, ['roles' => $roles]);
}

// Proves the "approved doctors only" gate used by schedule / fees / appointments endpoints.
route('GET', '/api/system/probe/approved-doctor', function (): array {
    return ['doctor_id' => (int) require_approved_doctor()['id']];
}, ['roles' => ['DOCTOR']]);

// Upload service test: multipart form, field "file", optional "kind" (document|image).
route('POST', '/api/system/test-upload', function (): array {
    $kind = ($_POST['kind'] ?? 'document') === 'image' ? 'image' : 'document';
    if (!isset($_FILES['file'])) {
        api_fail(422, 'UPLOAD_FAILED', 'No file was uploaded.');
    }
    $stored = store_uploaded_file($_FILES['file'], 'misc', $kind);
    return $stored;
});

// Serve a stored test file back (proves uploads are only reachable through the API).
route('GET', '/api/system/test-upload/view', function (): never {
    $path = $_GET['path'] ?? '';
    if (!is_string($path) || $path === '') {
        api_fail(422, 'VALIDATION_ERROR', 'path is required.');
    }
    stream_uploaded_file($path);
});

route('GET', '/api/system/test-pdf', function (): never {
    $body = '<h2>PDF service works</h2><p>Generated for ' . e(current_user()['name']) . ' on ' . e(date('d M Y, h:i A')) . '.</p>'
        . '<table><tr><th>Item</th><th class="right">Amount</th></tr><tr><td>Consultation</td><td class="right">&#8377; 500.00</td></tr></table>';
    send_pdf(pdf_from_html(pdf_document('Test document', $body)), 'test.pdf', false);
});
