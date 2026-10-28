<?php
declare(strict_types=1);

/** Role checks. Roles are the values of users.role. */

const ALL_ROLES = [
    'PATIENT', 'DOCTOR', 'HOSPITAL_ADMIN', 'HOSPITAL_FRONTDESK', 'BRANCH_ADMIN', 'VENDOR_ADMIN', 'SUPER_ADMIN',
];

/** Fails with 401 if not logged in, 403 if the user's role is not in the allowed list. Returns the user. */
function require_role(string ...$roles): array
{
    $user = require_login();
    if (!in_array($user['role'], $roles, true)) {
        api_fail(403, 'FORBIDDEN', 'You do not have permission to do this.');
    }
    return $user;
}

/**
 * The three tabs on the login screen. Patient and Doctor are self-service; everything else
 * (hospital admin, front desk, branch admin, vendor, super admin) is "STAFF".
 */
const LOGIN_GROUPS = ['PATIENT', 'DOCTOR', 'STAFF'];

function role_group(string $role): string
{
    return match ($role) {
        'PATIENT' => 'PATIENT',
        'DOCTOR'  => 'DOCTOR',
        default   => 'STAFF',
    };
}

/** Human wording for the "wrong tab" message. */
function login_group_label(string $group): string
{
    return match ($group) {
        'PATIENT' => 'Patient',
        'DOCTOR'  => 'Doctor',
        default   => 'Staff',
    };
}

/** Where each role lands after login (frontend page paths). */
function role_home_path(string $role): string
{
    return match ($role) {
        'PATIENT'            => '/frontend/patient/index.html',
        'DOCTOR'             => '/frontend/doctor/dashboard.html',
        'HOSPITAL_ADMIN'     => '/frontend/hospital/dashboard.html',
        'HOSPITAL_FRONTDESK' => '/frontend/hospital/frontdesk.html',
        'BRANCH_ADMIN'       => '/frontend/branch/dashboard.html',
        'VENDOR_ADMIN'       => '/frontend/vendor/dashboard.html',
        'SUPER_ADMIN'        => '/frontend/admin/dashboard.html',
        default              => '/frontend/shared/login.html',
    };
}
