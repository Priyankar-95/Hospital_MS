// Hospital Admin: facilities and amenities patients can see (a checklist plus anything else the hospital offers).
import { api, ApiError } from '/frontend/shared/api-client.js';
import { esc, qs, qsa, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { startHospitalPortal, setTopbarHospital, skeleton, pageHeader } from './portal.js';

const { main } = await startHospitalPortal('facilities');
main.innerHTML = `${pageHeader('Facilities & amenities', 'Tick what your hospital offers. Patients see this when they compare hospitals and doctors.', '<button type="button" id="save-btn" class="btn-primary" disabled><span class="material-symbols-outlined text-[20px]" aria-hidden="true">save</span>Save changes</button>')}<div id="content" class="space-y-6">${skeleton(2, 'h-40')}</div>`;
const content = qs('#content');
const saveBtn = qs('#save-btn');

let options = [];
let saved = '';
const chosen = new Set(); // facility names (checklist ones and custom ones), exactly as saved

const key = (list) => JSON.stringify([...list].sort());
const dirty = () => key(chosen) !== saved;
const refreshSave = () => { saveBtn.disabled = !dirty(); };

function render() {
  const custom = [...chosen].filter((f) => !options.includes(f));
  content.innerHTML = `
    <section class="card p-5 sm:p-6" aria-label="Facilities checklist">
      <h2 class="mb-4 font-display text-headline-sm">What we offer</h2>
      <ul class="grid gap-3 sm:grid-cols-2" id="options">${options.map((f, i) => `
        <li class="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant px-4 py-3">
          <label for="fac-${i}" class="min-w-0 flex-1 cursor-pointer truncate text-body-md font-medium">${esc(f)}</label>
          <label class="relative inline-flex cursor-pointer items-center">
            <input id="fac-${i}" type="checkbox" class="peer sr-only" data-facility="${esc(f)}" ${chosen.has(f) ? 'checked' : ''}>
            <span class="h-6 w-11 rounded-full bg-outline-variant transition peer-checked:bg-primary-container peer-focus-visible:ring-2 peer-focus-visible:ring-primary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition after:content-[''] peer-checked:after:translate-x-5"></span>
          </label>
        </li>`).join('')}</ul>
    </section>

    <section class="card p-5 sm:p-6" aria-label="Other facilities">
      <h2 class="font-display text-headline-sm">Anything else?</h2>
      <p class="mb-3 text-body-sm text-on-surface-variant">Add other facilities in your own words (for example "Physiotherapy" or "Day-care surgery").</p>
      <form id="custom-form" class="flex flex-col gap-2 sm:flex-row" novalidate>
        <label class="sr-only" for="custom-input">Another facility</label>
        <input id="custom-input" type="text" maxlength="60" class="field-input min-w-0 flex-1" placeholder="Another facility" autocomplete="off">
        <button type="submit" class="btn-outline"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">add</span>Add</button>
      </form>
      <p id="custom-error" class="field-error" role="alert" hidden></p>
      <ul id="custom-list" class="mt-3 flex flex-wrap gap-2" aria-label="Your own facilities">${custom.map((f) => `
        <li class="flex items-center gap-1 rounded-full bg-primary-fixed py-1 pl-4 pr-1 text-body-md text-on-primary-fixed-variant">${esc(f)}
          <button type="button" class="rounded-full p-1 hover:bg-white/60" data-remove-custom="${esc(f)}" aria-label="Remove ${esc(f)}"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button></li>`).join('')}</ul>
    </section>`;

  qsa('[data-facility]').forEach((c) => c.addEventListener('change', () => { c.checked ? chosen.add(c.dataset.facility) : chosen.delete(c.dataset.facility); refreshSave(); }));
  qsa('[data-remove-custom]').forEach((b) => b.addEventListener('click', () => { chosen.delete(b.dataset.removeCustom); render(); refreshSave(); }));
  qs('#custom-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = qs('#custom-input');
    const err = qs('#custom-error');
    const text = input.value.replace(/[,\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    err.hidden = true;
    if (text.length < 2) { err.textContent = 'Write at least 2 characters.'; err.hidden = false; return; }
    if ([...chosen].some((f) => f.toLowerCase() === text.toLowerCase())) { err.textContent = 'That is already in your list.'; err.hidden = false; return; }
    if (chosen.size >= 25) { err.textContent = 'You can list at most 25 facilities.'; err.hidden = false; return; }
    chosen.add(text);
    render();
    refreshSave();
    qs('#custom-input').focus();
  });
  refreshSave();
}

saveBtn.addEventListener('click', async () => {
  await withBusy(saveBtn, async () => {
    try {
      const r = await api.put('/api/hospitals/me/facilities', { facilities: [...chosen] });
      chosen.clear();
      r.selected.forEach((f) => chosen.add(f));
      saved = key(chosen);
      toast.success('Facilities saved.');
      render();
    } catch (err) { toast.error(err instanceof ApiError ? (err.details?.facilities || err.message) : 'Could not save.'); }
  });
  refreshSave();
});

try {
  const d = await api.get('/api/hospitals/me/facilities');
  setTopbarHospital(d.hospital.name, `${d.hospital.district}, ${d.hospital.state}`);
  options = d.options;
  d.selected.forEach((f) => chosen.add(f));
  saved = key(chosen);
  render();
} catch (e) {
  content.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load the facilities. Please refresh.')}</p>`;
}
