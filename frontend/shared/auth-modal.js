// Log in / Sign up as a modal with a Patient | Doctor | Staff picker.
//   openAuthModal({ mode: 'login' | 'register', group: 'PATIENT' | 'DOCTOR' | 'STAFF', returnTo, error, onClose })
// Elements with data-auth="login|register" (and optional data-group) open it: see bindAuthTriggers().
import { api, ApiError, setCurrentUser, safeReturnPath } from './api-client.js';
import { esc, qs, qsa, showFieldErrors, clearFieldErrors, withBusy } from './dom.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';

export const HOME_URL = '/frontend/patient/index.html';
const GROUPS = {
  PATIENT: { label: 'Patient', icon: 'person' },
  DOCTOR: { label: 'Doctor', icon: 'stethoscope' },
  STAFF: { label: 'Staff', icon: 'badge' },
};
const LOGIN_SUBTITLE = {
  PATIENT: 'Log in to book appointments and manage your visits.',
  DOCTOR: 'Log in to manage your schedule, fees and appointments.',
  STAFF: 'For hospital, branch, pharmacy and platform administrators.',
};
const REGISTER_SUBTITLE = {
  PATIENT: 'Book appointments, pay securely and keep every visit in one place.',
  DOCTOR: 'Reach patients in your district. A Branch Admin verifies your credentials before you go live.',
};
const GOOGLE_ERRORS = {
  google_not_configured: 'Google sign-in is not set up yet. Please log in with your email and password.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_state_mismatch: 'The Google sign-in session expired. Please try again.',
  google_failed: 'Google sign-in failed. Please try again or use your email and password.',
  google_wrong_role: 'This Google account is registered under a different role. Pick the right tab above and try again.',
};
const GOOGLE_SVG = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';

// Pages each role may be sent back to after login (so a doctor never lands on a patient page).
const PORTAL_PREFIX = {
  DOCTOR: '/frontend/doctor/',
  HOSPITAL_ADMIN: '/frontend/hospital/',
  HOSPITAL_FRONTDESK: '/frontend/hospital/',
  BRANCH_ADMIN: '/frontend/branch/',
  VENDOR_ADMIN: '/frontend/vendor/',
  SUPER_ADMIN: '/frontend/admin/',
};

function destinationFor(user, returnTo) {
  const path = safeReturnPath(returnTo);
  if (!path) return user.home;
  const isAuthPage = /\/frontend\/shared\/(login|register)\.html/.test(path) || path === '/frontend/doctor/register.html';
  if (isAuthPage) return user.home;
  if (user.role === 'PATIENT') {
    const otherPortal = Object.values(PORTAL_PREFIX).some((p) => path.startsWith(p));
    return otherPortal ? user.home : path;
  }
  return path.startsWith(PORTAL_PREFIX[user.role] || '\0') ? path : user.home;
}

let active = null; // only one auth modal at a time

export function openAuthModal(options = {}) {
  if (active) active.close();

  const state = {
    mode: options.mode === 'register' ? 'register' : 'login',
    group: GROUPS[options.group] ? options.group : 'PATIENT',
    returnTo: safeReturnPath(options.returnTo),
    email: '',
    alert: null,
  };
  if (options.error) state.alert = alertFromCode(options.error, state.group);

  const modal = openModal({
    title: '',
    html: '',
    size: 'max-w-md',
    onClose: () => { active = null; if (options.onClose) options.onClose(); },
  });
  active = modal;
  const body = modal.body;
  const dialog = body.parentElement;

  function alertFromCode(code, group) {
    if (code === 'google_no_account') {
      return { text: `No ${GROUPS[group].label.toLowerCase()} account exists for this Google email.`, register: group !== 'STAFF' };
    }
    return { text: GOOGLE_ERRORS[code] || 'Something went wrong. Please try again.' };
  }

  function tabsHtml(groups) {
    return `<div class="seg-tabs ${groups.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}" role="tablist" aria-label="Account type">
      ${groups.map((g) => `<button type="button" role="tab" data-group="${g}" aria-selected="${g === state.group}" class="seg-tab">
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">${GROUPS[g].icon}</span>${esc(GROUPS[g].label)}</button>`).join('')}
    </div>`;
  }

  function googleHref() {
    const q = new URLSearchParams({ role_group: state.group });
    if (state.returnTo) q.set('return_to', state.returnTo);
    return `/api/auth/google?${q}`;
  }

  function passwordField(autocomplete, placeholder, label) {
    return `<div data-field>
      <label for="password" class="field-label">${label}</label>
      <div class="relative">
        <input id="password" name="password" type="password" autocomplete="${autocomplete}" required class="field-input pr-12" placeholder="${esc(placeholder)}">
        <button type="button" data-toggle-pw class="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-on-surface-variant hover:text-on-surface" aria-label="Show password" aria-pressed="false">
          <span class="material-symbols-outlined text-[20px]">visibility</span>
        </button>
      </div>
    </div>`;
  }

  const divider = '<div class="my-5 flex items-center gap-4 text-label-md uppercase tracking-widest text-outline"><span class="h-px flex-1 bg-outline-variant"></span>Or continue with<span class="h-px flex-1 bg-outline-variant"></span></div>';
  const googleBtn = () => `<a href="${esc(googleHref())}" class="btn-outline w-full py-3.5">${GOOGLE_SVG}Continue with Google</a>`;

  function loginHtml() {
    return `
      <p class="mb-4 text-body-md text-on-surface-variant">${esc(LOGIN_SUBTITLE[state.group])}</p>
      ${tabsHtml(['PATIENT', 'DOCTOR', 'STAFF'])}
      <div id="auth-alert" role="alert" hidden></div>
      <form id="auth-form" class="mt-5 space-y-4" novalidate>
        <div data-field>
          <label for="email" class="field-label">Email address</label>
          <input id="email" name="email" type="email" autocomplete="email" required class="field-input" placeholder="you@example.com" value="${esc(state.email)}">
        </div>
        ${passwordField('current-password', 'Your password', 'Password')}
        <button type="submit" id="auth-submit" class="btn-accent w-full py-3.5 text-base">Log in as ${esc(GROUPS[state.group].label)} <span class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span></button>
      </form>
      ${divider}${googleBtn()}
      <p class="mt-6 text-center text-body-md text-on-surface-variant">${state.group === 'STAFF'
        ? 'Staff accounts are created by the platform, so there is no sign-up here.'
        : `New ${state.group === 'DOCTOR' ? 'doctor' : 'here'}? <button type="button" data-switch="register" class="font-display font-semibold text-secondary hover:underline">Register now</button>`}</p>`;
  }

  function registerHtml() {
    const doctor = state.group === 'DOCTOR';
    return `
      <p class="mb-4 text-body-md text-on-surface-variant">${esc(REGISTER_SUBTITLE[state.group])}</p>
      ${tabsHtml(['PATIENT', 'DOCTOR'])}
      <div id="auth-alert" role="alert" hidden></div>
      <form id="auth-form" class="mt-5 space-y-4" novalidate>
        <div data-field>
          <label for="name" class="field-label">Full name</label>
          <input id="name" name="name" type="text" autocomplete="name" required maxlength="150" class="field-input" placeholder="${doctor ? 'Dr. First Last' : 'Your full name'}">
        </div>
        <div class="grid gap-4 ${doctor ? 'sm:grid-cols-2' : ''}">
          <div data-field>
            <label for="email" class="field-label">Email address</label>
            <input id="email" name="email" type="email" autocomplete="email" required class="field-input" placeholder="you@example.com" value="${esc(state.email)}">
          </div>
          <div data-field>
            <label for="phone" class="field-label">Mobile number <span class="normal-case text-outline">(optional)</span></label>
            <input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" class="field-input" placeholder="98765 43210">
          </div>
        </div>
        ${passwordField('new-password', 'At least 8 characters, with a letter and a number', 'Create password')}
        ${doctor ? '<h3 class="pt-2 font-display text-headline-sm">Your practice</h3><div id="profile-fields" class="space-y-5"></div>' : ''}
        <button type="submit" id="auth-submit" class="btn-accent w-full py-3.5 text-base">${doctor ? 'Submit for verification' : 'Create account'} <span class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span></button>
      </form>
      ${doctor ? '' : divider + googleBtn()}
      <p class="mt-6 text-center text-body-md text-on-surface-variant">Already have an account? <button type="button" data-switch="login" class="font-display font-semibold text-primary hover:underline">Log in</button></p>
      ${doctor ? '<p class="mt-2 text-center text-body-sm text-outline">Hospital-employed doctors are invited by their hospital and do not register here.</p>' : ''}`;
  }

  function showAlert({ text, register = false, switchTo = null }) {
    const box = qs('#auth-alert', body);
    if (!box) return;
    const actions = [];
    if (register) actions.push('<button type="button" data-switch="register" class="btn-primary btn-sm">Register now</button>');
    if (switchTo) actions.push(`<button type="button" data-group-switch="${switchTo}" class="btn-primary btn-sm">Go to ${esc(GROUPS[switchTo].label)} login</button>`);
    box.className = 'mt-4 flex items-start gap-2 rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container';
    box.innerHTML = `<span class="material-symbols-outlined mt-0.5 text-[20px]" aria-hidden="true">error</span>
      <div><p>${esc(text)}</p>${actions.length ? `<div class="mt-3 flex flex-wrap gap-2">${actions.join('')}</div>` : ''}</div>`;
    box.hidden = false;
  }

  function hideAlert() {
    const box = qs('#auth-alert', body);
    if (box) box.hidden = true;
  }

  async function render() {
    const doctorRegister = state.mode === 'register' && state.group === 'DOCTOR';
    dialog.classList.toggle('max-w-md', !doctorRegister);
    dialog.classList.toggle('max-w-2xl', doctorRegister);
    qs('#modal-title', dialog).textContent =
      state.mode === 'login' ? 'Welcome back' : (doctorRegister ? 'Register your practice' : 'Create your account');
    body.innerHTML = state.mode === 'login' ? loginHtml() : registerHtml();
    if (state.alert) { showAlert(state.alert); state.alert = null; }

    let doctorForm = null;
    if (doctorRegister) {
      doctorForm = await import('/frontend/doctor/doctor-form.js');
      const form = qs('#auth-form', body);
      qs('#profile-fields', body).innerHTML = doctorForm.profileFieldsHtml();
      try { await doctorForm.initProfileFields(form); } catch { showAlert({ text: 'Could not load the form options. Please close this window and try again.' }); }
    }
    bind(doctorForm);
    const first = qs('#auth-form input', body);
    if (first && !first.value) first.focus();
  }

  function rememberEmail() {
    const e = qs('#email', body);
    if (e && e.value.trim()) state.email = e.value.trim();
  }

  function bind(doctorForm) {
    const form = qs('#auth-form', body);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      hideAlert();
      if (state.mode === 'login') submitLogin(form);
      else submitRegister(form, doctorForm);
    });
  }

  async function finish(data) {
    setCurrentUser(data.user, data.csrf_token);
    toast.success(state.mode === 'login' ? 'Logged in.' : 'Account created.');
    location.href = destinationFor(data.user, state.returnTo);
  }

  async function submitLogin(form) {
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const errors = {};
    if (!email) errors.email = 'Enter your email address.';
    if (!password) errors.password = 'Enter your password.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }

    await withBusy(qs('#auth-submit', body), async () => {
      try {
        await finish(await api.post('/api/auth/login', { email, password, role_group: state.group }));
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.status === 422 && showFieldErrors(form, err.details)) return;
        if (err.code === 'ACCOUNT_NOT_FOUND') {
          state.email = email;
          showAlert({ text: err.message, register: state.group !== 'STAFF' });
        } else if (err.code === 'WRONG_ROLE_TAB') {
          const m = /registered as a (\w+) account/.exec(err.message);
          const target = m && Object.keys(GROUPS).find((g) => GROUPS[g].label === m[1]);
          showAlert({ text: err.message, switchTo: target && target !== state.group ? target : null });
        } else {
          showAlert({ text: err.message });
        }
      }
    });
  }

  async function submitRegister(form, doctorForm) {
    const f = form.elements;
    const errors = doctorForm ? doctorForm.validateDoctorProfile(form) : {};
    if (f.name.value.trim().length < 2) errors.name = 'Enter your full name.';
    if (!f.email.value.trim()) errors.email = 'Enter your email address.';
    const pw = f.password.value;
    if (pw.length < 8) errors.password = 'Password must be at least 8 characters.';
    else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errors.password = 'Password needs at least one letter and one number.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }

    await withBusy(qs('#auth-submit', body), async () => {
      try {
        let data;
        if (doctorForm) {
          data = await api.upload('/api/doctors/register', doctorForm.buildDoctorFormData(form));
        } else {
          const payload = { name: f.name.value.trim(), email: f.email.value.trim(), password: pw };
          if (f.phone.value.trim()) payload.phone = f.phone.value.trim();
          data = await api.post('/api/auth/register', payload);
        }
        await finish(data);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.status === 422) {
          const shown = showFieldErrors(form, err.details);
          if (err.details && err.details.documents) { showAlert({ text: err.details.documents }); return; }
          if (shown) return;
        }
        if (err.code === 'EMAIL_TAKEN') {
          showFieldErrors(form, { email: err.message });
          showAlert({ text: err.message, switchTo: null });
          state.email = f.email.value.trim();
        } else {
          showAlert({ text: err.message });
        }
      }
    });
  }

  // One delegated click handler: also covers buttons that are added later (inside alerts).
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-group], [data-switch], [data-group-switch], [data-toggle-pw]');
    if (!t || !body.contains(t)) return;

    if (t.hasAttribute('data-toggle-pw')) {
      const input = qs('#password', body);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.setAttribute('aria-pressed', String(show));
      t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      t.firstElementChild.textContent = show ? 'visibility_off' : 'visibility';
      return;
    }
    if (t.dataset.group) {
      if (t.dataset.group === state.group) return;
      state.group = t.dataset.group;
    } else if (t.dataset.groupSwitch) {
      state.group = t.dataset.groupSwitch;
    } else if (t.dataset.switch) {
      state.mode = t.dataset.switch;
    }
    rememberEmail();
    render();
  });

  render();
  return modal;
}

/** Make every [data-auth] element (and the navbar buttons) open the modal instead of navigating. */
export function bindAuthTriggers(root = document) {
  qsa('[data-auth]', root).forEach((el) => {
    if (el.dataset.authBound) return;
    el.dataset.authBound = '1';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal({
        mode: el.dataset.auth,
        group: el.dataset.group || 'PATIENT',
        returnTo: location.pathname + location.search,
      });
    });
  });
}
