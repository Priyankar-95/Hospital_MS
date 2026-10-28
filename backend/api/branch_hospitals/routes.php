<?php
declare(strict_types=1);

require_once __DIR__ . '/../../services/hospitals.php';
require_once __DIR__ . '/../../services/email.php';

// Branch Admin: invite hospitals and verify them. A Branch Admin only ever sees hospitals and invites in their own districts.

const HOSPITAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

/** Ids of the districts this Branch Admin covers. */
function branch_scope_ids(int $branch_admin_id): array
{
    return array_map('intval', array_column(
        db_all('SELECT district_id FROM branch_admin_districts WHERE branch_admin_id = ?', [$branch_admin_id]),
        'district_id'
    ));
}

function invite_row_view(array $i): array
{
    return [
        'id'            => (int) $i['id'],
        'hospital_name' => $i['hospital_name'],
        'email'         => $i['email'],
        'phone'         => $i['phone'],
        'district'      => $i['district_name'],
        'state'         => $i['state_name'],
        'status'        => invite_effective_status($i),
        'expires_at'    => $i['expires_at'],
        'created_at'    => $i['created_at'],
        'used_at'       => $i['used_at'],
        'hospital_id'   => $i['hospital_id'] !== null ? (int) $i['hospital_id'] : null,
    ];
}

/** An invite in this Branch Admin's districts, or a 404 (same answer for "missing" and "not yours"). */
function branch_find_invite(int $id, int $branch_admin_id): array
{
    $row = db_one(
        'SELECT i.*, dist.district_name, st.state_name
         FROM hospital_invites i
         JOIN districts dist ON dist.id = i.district_id
         JOIN states st ON st.id = dist.state_id
         JOIN branch_admin_districts bad ON bad.district_id = i.district_id AND bad.branch_admin_id = ?
         WHERE i.id = ?',
        [$branch_admin_id, $id]
    );
    if ($row === null) {
        api_fail(404, 'NOT_FOUND', 'Invitation not found.');
    }
    return $row;
}

/** Email the invitation link. Returns [sent, link]. */
function send_hospital_invite(array $invite, string $token, string $invited_by): array
{
    $url = hospital_invite_url($token);
    $sent = send_email($invite['email'], 'hospital_invite', [
        'hospital_name' => $invite['hospital_name'],
        'district'      => $invite['district_name'],
        'invited_by'    => $invited_by,
        'invite_url'    => $url,
        'expires_text'  => date('j M Y, g:i A', strtotime((string) $invite['expires_at'])),
    ]);
    return [$sent, $url];
}

/** The response for a created / resent invite. The link itself is only returned in local development (for tests). */
function invite_response(array $invite, bool $sent, string $url): array
{
    $out = ['invite' => invite_row_view($invite), 'email_sent' => $sent];
    if (config('app.env') === 'local') {
        $out['dev_invite_url'] = $url;
    }
    return $out;
}

// ---- invitations ---------------------------------------------------------------------------------

route('GET', '/api/branch/hospital-invites', function (): array {
    $rows = db_all(
        'SELECT i.*, dist.district_name, st.state_name
         FROM hospital_invites i
         JOIN districts dist ON dist.id = i.district_id
         JOIN states st ON st.id = dist.state_id
         JOIN branch_admin_districts bad ON bad.district_id = i.district_id AND bad.branch_admin_id = ?
         ORDER BY i.created_at DESC, i.id DESC',
        [current_user()['id']]
    );
    $items = array_map('invite_row_view', $rows);
    // Accepted invitations are now real applications (see /api/branch/hospitals), so this list is about invitations still out
    $open = array_values(array_filter($items, fn (array $i): bool => $i['status'] !== 'ACCEPTED'));
    return ['items' => $open, 'open_count' => count(array_filter($open, fn (array $i): bool => $i['status'] === 'INVITED'))];
}, ['roles' => ['BRANCH_ADMIN']]);

// { hospital_name, email, district_id (one of this admin's districts), phone? }
route('POST', '/api/branch/hospital-invites', function (): array {
    $admin = current_user();
    $v = new Validator(request_body());
    $name = $v->string('hospital_name', 2, 200);
    $email = $v->email();
    $district_id = $v->int('district_id', 1, PHP_INT_MAX);
    $phone = $v->phone('phone');
    $v->fail_if_invalid();

    if (!in_array($district_id, branch_scope_ids((int) $admin['id']), true)) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['district_id' => 'Choose one of your own districts.']);
    }
    if (db_value('SELECT 1 FROM users WHERE email = ?', [$email]) !== null) {
        api_fail(409, 'EMAIL_TAKEN', 'An account with this email already exists, so it cannot be used for a hospital. Use a different email.');
    }
    if (db_value("SELECT 1 FROM hospital_invites WHERE email = ? AND status = 'INVITED' AND expires_at > NOW()", [$email]) !== null) {
        api_fail(409, 'INVITE_EXISTS', 'An invitation to this email is already waiting. Use Resend on it, or Revoke it first.');
    }

    [$token, $hash] = new_invite_token();
    db_query(
        'INSERT INTO hospital_invites (branch_admin_id, district_id, hospital_name, email, phone, token_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . HOSPITAL_INVITE_DAYS . ' DAY))',
        [$admin['id'], $district_id, $name, $email, $phone, $hash]
    );
    $invite = branch_find_invite((int) db()->lastInsertId(), (int) $admin['id']);
    [$sent, $url] = send_hospital_invite($invite, $token, $admin['name']);
    return invite_response($invite, $sent, $url);
}, ['roles' => ['BRANCH_ADMIN']]);

// New link (and a fresh 7 days). Works for an invitation that is waiting or has expired; the old link stops working.
route('POST', '/api/branch/hospital-invites/{id}/resend', function (): array {
    $admin = current_user();
    $invite = branch_find_invite((int) route_param('id'), (int) $admin['id']);
    if (!in_array(invite_effective_status($invite), ['INVITED', 'EXPIRED'], true)) {
        api_fail(409, 'NOT_RESENDABLE', 'Only a waiting or expired invitation can be sent again.');
    }
    if (db_value('SELECT 1 FROM users WHERE email = ?', [$invite['email']]) !== null) {
        api_fail(409, 'EMAIL_TAKEN', 'An account with this email now exists, so this invitation cannot be used.');
    }
    [$token, $hash] = new_invite_token();
    db_query(
        "UPDATE hospital_invites SET token_hash = ?, status = 'INVITED', expires_at = DATE_ADD(NOW(), INTERVAL " . HOSPITAL_INVITE_DAYS . ' DAY) WHERE id = ?',
        [$hash, $invite['id']]
    );
    $invite = branch_find_invite((int) $invite['id'], (int) $admin['id']);
    [$sent, $url] = send_hospital_invite($invite, $token, $admin['name']);
    return invite_response($invite, $sent, $url);
}, ['roles' => ['BRANCH_ADMIN']]);

route('POST', '/api/branch/hospital-invites/{id}/revoke', function (): array {
    $admin = current_user();
    $invite = branch_find_invite((int) route_param('id'), (int) $admin['id']);
    if (!in_array(invite_effective_status($invite), ['INVITED', 'EXPIRED'], true)) {
        api_fail(409, 'NOT_REVOCABLE', 'Only a waiting or expired invitation can be withdrawn.');
    }
    db_query("UPDATE hospital_invites SET status = 'REVOKED' WHERE id = ? AND status = 'INVITED'", [$invite['id']]);
    return ['invite' => invite_row_view(branch_find_invite((int) $invite['id'], (int) $admin['id']))];
}, ['roles' => ['BRANCH_ADMIN']]);

// ---- hospital applications -----------------------------------------------------------------------

function hospital_select_sql(): string
{
    return 'SELECT h.*, u.name AS admin_name, u.email AS admin_email, u.phone AS admin_phone, dist.district_name, st.state_name,
                   (SELECT COUNT(*) FROM hospital_documents hd WHERE hd.hospital_id = h.id) AS document_count
            FROM hospitals h
            JOIN users u ON u.id = h.admin_user_id
            JOIN districts dist ON dist.id = h.district_id
            JOIN states st ON st.id = dist.state_id
            JOIN branch_admin_districts bad ON bad.district_id = h.district_id AND bad.branch_admin_id = ?';
}

function branch_hospital_summary(array $h): array
{
    return [
        'id'                  => (int) $h['id'],
        'name'                => $h['name'],
        'verification_status' => $h['verification_status'],
        'rejection_reason'    => $h['rejection_reason'],
        'address'             => $h['address'],
        'phone'               => $h['phone'],
        'district'            => $h['district_name'],
        'state'               => $h['state_name'],
        'admin'               => ['name' => $h['admin_name'], 'email' => $h['admin_email'], 'phone' => $h['admin_phone']],
        'document_count'      => (int) $h['document_count'],
        'submitted_at'        => $h['updated_at'],
        'verified_at'         => $h['verified_at'],
    ];
}

/** A hospital in the admin's districts, or a 404 (same answer for "missing" and "not yours"). */
function branch_find_hospital(int $id, int $branch_admin_id): array
{
    $row = db_one(hospital_select_sql() . ' WHERE h.id = ?', [$branch_admin_id, $id]);
    if ($row === null) {
        api_fail(404, 'NOT_FOUND', 'Hospital not found.');
    }
    return $row;
}

route('GET', '/api/branch/hospitals', function (): array {
    $admin = current_user();
    $status = $_GET['status'] ?? 'PENDING';
    if (!is_string($status) || !in_array($status, HOSPITAL_STATUSES, true)) {
        api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', ['status' => 'Invalid status.']);
    }
    [$page, $per_page, $q, $district_id] = branch_list_params((int) $admin['id']);

    $district_sql = $district_id !== null ? ' AND h.district_id = ' . $district_id : '';
    $search_sql = '';
    $search_args = [];
    if ($q !== '') {
        $search_sql = ' AND (h.name LIKE ? OR u.email LIKE ? OR u.name LIKE ?)';
        $like = branch_like($q);
        $search_args = [$like, $like, $like];
    }
    $args = array_merge([$admin['id'], $status], $search_args);
    $where = ' WHERE h.verification_status = ?' . $district_sql . $search_sql;

    $total = (int) db_value('SELECT COUNT(*) FROM (' . hospital_select_sql() . $where . ') t', $args);
    $rows = db_all(
        hospital_select_sql() . $where . ' ORDER BY h.updated_at ASC, h.id ASC LIMIT ' . $per_page . ' OFFSET ' . (($page - 1) * $per_page),
        $args
    );

    // Which kinds of document each hospital sent (one query for the whole page)
    $doc_types = [];
    if ($rows) {
        $marks = implode(',', array_fill(0, count($rows), '?'));
        foreach (db_all("SELECT hospital_id, doc_type FROM hospital_documents WHERE hospital_id IN ($marks) ORDER BY id", array_map(fn (array $r): int => (int) $r['id'], $rows)) as $d) {
            $doc_types[(int) $d['hospital_id']][] = $d['doc_type'];
        }
    }
    $counts = db_all(
        'SELECT h.verification_status AS status, COUNT(*) AS n
         FROM hospitals h JOIN branch_admin_districts bad ON bad.district_id = h.district_id AND bad.branch_admin_id = ?
         WHERE 1 = 1' . $district_sql . ' GROUP BY h.verification_status',
        [$admin['id']]
    );
    return [
        'items'      => array_map(fn (array $h): array => branch_hospital_summary($h) + ['document_types' => $doc_types[(int) $h['id']] ?? []], $rows),
        'counts'     => array_merge(['PENDING' => 0, 'APPROVED' => 0, 'REJECTED' => 0], array_map('intval', array_column($counts, 'n', 'status'))),
        'pagination' => branch_pagination($page, $per_page, $total),
    ];
}, ['roles' => ['BRANCH_ADMIN']]);

route('GET', '/api/branch/hospitals/{id}', function (): array {
    $h = branch_find_hospital((int) route_param('id'), (int) current_user()['id']);
    return ['hospital' => branch_hospital_summary($h) + ['documents' => hospital_documents((int) $h['id'])]];
}, ['roles' => ['BRANCH_ADMIN']]);

route('POST', '/api/branch/hospitals/{id}/approve', function (): array {
    $admin = current_user();
    $h = branch_find_hospital((int) route_param('id'), (int) $admin['id']);
    // The WHERE clause makes this safe if two reviewers click at once: only one UPDATE can match.
    $stmt = db_query(
        "UPDATE hospitals SET verification_status = 'APPROVED', rejection_reason = NULL, verified_by = ?, verified_at = NOW()
         WHERE id = ? AND verification_status = 'PENDING'",
        [$admin['id'], $h['id']]
    );
    if ($stmt->rowCount() === 0) {
        api_fail(409, 'NOT_PENDING', 'This application is no longer waiting for review.');
    }
    $emailed = send_email($h['admin_email'], 'hospital_approved', [
        'name' => $h['admin_name'], 'hospital_name' => $h['name'], 'login_url' => config('app.url') . '/frontend/hospital/dashboard.html',
    ]);
    return ['hospital_id' => (int) $h['id'], 'verification_status' => 'APPROVED', 'email_sent' => $emailed];
}, ['roles' => ['BRANCH_ADMIN']]);

route('POST', '/api/branch/hospitals/{id}/reject', function (): array {
    $admin = current_user();
    $v = new Validator(request_body());
    $reason = $v->string('reason', 5, 500);
    $v->fail_if_invalid();

    $h = branch_find_hospital((int) route_param('id'), (int) $admin['id']);
    $stmt = db_query(
        "UPDATE hospitals SET verification_status = 'REJECTED', rejection_reason = ?, verified_by = ?, verified_at = NOW()
         WHERE id = ? AND verification_status = 'PENDING'",
        [$reason, $admin['id'], $h['id']]
    );
    if ($stmt->rowCount() === 0) {
        api_fail(409, 'NOT_PENDING', 'This application is no longer waiting for review.');
    }
    $emailed = send_email($h['admin_email'], 'hospital_rejected', [
        'name' => $h['admin_name'], 'hospital_name' => $h['name'], 'reason' => $reason, 'login_url' => config('app.url') . '/frontend/hospital/dashboard.html',
    ]);
    return ['hospital_id' => (int) $h['id'], 'verification_status' => 'REJECTED', 'email_sent' => $emailed];
}, ['roles' => ['BRANCH_ADMIN']]);

// The districts this Branch Admin covers (for the "Invite a hospital" form).
route('GET', '/api/branch/districts', function (): array {
    $rows = db_all(
        'SELECT d.id, d.district_name AS name, s.state_name AS state
         FROM branch_admin_districts bad
         JOIN districts d ON d.id = bad.district_id
         JOIN states s ON s.id = d.state_id
         WHERE bad.branch_admin_id = ? ORDER BY s.state_name, d.district_name',
        [current_user()['id']]
    );
    return ['districts' => array_map(fn (array $r): array => ['id' => (int) $r['id'], 'name' => $r['name'], 'state' => $r['state']], $rows)];
}, ['roles' => ['BRANCH_ADMIN']]);
