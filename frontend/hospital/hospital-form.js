// Hospital details fields shared by the invitation page and the "update and resubmit" window.
import { esc, qs } from '/frontend/shared/dom.js';

export const HOSPITAL_DOC_TYPES = [
  ['LICENSE', 'Hospital license'],
  ['REGISTRATION', 'Registration certificate'],
  ['CERTIFICATE', 'Other certificate'],
  ['OTHER', 'Other'],
];
export const HOSPITAL_DOC_LABELS = Object.fromEntries(HOSPITAL_DOC_TYPES);
const MAX_ROWS = 10;

/** HTML for: hospital name, address, phone and the document rows. */
export function hospitalFieldsHtml() {
  return `
    <div data-field>
      <label for="hospital_name" class="field-label">Hospital name</label>
      <input id="hospital_name" name="hospital_name" type="text" maxlength="200" class="field-input" required>
    </div>
    <div data-field>
      <label for="address" class="field-label">Address</label>
      <textarea id="address" name="address" rows="2" maxlength="500" class="field-input" placeholder="Street, area, pin code" required></textarea>
    </div>
    <div data-field>
      <label for="hospital_phone" class="field-label">Hospital phone <span class="normal-case text-outline">(optional)</span></label>
      <input id="hospital_phone" name="hospital_phone" type="tel" maxlength="20" class="field-input" inputmode="tel" autocomplete="off">
    </div>
    <fieldset data-field class="rounded-xl border border-outline-variant p-4">
      <legend class="px-2 font-display text-label-md uppercase tracking-wide text-on-surface-variant">License and registration</legend>
      <p class="mb-3 text-body-sm text-on-surface-variant">PDF, JPG or PNG, up to 5 MB each. The Branch Admin checks these before your hospital is listed.</p>
      <div id="doc-rows" class="space-y-3"></div>
      <button type="button" id="add-doc" class="btn-outline btn-sm mt-3"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>Add another file</button>
    </fieldset>`;
}

/** One "type + file" row. */
export function addHospitalDocRow(container) {
  if (container.children.length >= MAX_ROWS) return;
  const row = document.createElement('div');
  row.className = 'flex flex-col gap-2 sm:flex-row sm:items-center';
  row.innerHTML = `
    <select name="document_types[]" class="field-input sm:w-56" aria-label="Document type">${HOSPITAL_DOC_TYPES.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
    <input type="file" name="documents[]" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" class="field-input min-w-0 flex-1 text-body-sm" aria-label="Choose file">
    <button type="button" class="btn-outline btn-sm" data-remove aria-label="Remove this file"><span class="material-symbols-outlined text-[18px]">close</span></button>`;
  row.querySelector('[data-remove]').addEventListener('click', () => {
    row.remove();
    if (!container.children.length) addHospitalDocRow(container);
  });
  container.appendChild(row);
}

/** Pre-fill (optional) and wire the file rows. */
export function initHospitalFields(form, prefill = null) {
  if (prefill) {
    form.elements.hospital_name.value = prefill.name || prefill.hospital_name || '';
    form.elements.address.value = prefill.address || '';
    form.elements.hospital_phone.value = prefill.phone || '';
  }
  const rows = qs('#doc-rows', form);
  addHospitalDocRow(rows);
  qs('#add-doc', form).addEventListener('click', () => addHospitalDocRow(rows));
}

/** FormData for the API. Empty file rows are removed first so the file and type lists stay aligned. */
export function buildHospitalFormData(form) {
  form.querySelectorAll('#doc-rows > div').forEach((row) => {
    if (!row.querySelector('input[type=file]').files.length) row.remove();
  });
  return new FormData(form);
}

/** Instant feedback; the server checks everything again. */
export function validateHospitalFields(form) {
  const f = form.elements;
  const errors = {};
  if (f.hospital_name.value.trim().length < 2) errors.hospital_name = 'Enter the hospital name.';
  if (f.address.value.trim().length < 5) errors.address = 'Enter the hospital address.';
  return errors;
}
