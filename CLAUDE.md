# CLAUDE.md — Hospital & Doctor Booking Platform

You are building this project phase by phase. Read this whole file at the start of every session, then read `docs/PROGRESS.md` to see where we are. The full product spec is `docs/PRD_v3.docx` (convert with `pandoc` if you need to read it). If this file and the PRD ever disagree, stop and ask me.

## 0. How we work (most important rules)

1. **One phase at a time.** Never start the next phase until I write "go ahead" for it.
2. **Inside a phase, work in the numbered steps listed below.** After each step: run it, test it, fix what is broken, then tick it off in `docs/PROGRESS.md`.
3. **Ask before guessing.** At the start of each phase, list any questions you have about that phase and wait for my answers. Do not silently invent schema, flows or rules. If something is not in this file or the PRD, ask.
4. **Finish a phase properly.** When all steps are done, run the phase's "Definition of Done" checklist, and report: what you built, what you tested and how, what you could not test, and any known issues. Then STOP and wait.
5. **No scope creep.** Build only what the PRD and the current phase describe. The UI reference folder contains extra features (AI triage chat, ABHA, settlement ledger, SLA analytics, etc.). Do not build them. See section 3.
6. **Record decisions.** Put every decision we make in `docs/DECISIONS.md` (date, decision, reason).
7. **Small, reviewable changes.** Prefer several small commits-worth of work over one huge change. Do not commit or push unless I ask.

## 1. Stack and conventions

- Backend: PHP (plain PHP, organised, no heavy framework unless I approve one). REST JSON API.
- Database: MySQL, accessed with PDO and **prepared statements only**. Schema lives in numbered SQL migration files in `database/migrations/`. Seed data in `database/seeds/`.
- Frontend: HTML5, CSS3, Tailwind CSS, vanilla JavaScript. No frontend framework.
- Auth: Google OAuth2 and an email + password form. No mobile OTP, no Truecaller.
- Payments: Razorpay (test mode during development). Keys come from `.env`, never hard-coded.
- Email: SMTP-based email only (no SMS). Use one mail library, configured from `.env`.
- PDF: server-side PDF generation for patient invoices and the doctor daily summary.
- Dependencies: you may use Composer for these and nothing else unless you ask me first: a mail library, the Razorpay PHP SDK, a PDF library, a Google OAuth client library, a `.env` loader.

### Folder structure (create in Phase 0 and keep to it)

```
/backend
  /api            one folder per resource (auth, doctors, appointments, ...)
  /core           db connection, router, auth/session, rbac, validation, response helpers
  /services       payments, email, pdf, uploads
  /config         config loader (reads .env)
/database
  /migrations     0001_*.sql, 0002_*.sql ...
  /seeds
/frontend
  /shared         layout, nav, tailwind config, common JS (api client, toasts, modals)
  /patient
  /doctor
  /hospital       (stub until Phase 2)
  /branch         (stub until Phase 2)
  /vendor         (stub until Phase 3)
  /admin          (stub until Phase 4)
/ui-reference     screenshots + Stitch HTML (read-only, see section 3)
/uploads          user-uploaded files (outside web-accessible code paths where possible)
/docs             PRD_v3.docx, PROGRESS.md, DECISIONS.md, API.md
.env.example
```

### Code rules

- Every API response uses one shape: `{ "success": bool, "data": ..., "error": { "code": "...", "message": "..." } }` with correct HTTP status codes.
- Every endpoint checks authentication and the user's role on the server. Never rely on hidden buttons in the UI.
- Validate and sanitise all input server-side. Escape all output. Use `password_hash` / `password_verify`. Protect forms against CSRF. Regenerate the session ID on login.
- File uploads: check type and size, store with random names, never trust the original file name.
- Money is stored as integer paise or `DECIMAL(10,2)`, never floats.
- Booking must be safe against two patients taking the last slot at the same time (use a transaction with row locking).
- Keep `docs/API.md` updated with every endpoint (method, path, role, request, response).
- Name things consistently: `snake_case` for database columns and PHP files' functions, `kebab-case` for frontend file names.

## 2. Roles

PATIENT, DOCTOR (type HOSPITAL or PRIVATE), HOSPITAL_ADMIN, HOSPITAL_FRONTDESK, BRANCH_ADMIN, VENDOR_ADMIN, SUPER_ADMIN. All share one `users` table with a `role` column.

Key rules to remember in every phase:
- Every business account (hospital, doctor, vendor) is verified by a Branch Admin before it can operate. Until approved the user sees only a "Waiting for verification" screen. Rejections carry a reason, and the user may resubmit.
- Hospital doctors are **invited by the Hospital Admin** (single-use token link with expiry). Branch Admin then checks only credentials, not affiliation. Private doctors self-register.
- Fees: the doctor and, for hospital doctors, the Hospital Admin can both edit fees. Always record who changed it last.
- Pay-at-visit payments are marked paid by the doctor (private) or by Hospital Front-Desk (hospital doctors). Hospital doctors can view but not mark.
- Cancellation: patient may cancel up to 24 hours before the appointment. Online payments cancelled in time are refunded in full via Razorpay and arrive within 48 hours. Doctor or hospital may cancel any time (emergency); online payments are then fully refunded and the patient gets an email.
- Patients can browse without logging in; booking requires login and returns them to the booking afterwards.

## 3. UI reference folder

`/ui-reference` holds screenshots and exported Stitch HTML. Rules:

- Use it for look and feel only: colours, fonts, spacing, card and badge styles, layout, copy tone. Match it closely.
- Do **not** paste Stitch HTML in as-is. Rebuild it cleanly with the shared layout and Tailwind setup, wired to real data.
- Map screens like this: patient login/register, patient home, specialty browse, doctor list and comparison, doctor detail and slot picker, payment and confirmation (Phase 1); doctor portal (Phase 1); hospital admin (Phase 2); branch admin (Phase 2); pharmacy catalogue, store locator and vendor portal (Phase 3); super admin (Phase 4).
- **Leave out entirely**: AI symptom-triage chat, ABHA/ABDM/PM-JAY badges and linkage, Jan Aushadhi scheme features, settlement ledger and commission tables, SLA and grievance analytics, language switcher, SOS/ambulance widgets, wellness tips, and any statistic or feature not in the PRD. If a reference screen has a block for one of these, drop the block or leave a clearly static, non-clickable placeholder only if the layout needs it.
- The login and home pages built earlier are plain; restyle them to match the reference in Phase 0.

## 4. Phases

Each step ends with testing. Use browser checks, curl/HTTP calls, and direct SQL checks.

### Phase 0 — Foundation

Goal: a clean skeleton everyone else builds on.

Questions to ask me first: local setup details (PHP version, MySQL credentials, how I run it), SMTP provider for email, whether I already have Razorpay test keys and a Google OAuth client.

Steps:
1. Create the folder structure, `.env.example`, config loader, router, response helpers, DB connection.
2. Write migrations for the **entire** schema in the PRD (users, states, districts, branch_admin_districts, specialties and symptom-to-specialty mapping, hospitals, hospital_staff, doctors, doctor_invites, doctor_documents, doctor_schedules, doctor_fees, appointments, payments, medical_stores, pharmacy_products, pharmacy_orders and items, email_log). Add foreign keys and indexes. Show me the schema summary before moving on.
3. Seed data: Indian states and a useful set of districts, specialties, a symptom list mapped to specialties, one account for every role, a few sample hospitals, doctors, schedules.
4. Auth: email + password register/login/logout, Google OAuth login, sessions, CSRF, role-check middleware, role-based redirect after login.
5. Services: email service (with template files and `email_log`), file upload service, PDF service skeleton.
6. Shared frontend: layout, navbar per role, Tailwind setup matching the UI reference, API client, toast and modal helpers. Restyle the existing login and home pages.
7. Write `docs/API.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md` and a README with exact run instructions.

Definition of Done:
- [ ] Migrations run from an empty database with no errors and can be re-run on a fresh database.
- [ ] Every seeded role can log in and lands on the correct page; wrong role cannot open another role's API.
- [ ] Google login works with my credentials; a new Google user is created correctly.
- [ ] Test email is sent and logged.
- [ ] Pages visually match the reference style.

### Phase 1 — Patient + Doctor

Goal: the complete patient booking journey and the private-doctor workflow, end to end.

Questions to ask me first: anything unclear about slot generation (fixed-length slots vs per-day count only), Razorpay test keys, invoice layout wishes.

Steps:
1. Doctor registration (private type): form with certificate uploads, "Waiting for verification" screen, rejected-with-reason screen and resubmit.
2. Minimal Branch Admin screen: list pending doctors in the admin's districts, view documents, approve or reject with reason. (The full Branch Admin portal comes in Phase 2.) Send approval/rejection emails.
3. Doctor profile: about, qualifications, specialty, photo, certificates.
4. Doctor schedule: working days and time windows, per-day patient capacity, publishing availability days ahead, per-treatment fees with last-edited-by tracking.
5. Patient public side: home, symptom/problem selection mapped to a department, specialty browse, state and district filter, doctor list (hospital and private), comparison view (fee, facilities, next slot, location), doctor detail with slot picker. Full slots shown unavailable.
6. Patient accounts and booking: login gate that returns to the booking, slot booking with transaction-safe capacity check, booking ID.
7. Payments: pay-at-visit path; Razorpay advance payment (order creation, signature verification on the server, webhook handling, failure and retry handling, no double booking on payment failure).
8. Confirmation email, invoice PDF for both payment types, My Appointments page.
9. Cancellation and refund: patient cancel with the 24-hour rule, Razorpay refund, status tracking, emails; doctor cancel of a booking (any time) with full refund and patient email.
10. Doctor appointments dashboard: bookings per day with patient details, payment type and status, mark pay-at-visit as paid (private doctors), daily PDF export, mark completed / no-show.

Definition of Done:
- [ ] A new private doctor registers, is approved, sets schedule and fees, and appears in patient search only after approval.
- [ ] A patient can browse as guest, log in at booking time, and book with pay-at-visit and with Razorpay test payment.
- [ ] Capacity limit works: the last slot cannot be double booked even with two simultaneous attempts; a full day stops accepting bookings.
- [ ] Patient cancel works more than 24 hours ahead and is blocked inside 24 hours; refund is created and shown; emails arrive.
- [ ] Doctor cancel refunds online payments fully.
- [ ] Doctor sees correct patient and payment info; daily PDF downloads and is correct.
- [ ] Invoice PDF is correct for both payment types.
- [ ] All pages match the reference style and work on a phone-sized screen.

### Phase 2 — Hospital Admin + Branch Admin

Goal: hospital onboarding, invited doctors, front desk, and the full Branch Admin portal.

Steps:
1. Hospital registration and application with license documents; Branch Admin verification queue; on approval the applicant becomes Hospital Admin and the hospital is listed.
2. Hospital Admin portal: hospital profile, departments, facilities, bed counts.
3. Doctor invite flow: invite form, single-use expiring token, invite email, accept page (set password or Google), link to hospital, resend and revoke, status tracking through INVITED, ACCOUNT_CREATED, PENDING_VERIFICATION, APPROVED or REJECTED.
4. Branch Admin credential check for invited doctors (affiliation not re-verified).
5. Shared fee editing: Hospital Admin can view and edit affiliated doctors' fees; doctor sees the change; "last updated by" shown to both.
6. Hospital Front-Desk accounts created by Hospital Admin; front-desk screen shows that hospital's appointments and marks pay-at-visit as paid; hospital doctors see payment status read-only.
7. Hospital-initiated cancellation of a booking (emergency) with refund and emails.
8. Full Branch Admin portal: queues for hospitals, doctors and vendors (vendors can be stubbed until Phase 3), district scoping, support escalation list, approval history.

Definition of Done:
- [ ] Complete chain works: hospital applies, is approved, invites a doctor, doctor accepts, Branch Admin verifies, doctor is bookable.
- [ ] Expired, reused and revoked invite links are rejected.
- [ ] Branch Admin sees only their assigned districts.
- [ ] Front-desk can only act on their own hospital's bookings.
- [ ] Fee edits by hospital and doctor are both reflected, with correct last-edited-by.

### Phase 3 — Pharmacy

Steps: vendor registration and Branch Admin verification; store profile with location; inventory and pricing management; patient catalogue with search, categories and filters; prescription upload for prescription-only items; cart; delivery and click-and-collect orders; vendor order queue and status updates; store locator by district; order emails.

Definition of Done:
- [ ] A verified vendor stocks items; a patient orders with and without a prescription requirement; vendor fulfils; stock updates; unverified vendors are invisible to patients.

### Phase 4 — Super Admin

Steps: create Branch Admin accounts and assign districts; platform settings; basic reports (counts of bookings, users, hospitals, doctors, vendors; no financial ledger); user management basics.

Definition of Done:
- [ ] Super Admin creates a Branch Admin who can immediately verify accounts in their districts; reports are correct against the database.

### Phase 5 — Hardening

Steps: full regression of every role's flows, security review (authorisation on every endpoint, uploads, CSRF, injection, session handling), accessibility and mobile pass, performance check on search queries, UI polish against the reference, deployment notes and production `.env` checklist, final docs.

Definition of Done:
- [ ] Written test report covering every flow in the PRD, all passing; no open critical issues.

## 5. At the end of every phase, report in this format

```
PHASE N COMPLETE
Built: ...
Tested: (what, how, result)
Not tested / needs my input: ...
Known issues: ...
Decisions made: (also in DECISIONS.md)
Waiting for: "go ahead" to start Phase N+1
```

## 6. Later (not now)

The Android app (Java) with a real AI/ML symptom-assessment engine is a separate project that starts only after the web platform is finished. Do not build any part of it or any web-based triage now.
