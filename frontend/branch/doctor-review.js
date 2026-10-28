// Branch Admin: the doctor review window (credentials, documents, approve or reject with a reason).
import { api, ApiError } from '/frontend/shared/api-client.js';
import { esc, qs, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { openModal, confirmDialog } from '/frontend/shared/modal.js';

const DOC_LABELS = { DEGREE: 'Degree certificate', REGISTRATION: 'Medical registration', CERTIFICATE: 'Certificate', ID_PROOF: 'ID proof', OTHER: 'Other' };

/** Open the review window for a doctor. `reload` runs after a decision. `focusReject` puts the cursor in the reason box. */
export async function openDoctorReview(id, reload, { focusReject = false } = {}) {
  let doctor;
  try {
    ({ doctor } = await api.get(`/api/branch/doctors/${id}`));
  } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not open this application.'); return; }

  const row = (k, v) => `<div><dt class="text-label-md uppercase tracking-wide text-on-surface-variant">${esc(k)}</dt><dd class="mt-0.5 text-body-md">${esc(v || '-')}</dd></div>`;
  const docs = doctor.documents.length
    ? `<ul class="divide-y divide-outline-variant rounded-xl border border-outline-variant">${doctor.documents.map((d) => `
        <li class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="min-w-0"><span class="block truncate text-body-md">${esc(d.original_name || 'File')}</span><span class="text-body-sm text-on-surface-variant">${esc(DOC_LABELS[d.doc_type] || d.doc_type)}</span></span>
          <a href="/api/doctors/documents/${d.id}" target="_blank" rel="noopener" class="btn-outline btn-sm">Open</a>
        </li>`).join('')}</ul>`
    : '<p class="rounded-xl bg-secondary-fixed/50 px-4 py-3 text-body-md text-on-secondary-container">No documents were uploaded with this application.</p>';
  const pending = doctor.verification_status === 'PENDING';

  openModal({
    title: doctor.name,
    size: 'max-w-xl',
    html: `
      <dl class="grid gap-4 sm:grid-cols-2">
        ${row('Email', doctor.email)}${row('Phone', doctor.phone)}
        ${row('Specialty', doctor.specialty)}${row('Location', `${doctor.district}, ${doctor.state}`)}
        ${row('Qualifications', doctor.qualifications)}${row('Clinic / chamber', doctor.clinic_name)}
        <div class="sm:col-span-2">${row('Address', doctor.address)}</div>
        ${doctor.about ? `<div class="sm:col-span-2">${row('About', doctor.about)}</div>` : ''}
      </dl>
      <h3 class="mb-2 mt-5 font-display text-label-lg">Documents</h3>${docs}
      ${doctor.verification_status === 'REJECTED' ? `<p class="mt-4 rounded-xl bg-error-container/40 px-4 py-3 text-body-md text-on-error-container"><strong>Rejected:</strong> ${esc(doctor.rejection_reason || '')}</p>` : ''}
      ${pending ? `
      <div class="mt-6 border-t border-outline-variant pt-5">
        <label for="reject-reason" class="field-label">Reason (required to reject)</label>
        <textarea id="reject-reason" rows="3" maxlength="500" class="field-input" placeholder="Tell the doctor what to fix"></textarea>
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
        const button = e.currentTarget; // currentTarget is cleared once the handler awaits, so keep a reference
        const ok = await confirmDialog({ title: 'Approve this doctor?', message: `${doctor.name} will be able to set a schedule and receive bookings.`, confirmText: 'Approve' });
        if (!ok) return;
        await withBusy(button, async () => {
          try {
            const r = await api.post(`/api/branch/doctors/${id}/approve`);
            done(r.email_sent ? 'Approved. The doctor has been emailed.' : 'Approved. (The email could not be sent.)');
          } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not approve.'); if (err.code === 'NOT_PENDING') { close(); reload(); } }
        });
      });

      qs('#reject-btn', body).addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const reason = qs('#reject-reason', body).value.trim();
        const err = qs('#reject-error', body);
        if (reason.length < 5) { err.textContent = 'Write a reason of at least 5 characters so the doctor knows what to fix.'; err.hidden = false; qs('#reject-reason', body).focus(); return; }
        err.hidden = true;
        await withBusy(button, async () => {
          try {
            const r = await api.post(`/api/branch/doctors/${id}/reject`, { reason });
            done(r.email_sent ? 'Rejected. The doctor has been emailed the reason.' : 'Rejected. (The email could not be sent.)');
          } catch (e2) { toast.error(e2 instanceof ApiError ? e2.message : 'Could not reject.'); if (e2.code === 'NOT_PENDING') { close(); reload(); } }
        });
      });
    },
  });
}
