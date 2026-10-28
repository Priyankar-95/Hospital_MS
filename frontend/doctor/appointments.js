// Doctor appointments: one day's bookings, mark paid / completed / no-show, cancel, daily PDF.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs, withBusy } from '/frontend/shared/dom.js';
import { openModal, confirmDialog } from '/frontend/shared/modal.js';
import { toast } from '/frontend/shared/toast.js';
import { money, time12, fmtDate, dayWord, todayIso, paymentLabel } from '/frontend/patient/common.js';

await initPage({ roles: ['DOCTOR'] });

const list = qs('#list');
const isoOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const param = new URLSearchParams(location.search).get('date');
let date = isoOk(param) ? param : todayIso();
let data = null;

const STATUS = {
  BOOKED: ['badge-success', 'Booked'],
  CANCELLED: ['badge-danger', 'Cancelled'],
  COMPLETED: ['badge-info', 'Completed'],
  NO_SHOW: ['badge-warning', 'No-show'],
};

const shift = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function card(a) {
  const [cls, label] = STATUS[a.status] || ['', a.status];
  const cancelled = a.status === 'CANCELLED';
  const when = a.mode === 'SLOTS' ? time12(a.time) : `Number #${a.token_number}`;
  const sub = a.mode === 'SLOTS' ? '' : `${time12(a.window.start)} – ${time12(a.window.end)}`;
  const btn = (act, text, icon, extra = '') => `<button type="button" data-act="${act}" data-code="${esc(a.booking_code)}" class="btn-outline btn-sm ${extra}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">${icon}</span>${text}</button>`;
  const actions = [
    a.can_mark_paid ? `<button type="button" data-act="paid" data-code="${esc(a.booking_code)}" class="btn-primary btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">payments</span>Mark paid</button>` : '',
    a.can_unmark_paid ? btn('unpaid', 'Undo paid', 'undo') : '',
    a.can_complete ? btn('complete', 'Completed', 'check_circle') : '',
    a.can_no_show ? btn('no-show', 'No-show', 'person_off') : '',
    a.can_reopen ? btn('reopen', 'Reopen', 'restart_alt') : '',
    a.can_cancel ? btn('cancel', 'Cancel', 'event_busy', 'text-error') : '',
  ].join('');
  return `
    <article class="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start" data-booking="${esc(a.booking_code)}">
      <div class="w-full shrink-0 sm:w-28">
        <p class="font-display text-headline-sm ${cancelled ? 'line-through opacity-70' : ''}">${esc(when)}</p>
        ${sub ? `<p class="text-body-sm text-on-surface-variant">${esc(sub)}</p>` : ''}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-display text-headline-sm ${cancelled ? 'line-through opacity-70' : ''}">${esc(a.patient.name)}</h2>
          <span class="badge ${cls}" data-status>${esc(label)}</span>
        </div>
        <p class="mt-1 text-body-sm text-on-surface-variant">${a.patient.phone ? esc(a.patient.phone) + ' &middot; ' : ''}${esc(a.patient.email)}</p>
        <p class="mt-1 text-body-md">${esc(a.treatment_name || 'Consultation')} &middot; ${esc(money(a.fee_amount))} &middot; <span data-payment>${esc(paymentLabel(a.payment_type, a.payment_status))}</span></p>
        ${cancelled ? `<p class="mt-1 text-body-sm text-on-surface-variant">Cancelled by ${a.cancellation.by === 'PATIENT' ? 'the patient' : 'you'}${a.cancellation.reason ? `: ${esc(a.cancellation.reason)}` : ''}</p>` : ''}
        <p class="mt-1 text-body-sm text-outline">Booking ID <span class="font-mono font-semibold text-on-surface-variant">${esc(a.booking_code)}</span></p>
      </div>
      ${actions ? `<div class="flex flex-wrap gap-2 sm:w-44 sm:flex-col">${actions}</div>` : ''}
    </article>`;
}

function renderStrip() {
  qs('#strip').innerHTML = data.days.map((d) => {
    const dt = new Date(`${d.date}T00:00:00`);
    const sel = d.date === date;
    return `<button type="button" data-day="${d.date}" aria-pressed="${sel}" class="shrink-0 rounded-xl border px-3 py-2 text-center ${sel ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface'}">
      <span class="block text-label-md uppercase">${esc(dt.toLocaleDateString('en-IN', { weekday: 'short' }))}</span>
      <span class="block font-display text-headline-sm leading-tight">${dt.getDate()}</span>
      <span class="block text-body-sm">${d.active ? `${d.active} booked` : '–'}</span></button>`;
  }).join('');
}

function renderSummary() {
  const s = data.summary;
  const tile = (label, value, key) => `<div class="card p-4"><p class="text-body-sm text-on-surface-variant">${label}</p><p class="font-display text-headline-sm" data-sum="${key}">${esc(value)}</p></div>`;
  qs('#summary').innerHTML = tile('Bookings', s.total - s.cancelled, 'bookings') + tile('Expected', money(s.expected), 'expected') + tile('Collected', money(s.collected), 'collected') + tile('To collect', money(s.pending), 'pending');
  const note = qs('#note');
  note.hidden = data.doctor_type === 'PRIVATE';
  note.innerHTML = '<p class="rounded-xl bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">Payments for hospital doctors are marked by the hospital front desk. You can see the status here.</p>';
}

function render() {
  const word = dayWord(date);
  qs('#day-title').textContent = `${['Today', 'Tomorrow'].includes(word) ? word + ', ' : ''}${fmtDate(date)}`;
  qs('#day-input').value = date;
  qs('#pdf-link').href = `/api/doctors/me/appointments/daily-pdf?date=${date}&download=1`;
  renderStrip();
  renderSummary();
  list.innerHTML = data.appointments.length
    ? data.appointments.map(card).join('')
    : `<div class="card p-8 text-center"><span class="material-symbols-outlined text-4xl text-outline" aria-hidden="true">event_available</span>
        <h2 class="mt-2 font-display text-headline-sm">No bookings on this day</h2>
        <p class="mt-1 text-body-md text-on-surface-variant">New bookings will appear here as patients make them.</p></div>`;
}

async function load() {
  list.setAttribute('aria-busy', 'true');
  try {
    data = await api.get(`/api/doctors/me/appointments?date=${date}`);
    history.replaceState(null, '', date === todayIso() ? location.pathname : `?date=${date}`);
    render();
  } catch (e) {
    list.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load appointments. Please refresh.')}</p>`;
  } finally {
    list.setAttribute('aria-busy', 'false');
  }
}

function openCancel(a) {
  openModal({
    title: 'Cancel this booking?',
    size: 'max-w-lg',
    html: `<form id="cancel-form" class="space-y-4" novalidate>
      <div id="cancel-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      <p class="text-body-md">${esc(a.patient.name)}<br><span class="text-on-surface-variant">${esc(a.mode === 'SLOTS' ? time12(a.time) : `Number #${a.token_number}`)} &middot; ${esc(a.booking_code)}</span></p>
      <p class="rounded-xl bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">${a.payment_type === 'ONLINE' && a.payment_status === 'PAID' ? 'The online payment will be refunded to the patient in full.' : 'No payment was taken, so there is nothing to refund.'} The patient will be emailed with your reason.</p>
      <div data-field>
        <label for="cancel-reason" class="field-label">Reason</label>
        <textarea id="cancel-reason" name="reason" rows="3" maxlength="300" class="field-input" placeholder="For example: emergency, I am unwell"></textarea>
        <p class="field-error" hidden></p>
      </div>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-keep class="btn-outline">Keep booking</button>
        <button type="submit" id="cancel-confirm" class="btn-danger">Cancel booking</button>
      </div>
    </form>`,
    onMount: (body, close) => {
      const form = qs('#cancel-form', body);
      const alertBox = qs('#cancel-alert', body);
      qs('[data-keep]', body).addEventListener('click', close);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.hidden = true;
        await withBusy(qs('#cancel-confirm', body), async () => {
          try {
            await api.post(`/api/doctors/me/appointments/${encodeURIComponent(a.booking_code)}/cancel`, { reason: form.elements.reason.value.trim() });
            close();
            toast.success('Booking cancelled. The patient has been told.');
            load();
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            alertBox.textContent = (err.details && err.details.reason) || err.message;
            alertBox.hidden = false;
            if (['ALREADY_CANCELLED', 'NOT_CANCELLABLE', 'NOT_FOUND'].includes(err.code)) setTimeout(() => { close(); load(); }, 2500);
          }
        });
      });
    },
  });
}

const DONE = { paid: 'Marked as paid.', unpaid: 'Payment mark removed.', complete: 'Marked as completed.', 'no-show': 'Marked as no-show.', reopen: 'Booking reopened.' };

list.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = data.appointments.find((x) => x.booking_code === b.dataset.code);
  if (!a) return;
  const act = b.dataset.act;
  if (act === 'cancel') return openCancel(a);
  if (act === 'paid' && !(await confirmDialog({ title: 'Mark as paid?', message: `${a.patient.name} paid ${money(a.fee_amount)} at the visit.`, confirmText: 'Mark paid' }))) return;
  if (act === 'no-show' && !(await confirmDialog({ title: 'Mark as no-show?', message: `${a.patient.name} did not come for this appointment.`, confirmText: 'Mark no-show' }))) return;
  await withBusy(b, async () => {
    try {
      await api.post(`/api/doctors/me/appointments/${encodeURIComponent(a.booking_code)}/${act}`, {});
      toast.success(DONE[act]);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      toast.error(err.message);
    }
    await load();
  });
});

qs('#strip').addEventListener('click', (e) => { const d = e.target.closest('[data-day]'); if (d) { date = d.dataset.day; load(); } });
qs('#prev-day').addEventListener('click', () => { date = shift(date, -1); load(); });
qs('#next-day').addEventListener('click', () => { date = shift(date, 1); load(); });
qs('#today-btn').addEventListener('click', () => { date = todayIso(); load(); });
qs('#day-input').addEventListener('change', (e) => { if (isoOk(e.target.value)) { date = e.target.value; load(); } });

await load();
