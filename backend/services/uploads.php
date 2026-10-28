<?php
declare(strict_types=1);

/**
 * File upload service. Files go to /uploads (never served directly by the web server; downloads go through
 * an authorised API endpoint). Names are random; the original name is kept only as metadata.
 */

/** Allowed file kinds: extension => allowed MIME types (checked against the file's real content). */
const UPLOAD_KINDS = [
    'document' => ['pdf' => ['application/pdf'], 'jpg' => ['image/jpeg'], 'png' => ['image/png']],
    'image'    => ['jpg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp']],
];

/** Subfolders inside /uploads. */
const UPLOAD_CATEGORIES = ['doctor-documents', 'doctor-photos', 'user-photos', 'hospital-documents', 'store-documents', 'prescriptions', 'misc'];

/**
 * Validate and store one uploaded file ($_FILES entry).
 * @return array{path:string, original_name:string, mime:string, size:int}  path is relative to /uploads
 * @throws ApiException with a user-readable message on any problem
 */
function store_uploaded_file(array $file, string $category, string $kind = 'document'): array
{
    if (!in_array($category, UPLOAD_CATEGORIES, true) || !isset(UPLOAD_KINDS[$kind])) {
        throw new InvalidArgumentException('Bad upload category or kind.');
    }

    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error !== UPLOAD_ERR_OK) {
        $message = match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'The file is too large.',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded.',
            default => 'The upload failed. Please try again.',
        };
        api_fail(422, 'UPLOAD_FAILED', $message);
    }
    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        api_fail(422, 'UPLOAD_FAILED', 'Invalid upload.');
    }

    $size = (int) $file['size'];
    $max = (int) config('upload.max_bytes');
    if ($size <= 0) {
        api_fail(422, 'UPLOAD_EMPTY', 'The file is empty.');
    }
    if ($size > $max) {
        api_fail(422, 'UPLOAD_TOO_LARGE', 'The file is larger than ' . round($max / 1048576) . ' MB.');
    }

    // Decide the type from the file's real content, never from its name or the browser-sent type.
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
    $extension = null;
    foreach (UPLOAD_KINDS[$kind] as $ext => $mimes) {
        if (in_array($mime, $mimes, true)) {
            $extension = $ext;
            break;
        }
    }
    if ($extension === null) {
        api_fail(422, 'UPLOAD_TYPE_NOT_ALLOWED', 'Only ' . strtoupper(implode(', ', array_keys(UPLOAD_KINDS[$kind]))) . ' files are allowed.');
    }
    if ($extension !== 'pdf' && @getimagesize($file['tmp_name']) === false) {
        api_fail(422, 'UPLOAD_TYPE_NOT_ALLOWED', 'The image file is damaged or not a real image.');
    }

    $relative_dir = $category . '/' . date('Y-m');
    $absolute_dir = config('upload.dir') . '/' . $relative_dir;
    if (!is_dir($absolute_dir) && !mkdir($absolute_dir, 0775, true) && !is_dir($absolute_dir)) {
        throw new RuntimeException('Could not create upload directory.');
    }

    $relative = $relative_dir . '/' . bin2hex(random_bytes(16)) . '.' . $extension;
    if (!move_uploaded_file($file['tmp_name'], config('upload.dir') . '/' . $relative)) {
        throw new RuntimeException('Could not save uploaded file.');
    }

    $original = preg_replace('/[^\p{L}\p{N}\s._\-()]/u', '', basename((string) ($file['name'] ?? 'file'))) ?: 'file';
    return [
        'path'          => $relative,
        'original_name' => mb_substr($original, 0, 255),
        'mime'          => $mime,
        'size'          => $size,
    ];
}

/** Resolve a stored relative path to an absolute path, only if it is really inside /uploads. */
function upload_absolute_path(string $relative): ?string
{
    $base = realpath((string) config('upload.dir'));
    $full = realpath($base . '/' . $relative);
    if ($base === false || $full === false || !str_starts_with($full, $base . DIRECTORY_SEPARATOR) || !is_file($full)) {
        return null;
    }
    return $full;
}

function delete_uploaded_file(string $relative): void
{
    $full = upload_absolute_path($relative);
    if ($full !== null) {
        @unlink($full);
    }
}

/**
 * Send a stored file to the browser. Callers must have checked the user may see it.
 * $public_cache: for files anyone may see (e.g. an approved doctor's photo): lets browsers cache it.
 */
function stream_uploaded_file(string $relative, ?string $download_name = null, bool $public_cache = false): never
{
    $full = upload_absolute_path($relative);
    if ($full === null) {
        api_fail(404, 'NOT_FOUND', 'File not found.');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($full) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($full));
    header('X-Content-Type-Options: nosniff');
    header($public_cache ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: private, no-store');
    $name = preg_replace('/[^A-Za-z0-9._\-]/', '_', $download_name ?? basename($full));
    header('Content-Disposition: inline; filename="' . $name . '"');
    readfile($full);
    exit;
}
