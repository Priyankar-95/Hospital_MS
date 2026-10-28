<?php
declare(strict_types=1);

// Indian states / UTs with a useful set of districts (all 23 for West Bengal). Safe to re-run.

$geo = [
    'Andhra Pradesh' => ['Visakhapatnam', 'Guntur', 'Krishna', 'Kurnool', 'Chittoor', 'Anantapur', 'East Godavari'],
    'Arunachal Pradesh' => ['Papum Pare', 'Tawang', 'West Kameng', 'Lower Subansiri', 'East Siang'],
    'Assam' => ['Kamrup Metropolitan', 'Dibrugarh', 'Jorhat', 'Cachar', 'Nagaon', 'Sonitpur'],
    'Bihar' => ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Darbhanga', 'Purnia', 'Nalanda'],
    'Chhattisgarh' => ['Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh'],
    'Goa' => ['North Goa', 'South Goa'],
    'Gujarat' => ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Gandhinagar', 'Jamnagar'],
    'Haryana' => ['Gurugram', 'Faridabad', 'Ambala', 'Hisar', 'Karnal', 'Panipat'],
    'Himachal Pradesh' => ['Shimla', 'Kangra', 'Mandi', 'Solan', 'Kullu'],
    'Jharkhand' => ['Ranchi', 'East Singhbhum', 'Dhanbad', 'Bokaro', 'Hazaribagh'],
    'Karnataka' => ['Bengaluru Urban', 'Mysuru', 'Dakshina Kannada', 'Belagavi', 'Dharwad', 'Kalaburagi', 'Ballari'],
    'Kerala' => ['Thiruvananthapuram', 'Ernakulam', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Malappuram'],
    'Madhya Pradesh' => ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain', 'Sagar'],
    'Maharashtra' => ['Mumbai City', 'Mumbai Suburban', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Kolhapur'],
    'Manipur' => ['Imphal West', 'Imphal East', 'Thoubal', 'Churachandpur'],
    'Meghalaya' => ['East Khasi Hills', 'West Garo Hills', 'Ri Bhoi', 'West Jaintia Hills'],
    'Mizoram' => ['Aizawl', 'Lunglei', 'Champhai'],
    'Nagaland' => ['Kohima', 'Dimapur', 'Mokokchung'],
    'Odisha' => ['Khordha', 'Cuttack', 'Puri', 'Ganjam', 'Sambalpur', 'Balasore'],
    'Punjab' => ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'SAS Nagar (Mohali)'],
    'Rajasthan' => ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'],
    'Sikkim' => ['East Sikkim', 'West Sikkim', 'North Sikkim', 'South Sikkim'],
    'Tamil Nadu' => ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Vellore'],
    'Telangana' => ['Hyderabad', 'Rangareddy', 'Warangal', 'Karimnagar', 'Nizamabad', 'Khammam'],
    'Tripura' => ['West Tripura', 'South Tripura', 'North Tripura', 'Dhalai'],
    'Uttar Pradesh' => ['Lucknow', 'Kanpur Nagar', 'Varanasi', 'Agra', 'Prayagraj', 'Ghaziabad', 'Gautam Buddha Nagar', 'Meerut'],
    'Uttarakhand' => ['Dehradun', 'Haridwar', 'Nainital', 'Udham Singh Nagar', 'Almora'],
    'West Bengal' => [
        'Alipurduar', 'Bankura', 'Birbhum', 'Cooch Behar', 'Dakshin Dinajpur', 'Darjeeling', 'Hooghly', 'Howrah',
        'Jalpaiguri', 'Jhargram', 'Kalimpong', 'Kolkata', 'Malda', 'Murshidabad', 'Nadia', 'North 24 Parganas',
        'Paschim Bardhaman', 'Paschim Medinipur', 'Purba Bardhaman', 'Purba Medinipur', 'Purulia',
        'South 24 Parganas', 'Uttar Dinajpur',
    ],
    // Union Territories
    'Andaman and Nicobar Islands' => ['South Andaman', 'North and Middle Andaman', 'Nicobars'],
    'Chandigarh' => ['Chandigarh'],
    'Dadra and Nagar Haveli and Daman and Diu' => ['Dadra and Nagar Haveli', 'Daman', 'Diu'],
    'Delhi' => ['New Delhi', 'Central Delhi', 'South Delhi', 'North Delhi', 'East Delhi', 'West Delhi', 'North West Delhi', 'South West Delhi', 'Shahdara', 'North East Delhi', 'South East Delhi'],
    'Jammu and Kashmir' => ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Udhampur'],
    'Ladakh' => ['Leh', 'Kargil'],
    'Lakshadweep' => ['Lakshadweep'],
    'Puducherry' => ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
];

$insert_state = db()->prepare('INSERT IGNORE INTO states (state_name) VALUES (?)');
$insert_district = db()->prepare(
    'INSERT IGNORE INTO districts (state_id, district_name)
     SELECT id, ? FROM states WHERE state_name = ?'
);

foreach ($geo as $state => $districts) {
    $insert_state->execute([$state]);
    foreach ($districts as $district) {
        $insert_district->execute([$district, $state]);
    }
}
