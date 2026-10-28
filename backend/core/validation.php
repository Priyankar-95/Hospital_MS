<?php
declare(strict_types=1);

/** Request body (JSON or form) as an array. Cached per request. */
function request_body(): array
{
    static $body = null;
    if ($body !== null) {
        return $body;
    }
    $raw = file_get_contents('php://input') ?: '';
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if ($raw !== '' && str_contains($type, 'application/json')) {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            api_fail(400, 'INVALID_JSON', 'Request body is not valid JSON.');
        }
        $body = $decoded;
    } else {
        $body = $_POST;
    }
    return $body;
}

/** Collects field errors, then fails once with a 422. */
class Validator
{
    private array $errors = [];

    public function __construct(private array $input)
    {
    }

    public function string(string $field, int $min, int $max, bool $required = true): ?string
    {
        $value = $this->input[$field] ?? null;
        if ($value === null || (is_string($value) && trim($value) === '')) {
            if ($required) {
                $this->errors[$field] = 'This field is required.';
            }
            return null;
        }
        if (!is_string($value)) {
            $this->errors[$field] = 'Invalid value.';
            return null;
        }
        $value = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $value) ?? '');
        $len = mb_strlen($value);
        if ($len < $min || $len > $max) {
            $this->errors[$field] = "Must be between {$min} and {$max} characters.";
            return null;
        }
        return $value;
    }

    /** Positive integer (ids, counts). Accepts "12" from forms as well as 12 from JSON. */
    public function int(string $field, int $min = 1, int $max = PHP_INT_MAX, bool $required = true): ?int
    {
        $value = $this->input[$field] ?? null;
        if ($value === null || $value === '') {
            if ($required) {
                $this->errors[$field] = 'This field is required.';
            }
            return null;
        }
        if (is_string($value) && preg_match('/^-?\d{1,18}$/', $value)) {
            $value = (int) $value;
        }
        if (!is_int($value) || $value < $min || $value > $max) {
            $this->errors[$field] = 'Invalid value.';
            return null;
        }
        return $value;
    }

    public function add_error(string $field, string $message): void
    {
        $this->errors[$field] = $message;
    }

    public function email(string $field = 'email'): ?string
    {
        $value = $this->string($field, 3, 190);
        if ($value === null) {
            return null;
        }
        $value = strtolower($value);
        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] = 'Enter a valid email address.';
            return null;
        }
        return $value;
    }

    public function password(string $field = 'password'): ?string
    {
        $value = $this->input[$field] ?? null;
        if (!is_string($value) || $value === '') {
            $this->errors[$field] = 'This field is required.';
            return null;
        }
        if (strlen($value) < 8 || strlen($value) > 72) {
            $this->errors[$field] = 'Password must be 8 to 72 characters.';
            return null;
        }
        if (!preg_match('/[A-Za-z]/', $value) || !preg_match('/\d/', $value)) {
            $this->errors[$field] = 'Password must contain at least one letter and one number.';
            return null;
        }
        return $value;
    }

    public function phone(string $field = 'phone', bool $required = false): ?string
    {
        $value = $this->string($field, 7, 20, $required);
        if ($value === null) {
            return null;
        }
        if (!preg_match('/^\+?[0-9 \-]{7,20}$/', $value)) {
            $this->errors[$field] = 'Enter a valid phone number.';
            return null;
        }
        return $value;
    }

    public function enum(string $field, array $allowed, bool $required = true): ?string
    {
        $value = $this->input[$field] ?? null;
        if ($value === null || $value === '') {
            if ($required) {
                $this->errors[$field] = 'This field is required.';
            }
            return null;
        }
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            $this->errors[$field] = 'Invalid choice.';
            return null;
        }
        return $value;
    }

    public function fail_if_invalid(): void
    {
        if ($this->errors) {
            api_fail(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', $this->errors);
        }
    }
}

/**
 * Turn PHP's awkward $_FILES layout for a multi-file field (documents[]) into a plain list of single-file arrays.
 * Entries where nothing was chosen are dropped, but the original index is kept as the array key so a file
 * still lines up with its sibling field (e.g. document_types[3] belongs to documents[3]).
 */
function uploaded_files(string $field): array
{
    if (!isset($_FILES[$field]) || !is_array($_FILES[$field]['name'] ?? null)) {
        return isset($_FILES[$field]) && ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE ? [0 => $_FILES[$field]] : [];
    }
    $out = [];
    foreach (array_keys($_FILES[$field]['name']) as $i) {
        if (($_FILES[$field]['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $out[$i] = [
            'name'     => $_FILES[$field]['name'][$i],
            'type'     => $_FILES[$field]['type'][$i],
            'tmp_name' => $_FILES[$field]['tmp_name'][$i],
            'error'    => $_FILES[$field]['error'][$i],
            'size'     => $_FILES[$field]['size'][$i],
        ];
    }
    return $out;
}

/** Accept only same-site relative paths for post-login redirects (blocks open redirects). */
function safe_return_path(?string $path): ?string
{
    if ($path === null || $path === '' || $path[0] !== '/' || str_starts_with($path, '//') || str_contains($path, '\\')) {
        return null;
    }
    if (preg_match('/[\x00-\x1F]/', $path)) {
        return null;
    }
    return $path;
}

/** Escape for HTML output (used by server-rendered pieces such as emails and PDFs). */
function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
