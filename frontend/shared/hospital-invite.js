// The page behind the emailed hospital invitation link: a hospital admin fills in the details and sets a password.
import { api, ApiError, setCurrentUser, logout } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { openAuthModal } from '/frontend/shared/auth-modal.js';
import { esc, qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { hospitalFieldsHtml, initHospitalFields, buildHospitalFormData, validateHospitalFields } from '/frontend/hospital/hospital-form.js';

const user = await initPage({ navSearch: false });
const main = qs('#app-main');
const token = new URLSearchParams(location.search).get('token') || '';

function message({ icon, tone, title, text, action = '' }) {
  main.innerHTML = `
    <section class="card p-6 text-center sm:p-10">
      <span class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${tone}"><span class="material-symbols-outlined text-3xl" aria-hidden="true">${icon}</span></span>
      <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">${esc(title)}</h1>
      <p class="mx-auto mt-3 max-w-md text-body-lg text-on-surface-variant">${esc(text)}</p>
      ${action}
    </section>`;
}

const PROBLEMS = {
  INVITE_NOT_FOUND: { icon: 'link_off', tone: 'bg-error-container text-error', title: 'This link is not valid', text: 'Please open the link exactly as it is in your email. If it still does not work, ask the Branch Admin to send a new invitation.' },
  INVITE_EXPIRED: { icon: 'schedule', tone: 'bg-secondary-fixed text-secondary', title: 'This invitation has expired', text: 'Invitation links work for 7 days. Ask the Branch Admin who invited you to send a new one.' },
  INVITE_REVOKED: { icon: 'block', tone: 'bg-error-container text-error', title: 'This invitation was withdrawn', text: 'The Branch Admin cancelled this invitation. Please contact them if you think this is a mistake.' },
  INVITE_USED: { icon: 'task_alt', tone: 'bg-primary-fixed text-primary', title: 'This invitation has already been used', text: 'If it was you, log in from the Staff tab to see your application.',
    action: '<button type="button" id="login-staff" class="btn-primary mt-6">Log in as staff</button>' },
};

if (user) {
  message({
    icon: 'person', tone: 'bg-secondary-fixed text-secondary', title: `You are signed in as ${user.name}`,
    text: 'To set up a hospital with this invitation, log out first, then open the link again.',
    action: '<button type="button" id="logout-btn" class="btn-primary mt-6">Log out and continue</button>',
  });
  qs('#logout-btn').addEventListener('click', async () => { await logout(); location.reload(); });
} else {
  let invite = null;
  try {
    ({ invite } = await api.get(`/api/hospital-invites/${encodeURIComponent(token)}`));
  } catch (e) {
    const p = (e instanceof ApiError && PROBLEMS[e.code]) || PROBLEMS.INVITE_NOT_FOUND;
    message(p);
    const btn = qs('#login-staff');
    if (btn) btn.addEventListener('click', () => openAuthModal({ mode: 'login', group: 'STAFF' }));
  }
  if (invite) renderForm(invite);
}

function renderForm(invite) {
  document.title = `Set up ${invite.hospital_name} - Liberty Health Care`;
  main.innerHTML = `
    <section class="card p-6 sm:p-8">
      <p class="mb-2"><span class="badge badge-info">Hospital invitation</span></p>
      <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">Set up ${esc(invite.hospital_name)}</h1>
      <p class="mt-2 text-body-md text-on-surface-variant">Invitation from ${esc(invite.invited_by)} for ${esc(invite.district)}, ${esc(invite.state)}. Fill in the details below. After you submit, the Branch Admin checks them, and your hospital is listed once approved.</p>

      <form id="invite-form" class="mt-6 space-y-5" novalidate>
        <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
        <h2 class="font-display text-headline-sm">Hospital details</h2>
        ${hospitalFieldsHtml()}
        <p class="rounded-xl bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant"><span class="material-symbols-outlined mr-1 align-middle text-[18px]" aria-hidden="true">location_on</span>District: <strong>${esc(invite.district)}, ${esc(invite.state)}</strong> (set by the Branch Admin)</p>

        <h2 class="pt-2 font-display text-headline-sm">Your account</h2>
        <div class="grid gap-5 sm:grid-cols-2">
          <div data-field>
            <label for="admin_name" class="field-label">Your name</label>
            <input id="admin_name" name="admin_name" type="text" maxlength="150" class="field-input" autocomplete="name" required>
          </div>
          <div data-field>
            <label for="admin_phone" class="field-label">Your phone <span class="normal-case text-outline">(optional)</span></label>
            <input id="admin_phone" name="admin_phone" type="tel" maxlength="20" class="field-input" inputmode="tel" autocomplete="tel">
          </div>
        </div>
        <div data-field>
          <label for="admin_email" class="field-label">Your email (you will log in with this)</label>
          <input id="admin_email" type="email" class="field-input" value="${esc(invite.email)}" disabled>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <div data-field>
            <label for="password" class="field-label">Password</label>
            <input id="password" name="password" type="password" class="field-input" autocomplete="new-password" required>
          </div>
          <div data-field>
            <label for="password2" class="field-label">Confirm password</label>
            <input id="password2" name="password2" type="password" class="field-input" autocomplete="new-password" required>
          </div>
        </div>
        <p class="-mt-2 text-body-sm text-on-surface-variant">8 to 72 characters, with at least one letter and one number.</p>
        <button type="submit" id="submit" class="btn-accent w-full py-3.5 text-base">Submit for verification</button>
      </form>
    </section>`;

  const form = qs('#invite-form');
  const alertBox = qs('#form-alert');
  initHospitalFields(form, { hospital_name: invite.hospital_name, phone: invite.phone || '' });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    alertBox.hidden = true;
    const f = form.elements;
    const errors = validateHospitalFields(form);
    if (f.admin_name.value.trim().length < 2) errors.admin_name = 'Enter your name.';
    if (f.password.value.length < 8) errors.password = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(f.password.value) || !/\d/.test(f.password.value)) errors.password = 'Include at least one letter and one number.';
    if (f.password2.value !== f.password.value) errors.password2 = 'The passwords do not match.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }

    await withBusy(qs('#submit'), async () => {
      try {
        const fd = buildHospitalFormData(form);
        fd.delete('password2');
        const data = await api.upload(`/api/hospital-invites/${encodeURIComponent(token)}/accept`, fd);
        setCurrentUser(data.user);
        location.href = '/frontend/hospital/dashboard.html';
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (PROBLEMS[err.code]) { message(PROBLEMS[err.code]); return; }
        const shown = err.status === 422 ? showFieldErrors(form, err.details) : false;
        if (err.details && err.details.documents) { alertBox.textContent = err.details.documents; alertBox.hidden = false; }
        else if (!shown) { alertBox.textContent = err.message; alertBox.hidden = false; }
      }
    });
  });
}
