# Progress

Current phase: **Phase 2 — Hospital Admin + Branch Admin** (started 2026-10-24 on the owner's "go ahead"; step 1 done). Phase 1 is complete except the Razorpay parts, which stay on hold until the very end.
Phase 0 — Foundation: **complete** (all steps and all 5 Definition-of-Done items done; see below).

**Razorpay is ON HOLD (owner instruction, 2026-10-10):** the test keys in `.env` are rejected by Razorpay (401). All Razorpay parts of Phase 1 (step 7 online payment, and the refund half of step 9) are done LAST, after everything else, once working keys are supplied. Until then the pay-at-visit path is the only live payment option.

## Phase 1 steps (Razorpay parts are done LAST, see note above)
- [x] 1. Doctor registration (private): form with certificate uploads, "Waiting for verification" screen, rejected-with-reason screen and resubmit — 35 API checks + 18 real-browser checks pass
- [x] 2. Minimal Branch Admin screen: pending doctors in the admin's districts, view documents, approve / reject with reason, emails — 29 API checks + 22 real-browser checks pass (the 2 email checks that failed were Mailtrap's free-plan rate limit; see DECISIONS)
- [x] 3. Doctor profile: about, qualifications, specialty, photo, certificates — 48 API checks + 35 real-browser checks pass
- [x] 4. Doctor schedule (both booking modes: per-day count and fixed-length slots), publish days ahead, per-treatment fees with last-edited-by — 98 API checks + 53 real-browser checks pass
- [x] 5. Patient public side: home, symptom/problem selection, specialty browse, state/district filter, doctor list, comparison, doctor detail with slot picker — 111 API checks + 76 real-browser checks pass (the "Continue to booking" button is a placeholder until step 6)
- [x] 6. Patient accounts and booking: login gate that returns to the booking, transaction-safe booking, booking ID — 75 API checks, 19 parallel-process concurrency checks, 39 real-browser checks pass
- [ ] 7. Payments: pay-at-visit FIRST; Razorpay advance payment LAST (on hold)
- [x] 8. Confirmation email (invoice attached), invoice PDF for both payment types, My Appointments — 77 API checks + 31 real-browser checks pass
- [~] 9. Cancellation and refund: patient 24-hour rule, doctor cancel any time — **done and tested** (70 API checks, 9 parallel-process race checks, 30 real-browser checks). **Still open, on hold with Razorpay:** the actual Razorpay refund call (paid online bookings are already moved to `REFUND_PENDING`). The doctor's cancel *screen* comes with the dashboard in step 10 (the API is done).
- [x] 10. Doctor appointments dashboard: bookings per day, mark pay-at-visit paid (private doctors), daily PDF, completed / no-show / reopen, cancel with reason — 35 API checks + 19 real-browser checks (desktop and 390px phone) pass; PDF viewed

## Phase 0 steps
- [x] 1. Folder structure, `.env.example`, config loader, router, response helpers, DB connection
- [x] 2. Migrations for the entire PRD schema (8 files) + migration runner (schema reviewed by owner)
- [x] 3. Seed data (`php database/migrate.php --fresh --seed`; all seeded accounts use password `Password@123`)
- [x] 4. Auth (email/password, Google OAuth, sessions, CSRF, RBAC, role redirect) — Google code written; real Google login untested until credentials are in `.env`
- [x] 5. Services (email + email_log, uploads, PDF skeleton) — "SENT" path proven against a local fake SMTP server; real SMTP untested until credentials are in `.env`
- [x] 6. Shared frontend (Tailwind build, layout, per-role navbar, API client, toast, modal; login, register and patient home restyled from the UI reference; portal stub page for each role)
- [x] 7. Docs (`docs/API.md`, `docs/DECISIONS.md`, `README.md`, `start.bat`)

## Definition of Done (Phase 0)
- [x] Migrations run from an empty database with no errors and can be re-run on a fresh database (`--fresh --seed` repeated several times; second run applies nothing)
- [x] Every seeded role can log in and lands on the correct page; wrong role cannot open another role's API (91 API checks + 46 real-browser checks pass)
- [x] Google login works with owner's credentials; a new Google user is created correctly — owner logged in with Google on 2026-10-10; `users` row id 21 created as PATIENT with `auth_provider=GOOGLE` and a `google_id`
- [x] Test email is sent and logged — sent through Mailtrap sandbox SMTP, `email_log` row status SENT (2026-10-10); owner to confirm it shows in the Mailtrap inbox
- [x] Pages visually match the reference style — owner to review in the browser

## Test summary
| Suite | Result |
|---|---|
| Auth + RBAC over HTTP (7 roles, CSRF, register, validation, Google start/callback) | 91 / 91 |
| Services over HTTP (email FAILED + SENT paths, PDF, uploads incl. malicious files, path traversal) | 27 / 27 |
| Real headless Edge UI (login each role, redirect, role guard, logout, return_to, register, home data, no JS errors) | 46 / 46 |
| Screens checked by eye at desktop (1280px) and phone (500px) width | login, register, home, doctor portal |

Test scripts live outside the project (session scratchpad); they are not part of the repo.

## Credentials status (in `.env`, which is never committed)
- Google OAuth client ID / secret: set, accepted by Google. Redirect URI registered must be `http://localhost:8100/api/auth/google-callback`.
- SMTP (Mailtrap sandbox, port 2525, STARTTLS): set, working.
- Razorpay test keys: set, but **Razorpay answered `401 Authentication failed`** on 2026-10-10. The Key ID or Key Secret was probably copied wrongly (or regenerated). Needs re-copy before Phase 1 payments.
- `RAZORPAY_WEBHOOK_SECRET`: still blank (needed in Phase 1 step 7).
- The secrets were pasted into the chat; regenerate all of them before going live.

## Testing relaxations in force
See `docs/RELAXED_FOR_TESTING.md` (verification documents are not required while developing).

## Phase 2 steps (hospitals join by invitation from a Branch Admin; see DECISIONS 2026-10-24)
- [x] 1. Hospital invite + application + Branch Admin queue: Branch Admin "Add hospital" (name, email, own district) -> emailed single-use 7-day link (resend / revoke) -> hospital admin fills details, documents and password -> "Waiting for verification" -> Branch Admin approves or rejects with a reason (rejected: resubmit). 59 API checks (incl. two people opening one link at once) + 42 real-browser checks pass.
- [x] 2. Hospital Admin portal in the reference style (light sidebar: Dashboard Overview, Departments, Bed Count, Facilities & Amenities, Hospital Profile; Doctors / OPD Fees / Front Desk shown as "Soon"): 42 API checks (incl. isolation between hospitals) + 30 real-browser checks (desktop and 390px phone, drawer menu, no JS errors) pass
- [ ] 3. Doctor invite flow (single-use expiring token, resend / revoke, status tracking)
- [ ] 4. Branch Admin credential check for invited doctors
- [ ] 5. Shared fee editing (Hospital Admin + doctor, "last updated by")
- [ ] 6. Hospital Front-Desk accounts and screen (mark pay-at-visit paid)
- [ ] 7. Hospital-initiated cancellation (emergency) with refund and emails
- [ ] 8. Full Branch Admin portal: queues, district scoping, support requests, approval history
