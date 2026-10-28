<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/doctors.php';

/** Validate the profile fields shared by registration and resubmission. */
function read_doctor_profile_input(Validator $v): array
{
    $profile = [
        'specialty_id'   => $v->int('specialty_id'),
        'district_id'    => $v->int('district_id'),
        'qualifications' => $v->string('qualifications', 2, 500),
        'about'          => $v->string('about', 1, 2000, false),
        'clinic_name'    => $v->string('clinic_name', 2, 200),
        'address'        => $v->string('address', 5, 500),
    ];
    return $profile;
}

function assert_profile_references_exist(Validator $v, array $profile): void
{
    if ($profile['specialty_id'] !== null && db_value('SELECT 1 FROM specialties WHERE id = ?', [$profile['specialty_id']]) === null) {
        $v->add_error('specialty_id', 'Choose a specialty from the list.');
    }
    if ($profile['district_id'] !== null && db_value('SELECT 1 FROM districts WHERE id = ?', [$profile['district_id']]) === null) {
        $v->add_error('district_id', 'Choose a district from the list.');
    }
    $v->fail_if_invalid();
}

// Private-chamber doctor registration. Multipart form: account fields + profile fields + documents[] with document_types[].
route('POST', '/api/doctors/register', function (): array {
    $v = new Validator(request_body());
    $name = $v->string('name', 2, 150);
    $email = $v->email();
    $password = $v->password();
    $phone = $v->phone('phone');
    $profile = read_doctor_profile_input($v);
    $v->fail_if_invalid();
    assert_profile_references_exist($v, $profile);

    if (db_value('SELECT 1 FROM users WHERE email = ?', [$email]) !== null) {
        api_fail(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try logging in.');
    }

    $stored = store_doctor_documents();
    try {
        $user_id = db_transaction(function () use ($name, $email, $password, $phone, $profile, $stored): int {
            $user_id = create_user_account('DOCTOR', $name, $email, $password, $phone, 'EMAIL');
            db_query(
                "INSERT INTO doctors (user_id, district_id, hospital_id, doctor_type, specialty_id, about, qualifications, clinic_name, address, verification_status)
                 VALUES (?, ?, NULL, 'PRIVATE', ?, ?, ?, ?, ?, 'PENDING')",
                [$user_id, $profile['district_id'], $profile['specialty_id'], $profile['about'], $profile['qualifications'], $profile['clinic_name'], $profile['address']]
            );
            insert_doctor_documents((int) db()->lastInsertId(), $stored);
            return $user_id;
        });
    } catch (Throwable $e) {
        delete_stored_documents($stored);
        throw $e;
    }

    login_user($user_id);
    return ['user' => user_payload(current_user()), 'csrf_token' => csrf_token()];
}, ['auth' => false]);

// The doctor's own record (works for every verification state: this feeds the waiting / rejected screens).
route('GET', '/api/doctors/me', function (): array {
    return ['doctor' => doctor_self_payload(require_doctor_record())];
}, ['roles' => ['DOCTOR']]);

// A rejected doctor corrects their details / adds documents and sends the application back for review.
route('POST', '/api/doctors/me/resubmit', function (): array {
    $doctor = require_doctor_record();
    if ($doctor['verification_status'] !== 'REJECTED') {
        api_fail(409, 'NOT_REJECTED', 'Only a rejected application can be resubmitted.');
    }
    $v = new Validator(request_body());
    $profile = read_doctor_profile_input($v);
    $v->fail_if_invalid();
    assert_profile_references_exist($v, $profile);

    $stored = store_doctor_documents();
    try {
        db_transaction(function () use ($doctor, $profile, $stored): void {
            db_query(
                "UPDATE doctors SET district_id = ?, specialty_id = ?, about = ?, qualifications = ?, clinic_name = ?, address = ?,
                        verification_status = 'PENDING', rejection_reason = NULL, verified_by = NULL, verified_at = NULL
                 WHERE id = ? AND verification_status = 'REJECTED'",
                [$profile['district_id'], $profile['specialty_id'], $profile['about'], $profile['qualifications'], $profile['clinic_name'], $profile['address'], $doctor['id']]
            );
            insert_doctor_documents((int) $doctor['id'], $stored);
        });
    } catch (Throwable $e) {
        delete_stored_documents($stored);
        throw $e;
    }
    return ['doctor' => doctor_self_payload(doctor_for_user((int) $doctor['user_id']))];
}, ['roles' => ['DOCTOR']]);

// --- Profile (approved doctors) ---------------------------------------------
// Editable after approval: about (everyone), and for private doctors also clinic name, address and facilities.
// Locked after approval: specialty, district and qualifications. Changing them would bypass the credential check.

route('POST', '/api/doctors/me/profile', function (): array {
    $doctor = require_approved_doctor();
    $input = request_body();
    $v = new Validator($input);
    $about = $v->string('about', 1, 2000, false);
    $changes = ['about' => $about];

    if ($doctor['doctor_type'] === 'PRIVATE') {
        $changes['clinic_name'] = $v->string('clinic_name', 2, 200);
        $changes['address'] = $v->string('address', 5, 500);
        $changes['facilities'] = $v->string('facilities', 1, 1000, false);
    }
    $v->fail_if_invalid();

    $sets = implode(', ', array_map(fn (string $c): string => "{$c} = ?", array_keys($changes)));
    db_query("UPDATE doctors SET {$sets} WHERE id = ?", [...array_values($changes), $doctor['id']]);
    return ['doctor' => doctor_self_payload(doctor_for_user((int) $doctor['user_id']))];
}, ['roles' => ['DOCTOR']]);

route('POST', '/api/doctors/me/photo', function (): array {
    $doctor = require_approved_doctor();
    if (!isset($_FILES['photo'])) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['photo' => 'Choose a photo to upload.']);
    }
    $stored = store_uploaded_file($_FILES['photo'], 'doctor-photos', 'image');
    $old = $doctor['photo_url'];
    db_query('UPDATE doctors SET photo_url = ? WHERE id = ?', [$stored['path'], $doctor['id']]);
    if ($old) {
        delete_uploaded_file($old);
    }
    return ['doctor' => doctor_self_payload(doctor_for_user((int) $doctor['user_id']))];
}, ['roles' => ['DOCTOR']]);

route('DELETE', '/api/doctors/me/photo', function (): array {
    $doctor = require_approved_doctor();
    if ($doctor['photo_url']) {
        db_query('UPDATE doctors SET photo_url = NULL WHERE id = ?', [$doctor['id']]);
        delete_uploaded_file($doctor['photo_url']);
    }
    return ['doctor' => doctor_self_payload(doctor_for_user((int) $doctor['user_id']))];
}, ['roles' => ['DOCTOR']]);

// Add more certificates after approval. Multipart: documents[] + document_types[].
route('POST', '/api/doctors/me/documents', function (): array {
    $doctor = require_approved_doctor();
    if (count(uploaded_files('documents')) === 0) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['documents' => 'Choose at least one file.']);
    }
    $stored = store_doctor_documents();
    try {
        insert_doctor_documents((int) $doctor['id'], $stored);
    } catch (Throwable $e) {
        delete_stored_documents($stored);
        throw $e;
    }
    return ['doctor' => doctor_self_payload(doctor_for_user((int) $doctor['user_id']))];
}, ['roles' => ['DOCTOR']]);

// A doctor's photo. Any signed-in account may see an APPROVED doctor's photo (guests see only the home page);
// for any other status only the doctor, their Branch Admin or a Super Admin can.
route('GET', '/api/doctors/{id}/photo', function (): never {
    $d = db_one('SELECT id, user_id, district_id, photo_url, verification_status FROM doctors WHERE id = ?', [(int) route_param('id')]);
    if ($d === null || empty($d['photo_url'])) {
        api_fail(404, 'NOT_FOUND', 'Photo not found.');
    }
    if ($d['verification_status'] === 'APPROVED') {
        stream_uploaded_file($d['photo_url']); // a signed-in account is required (route); kept private in browser caches
    }
    $user = current_user();
    if ($user === null || !can_view_doctor_documents($user, $d)) {
        api_fail(404, 'NOT_FOUND', 'Photo not found.');
    }
    stream_uploaded_file($d['photo_url']);
});

// View one uploaded document: the doctor themself, the Branch Admin of the doctor's district, or a Super Admin.
route('GET', '/api/doctors/documents/{id}', function (): never {
    $user = require_login();
    $doc = db_one(
        'SELECT dd.id, dd.file_url, dd.original_name, d.user_id, d.district_id
         FROM doctor_documents dd JOIN doctors d ON d.id = dd.doctor_id WHERE dd.id = ?',
        [(int) route_param('id')]
    );
    // Same answer for "does not exist" and "not yours" so ids cannot be probed.
    if ($doc === null || !can_view_doctor_documents($user, $doc)) {
        api_fail(404, 'NOT_FOUND', 'Document not found.');
    }
    stream_uploaded_file($doc['file_url'], $doc['original_name']);
});
