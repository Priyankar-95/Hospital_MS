<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/avatar.php';

// "Profile settings" for every signed-in account: name, phone and (for email accounts) password.
// Doctors keep using their own profile page, where the locked-after-approval rules apply.

function account_payload(int $user_id): array
{
    $u = db_one('SELECT id, role, name, email, phone, auth_provider FROM users WHERE id = ?', [$user_id]);
    return [
        'id'            => (int) $u['id'],
        'role'          => $u['role'],
        'name'          => $u['name'],
        'email'         => $u['email'],
        'phone'         => $u['phone'],
        'auth_provider' => $u['auth_provider'],
        'can_change_password' => $u['auth_provider'] === 'EMAIL',
        'avatar_url'    => avatar_url_for($u),
    ];
}

route('GET', '/api/account', function (): array {
    return ['account' => account_payload((int) require_login()['id'])];
});

route('POST', '/api/account', function (): array {
    $user = require_login();
    if ($user['role'] === 'DOCTOR') {
        api_fail(403, 'FORBIDDEN', 'Doctors edit their details on the doctor profile page.');
    }
    $v = new Validator(request_body());
    $name = $v->string('name', 2, 150);
    $phone = $v->phone('phone');
    $v->fail_if_invalid();
    db_query('UPDATE users SET name = ?, phone = ? WHERE id = ?', [$name, $phone, $user['id']]);
    return ['account' => account_payload((int) $user['id'])];
});

route('POST', '/api/account/password', function (): array {
    $user = require_login();
    $row = db_one('SELECT password_hash, auth_provider FROM users WHERE id = ?', [$user['id']]);
    if ($row['auth_provider'] !== 'EMAIL' || empty($row['password_hash'])) {
        api_fail(409, 'USE_GOOGLE', 'This account signs in with Google, so it has no password to change.');
    }
    $body = request_body();
    $v = new Validator($body);
    $new = $v->password('new_password');
    $v->fail_if_invalid();
    $current = is_string($body['current_password'] ?? null) ? $body['current_password'] : '';
    if (!password_verify($current, $row['password_hash'])) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['current_password' => 'Your current password is not right.']);
    }
    db_query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    return ['changed' => true];
});

// The signed-in user's own profile picture (never public; doctors' public photo is served by /api/doctors/{id}/photo).
route('GET', '/api/account/avatar', function (): never {
    $path = avatar_path_for(require_login());
    if ($path === null) {
        api_fail(404, 'NOT_FOUND', 'No profile picture.');
    }
    stream_uploaded_file($path);
});

// Upload or replace the picture. Multipart field "photo" (JPG, PNG or WEBP, size limit as for all uploads).
route('POST', '/api/account/avatar', function (): array {
    $user = require_login();
    if (!isset($_FILES['photo'])) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['photo' => 'Choose a photo to upload.']);
    }
    save_avatar($user, $_FILES['photo']);
    return ['account' => account_payload((int) $user['id'])];
});

route('DELETE', '/api/account/avatar', function (): array {
    $user = require_login();
    remove_avatar($user);
    return ['account' => account_payload((int) $user['id'])];
});
