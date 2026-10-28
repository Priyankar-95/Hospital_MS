// Doctor home. What the doctor sees depends on verification status:
//   PENDING  -> "Waiting for verification" only
//   REJECTED -> reason + edit form + resubmit
//   APPROVED -> the portal
import { api, ApiError, setCurrentUser } from '/frontend/shared/api-client.js';
import { initPage, renderPortalStub } from '/frontend/shared/layout.js';
import { esc, qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { openModal } from '/frontend/shared/modal.js';
import { profileFieldsHtml, initProfileFields, buildDoctorFormData, validateDoctorProfile } from './doctor-form.js';

const user = await initPage({ roles: ['DOCTOR'] });
const main = qs('#app-main');

const DOC_LABELS = { DEGREE: 'Degree certificate', REGISTRATION: 'Medical registration', CERTIFICATE: 'Certificate', ID_PROOF: 'ID proof', OTHER: 'Other' };

function documentList(docs) {
  if (!docs.length) return '<p class="text-body-md text-on-surface-variant">No documents uploaded.</p>';
  return `<ul class="divide-y divide-outline-variant rounded-xl border border-outline-variant">${docs.map((d) => `
    <li class="flex items-center justify-between gap-3 px-4 py-3">
      <span class="min-w-0"><span class="block truncate text-body-md">${esc(d.original_name || 'File')}</span>
        <span class="text-body-sm text-on-surface-variant">${esc(DOC_LABELS[d.doc_type] || d.doc_type)}</span></span>
      <a href="/api/doctors/documents/${d.id}" target="_blank" rel="noopener" class="btn-outline btn-sm">View</a>
    </li>`).join('')}</ul>`;
}

function summary(d) {
  const row = (k, v) => `<div><dt class="text-label-md uppercase tracking-wide text-on-surface-variant">${esc(k)}</dt><dd class="mt-0.5 text-body-md">${esc(v || '-')}</dd></div>`;
  return `<dl class="grid gap-4 sm:grid-cols-2">
    ${row('Specialty', d.specialty.name)}${row('Location', `${d.location.district}, ${d.location.state}`)}
    ${row('Qualifications', d.qualifications)}${row('Clinic / chamber', d.clinic_name)}
    <div class="sm:col-span-2">${row('Address', d.address)}</div></dl>`;
}

function renderPending(d) {
  main.innerHTML = `
    <section class="card mx-auto max-w-2xl p-6 text-center sm:p-10">
      <span class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-fixed text-secondary"><span class="material-symbols-outlined text-3xl" aria-hidden="true">hourglass_top</span></span>
      <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">Waiting for verification</h1>
      <p class="mx-auto mt-3 max-w-md text-body-lg text-on-surface-variant">Thank you, ${esc(user.name)}. A Branch Admin for ${esc(d.location.district)} is checking your credentials. We will email you as soon as there is a decision. You can use the rest of the platform once you are approved.</p>
    </section>
    <section class="card mx-auto mt-6 max-w-2xl space-y-6 p-6">
      <div><h2 class="mb-3 font-display text-headline-sm">What you submitted</h2>${summary(d)}</div>
      <div><h2 class="mb-3 font-display text-headline-sm">Documents</h2>${documentList(d.documents)}</div>
    </section>`;
}

async function renderRejected(d) {
  main.innerHTML = `
    <section class="mx-auto max-w-2xl">
      <div class="card p-6 sm:p-8">
        <span class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-container text-error"><span class="material-symbols-outlined text-3xl" aria-hidden="true">report</span></span>
        <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">Your application was not approved</h1>
        <p class="mt-3 text-body-md text-on-surface-variant">The reviewer left this reason:</p>
        <blockquote class="mt-2 rounded-xl bg-error-container/40 px-4 py-3 text-body-md text-on-error-container" id="reject-reason"></blockquote>
        <p class="mt-4 text-body-md text-on-surface-variant">Please correct your details and add any missing documents, then send it back for review.</p>
      </div>
      <div class="card mt-6 p-6 sm:p-8">
        <h2 class="mb-4 font-display text-headline-sm">Documents already uploaded</h2>
        ${documentList(d.documents)}
      </div>
      <button type="button" id="open-resubmit" class="btn-accent mt-6 w-full py-3.5 text-base"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">edit_note</span>Update details and resubmit</button>
    </section>`;
  qs('#reject-reason').textContent = d.rejection_reason || 'No reason was given.';

  qs('#open-resubmit').addEventListener('click', () => openResubmitModal(d));
}

// The edit form opens in a modal so the rejection reason stays visible behind it.
function openResubmitModal(d) {
  openModal({
    title: 'Update and resubmit',
    size: 'max-w-2xl',
    html: `<form id="resubmit-form" class="space-y-5" novalidate>
        <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
        <p class="rounded-xl bg-error-container/40 px-4 py-3 text-body-sm text-on-error-container"><strong>Reviewer's reason:</strong> ${esc(d.rejection_reason || 'No reason was given.')}</p>
        ${profileFieldsHtml()}
        <button type="submit" id="submit" class="btn-accent w-full py-3.5 text-base">Resubmit for verification</button>
      </form>`,
    onMount: async (body, close) => {
      const form = qs('#resubmit-form', body);
      const alertBox = qs('#form-alert', body);
      try {
        await initProfileFields(form, d);
      } catch {
        alertBox.textContent = 'Could not load the form options. Please close this window and try again.';
        alertBox.hidden = false;
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        alertBox.hidden = true;
        const errors = validateDoctorProfile(form);
        if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
        await withBusy(qs('#submit', body), async () => {
          try {
            const data = await api.upload('/api/doctors/me/resubmit', buildDoctorFormData(form));
            close();
            toast.success('Resubmitted. We will email you after the review.');
            setCurrentUser({ ...user, doctor_status: data.doctor.verification_status });
            renderPending(data.doctor);
            window.scrollTo({ top: 0 });
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            const shown = err.status === 422 ? showFieldErrors(form, err.details) : false;
            if (err.details && err.details.documents) { alertBox.textContent = err.details.documents; alertBox.hidden = false; }
            else if (!shown) { alertBox.textContent = err.message; alertBox.hidden = false; }
          }
        });
      });
    },
  });
}

try {
  const { doctor } = await api.get('/api/doctors/me');
  if (doctor.verification_status === 'PENDING') {
    renderPending(doctor);
  } else if (doctor.verification_status === 'REJECTED') {
    await renderRejected(doctor);
  } else if (doctor.verification_status === 'APPROVED') {
    renderPortalStub({
      user,
      title: 'Doctor dashboard',
      phase: 'the next steps of Phase 1',
      intro: 'Your account is verified. Your schedule, fees and appointments will be managed here.',
      items: ['Appointments and daily PDF'],
    });
    main.className = '';

    // Shortcuts to the live pages, with a nudge until each is set up
    let hasHours = true;
    let hasFee = true;
    try {
      const [schedule, fees] = await Promise.all([api.get('/api/doctors/me/schedule'), api.get('/api/doctors/me/fees')]);
      hasHours = schedule.windows.length > 0;
      hasFee = fees.fees.some((f) => f.is_active);
    } catch { /* the shortcuts still work without the nudges */ }
    const missing = [!doctor.photo_url && 'a photo', !doctor.about && 'an introduction'].filter(Boolean);
    const card = (href, icon, title, text, warn) => `
      <a href="${href}" class="card mt-4 flex items-center gap-4 p-5 transition hover:shadow-pop">
        <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${warn ? 'bg-secondary-fixed text-secondary' : 'bg-primary-fixed text-primary'}"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span></span>
        <span class="min-w-0 flex-1"><span class="block font-display text-headline-sm">${title}</span>
          <span class="text-body-md text-on-surface-variant">${text}</span></span>
        <span class="material-symbols-outlined text-outline" aria-hidden="true">chevron_right</span>
      </a>`;
    main.firstElementChild.insertAdjacentHTML('beforeend', `
      ${card('/frontend/doctor/schedule.html', 'calendar_month', 'Working hours', hasHours ? 'Days, time windows and how patients book.' : 'Set your working hours so patients can book you.', !hasHours)}
      ${card('/frontend/doctor/schedule.html#fees', 'payments', 'Fees', hasFee ? 'Your fee for each treatment.' : 'Add at least one fee so patients can book you.', !hasFee)}
      ${card('/frontend/doctor/profile.html', 'badge', 'Your profile', missing.length ? `Add ${missing.join(' and ')} so patients can find and trust you.` : 'Photo, introduction, chamber details and certificates.', false)}`);
  } else {
    main.innerHTML = `<section class="card mx-auto max-w-2xl p-8 text-center"><h1 class="font-display text-headline-md">Complete your profile</h1>
      <p class="mt-2 text-on-surface-variant">Your account is not ready for review yet.</p></section>`;
  }
} catch (e) {
  main.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load your application. Please refresh.')}</p>`;
}
