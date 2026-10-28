// Doctor schedule and fees: weekly working hours (per-day count or time slots), booking window, upcoming days, fees.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage, ROLE_HOME } from '/frontend/shared/layout.js';
import { esc, qs, qsa, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { openModal, confirmDialog } from '/frontend/shared/modal.js';
import { toast } from '/frontend/shared/toast.js';

const user = await initPage({ roles: ['DOCTOR'] });
if (user.doctor_status !== 'APPROVED') {
  location.replace(ROLE_HOME.DOCTOR);
  await new Promise(() => {});
}

const main = qs('#app-main');
const DAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']];
const SLOT_CHOICES = [5, 10, 15, 20, 30, 45, 60];
const ADVANCE_CHOICES = [7, 14, 21, 30, 45, 60];

const state = {
  tab: location.hash === '#fees' ? 'fees' : 'hours',
  windows: [],
  advance: 14,
  days: [],
  fees: [],
};

// ---- small helpers ----------------------------------------------------------
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const slotCount = (w) => Math.floor((toMin(w.end) - toMin(w.start)) / w.slot_minutes);
const dayName = (n) => DAYS.find(([d]) => d === n)[1];
const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const money = (v) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: v.endsWith('.00') ? 0 : 2, maximumFractionDigits: 2 })}`;
const fmtWhen = (dt) => new Date(dt.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function windowSummary(w) {
  return w.mode === 'SLOTS'
    ? `${slotCount(w)} slots of ${w.slot_minutes} min`
    : `${w.max_patients} patient${w.max_patients === 1 ? '' : 's'} a day`;
}

function showError(err, fallback = 'Something went wrong. Please try again.') {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

function applySchedule(s) {
  state.windows = s.windows;
  state.advance = s.advance_booking_days;
  state.days = s.days;
}

// ---- rendering --------------------------------------------------------------
function render() {
  main.innerHTML = `
    <section class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">Schedule and fees</h1>
      <p class="mt-1 text-body-md text-on-surface-variant">Set when patients can book you and what each visit costs.</p>
      <div class="seg-tabs mt-6 grid-cols-2 sm:max-w-sm" role="tablist" aria-label="Schedule or fees">
        <button type="button" role="tab" data-tab="hours" aria-selected="${state.tab === 'hours'}" class="seg-tab"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">calendar_month</span>Working hours</button>
        <button type="button" role="tab" data-tab="fees" aria-selected="${state.tab === 'fees'}" class="seg-tab"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">payments</span>Fees</button>
      </div>
      <div id="panel" class="mt-6 space-y-6">${state.tab === 'hours' ? hoursPanel() : feesPanel()}</div>
    </section>`;
}

function hoursPanel() {
  const byDay = (n) => state.windows.map((w, i) => ({ w, i })).filter(({ w }) => w.weekday === n);
  const empty = state.windows.length === 0;
  return `
    ${empty ? `<div class="flex items-start gap-3 rounded-2xl bg-secondary-fixed px-5 py-4 text-on-secondary-container">
      <span class="material-symbols-outlined mt-0.5" aria-hidden="true">info</span>
      <p class="text-body-md">You have no working hours yet, so patients cannot book you. Add your first hours below.</p></div>` : ''}

    <div class="card p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-display text-headline-sm">Weekly working hours</h2>
        <button type="button" data-action="add-window" class="btn-primary btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>Add working hours</button>
      </div>
      <ul class="divide-y divide-outline-variant">
        ${DAYS.map(([n, name]) => `
          <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span class="w-28 shrink-0 font-display text-label-lg ${byDay(n).length ? '' : 'text-outline'}">${name}</span>
            <div class="flex flex-1 flex-wrap items-center gap-2">
              ${byDay(n).length
                ? byDay(n).map(({ w, i }) => `
                  <button type="button" data-action="edit-window" data-index="${i}" class="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-body-sm hover:bg-surface-container-high" aria-label="Edit ${name} ${w.start} to ${w.end}">
                    <span class="font-display font-semibold">${w.start}&ndash;${w.end}</span>
                    <span class="text-on-surface-variant">${esc(windowSummary(w))}</span>
                    <span class="material-symbols-outlined text-[16px] text-outline" aria-hidden="true">edit</span>
                  </button>`).join('')
                : '<span class="text-body-sm text-outline">Not working</span>'}
            </div>
          </li>`).join('')}
      </ul>
    </div>

    <div class="card p-6">
      <h2 class="font-display text-headline-sm">How far ahead can patients book?</h2>
      <p class="mt-1 text-body-sm text-on-surface-variant">Your hours are published as bookable days up to this many days from today.</p>
      <div data-field class="mt-4 max-w-xs">
        <label for="advance" class="field-label">Days ahead</label>
        <select id="advance" class="field-input">${ADVANCE_CHOICES.concat(ADVANCE_CHOICES.includes(state.advance) ? [] : [state.advance]).sort((a, b) => a - b).map((d) => `<option value="${d}" ${d === state.advance ? 'selected' : ''}>${d} days</option>`).join('')}</select>
      </div>
    </div>

    <div class="card p-6">
      <h2 class="font-display text-headline-sm">Upcoming days</h2>
      <p class="mt-1 text-body-sm text-on-surface-variant">Close a day when you are on leave. A day that already has bookings cannot be closed.</p>
      ${state.days.length ? `<ul class="mt-4 divide-y divide-outline-variant">${state.days.map(dayRow).join('')}</ul>`
        : '<p class="mt-4 text-body-md text-outline">No bookable days yet.</p>'}
    </div>`;
}

function dayRow(d) {
  const total = d.windows.reduce((s, w) => s + w.max_patients, 0);
  const closed = d.is_closed;
  return `
    <li class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div class="w-32 shrink-0"><p class="font-display text-label-lg">${esc(fmtDate(d.date))}</p>
        <p class="text-body-sm text-on-surface-variant">${d.booked} of ${total} booked</p></div>
      <div class="flex flex-1 flex-wrap gap-2">
        ${d.windows.map((w) => `<span class="rounded-full bg-surface-container px-3 py-1 text-body-sm ${closed ? 'line-through opacity-60' : ''}">${w.start}&ndash;${w.end} &middot; ${esc(windowSummary(w))}</span>`).join('')}
      </div>
      <div class="flex items-center gap-2">
        <span class="badge ${closed ? 'badge-danger' : 'badge-success'}">${closed ? 'Closed' : 'Open'}</span>
        ${closed
          ? `<button type="button" data-action="open-day" data-date="${d.date}" class="btn-outline btn-sm">Reopen</button>`
          : `<button type="button" data-action="close-day" data-date="${d.date}" class="btn-outline btn-sm" ${d.booked > 0 ? 'disabled title="Patients have booked this day"' : ''}>Close</button>`}
      </div>
    </li>`;
}

function feesPanel() {
  const active = state.fees.filter((f) => f.is_active).length;
  return `
    ${active === 0 ? `<div class="flex items-start gap-3 rounded-2xl bg-secondary-fixed px-5 py-4 text-on-secondary-container">
      <span class="material-symbols-outlined mt-0.5" aria-hidden="true">info</span>
      <p class="text-body-md">You have no active fee, so patients cannot book you. Add at least one (for example "Consultation").</p></div>` : ''}
    <div class="card p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-display text-headline-sm">Fees by treatment</h2>
        <button type="button" data-action="add-fee" class="btn-primary btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>Add fee</button>
      </div>
      <p class="mb-4 text-body-sm text-on-surface-variant">Patients pick one of your active treatments when they book. Hide a fee to stop offering it.</p>
      ${state.fees.length ? `<ul class="divide-y divide-outline-variant">${state.fees.map(feeRow).join('')}</ul>` : '<p class="text-body-md text-outline">No fees yet.</p>'}
    </div>`;
}

function updatedBy(f) {
  const who = f.updated_by.role === 'DOCTOR' ? 'you' : `${f.updated_by.name || 'your hospital'} (Hospital Admin)`;
  return `Last updated by ${who} on ${fmtWhen(f.updated_at)}`;
}

function feeRow(f) {
  return `
    <li class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div class="min-w-0 flex-1">
        <p class="font-display text-label-lg ${f.is_active ? '' : 'text-outline'}">${esc(f.treatment_name)}</p>
        <p class="text-body-sm text-on-surface-variant">${esc(updatedBy(f))}</p>
      </div>
      <p class="font-display text-headline-sm ${f.is_active ? '' : 'text-outline line-through'}">${esc(money(f.fee))}</p>
      <div class="flex items-center gap-2">
        <span class="badge ${f.is_active ? 'badge-success' : ''}">${f.is_active ? 'Active' : 'Hidden'}</span>
        <button type="button" data-action="edit-fee" data-id="${f.id}" class="btn-outline btn-sm" aria-label="Edit ${esc(f.treatment_name)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span></button>
        <button type="button" data-action="toggle-fee" data-id="${f.id}" class="btn-outline btn-sm">${f.is_active ? 'Hide' : 'Show'}</button>
        <button type="button" data-action="delete-fee" data-id="${f.id}" class="btn-outline btn-sm text-error" aria-label="Delete ${esc(f.treatment_name)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span></button>
      </div>
    </li>`;
}

// ---- weekly hours ------------------------------------------------------------
async function saveWeekly(windows, advance = state.advance) {
  const data = await api.post('/api/doctors/me/schedule/weekly', {
    advance_booking_days: advance,
    windows: windows.map(({ weekday, start, end, mode, max_patients, slot_minutes }) => ({ weekday, start, end, mode, max_patients, slot_minutes })),
  });
  applySchedule(data.schedule);
  const kept = data.summary.kept_with_bookings;
  toast.success(kept > 0 ? `Saved. ${kept} booked window${kept === 1 ? '' : 's'} kept as they were.` : 'Schedule saved.');
  render();
}

function openWindowModal(index = null) {
  const editing = index !== null;
  const w = editing ? state.windows[index] : { weekday: null, start: '17:00', end: '20:00', mode: 'COUNT', max_patients: 20, slot_minutes: 15 };
  openModal({
    title: editing ? `Edit ${dayName(w.weekday)} hours` : 'Add working hours',
    size: 'max-w-xl',
    html: `<form id="window-form" class="space-y-5" novalidate>
      <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      ${editing ? '' : `<fieldset data-field>
        <legend class="field-label">Days</legend>
        <div class="flex flex-wrap gap-2" id="day-picks">
          ${DAYS.map(([n, name]) => `<label class="cursor-pointer"><input type="checkbox" name="weekday" value="${n}" class="peer sr-only"><span class="inline-block rounded-full border border-outline-variant px-3 py-1.5 font-display text-label-md peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:text-on-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">${name.slice(0, 3)}</span></label>`).join('')}
        </div>
      </fieldset>`}
      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field><label for="start" class="field-label">From</label><input id="start" name="start" type="time" class="field-input" value="${w.start}" required></div>
        <div data-field><label for="end" class="field-label">To</label><input id="end" name="end" type="time" class="field-input" value="${w.end}" required></div>
      </div>
      <fieldset data-field>
        <legend class="field-label">How do patients book?</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="cursor-pointer"><input type="radio" name="mode" value="COUNT" class="peer sr-only" ${w.mode === 'COUNT' ? 'checked' : ''}>
            <span class="block h-full rounded-xl border border-outline-variant p-4 peer-checked:border-primary-container peer-checked:bg-primary-fixed/40 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              <span class="block font-display text-label-lg">Patients per day</span>
              <span class="mt-1 block text-body-sm text-on-surface-variant">Each patient gets a serial number. Good for busy chambers.</span></span></label>
          <label class="cursor-pointer"><input type="radio" name="mode" value="SLOTS" class="peer sr-only" ${w.mode === 'SLOTS' ? 'checked' : ''}>
            <span class="block h-full rounded-xl border border-outline-variant p-4 peer-checked:border-primary-container peer-checked:bg-primary-fixed/40 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              <span class="block font-display text-label-lg">Time slots</span>
              <span class="mt-1 block text-body-sm text-on-surface-variant">Fixed-length slots, one patient per slot, like 17:00, 17:15...</span></span></label>
        </div>
      </fieldset>
      <div id="count-fields" data-field>
        <label for="max_patients" class="field-label">Maximum patients per day</label>
        <input id="max_patients" name="max_patients" type="number" min="1" max="500" step="1" inputmode="numeric" class="field-input" value="${w.max_patients}">
        <p class="mt-1 text-body-sm text-on-surface-variant">When this many have booked, the day shows as full.</p>
      </div>
      <div id="slot-fields" data-field>
        <label for="slot_minutes" class="field-label">Length of each slot</label>
        <select id="slot_minutes" name="slot_minutes" class="field-input">${SLOT_CHOICES.map((m) => `<option value="${m}" ${m === (w.slot_minutes || 15) ? 'selected' : ''}>${m} minutes</option>`).join('')}</select>
        <p id="slot-summary" class="mt-1 text-body-sm text-on-surface-variant"></p>
      </div>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        ${editing ? '<button type="button" id="delete-window" class="btn-outline text-error"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>Remove these hours</button>' : '<span></span>'}
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" data-cancel class="btn-outline">Cancel</button>
          <button type="submit" id="save" class="btn-accent">${editing ? 'Save changes' : 'Add hours'}</button>
        </div>
      </div>
    </form>`,
    onMount: (body, close) => {
      const form = qs('#window-form', body);
      const f = form.elements;
      const alertBox = qs('#form-alert', body);
      const sync = () => {
        const slots = f.mode.value === 'SLOTS';
        qs('#count-fields', body).hidden = slots;
        qs('#slot-fields', body).hidden = !slots;
        if (slots && f.start.value && f.end.value && toMin(f.end.value) > toMin(f.start.value)) {
          const n = Math.floor((toMin(f.end.value) - toMin(f.start.value)) / Number(f.slot_minutes.value));
          qs('#slot-summary', body).textContent = n >= 1 ? `That makes ${n} slot${n === 1 ? '' : 's'} per day.` : 'The hours are shorter than one slot.';
        } else {
          qs('#slot-summary', body).textContent = '';
        }
      };
      form.addEventListener('input', sync);
      form.addEventListener('change', sync);
      sync();
      qs('[data-cancel]', body).addEventListener('click', close);

      const del = qs('#delete-window', body);
      if (del) {
        del.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: 'Remove these hours?', message: `Future days without bookings will be removed from your schedule. Days that already have bookings are kept.`, confirmText: 'Remove', danger: true }))) return;
          try {
            await saveWeekly(state.windows.filter((_, i) => i !== index));
            close();
          } catch (err) { showError(err); }
        });
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        alertBox.hidden = true;
        const days = editing ? [w.weekday] : qsa('input[name=weekday]:checked', form).map((c) => Number(c.value));
        if (!days.length) { alertBox.textContent = 'Choose at least one day.'; alertBox.hidden = false; return; }
        if (!f.start.value || !f.end.value) { showFieldErrors(form, { [f.start.value ? 'end' : 'start']: 'Enter a time.' }); return; }
        const mode = f.mode.value;
        const entry = {
          start: f.start.value,
          end: f.end.value,
          mode,
          max_patients: mode === 'COUNT' ? parseInt(f.max_patients.value, 10) : 0,
          slot_minutes: mode === 'SLOTS' ? parseInt(f.slot_minutes.value, 10) : null,
        };
        if (mode === 'COUNT' && !(entry.max_patients >= 1)) { showFieldErrors(form, { max_patients: 'Enter how many patients you can see.' }); return; }
        const next = editing
          ? state.windows.map((x, i) => (i === index ? { ...x, ...entry } : x))
          : [...state.windows, ...days.map((weekday) => ({ weekday, ...entry }))];
        await withBusy(qs('#save', body), async () => {
          try {
            await saveWeekly(next);
            close();
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            alertBox.textContent = (err.details && err.details.windows) || err.message;
            alertBox.hidden = false;
          }
        });
      });
    },
  });
}

// ---- fees --------------------------------------------------------------------
function openFeeModal(fee = null) {
  openModal({
    title: fee ? 'Edit fee' : 'Add fee',
    html: `<form id="fee-form" class="space-y-5" novalidate>
      <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      <div data-field>
        <label for="treatment_name" class="field-label">Treatment</label>
        <input id="treatment_name" name="treatment_name" type="text" maxlength="150" class="field-input" placeholder="e.g. Consultation, Follow-up visit" required>
      </div>
      <div data-field>
        <label for="fee" class="field-label">Fee (&#8377;)</label>
        <input id="fee" name="fee" type="text" inputmode="decimal" class="field-input" placeholder="500" required>
      </div>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-cancel class="btn-outline">Cancel</button>
        <button type="submit" id="save" class="btn-accent">${fee ? 'Save fee' : 'Add fee'}</button>
      </div>
    </form>`,
    onMount: (body, close) => {
      const form = qs('#fee-form', body);
      const f = form.elements;
      if (fee) { f.treatment_name.value = fee.treatment_name; f.fee.value = fee.fee.replace(/\.00$/, ''); }
      qs('[data-cancel]', body).addEventListener('click', close);
      f.treatment_name.focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const alertBox = qs('#form-alert', body);
        alertBox.hidden = true;
        const payload = { treatment_name: f.treatment_name.value.trim(), fee: f.fee.value.trim() };
        const errors = {};
        if (payload.treatment_name.length < 2) errors.treatment_name = 'Enter the treatment name.';
        if (!/^\d{1,6}(\.\d{1,2})?$/.test(payload.fee)) errors.fee = 'Enter an amount like 500 or 500.50.';
        if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
        await withBusy(qs('#save', body), async () => {
          try {
            const data = fee ? await api.post(`/api/doctors/me/fees/${fee.id}`, payload) : await api.post('/api/doctors/me/fees', payload);
            state.fees = data.fees;
            close();
            toast.success(fee ? 'Fee updated.' : 'Fee added.');
            render();
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            if (err.details && showFieldErrors(form, err.details)) return;
            alertBox.textContent = err.message; alertBox.hidden = false;
          }
        });
      });
    },
  });
}

// ---- events ------------------------------------------------------------------
main.addEventListener('change', async (e) => {
  if (e.target.id !== 'advance') return;
  const value = parseInt(e.target.value, 10);
  try {
    await saveWeekly(state.windows, value);
  } catch (err) {
    showError(err);
    render();
  }
});

main.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    history.replaceState(null, '', state.tab === 'fees' ? '#fees' : location.pathname);
    render();
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const { action } = btn.dataset;
  const fee = state.fees.find((f) => String(f.id) === btn.dataset.id);

  try {
    if (action === 'add-window') openWindowModal();
    else if (action === 'edit-window') openWindowModal(Number(btn.dataset.index));
    else if (action === 'add-fee') openFeeModal();
    else if (action === 'edit-fee') openFeeModal(fee);
    else if (action === 'toggle-fee') {
      const data = await api.post(`/api/doctors/me/fees/${fee.id}`, { is_active: !fee.is_active });
      state.fees = data.fees;
      toast.success(fee.is_active ? 'Fee hidden from patients.' : 'Fee is visible to patients again.');
      render();
    } else if (action === 'delete-fee') {
      if (!(await confirmDialog({ title: `Delete "${fee.treatment_name}"?`, message: 'Patients will no longer see it. Past bookings keep their original amount.', confirmText: 'Delete', danger: true }))) return;
      state.fees = (await api.delete(`/api/doctors/me/fees/${fee.id}`)).fees;
      toast.success('Fee deleted.');
      render();
    } else if (action === 'close-day') {
      const date = btn.dataset.date;
      if (!(await confirmDialog({ title: `Close ${fmtDate(date)}?`, message: 'Patients will not be able to book this day.', confirmText: 'Close day' }))) return;
      applySchedule((await api.post(`/api/doctors/me/schedule/dates/${date}/close`)).schedule);
      toast.success('Day closed.');
      render();
    } else if (action === 'open-day') {
      applySchedule((await api.post(`/api/doctors/me/schedule/dates/${btn.dataset.date}/open`)).schedule);
      toast.success('Day reopened.');
      render();
    }
  } catch (err) {
    showError(err);
    if (err instanceof ApiError && err.code === 'HAS_BOOKINGS') {
      try { applySchedule(await api.get('/api/doctors/me/schedule')); render(); } catch { /* keep the screen as it is */ }
    }
  }
});

try {
  const [schedule, fees] = await Promise.all([api.get('/api/doctors/me/schedule'), api.get('/api/doctors/me/fees')]);
  applySchedule(schedule);
  state.fees = fees.fees;
  render();
} catch (e) {
  main.innerHTML = `<p class="m-6 rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load your schedule. Please refresh.')}</p>`;
}
