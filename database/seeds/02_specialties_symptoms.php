<?php
declare(strict_types=1);

// Specialties, a plain symptom list, and symptom -> specialty mapping. Safe to re-run.

$specialties = [
    'General Medicine'         => 'Fever, infections and everyday health problems',
    'Cardiology'               => 'Heart and blood pressure',
    'Dermatology'              => 'Skin, hair and nails',
    'Pediatrics'               => 'Children and infants',
    'Orthopedics'              => 'Bones, joints and muscles',
    'Gynecology & Obstetrics'  => 'Women\'s health and pregnancy',
    'ENT'                      => 'Ear, nose and throat',
    'Ophthalmology'            => 'Eyes and vision',
    'Neurology'                => 'Brain, nerves and headaches',
    'Gastroenterology'         => 'Stomach, liver and digestion',
    'Urology'                  => 'Kidney, bladder and urinary tract',
    'Psychiatry'               => 'Mental health and sleep',
    'Dentistry'                => 'Teeth and gums',
    'Pulmonology'              => 'Lungs and breathing',
    'Endocrinology'            => 'Diabetes, thyroid and hormones',
];

// symptom => [specialties]
$symptoms = [
    'Fever'                    => ['General Medicine', 'Pediatrics'],
    'Cough and cold'           => ['General Medicine', 'Pulmonology', 'ENT'],
    'Body ache and weakness'   => ['General Medicine'],
    'Chest pain'               => ['Cardiology'],
    'High blood pressure'      => ['Cardiology', 'General Medicine'],
    'Palpitations'             => ['Cardiology'],
    'Shortness of breath'      => ['Pulmonology', 'Cardiology'],
    'Wheezing or asthma'       => ['Pulmonology'],
    'Skin rash or itching'     => ['Dermatology'],
    'Acne or pimples'          => ['Dermatology'],
    'Hair fall'                => ['Dermatology'],
    'Child not eating or growing well' => ['Pediatrics'],
    'Child vaccination'        => ['Pediatrics'],
    'Joint pain'               => ['Orthopedics'],
    'Back pain'                => ['Orthopedics', 'Neurology'],
    'Fracture or injury'       => ['Orthopedics'],
    'Irregular periods'        => ['Gynecology & Obstetrics'],
    'Pregnancy care'           => ['Gynecology & Obstetrics'],
    'Ear pain'                 => ['ENT'],
    'Sore throat'              => ['ENT', 'General Medicine'],
    'Blocked or runny nose'    => ['ENT'],
    'Blurred vision'           => ['Ophthalmology'],
    'Red or watery eyes'       => ['Ophthalmology'],
    'Headache or migraine'     => ['Neurology', 'General Medicine'],
    'Dizziness'                => ['Neurology', 'General Medicine'],
    'Numbness or tingling'     => ['Neurology'],
    'Stomach pain'             => ['Gastroenterology', 'General Medicine'],
    'Acidity or indigestion'   => ['Gastroenterology'],
    'Vomiting or diarrhoea'    => ['Gastroenterology', 'General Medicine'],
    'Painful urination'        => ['Urology'],
    'Kidney stone pain'        => ['Urology'],
    'Anxiety or low mood'      => ['Psychiatry'],
    'Trouble sleeping'         => ['Psychiatry', 'General Medicine'],
    'Toothache'                => ['Dentistry'],
    'Bleeding gums'            => ['Dentistry'],
    'High blood sugar'         => ['Endocrinology', 'General Medicine'],
    'Thyroid problems'         => ['Endocrinology'],
    'Sudden weight change'     => ['Endocrinology', 'General Medicine'],
];

$pdo = db();
$ins_specialty = $pdo->prepare('INSERT IGNORE INTO specialties (name, slug, description) VALUES (?, ?, ?)');
foreach ($specialties as $name => $description) {
    $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-');
    $ins_specialty->execute([$name, $slug, $description]);
}

$ins_symptom = $pdo->prepare('INSERT IGNORE INTO symptoms (name) VALUES (?)');
$ins_map = $pdo->prepare(
    'INSERT IGNORE INTO symptom_specialties (symptom_id, specialty_id)
     SELECT s.id, sp.id FROM symptoms s, specialties sp WHERE s.name = ? AND sp.name = ?'
);
foreach ($symptoms as $symptom => $targets) {
    $ins_symptom->execute([$symptom]);
    foreach ($targets as $target) {
        $ins_map->execute([$symptom, $target]);
    }
}
