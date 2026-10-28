// My appointments: upcoming and past bookings with a link to each invoice.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs, qsa } from '/frontend/shared/dom.js';
import { avatar, money, time12, fmtDate, dayWord, paymentLabel, cancelNote, cancelledLine, openCancelModal } from './common.js';

await initPage({ roles: ['PATIENT'], navSearch: false });

const list = qs('#list');
const pager = qs('#pager');
let items = []; // the bookings on screen, so a click on "Cancel" can find its booking
const state = { scope: new URLSearchParams(location.search).get('scope') === 'past' ? 'past' : 'upcoming', page: 1 };

const STATUS = {
  BOOKED: ['badge-success', 'Booked'],
  CANCELLED: ['badge-danger', 'Cancelled'],
  COMPLETED: ['badge-info', 'Completed'],
  NO_SHOW: ['badge-warning', 'No-show'],
};

function card(a) {
  const [cls, label] = STATUS[a.status] || ['', a.status];
  const dt = new Date(`${a.date}T00:00:00`);
  const when = a.mode === 'SLOTS' ? time12(a.time) : `${time12(a.window.start)} – ${time12(a.window.end)}`;
  const cancelled = a.status === 'CANCELLED';
  return `
    <article class="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center" data-booking="${esc(a.booking_code)}">
      <div class="flex w-full shrink-0 items-center gap-3 sm:w-24 sm:flex-col sm:gap-0 sm:text-center">
        <span class="font-display text-label-md uppercase text-on-surface-variant">${esc(dt.toLocaleDateString('en-IN', { month: 'short' }))}</span>
        <span class="font-display text-display-lg-mobile leading-none">${dt.getDate()}</span>
        <span class="text-body-sm text-on-surface-variant">${esc(dt.toLocaleDateString('en-IN', { weekday: 'short' }))}</span>
      </div>
      <div class="flex min-w-0 flex-1 gap-4">
        ${avatar(a.doctor, 'h-14 w-14', 'text-lg')}
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2"><h2 class="font-display text-headline-sm ${cancelled ? 'line-through opacity-70' : ''}">${esc(a.doctor.name)}</h2><span class="badge ${cls}" data-status>${esc(label)}</span></div>
          <p class="text-body-sm font-semibold text-primary">${esc(a.doctor.specialty)}</p>
          <p class="mt-1 text-body-sm text-on-surface-variant">${esc(a.doctor.place || '')}${a.doctor.district ? `, ${esc(a.doctor.district)}` : ''}</p>
          <p class="mt-1 text-body-md"><span class="font-semibold">${esc(['Today', 'Tomorrow'].includes(dayWord(a.date)) ? dayWord(a.date) : fmtDate(a.date))}</span>, ${esc(when)}${a.mode === 'COUNT' && a.token_number ? ` &middot; number #${a.token_number}` : ''}</p>
          <p class="text-body-sm text-on-surface-variant">${esc(a.treatment_name || '')} &middot; ${esc(money(a.fee_amount))} &middot; ${esc(paymentLabel(a.payment_type, a.payment_status))}</p>
          ${a.status === 'BOOKED' ? `<p class="mt-1 text-body-sm ${a.can_cancel ? 'text-on-surface-variant' : 'text-secondary'}" data-cancel-note>${esc(cancelNote(a))}</p>` : ''}
          ${cancelled ? `<p class="mt-1 text-body-sm text-on-surface-variant" data-cancelled-line>${esc(cancelledLine(a))}</p>` : ''}
          <p class="mt-1 text-body-sm text-outline">Booking ID <span class="font-mono font-semibold text-on-surface-variant">${esc(a.booking_code)}</span></p>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2 sm:w-40 sm:flex-col">
        <a href="/frontend/patient/booking.html?code=${esc(a.booking_code)}" class="btn-outline btn-sm flex-1 sm:flex-none">View</a>
        <a href="/api/appointments/${esc(a.booking_code)}/invoice?download=1" class="btn-primary btn-sm flex-1 sm:flex-none" data-invoice><span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>Invoice</a>
        ${a.can_cancel ? `<button type="button" data-cancel="${esc(a.booking_code)}" class="btn-outline btn-sm flex-1 text-error sm:flex-none">Cancel booking</button>` : ''}
      </div>
    </article>`;
}

async function load() {
  list.setAttribute('aria-busy', 'true');
  list.innerHTML = '<div class="h-32 animate-pulse rounded-2xl bg-surface-container"></div><div class="h-32 animate-pulse rounded-2xl bg-surface-container"></div>';
  qsa('[data-scope]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.scope === state.scope)));
  try {
    const d = await api.get(`/api/appointments?scope=${state.scope}&page=${state.page}&per_page=8`);
    state.page = d.page;
    items = d.items;
    list.innerHTML = d.items.length
      ? d.items.map(card).join('')
      : `<div class="card p-8 text-center"><span class="material-symbols-outlined text-4xl text-outline" aria-hidden="true">${state.scope === 'upcoming' ? 'event_available' : 'history'}</span>
          <h2 class="mt-2 font-display text-headline-sm">${state.scope === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}</h2>
          <p class="mt-1 text-body-md text-on-surface-variant">${state.scope === 'upcoming' ? 'Find a doctor and book your next visit.' : 'Your finished and cancelled bookings will show up here.'}</p>
          ${state.scope === 'upcoming' ? '<a href="/frontend/patient/doctors.html" class="btn-primary mt-4">Find doctors</a>' : ''}</div>`;
    pager.hidden = d.pages <= 1;
    if (d.pages > 1) {
      pager.innerHTML = `
        <button type="button" data-page="${d.page - 1}" class="btn-outline btn-sm" ${d.page <= 1 ? 'disabled' : ''}><span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>Previous</button>
        <span class="text-body-md text-on-surface-variant">Page ${d.page} of ${d.pages}</span>
        <button type="button" data-page="${d.page + 1}" class="btn-outline btn-sm" ${d.page >= d.pages ? 'disabled' : ''}>Next<span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span></button>`;
    }
  } catch (e) {
    list.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load your appointments. Please refresh.')}</p>`;
    pager.hidden = true;
  } finally {
    list.setAttribute('aria-busy', 'false');
  }
}

qsa('[data-scope]').forEach((t) => t.addEventListener('click', () => { state.scope = t.dataset.scope; state.page = 1; history.replaceState(null, '', state.scope === 'past' ? '?scope=past' : location.pathname); load(); }));
list.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cancel]');
  if (!b) return;
  const a = items.find((x) => x.booking_code === b.dataset.cancel);
  if (a) openCancelModal(a, () => load());
});

pager.addEventListener('click', (e) => {
  const b = e.target.closest('[data-page]');
  if (!b || b.disabled) return;
  state.page = Number(b.dataset.page);
  load();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

await load();
