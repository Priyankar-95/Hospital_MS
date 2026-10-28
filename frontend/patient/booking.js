// Booking confirmation: shows the booking ID and the details of one of the patient's own bookings.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { avatar, money, time12, fmtDate, dayWord, paymentLabel, cancelNote, cancelledLine, openCancelModal } from './common.js';

await initPage({ roles: ['PATIENT'], navSearch: false });
const page = qs('#page');
page.setAttribute('aria-busy', 'false');
const code = (new URLSearchParams(location.search).get('code') || '').toUpperCase();

function notFound() {
  page.innerHTML = `<div class="card p-8 text-center"><span class="material-symbols-outlined text-4xl text-outline" aria-hidden="true">search_off</span>
    <h1 class="mt-2 font-display text-headline-md">Booking not found</h1>
    <p class="mt-2 text-body-md text-on-surface-variant">We could not find this booking in your account.</p>
    <a href="/frontend/patient/doctors.html" class="btn-primary mt-6">Find doctors</a></div>`;
}

if (!/^HB-[A-Z0-9]{8}$/.test(code)) {
  notFound();
} else {
  try {
    const { appointment: a } = await api.get(`/api/appointments/${code}`);
    const when = ['Today', 'Tomorrow'].includes(dayWord(a.date)) ? `${dayWord(a.date)}, ${fmtDate(a.date)}` : fmtDate(a.date);
    const row = (k, v) => `<div class="flex justify-between gap-4 py-2"><dt class="text-on-surface-variant">${esc(k)}</dt><dd class="text-right font-semibold">${v}</dd></div>`;
    const cancelled = a.status === 'CANCELLED';
    document.title = `Booking ${a.booking_code} - Liberty Health Care`;
    page.innerHTML = `
      <div class="card overflow-hidden">
        <div class="${cancelled ? 'bg-error-container text-on-error-container' : 'bg-gradient-to-br from-primary to-primary-container text-on-primary'} px-6 py-8 text-center">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20"><span class="material-symbols-outlined text-3xl" aria-hidden="true">${cancelled ? 'event_busy' : 'check_circle'}</span></span>
          <h1 class="mt-3 font-display text-headline-lg-mobile !text-inherit sm:text-headline-lg">${cancelled ? 'This booking was cancelled' : ({ COMPLETED: 'Visit completed', NO_SHOW: 'Marked as missed' }[a.status] || 'Booking confirmed')}</h1>
          <p class="mt-1 text-body-md opacity-90">Your booking ID</p>
          <p class="mt-1 flex items-center justify-center gap-2"><span id="code" class="font-display text-headline-md tracking-widest">${esc(a.booking_code)}</span>
            <button type="button" id="copy" class="rounded-full bg-white/20 p-1.5 hover:bg-white/30" aria-label="Copy booking ID"><span class="material-symbols-outlined text-[18px]">content_copy</span></button></p>
        </div>

        <div class="space-y-6 p-6">
          <div class="flex items-center gap-4">
            ${avatar(a.doctor, 'h-16 w-16', 'text-xl')}
            <div class="min-w-0"><p class="font-display text-headline-sm">${esc(a.doctor.name)}</p>
              <p class="text-body-sm font-semibold text-primary">${esc(a.doctor.specialty)}</p>
              <p class="text-body-sm text-on-surface-variant">${esc(a.doctor.place || '')}, ${esc(a.doctor.address || '')}</p></div>
          </div>

          <dl class="divide-y divide-outline-variant rounded-xl border border-outline-variant px-4 text-body-md">
            ${row('Date', esc(when))}
            ${a.mode === 'SLOTS' ? row('Time', esc(time12(a.time))) : row('Session', `${esc(time12(a.window.start))} – ${esc(time12(a.window.end))}`)}
            ${a.mode === 'COUNT' && a.token_number ? row('Your number', `#${a.token_number}`) : ''}
            ${row('Treatment', esc(a.treatment_name || '-'))}
            ${row('Fee', esc(money(a.fee_amount)))}
            ${row('Payment', esc(paymentLabel(a.payment_type, a.payment_status)))}
          </dl>

          ${cancelled ? `<div class="flex items-start gap-3 rounded-xl bg-error-container/40 px-4 py-3 text-body-md" id="cancelled-info">
            <span class="material-symbols-outlined mt-0.5 text-error" aria-hidden="true">info</span>
            <p>${esc(cancelledLine(a))}.${a.payment_type === 'ONLINE' && ['REFUND_PENDING', 'REFUNDED'].includes(a.payment_status) ? ' Your payment is being refunded in full; it reaches your account within 48 hours.' : ' Nothing was charged, so there is nothing to refund.'}</p></div>`
          : (a.status === 'BOOKED' ? `<div class="flex items-start gap-3 rounded-xl bg-surface-container-low px-4 py-3 text-body-md">
            <span class="material-symbols-outlined mt-0.5 text-primary" aria-hidden="true">payments</span>
            <p>${a.payment_type === 'VISIT' ? `Please pay <strong>${esc(money(a.fee_amount))}</strong> at the ${a.doctor.place_kind === 'HOSPITAL' ? 'hospital counter' : 'clinic'} when you visit. Keep your booking ID handy.` : 'Your payment is recorded.'}
            ${a.mode === 'COUNT' ? ' Please arrive during the session hours; patients are seen in number order.' : ''}</p></div>
          <div class="flex items-start gap-3 rounded-xl bg-surface-container-low px-4 py-3 text-body-md">
            <span class="material-symbols-outlined mt-0.5 ${a.can_cancel ? 'text-primary' : 'text-secondary'}" aria-hidden="true">event_busy</span>
            <p id="cancel-note">${esc(cancelNote(a))}</p></div>` : '')}

          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href="/api/appointments/${esc(a.booking_code)}/invoice?download=1" class="btn-primary" id="invoice"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">download</span>Download invoice</a>
            <a href="/frontend/patient/appointments.html" class="btn-outline">My appointments</a>
            <a href="/frontend/patient/doctors.html" class="btn-outline">Find more doctors</a>
            ${a.can_cancel ? '<button type="button" id="cancel-btn" class="btn-outline text-error">Cancel booking</button>' : ''}
          </div>
          ${a.status === 'BOOKED' ? '<p class="text-body-sm text-on-surface-variant">A confirmation email with your invoice is on its way to your inbox.</p>' : ''}
        </div>
      </div>`;
    const cancelBtn = qs('#cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => openCancelModal(a, () => location.reload()));
    qs('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(a.booking_code); toast.success('Booking ID copied.'); } catch { toast.info(`Your booking ID is ${a.booking_code}`); }
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    else page.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load the booking. Please refresh.')}</p>`;
  }
}
