# Hospital & Doctor Booking Platform

Plain PHP + MySQL REST API, with an HTML / Tailwind CSS / vanilla JavaScript frontend. Built phase by phase; see `docs/PROGRESS.md` for where we are and `docs/DECISIONS.md` for every decision.

## What you need
- Windows with **XAMPP** (MySQL/MariaDB running; this project expects it on port **3307**)
- **PHP 8.2+** on the PATH (XAMPP's `C:\xampp\php`), with the extensions `pdo_mysql`, `mbstring`, `curl`, `openssl`, `fileinfo`, `zip`, `gd` enabled
- **Composer** and **Node.js 18+** (Node is only used to build the CSS)

## First-time setup
Run these in a terminal inside the project folder.

```powershell
# 1. PHP packages and CSS tooling
composer install
npm install

# 2. Settings
copy .env.example .env          # then open .env and check the DB_* lines (see "Settings" below)

# 3. Database: create it once, then build tables and sample data
& "C:\xampp\mysql\bin\mysql.exe" -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE IF NOT EXISTS hospital_booking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
php database/migrate.php --seed

# 4. Build the CSS
npm run build:css
```

## Run it
1. Start **MySQL** in the XAMPP Control Panel (Apache is not needed).
2. Double-click `start.bat` (or run `php -S localhost:8100 router.php`).
3. Open **http://localhost:8100/**

Useful links:
| URL | What |
|---|---|
| http://localhost:8100/ | Patient home |
| http://localhost:8100/frontend/shared/login.html | Log in |
| http://localhost:8100/frontend/shared/register.html | Create a patient account |
| http://localhost:8100/api/health | API + database health check |

> Port 8100 is used on purpose: another PHP server on this machine already owns `127.0.0.1:8000`.

## Seeded logins
Every seeded account uses the password **`Password@123`**.

| Role | Email | Lands on |
|---|---|---|
| Patient | `patient@hospital.test` | patient home |
| Doctor (private, approved) | `doctor@hospital.test` | doctor dashboard |
| Hospital Admin | `hospitaladmin@hospital.test` | hospital dashboard |
| Hospital Front-Desk | `frontdesk@hospital.test` | front desk |
| Branch Admin | `branchadmin@hospital.test` | verification queue |
| Vendor Admin | `vendor@hospital.test` | pharmacy dashboard |
| Super Admin | `superadmin@hospital.test` | admin dashboard |

Other seeded accounts: `patient2@`, `hospitaladmin2@` (Lifeline Medical Centre), doctors `anil.sen@`, `meera.das@`, `rahul.ghosh@` (hospital doctors), `imran.khan@`, `pooja.mehta@` (private), and two pending doctors `pending.doctor@` (Kolkata) and `pending.darjeeling@` (outside the branch admin's districts), all `@hospital.test`.

## Database commands
```powershell
php database/migrate.php            # apply new migrations
php database/migrate.php --status   # show applied / pending
php database/migrate.php --seed     # also run seed files (skips sample data if already present)
php database/migrate.php --fresh --seed   # DROP every table in the configured DB and rebuild (APP_ENV=local only)
```

## Settings (`.env`)
`.env` is never committed. `.env.example` lists every key. Blank values simply disable that feature until filled in.

| Keys | Needed for | How to get them |
|---|---|---|
| `DB_*` | everything | XAMPP: host `127.0.0.1`, port `3307`, user `root`, empty password |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login | See below |
| `SMTP_*`, `MAIL_FROM_*` | emails | See below |
| `RAZORPAY_*` | online payments (Phase 1) | Razorpay dashboard in **test mode**: Settings > API Keys |
| `REQUIRE_VERIFICATION_DOCUMENTS` | testing switch | `false` while developing; list in `docs/RELAXED_FOR_TESTING.md` |

**Google login** (console.cloud.google.com): create a project > APIs & Services > OAuth consent screen (External, add your Gmail as a test user) > Credentials > Create credentials > OAuth client ID > *Web application*. Under **Authorized redirect URIs** add exactly `http://localhost:8100/api/auth/google-callback`. Copy the Client ID and secret into `.env`.

**Email**: any SMTP provider works. Examples: Mailtrap (free sandbox inbox, best for testing) gives host/port/username/password; Gmail needs `smtp.gmail.com`, port `587`, `tls`, your address, and a 16-character **App Password** (Google Account > Security > 2-Step Verification > App passwords). Set `MAIL_FROM_ADDRESS` to your sending address. Then log in as the Super Admin and call `POST /api/system/test-email` (see `docs/API.md`). With no SMTP set, emails are logged as FAILED and a copy is saved in `storage/logs/outbox/` so you can still see them.

## Project layout
```
backend/        PHP API: api/<resource>/routes.php, core/ (router, db, auth, rbac, validation), services/ (email, uploads, pdf, google), config/
database/       migrations/ (numbered .sql), seeds/ (.php), migrate.php
frontend/       shared/ (layout, api client, toast, modal, login, register, Tailwind), patient/, doctor/, hospital/, branch/, vendor/, admin/
storage/        mail-templates/, logs/
uploads/        uploaded files (never served directly)
docs/           PRD, PROGRESS.md, DECISIONS.md, API.md, RELAXED_FOR_TESTING.md
ui-reference/   design screenshots (look-and-feel only)
router.php      dev-server entry point
start.bat       one-click dev server
```

## Changing the design
Styles are Tailwind. After editing any HTML/JS class names or `frontend/shared/tailwind-input.css` / `tailwind.config.js`, rebuild with `npm run build:css` (or leave `npm run watch:css` running).

## Troubleshooting
- **Page shows "Not found" / wrong site**: make sure you opened port **8100**, not 8000.
- **`could not find driver`**: enable `extension=pdo_mysql` in `C:\xampp\php\php.ini`.
- **`Cannot reach the server` in the browser**: `start.bat` is not running.
- **Database connection errors**: MySQL is not started in XAMPP, or the port in `.env` is not `3307`.
- **Composer says the zip extension is missing**: enable `extension=zip` in `php.ini`.
- **Logs**: `storage/logs/php-error.log`.
