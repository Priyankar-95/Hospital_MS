// Booking page: login gate, summary, payment choice and confirmation.
// The address carries the choice, so it survives logging in:
//   book.html?doctor=ID&date=YYYY-MM-DD&schedule=ID&treatment=ID[&slot=HH:MM]
import { api, ApiError, logout } from '/frontend/shared/api-client.js';
import { initPage, LOGIN_URL } from '/frontend/shared/layout.js';
import { openAuthModal, bindAuthTriggers } from '/frontend/shared/auth-modal.js';
import { esc, qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { avatar, money, time12, fmtDate, dayWord } from './common.js';

const user = await initPage({ navSearch: false });
const page = qs('#page');
page.setAttribute('aria-busy', 'false');

const q = new URLSearchParams(location.search);
const sel = {
  doctor: q.get('doctor') || '',
  date: q.get('date') || '',
  schedule: q.get('schedule') || '',
  treatment: q.get('treatment') || '',
  slot: q.get('slot') || '',
};
const valid = /^\d+$/.test(sel.doctor) && /^\d{4}-\d{2}-\d{2}$/.test(sel.date) && /^\d+$/.test(sel.schedule) && /^\d+$/.test(sel.treatment) && (sel.slot === '' || /^\d{2}:\d{2}$/.test(sel.slot));
const doctorUrl = () => `/frontend/patient/doctor.html?id=${encodeURIComponent(sel.doctor)}#book`;

function card(icon, title, text, actionsHtml = '', tone = 'text-outline') {
  page.innerHTML = `<div class="card mx-auto max-w-xl p-8 text-center">
    <span class="material-symbols-outlined text-4xl ${tone}" aria-hidden="true">${icon}</span>
    <h1 class="mt-2 font-display text-headline-md">${esc(title)}</h1>
    <p class="mt-2 text-body-md text-on-surface-variant">${esc(text)}</p>
    <div class="mt-6 flex flex-col justify-center gap-3 sm:flex-row">${actionsHtml}</div></div>`;
}

const backToDoctor = () => `<a href="${doctorUrl()}" class="btn-primary">Choose another slot</a>`;

// ---- 1. login gate ------------------------------------------------------------------
if (!valid) {
  card('link_off', 'This booking link is not valid', 'Please pick a doctor and a slot again.', '<a href="/frontend/patient/doctors.html" class="btn-primary">Find doctors</a>');
} else if (!user) {
  const here = location.pathname + location.search;
  card('lock', 'Log in to book', 'You can browse without an account, but you need to log in or sign up to book. We will bring you straight back to this booking.',
    `<button type="button" data-auth="login" class="btn-primary">Log in</button><button type="button" data-auth="register" class="btn-outline">Create an account</button>`);
  bindAuthTriggers(page);
  openAuthModal({ mode: 'login', group: 'PATIENT', returnTo: here });
} else if (user.role !== 'PATIENT') {
  card('badge', 'Only patients can book', `You are logged in as a ${user.role.replace(/_/g, ' ').toLowerCase()}. Log out and sign in with a patient account to book an appointment.`,
    '<button type="button" id="switch" class="btn-primary">Log out</button>');
  qs('#switch').addEventListener('click', async () => { await logout(); location.href = `${LOGIN_URL}?return_to=${encodeURIComponent(location.pathname + location.search)}`; });
} else {
  await start();
}

// ---- 2. check the choice is still open -------------------------------------------------
async function start() {
  let doctor; let window_;
  try {
    const [d, slots] = await Promise.all([api.get(`/api/doctors/${sel.doctor}`), api.get(`/api/doctors/${sel.doctor}/slots?date=${sel.date}`)]);
    doctor = d.doctor;
    window_ = slots.windows.find((w) => String(w.schedule_id) === sel.schedule);
  } catch (e) {
    card('person_off', 'We could not open this booking', e instanceof ApiError && e.status === 404 ? 'This doctor is no longer listed.' : 'The date or doctor is not available. Please choose again.', '<a href="/frontend/patient/doctors.html" class="btn-primary">Find doctors</a>');
    return;
  }
  const fee = doctor.fees.find((f) => String(f.id) === sel.treatment);
  if (!fee) { card('payments', 'That treatment is no longer offered', 'Please go back and choose a treatment.', backToDoctor()); return; }
  if (!window_) { card('event_busy', 'That session is not available', 'The doctor has no such session on that day. Please choose another.', backToDoctor()); return; }
  const slotInfo = window_.mode === 'SLOTS' ? (window_.slots || []).find((s) => s.time === sel.slot) : null;
  if (window_.status !== 'OPEN') { card('event_busy', window_.status === 'FULL' ? 'This session is full' : 'This session is not open', 'Please choose another session or day.', backToDoctor()); return; }
  if (window_.mode === 'SLOTS' && !(slotInfo && slotInfo.available)) { card('schedule', 'That slot is no longer free', 'Someone may have just booked it. Please choose another slot.', backToDoctor()); return; }
  render(doctor, window_, fee);
}

// ---- 3. the booking form ----------------------------------------------------------------
function render(doctor, w, fee) {
  const when = ['Today', 'Tomorrow'].includes(dayWord(sel.date)) ? `${dayWord(sel.date)}, ${fmtDate(sel.date)}` : fmtDate(sel.date);
  const row = (k, v) => `<div class="flex justify-between gap-4 py-1.5"><dt class="text-on-surface-variant">${esc(k)}</dt><dd class="text-right font-semibold">${v}</dd></div>`;
  document.title = `Book ${doctor.name} - Liberty Health Care`;
  page.innerHTML = `
    <nav class="mb-3 text-body-sm text-on-surface-variant" aria-label="Breadcrumb"><a href="/frontend/patient/doctors.html" class="hover:underline">Find doctors</a> <span aria-hidden="true">/</span> <a href="${doctorUrl()}" class="hover:underline">${esc(doctor.name)}</a> <span aria-hidden="true">/</span> <span class="font-semibold text-on-surface">Confirm booking</span></nav>
    <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">Confirm your booking</h1>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form id="book-form" class="min-w-0 space-y-6" novalidate>
        <div id="form-alert" role="alert" hidden class="flex flex-col gap-3 rounded-2xl bg-error-container px-5 py-4 text-on-error-container sm:flex-row sm:items-center sm:justify-between"></div>

        <section class="card p-6">
          <h2 class="font-display text-headline-sm">Patient</h2>
          <dl class="mt-3 text-body-md">${row('Name', esc(user.name))}${row('Email', esc(user.email))}</dl>
          <div data-field class="mt-4 max-w-sm">
            <label for="phone" class="field-label">Mobile number <span class="normal-case text-outline">(optional)</span></label>
            <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" class="field-input" placeholder="98765 43210">
            <p class="mt-1 text-body-sm text-on-surface-variant">The clinic may use this to reach you about your visit.</p>
          </div>
        </section>

        <section class="card p-6">
          <h2 class="font-display text-headline-sm">Payment</h2>
          <div class="mt-4 space-y-3" role="radiogroup" aria-label="Payment option">
            <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-primary-container bg-primary-fixed/30 p-4">
              <input type="radio" name="payment_type" value="VISIT" checked class="mt-1 h-4 w-4 accent-primary-container">
              <span><span class="block font-display text-label-lg">Pay at visit</span>
                <span class="text-body-sm text-on-surface-variant">Pay ${esc(money(fee.fee))} at the ${doctor.place.kind === 'HOSPITAL' ? 'hospital counter' : 'clinic'} when you come. Nothing to pay now.</span></span>
            </label>
            <label class="flex items-start gap-3 rounded-xl border border-outline-variant p-4 opacity-60">
              <input type="radio" name="payment_type" value="ONLINE" disabled class="mt-1 h-4 w-4">
              <span><span class="block font-display text-label-lg">Pay now online <span class="badge ml-1">Coming soon</span></span>
                <span class="text-body-sm text-on-surface-variant">Pay in advance with UPI, card or net banking.</span></span>
            </label>
          </div>
        </section>

        <section class="card p-6">
          <h2 class="font-display text-headline-sm">Cancellation</h2>
          <p class="mt-2 text-body-md text-on-surface-variant">You can cancel up to 24 hours before your appointment. If the doctor or hospital has to cancel, you will be told by email.</p>
        </section>

        <button type="submit" id="confirm" class="btn-accent w-full py-4 text-base lg:hidden">Confirm booking</button>
      </form>

      <aside class="lg:sticky lg:top-24 lg:self-start" aria-label="Booking summary">
        <div class="card p-6">
          <div class="flex items-center gap-3">
            ${avatar(doctor, 'h-14 w-14', 'text-lg')}
            <div class="min-w-0"><p class="font-display text-headline-sm">${esc(doctor.name)}</p><p class="text-body-sm font-semibold text-primary">${esc(doctor.specialty.name)}</p></div>
          </div>
          <p class="mt-3 flex items-start gap-1.5 text-body-sm text-on-surface-variant"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">location_on</span><span>${esc(doctor.place.name || '')}, ${esc(doctor.place.address || '')}</span></p>
          <dl class="mt-4 border-t border-outline-variant pt-3 text-body-md">
            ${row('Date', esc(when))}
            ${w.mode === 'SLOTS' ? row('Time', esc(time12(sel.slot))) : row('Session', `${esc(time12(w.start))} – ${esc(time12(w.end))}`)}
            ${w.mode === 'COUNT' ? row('Your number', `#${w.next_serial}`) : ''}
            ${row('Treatment', esc(fee.treatment_name))}
          </dl>
          <div class="mt-3 flex items-center justify-between border-t border-outline-variant pt-3"><span class="font-display text-label-lg">Total</span><span class="font-display text-headline-md">${esc(money(fee.fee))}</span></div>
          <button type="submit" form="book-form" id="confirm-side" class="btn-accent mt-5 hidden w-full py-3.5 lg:inline-flex">Confirm booking</button>
          ${w.mode === 'COUNT' ? '<p class="mt-3 text-body-sm text-on-surface-variant">Your number is confirmed when you book. Please arrive during the session hours.</p>' : ''}
        </div>
      </aside>
    </div>`;

  const form = qs('#book-form');
  const alertBox = qs('#form-alert');
  const fail = (message, withChoose) => {
    alertBox.innerHTML = `<p>${esc(message)}</p>${withChoose ? backToDoctor() : ''}`;
    alertBox.hidden = false;
    alertBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    alertBox.hidden = true;
    const payload = { schedule_id: Number(sel.schedule), treatment_id: Number(sel.treatment), payment_type: 'VISIT' };
    if (w.mode === 'SLOTS') payload.slot_time = sel.slot;
    const phone = form.elements.phone.value.trim();
    if (phone) payload.phone = phone;
    const buttons = ['#confirm', '#confirm-side'].map((s) => qs(s)).filter(Boolean);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await withBusy(buttons[0], async () => {
        const data = await api.post('/api/appointments', payload);
        location.replace(`/frontend/patient/booking.html?code=${encodeURIComponent(data.appointment.booking_code)}`);
        await new Promise(() => {}); // leave the button busy while the page changes
      });
    } catch (err) {
      buttons.forEach((b) => { b.disabled = false; });
      if (!(err instanceof ApiError)) throw err;
      if (err.status === 422 && err.details && showFieldErrors(form, err.details)) return;
      const gone = ['SLOT_TAKEN', 'FULL', 'SLOT_PASSED', 'WINDOW_ENDED', 'DAY_CLOSED', 'SLOT_UNAVAILABLE', 'SCHEDULE_NOT_FOUND', 'DOCTOR_NOT_AVAILABLE'].includes(err.code);
      fail(err.message, gone);
    }
  });
}
