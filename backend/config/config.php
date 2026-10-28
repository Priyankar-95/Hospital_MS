<?php
declare(strict_types=1);

/**
 * Config loader. Reads .env once (via vlucas/phpdotenv) and exposes config().
 * Usage: config('db.host'), config('app.debug'), env('GOOGLE_CLIENT_ID').
 */

function project_root(): string
{
    return dirname(__DIR__, 2);
}

function load_env(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;

    $root = project_root();
    if (!is_file($root . '/vendor/autoload.php')) {
        throw new RuntimeException('Dependencies missing. Run "composer install" in the project root.');
    }
    require_once $root . '/vendor/autoload.php';

    if (!is_file($root . '/.env')) {
        throw new RuntimeException('.env file missing. Copy .env.example to .env and fill it in.');
    }
    Dotenv\Dotenv::createImmutable($root)->safeLoad();
}

function env(string $key, ?string $default = null): ?string
{
    load_env();
    // A real environment variable (set by the server / hosting panel) wins over the .env file.
    $real = getenv($key);
    $value = ($real !== false && $real !== '') ? $real : ($_ENV[$key] ?? $_SERVER[$key] ?? null);
    if ($value === null || $value === '') {
        return $default;
    }
    return (string) $value;
}

function env_bool(string $key, bool $default = false): bool
{
    $value = env($key);
    if ($value === null) {
        return $default;
    }
    return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
}

function config(?string $path = null, mixed $default = null): mixed
{
    static $config = null;
    if ($config === null) {
        $config = [
            'app' => [
                'env'   => env('APP_ENV', 'production'),
                'debug' => env_bool('APP_DEBUG', false),
                'name'  => env('APP_NAME', 'Liberty Health Care'),
                'url'   => rtrim((string) env('APP_URL', 'http://localhost:8000'), '/'),
            ],
            'db' => [
                'host' => env('DB_HOST', '127.0.0.1'),
                'port' => (int) env('DB_PORT', '3306'),
                'name' => env('DB_NAME', 'hospital_booking'),
                'user' => env('DB_USER', 'root'),
                'pass' => env('DB_PASS', ''),
            ],
            'session' => [
                'name'          => env('SESSION_NAME', 'hb_session'),
                'lifetime_min'  => (int) env('SESSION_LIFETIME_MINUTES', '120'),
                'secure_cookie' => env_bool('SESSION_SECURE_COOKIE', false),
            ],
            'google' => [
                'client_id'     => env('GOOGLE_CLIENT_ID', ''),
                'client_secret' => env('GOOGLE_CLIENT_SECRET', ''),
                'redirect_uri'  => env('GOOGLE_REDIRECT_URI', ''),
            ],
            'razorpay' => [
                'key_id'         => env('RAZORPAY_KEY_ID', ''),
                'key_secret'     => env('RAZORPAY_KEY_SECRET', ''),
                'webhook_secret' => env('RAZORPAY_WEBHOOK_SECRET', ''),
            ],
            'mail' => [
                'host'         => env('SMTP_HOST', ''),
                'port'         => (int) env('SMTP_PORT', '587'),
                'encryption'   => env('SMTP_ENCRYPTION', 'tls'),
                'username'     => env('SMTP_USERNAME', ''),
                'password'     => env('SMTP_PASSWORD', ''),
                'from_address' => env('MAIL_FROM_ADDRESS', ''),
                'from_name'    => env('MAIL_FROM_NAME', 'Liberty Health Care'),
            ],
            'require_verification_documents' => env_bool('REQUIRE_VERIFICATION_DOCUMENTS', true),
            'upload' => [
                'max_bytes' => (int) env('UPLOAD_MAX_MB', '5') * 1024 * 1024,
                'dir'       => project_root() . '/uploads',
            ],
        ];
    }

    if ($path === null) {
        return $config;
    }
    $value = $config;
    foreach (explode('.', $path) as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }
    return $value;
}
