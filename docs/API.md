# API reference

Base URL (dev): `http://localhost:8100`. All endpoints return JSON in one shape:

```json
{ "success": true,  "data": { ... }, "error": null }
{ "success": false, "data": null,    "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { "email": "..." } } }
```

`details` is present only for validation errors (field name -> message).

## Rules for every request
- **Session:** a `hb_session` cookie (HttpOnly, SameSite=Lax) is set automatically. Send cookies with every request.
- **CSRF:** every `POST`/`PUT`/`PATCH`/`DELETE` needs the header `X-CSRF-Token: <token>`, including login and register. Get the token from `GET /api/auth/me` (`data.csrf_token`). Login and register return a fresh token. Missing or wrong token -> `403 CSRF_INVALID`.
- **Auth:** "Role: any" means any logged-in user. Not logged in -> `401 UNAUTHENTICATED`. Wrong role -> `403 FORBIDDEN`.
- Roles: `PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN`, `HOSPITAL_FRONTDESK`, `BRANCH_ADMIN`, `VENDOR_ADMIN`, `SUPER_ADMIN`.

## Common error codes
| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 401 | `UNAUTHENTICATED` | Not logged in |
| 403 | `FORBIDDEN` | Logged in, wrong role |
| 403 | `CSRF_INVALID` | CSRF token missing/wrong/expired |
| 404 | `NOT_FOUND` | No such endpoint or resource |
| 405 | `METHOD_NOT_ALLOWED` | Wrong HTTP method |
| 422 | `VALIDATION_ERROR` | Input invalid; see `error.details` |
| 500 | `SERVER_ERROR` | Unexpected error (details hidden unless `APP_DEBUG=true`) |

---

## Health

### `GET /api/health`
Role: public. Checks the app and database.
Response `data`: `{ "status": "ok" | "degraded", "app": "Liberty Health Care", "db": true, "time": "2026-10-10T11:35:42+05:30" }`

## Auth

### `GET /api/auth/me`
Role: public. Returns the current user (or `null` for guests) and a CSRF token. Call this first on every page.
Response `data`: `{ "user": { "id", "role", "name", "email", "home" } | null, "csrf_token": "..." }`
`home` is the frontend page path for that role.

### `POST /api/auth/register`
Role: public. Creates a **PATIENT** account and logs them in. A `role` field in the body is ignored.
Request: `{ "name": "2-150 chars", "email": "valid email", "password": "8-72 chars, at least one letter and one number", "phone": "optional, 7-20 chars" }`
Response `data`: `{ "user": {...}, "csrf_token": "..." }`
Errors: `409 EMAIL_TAKEN`, `422 VALIDATION_ERROR`.

### `POST /api/auth/login`
Role: public. Request: `{ "email", "password", "role_group": "PATIENT" | "DOCTOR" | "STAFF" }`. `role_group` is the tab chosen on the login screen (STAFF = hospital admin, front desk, branch admin, vendor, super admin). It is optional; when omitted no role check is made.
Response `data`: `{ "user": {...}, "csrf_token": "..." }`. The session ID is regenerated on login.
Errors:
| Status | Code | When |
|---|---|---|
| 404 | `ACCOUNT_NOT_FOUND` | No account with this email (message names the tab, e.g. "No doctor account exists for this email."). The UI offers "Register now". |
| 401 | `INVALID_CREDENTIALS` | Wrong password. Never reveals the account's real role. |
| 401 | `USE_GOOGLE` | The account has no password (created through Google) |
| 403 | `WRONG_ROLE_TAB` | Correct password, but the account belongs to another tab (message says which one). Only returned after the password is verified. |
| 403 | `ACCOUNT_SUSPENDED` | Account suspended |
| 422 | `VALIDATION_ERROR` | Bad input, or invalid `role_group` |

Note: `ACCOUNT_NOT_FOUND` reveals whether an email is registered (owner's product choice). Rate limiting is planned for Phase 5.

### `POST /api/auth/logout`
Role: public (safe to call when logged out). Response `data`: `{ "logged_out": true }`.

### `GET /api/auth/google?role_group=PATIENT&return_to=/some/path`
Role: public. Browser navigation, not an AJAX call. Redirects (302) to Google. `return_to` must be a same-site path starting with a single `/`. `role_group` (`PATIENT` | `DOCTOR` | `STAFF`) is the login tab in use.
Error: `503 GOOGLE_NOT_CONFIGURED` when `.env` has no Google credentials.

### `GET /api/auth/google-callback`
Role: public. Google redirects here. On success: logs in and redirects (302) to `return_to` or the role's home page. On any problem: redirects to `/frontend/shared/login.html?error=<code>&role_group=<tab>` where code is one of `google_cancelled`, `google_state_mismatch`, `google_failed`, `google_not_configured`, `google_wrong_role` (this Google account belongs to another tab), `google_no_account` (no doctor/staff account for this Google email).
Rules: an unknown Google email creates a PATIENT account only when the Patient tab (or no tab) was used. Doctors must use the registration form and staff accounts are created by admins, so those tabs return `google_no_account`. A Google email that matches an existing account is linked to it.

## Reference data

### `GET /api/specialties?state_id=&district_id=`
Role: public. Optional filters count only doctors in that place. Response `data`: `{ "items": [ { id, name, slug, description, doctor_count, fee_from } ] }`. `doctor_count` counts bookable (listed) doctors; `fee_from` is the lowest active fee as a string or `null`. Bad ids -> `422`.

### `GET /api/symptoms`
Role: public. A plain list of problems and the departments they point to (not AI). Response `data`: `{ "items": [ { id, name, specialties: [ { id, name } ] } ] }`.

### `GET /api/locations/states`
Role: public. Response `data`: `{ "items": [ { "id", "name" } ] }` sorted by name.

### `GET /api/locations/districts?state_id=<id>`
Role: public. Response `data`: `{ "items": [ { "id", "name" } ] }`. `state_id` is required (422 otherwise).

## Doctors (registration and own status)

`/api/auth/me` returns `doctor_status` (`PENDING`, `APPROVED`, `REJECTED`, ...) inside `user` for doctors. Until a doctor is `APPROVED` the server refuses every doctor feature with `403 DOCTOR_NOT_VERIFIED`; only the endpoints below work.

### `POST /api/doctors/register`
Role: public. **Multipart form** (CSRF header still required). Creates a DOCTOR account plus a PRIVATE doctor record with status `PENDING`, and logs the doctor in. Everything is saved in one transaction; if any file is rejected nothing is created.
Fields: `name`, `email`, `password`, `phone` (optional), `specialty_id`, `district_id`, `qualifications` (2-500), `clinic_name`, `address` (5-500), `about` (optional), `documents[]` (files, PDF/JPG/PNG, max 5 MB each, max 10) with a parallel `document_types[]` (`DEGREE`, `REGISTRATION`, `CERTIFICATE`, `ID_PROOF`, `OTHER`). Files are optional while `REQUIRE_VERIFICATION_DOCUMENTS=false`.
Response `data`: `{ "user": {..., "doctor_status": "PENDING"}, "csrf_token" }`.
Errors: `409 EMAIL_TAKEN`, `422 VALIDATION_ERROR` (file problems appear under `details.documents` and name the file).

### `GET /api/doctors/me`
Role: `DOCTOR`. The doctor's own application, for every status. Response `data.doctor`: `{ id, name, doctor_type, verification_status, rejection_reason, specialty{id,name}, location{state_id,state,district_id,district}, qualifications, about, clinic_name, address, facilities, hospital_name, photo_url, documents[{id,doc_type,original_name,mime_type,size_bytes,uploaded_at}] }`. `photo_url` is `null` or `/api/doctors/{id}/photo?v=<hash>`; `hospital_name` is set for hospital doctors only.

### `POST /api/doctors/me/profile`
Role: `DOCTOR`, **approved only** (`403 DOCTOR_NOT_VERIFIED` otherwise). JSON. Request: `{ "about": "optional, up to 2000 chars" }` for every doctor, plus for private doctors `"clinic_name"` (2-200), `"address"` (5-500) and optional `"facilities"` (up to 1000). Hospital doctors cannot change clinic fields (the hospital owns them; any such fields are ignored). Specialty, district, qualifications, status and type are never changed by this endpoint. Response `data`: `{ "doctor": {...} }` (same shape as `/me`). Errors: `422 VALIDATION_ERROR`.

### `POST /api/doctors/me/photo`
Role: `DOCTOR`, approved only. Multipart, field `photo`: JPG, PNG or WEBP, up to 5 MB (type decided from file content). Replaces the old photo (old file deleted). Response `data`: `{ "doctor": {...} }`. Errors: `422 VALIDATION_ERROR` (no file), `422 UPLOAD_TYPE_NOT_ALLOWED`, `422 UPLOAD_TOO_LARGE`, `422 UPLOAD_EMPTY`.

### `DELETE /api/doctors/me/photo`
Role: `DOCTOR`, approved only. Removes the photo and deletes the file. Safe to repeat. Response `data`: `{ "doctor": {...} }`.

### `POST /api/doctors/me/documents`
Role: `DOCTOR`, approved only. Multipart: `documents[]` files (PDF/JPG/PNG, up to 5 MB each, at most 10) with matching `document_types[]` (`DEGREE`, `REGISTRATION`, `CERTIFICATE`, `ID_PROOF`, `OTHER`). At least one file is required. If any file is bad nothing is saved. Response `data`: `{ "doctor": {...} }`.

### `GET /api/doctors/{id}/photo`
Role: any signed-in account for an `APPROVED` doctor (guests get `401`; private browser cache). For a doctor who is not approved: only that doctor, the Branch Admin of the doctor's district, or `SUPER_ADMIN`; everyone else gets `404` (same as "no photo"). Streams the image.

### `POST /api/doctors/me/resubmit`
Role: `DOCTOR`, only when status is `REJECTED` (else `409 NOT_REJECTED`). Multipart: same profile and document fields as registration (no account fields). Status goes back to `PENDING` and the rejection reason is cleared. New documents are added to the old ones. Response `data`: `{ "doctor": {...} }`.

### `GET /api/doctors/documents/{id}`
Role: the doctor who owns it, the Branch Admin whose districts include the doctor's district, or `SUPER_ADMIN`. Streams the file. Anyone else (and unknown ids) gets `404`.

## Doctor directory (signed-in accounts only; guests get `401` and can only see the home page)
Who is listed: `APPROVED` doctors whose account is active; hospital doctors only while their hospital is `APPROVED`. Everything else returns `404` (same answer as "does not exist"). Responses are never cached.

Availability rules used everywhere: a window is `OPEN` while it is not closed, has room, and has not ended. `COUNT` windows can be booked until the window ends (patients get the next serial number); `SLOTS` windows can be booked until the slot starts, one patient per slot. A slot is taken when a non-cancelled appointment exists for it. Window status: `OPEN`, `FULL`, `CLOSED`, `ENDED`.

**Doctor card** (used in lists): `{ id, name, photo_url, doctor_type, specialty{id,name}, qualifications, location{district_id,district,state_id,state}, place{name,address,kind: "HOSPITAL"|"CHAMBER"}, fee_from, next_available }`. `fee_from` = lowest active fee (string) or `null`. `next_available` = `{ date, is_today, mode, start, end, slot_time (SLOTS only), remaining, schedule_id }` or `null`.

### `GET /api/doctors/search`
Query (all optional): `specialty_id`, `state_id`, `district_id`, `type` (`HOSPITAL` | `PRIVATE`), `q` (1-100 chars; matches doctor, clinic, hospital, qualifications or specialty name; `%` and `_` are matched literally), `sort` (`soonest` default, `fee_low`, `fee_high`, `name`), `page` (default 1), `per_page` (1-24, default 10).
Response `data`: `{ items: [card], total, page, per_page, pages }`. A page past the end returns the last page. `soonest` puts doctors without slots last; `fee_low`/`fee_high` put doctors without a fee last. Bad input -> `422`.

### `GET /api/doctors/{id}`
Response `data`: `{ "doctor": card + { about, facilities, phone, advance_booking_days, fees: [ { id, treatment_name, fee } ] } }`. Only active fees are shown. `facilities` and `phone` come from the hospital for hospital doctors (private doctors' phone is never exposed). Non-numeric, unknown or unlisted ids -> `404`.

### `GET /api/doctors/compare?ids=3,5,9`
2 to 4 distinct doctor ids. Response `data`: `{ items: [ same as GET /api/doctors/{id} ], requested }`, in the order asked; doctors that are no longer listed are left out (`requested` tells how many were asked for). Anything else -> `422` with `details.ids`.

### `GET /api/doctors/{id}/availability`
Response `data`: `{ advance_booking_days, days: [ { date, weekday, status, remaining, window_count } ] }` for every date from today to today + `advance_booking_days`. `status`: `AVAILABLE`, `FULL`, `CLOSED`, `ENDED` or `NOT_WORKING`.

### `GET /api/doctors/{id}/slots?date=YYYY-MM-DD`
Response `data`: `{ date, windows: [ window ] }`. A window: `{ schedule_id, start, end, mode, slot_minutes, max_patients, booked_count, remaining, status }` plus, for `COUNT`: `next_serial` (when open); for `SLOTS`: `slots: [ { time, available, reason: "TAKEN" | "PAST" | null } ]` and `next_slot`. A day without hours returns `windows: []`. `date` must be a real date from today to today + `advance_booking_days`, else `422`.

(Days for a doctor are created automatically from their weekly hours whenever the schedule is read, so patients always see the full booking window.)

## Appointments (patients)

### `POST /api/appointments`
Role: `PATIENT`. Books one place. JSON: `{ "schedule_id": int, "treatment_id": int, "slot_time": "HH:MM" (time-slot sessions only), "payment_type": "VISIT", "phone": "optional" }`. `schedule_id` comes from `GET /api/doctors/{id}/slots` (`windows[].schedule_id`), `treatment_id` from the doctor's fees. `payment_type` defaults to `VISIT` (pay at visit); `ONLINE` returns `422 ONLINE_PAYMENT_UNAVAILABLE` until Razorpay is added. A valid `phone` is saved on the patient's account.
How it stays safe: everything runs in one database transaction that first locks the schedule row, so two patients can never take the last place or the same slot. A unique key on `(schedule_id, active_token)` is a second guard. The fee is copied onto the booking, so later fee changes do not affect it.
Response `data`: `{ "appointment": { booking_code, status, date, mode, time, window{start,end}, token_number, treatment_name, fee_amount, payment_type, payment_status, created_at, doctor{ id, name, photo_url, specialty, place, place_kind, address, district, state } } }`. `time` is set for slot sessions; `token_number` is the serial number (per-day-count sessions, never reused, so the public `next_serial` is one more than the highest ever handed out) or the slot position (slot sessions).
Errors:
| Status | Code | Meaning |
|---|---|---|
| 401 / 403 | `UNAUTHENTICATED` / `FORBIDDEN` / `CSRF_INVALID` | not logged in, not a patient, or no CSRF token |
| 404 | `SCHEDULE_NOT_FOUND`, `DOCTOR_NOT_AVAILABLE` | no such session, or the doctor/hospital is not approved |
| 409 | `FULL` | no places left |
| 409 | `SLOT_TAKEN` | someone just booked that slot |
| 409 | `ALREADY_BOOKED` | this patient already has a place in this session |
| 409 | `SLOT_PASSED`, `WINDOW_ENDED`, `DAY_CLOSED`, `SLOT_UNAVAILABLE` | the time has gone, the day is closed, or it is outside the booking window |
| 422 | `VALIDATION_ERROR` | bad `schedule_id`, `treatment_id` (must be one of this doctor's active fees), `slot_time` (must be on the slot grid; not allowed for count sessions) or `phone` |
| 422 | `ONLINE_PAYMENT_UNAVAILABLE` | online payment is not available yet |

After a successful booking the server emails the patient a confirmation with the **invoice PDF attached** (template `booking_confirmed`). The response then also carries `"email_sent": true | false`. A failed email never undoes the booking; it is recorded in `email_log` as `FAILED`.

### `GET /api/appointments?scope=upcoming|past&page=&per_page=`
Role: `PATIENT`. My Appointments. `scope` default `upcoming`: bookings with status `BOOKED` whose session has not ended, soonest first. `past`: everything else (cancelled, completed, no-show, ended), newest first. `per_page` 1-50 (default 10); a page past the end returns the last page. Response `data`: `{ items: [ appointment + { upcoming: bool } ], total, page, per_page, pages, scope }`. Only the patient's own bookings are ever returned. Bad query -> `422`.

### `GET /api/appointments/{code}`
Role: `PATIENT`. One of the patient's own bookings by code (`HB-` + 8 letters/digits, any capitals). Same shape as above plus `upcoming`. Someone else's booking, an unknown or malformed code all return `404`.

### `POST /api/appointments/{code}/cancel`
Role: `PATIENT`, own booking only. JSON: `{ "reason": "optional, up to 300 characters" }`. Allowed while the booking is `BOOKED` and **until 24 hours before the appointment** (the slot time, or the session start for per-day-count sessions). The place is released at once; the booking is kept as history with status `CANCELLED`. Runs in the same locked transaction as booking, so it cannot clash with someone booking the same day. The patient and the doctor are emailed (templates `booking_cancelled`, `booking_cancelled_doctor`).
Response `data`: `{ "appointment": {...}, "refund": { required, status: "NONE"|"REFUND_PENDING"|"REFUNDED", message }, "emails": { patient, doctor } }`. Pay-at-visit bookings never need a refund. A paid **online** booking moves to `REFUND_PENDING` (full amount; the Razorpay refund call itself is added with online payments).
Errors: `404` (not yours / unknown), `409 ALREADY_CANCELLED`, `409 CANCEL_WINDOW_CLOSED` (less than 24 hours left), `409 NOT_CANCELLABLE` (completed or no-show), `422` (bad reason), plus the usual `401`/`403`/`CSRF_INVALID`.

The appointment object now also carries: `can_cancel` (bool, the patient's rule), `cancel_deadline` (`YYYY-MM-DD HH:MM`, only for `BOOKED`), and `cancellation: { by: "PATIENT"|"DOCTOR", at, reason }` (only for `CANCELLED`).

### `POST /api/doctors/me/appointments/{code}/cancel`
Role: `DOCTOR`, approved only; their **own** patients' bookings only (others `404`). JSON: `{ "reason": "5-300 characters" }` (required: the patient sees it). Allowed **at any time** (emergencies) until the session is over (`409 NOT_CANCELLABLE` after). The patient is emailed with the reason; the doctor is not emailed about their own action. Online payments move to `REFUND_PENDING` in full.
Response `data`: `{ booking_code, status, payment_status, refund: { required, status }, emails }`. Errors: `403 DOCTOR_NOT_VERIFIED`, `404`, `409 ALREADY_CANCELLED` / `NOT_CANCELLABLE`, `422` (missing, too short or too long reason).
(The doctor's screen for this arrives with the appointments dashboard in step 10; hospital-initiated cancellation is Phase 2.)

### `GET /api/appointments/{code}/invoice[?download=1]`
Role: `PATIENT` (owner only; others `404`). Returns the invoice as `application/pdf`: one A4 page with booking ID, patient, doctor and place, date and time (or session and patient number), treatment, amount, payment line and a "computer-generated" note. Works for pay-at-visit, online (paid or pending), and cancelled/refunded bookings. Opens in the browser; `?download=1` sends it as a file named `invoice-<code>.pdf`. Never cached.

## Doctor schedule and fees (approved doctors, private and hospital)
All endpoints: Role `DOCTOR`, approved only (`403 DOCTOR_NOT_VERIFIED` otherwise). Weekdays are ISO numbers, 1 = Monday ... 7 = Sunday. Times are `HH:MM` (24-hour, IST).

How it works: the doctor saves **weekly working hours**. The server turns them into **dated rows** (one per date and window) for today up to `advance_booking_days` ahead. Patients book those rows. Rows are topped up automatically whenever the schedule is read or saved. Today's window is only published if it has not finished.

Two booking modes per window:
- `COUNT`: per-day patient count (`max_patients`), patients get a serial number.
- `SLOTS`: fixed-length slots (`slot_minutes`), one patient per slot. Capacity is worked out by the server: `floor(minutes in window / slot_minutes)`.

### `GET /api/doctors/me/schedule`
Response `data`: `{ "advance_booking_days": 14, "windows": [ { id, weekday, start, end, mode, max_patients, slot_minutes } ], "days": [ { date, weekday, is_closed, booked, windows: [ { id, start, end, mode, slot_minutes, max_patients, booked_count, is_closed } ] } ] }`. `days` covers today to today + `advance_booking_days`.

### `POST /api/doctors/me/schedule/weekly`
Replaces all weekly hours and the booking window. JSON: `{ "advance_booking_days": 1-60, "windows": [ { "weekday": 1-7, "start": "17:00", "end": "20:00", "mode": "COUNT" | "SLOTS", "max_patients": 1-500 (COUNT only), "slot_minutes": 5-120 (SLOTS only) } ] }`. All numbers must be JSON integers.
Rules: end after start; windows on the same day must not overlap; at most 4 windows per day; a SLOTS window must hold 1-200 slots.
Effect: future days that have no bookings and are not closed are rebuilt from the new hours. **Days with bookings, and closed days, are never changed.**
Response `data`: `{ "schedule": {...as GET...}, "summary": { "created": n, "removed": n, "kept_with_bookings": n } }`.
Errors: `422 VALIDATION_ERROR` with `details.windows` (a sentence naming the day and time that is wrong) or `details.advance_booking_days`. Nothing is saved when anything is invalid.

### `POST /api/doctors/me/schedule/dates/{date}/close`
Closes a day (leave, holiday), `{date}` = `YYYY-MM-DD`, today or later. Response `data`: `{ "date", "schedule": {...} }`.
Errors: `409 HAS_BOOKINGS` (the day already has bookings), `404` (no working hours on that date), `422` (bad or past date).

### `POST /api/doctors/me/schedule/dates/{date}/open`
Reopens a closed day. Same errors as close (except `HAS_BOOKINGS`). Response `data`: `{ "date", "schedule": {...} }`.

### `GET /api/doctors/me/fees`
Response `data`: `{ "fees": [ { id, treatment_name, fee, is_active, updated_at, updated_by: { role: "DOCTOR" | "HOSPITAL_ADMIN", name } } ] }`. `fee` is a decimal **string** such as `"500.00"` (money is never a float). Active fees first, then by name.

### `POST /api/doctors/me/fees`
JSON: `{ "treatment_name": "2-150 chars", "fee": "500" }`. `fee` is a string (or integer) with up to 6 digits and 2 decimals, 0 to 100000. A floating-point JSON number is refused. Records who updated it. Response `data`: `{ "fees": [...] }`. Errors: `409 FEE_EXISTS` (same name, any capitals), `422 VALIDATION_ERROR` (`details.treatment_name` / `details.fee`).

### `POST /api/doctors/me/fees/{id}`
Partial update, any of `treatment_name`, `fee`, `is_active` (boolean). Records who updated it. Response `data`: `{ "fees": [...] }`. Errors: `404` (not your fee), `422` (all bad fields reported together).

### `DELETE /api/doctors/me/fees/{id}`
Deletes the fee. Appointments keep their own copy of the treatment name and amount. Response `data`: `{ "fees": [...] }`. `404` for another doctor's fee.

## Branch Admin: doctor verification (Phase 1 minimal screen)

All endpoints: role `BRANCH_ADMIN`. A Branch Admin only sees doctors in their own assigned districts; anything else answers `404`.

### `GET /api/branch/doctors?status=PENDING|APPROVED|REJECTED`
Default `PENDING`, oldest first. Response `data`: `{ "items": [ { id, name, email, phone, doctor_type, verification_status, rejection_reason, specialty, district, state, qualifications, clinic_name, address, about, submitted_at, verified_at, document_count } ], "counts": { "PENDING", "APPROVED", "REJECTED" } }`.

### `GET /api/branch/doctors/{id}`
Response `data.doctor`: the summary above plus `documents[]`.

### `POST /api/branch/doctors/{id}/approve`
Only from `PENDING` (else `409 NOT_PENDING`, so a double click is harmless). Sets `verified_by` / `verified_at` and emails the doctor (`doctor_approved`). Response `data`: `{ doctor_id, verification_status: "APPROVED", email_sent }`. An email failure never blocks the approval.

### `POST /api/branch/doctors/{id}/reject`
Request: `{ "reason": "5-500 chars" }`. Only from `PENDING`. Emails the doctor the reason (`doctor_rejected`). Response `data`: `{ doctor_id, verification_status: "REJECTED", email_sent }`.

## Doctor appointments dashboard (step 10)
All need role `DOCTOR` with an APPROVED account (`403 DOCTOR_NOT_VERIFIED` otherwise). A doctor only ever sees and changes bookings made with them; another doctor's booking answers `404`. All `POST`s need the CSRF header.

### `GET /api/doctors/me/appointments?date=YYYY-MM-DD`
`date` defaults to today; a bad date is `422`. Response `data`: `{ date, is_today, doctor_type, summary, appointments[], days[] }`.
- `summary`: `{ total, booked, completed, no_show, cancelled, expected, collected, pending }` (money as strings; cancelled bookings are not counted in money).
- `appointments[]`: `{ booking_code, status, mode, time (SLOTS) | token_number (COUNT), window{start,end}, patient{name,email,phone}, treatment_name, fee_amount, payment_type, payment_status, payment_marked_at, cancellation{by,reason}|null, can_mark_paid, can_unmark_paid, can_complete, can_no_show, can_reopen, can_cancel }`. The `can_*` flags are the same rules the server enforces on the actions below.
- `days[]`: 14 days (date - 3 .. date + 10) with `{ date, weekday, booked, completed, no_show, cancelled, active }` for the date strip.

### `GET /api/doctors/me/appointments/daily-pdf?date=YYYY-MM-DD[&download=1]`
The daily summary as a PDF (A4 landscape): counts, expected / collected / to-collect, and one row per booking with patient name and phone, treatment, payment type and status, booking status and fee. Cancelled rows are greyed out.

### `POST /api/doctors/me/appointments/{code}/paid`
Marks a pay-at-visit booking as paid (records who and when). **Private doctors only** (`403` for hospital doctors, whose front desk marks payments in Phase 2). `409 NOT_PAYABLE` unless the booking is VISIT + PENDING, BOOKED or COMPLETED, and the visit day has come. Response `data`: `{ appointment }` (one item as above).

### `POST /api/doctors/me/appointments/{code}/unpaid`
Undo a "paid" mark made by mistake; only by the doctor who marked it (`409 NOT_UNPAYABLE`). Private doctors only.

### `POST /api/doctors/me/appointments/{code}/complete` · `/no-show` · `/reopen`
`complete` / `no-show`: from BOOKED (or switching between the two), only on or after the visit day (`409 INVALID_STATE` otherwise). `reopen`: COMPLETED or NO_SHOW back to BOOKED. Response `data`: `{ appointment }`.

### `POST /api/doctors/me/appointments/{code}/cancel`
Doctor cancel with a required reason (see Cancellation); the dashboard button uses this.

## System

### `POST /api/system/test-email`
Role: `SUPER_ADMIN`. Sends the `test_email` template to check SMTP settings.
Request: `{ "to": "valid email" }`. Response `data`: `{ "sent": true|false, "log": { "id", "to_email", "template", "status", "error_message", "created_at" } }`

### `GET /api/system/email-log`
Role: `SUPER_ADMIN`. Last 50 rows of `email_log`. Response `data`: `{ "items": [ { "id", "to_email", "template", "subject", "status", "error_message", "created_at" } ] }`

### Dev-only endpoints (exist only when `APP_ENV=local`)
| Method + path | Role | Purpose |
|---|---|---|
| `GET /api/system/probe/patient` (and `doctor`, `hospital`, `frontdesk`, `branch`, `vendor`, `admin`) | the matching role only | Proves role checks: returns 200 for that role, 403 for all others |
| `GET /api/system/probe/approved-doctor` | `DOCTOR` | 200 only for an APPROVED doctor, `403 DOCTOR_NOT_VERIFIED` otherwise (proves the approved-only gate) |
| `POST /api/system/test-upload` | any | Multipart form: `file` (+ optional `kind` = `document`\|`image`). Stores via the upload service. Response: `{ "path", "original_name", "mime", "size" }` |
| `GET /api/system/test-upload/view?path=...` | any | Streams a stored file back (proves files are served only through the API) |
| `GET /api/system/test-pdf` | any | Returns a sample PDF from the PDF service |

---

*Endpoints for doctors, appointments, payments, hospitals, pharmacy and admin are added to this file in the phase that builds them.*

## Account (profile settings)
Any signed-in user. `POST`s need the CSRF header.
- `GET /api/account` → `{ account: { id, role, name, email, phone, auth_provider, can_change_password } }`
- `POST /api/account` `{ name (2-150), phone (optional) }` → `{ account }`. `403` for DOCTOR (they use the doctor profile page).
- `POST /api/account/password` `{ current_password, new_password }` → `{ changed: true }`. `422` if the current password is wrong or the new one is weak; `409 USE_GOOGLE` for Google accounts.

## Home page data (public)
### `GET /api/home/hospitals?state_id=&district_id=&limit=`
Role: none (public). Verified hospitals that have at least one bookable doctor, soonest-available first. `limit` 1-12 (default 6). Response `data`: `{ items: [ { id, name, address, phone, district, state, doctor_count, fee_from, total_beds, facilities[<=3], next_available { date, is_today, time } | null } ], total }`.
### `GET /api/home/stats`
Role: none (public). Live counts: `{ doctors, hospitals, districts, specialties, appointments }` (bookable doctors, approved hospitals, districts with a bookable doctor, specialties with a bookable doctor, non-cancelled appointments).

### Profile picture (any signed-in user; POST/DELETE need the CSRF header)
- `GET /api/account/avatar` streams the signed-in user's own picture (404 when none). Not public.
- `POST /api/account/avatar` multipart field `photo` (JPG/PNG/WEBP). Replaces the old file. Returns `{ account }`. For a DOCTOR it sets the doctor profile photo.
- `DELETE /api/account/avatar` removes it. Returns `{ account }`.
- `account.avatar_url` (also `user.avatar_url` in `GET /api/auth/me`) is `/api/account/avatar?v=<hash>` or null; the hash changes when the picture changes so browsers refresh it.

### `GET /api/home/stats` (updated)
Adds `growth_days` (30) and `growth: { doctors, hospitals, appointments }`, each `{ new, percent|null }`. `new` counts items approved / created in the last 30 days (doctor and hospital `verified_at`, appointment `created_at`); `percent` = new / (total - new), or null when there was nothing before.

> **Login rule (owner decision, 2026-10-13):** `GET /api/doctors/search`, `/compare`, `/{id}`, `/{id}/availability`, `/{id}/slots` and `/{id}/photo` need a signed-in account (any role); a guest gets `401 UNAUTHENTICATED`. Still public because the home page shows them: `/api/symptoms`, `/api/specialties`, `/api/home/hospitals`, `/api/home/stats`, `/api/locations/*`.

## Hospital onboarding (Phase 2, step 1)
A hospital joins by invitation from a Branch Admin (see DECISIONS 2026-10-24). All `POST`s need the CSRF header.

### Branch Admin (role `BRANCH_ADMIN`; only their own districts)
- `GET /api/branch/districts` → `{ districts: [ { id, name, state } ] }` (for the invite form).
- `GET /api/branch/hospital-invites` → `{ items: [ { id, hospital_name, email, phone, district, state, status INVITED|EXPIRED|REVOKED, expires_at, created_at } ], open_count }`. Accepted invitations are left out (they are applications now).
- `POST /api/branch/hospital-invites` `{ hospital_name (2-200), email, district_id (one of theirs), phone? }` → `{ invite, email_sent }`. `422` field errors or a district they do not cover; `409 EMAIL_TAKEN` (that email already has an account); `409 INVITE_EXISTS` (a live invitation to that email exists). In local development the response also has `dev_invite_url`.
- `POST /api/branch/hospital-invites/{id}/resend` → new link and 7 more days (the old link stops working). Only for INVITED or EXPIRED, else `409 NOT_RESENDABLE`. Another Branch Admin's invitation is `404`.
- `POST /api/branch/hospital-invites/{id}/revoke` → status REVOKED. Only for INVITED or EXPIRED, else `409 NOT_REVOCABLE`.
- `GET /api/branch/hospitals?status=PENDING|APPROVED|REJECTED` → `{ items: [ { id, name, verification_status, rejection_reason, address, phone, district, state, admin{name,email,phone}, document_count, submitted_at, verified_at } ], counts{PENDING,APPROVED,REJECTED} }`.
- `GET /api/branch/hospitals/{id}` → the same plus `documents[]` (`404` outside their districts).
- `POST /api/branch/hospitals/{id}/approve` → `{ hospital_id, verification_status: "APPROVED", email_sent }`; `409 NOT_PENDING` if it is not waiting. Emails the hospital admin (`hospital_approved`).
- `POST /api/branch/hospitals/{id}/reject` `{ reason (5-500) }` → `REJECTED`; emails the reason (`hospital_rejected`).

### The invitation link (public)
- `GET /api/hospital-invites/{token}` → `{ invite: { hospital_name, email, phone, district, state, invited_by, expires_at } }`. Errors: `404 INVITE_NOT_FOUND` (unknown or malformed token), `410 INVITE_EXPIRED`, `410 INVITE_USED`, `410 INVITE_REVOKED`.
- `POST /api/hospital-invites/{token}/accept` (multipart): `hospital_name`, `address`, `hospital_phone?`, `admin_name`, `admin_phone?`, `password`, `documents[]` + `document_types[]` (`LICENSE|REGISTRATION|CERTIFICATE|OTHER`, PDF/JPG/PNG up to 5 MB; required only when `REQUIRE_VERIFICATION_DOCUMENTS=true`). Creates the `HOSPITAL_ADMIN` account (email = the invited address) and the `PENDING` hospital, logs them in. Response `{ user (with hospital_status), csrf_token }`. Same error codes as above plus `409 EMAIL_TAKEN`.

### Hospital Admin (role `HOSPITAL_ADMIN`)
- `GET /api/hospitals/me` → `{ hospital: { id, name, verification_status, rejection_reason, address, phone, location, documents[] } }` (works in every state: feeds the waiting / rejected screens).
- `POST /api/hospitals/me/resubmit` (multipart: `hospital_name`, `address`, `hospital_phone?`, `documents[]`) → back to `PENDING`. Only when `REJECTED`, else `409 NOT_REJECTED`.
- `GET /api/hospitals/documents/{id}` → the file. Allowed: that hospital's admin, the Branch Admin of its district, a Super Admin; everyone else `404`.
- `GET /api/auth/me` now also returns `user.hospital_status` for a Hospital Admin.

### Hospital Admin portal (role `HOSPITAL_ADMIN`, hospital must be `APPROVED`, else `403 HOSPITAL_NOT_APPROVED`)
- `GET /api/hospitals/me/overview` → `{ hospital, stats: { doctors, pending_doctors, invited_doctors, bookings_today, bookings_upcoming, departments }, beds, departments[], facilities[], setup[] }`.
- `GET /api/hospitals/me/departments` → `{ hospital, beds, departments[{id,specialty_id,name,bed_count,doctor_count}], available_specialties[] }`.
- `POST /api/hospitals/me/departments` `{ specialty_id, bed_count }` → adds a department. `422` if already added or beds invalid.
- `PATCH /api/hospitals/me/departments/{id}` `{ bed_count }` → `{ departments[] }`. Only the admin's own hospital's departments (else `404`).
- `DELETE /api/hospitals/me/departments/{id}` → removes it (doctors are not affected).
- `GET /api/hospitals/me/beds` → `{ hospital, beds: { total_beds, available_beds, occupied_beds, occupancy_percent, beds_assigned }, departments[] }`.
- `PUT /api/hospitals/me/beds` `{ total_beds, available_beds }` → `422` on field `available_beds` if more than the total.
- `GET /api/hospitals/me/facilities` → `{ hospital, options[], selected[] }`. `PUT /api/hospitals/me/facilities` `{ facilities: [] }` (max 25, commas and line breaks cleaned, duplicates dropped) → `{ selected[] }`.
- `PUT /api/hospitals/me` `{ address, phone?, email? }` → `{ hospital }`. Name and district cannot be changed (ignored).

### Branch Admin lists, paging and overview (role `BRANCH_ADMIN`)
- `GET /api/branch/doctors` and `GET /api/branch/hospitals` now take `?status=` (as before) plus `page` (default 1), `per_page` (default 10, max 50), `q` (search: name / email / specialty for doctors; hospital name / admin name / admin email for hospitals) and `district_id` (must be one of the admin's own districts, else `422`). The answer also carries `pagination: { page, per_page, total, pages }`; `counts` follows the district filter. Each hospital item has `document_types[]` (for example `["LICENSE"]`).
- `GET /api/branch/overview` → `{ stats: { hospitals, hospitals_pending, invites_open, doctors, doctors_pending, bookings_month }, districts[{id,name,state,hospitals,doctors,waiting}], waiting[{kind,id,name,district,submitted_at}] }`. Only counts, only the admin's own districts, no money figures.
