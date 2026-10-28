// Helpers shared by the patient pages: formatting, the doctor card, and the remembered location.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { esc, qs, withBusy } from '/frontend/shared/dom.js';
import { openModal } from '/frontend/shared/modal.js';
import { toast } from '/frontend/shared/toast.js';

// ---- formatting ---------------------------------------------------------------
export function money(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return `₹${Number(s).toLocaleString('en-IN', { minimumFractionDigits: s.endsWith('.00') ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** '17:00' -> '5:00 PM' */
export function time12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const localDate = (iso) => new Date(`${iso}T00:00:00`);
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtDate(iso) {
  return localDate(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function dayWord(iso) {
  const today = localDate(todayIso());
  const diff = Math.round((localDate(iso) - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return fmtDate(iso);
}

/** Short text for a doctor's next available slot (or window). */
export function nextText(n) {
  if (!n) return 'No upcoming slots';
  if (n.slot_time) return `${dayWord(n.date)}, ${time12(n.slot_time)}`;
  return `${dayWord(n.date)}, ${time12(n.start)}–${time12(n.end)}`;
}
export function nextSub(n) {
  if (!n) return '';
  return n.slot_time ? `${n.remaining} slot${n.remaining === 1 ? '' : 's'} left` : `${n.remaining} place${n.remaining === 1 ? '' : 's'} left`;
}

// ---- cancelling a booking ---------------------------------------------------------
/** '2026-10-14 10:30' -> 'Wed, 14 Oct, 10:30 AM' */
export function fmtDeadline(s) {
  const [d, t] = s.split(' ');
  return `${fmtDate(d)}, ${time12(t)}`;
}

/** The one-line cancellation hint shown on a booking. */
export function cancelNote(a) {
  if (a.status !== 'BOOKED') return '';
  return a.can_cancel
    ? `You can cancel for free until ${fmtDeadline(a.cancel_deadline)}.`
    : 'Cancellation is closed: it is less than 24 hours to your appointment.';
}

/** Who cancelled, when and why, for a cancelled booking. */
export function cancelledLine(a) {
  if (!a.cancellation) return '';
  const by = a.cancellation.by === 'PATIENT' ? 'you' : 'the doctor';
  const when = a.cancellation.at ? new Date(a.cancellation.at.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `Cancelled by ${by}${when ? ` on ${when}` : ''}${a.cancellation.reason ? `. Reason: ${a.cancellation.reason}` : ''}`;
}

/**
 * The "cancel this booking" window. onDone(result) runs after a successful cancel, or after the server says
 * the booking can no longer be cancelled (so the page can refresh what it shows).
 */
export function openCancelModal(a, onDone) {
  const when = a.mode === 'SLOTS' ? time12(a.time) : `${time12(a.window.start)} – ${time12(a.window.end)}`;
  openModal({
    title: 'Cancel this appointment?',
    size: 'max-w-lg',
    html: `<form id="cancel-form" class="space-y-4" novalidate>
      <div id="cancel-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      <p class="text-body-md">${esc(a.doctor.name)}<br><span class="text-on-surface-variant">${esc(fmtDate(a.date))}, ${esc(when)} &middot; ${esc(a.booking_code)}</span></p>
      <p class="rounded-xl bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">${a.payment_type === 'ONLINE' && a.payment_status === 'PAID'
        ? `Your online payment of ${esc(money(a.fee_amount))} will be refunded in full. It reaches your account within 48 hours.`
        : 'You chose to pay at the visit, so no payment was taken and there is nothing to refund.'}</p>
      <div data-field>
        <label for="cancel-reason" class="field-label">Reason <span class="normal-case text-outline">(optional)</span></label>
        <textarea id="cancel-reason" name="reason" rows="3" maxlength="300" class="field-input" placeholder="Tell the doctor why, if you like"></textarea>
      </div>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-keep class="btn-outline">Keep my booking</button>
        <button type="submit" id="cancel-confirm" class="btn-danger">Yes, cancel booking</button>
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
            const data = await api.post(`/api/appointments/${encodeURIComponent(a.booking_code)}/cancel`, { reason: form.elements.reason.value.trim() });
            close();
            toast.success(data.refund.required ? 'Booking cancelled. Your refund is on its way.' : 'Booking cancelled.');
            onDone(data);
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            alertBox.textContent = (err.details && err.details.reason) || err.message;
            alertBox.hidden = false;
            // The booking changed under us (already cancelled, or the 24 hours passed): let the page refresh
            if (['ALREADY_CANCELLED', 'CANCEL_WINDOW_CLOSED', 'NOT_CANCELLABLE', 'NOT_FOUND'].includes(err.code)) {
              setTimeout(() => { close(); onDone(null); }, 2500);
            }
          }
        });
      });
    },
  });
}

/** What a booking's payment looks like to a person. */
export function paymentLabel(type, status) {
  if (status === 'REFUND_PENDING') return 'Refund in progress';
  if (status === 'REFUNDED') return 'Refunded';
  if (type === 'VISIT') return status === 'PAID' ? 'Paid at visit' : 'Pay at visit';
  return status === 'PAID' ? 'Paid online' : 'Online payment pending';
}

export function initials(name) {
  return (name || '?').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function avatar(d, size = 'h-20 w-20', text = 'text-2xl') {
  return d.photo_url
    ? `<img src="${esc(d.photo_url)}" alt="Photo of ${esc(d.name)}" loading="lazy" class="${size} shrink-0 rounded-2xl object-cover">`
    : `<span class="${size} ${text} flex shrink-0 items-center justify-center rounded-2xl bg-primary-container font-display text-on-primary" aria-hidden="true">${esc(initials(d.name))}</span>`;
}

export const typeBadge = (d) => d.doctor_type === 'HOSPITAL'
  ? '<span class="badge badge-success">Hospital-affiliated</span>'
  : '<span class="badge badge-warning">Private chamber</span>';

// ---- remembered location (state + district) ------------------------------------
const LOC_KEY = 'hb_location';
export function savedLocation() {
  try {
    const v = JSON.parse(localStorage.getItem(LOC_KEY) || 'null');
    return v && Number.isInteger(v.state_id) ? { state_id: v.state_id, district_id: Number.isInteger(v.district_id) ? v.district_id : null } : { state_id: null, district_id: null };
  } catch { return { state_id: null, district_id: null }; }
}
export function saveLocation(state_id, district_id) {
  try { localStorage.setItem(LOC_KEY, JSON.stringify({ state_id: state_id || null, district_id: district_id || null })); } catch { /* private mode: fine */ }
}

const opt = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;

/**
 * Fill a state <select> and a district <select> from the API and keep them in step.
 * onChange(state_id, district_id) is called when the user changes either one.
 */
export async function wireLocationSelects(stateSel, districtSel, { state_id = null, district_id = null, onChange = () => {} } = {}) {
  const states = (await api.get('/api/locations/states')).items;
  stateSel.innerHTML = opt('', 'All states', false) + states.map((s) => opt(s.id, s.name, s.id === state_id)).join('');

  async function loadDistricts(sid, selected) {
    if (!sid) {
      districtSel.innerHTML = opt('', 'All districts', true);
      districtSel.disabled = true;
      return;
    }
    districtSel.disabled = true;
    const items = (await api.get(`/api/locations/districts?state_id=${encodeURIComponent(sid)}`)).items;
    districtSel.innerHTML = opt('', 'All districts', !selected) + items.map((d) => opt(d.id, d.name, d.id === selected)).join('');
    districtSel.disabled = false;
  }
  await loadDistricts(state_id, district_id);

  stateSel.addEventListener('change', async () => {
    const sid = stateSel.value ? Number(stateSel.value) : null;
    await loadDistricts(sid, null);
    onChange(sid, null);
  });
  districtSel.addEventListener('change', () => {
    onChange(stateSel.value ? Number(stateSel.value) : null, districtSel.value ? Number(districtSel.value) : null);
  });
}

// ---- the doctor card used in lists ---------------------------------------------
export function doctorCard(d, { compare = false, checked = false } = {}) {
  const next = d.next_available;
  const bookable = d.fee_from !== null && next;
  return `
    <article class="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center" data-doctor="${d.id}">
      <a href="/frontend/patient/doctor.html?id=${d.id}" class="flex min-w-0 flex-1 gap-4" aria-label="View profile of ${esc(d.name)}">
        ${avatar(d)}
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2"><h2 class="font-display text-headline-sm">${esc(d.name)}</h2>${typeBadge(d)}</div>
          <p class="mt-0.5 text-body-md text-on-surface-variant">${esc(d.qualifications || '')}</p>
          <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-on-surface-variant">
            <span class="font-display font-semibold text-primary">${esc(d.specialty.name)}</span>
            <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">${d.place.kind === 'HOSPITAL' ? 'local_hospital' : 'storefront'}</span>${esc(d.place.name || '')}</span>
            <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">location_on</span>${esc(d.location.district)}, ${esc(d.location.state)}</span>
          </p>
        </div>
      </a>
      <div class="flex shrink-0 flex-col gap-2 sm:w-64 sm:items-end">
        <p class="inline-flex items-center gap-1.5 rounded-full ${next ? 'bg-primary-fixed/60 text-on-primary-fixed' : 'bg-surface-container text-on-surface-variant'} px-3 py-1 text-body-sm font-semibold" data-next>
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">schedule</span>${esc(nextText(next))}</p>
        ${next ? `<p class="text-body-sm text-on-surface-variant">${esc(nextSub(next))}</p>` : ''}
        <p class="font-display text-headline-md" data-fee>${d.fee_from !== null ? `<span class="text-body-sm font-normal text-on-surface-variant">from </span>${esc(money(d.fee_from))}` : '<span class="text-body-md text-outline">Fee not set</span>'}</p>
        <div class="flex flex-wrap items-center gap-2 sm:justify-end">
          ${compare ? `<label class="inline-flex cursor-pointer items-center gap-1.5 text-body-sm text-on-surface-variant"><input type="checkbox" data-compare="${d.id}" class="h-4 w-4 accent-primary-container" ${checked ? 'checked' : ''}> Compare</label>` : ''}
          <a href="/frontend/patient/doctor.html?id=${d.id}" class="btn-outline btn-sm">Profile</a>
          <a href="/frontend/patient/doctor.html?id=${d.id}#book" class="btn-primary btn-sm ${bookable ? '' : 'pointer-events-none opacity-50'}" ${bookable ? '' : 'aria-disabled="true"'}>Book</a>
        </div>
      </div>
    </article>`;
}
