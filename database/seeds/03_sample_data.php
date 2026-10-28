<?php
declare(strict_types=1);

// Sample accounts, hospitals, doctors, schedules and fees for development.
// Every seeded account uses the password below. Skipped if already seeded (use --fresh --seed to rebuild).

const SEED_PASSWORD = 'Password@123';

$pdo = db();

if ((int) db_value("SELECT COUNT(*) FROM users WHERE email LIKE '%@hospital.test'") > 0) {
    echo '(already seeded, skipped) ';
    return;
}

$hash = password_hash(SEED_PASSWORD, PASSWORD_DEFAULT);

function seed_user(string $role, string $email, string $name, string $phone, string $hash): int
{
    db_query(
        "INSERT INTO users (role, auth_provider, email, password_hash, name, phone) VALUES (?, 'EMAIL', ?, ?, ?, ?)",
        [$role, $email, $hash, $name, $phone]
    );
    return (int) db()->lastInsertId();
}

function district_id(string $state, string $district): int
{
    $id = db_value(
        'SELECT d.id FROM districts d JOIN states s ON s.id = d.state_id WHERE s.state_name = ? AND d.district_name = ?',
        [$state, $district]
    );
    if ($id === null) {
        throw new RuntimeException("Seed district not found: {$state} / {$district}");
    }
    return (int) $id;
}

function specialty_id(string $name): int
{
    $id = db_value('SELECT id FROM specialties WHERE name = ?', [$name]);
    if ($id === null) {
        throw new RuntimeException("Seed specialty not found: {$name}");
    }
    return (int) $id;
}

db_transaction(function () use ($hash): void {
    $kolkata = district_id('West Bengal', 'Kolkata');
    $howrah = district_id('West Bengal', 'Howrah');
    $north24 = district_id('West Bengal', 'North 24 Parganas');
    $darjeeling = district_id('West Bengal', 'Darjeeling');

    // One account per role (these are the logins to try)
    $super = seed_user('SUPER_ADMIN', 'superadmin@hospital.test', 'Super Admin', '9000000001', $hash);
    $branch = seed_user('BRANCH_ADMIN', 'branchadmin@hospital.test', 'Branch Admin (Kolkata region)', '9000000002', $hash);
    $hosp_admin = seed_user('HOSPITAL_ADMIN', 'hospitaladmin@hospital.test', 'Sunrise Hospital Admin', '9000000003', $hash);
    $frontdesk = seed_user('HOSPITAL_FRONTDESK', 'frontdesk@hospital.test', 'Sunrise Front Desk', '9000000004', $hash);
    $vendor = seed_user('VENDOR_ADMIN', 'vendor@hospital.test', 'Green Cross Pharmacy Vendor', '9000000005', $hash);
    $patient = seed_user('PATIENT', 'patient@hospital.test', 'Demo Patient', '9000000006', $hash);
    $private_doc_user = seed_user('DOCTOR', 'doctor@hospital.test', 'Dr. Sneha Roy', '9000000007', $hash);

    // Extra accounts for realistic testing
    seed_user('PATIENT', 'patient2@hospital.test', 'Second Patient', '9000000008', $hash);
    $hosp_admin2 = seed_user('HOSPITAL_ADMIN', 'hospitaladmin2@hospital.test', 'Lifeline Hospital Admin', '9000000009', $hash);

    // Branch admin covers three districts; Darjeeling is deliberately outside it (district-scoping tests)
    foreach ([$kolkata, $howrah, $north24] as $d) {
        db_query('INSERT INTO branch_admin_districts (branch_admin_id, district_id) VALUES (?, ?)', [$branch, $d]);
    }

    // Hospitals (both approved)
    db_query(
        "INSERT INTO hospitals (district_id, admin_user_id, name, address, phone, email, facilities, total_beds, available_beds,
                                latitude, longitude, verification_status, verified_by, verified_at)
         VALUES (?, ?, 'Sunrise Multispecialty Hospital', '12 Park Street, Kolkata 700016', '03312345601', 'info@sunrise.example',
                 'ICU, 24x7 Emergency, Pharmacy, Diagnostic Lab, Ambulance, Parking', 150, 38, 22.5535000, 88.3520000,
                 'APPROVED', ?, NOW())",
        [$kolkata, $hosp_admin, $branch]
    );
    $sunrise = (int) db()->lastInsertId();

    db_query(
        "INSERT INTO hospitals (district_id, admin_user_id, name, address, phone, email, facilities, total_beds, available_beds,
                                latitude, longitude, verification_status, verified_by, verified_at)
         VALUES (?, ?, 'Lifeline Medical Centre', '45 GT Road, Howrah 711101', '03322345602', 'contact@lifeline.example',
                 'Emergency, Pharmacy, X-Ray, Pathology Lab, Parking', 80, 21, 22.5958000, 88.2636000,
                 'APPROVED', ?, NOW())",
        [$howrah, $hosp_admin2, $branch]
    );
    $lifeline = (int) db()->lastInsertId();

    db_query('INSERT INTO hospital_staff (hospital_id, user_id, staff_role) VALUES (?, ?, \'FRONTDESK\')', [$sunrise, $frontdesk]);

    foreach ([
        [$sunrise, 'Cardiology', 30], [$sunrise, 'Pediatrics', 25], [$sunrise, 'General Medicine', 40],
        [$lifeline, 'Orthopedics', 20], [$lifeline, 'General Medicine', 30],
    ] as [$h, $spec, $beds]) {
        db_query('INSERT INTO hospital_departments (hospital_id, specialty_id, bed_count) VALUES (?, ?, ?)', [$h, specialty_id($spec), $beds]);
    }

    // Doctors: [user_id|null, name, email, district, hospital_id|null, type, specialty, qualifications, about, status, facilities/address]
    $doctors = [];
    $add_doctor = function (
        ?int $user_id, int $district, ?int $hospital, string $type, string $specialty, string $quals,
        string $about, string $status, ?string $clinic, ?string $address, ?string $facilities
    ) use ($branch, &$doctors): int {
        $approved = $status === 'APPROVED';
        db_query(
            'INSERT INTO doctors (user_id, district_id, hospital_id, doctor_type, specialty_id, about, qualifications,
                                  clinic_name, address, facilities, verification_status, verified_by, verified_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$user_id, $district, $hospital, $type, specialty_id($specialty), $about, $quals, $clinic, $address, $facilities,
             $status, $approved ? $branch : null, $approved ? date('Y-m-d H:i:s') : null]
        );
        return (int) db()->lastInsertId();
    };

    $doc_ids = [];

    // Hospital doctors (approved)
    $u = seed_user('DOCTOR', 'anil.sen@hospital.test', 'Dr. Anil Sen', '9100000001', $hash);
    $doc_ids['anil'] = $add_doctor($u, $kolkata, $sunrise, 'HOSPITAL', 'Cardiology', 'MBBS, MD (Medicine), DM (Cardiology)',
        'Senior consultant cardiologist with 15 years of experience in preventive cardiology and heart failure care.', 'APPROVED', null, null, null);
    $u = seed_user('DOCTOR', 'meera.das@hospital.test', 'Dr. Meera Das', '9100000002', $hash);
    $doc_ids['meera'] = $add_doctor($u, $kolkata, $sunrise, 'HOSPITAL', 'Pediatrics', 'MBBS, MD (Pediatrics)',
        'Pediatrician caring for newborns, infants and teenagers, with a special interest in child nutrition.', 'APPROVED', null, null, null);
    $u = seed_user('DOCTOR', 'rahul.ghosh@hospital.test', 'Dr. Rahul Ghosh', '9100000003', $hash);
    $doc_ids['rahul'] = $add_doctor($u, $howrah, $lifeline, 'HOSPITAL', 'Orthopedics', 'MBBS, MS (Orthopedics)',
        'Orthopedic surgeon treating fractures, joint pain and sports injuries.', 'APPROVED', null, null, null);

    // Private-chamber doctors (approved)
    $doc_ids['sneha'] = $add_doctor($private_doc_user, $kolkata, null, 'PRIVATE', 'Dermatology', 'MBBS, MD (Dermatology)',
        'Dermatologist for acne, hair fall, allergies and general skin care.', 'APPROVED',
        'Roy Skin & Hair Clinic', '8 Gariahat Road, Kolkata 700019', 'AC waiting room, Procedure room, Parking nearby');
    $u = seed_user('DOCTOR', 'imran.khan@hospital.test', 'Dr. Imran Khan', '9100000004', $hash);
    $doc_ids['imran'] = $add_doctor($u, $kolkata, null, 'PRIVATE', 'General Medicine', 'MBBS, MD (Medicine)',
        'General physician for fever, infections, diabetes and blood pressure management.', 'APPROVED',
        'Khan Family Clinic', '21 Lake Road, Kolkata 700029', 'ECG, Pathology collection point');
    $u = seed_user('DOCTOR', 'pooja.mehta@hospital.test', 'Dr. Pooja Mehta', '9100000005', $hash);
    $doc_ids['pooja'] = $add_doctor($u, $howrah, null, 'PRIVATE', 'Gynecology & Obstetrics', 'MBBS, MS (Obstetrics & Gynaecology)',
        'Gynecologist offering antenatal care, PCOS management and women\'s wellness check-ups.', 'APPROVED',
        'Mehta Women\'s Clinic', '3 Foreshore Road, Howrah 711102', 'Ultrasound, Waiting lounge');

    // Private doctors waiting for verification (one inside the branch admin's districts, one outside)
    $u = seed_user('DOCTOR', 'pending.doctor@hospital.test', 'Dr. Kiran Paul', '9100000006', $hash);
    $add_doctor($u, $kolkata, null, 'PRIVATE', 'ENT', 'MBBS, MS (ENT)', 'ENT specialist.', 'PENDING',
        'Paul ENT Care', '77 Salt Lake Sector V, Kolkata 700091', null);
    $u = seed_user('DOCTOR', 'pending.darjeeling@hospital.test', 'Dr. Tenzing Sherpa', '9100000007', $hash);
    $add_doctor($u, $darjeeling, null, 'PRIVATE', 'General Medicine', 'MBBS', 'General physician.', 'PENDING',
        'Hill View Clinic', 'Mall Road, Darjeeling 734101', null);

    // Fees. last_updated_by_role records who edited last (one is by the Hospital Admin to show shared editing).
    $fees = [
        'anil'  => [['Consultation', 800, 'HOSPITAL_ADMIN', $hosp_admin], ['Follow-up visit', 400, 'DOCTOR', null]],
        'meera' => [['Consultation', 600, 'DOCTOR', null], ['Vaccination advice', 300, 'DOCTOR', null]],
        'rahul' => [['Consultation', 700, 'DOCTOR', null], ['Fracture review', 500, 'DOCTOR', null]],
        'sneha' => [['Consultation', 500, 'DOCTOR', null], ['Acne treatment session', 900, 'DOCTOR', null]],
        'imran' => [['Consultation', 400, 'DOCTOR', null], ['Follow-up visit', 200, 'DOCTOR', null]],
        'pooja' => [['Consultation', 650, 'DOCTOR', null], ['Antenatal check-up', 800, 'DOCTOR', null]],
    ];
    $doctor_user = fn (int $doctor_id) => db_value('SELECT user_id FROM doctors WHERE id = ?', [$doctor_id]);
    foreach ($fees as $key => $rows) {
        foreach ($rows as [$treatment, $amount, $role, $by_user]) {
            db_query(
                'INSERT INTO doctor_fees (doctor_id, treatment_name, fee, last_updated_by_user_id, last_updated_by_role) VALUES (?, ?, ?, ?, ?)',
                [$doc_ids[$key], $treatment, $amount, $by_user ?? $doctor_user($doc_ids[$key]), $role]
            );
        }
    }

    // Schedules: next 14 days, Monday to Saturday. [start, end, capacity]
    $windows = [
        'anil' => ['10:00', '14:00', 20], 'meera' => ['09:00', '13:00', 25], 'rahul' => ['11:00', '15:00', 15],
        'sneha' => ['17:00', '20:00', 14], 'imran' => ['18:00', '21:00', 30], 'pooja' => ['16:00', '19:00', 12],
    ];
    $ins_sched = db()->prepare(
        'INSERT INTO doctor_schedules (doctor_id, work_date, start_time, end_time, max_patients) VALUES (?, ?, ?, ?, ?)'
    );
    for ($i = 1; $i <= 14; $i++) {
        $date = new DateTimeImmutable("+{$i} day");
        if ($date->format('N') === '7') {
            continue;
        }
        foreach ($windows as $key => [$start, $end, $cap]) {
            $ins_sched->execute([$doc_ids[$key], $date->format('Y-m-d'), $start, $end, $cap]);
        }
    }

    // The same pattern as weekly working hours (Monday to Saturday), so each doctor's schedule screen is populated,
    // then link the dated rows above to it.
    foreach ($windows as $key => [$start, $end, $cap]) {
        for ($weekday = 1; $weekday <= 6; $weekday++) {
            db_query(
                "INSERT INTO doctor_weekly_hours (doctor_id, weekday, start_time, end_time, booking_mode, max_patients) VALUES (?, ?, ?, ?, 'COUNT', ?)",
                [$doc_ids[$key], $weekday, $start . ':00', $end . ':00', $cap]
            );
        }
    }
    db_query(
        'UPDATE doctor_schedules s JOIN doctor_weekly_hours w
           ON w.doctor_id = s.doctor_id AND w.weekday = WEEKDAY(s.work_date) + 1 AND w.start_time = s.start_time
         SET s.weekly_hours_id = w.id'
    );
});
