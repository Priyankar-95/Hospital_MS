<?php
declare(strict_types=1);

require_once __DIR__ . '/uploads.php';

const DOCTOR_DOC_TYPES = ['DEGREE', 'REGISTRATION', 'CERTIFICATE', 'ID_PROOF', 'OTHER'];
const MAX_DOCTOR_DOCUMENTS = 10;

/** The doctors row that belongs to a user, or null. */
function doctor_for_user(int $user_id): ?array
{
    return db_one(
        'SELECT d.*, s.name AS specialty_name, dist.district_name, st.state_name, st.id AS state_id
         FROM doctors d
         JOIN specialties s ON s.id = d.specialty_id
         JOIN districts dist ON dist.id = d.district_id
         JOIN states st ON st.id = dist.state_id
         WHERE d.user_id = ?',
        [$user_id]
    );
}

/** For DOCTOR-only endpoints that must work for every verification state (status screens, resubmit). */
function require_doctor_record(): array
{
    $user = require_role('DOCTOR');
    $doctor = doctor_for_user((int) $user['id']);
    if ($doctor === null) {
        api_fail(404, 'DOCTOR_PROFILE_MISSING', 'No doctor profile is linked to this account.');
    }
    return $doctor;
}

/**
 * For doctor features that only an APPROVED doctor may use (schedule, fees, appointments...).
 * Until approved the doctor sees only the "waiting for verification" screen, so the server refuses everything else.
 */
function require_approved_doctor(): array
{
    $doctor = require_doctor_record();
    if ($doctor['verification_status'] !== 'APPROVED') {
        api_fail(403, 'DOCTOR_NOT_VERIFIED', 'Your account is not verified yet.');
    }
    return $doctor;
}

function doctor_documents(int $doctor_id): array
{
    return db_all(
        'SELECT id, doc_type, original_name, mime_type, size_bytes, uploaded_at FROM doctor_documents WHERE doctor_id = ? ORDER BY id',
        [$doctor_id]
    );
}

/** URL of a doctor's photo (null when none). The ?v= part changes when the photo changes so browsers refresh it. */
function doctor_photo_url(array $d): ?string
{
    if (empty($d['photo_url'])) {
        return null;
    }
    return '/api/doctors/' . (int) $d['id'] . '/photo?v=' . substr(md5((string) $d['photo_url']), 0, 8);
}

/** Public shape of a doctor record for the doctor's own screens. */
function doctor_self_payload(array $d): array
{
    $hospital_name = $d['hospital_id'] ? db_value('SELECT name FROM hospitals WHERE id = ?', [$d['hospital_id']]) : null;
    return [
        'id'                  => (int) $d['id'],
        'name'                => db_value('SELECT name FROM users WHERE id = ?', [$d['user_id']]),
        'doctor_type'         => $d['doctor_type'],
        'verification_status' => $d['verification_status'],
        'rejection_reason'    => $d['rejection_reason'],
        'specialty'           => ['id' => (int) $d['specialty_id'], 'name' => $d['specialty_name']],
        'location'            => ['state_id' => (int) $d['state_id'], 'state' => $d['state_name'], 'district_id' => (int) $d['district_id'], 'district' => $d['district_name']],
        'qualifications'      => $d['qualifications'],
        'about'               => $d['about'],
        'clinic_name'         => $d['clinic_name'],
        'address'             => $d['address'],
        'facilities'          => $d['facilities'],
        'hospital_name'       => $hospital_name,
        'photo_url'           => doctor_photo_url($d),
        'documents'           => doctor_documents((int) $d['id']),
    ];
}

/**
 * Validate the uploaded certificate files together with their document types (document_types[] in the form).
 * Stores the files and returns their metadata. Throws ApiException before anything is stored if any file is bad.
 * @return array<int,array{type:string,stored:array}>
 */
function store_doctor_documents(): array
{
    $files = uploaded_files('documents');
    $types = $_POST['document_types'] ?? [];
    $types = is_array($types) ? $types : [];

    if (count($files) > MAX_DOCTOR_DOCUMENTS) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['documents' => 'You can upload at most ' . MAX_DOCTOR_DOCUMENTS . ' files.']);
    }
    if (config('require_verification_documents') && count($files) === 0) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['documents' => 'Upload at least one certificate or registration document.']);
    }

    $stored = [];
    try {
        foreach ($files as $i => $file) {
            $type = $types[$i] ?? 'CERTIFICATE';
            if (!is_string($type) || !in_array($type, DOCTOR_DOC_TYPES, true)) {
                api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['documents' => 'Choose a valid type for every file.']);
            }
            try {
                $stored[] = ['type' => $type, 'stored' => store_uploaded_file($file, 'doctor-documents', 'document')];
            } catch (ApiException $e) {
                // Say which file was the problem
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

function insert_doctor_documents(int $doctor_id, array $stored): void
{
    foreach ($stored as $s) {
        db_query(
            'INSERT INTO doctor_documents (doctor_id, doc_type, file_url, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
            [$doctor_id, $s['type'], $s['stored']['path'], $s['stored']['original_name'], $s['stored']['mime'], $s['stored']['size']]
        );
    }
}

function delete_stored_documents(array $stored): void
{
    foreach ($stored as $s) {
        delete_uploaded_file($s['stored']['path']);
    }
}

/** Can this user see this doctor's documents? The doctor, the Branch Admin of the doctor's district, or a Super Admin. */
function can_view_doctor_documents(array $user, array $doctor): bool
{
    if ($user['role'] === 'SUPER_ADMIN') {
        return true;
    }
    if ($user['role'] === 'DOCTOR') {
        return (int) $doctor['user_id'] === (int) $user['id'];
    }
    if ($user['role'] === 'BRANCH_ADMIN') {
        return db_value(
            'SELECT 1 FROM branch_admin_districts WHERE branch_admin_id = ? AND district_id = ?',
            [$user['id'], $doctor['district_id']]
        ) !== null;
    }
    return false;
}
