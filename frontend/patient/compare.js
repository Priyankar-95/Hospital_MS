// Side-by-side comparison of 2-4 doctors: fee, facilities, next slot and location.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs } from '/frontend/shared/dom.js';
import { avatar, typeBadge, money, nextText, nextSub } from './common.js';

await initPage({ requireLogin: true });
const root = qs('#compare');
const ids = (new URLSearchParams(location.search).get('ids') || '');

function empty(message) {
  root.innerHTML = `<div class="card p-8 text-center"><span class="material-symbols-outlined text-4xl text-outline" aria-hidden="true">compare_arrows</span>
    <h2 class="mt-2 font-display text-headline-sm">${esc(message)}</h2>
    <a href="/frontend/patient/doctors.html" class="btn-primary mt-4">Choose doctors</a></div>`;
}

function render(items, requested) {
  const cheapest = items.filter((d) => d.fees.length).map((d) => Number(d.fees[0].fee));
  const lowest = cheapest.length > 1 ? Math.min(...cheapest) : null;
  const cols = items.length;

  const row = (label, icon, cell) => `
    <tr class="border-t border-outline-variant align-top">
      <th scope="row" class="sticky left-0 z-10 w-36 bg-surface-container-low px-4 py-4 text-left font-display text-label-md uppercase tracking-wide text-on-surface-variant sm:w-44">
        <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">${icon}</span>${esc(label)}</span></th>
      ${items.map((d) => `<td class="min-w-[13rem] px-4 py-4 text-body-md">${cell(d)}</td>`).join('')}
    </tr>`;

  root.innerHTML = `
    ${items.length < requested ? '<p class="mb-4 rounded-xl bg-secondary-fixed px-4 py-3 text-body-md text-on-secondary-container">Some of the doctors you picked are no longer available, so they are not shown.</p>' : ''}
    <div class="card overflow-x-auto">
      <table class="w-full border-collapse" style="min-width: ${150 + cols * 220}px">
        <caption class="sr-only">Comparison of ${cols} doctors</caption>
        <thead>
          <tr>
            <th scope="col" class="sticky left-0 z-10 bg-surface-container-low px-4 py-4"><span class="sr-only">Detail</span></th>
            ${items.map((d) => `
              <th scope="col" class="px-4 py-4 text-left align-top font-normal">
                <a href="/frontend/patient/doctor.html?id=${d.id}" class="flex items-center gap-3" aria-label="View profile of ${esc(d.name)}">
                  ${avatar(d, 'h-14 w-14', 'text-lg')}
                  <span class="min-w-0"><span class="block font-display text-headline-sm">${esc(d.name)}</span>
                    <span class="mt-1 block">${typeBadge(d)}</span></span>
                </a>
              </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${row('Specialty', 'stethoscope', (d) => `<span class="font-semibold text-primary">${esc(d.specialty.name)}</span>`)}
          ${row('Practice', 'location_on', (d) => `<p class="font-semibold">${esc(d.place.name || '-')}</p><p class="text-body-sm text-on-surface-variant">${esc(d.place.address || '')}</p><p class="text-body-sm text-on-surface-variant">${esc(d.location.district)}, ${esc(d.location.state)}</p>`)}
          ${row('Fee', 'payments', (d) => d.fees.length
            ? `<ul class="space-y-1">${d.fees.map((f, i) => `<li class="flex items-baseline justify-between gap-3"><span class="text-body-sm text-on-surface-variant">${esc(f.treatment_name)}</span><span class="font-display font-semibold">${esc(money(f.fee))}</span></li>${i === 0 && lowest !== null && Number(f.fee) === lowest ? '<li><span class="badge badge-success">Lowest fee</span></li>' : ''}`).join('')}</ul>`
            : '<span class="text-outline">Fee not set</span>')}
          ${row('Next available', 'schedule', (d) => d.next_available
            ? `<p class="font-semibold">${esc(nextText(d.next_available))}</p><p class="text-body-sm text-on-surface-variant">${esc(nextSub(d.next_available))}</p>`
            : '<span class="text-outline">No upcoming slots</span>')}
          ${row('Facilities', 'meeting_room', (d) => d.facilities ? `<p class="whitespace-pre-line">${esc(d.facilities)}</p>` : '<span class="text-outline">Not listed</span>')}
          ${row('Qualifications', 'school', (d) => esc(d.qualifications || '-'))}
          <tr class="border-t border-outline-variant">
            <th scope="row" class="sticky left-0 z-10 bg-surface-container-low px-4 py-4 text-left font-display text-label-md uppercase tracking-wide text-on-surface-variant">Book</th>
            ${items.map((d) => {
              const ok = d.fees.length && d.next_available;
              return `<td class="px-4 py-4"><a href="/frontend/patient/doctor.html?id=${d.id}#book" class="btn-primary w-full ${ok ? '' : 'pointer-events-none opacity-50'}" ${ok ? '' : 'aria-disabled="true"'}>Select slot</a></td>`;
            }).join('')}
          </tr>
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-body-sm text-on-surface-variant">Scroll sideways to see every doctor.</p>`;
}

if (!/^\d+(,\d+){1,3}$/.test(ids)) {
  empty('Pick 2 to 4 doctors to compare');
} else {
  try {
    const data = await api.get(`/api/doctors/compare?ids=${ids}`);
    if (data.items.length < 2) empty('Those doctors are no longer available');
    else render(data.items, data.requested);
  } catch (e) {
    empty(e instanceof ApiError ? e.message : 'Could not load the comparison');
  }
}
