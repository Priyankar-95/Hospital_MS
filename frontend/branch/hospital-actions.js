// Branch Admin: the hospital review window, and the invitation cards and "Invite a hospital" form.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { esc, qs, qsa, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { openModal, confirmDialog } from '/frontend/shared/modal.js';
import { fmtDate, emptyBox } from './portal.js';

export const DOC_LABELS = { LICENSE: 'Hospital license', REGISTRATION: 'Registration certificate', CERTIFICATE: 'Certificate', OTHER: 'Other' };
export const STATUS_BADGE = { PENDING: 'badge-warning', APPROVED: 'badge-success', REJECTED: 'badge-danger', INVITED: 'badge-info', EXPIRED: 'badge-warning', REVOKED: 'badge-danger' };
export const STATUS_TEXT = { INVITED: 'Invited', EXPIRED: 'Expired', REVOKED: 'Withdrawn', PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };

/** Open the review window for a hospital application. `focusReject` puts the cursor in the reason box ("Request changes"). */
export async function openHospitalReview(id, reload, { focusReject = false } = {}) {
  let h;
  try {
    ({ hospital: h } = await api.get(`/api/branch/hospitals/${id}`));
  } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not open this application.'); return; }

  const row = (k, v) => `<div><dt class="text-label-md uppercase tracking-wide text-on-surface-variant">${esc(k)}</dt><dd class="mt-0.5 text-body-md">${esc(v || '-')}</dd></div>`;
  const docs = h.documents.length
    ? `<ul class="divide-y divide-outline-variant rounded-xl border border-outline-variant">${h.documents.map((d) => `
        <li class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="min-w-0"><span class="block truncate text-body-md">${esc(d.original_name || 'File')}</span><span class="text-body-sm text-on-surface-variant">${esc(DOC_LABELS[d.doc_type] || d.doc_type)}</span></span>
          <a href="/api/hospitals/documents/${d.id}" target="_blank" rel="noopener" class="btn-outline btn-sm">Open</a>
        </li>`).join('')}</ul>`
    : '<p class="rounded-xl bg-secondary-fixed/50 px-4 py-3 text-body-md text-on-secondary-container">No documents were uploaded with this application.</p>';
  const pending = h.verification_status === 'PENDING';

  openModal({
    title: h.name,
    size: 'max-w-xl',
    html: `
      <dl class="grid gap-4 sm:grid-cols-2">
        ${row('District', `${h.district}, ${h.state}`)}${row('Hospital phone', h.phone)}
        <div class="sm:col-span-2">${row('Address', h.address)}</div>
        ${row('Admin', h.admin.name)}${row('Admin phone', h.admin.phone)}
        <div class="sm:col-span-2">${row('Admin email (the invited address)', h.admin.email)}</div>
      </dl>
      <h3 class="mb-2 mt-5 font-display text-label-lg">Documents</h3>${docs}
      ${h.verification_status === 'REJECTED' ? `<p class="mt-4 rounded-xl bg-error-container/40 px-4 py-3 text-body-md text-on-error-container"><strong>Rejected:</strong> ${esc(h.rejection_reason || '')}</p>` : ''}
      ${pending ? `
      <div class="mt-6 border-t border-outline-variant pt-5">
        <label for="reject-reason" class="field-label">Reason (required to reject)</label>
        <textarea id="reject-reason" rows="3" maxlength="500" class="field-input" placeholder="Tell the hospital what to fix"></textarea>
        <p id="reject-error" class="field-error" hidden></p>
        <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" id="reject-btn" class="btn-danger">Reject</button>
          <button type="button" id="approve-btn" class="btn-primary">Approve</button>
        </div>
      </div>` : ''}`,
    onMount: (body, close) => {
      if (!pending) return;
      if (focusReject) qs('#reject-reason', body).focus();
      const done = (msg) => { close(); toast.success(msg); reload(); };

      qs('#approve-btn', body).addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const ok = await confirmDialog({ title: 'Approve this hospital?', message: `${h.name} will be listed for patients and its admin can start inviting doctors.`, confirmText: 'Approve' });
        if (!ok) return;
        await withBusy(button, async () => {
          try {
            const r = await api.post(`/api/branch/hospitals/${id}/approve`);
            done(r.email_sent ? 'Approved. The hospital admin has been emailed.' : 'Approved. (The email could not be sent.)');
          } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not approve.'); if (err.code === 'NOT_PENDING') { close(); reload(); } }
        });
      });

      qs('#reject-btn', body).addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const reason = qs('#reject-reason', body).value.trim();
        const err = qs('#reject-error', body);
        if (reason.length < 5) { err.textContent = 'Write a reason of at least 5 characters so the hospital knows what to fix.'; err.hidden = false; qs('#reject-reason', body).focus(); return; }
        err.hidden = true;
        await withBusy(button, async () => {
          try {
            const r = await api.post(`/api/branch/hospitals/${id}/reject`, { reason });
            done(r.email_sent ? 'Rejected. The hospital admin has been emailed the reason.' : 'Rejected. (The email could not be sent.)');
          } catch (e2) { toast.error(e2 instanceof ApiError ? e2.message : 'Could not reject.'); if (e2.code === 'NOT_PENDING') { close(); reload(); } }
        });
      });
    },
  });
}

// ---- invitations -----------------------------------------------------------------------------

export async function loadInvites(queue, reload, { q = '', districtName = '' } = {}) {
  const data = await api.get('/api/branch/hospital-invites');
  const needle = q.toLowerCase();
  data.items = data.items.filter((i) => (!districtName || i.district === districtName) && (!needle || i.hospital_name.toLowerCase().includes(needle) || i.email.toLowerCase().includes(needle)));
  if (!data.items.length) {
    queue.innerHTML = emptyBox('mail', 'No invitations are waiting. Use "Add hospital" to invite one.');
    return;
  }
  queue.innerHTML = data.items.map((i) => `
    <article class="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" data-invite="${i.id}">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="truncate font-display text-headline-sm">${esc(i.hospital_name)}</h2>
          <span class="badge ${STATUS_BADGE[i.status]}" data-invite-status>${esc(STATUS_TEXT[i.status] || i.status)}</span>
        </div>
        <p class="mt-1 text-body-md text-on-surface-variant">${esc(i.email)} &middot; ${esc(i.district)}, ${esc(i.state)}</p>
        <p class="text-body-sm text-outline">Sent ${esc(fmtDate(i.created_at))} &middot; ${i.status === 'INVITED' ? 'link works until' : i.status === 'EXPIRED' ? 'expired on' : 'was valid until'} ${esc(fmtDate(i.expires_at))}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        ${['INVITED', 'EXPIRED'].includes(i.status) ? `<button type="button" class="btn-outline btn-sm" data-resend="${i.id}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">forward_to_inbox</span>Resend</button>
        <button type="button" class="btn-outline btn-sm text-error" data-revoke="${i.id}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">block</span>Revoke</button>` : ''}
      </div>
    </article>`).join('');

  qsa('[data-resend]', queue).forEach((b) => b.addEventListener('click', async () => {
    await withBusy(b, async () => {
      try {
        const r = await api.post(`/api/branch/hospital-invites/${b.dataset.resend}/resend`);
        toast.success(r.email_sent ? 'A new link was emailed.' : 'A new link was created. (The email could not be sent.)');
        if (r.dev_invite_url) showDevLink(r.dev_invite_url);
        reload();
      } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not resend.'); reload(); }
    });
  }));
  qsa('[data-revoke]', queue).forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Withdraw this invitation?', message: 'The link in the email will stop working.', confirmText: 'Withdraw', danger: true });
    if (!ok) return;
    await withBusy(b, async () => {
      try {
        await api.post(`/api/branch/hospital-invites/${b.dataset.revoke}/revoke`);
        toast.success('Invitation withdrawn.');
        reload();
      } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not withdraw.'); reload(); }
    });
  }));
}

/** Local development only: the API returns the link so it can be tried without opening the mailbox. */
function showDevLink(url) {
  openModal({
    title: 'Invitation link (development only)',
    size: 'max-w-lg',
    html: `<p class="mb-3 text-body-md text-on-surface-variant">This box only appears on a local test server. In real use the link is sent by email and never shown here.</p>
      <input readonly class="field-input font-mono text-body-sm" id="dev-link" value="${esc(url)}">
      <div class="mt-4 flex justify-end gap-2"><a href="${esc(url)}" target="_blank" rel="noopener" class="btn-outline">Open link</a><button type="button" id="copy-link" class="btn-primary">Copy</button></div>`,
    onMount: (body) => {
      qs('#copy-link', body).addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast.success('Link copied.'); } catch { qs('#dev-link', body).select(); }
      });
    },
  });
}

export async function openAddHospital(reload) {
  let districts = [];
  try {
    ({ districts } = await api.get('/api/branch/districts'));
  } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not load your districts.'); return; }

  openModal({
    title: 'Invite a hospital',
    size: 'max-w-lg',
    html: `<form id="invite-form" class="space-y-5" novalidate>
        <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
        <p class="text-body-sm text-on-surface-variant">We email the hospital admin a link (valid for 7 days). They fill in the hospital's details and documents and set a password. You then review and approve it.</p>
        <div data-field>
          <label for="hospital_name" class="field-label">Hospital name</label>
          <input id="hospital_name" name="hospital_name" type="text" maxlength="200" class="field-input" required>
        </div>
        <div data-field>
          <label for="email" class="field-label">Hospital admin's email</label>
          <input id="email" name="email" type="email" maxlength="190" class="field-input" autocomplete="off" required>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <div data-field>
            <label for="district_id" class="field-label">District</label>
            <select id="district_id" name="district_id" class="field-input" required>
              <option value="">Select district</option>
              ${districts.map((d) => `<option value="${d.id}">${esc(d.name)} (${esc(d.state)})</option>`).join('')}
            </select>
          </div>
          <div data-field>
            <label for="phone" class="field-label">Phone <span class="normal-case text-outline">(optional)</span></label>
            <input id="phone" name="phone" type="tel" maxlength="20" class="field-input" inputmode="tel" autocomplete="off">
          </div>
        </div>
        <button type="submit" id="send-invite" class="btn-primary w-full py-3.5 text-base"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">send</span>Send invitation</button>
      </form>`,
    onMount: (body, close) => {
      const form = qs('#invite-form', body);
      const alertBox = qs('#form-alert', body);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        alertBox.hidden = true;
        const f = form.elements;
        const errors = {};
        if (f.hospital_name.value.trim().length < 2) errors.hospital_name = 'Enter the hospital name.';
        if (!/^\S+@\S+\.\S+$/.test(f.email.value.trim())) errors.email = 'Enter a valid email address.';
        if (!f.district_id.value) errors.district_id = 'Choose a district.';
        if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
        await withBusy(qs('#send-invite', body), async () => {
          try {
            const r = await api.post('/api/branch/hospital-invites', {
              hospital_name: f.hospital_name.value.trim(), email: f.email.value.trim(), district_id: Number(f.district_id.value), phone: f.phone.value.trim() || undefined,
            });
            close();
            toast.success(r.email_sent ? `Invitation sent to ${r.invite.email}.` : 'Invitation created. (The email could not be sent.)');
            if (r.dev_invite_url) showDevLink(r.dev_invite_url);
            reload();
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            const shown = err.status === 422 ? showFieldErrors(form, err.details) : false;
            if (!shown) { alertBox.textContent = err.message; alertBox.hidden = false; }
          }
        });
      });
    },
  });
}
