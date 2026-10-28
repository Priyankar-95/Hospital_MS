// Doctor profile with the date strip and slot picker. Full days and taken slots are shown but cannot be chosen.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs, qsa } from '/frontend/shared/dom.js';
import { avatar, typeBadge, money, time12, fmtDate, dayWord } from './common.js';

await initPage({ requireLogin: true });
const page = qs('#page');
const id = new URLSearchParams(location.search).get('id') || '';

const state = {
  doctor: null,
  days: [],
  date: null,
  windows: [],
  pick: null,       // { schedule_id, slot_time|null, start, end, mode, serial? }
  feeId: null,
};

function notFound(message = 'Doctor not found') {
  page.setAttribute('aria-busy', 'false');
  page.innerHTML = `<div class="card p-8 text-center"><span class="material-symbols-outlined text-4xl text-outline" aria-hidden="true">person_off</span>
    <h1 class="mt-2 font-display text-headline-md">${esc(message)}</h1>
    <p class="mt-1 text-body-md text-on-surface-variant">The doctor may no longer be listed.</p>
    <a href="/frontend/patient/doctors.html" class="btn-primary mt-4">Find doctors</a></div>`;
}

const sessionName = (start) => { const h = Number(start.slice(0, 2)); return h < 12 ? 'Morning' : (h < 17 ? 'Afternoon' : 'Evening'); };
const dayStatusText = { FULL: 'Full', CLOSED: 'Closed', ENDED: 'Ended', NOT_WORKING: 'Off' };

// ---- layout ---------------------------------------------------------------------
function renderShell() {
  const d = state.doctor;
  document.title = `${d.name} - Liberty Health Care`;
  page.setAttribute('aria-busy', 'false');
  page.innerHTML = `
    <nav class="mb-3 text-body-sm text-on-surface-variant" aria-label="Breadcrumb"><a href="/frontend/patient/index.html" class="hover:underline">Home</a> <span aria-hidden="true">/</span>
      <a href="/frontend/patient/doctors.html?specialty_id=${d.specialty.id}" class="hover:underline">${esc(d.specialty.name)}</a> <span aria-hidden="true">/</span> <span class="font-semibold text-on-surface">${esc(d.name)}</span></nav>

    <div class="card flex flex-col gap-5 p-6 sm:flex-row">
      ${avatar(d, 'h-28 w-28', 'text-4xl')}
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2"><h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">${esc(d.name)}</h1>${typeBadge(d)}</div>
        <p class="mt-1 text-body-lg text-on-surface-variant">${esc(d.qualifications || '')}</p>
        <p class="mt-1 font-display font-semibold text-primary">${esc(d.specialty.name)}</p>
        <p class="mt-2 flex items-start gap-1.5 text-body-md text-on-surface-variant"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">${d.place.kind === 'HOSPITAL' ? 'local_hospital' : 'storefront'}</span>
          <span><span class="font-semibold text-on-surface">${esc(d.place.name || '')}</span><br>${esc(d.place.address || '')}<br>${esc(d.location.district)}, ${esc(d.location.state)}${d.phone ? `<br>Tel: ${esc(d.phone)}` : ''}</span></p>
      </div>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="min-w-0 space-y-6">
        <section id="book" class="card scroll-mt-24 p-6" aria-labelledby="date-title">
          <h2 id="date-title" class="font-display text-headline-sm">Select date</h2>
          <p class="mt-1 text-body-sm text-on-surface-variant">You can book up to ${d.advance_booking_days} days ahead.</p>
          <div id="dates" class="-mx-2 mt-4 flex gap-2 overflow-x-auto px-2 pb-2" role="listbox" aria-label="Dates"></div>
          <div id="slots" class="mt-6" aria-live="polite"></div>
        </section>

        <section class="card p-6">
          <h2 class="font-display text-headline-sm">About</h2>
          <p class="mt-2 whitespace-pre-line text-body-md ${d.about ? '' : 'text-outline'}">${esc(d.about || 'This doctor has not added an introduction yet.')}</p>
          ${d.facilities ? `<h3 class="mt-6 font-display text-label-lg uppercase tracking-wide text-on-surface-variant">Facilities</h3><p class="mt-1 whitespace-pre-line text-body-md">${esc(d.facilities)}</p>` : ''}
        </section>
      </div>

      <aside class="lg:sticky lg:top-24 lg:self-start" aria-label="Your booking">
        <div class="card space-y-5 p-6">
          <div>
            <h2 class="font-display text-headline-sm">Treatment and fee</h2>
            <div id="fees" class="mt-3 space-y-2"></div>
          </div>
          <div id="summary" class="rounded-xl bg-surface-container-low p-4 text-body-md"></div>
          <button type="button" id="continue" class="btn-accent w-full py-3.5" disabled>Continue to booking <span class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span></button>
          <p class="text-body-sm text-on-surface-variant">You can browse without an account. You log in when you book.</p>
        </div>
      </aside>
    </div>`;
}

// ---- fees -----------------------------------------------------------------------
function renderFees() {
  const box = qs('#fees');
  const fees = state.doctor.fees;
  if (!fees.length) {
    box.innerHTML = '<p class="rounded-xl bg-secondary-fixed px-4 py-3 text-body-md text-on-secondary-container">This doctor has not set a fee yet, so booking is not open.</p>';
    return;
  }
  box.innerHTML = fees.map((f) => `
    <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 ${f.id === state.feeId ? 'border-primary-container bg-primary-fixed/30' : 'border-outline-variant hover:bg-surface-container-low'}">
      <span class="flex items-center gap-3"><input type="radio" name="fee" value="${f.id}" class="h-4 w-4 accent-primary-container" ${f.id === state.feeId ? 'checked' : ''}><span class="text-body-md">${esc(f.treatment_name)}</span></span>
      <span class="font-display font-semibold">${esc(money(f.fee))}</span>
    </label>`).join('');
}

// ---- date strip -----------------------------------------------------------------
function renderDates() {
  qs('#dates').innerHTML = state.days.map((d) => {
    const ok = d.status === 'AVAILABLE';
    const sel = d.date === state.date;
    const dt = new Date(`${d.date}T00:00:00`);
    const wk = dt.toLocaleDateString('en-IN', { weekday: 'short' });
    const label = ok ? `${d.remaining} left` : dayStatusText[d.status] || '';
    return `<button type="button" role="option" aria-selected="${sel}" data-date="${d.date}" ${ok ? '' : 'disabled'}
        aria-label="${esc(fmtDate(d.date))}, ${ok ? `${d.remaining} places left` : (dayStatusText[d.status] || '').toLowerCase()}"
        class="flex w-24 shrink-0 flex-col items-center rounded-2xl border px-2 py-3 text-center transition ${sel ? 'border-primary-container bg-primary-container text-on-primary shadow-md' : (ok ? 'border-outline-variant bg-surface-container-lowest hover:border-primary-container' : 'cursor-not-allowed border-transparent bg-surface-container opacity-60')}">
        <span class="text-label-sm uppercase tracking-wide ${sel ? '' : 'text-on-surface-variant'}">${d.date === state.days[0].date ? 'Today' : esc(wk)}</span>
        <span class="font-display text-headline-sm">${dt.getDate()}</span>
        <span class="text-label-sm ${sel ? '' : 'text-on-surface-variant'}">${esc(dt.toLocaleDateString('en-IN', { month: 'short' }))}</span>
        <span class="mt-1 text-label-sm font-semibold ${sel ? '' : (ok ? 'text-primary' : '')}">${esc(label)}</span>
      </button>`;
  }).join('');
  const selected = qs('#dates [aria-selected=true]');
  if (selected) selected.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ---- slots ------------------------------------------------------------------------
function renderSlots() {
  const box = qs('#slots');
  if (!state.date) {
    box.innerHTML = '<p class="rounded-xl bg-surface-container px-4 py-3 text-body-md text-on-surface-variant">This doctor has no open days right now. Please check again later.</p>';
    return;
  }
  box.innerHTML = state.windows.map((w) => {
    const head = `<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-display text-label-lg">${sessionName(w.start)} session <span class="font-normal text-on-surface-variant">${time12(w.start)} – ${time12(w.end)}</span></h3>
        <span class="text-body-sm ${w.status === 'OPEN' ? 'font-semibold text-primary' : 'text-on-surface-variant'}">${w.status === 'OPEN' ? `${w.remaining} left` : ({ FULL: 'Full', CLOSED: 'Closed', ENDED: 'Ended' }[w.status] || '')}</span></div>`;
    if (w.mode === 'COUNT') {
      const picked = state.pick && state.pick.schedule_id === w.schedule_id;
      return `<div class="mb-5">${head}
        <button type="button" data-count="${w.schedule_id}" ${w.status === 'OPEN' ? '' : 'disabled'} aria-pressed="${picked}"
          class="w-full rounded-2xl border px-4 py-4 text-left transition ${picked ? 'border-primary-container bg-primary-container text-on-primary' : (w.status === 'OPEN' ? 'border-outline-variant hover:border-primary-container' : 'cursor-not-allowed border-transparent bg-surface-container opacity-60')}">
          <span class="block font-display text-label-lg">${w.status === 'OPEN' ? `Book a place in this session` : (w.status === 'FULL' ? 'This session is full' : 'Not available')}</span>
          <span class="block text-body-sm ${picked ? '' : 'text-on-surface-variant'}">${w.status === 'OPEN' ? `${w.booked_count} of ${w.max_patients} booked &middot; you would be patient number ${w.next_serial}` : `${w.booked_count} of ${w.max_patients} booked`}</span>
        </button></div>`;
    }
    return `<div class="mb-5">${head}
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5" role="group" aria-label="${sessionName(w.start)} slots">
        ${w.slots.map((s) => {
          const picked = state.pick && state.pick.schedule_id === w.schedule_id && state.pick.slot_time === s.time;
          return `<button type="button" data-slot="${s.time}" data-schedule="${w.schedule_id}" ${s.available ? '' : 'disabled'} aria-pressed="${picked}"
            title="${s.available ? '' : (s.reason === 'TAKEN' ? 'Already booked' : 'Time has passed')}"
            class="rounded-xl border px-2 py-2.5 text-center font-display text-label-md transition ${picked ? 'border-primary-container bg-primary-container text-on-primary shadow-md' : (s.available ? 'border-outline-variant hover:border-primary-container' : 'cursor-not-allowed border-transparent bg-surface-container text-outline line-through')}">${time12(s.time)}</button>`;
        }).join('')}
      </div></div>`;
  }).join('') || '<p class="text-body-md text-on-surface-variant">No sessions on this day.</p>';
}

// ---- summary --------------------------------------------------------------------
function renderSummary() {
  const d = state.doctor;
  const fee = d.fees.find((f) => f.id === state.feeId);
  const p = state.pick;
  const line = (k, v) => `<div class="flex justify-between gap-3 py-1"><dt class="text-on-surface-variant">${esc(k)}</dt><dd class="text-right font-semibold">${v}</dd></div>`;
  qs('#summary').innerHTML = `<dl>
      ${line('Doctor', esc(d.name))}
      ${line('Treatment', fee ? esc(fee.treatment_name) : '<span class="text-outline">Choose one</span>')}
      ${line('Date', p ? esc(['Today', 'Tomorrow'].includes(dayWord(state.date)) ? `${dayWord(state.date)}, ${fmtDate(state.date)}` : fmtDate(state.date)) : '<span class="text-outline">Choose a date</span>')}
      ${line(p && p.mode === 'COUNT' ? 'Session' : 'Time', p ? (p.mode === 'SLOTS' ? esc(time12(p.slot_time)) : `${esc(time12(p.start))} – ${esc(time12(p.end))}`) : '<span class="text-outline">Choose a slot</span>')}
      ${p && p.mode === 'COUNT' ? line('Your number', `#${p.serial}`) : ''}
      <div class="mt-2 flex justify-between border-t border-outline-variant pt-3"><dt class="font-display text-label-lg">Fee</dt><dd class="font-display text-headline-sm">${fee ? esc(money(fee.fee)) : '-'}</dd></div>
    </dl>`;
  qs('#continue').disabled = !(fee && p);
}

// ---- data -----------------------------------------------------------------------
async function loadDate(date) {
  state.date = date;
  state.pick = null;
  renderDates();
  qs('#slots').innerHTML = '<div class="h-24 animate-pulse rounded-xl bg-surface-container"></div>';
  try {
    state.windows = (await api.get(`/api/doctors/${id}/slots?date=${date}`)).windows;
  } catch (e) {
    state.windows = [];
    qs('#slots').innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load the slots.')}</p>`;
    renderSummary();
    return;
  }
  renderSlots();
  renderSummary();
}

// ---- events ---------------------------------------------------------------------
page.addEventListener('click', (e) => {
  const dateBtn = e.target.closest('[data-date]');
  if (dateBtn && !dateBtn.disabled) { loadDate(dateBtn.dataset.date); return; }

  const slot = e.target.closest('[data-slot]');
  if (slot && !slot.disabled) {
    const w = state.windows.find((x) => x.schedule_id === Number(slot.dataset.schedule));
    state.pick = { schedule_id: w.schedule_id, slot_time: slot.dataset.slot, start: w.start, end: w.end, mode: 'SLOTS' };
    renderSlots(); renderSummary();
    return;
  }
  const count = e.target.closest('[data-count]');
  if (count && !count.disabled) {
    const w = state.windows.find((x) => x.schedule_id === Number(count.dataset.count));
    state.pick = { schedule_id: w.schedule_id, slot_time: null, start: w.start, end: w.end, mode: 'COUNT', serial: w.next_serial };
    renderSlots(); renderSummary();
    return;
  }
  if (e.target.closest('#continue')) continueToBooking();
});

page.addEventListener('change', (e) => {
  if (e.target.name !== 'fee') return;
  state.feeId = Number(e.target.value);
  renderFees(); renderSummary();
});

// The choice travels in the address, so it survives logging in (guests are asked to log in on the booking page).
function continueToBooking() {
  const q = new URLSearchParams({
    doctor: state.doctor.id,
    date: state.date,
    schedule: state.pick.schedule_id,
    treatment: state.feeId,
  });
  if (state.pick.slot_time) q.set('slot', state.pick.slot_time);
  location.href = `/frontend/patient/book.html?${q}`;
}

// ---- start ------------------------------------------------------------------------
if (!/^\d+$/.test(id)) {
  notFound();
} else {
  try {
    const [{ doctor }, availability] = await Promise.all([api.get(`/api/doctors/${id}`), api.get(`/api/doctors/${id}/availability`)]);
    state.doctor = doctor;
    state.days = availability.days;
    state.feeId = doctor.fees.length ? doctor.fees[0].id : null;
    renderShell();
    renderFees();
    renderDates();
    const first = state.days.find((d) => d.status === 'AVAILABLE');
    if (first) await loadDate(first.date); else { renderSlots(); renderSummary(); }
    if (location.hash === '#book') qs('#book').scrollIntoView();
  } catch (e) {
    notFound(e instanceof ApiError && e.status === 404 ? 'Doctor not found' : 'Could not load this doctor');
  }
}
