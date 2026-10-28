// Doctor profile: photo, about, practice details (editable) and credentials (locked), plus certificates.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage, ROLE_HOME } from '/frontend/shared/layout.js';
import { esc, qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { openModal, confirmDialog } from '/frontend/shared/modal.js';
import { toast } from '/frontend/shared/toast.js';
import { addDocRow, buildDoctorFormData } from './doctor-form.js';

const user = await initPage({ roles: ['DOCTOR'] });
if (user.doctor_status !== 'APPROVED') {
  location.replace(ROLE_HOME.DOCTOR); // the dashboard shows the verification status
  await new Promise(() => {});
}

const main = qs('#app-main');
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX = 5 * 1024 * 1024;
const DOC_LABELS = { DEGREE: 'Degree certificate', REGISTRATION: 'Medical registration', CERTIFICATE: 'Certificate', ID_PROOF: 'ID proof', OTHER: 'Other' };

let doctor = null;

const initials = (name) => (name || '?').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function avatar(d, size) {
  return d.photo_url
    ? `<img src="${esc(d.photo_url)}" alt="Photo of ${esc(d.name)}" class="${size} rounded-full object-cover">`
    : `<span class="${size} flex items-center justify-center rounded-full bg-primary-container font-display text-headline-md text-on-primary" aria-hidden="true">${esc(initials(d.name))}</span>`;
}

function fact(label, value, empty = 'Not added yet') {
  return `<div><dt class="text-label-md uppercase tracking-wide text-on-surface-variant">${esc(label)}</dt>
    <dd class="mt-0.5 whitespace-pre-line text-body-md ${value ? '' : 'text-outline'}">${esc(value || empty)}</dd></div>`;
}

function sectionHead(title, buttonHtml = '') {
  return `<div class="mb-4 flex items-center justify-between gap-3"><h2 class="font-display text-headline-sm">${esc(title)}</h2>${buttonHtml}</div>`;
}

const editBtn = (id, label = 'Edit') => `<button type="button" id="${id}" class="btn-outline btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>${esc(label)}</button>`;

function render() {
  const d = doctor;
  const isPrivate = d.doctor_type === 'PRIVATE';
  main.innerHTML = `
    <section class="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div class="card flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:items-center sm:text-left">
        <div class="relative shrink-0">
          ${avatar(d, 'h-28 w-28 text-4xl')}
          <button type="button" id="photo-btn" class="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-primary-container text-on-primary shadow hover:bg-primary" aria-label="Change photo">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">photo_camera</span>
          </button>
        </div>
        <div class="min-w-0 flex-1">
          <div class="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span class="badge badge-success"><span class="material-symbols-outlined text-[14px]" aria-hidden="true">verified</span>Verified</span>
            <span class="badge badge-info">${isPrivate ? 'Private chamber' : 'Hospital doctor'}</span>
          </div>
          <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">${esc(d.name)}</h1>
          <p class="mt-1 text-body-lg text-on-surface-variant">${esc(d.specialty.name)} &middot; ${esc(d.location.district)}, ${esc(d.location.state)}</p>
          ${d.photo_url ? '' : '<p class="mt-2 text-body-sm text-secondary">Add a photo so patients recognise you.</p>'}
        </div>
      </div>

      <div class="card p-6">
        ${sectionHead('About you', editBtn('edit-profile'))}
        <p class="whitespace-pre-line text-body-md ${d.about ? '' : 'text-outline'}">${esc(d.about || 'You have not written an introduction yet. Patients read this before booking.')}</p>
      </div>

      <div class="card p-6">
        ${sectionHead(isPrivate ? 'Your chamber' : 'Your hospital', isPrivate ? editBtn('edit-practice') : '')}
        <dl class="grid gap-4 sm:grid-cols-2">
          ${isPrivate
            ? `${fact('Clinic / chamber name', d.clinic_name)}${fact('Facilities', d.facilities)}<div class="sm:col-span-2">${fact('Address', d.address)}</div>`
            : `${fact('Hospital', d.hospital_name)}<p class="self-end text-body-sm text-on-surface-variant sm:col-span-2">Your hospital manages the address and facilities shown to patients.</p>`}
        </dl>
      </div>

      <div class="card p-6">
        ${sectionHead('Verified credentials')}
        <dl class="grid gap-4 sm:grid-cols-2">
          ${fact('Specialty', d.specialty.name)}${fact('Location', `${d.location.district}, ${d.location.state}`)}
          <div class="sm:col-span-2">${fact('Qualifications', d.qualifications)}</div>
        </dl>
        <p class="mt-4 flex items-start gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">lock</span>
          These were checked by a Branch Admin, so you cannot change them here. To update them, contact support.</p>
      </div>

      <div class="card p-6">
        ${sectionHead('Certificates', `<button type="button" id="add-docs" class="btn-primary btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span>Add certificates</button>`)}
        ${d.documents.length
          ? `<ul class="divide-y divide-outline-variant rounded-xl border border-outline-variant">${d.documents.map((x) => `
              <li class="flex items-center justify-between gap-3 px-4 py-3">
                <span class="min-w-0"><span class="block truncate text-body-md">${esc(x.original_name || 'File')}</span>
                  <span class="text-body-sm text-on-surface-variant">${esc(DOC_LABELS[x.doc_type] || x.doc_type)}</span></span>
                <a href="/api/doctors/documents/${x.id}" target="_blank" rel="noopener" class="btn-outline btn-sm">View</a>
              </li>`).join('')}</ul>`
          : '<p class="text-body-md text-outline">No certificates uploaded.</p>'}
        <p class="mt-3 text-body-sm text-on-surface-variant">Only you and your Branch Admin can see these files.</p>
      </div>
    </section>`;

  qs('#photo-btn').addEventListener('click', openPhotoModal);
  qs('#edit-profile').addEventListener('click', () => openProfileModal(false));
  if (isPrivate) qs('#edit-practice').addEventListener('click', () => openProfileModal(true));
  qs('#add-docs').addEventListener('click', openDocsModal);
}

function update(next, message) {
  doctor = next;
  render();
  if (message) toast.success(message);
}

// ---- Edit about / chamber ---------------------------------------------------
function openProfileModal(focusPractice) {
  const isPrivate = doctor.doctor_type === 'PRIVATE';
  openModal({
    title: focusPractice ? 'Edit your chamber' : 'Edit your profile',
    size: 'max-w-xl',
    html: `<form id="profile-form" class="space-y-5" novalidate>
      <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      <div data-field>
        <label for="about" class="field-label">About you</label>
        <textarea id="about" name="about" rows="5" maxlength="2000" class="field-input" placeholder="Your experience, areas of interest, languages spoken..."></textarea>
        <p class="mt-1 text-body-sm text-on-surface-variant"><span id="about-count">0</span> / 2000</p>
      </div>
      ${isPrivate ? `
      <div data-field>
        <label for="clinic_name" class="field-label">Clinic / chamber name</label>
        <input id="clinic_name" name="clinic_name" type="text" maxlength="200" class="field-input" required>
      </div>
      <div data-field>
        <label for="address" class="field-label">Chamber address</label>
        <textarea id="address" name="address" rows="2" maxlength="500" class="field-input" required></textarea>
      </div>
      <div data-field>
        <label for="facilities" class="field-label">Facilities <span class="normal-case text-outline">(optional)</span></label>
        <textarea id="facilities" name="facilities" rows="2" maxlength="1000" class="field-input" placeholder="e.g. AC waiting room, ECG, parking nearby"></textarea>
      </div>` : ''}
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-cancel class="btn-outline">Cancel</button>
        <button type="submit" id="save" class="btn-accent">Save changes</button>
      </div>
    </form>`,
    onMount: (body, close) => {
      const form = qs('#profile-form', body);
      const f = form.elements;
      f.about.value = doctor.about || '';
      if (isPrivate) {
        f.clinic_name.value = doctor.clinic_name || '';
        f.address.value = doctor.address || '';
        f.facilities.value = doctor.facilities || '';
      }
      const count = qs('#about-count', body);
      const sync = () => { count.textContent = f.about.value.length; };
      f.about.addEventListener('input', sync); sync();
      qs('[data-cancel]', body).addEventListener('click', close);
      (focusPractice && isPrivate ? f.clinic_name : f.about).focus();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const alertBox = qs('#form-alert', body);
        alertBox.hidden = true;
        const payload = { about: f.about.value.trim() };
        const errors = {};
        if (isPrivate) {
          payload.clinic_name = f.clinic_name.value.trim();
          payload.address = f.address.value.trim();
          payload.facilities = f.facilities.value.trim();
          if (payload.clinic_name.length < 2) errors.clinic_name = 'Enter your clinic or chamber name.';
          if (payload.address.length < 5) errors.address = 'Enter the chamber address.';
        }
        if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
        await withBusy(qs('#save', body), async () => {
          try {
            const data = await api.post('/api/doctors/me/profile', payload);
            close();
            update(data.doctor, 'Profile saved.');
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            if (err.status === 422 && showFieldErrors(form, err.details)) return;
            alertBox.textContent = err.message; alertBox.hidden = false;
          }
        });
      });
    },
  });
}

// ---- Photo ------------------------------------------------------------------
function openPhotoModal() {
  openModal({
    title: 'Profile photo',
    html: `<div class="flex flex-col items-center gap-4">
      <div id="photo-preview" class="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full bg-surface-container">${avatar(doctor, 'h-40 w-40 text-5xl')}</div>
      <p class="text-center text-body-sm text-on-surface-variant">JPG, PNG or WEBP, up to 5 MB. A clear, front-facing photo works best.</p>
      <div id="photo-error" role="alert" hidden class="w-full rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      <input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-label="Choose photo">
      <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" id="choose" class="btn-outline"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">image</span>Choose photo</button>
        <button type="button" id="upload" class="btn-accent" disabled>Save photo</button>
        ${doctor.photo_url ? '<button type="button" id="remove" class="btn-outline text-error"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>Remove</button>' : ''}
      </div>
    </div>`,
    onMount: (body, close) => {
      const input = qs('#photo-file', body);
      const errorBox = qs('#photo-error', body);
      const upload = qs('#upload', body);
      let preview = null;
      const fail = (m) => { errorBox.textContent = m; errorBox.hidden = false; };

      qs('#choose', body).addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        errorBox.hidden = true;
        upload.disabled = true;
        const file = input.files[0];
        if (!file) return;
        if (!PHOTO_TYPES.includes(file.type)) { fail('Please choose a JPG, PNG or WEBP image.'); input.value = ''; return; }
        if (file.size > PHOTO_MAX) { fail('That photo is larger than 5 MB.'); input.value = ''; return; }
        if (preview) URL.revokeObjectURL(preview);
        preview = URL.createObjectURL(file);
        qs('#photo-preview', body).innerHTML = `<img src="${preview}" alt="Preview of the new photo" class="h-40 w-40 rounded-full object-cover">`;
        upload.disabled = false;
      });

      upload.addEventListener('click', () => withBusy(upload, async () => {
        const fd = new FormData();
        fd.append('photo', input.files[0]);
        try {
          const data = await api.upload('/api/doctors/me/photo', fd);
          close();
          update(data.doctor, 'Photo updated.');
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          fail(err.details && err.details.photo ? err.details.photo : err.message);
        }
      }));

      const remove = qs('#remove', body);
      if (remove) {
        remove.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: 'Remove your photo?', message: 'Patients will see your initials instead.', confirmText: 'Remove', danger: true }))) return;
          try {
            const data = await api.delete('/api/doctors/me/photo');
            close();
            update(data.doctor, 'Photo removed.');
          } catch (err) {
            fail(err instanceof ApiError ? err.message : 'Could not remove the photo.');
          }
        });
      }
    },
  });
}

// ---- Certificates -----------------------------------------------------------
function openDocsModal() {
  openModal({
    title: 'Add certificates',
    size: 'max-w-xl',
    html: `<form id="docs-form" class="space-y-4" novalidate>
      <div id="form-alert" role="alert" hidden class="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"></div>
      <p class="text-body-sm text-on-surface-variant">PDF, JPG or PNG, up to 5 MB each.</p>
      <div id="doc-rows" class="space-y-3"></div>
      <button type="button" id="add-row" class="btn-outline btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>Add another file</button>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" data-cancel class="btn-outline">Cancel</button>
        <button type="submit" id="save" class="btn-accent">Upload</button>
      </div>
    </form>`,
    onMount: (body, close) => {
      const form = qs('#docs-form', body);
      const rows = qs('#doc-rows', body);
      addDocRow(rows);
      qs('#add-row', body).addEventListener('click', () => addDocRow(rows));
      qs('[data-cancel]', body).addEventListener('click', close);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = qs('#form-alert', body);
        alertBox.hidden = true;
        const fd = buildDoctorFormData(form);
        if (!fd.getAll('documents[]').some((f) => f && f.size)) {
          alertBox.textContent = 'Choose at least one file.'; alertBox.hidden = false;
          if (!rows.children.length) addDocRow(rows);
          return;
        }
        await withBusy(qs('#save', body), async () => {
          try {
            const data = await api.upload('/api/doctors/me/documents', fd);
            close();
            update(data.doctor, 'Certificates uploaded.');
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            alertBox.textContent = (err.details && err.details.documents) || err.message;
            alertBox.hidden = false;
            if (!rows.children.length) addDocRow(rows);
          }
        });
      });
    },
  });
}

try {
  doctor = (await api.get('/api/doctors/me')).doctor;
  render();
} catch (e) {
  main.innerHTML = `<p class="m-6 rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load your profile. Please refresh.')}</p>`;
}
