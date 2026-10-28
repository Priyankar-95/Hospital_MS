// Hospital Admin: bed count. Total and available beds are entered by the admin, and shown as occupancy.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { esc, qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { openModal } from '/frontend/shared/modal.js';
import { startHospitalPortal, setTopbarHospital, skeleton, pageHeader, bar, occupancyTone, num } from './portal.js';

const { main } = await startHospitalPortal('beds');
main.innerHTML = `${pageHeader('Bed count', 'How many beds your hospital has and how many are free right now. Update it whenever it changes.', '<button type="button" id="update-btn" class="btn-primary" disabled><span class="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>Update bed status</button>')}<div id="content" class="space-y-6">${skeleton(2, 'h-40')}</div>`;
const content = qs('#content');
let state = null;

function render() {
  const b = state.beds;
  const tone = occupancyTone(b.occupancy_percent);
  const depts = state.departments;
  const unassigned = b.total_beds - b.beds_assigned;

  content.innerHTML = `
    <section class="card p-5 sm:p-6" aria-label="Bed capacity">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-headline-sm">Live bed capacity</h2>
        <span class="rounded-full px-3 py-1 text-label-md font-semibold ${tone.chip}">${tone.label} &middot; ${b.occupancy_percent}% occupied</span>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-surface-container-low p-4 text-center sm:p-6">
        <div><p class="text-label-md uppercase text-on-surface-variant">Total licensed</p><p class="font-display text-display-lg-mobile font-extrabold sm:text-display-lg" data-total>${num(b.total_beds)}</p></div>
        <div><p class="text-label-md uppercase text-on-surface-variant">Occupied</p><p class="font-display text-display-lg-mobile font-extrabold sm:text-display-lg ${tone.text}" data-occupied>${num(b.occupied_beds)}</p></div>
        <div><p class="text-label-md uppercase text-on-surface-variant">Available</p><p class="font-display text-display-lg-mobile font-extrabold text-tertiary sm:text-display-lg" data-available>${num(b.available_beds)}</p></div>
      </div>
      <div class="mt-5">${bar(b.occupancy_percent, tone.bar)}</div>
      <div class="mt-2 flex justify-between text-body-sm text-on-surface-variant"><span>Occupied: ${num(b.occupied_beds)} (${b.occupancy_percent}%)</span><span>Available: ${num(b.available_beds)}</span></div>
    </section>

    <section class="card p-5 sm:p-6" aria-label="Beds by department">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 class="font-display text-headline-sm">Beds by department</h2><p class="text-body-sm text-on-surface-variant">${num(b.beds_assigned)} of ${num(b.total_beds)} beds are assigned to a department.</p></div>
        <a href="/frontend/hospital/departments.html" class="btn-outline btn-sm">Manage departments</a>
      </div>
      ${depts.length ? `<ul class="grid gap-3 sm:grid-cols-2">${depts.map((d) => `
        <li class="rounded-2xl border border-outline-variant p-4">
          <div class="flex items-center justify-between gap-2"><span class="truncate font-display text-label-lg">${esc(d.name)}</span><span class="font-semibold">${num(d.bed_count)} beds</span></div>
          <div class="mt-2">${bar(b.total_beds ? (d.bed_count / b.total_beds) * 100 : 0, 'bg-primary-container')}</div>
          <p class="mt-1 text-body-sm text-on-surface-variant">${num(d.doctor_count)} approved doctor${d.doctor_count === 1 ? '' : 's'}</p>
        </li>`).join('')}</ul>
        <p class="mt-4 text-body-sm ${unassigned < 0 ? 'text-error' : 'text-on-surface-variant'}">${unassigned >= 0 ? `${num(unassigned)} beds are not in any department.` : `The departments have ${num(-unassigned)} more beds than the hospital total.`}</p>`
        : '<p class="text-body-md text-on-surface-variant">No departments yet. <a href="/frontend/hospital/departments.html" class="font-semibold text-primary underline">Add your departments</a> to see the beds by department.</p>'}
    </section>`;
  qs('#update-btn').disabled = false;
}

function openUpdate() {
  const b = state.beds;
  openModal({
    title: 'Update bed status',
    size: 'max-w-md',
    html: `<form id="beds-form" class="space-y-5" novalidate>
        <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
        <div data-field><label for="total_beds" class="field-label">Total beds</label><input id="total_beds" name="total_beds" type="number" min="0" max="100000" value="${b.total_beds}" class="field-input" inputmode="numeric"></div>
        <div data-field><label for="available_beds" class="field-label">Available beds right now</label><input id="available_beds" name="available_beds" type="number" min="0" max="100000" value="${b.available_beds}" class="field-input" inputmode="numeric"></div>
        <p id="preview" class="rounded-xl bg-surface-container-low px-4 py-3 text-body-md" aria-live="polite"></p>
        <button type="submit" id="save-beds" class="btn-primary w-full py-3.5 text-base">Save</button>
      </form>`,
    onMount: (body, close) => {
      const form = qs('#beds-form', body);
      const preview = qs('#preview', body);
      const alertBox = qs('#form-alert', body);
      const read = () => ({ total: Number(form.elements.total_beds.value), available: Number(form.elements.available_beds.value) });
      const update = () => {
        const { total, available } = read();
        preview.textContent = total >= 0 && available >= 0 && available <= total && form.elements.total_beds.value !== ''
          ? `${num(total - available)} occupied (${total ? Math.round(((total - available) / total) * 100) : 0}%), ${num(available)} free.`
          : 'Available beds cannot be more than the total beds.';
      };
      form.addEventListener('input', update);
      update();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        alertBox.hidden = true;
        const { total, available } = read();
        const errors = {};
        if (!Number.isInteger(total) || total < 0 || form.elements.total_beds.value === '') errors.total_beds = 'Enter the total number of beds.';
        if (!Number.isInteger(available) || available < 0 || form.elements.available_beds.value === '') errors.available_beds = 'Enter the number of free beds.';
        else if (available > total) errors.available_beds = 'Available beds cannot be more than the total beds.';
        if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
        await withBusy(qs('#save-beds', body), async () => {
          try {
            await api.put('/api/hospitals/me/beds', { total_beds: total, available_beds: available });
            close();
            toast.success('Bed status updated.');
            await load();
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            const shown = err.status === 422 ? showFieldErrors(form, err.details) : false;
            if (!shown) { alertBox.textContent = err.message; alertBox.hidden = false; }
          }
        });
      });
    },
  });
}

async function load() {
  try {
    state = await api.get('/api/hospitals/me/beds');
    setTopbarHospital(state.hospital.name, `${state.hospital.district}, ${state.hospital.state}`);
    render();
  } catch (e) {
    content.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load the bed count. Please refresh.')}</p>`;
  }
}
qs('#update-btn').addEventListener('click', openUpdate);
await load();
