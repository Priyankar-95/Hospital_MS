<?php
declare(strict_types=1);

/** Sessions, login state and CSRF. */

function session_boot(): void
{
    if (session_status() === PHP_SESSION_ACTIVE || PHP_SAPI === 'cli') {
        return;
    }
    $c = config('session');
    $lifetime = $c['lifetime_min'] * 60;

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    session_name($c['name']);
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $c['secure_cookie'],
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();

    // Idle timeout
    $now = time();
    if (isset($_SESSION['last_activity']) && $now - (int) $_SESSION['last_activity'] > $lifetime) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_activity'] = $now;
}

/** The logged-in user row (without password hash), or null. Re-read from DB so suspensions and role changes apply at once. */
function current_user(): ?array
{
    static $cache = [];
    $id = $_SESSION['user_id'] ?? null;
    if ($id === null) {
        return null;
    }
    if (!array_key_exists($id, $cache)) {
        $cache[$id] = db_one(
            'SELECT id, role, auth_provider, email, name, phone, status FROM users WHERE id = ?',
            [$id]
        );
    }
    $user = $cache[$id];
    if ($user === null || $user['status'] !== 'ACTIVE') {
        logout_user();
        return null;
    }
    return $user;
}

/** Start an authenticated session. Always regenerates the session ID (prevents session fixation). */
function login_user(int $user_id): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user_id;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    db_query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user_id]);
}

function logout_user(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'],
            'httponly' => true, 'samesite' => 'Lax']);
    }
    session_destroy();
}

function require_login(): array
{
    $user = current_user();
    if ($user === null) {
        api_fail(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    }
    return $user;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf'] ?? '';
    if ($expected === '' || !is_string($sent) || !hash_equals($expected, $sent)) {
        api_fail(403, 'CSRF_INVALID', 'Security token missing or expired. Please refresh the page and try again.');
    }
}

/** Create a user row. Returns the new user id. Caller has already validated input. */
function create_user_account(string $role, string $name, string $email, ?string $password, ?string $phone, string $provider, ?string $google_id = null): int
{
    db_query(
        'INSERT INTO users (role, auth_provider, google_id, email, password_hash, name, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$role, $provider, $google_id, $email, $password !== null ? password_hash($password, PASSWORD_DEFAULT) : null, $name, $phone]
    );
    return (int) db()->lastInsertId();
}
