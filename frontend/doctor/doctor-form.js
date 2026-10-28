// Practice-details fields shared by doctor registration and resubmission.
import { api } from '/frontend/shared/api-client.js';
import { esc, qs } from '/frontend/shared/dom.js';

const DOC_TYPES = [
  ['DEGREE', 'Degree certificate'],
  ['REGISTRATION', 'Medical registration'],
  ['CERTIFICATE', 'Other certificate'],
  ['ID_PROOF', 'ID proof'],
  ['OTHER', 'Other'],
];
const MAX_ROWS = 10;

/** HTML for: specialty, state, district, qualifications, clinic, address, about, documents. */
export function profileFieldsHtml() {
  return `
    <div data-field>
      <label for="specialty_id" class="field-label">Specialty</label>
      <select id="specialty_id" name="specialty_id" class="field-input" required><option value="">Loading...</option></select>
    </div>
    <div class="grid gap-5 sm:grid-cols-2">
      <div data-field>
        <label for="state_id" class="field-label">State</label>
        <select id="state_id" name="state_id" class="field-input" required><option value="">Loading...</option></select>
      </div>
      <div data-field>
        <label for="district_id" class="field-label">District</label>
        <select id="district_id" name="district_id" class="field-input" required disabled><option value="">Choose a state first</option></select>
      </div>
    </div>
    <div data-field>
      <label for="qualifications" class="field-label">Qualifications</label>
      <input id="qualifications" name="qualifications" type="text" maxlength="500" class="field-input" placeholder="e.g. MBBS, MD (Dermatology)" required>
    </div>
    <div data-field>
      <label for="clinic_name" class="field-label">Clinic / chamber name</label>
      <input id="clinic_name" name="clinic_name" type="text" maxlength="200" class="field-input" placeholder="e.g. Roy Skin &amp; Hair Clinic" required>
    </div>
    <div data-field>
      <label for="address" class="field-label">Chamber address</label>
      <textarea id="address" name="address" rows="2" maxlength="500" class="field-input" placeholder="Street, area, pin code" required></textarea>
    </div>
    <div data-field>
      <label for="about" class="field-label">About you <span class="normal-case text-outline">(optional)</span></label>
      <textarea id="about" name="about" rows="3" maxlength="2000" class="field-input" placeholder="A short introduction patients will see"></textarea>
    </div>
    <fieldset data-field class="rounded-xl border border-outline-variant p-4">
      <legend class="px-2 font-display text-label-md uppercase tracking-wide text-on-surface-variant">Certificates and registration</legend>
      <p class="mb-3 text-body-sm text-on-surface-variant">PDF, JPG or PNG, up to 5 MB each. The Branch Admin checks these before your account is activated.</p>
      <div id="doc-rows" class="space-y-3"></div>
      <button type="button" id="add-doc" class="btn-outline btn-sm mt-3"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>Add another file</button>
    </fieldset>`;
}

function option(value, label, selected = false) {
  return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
}

/** Adds one "type + file" row to a container. Also used by the "Add certificates" modal on the profile page. */
export function addDocRow(container) {
  if (container.children.length >= MAX_ROWS) return;
  const row = document.createElement('div');
  row.className = 'flex flex-col gap-2 sm:flex-row sm:items-center';
  row.innerHTML = `
    <select name="document_types[]" class="field-input sm:w-52" aria-label="Document type">${DOC_TYPES.map(([v, l]) => option(v, l)).join('')}</select>
    <input type="file" name="documents[]" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" class="field-input min-w-0 flex-1 text-body-sm" aria-label="Choose file">
    <button type="button" class="btn-outline btn-sm" data-remove aria-label="Remove this file"><span class="material-symbols-outlined text-[18px]">close</span></button>`;
  row.querySelector('[data-remove]').addEventListener('click', () => {
    row.remove();
    if (!container.children.length) addDocRow(container);
  });
  container.appendChild(row);
}

/** Fill the dropdowns from the API and wire the state -> district dependency and the file rows. */
export async function initProfileFields(form, prefill = null) {
  const specialty = form.elements.specialty_id;
  const state = form.elements.state_id;
  const district = form.elements.district_id;

  async function loadDistricts(stateId, selectedId = null) {
    district.disabled = true;
    district.innerHTML = '<option value="">Loading...</option>';
    if (!stateId) { district.innerHTML = '<option value="">Choose a state first</option>'; return; }
    const { items } = await api.get(`/api/locations/districts?state_id=${encodeURIComponent(stateId)}`);
    district.innerHTML = '<option value="">Select district</option>' + items.map((d) => option(d.id, d.name, String(d.id) === String(selectedId))).join('');
    district.disabled = false;
  }

  const [specs, states] = await Promise.all([api.get('/api/specialties'), api.get('/api/locations/states')]);
  specialty.innerHTML = '<option value="">Select specialty</option>' + specs.items.map((s) => option(s.id, s.name, prefill && s.id === prefill.specialty.id)).join('');
  state.innerHTML = '<option value="">Select state</option>' + states.items.map((s) => option(s.id, s.name, prefill && s.id === prefill.location.state_id)).join('');
  state.addEventListener('change', () => loadDistricts(state.value));
  if (prefill) {
    await loadDistricts(prefill.location.state_id, prefill.location.district_id);
    form.elements.qualifications.value = prefill.qualifications || '';
    form.elements.clinic_name.value = prefill.clinic_name || '';
    form.elements.address.value = prefill.address || '';
    form.elements.about.value = prefill.about || '';
  }

  const rows = qs('#doc-rows', form);
  addDocRow(rows);
  qs('#add-doc', form).addEventListener('click', () => addDocRow(rows));
}

/** FormData for the API. Empty file rows are removed first so file and type lists stay aligned. */
export function buildDoctorFormData(form) {
  form.querySelectorAll('#doc-rows > div').forEach((row) => {
    const file = row.querySelector('input[type=file]');
    if (!file.files.length) row.remove();
  });
  const fd = new FormData(form);
  fd.delete('state_id'); // only used to filter districts
  return fd;
}

/** Client-side check for instant feedback. The server validates everything again. */
export function validateDoctorProfile(form) {
  const f = form.elements;
  const errors = {};
  if (!f.specialty_id.value) errors.specialty_id = 'Choose your specialty.';
  if (!f.state_id.value) errors.state_id = 'Choose your state.';
  if (!f.district_id.value) errors.district_id = 'Choose your district.';
  if (f.qualifications.value.trim().length < 2) errors.qualifications = 'Enter your qualifications.';
  if (f.clinic_name.value.trim().length < 2) errors.clinic_name = 'Enter your clinic or chamber name.';
  if (f.address.value.trim().length < 5) errors.address = 'Enter the chamber address.';
  return errors;
}
