// Hospital Admin: departments (which specialties the hospital runs) and the beds in each.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { esc, qs, qsa, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { confirmDialog } from '/frontend/shared/modal.js';
import { startHospitalPortal, setTopbarHospital, skeleton, pageHeader, bar, num } from './portal.js';

const { main } = await startHospitalPortal('departments');
main.innerHTML = `${pageHeader('Departments', 'The departments your hospital runs and how many beds each has. Patients see these when they look at your hospital.')}<div id="content" class="space-y-4">${skeleton(3, 'h-24')}</div>`;
const content = qs('#content');
let state = null;

function summary(beds, list) {
  const assigned = list.reduce((s, d) => s + d.bed_count, 0);
  const total = beds.total_beds;
  const over = assigned > total;
  return `<section class="card p-5" aria-label="Beds in departments">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-display text-headline-sm">${num(list.length)} department${list.length === 1 ? '' : 's'} <span class="text-on-surface-variant">&middot;</span> ${num(assigned)} of ${num(total)} beds assigned</p>
        <a href="/frontend/hospital/beds.html" class="text-label-md font-semibold text-primary hover:underline">Total beds: ${num(total)} (change)</a>
      </div>
      <div class="mt-3">${bar(total ? (assigned / total) * 100 : (assigned ? 100 : 0), over ? 'bg-error' : 'bg-primary-container')}</div>
      ${over ? `<p class="mt-2 text-body-sm text-error" role="alert">The departments have ${num(assigned - total)} more beds than your hospital total. Raise the total on the <a href="/frontend/hospital/beds.html" class="font-semibold underline">Bed Count</a> page, or lower a department.</p>` : ''}
    </section>`;
}

function addForm(available) {
  if (!available.length) return '<section class="card p-5 text-body-md text-on-surface-variant">Every department is already added.</section>';
  return `<form id="add-form" class="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end" novalidate>
      <div class="min-w-0 flex-1" data-field><label for="specialty_id" class="field-label">Add a department</label>
        <select id="specialty_id" class="field-input"><option value="">Choose a department</option>${available.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="sm:w-40" data-field><label for="new-beds" class="field-label">Beds</label><input id="new-beds" type="number" min="0" max="100000" value="0" class="field-input" inputmode="numeric"></div>
      <button type="submit" id="add-btn" class="btn-primary"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">add</span>Add</button>
    </form>`;
}

function rows(list) {
  if (!list.length) return '<div class="card p-8 text-center text-on-surface-variant"><span class="material-symbols-outlined mb-2 text-4xl text-outline" aria-hidden="true">apartment</span><p>No departments yet. Add the first one above.</p></div>';
  return `<ul class="space-y-3" aria-label="Departments">${list.map((d) => `
    <li class="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-dept="${d.id}">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary"><span class="material-symbols-outlined" aria-hidden="true">medical_services</span></span>
        <div class="min-w-0"><p class="truncate font-display text-headline-sm">${esc(d.name)}</p>
          <p class="text-body-sm text-on-surface-variant">${num(d.doctor_count)} approved doctor${d.doctor_count === 1 ? '' : 's'}</p></div>
      </div>
      <div class="flex items-center gap-2">
        <label class="sr-only" for="beds-${d.id}">Beds in ${esc(d.name)}</label>
        <input id="beds-${d.id}" type="number" min="0" max="100000" value="${d.bed_count}" data-orig="${d.bed_count}" class="field-input !w-28 text-center" inputmode="numeric">
        <span class="text-body-sm text-on-surface-variant">beds</span>
        <button type="button" class="btn-primary btn-sm" data-save="${d.id}" disabled>Save</button>
        <button type="button" class="btn-outline btn-sm text-error" data-remove="${d.id}" aria-label="Remove ${esc(d.name)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span></button>
      </div>
    </li>`).join('')}</ul>`;
}

function render() {
  const { departments, available_specialties: available, beds } = state;
  content.innerHTML = `${summary(beds, departments)}${addForm(available)}<div id="rows">${rows(departments)}</div>`;

  qs('#add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const specialty = qs('#specialty_id').value;
    if (!specialty) { toast.error('Choose a department to add.'); return; }
    await withBusy(qs('#add-btn'), async () => {
      try {
        await api.post('/api/hospitals/me/departments', { specialty_id: Number(specialty), bed_count: Number(qs('#new-beds').value || 0) });
        toast.success('Department added.');
        await load();
      } catch (err) { toast.error(err instanceof ApiError ? (err.details?.bed_count || err.details?.specialty_id || err.message) : 'Could not add the department.'); }
    });
  });

  // The Save button lights up only when a number changed
  qsa('input[data-orig]').forEach((input) => input.addEventListener('input', () => {
    qs(`[data-save="${input.id.replace('beds-', '')}"]`).disabled = input.value === input.dataset.orig || input.value === '';
  }));
  qsa('[data-save]').forEach((b) => b.addEventListener('click', async () => {
    const input = qs(`#beds-${b.dataset.save}`);
    await withBusy(b, async () => {
      try {
        const r = await api.patch(`/api/hospitals/me/departments/${b.dataset.save}`, { bed_count: Number(input.value) });
        state.departments = r.departments;
        toast.success('Beds saved.');
        render();
      } catch (err) { toast.error(err instanceof ApiError ? (err.details?.bed_count || err.message) : 'Could not save.'); }
    });
  }));
  qsa('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const d = state.departments.find((x) => String(x.id) === b.dataset.remove);
    if (!await confirmDialog({ title: `Remove ${d.name}?`, message: 'The department and its bed count are removed from your hospital. Doctors are not affected.', confirmText: 'Remove', danger: true })) return;
    try {
      await api.delete(`/api/hospitals/me/departments/${b.dataset.remove}`);
      toast.success('Department removed.');
      await load();
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not remove.'); }
  }));
}

async function load() {
  try {
    state = await api.get('/api/hospitals/me/departments');
    setTopbarHospital(state.hospital.name, `${state.hospital.district}, ${state.hospital.state}`);
    render();
  } catch (e) {
    content.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load the departments. Please refresh.')}</p>`;
  }
}
await load();
