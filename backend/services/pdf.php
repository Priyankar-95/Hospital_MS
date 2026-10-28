<?php
declare(strict_types=1);

use Dompdf\Dompdf;
use Dompdf\Options;

/**
 * PDF service skeleton (Dompdf). Phase 1 adds the real documents (patient invoice, doctor daily summary)
 * on top of pdf_from_html(). All dynamic values placed in the HTML must be escaped with e().
 */

function pdf_from_html(string $html, string $paper = 'A4', string $orientation = 'portrait'): string
{
    $options = new Options();
    $options->set('isRemoteEnabled', false);          // no outbound requests while rendering
    $options->set('isPhpEnabled', false);
    $options->set('chroot', project_root());
    $options->set('defaultFont', 'DejaVu Sans');       // has the Rupee sign
    $options->set('tempDir', sys_get_temp_dir());

    $dompdf = new Dompdf($options);
    $dompdf->loadHtml($html, 'UTF-8');
    $dompdf->setPaper($paper, $orientation);
    $dompdf->render();
    return $dompdf->output();
}

/** Standard page shell shared by every PDF. */
function pdf_document(string $title, string $body_html): string
{
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        body { font-family: "DejaVu Sans", sans-serif; font-size: 12px; color: #1f2937; }
        h1 { font-size: 20px; margin: 0 0 4px; color: #0b6e8a; }
        h2 { font-size: 14px; margin: 18px 0 6px; }
        .muted { color: #6b7280; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: left; }
        th { background: #f3f4f6; }
        .right { text-align: right; }
        .header { border-bottom: 2px solid #0b6e8a; padding-bottom: 8px; margin-bottom: 12px; }
    </style><title>' . e($title) . '</title></head><body>
        <div class="header"><h1>' . e(config('app.name')) . '</h1><div class="muted">' . e($title) . '</div></div>'
        . $body_html .
        '</body></html>';
}

/** Send PDF bytes to the browser. */
function send_pdf(string $pdf_bytes, string $filename, bool $download = true): never
{
    $safe = preg_replace('/[^A-Za-z0-9._\-]/', '_', $filename);
    header('Content-Type: application/pdf');
    header('Content-Length: ' . strlen($pdf_bytes));
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . $safe . '"');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    echo $pdf_bytes;
    exit;
}
