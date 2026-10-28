<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/hospitals.php';

// ---- accepting an invitation (public: the person has only the emailed link) ----------------------

/** What the accept page shows: which hospital, where, and who invited it. Never reveals the token or the invite's email owner beyond the address itself. */
function invite_public_view(array $invite): array
{
    return [
        'hospital_name' => $invite['hospital_name'],
        'email'         => $invite['email'],
        'phone'         => $invite['phone'],
        'district'      => $invite['district_name'],
        'state'         => $invite['state_name'],
        'invited_by'    => $invite['invited_by'],
        'expires_at'    => $invite['expires_at'],
    ];
}

function invite_from_url(): array
{
    $invite = find_invite_by_token(route_param('token'));
    if ($invite === null) {
        api_fail(404, 'INVITE_NOT_FOUND', 'This invitation link is not valid. Please check the link in your email.');
    }
    assert_invite_usable($invite);
    return $invite;
}

route('GET', '/api/hospital-invites/{token}', function (): array {
    return ['invite' => invite_public_view(invite_from_url())];
}, ['auth' => false]);

// Multipart: hospital_name, address, hospital_phone, admin_name, admin_phone, password, documents[] + document_types[]
route('POST', '/api/hospital-invites/{token}/accept', function (): array {
    $invite = invite_from_url();

    $v = new Validator(request_body());
    $hospital_name = $v->string('hospital_name', 2, 200);
    $address = $v->string('address', 5, 500);
    $hospital_phone = $v->phone('hospital_phone');
    $admin_name = $v->string('admin_name', 2, 150);
    $admin_phone = $v->phone('admin_phone');
    $password = $v->password();
    $v->fail_if_invalid();

    $stored = store_hospital_documents();
    try {
        $user_id = db_transaction(function () use ($invite, $hospital_name, $address, $hospital_phone, $admin_name, $admin_phone, $password, $stored): int {
            // Lock the invite so a double click or two tabs cannot create two hospitals
            $locked = db_one('SELECT * FROM hospital_invites WHERE id = ? FOR UPDATE', [$invite['id']]);
            assert_invite_usable($locked);
            if (db_value('SELECT 1 FROM users WHERE email = ?', [$locked['email']]) !== null) {
                api_fail(409, 'EMAIL_TAKEN', 'An account with this email already exists, so this invitation cannot be used. Please contact the Branch Admin.');
            }
            $user_id = create_user_account('HOSPITAL_ADMIN', $admin_name, $locked['email'], $password, $admin_phone, 'EMAIL');
            db_query(
                "INSERT INTO hospitals (district_id, admin_user_id, name, address, phone, email, verification_status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')",
                [$locked['district_id'], $user_id, $hospital_name, $address, $hospital_phone, $locked['email']]
            );
            $hospital_id = (int) db()->lastInsertId();
            insert_hospital_documents($hospital_id, $stored);
            db_query("UPDATE hospital_invites SET status = 'ACCEPTED', used_at = NOW(), hospital_id = ? WHERE id = ?", [$hospital_id, $locked['id']]);
            return $user_id;
        });
    } catch (Throwable $e) {
        delete_stored_hospital_documents($stored);
        throw $e;
    }

    login_user($user_id);
    return ['user' => user_payload(current_user()), 'csrf_token' => csrf_token()];
}, ['auth' => false]);

// ---- a Hospital Admin's own hospital -------------------------------------------------------------

// Works in every verification state: this feeds the waiting / rejected screens.
route('GET', '/api/hospitals/me', function (): array {
    return ['hospital' => hospital_self_payload(require_hospital_record())];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// A rejected hospital corrects its details / adds documents and goes back to the Branch Admin.
// Multipart: hospital_name, address, hospital_phone, documents[] + document_types[]
route('POST', '/api/hospitals/me/resubmit', function (): array {
    $hospital = require_hospital_record();
    if ($hospital['verification_status'] !== 'REJECTED') {
        api_fail(409, 'NOT_REJECTED', 'Only a rejected application can be resubmitted.');
    }
    $v = new Validator(request_body());
    $name = $v->string('hospital_name', 2, 200);
    $address = $v->string('address', 5, 500);
    $phone = $v->phone('hospital_phone');
    $v->fail_if_invalid();

    // At least one document must exist after resubmitting when documents are required
    $had = (int) db_value('SELECT COUNT(*) FROM hospital_documents WHERE hospital_id = ?', [$hospital['id']]);
    $new = count(uploaded_files('documents'));
    $stored = [];
    if ($new > 0 || ($had === 0 && config('require_verification_documents'))) {
        $stored = store_hospital_documents();
    }
    try {
        db_transaction(function () use ($hospital, $name, $address, $phone, $stored): void {
            insert_hospital_documents((int) $hospital['id'], $stored);
            db_query(
                "UPDATE hospitals SET name = ?, address = ?, phone = ?, verification_status = 'PENDING', rejection_reason = NULL WHERE id = ? AND verification_status = 'REJECTED'",
                [$name, $address, $phone, $hospital['id']]
            );
        });
    } catch (Throwable $e) {
        delete_stored_hospital_documents($stored);
        throw $e;
    }
    return ['hospital' => hospital_self_payload(hospital_for_user((int) $hospital['admin_user_id']))];
}, ['roles' => ['HOSPITAL_ADMIN']]);

// View one uploaded file: the hospital's admin, the Branch Admin of its district, or a Super Admin.
route('GET', '/api/hospitals/documents/{id}', function (): never {
    $id = route_param('id');
    $doc = ctype_digit($id) && strlen($id) < 19 ? db_one(
        'SELECT d.*, h.admin_user_id, h.district_id FROM hospital_documents d JOIN hospitals h ON h.id = d.hospital_id WHERE d.id = ?',
        [(int) $id]
    ) : null;
    if ($doc === null || !can_view_hospital_documents(current_user(), $doc)) {
        api_fail(404, 'NOT_FOUND', 'Document not found.'); // same answer for "missing" and "not yours"
    }
    stream_uploaded_file($doc['file_url'], $doc['original_name']);
});
