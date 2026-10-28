// Hospital Admin: the hospital's public contact details. The name and district were verified, so they are locked.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { esc, qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { startHospitalPortal, setTopbarHospital, skeleton, pageHeader } from './portal.js';
import { HOSPITAL_DOC_LABELS } from './hospital-form.js';

const { main } = await startHospitalPortal('profile');
main.innerHTML = `${pageHeader('Hospital profile', 'How patients can reach your hospital. The name and district were checked by the Branch Admin, so they cannot be changed here.')}<div id="content" class="space-y-6">${skeleton(2, 'h-44')}</div>`;
const content = qs('#content');

function fmtDate(s) {
  return s ? new Date(s.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function render(h) {
  setTopbarHospital(h.name, `${h.location.district}, ${h.location.state}`);
  const locked = (label, value, icon) => `<div class="rounded-2xl bg-surface-container-low px-4 py-3"><p class="flex items-center gap-1 text-label-md uppercase tracking-wide text-on-surface-variant"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">${icon}</span>${esc(label)}</p><p class="mt-0.5 text-body-lg font-semibold">${esc(value)}</p></div>`;
  content.innerHTML = `
    <section class="card p-5 sm:p-6" aria-label="Verified details">
      <div class="mb-4 flex flex-wrap items-center gap-2"><h2 class="font-display text-headline-sm">Verified details</h2><span class="badge badge-success"><span class="material-symbols-outlined mr-1 text-[14px]" aria-hidden="true">verified</span>Verified${h.verified_at ? ` on ${esc(fmtDate(h.verified_at))}` : ''}</span></div>
      <div class="grid gap-3 sm:grid-cols-2">${locked('Hospital name', h.name, 'lock')}${locked('District', `${h.location.district}, ${h.location.state}`, 'lock')}</div>
      <p class="mt-3 text-body-sm text-on-surface-variant">To change these, ask your Branch Admin.</p>
      ${h.documents.length ? `<h3 class="mb-2 mt-5 font-display text-label-lg">Your documents</h3><ul class="divide-y divide-outline-variant rounded-xl border border-outline-variant">${h.documents.map((d) => `
        <li class="flex items-center justify-between gap-3 px-4 py-3"><span class="min-w-0"><span class="block truncate text-body-md">${esc(d.original_name || 'File')}</span><span class="text-body-sm text-on-surface-variant">${esc(HOSPITAL_DOC_LABELS[d.doc_type] || d.doc_type)}</span></span>
        <a href="/api/hospitals/documents/${d.id}" target="_blank" rel="noopener" class="btn-outline btn-sm">View</a></li>`).join('')}</ul>` : ''}
    </section>

    <form id="profile-form" class="card space-y-5 p-5 sm:p-6" novalidate>
      <h2 class="font-display text-headline-sm">Contact details</h2>
      <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      <div data-field><label for="address" class="field-label">Address</label><textarea id="address" name="address" rows="2" maxlength="500" class="field-input" required>${esc(h.address)}</textarea></div>
      <div class="grid gap-5 sm:grid-cols-2">
        <div data-field><label for="phone" class="field-label">Phone <span class="normal-case text-outline">(optional)</span></label><input id="phone" name="phone" type="tel" maxlength="20" value="${esc(h.phone || '')}" class="field-input" inputmode="tel"></div>
        <div data-field><label for="email" class="field-label">Email <span class="normal-case text-outline">(optional)</span></label><input id="email" name="email" type="email" maxlength="190" value="${esc(h.email || '')}" class="field-input"></div>
      </div>
      <div class="flex justify-end"><button type="submit" id="save" class="btn-primary">Save changes</button></div>
    </form>`;

  const form = qs('#profile-form');
  const alertBox = qs('#form-alert');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    alertBox.hidden = true;
    const f = form.elements;
    const errors = {};
    if (f.address.value.trim().length < 5) errors.address = 'Enter the hospital address.';
    if (f.email.value.trim() && !/^\S+@\S+\.\S+$/.test(f.email.value.trim())) errors.email = 'Enter a valid email address.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    await withBusy(qs('#save'), async () => {
      try {
        const body = { address: f.address.value.trim() };
        if (f.phone.value.trim()) body.phone = f.phone.value.trim();
        if (f.email.value.trim()) body.email = f.email.value.trim();
        const r = await api.put('/api/hospitals/me', body);
        toast.success('Profile saved.');
        render(r.hospital);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        const shown = err.status === 422 ? showFieldErrors(form, err.details) : false;
        if (!shown) { alertBox.textContent = err.message; alertBox.hidden = false; }
      }
    });
  });
}

try {
  render((await api.get('/api/hospitals/me')).hospital);
} catch (e) {
  content.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load the profile. Please refresh.')}</p>`;
}
