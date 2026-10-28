<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/google_oauth.php';
require_once __DIR__ . '/../../services/avatar.php';

function user_payload(array $user): array
{
    $payload = [
        'id'    => (int) $user['id'],
        'role'  => $user['role'],
        'name'  => $user['name'],
        'email' => $user['email'],
        'home'  => role_home_path($user['role']),
        'avatar_url' => avatar_url_for($user),
    ];
    // Doctors only get their portal once approved; the frontend uses this to show just the status screen until then.
    if ($user['role'] === 'DOCTOR') {
        $payload['doctor_status'] = db_value('SELECT verification_status FROM doctors WHERE user_id = ?', [$user['id']]);
    }
    // Same for a Hospital Admin: only the status screen until the Branch Admin approves the hospital.
    if ($user['role'] === 'HOSPITAL_ADMIN') {
        $payload['hospital_status'] = db_value('SELECT verification_status FROM hospitals WHERE admin_user_id = ?', [$user['id']]);
    }
    return $payload;
}

// Public: gives the browser a CSRF token (and tells it whether someone is logged in).
route('GET', '/api/auth/me', function (): array {
    $user = current_user();
    return [
        'user'       => $user ? user_payload($user) : null,
        'csrf_token' => csrf_token(),
    ];
}, ['auth' => false]);

route('POST', '/api/auth/register', function (): array {
    // Phase 0: public sign-up creates PATIENT accounts. Doctor / hospital / vendor accounts are created by
    // their own registration forms in later phases (they need documents attached); staff accounts are created by admins.
    $v = new Validator(request_body());
    $name = $v->string('name', 2, 150);
    $email = $v->email();
    $password = $v->password();
    $phone = $v->phone('phone');
    $v->fail_if_invalid();

    if (db_value('SELECT 1 FROM users WHERE email = ?', [$email]) !== null) {
        api_fail(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try logging in.');
    }
    $id = create_user_account('PATIENT', $name, $email, $password, $phone, 'EMAIL');
    login_user($id);

    $user = current_user();
    return ['user' => user_payload($user), 'csrf_token' => csrf_token()];
}, ['auth' => false]);

/** The login tab the user picked (PATIENT | DOCTOR | STAFF), or null if the client did not send one. */
function requested_login_group(array $input): ?string
{
    $group = $input['role_group'] ?? null;
    if ($group === null || $group === '') {
        return null;
    }
    if (!is_string($group) || !in_array($group, LOGIN_GROUPS, true)) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['role_group' => 'Invalid choice.']);
    }
    return $group;
}

route('POST', '/api/auth/login', function (): array {
    $body = request_body();
    $v = new Validator($body);
    $email = $v->email();
    $password = $body['password'] ?? '';
    if (!is_string($password) || $password === '') {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['password' => 'This field is required.']);
    }
    $group = requested_login_group($body);
    $v->fail_if_invalid();

    $row = db_one('SELECT id, role, password_hash, status FROM users WHERE email = ?', [$email]);

    // Product decision (owner request): tell the visitor when no account exists so they can register.
    // This does reveal whether an email is registered; rate limiting is planned for Phase 5.
    if ($row === null) {
        $who = $group !== null ? strtolower(login_group_label($group)) . ' ' : '';
        api_fail(404, 'ACCOUNT_NOT_FOUND', "No {$who}account exists for this email.");
    }

    // Right email, wrong tab: say which tab to use. Only revealed after the password is correct,
    // so a stranger cannot learn which role an email has.
    $password_ok = $row['password_hash'] !== null && password_verify($password, $row['password_hash']);
    if (!$password_ok) {
        // Google-only accounts have no password
        if ($row['password_hash'] === null) {
            api_fail(401, 'USE_GOOGLE', 'This account uses Google sign-in. Choose "Continue with Google".');
        }
        api_fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    if ($group !== null && role_group($row['role']) !== $group) {
        api_fail(
            403,
            'WRONG_ROLE_TAB',
            'This email is registered as a ' . login_group_label(role_group($row['role'])) . ' account. Choose the "' . login_group_label(role_group($row['role'])) . '" tab to log in.'
        );
    }
    if ($row['status'] !== 'ACTIVE') {
        api_fail(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact support.');
    }
    if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
        db_query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $row['id']]);
    }

    login_user((int) $row['id']);
    $user = current_user();
    return ['user' => user_payload($user), 'csrf_token' => csrf_token()];
}, ['auth' => false]);

route('POST', '/api/auth/logout', function (): array {
    logout_user();
    session_boot();           // fresh anonymous session so the page can fetch a new CSRF token
    return ['logged_out' => true];
}, ['auth' => false]);

// --- Google OAuth -----------------------------------------------------------

route('GET', '/api/auth/google', function (): never {
    if (!google_is_configured()) {
        api_fail(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not set up yet.');
    }
    $group = $_GET['role_group'] ?? null;
    $_SESSION['google_state'] = bin2hex(random_bytes(24));
    $_SESSION['google_return'] = safe_return_path($_GET['return_to'] ?? null);
    $_SESSION['google_group'] = is_string($group) && in_array($group, LOGIN_GROUPS, true) ? $group : null;
    redirect_to(google_authorization_url($_SESSION['google_state']));
}, ['auth' => false]);

route('GET', '/api/auth/google-callback', function (): never {
    $expected = $_SESSION['google_state'] ?? '';
    $return_to = $_SESSION['google_return'] ?? null;
    $group = $_SESSION['google_group'] ?? null;
    unset($_SESSION['google_state'], $_SESSION['google_return'], $_SESSION['google_group']);

    // The login screen re-opens on the tab the visitor used, with the reason.
    $fail = function (string $reason) use ($group): never {
        redirect_to('/frontend/shared/login.html?error=' . urlencode($reason) . ($group ? '&role_group=' . urlencode($group) : ''));
    };

    if (!google_is_configured()) {
        $fail('google_not_configured');
    }
    if (isset($_GET['error'])) {
        $fail('google_cancelled');
    }
    $state = $_GET['state'] ?? '';
    $code = $_GET['code'] ?? '';
    if ($expected === '' || !is_string($state) || !hash_equals($expected, $state) || !is_string($code) || $code === '') {
        $fail('google_state_mismatch');
    }

    try {
        $profile = google_fetch_profile($code);
        $existing = google_find_user($profile);

        if ($existing !== null) {
            // Right Google account, wrong tab
            if ($group !== null && role_group($existing['role']) !== $group) {
                $fail('google_wrong_role');
            }
            $user_id = google_link_user($existing, $profile);
        } elseif ($group === 'DOCTOR' || $group === 'STAFF') {
            // Google can sign up patients only. Doctors need their registration form; staff are created by admins.
            $fail('google_no_account');
        } else {
            $user_id = google_create_patient($profile);
        }
    } catch (Throwable $e) {
        error_log('Google login failed: ' . $e->getMessage());
        $fail('google_failed');
    }

    login_user($user_id);
    $user = current_user();
    redirect_to($return_to ?? role_home_path($user['role']));
}, ['auth' => false]);
