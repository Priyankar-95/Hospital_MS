// Hospital Admin home. What the admin sees depends on the verification status:
//   PENDING  -> "Waiting for verification" only
//   REJECTED -> reason + edit form + resubmit
//   APPROVED -> the portal
import { api, ApiError, setCurrentUser } from '/frontend/shared/api-client.js';
import { startHospitalPortal, setTopbarHospital, skeleton, bar, occupancyTone, num } from './portal.js';
import { esc, qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { openModal } from '/frontend/shared/modal.js';
import { hospitalFieldsHtml, initHospitalFields, buildHospitalFormData, validateHospitalFields, HOSPITAL_DOC_LABELS } from './hospital-form.js';

const { user, main, approved } = await startHospitalPortal('overview');

function documentList(docs) {
  if (!docs.length) return '<p class="text-body-md text-on-surface-variant">No documents uploaded.</p>';
  return `<ul class="divide-y divide-outline-variant rounded-xl border border-outline-variant">${docs.map((d) => `
    <li class="flex items-center justify-between gap-3 px-4 py-3">
      <span class="min-w-0"><span class="block truncate text-body-md">${esc(d.original_name || 'File')}</span>
        <span class="text-body-sm text-on-surface-variant">${esc(HOSPITAL_DOC_LABELS[d.doc_type] || d.doc_type)}</span></span>
      <a href="/api/hospitals/documents/${d.id}" target="_blank" rel="noopener" class="btn-outline btn-sm">View</a>
    </li>`).join('')}</ul>`;
}

function summary(h) {
  const row = (k, v) => `<div><dt class="text-label-md uppercase tracking-wide text-on-surface-variant">${esc(k)}</dt><dd class="mt-0.5 text-body-md">${esc(v || '-')}</dd></div>`;
  return `<dl class="grid gap-4 sm:grid-cols-2">
    ${row('Hospital', h.name)}${row('District', `${h.location.district}, ${h.location.state}`)}
    ${row('Phone', h.phone)}<div class="sm:col-span-2">${row('Address', h.address)}</div></dl>`;
}

function renderPending(h) {
  main.innerHTML = `
    <section class="card mx-auto max-w-2xl p-6 text-center sm:p-10">
      <span class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-fixed text-secondary"><span class="material-symbols-outlined text-3xl" aria-hidden="true">hourglass_top</span></span>
      <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">Waiting for verification</h1>
      <p class="mx-auto mt-3 max-w-md text-body-lg text-on-surface-variant">Thank you, ${esc(user.name)}. A Branch Admin for ${esc(h.location.district)} is checking the details of ${esc(h.name)}. We will email you as soon as it is approved. Until then, the hospital portal stays locked.</p>
    </section>
    <section class="card mx-auto mt-6 max-w-2xl space-y-6 p-6">
      <div><h2 class="mb-3 font-display text-headline-sm">What you submitted</h2>${summary(h)}</div>
      <div><h2 class="mb-3 font-display text-headline-sm">Documents</h2>${documentList(h.documents)}</div>
    </section>`;
}

function renderRejected(h) {
  main.innerHTML = `
    <section class="mx-auto max-w-2xl">
      <div class="card p-6 sm:p-8">
        <span class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-container text-error"><span class="material-symbols-outlined text-3xl" aria-hidden="true">report</span></span>
        <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">Your application was not approved</h1>
        <p class="mt-3 text-body-md text-on-surface-variant">The reviewer left this reason:</p>
        <blockquote class="mt-2 rounded-xl bg-error-container/40 px-4 py-3 text-body-md text-on-error-container" id="reject-reason"></blockquote>
        <p class="mt-4 text-body-md text-on-surface-variant">Please correct your details and add any missing documents, then send it back for review.</p>
      </div>
      <div class="card mt-6 space-y-6 p-6 sm:p-8">
        <div><h2 class="mb-3 font-display text-headline-sm">What you submitted</h2>${summary(h)}</div>
        <div><h2 class="mb-3 font-display text-headline-sm">Documents already uploaded</h2>${documentList(h.documents)}</div>
      </div>
      <button type="button" id="open-resubmit" class="btn-accent mt-6 w-full py-3.5 text-base"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">edit_note</span>Update details and resubmit</button>
    </section>`;
  qs('#reject-reason').textContent = h.rejection_reason || 'No reason was given.';
  qs('#open-resubmit').addEventListener('click', () => openResubmitModal(h));
}

// The edit form opens in a modal so the rejection reason stays visible behind it.
function openResubmitModal(h) {
  openModal({
    title: 'Update and resubmit',
    size: 'max-w-2xl',
    html: `<form id="resubmit-form" class="space-y-5" novalidate>
        <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
        <p class="rounded-xl bg-error-container/40 px-4 py-3 text-body-sm text-on-error-container"><strong>Reviewer's reason:</strong> ${esc(h.rejection_reason || 'No reason was given.')}</p>
        ${hospitalFieldsHtml()}
        <button type="submit" id="submit" class="btn-accent w-full py-3.5 text-base">Resubmit for verification</button>
      </form>`,
    onMount: (body, close) => {
      const form = qs('#resubmit-form', body);
      const alertBox = qs('#form-alert', body);
      initHospitalFields(form, h);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        alertBox.hidden = true;
        const errors = validateHospitalFields(form);
        if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
        await withBusy(qs('#submit', body), async () => {
          try {
            const data = await api.upload('/api/hospitals/me/resubmit', buildHospitalFormData(form));
            close();
            toast.success('Resubmitted. We will email you after the review.');
            setCurrentUser({ ...user, hospital_status: data.hospital.verification_status });
            renderPending(data.hospital);
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

// ---- the approved hospital's overview ---------------------------------------------------------------

const statCard = (icon, tone, label, value, sub, href) => `
  <a href="${href}" class="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-pop">
    <span class="flex items-center justify-between"><span class="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">${esc(label)}</span>
      <span class="flex h-9 w-9 items-center justify-center rounded-xl ${tone}"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">${icon}</span></span></span>
    <span class="font-display text-display-lg-mobile font-extrabold leading-none sm:text-display-lg">${value}</span>
    <span class="text-body-sm text-on-surface-variant">${sub}</span>
  </a>`;

function renderOverview(o) {
  setTopbarHospital(o.hospital.name, `${o.hospital.district}, ${o.hospital.state}`);
  const b = o.beds;
  const tone = occupancyTone(b.occupancy_percent);
  const total = b.total_beds;

  const todo = [
    !o.departments.count && ['apartment', 'Add your departments', '/frontend/hospital/departments.html'],
    !total && ['bed', 'Set your bed count', '/frontend/hospital/beds.html'],
    !o.facilities.length && ['health_and_safety', 'Choose your facilities', '/frontend/hospital/facilities.html'],
  ].filter(Boolean);

  const deptBars = o.departments.list.filter((d) => d.bed_count > 0).slice(0, 5).map((d) => `
    <div><div class="mb-1 flex justify-between text-body-sm"><span class="truncate">${esc(d.name)}</span><span class="font-semibold">${num(d.bed_count)} beds</span></div>
    ${bar(total ? (d.bed_count / total) * 100 : 0, 'bg-primary-container')}</div>`).join('');

  main.innerHTML = `
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-headline-lg-mobile font-bold sm:text-headline-lg">${esc(o.hospital.name)}</h1>
        <p class="mt-1 flex flex-wrap items-center gap-2 text-body-md text-on-surface-variant"><span class="badge badge-success"><span class="material-symbols-outlined mr-1 text-[14px]" aria-hidden="true">verified</span>Verified</span>${esc(o.hospital.district)}, ${esc(o.hospital.state)}</p>
      </div>
    </div>

    ${todo.length ? `<section class="card mb-6 border-l-4 border-secondary-container p-5" aria-label="Finish setting up">
      <h2 class="font-display text-headline-sm">Finish setting up your hospital</h2>
      <p class="mt-1 text-body-sm text-on-surface-variant">Patients see these details when they look at your hospital.</p>
      <div class="mt-3 flex flex-wrap gap-2">${todo.map(([icon, text, href]) => `<a href="${href}" class="btn-outline btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">${icon}</span>${text}</a>`).join('')}</div>
    </section>` : ''}

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="At a glance">
      ${statCard('stethoscope', 'bg-primary-fixed text-primary', 'Doctors', num(o.doctors.approved), `${num(o.doctors.pending)} waiting for review &middot; ${num(o.doctors.invited)} invited`, '/frontend/hospital/doctors.html')}
      ${statCard('bed', tone.chip, 'Bed occupancy', `${b.occupancy_percent}%`, total ? `${num(b.occupied_beds)} of ${num(total)} beds in use &middot; ${tone.label}` : 'Set your bed count', '/frontend/hospital/beds.html')}
      ${statCard('event_available', 'bg-secondary-fixed text-secondary', "Today's bookings", num(o.bookings.today), `${num(o.bookings.upcoming)} upcoming in total`, '/frontend/hospital/dashboard.html')}
      ${statCard('apartment', 'bg-tertiary-fixed text-tertiary', 'Departments', num(o.departments.count), `${num(o.departments.beds_assigned)} beds assigned`, '/frontend/hospital/departments.html')}
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-5">
      <section class="card p-5 sm:p-6 lg:col-span-3" aria-label="Bed capacity">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div><h2 class="font-display text-headline-sm">Bed capacity</h2><p class="text-body-sm text-on-surface-variant">As you last updated it.</p></div>
          <a href="/frontend/hospital/beds.html" class="btn-primary btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>Update</a>
        </div>
        <div class="grid grid-cols-3 gap-3 rounded-2xl bg-surface-container-low p-4 text-center">
          <div><p class="text-label-sm uppercase text-on-surface-variant">Total</p><p class="font-display text-headline-md font-bold">${num(total)}</p></div>
          <div><p class="text-label-sm uppercase text-on-surface-variant">Occupied</p><p class="font-display text-headline-md font-bold ${tone.text}">${num(b.occupied_beds)}</p></div>
          <div><p class="text-label-sm uppercase text-on-surface-variant">Available</p><p class="font-display text-headline-md font-bold text-tertiary">${num(b.available_beds)}</p></div>
        </div>
        <div class="mt-4">${bar(b.occupancy_percent, tone.bar)}</div>
        ${deptBars ? `<h3 class="mb-3 mt-6 font-display text-label-lg uppercase tracking-wide text-on-surface-variant">By department</h3><div class="space-y-3">${deptBars}</div>` : ''}
      </section>

      <section class="card p-5 sm:p-6 lg:col-span-2" aria-label="Facilities">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div><h2 class="font-display text-headline-sm">Facilities &amp; amenities</h2><p class="text-body-sm text-on-surface-variant">${o.facilities.length} listed</p></div>
          <a href="/frontend/hospital/facilities.html" class="btn-outline btn-sm">Edit</a>
        </div>
        ${o.facilities.length
          ? `<ul class="space-y-2">${o.facilities.slice(0, 8).map((f) => `<li class="flex items-center gap-2 text-body-md"><span class="material-symbols-outlined text-[18px] text-tertiary" aria-hidden="true">check_circle</span>${esc(f)}</li>`).join('')}</ul>${o.facilities.length > 8 ? `<p class="mt-2 text-body-sm text-on-surface-variant">and ${o.facilities.length - 8} more</p>` : ''}`
          : '<p class="text-body-md text-on-surface-variant">No facilities listed yet.</p>'}
      </section>
    </div>`;
}

try {
  if (approved) {
    main.innerHTML = `<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">${skeleton(4)}</div>`;
    renderOverview(await api.get('/api/hospitals/me/overview'));
  } else {
    const { hospital } = await api.get('/api/hospitals/me');
    if (hospital.verification_status === 'PENDING') renderPending(hospital);
    else if (hospital.verification_status === 'REJECTED') renderRejected(hospital);
    else location.reload(); // approved just now: reload to get the portal frame
  }
} catch (e) {
  main.innerHTML = `<p class="mx-auto max-w-2xl rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load this page. Please refresh.')}</p>`;
}
