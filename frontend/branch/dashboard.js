// Branch Admin: Regional Overview. Counts for my districts, a row per district, and what has waited longest.
import { api } from '/frontend/shared/api-client.js';
import { esc, qs } from '/frontend/shared/dom.js';
import { setNavCount } from '/frontend/shared/portal-shell.js';
import { startBranchPortal, setScope, skeleton, pageHeader, fmtDate, emptyBox, errorBox, num } from './portal.js';
import { openAddHospital } from './hospital-actions.js';

const { user, main } = await startBranchPortal('overview');
main.innerHTML = `${pageHeader(`Welcome, ${user.name}`, 'What is happening in the districts you look after.', '<button type="button" id="add-hospital" class="btn-primary"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">add_business</span>Add hospital</button>')}<div id="content" class="space-y-6"><div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">${skeleton(4, 'h-36')}</div>${skeleton(2, 'h-56')}</div>`;
const content = qs('#content');

const stat = (label, value, hint, icon, tint, href) => `
  <a href="${href}" class="card block p-5 transition hover:-translate-y-0.5 hover:shadow-md">
    <div class="flex items-start justify-between"><p class="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">${esc(label)}</p>
      <span class="flex h-10 w-10 items-center justify-center rounded-xl ${tint}"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span></span></div>
    <p class="mt-3 font-display text-display-lg-mobile font-extrabold sm:text-display-lg">${num(value)}</p>
    <p class="mt-1 text-body-sm text-on-surface-variant">${esc(hint)}</p>
  </a>`;

function render(o) {
  const s = o.stats;
  const pending = s.hospitals_pending + s.doctors_pending;
  setNavCount('hospitals', s.hospitals_pending + s.invites_open);
  setNavCount('doctors', s.doctors_pending);

  const rows = o.districts.map((d) => `
    <li class="flex items-center justify-between gap-3 py-3">
      <div class="min-w-0"><p class="truncate font-display text-label-lg">${esc(d.name)}</p><p class="text-body-sm text-on-surface-variant">${esc(d.state)}</p></div>
      <div class="flex shrink-0 items-center gap-4 text-center text-body-sm">
        <div><p class="font-display text-label-lg">${num(d.hospitals)}</p><p class="text-on-surface-variant">Hospitals</p></div>
        <div><p class="font-display text-label-lg">${num(d.doctors)}</p><p class="text-on-surface-variant">Doctors</p></div>
        <div class="w-16">${d.waiting ? `<span class="rounded-full bg-secondary-fixed px-2.5 py-1 text-label-md font-semibold text-on-secondary-container">${num(d.waiting)} waiting</span>` : '<span class="text-outline">Clear</span>'}</div>
      </div>
    </li>`).join('');

  const waiting = o.waiting.length
    ? `<ul class="divide-y divide-outline-variant">${o.waiting.map((w) => `
        <li class="flex items-center justify-between gap-3 py-3">
          <div class="flex min-w-0 items-center gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary"><span class="material-symbols-outlined" aria-hidden="true">${w.kind === 'HOSPITAL' ? 'local_hospital' : 'stethoscope'}</span></span>
            <div class="min-w-0"><p class="truncate font-display text-label-lg">${esc(w.name)}</p><p class="truncate text-body-sm text-on-surface-variant">${w.kind === 'HOSPITAL' ? 'Hospital' : 'Doctor'} &middot; ${esc(w.district)} &middot; ${esc(fmtDate(w.submitted_at))}</p></div>
          </div>
          <a href="/frontend/branch/${w.kind === 'HOSPITAL' ? 'hospitals' : 'doctors'}.html?status=PENDING" class="btn-outline btn-sm shrink-0">Review</a>
        </li>`).join('')}</ul>`
    : emptyBox('task_alt', 'Nothing is waiting for review. Well done.');

  content.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${stat('Hospitals onboarded', s.hospitals, 'Approved and listed', 'local_hospital', 'bg-primary-fixed text-primary', '/frontend/branch/hospitals.html?status=APPROVED')}
      ${stat('Pending verifications', pending, `${s.hospitals_pending} hospital${s.hospitals_pending === 1 ? '' : 's'} and ${s.doctors_pending} doctor${s.doctors_pending === 1 ? '' : 's'}`, 'pending_actions', 'bg-secondary-fixed text-secondary', '/frontend/branch/hospitals.html?status=PENDING')}
      ${stat('Open invitations', s.invites_open, 'Hospitals yet to accept', 'mail', 'bg-tertiary-fixed text-tertiary', '/frontend/branch/hospitals.html?status=INVITED')}
      ${stat('Bookings this month', s.bookings_month, 'Not cancelled, in my districts', 'event_available', 'bg-surface-container-high text-on-surface-variant', '/frontend/branch/doctors.html?status=APPROVED')}
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card p-5 sm:p-6" aria-label="Districts">
        <h2 class="font-display text-headline-sm">My districts</h2>
        ${rows ? `<ul class="mt-2 divide-y divide-outline-variant">${rows}</ul>` : '<p class="mt-3 text-body-md text-on-surface-variant">No districts are assigned to you yet. Ask the Super Admin.</p>'}
      </section>
      <section class="card p-5 sm:p-6" aria-label="Waiting longest">
        <h2 class="mb-2 font-display text-headline-sm">Waiting longest</h2>
        ${waiting}
      </section>
    </div>`;
}

qs('#add-hospital').addEventListener('click', () => openAddHospital(load));

async function load() {
  try {
    const [o, d] = await Promise.all([api.get('/api/branch/overview'), api.get('/api/branch/districts')]);
    setScope(d.districts);
    render(o);
  } catch (e) {
    content.innerHTML = errorBox(e, 'Could not load the overview. Please refresh.');
  }
}
await load();
