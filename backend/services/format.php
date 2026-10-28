<?php
declare(strict_types=1);

/** Display formatting shared by emails and PDFs (the browser has its own copies in frontend/patient/common.js). */

/** '1234567.5' -> '₹12,34,567.50'; whole amounts drop the decimals ('500.00' -> '₹500'). Indian digit grouping. */
function format_inr(string|float|int|null $amount): string
{
    $n = number_format((float) $amount, 2, '.', '');
    [$int, $dec] = explode('.', $n);
    $last3 = substr($int, -3);
    $rest = substr($int, 0, -3);
    $grouped = $rest !== '' ? preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest) . ',' . $last3 : $last3;
    return '₹' . $grouped . ($dec === '00' ? '' : '.' . $dec);
}

/** '17:00' or '17:00:00' -> '5:00 PM' */
function format_time12(string $time): string
{
    [$h, $m] = array_map('intval', explode(':', $time));
    return sprintf('%d:%02d %s', $h % 12 ?: 12, $m, $h < 12 ? 'AM' : 'PM');
}

/** '2026-10-13' -> 'Tue, 13 Oct 2026' */
function format_date_long(string $date): string
{
    return date('D, j M Y', strtotime($date));
}

/** What an appointment's payment looks like to a person. */
function payment_text(string $type, string $status, string $amount): string
{
    $money = format_inr($amount);
    return match (true) {
        $type === 'VISIT' && $status === 'PENDING'        => "Pay at visit ({$money} payable at the clinic)",
        $type === 'VISIT' && $status === 'PAID'           => "Paid at visit ({$money})",
        $type === 'ONLINE' && $status === 'PAID'          => "Paid online ({$money})",
        $type === 'ONLINE' && $status === 'PENDING'       => "Online payment pending ({$money})",
        $status === 'REFUND_PENDING'                      => "Refund of {$money} in progress",
        $status === 'REFUNDED'                            => "Refunded ({$money})",
        default                                           => $status,
    };
}
