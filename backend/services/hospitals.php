<?php
declare(strict_types=1);

require_once __DIR__ . '/uploads.php';

/**
 * Hospital onboarding: a Branch Admin invites a hospital, the invited person accepts and fills in the details
 * (the hospital is then PENDING), and the Branch Admin approves or rejects it.
 */

const HOSPITAL_DOC_TYPES = ['LICENSE', 'REGISTRATION', 'CERTIFICATE', 'OTHER'];
const MAX_HOSPITAL_DOCUMENTS = 10;
const HOSPITAL_INVITE_DAYS = 7;

// ---- the hospital of a Hospital Admin ----------------------------------------------------------

/** The hospitals row of a Hospital Admin (any verification state), or null. */
function hospital_for_user(int $user_id): ?array
{
    return db_one(
        'SELECT h.*, dist.district_name, st.state_name, st.id AS state_id
         FROM hospitals h
         JOIN districts dist ON dist.id = h.district_id
         JOIN states st ON st.id = dist.state_id
         WHERE h.admin_user_id = ?',
        [$user_id]
    );
}

/** For HOSPITAL_ADMIN endpoints that must work in every verification state (status screens, resubmit). */
function require_hospital_record(): array
{
    $user = require_role('HOSPITAL_ADMIN');
    $hospital = hospital_for_user((int) $user['id']);
    if ($hospital === null) {
        api_fail(404, 'HOSPITAL_PROFILE_MISSING', 'No hospital is linked to this account.');
    }
    return $hospital;
}

/** For hospital features only an APPROVED hospital may use. Until then the admin sees only the waiting screen. */
function require_approved_hospital(): array
{
    $hospital = require_hospital_record();
    if ($hospital['verification_status'] !== 'APPROVED') {
        api_fail(403, 'HOSPITAL_NOT_VERIFIED', 'Your hospital is not verified yet.');
    }
    return $hospital;
}

function hospital_documents(int $hospital_id): array
{
    return db_all(
        'SELECT id, doc_type, original_name, mime_type, size_bytes, uploaded_at FROM hospital_documents WHERE hospital_id = ? ORDER BY id',
        [$hospital_id]
    );
}

/** The hospital as its own admin sees it. */
function hospital_self_payload(array $h): array
{
    return [
        'id'                  => (int) $h['id'],
        'name'                => $h['name'],
        'verification_status' => $h['verification_status'],
        'rejection_reason'    => $h['rejection_reason'],
        'address'             => $h['address'],
        'email'               => $h['email'],
        'verified_at'         => $h['verified_at'],
        'phone'               => $h['phone'],
        'location'            => ['state_id' => (int) $h['state_id'], 'state' => $h['state_name'], 'district_id' => (int) $h['district_id'], 'district' => $h['district_name']],
        'documents'           => hospital_documents((int) $h['id']),
    ];
}

// ---- documents ---------------------------------------------------------------------------------

/**
 * Validate and store the uploaded files (documents[] with document_types[]). Throws before anything is kept if a file is bad.
 * @return array<int,array{type:string,stored:array}>
 */
function store_hospital_documents(): array
{
    $files = uploaded_files('documents');
    $types = $_POST['document_types'] ?? [];
    $types = is_array($types) ? $types : [];

    if (count($files) > MAX_HOSPITAL_DOCUMENTS) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['documents' => 'You can upload at most ' . MAX_HOSPITAL_DOCUMENTS . ' files.']);
    }
    if (config('require_verification_documents') && count($files) === 0) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['documents' => 'Upload at least one license or registration document.']);
    }

    $stored = [];
    try {
        foreach ($files as $i => $file) {
            $type = $types[$i] ?? 'LICENSE';
            if (!is_string($type) || !in_array($type, HOSPITAL_DOC_TYPES, true)) {
                api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['documents' => 'Choose a valid type for every file.']);
            }
            try {
                $stored[] = ['type' => $type, 'stored' => store_uploaded_file($file, 'hospital-documents', 'document')];
            } catch (ApiException $e) {
                api_fail($e->status, $e->error_code, $e->getMessage(), ['documents' => ($file['name'] ?? 'File') . ': ' . $e->getMessage()]);
            }
        }
    } catch (Throwable $e) {
        foreach ($stored as $s) {
            delete_uploaded_file($s['stored']['path']);
        }
        throw $e;
    }
    return $stored;
}

function insert_hospital_documents(int $hospital_id, array $stored): void
{
    foreach ($stored as $s) {
        db_query(
            'INSERT INTO hospital_documents (hospital_id, doc_type, file_url, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
            [$hospital_id, $s['type'], $s['stored']['path'], $s['stored']['original_name'], $s['stored']['mime'], $s['stored']['size']]
        );
    }
}

function delete_stored_hospital_documents(array $stored): void
{
    foreach ($stored as $s) {
        delete_uploaded_file($s['stored']['path']);
    }
}

/** Is this Branch Admin in charge of this district? */
function branch_admin_covers(int $branch_admin_id, int $district_id): bool
{
    return db_value('SELECT 1 FROM branch_admin_districts WHERE branch_admin_id = ? AND district_id = ?', [$branch_admin_id, $district_id]) !== null;
}

/** Can this user see this hospital's documents? Its admin, the Branch Admin of its district, or a Super Admin. */
function can_view_hospital_documents(array $user, array $hospital): bool
{
    return match ($user['role']) {
        'SUPER_ADMIN'    => true,
        'HOSPITAL_ADMIN' => (int) $hospital['admin_user_id'] === (int) $user['id'],
        'BRANCH_ADMIN'   => branch_admin_covers((int) $user['id'], (int) $hospital['district_id']),
        default          => false,
    };
}

// ---- invites -----------------------------------------------------------------------------------

/** A fresh random token (shown only in the email link) and the hash that is stored. */
function new_invite_token(): array
{
    $token = bin2hex(random_bytes(24));
    return [$token, hash('sha256', $token)];
}

function hospital_invite_url(string $token): string
{
    return config('app.url') . '/frontend/shared/hospital-invite.html?token=' . $token;
}

/** INVITED turns into EXPIRED by the clock, so nothing has to run in the background. */
function invite_effective_status(array $invite): string
{
    if ($invite['status'] === 'INVITED' && strtotime((string) $invite['expires_at']) < time()) {
        return 'EXPIRED';
    }
    return $invite['status'];
}

/** The invite for a token from a link, or null when the token is unknown or malformed. */
function find_invite_by_token(string $token): ?array
{
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
        return null;
    }
    return db_one(
        'SELECT i.*, dist.district_name, st.state_name, ba.name AS invited_by
         FROM hospital_invites i
         JOIN districts dist ON dist.id = i.district_id
         JOIN states st ON st.id = dist.state_id
         JOIN users ba ON ba.id = i.branch_admin_id
         WHERE i.token_hash = ?',
        [hash('sha256', $token)]
    );
}

/** Fails with a clear message unless the invite can still be used. */
function assert_invite_usable(array $invite): void
{
    $status = invite_effective_status($invite);
    if ($status === 'ACCEPTED') {
        api_fail(410, 'INVITE_USED', 'This invitation has already been used. If it was you, log in from the Staff tab.');
    }
    if ($status === 'REVOKED') {
        api_fail(410, 'INVITE_REVOKED', 'This invitation was withdrawn. Please contact the person who invited you.');
    }
    if ($status === 'EXPIRED') {
        api_fail(410, 'INVITE_EXPIRED', 'This invitation has expired. Ask the Branch Admin to send a new one.');
    }
}
