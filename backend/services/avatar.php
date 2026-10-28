<?php
declare(strict_types=1);

require_once __DIR__ . '/uploads.php';

/**
 * Profile pictures. Every account can have one. For doctors the picture is their profile photo
 * (doctors.photo_url, also shown to patients); for everyone else it is private to the account (users.avatar_path).
 */

/** Stored path (relative to /uploads) of this user's picture, or null. */
function avatar_path_for(array $user): ?string
{
    $path = $user['role'] === 'DOCTOR'
        ? db_value('SELECT photo_url FROM doctors WHERE user_id = ?', [$user['id']])
        : db_value('SELECT avatar_path FROM users WHERE id = ?', [$user['id']]);
    return $path !== null && $path !== '' ? (string) $path : null;
}

/** URL the signed-in user's own picture is served from (null when none). ?v= changes with the picture. */
function avatar_url_for(array $user): ?string
{
    $path = avatar_path_for($user);
    return $path === null ? null : '/api/account/avatar?v=' . substr(md5($path), 0, 8);
}

/** Save an uploaded picture for this user and delete the previous file. */
function save_avatar(array $user, array $file): void
{
    $stored = store_uploaded_file($file, 'user-photos', 'image');
    $old = avatar_path_for($user);
    if ($user['role'] === 'DOCTOR') {
        $changed = db_query('UPDATE doctors SET photo_url = ? WHERE user_id = ?', [$stored['path'], $user['id']])->rowCount();
    } else {
        $changed = db_query('UPDATE users SET avatar_path = ? WHERE id = ?', [$stored['path'], $user['id']])->rowCount();
    }
    if ($changed === 0) {
        delete_uploaded_file($stored['path']);
        api_fail(404, 'NOT_FOUND', 'Account not found.');
    }
    if ($old !== null) {
        delete_uploaded_file($old);
    }
}

function remove_avatar(array $user): void
{
    $old = avatar_path_for($user);
    if ($old === null) {
        return;
    }
    if ($user['role'] === 'DOCTOR') {
        db_query('UPDATE doctors SET photo_url = NULL WHERE user_id = ?', [$user['id']]);
    } else {
        db_query('UPDATE users SET avatar_path = NULL WHERE id = ?', [$user['id']]);
    }
    delete_uploaded_file($old);
}
