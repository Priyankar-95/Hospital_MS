<?php
declare(strict_types=1);

/** Google OAuth2 authorization-code flow (server side). No token is ever sent to the browser. */

const GOOGLE_AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function google_is_configured(): bool
{
    return config('google.client_id') !== '' && config('google.client_secret') !== '' && config('google.redirect_uri') !== '';
}

function google_authorization_url(string $state): string
{
    return GOOGLE_AUTH_URL . '?' . http_build_query([
        'client_id'     => config('google.client_id'),
        'redirect_uri'  => config('google.redirect_uri'),
        'response_type' => 'code',
        'scope'         => 'openid email profile',
        'state'         => $state,
        'prompt'        => 'select_account',
    ]);
}

/** @return array{status:int, body:array} */
function google_http(string $method, string $url, array $form = [], array $headers = []): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form));
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Google request failed: ' . $err);
    }
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $body = json_decode((string) $raw, true);
    return ['status' => $status, 'body' => is_array($body) ? $body : []];
}

/**
 * Exchange the authorization code for the Google profile.
 * @return array{sub:string, email:string, name:string}
 */
function google_fetch_profile(string $code): array
{
    $token = google_http('POST', GOOGLE_TOKEN_URL, [
        'code'          => $code,
        'client_id'     => config('google.client_id'),
        'client_secret' => config('google.client_secret'),
        'redirect_uri'  => config('google.redirect_uri'),
        'grant_type'    => 'authorization_code',
    ]);
    if ($token['status'] !== 200 || empty($token['body']['access_token'])) {
        throw new RuntimeException('Google token exchange failed: ' . ($token['body']['error'] ?? $token['status']));
    }

    $info = google_http('GET', GOOGLE_USERINFO_URL, [], ['Authorization: Bearer ' . $token['body']['access_token']]);
    $p = $info['body'];
    if ($info['status'] !== 200 || empty($p['sub']) || empty($p['email'])) {
        throw new RuntimeException('Google profile could not be read.');
    }
    if (empty($p['email_verified'])) {
        throw new RuntimeException('Google email is not verified.');
    }
    return [
        'sub'   => (string) $p['sub'],
        'email' => strtolower((string) $p['email']),
        'name'  => (string) ($p['name'] ?? $p['email']),
    ];
}

/** The local user for a Google profile: by google_id first, then by the same (Google-verified) email. */
function google_find_user(array $profile): ?array
{
    $user = db_one('SELECT id, role, status FROM users WHERE google_id = ?', [$profile['sub']]);
    if ($user === null) {
        $user = db_one('SELECT id, role, status FROM users WHERE email = ?', [$profile['email']]);
    }
    return $user;
}

/** Make sure the account is linked to this Google identity, and is allowed to log in. */
function google_link_user(array $user, array $profile): int
{
    if ($user['status'] !== 'ACTIVE') {
        throw new RuntimeException('Account suspended.');
    }
    db_query('UPDATE users SET google_id = ? WHERE id = ? AND google_id IS NULL', [$profile['sub'], $user['id']]);
    return (int) $user['id'];
}

function google_create_patient(array $profile): int
{
    return create_user_account('PATIENT', mb_substr($profile['name'], 0, 150), $profile['email'], null, null, 'GOOGLE', $profile['sub']);
}

/**
 * Find or create the local user for a Google profile.
 * 1) known google_id  2) same email (link Google to that account)  3) brand-new PATIENT.
 */
function google_find_or_create_user(array $profile): int
{
    $user = google_find_user($profile);
    return $user !== null ? google_link_user($user, $profile) : google_create_patient($profile);
}
