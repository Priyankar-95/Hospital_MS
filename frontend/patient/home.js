import { api } from '/frontend/shared/api-client.js';
import { initPage, setSearchOpen, requireLogin } from '/frontend/shared/layout.js';
import { esc, qs } from '/frontend/shared/dom.js';
import { money, time12, fmtDate, savedLocation } from './common.js';

// Material Symbols icon per specialty slug (falls back to a generic icon)
const ICONS = {
  'general-medicine': 'stethoscope', cardiology: 'cardiology', dermatology: 'dermatology', pediatrics: 'child_care',
  orthopedics: 'orthopedics', 'gynecology-obstetrics': 'pregnant_woman', ent: 'hearing', ophthalmology: 'visibility',
  neurology: 'neurology', gastroenterology: 'gastroenterology', urology: 'urology', psychiatry: 'psychology',
  dentistry: 'dentistry', pulmonology: 'pulmonology', endocrinology: 'endocrinology',
};

const user = await initPage();
if (user) {
  qs('#hero-title').textContent = `Namaste, ${user.name.split(' ')[0]} \u{1F64F}`;
  qs('#hero-sub').textContent = 'How are you feeling today? Find the right doctor, compare fees and book your visit.';
  qs('#hero-signup').hidden = true;
  qs('#hero-actions').hidden = true;
  qs('#hero-actions').classList.replace('flex', 'hidden'); // .flex would otherwise override the hidden attribute
}

// ---- location: chosen in the navbar (remembered between visits) ---------------------------
let loc = savedLocation();
const stateSel = qs('#nav-state');
const districtSel = qs('#nav-district');

function doctorsUrl(extra = {}) {
  const q = new URLSearchParams();
  if (loc.state_id) q.set('state_id', loc.state_id);
  if (loc.district_id) q.set('district_id', loc.district_id);
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return `/frontend/patient/doctors.html${s ? `?${s}` : ''}`;
}

// The chosen place, shown in a card and carried into the main links
function placeName() {
  const d = districtSel && districtSel.selectedOptions[0];
  const st = stateSel && stateSel.selectedOptions[0];
  if (loc.district_id && d && d.value) return `${d.textContent}${st && st.value ? `, ${st.textContent}` : ''}`;
  if (loc.state_id && st && st.value) return st.textContent;
  return '';
}
function refreshPlace() {
  const name = placeName();
  qs('#place-card').hidden = !name;
  qs('#place-name').textContent = name;
  qs('#browse-link').href = doctorsUrl();
  qs('#hospital-all').href = doctorsUrl({ type: 'HOSPITAL' });
  qs('#er-link').href = doctorsUrl({ type: 'HOSPITAL' });
}
refreshPlace();

// The navbar tells us when the place changes
window.addEventListener('location-change', (e) => {
  loc = e.detail;
  refreshPlace();
  loadSpecialties();
  loadHospitals();
});

// ---- specialties -----------------------------------------------------------------
const grid = qs('#specialty-grid');
const moreBtn = qs('#specialty-more');
const TOP_SPECIALTIES = 6;
let specialties = [];
let showAll = false;

function renderSpecialties() {
  // Specialties with doctors come first, busiest first
  const sorted = [...specialties].sort((a, b) => (b.doctor_count - a.doctor_count) || a.name.localeCompare(b.name));
  const list = showAll ? sorted : sorted.slice(0, TOP_SPECIALTIES);
  grid.innerHTML = list.map((s, i) => {
    const active = !showAll && i === 0 && s.doctor_count > 0;
    return `
      <a href="${esc(doctorsUrl({ specialty_id: s.id }))}" class="flex flex-col items-center justify-center rounded-2xl p-3.5 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-pop ${active ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'} ${s.doctor_count ? '' : 'opacity-70'}">
        <span class="mb-2 flex h-11 w-11 items-center justify-center rounded-xl ${active ? 'bg-on-primary/15' : 'bg-surface-container-low text-primary'}">
          <span class="material-symbols-outlined text-2xl" aria-hidden="true">${esc(ICONS[s.slug] || 'medical_services')}</span>
        </span>
        <h3 class="font-display text-label-md font-semibold ${active ? 'text-on-primary' : 'text-on-surface'}">${esc(s.name)}</h3>
        <p class="mt-0.5 text-label-sm ${active ? 'opacity-80' : s.doctor_count ? 'text-primary' : 'text-outline'}">${s.doctor_count ? `${s.doctor_count} doctor${s.doctor_count === 1 ? '' : 's'}` : 'No doctors yet'}</p>
        ${s.doctor_count && s.fee_from ? `<p class="text-label-sm ${active ? 'opacity-80' : 'text-on-surface-variant'}">from ${esc(money(s.fee_from))}</p>` : ''}
      </a>`;
  }).join('');
  moreBtn.hidden = specialties.length <= TOP_SPECIALTIES;
  moreBtn.innerHTML = showAll
    ? 'Show fewer <span class="material-symbols-outlined text-base" aria-hidden="true">expand_less</span>'
    : `View all ${specialties.length} specialties <span class="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>`;
}

moreBtn.addEventListener('click', () => { showAll = !showAll; renderSpecialties(); });

let specialtiesRun = 0; // newest request wins, so a slow older answer cannot overwrite a newer one
async function loadSpecialties() {
  const run = ++specialtiesRun;
  const q = new URLSearchParams();
  if (loc.state_id) q.set('state_id', loc.state_id);
  if (loc.district_id) q.set('district_id', loc.district_id);
  try {
    const items = (await api.get(`/api/specialties${q.toString() ? `?${q}` : ''}`)).items;
    if (run !== specialtiesRun) return;
    specialties = items;
    qs('#specialty-sub').textContent = loc.state_id || loc.district_id
      ? 'Doctor counts are for the place you chose above.'
      : 'Pick the department that matches your problem.';
    renderSpecialties();
    renderCommonSearches();
  } catch {
    grid.innerHTML = '<p class="col-span-full rounded-xl bg-error-container px-4 py-3 text-on-error-container">Could not load specialties. Please refresh the page.</p>';
  }
}

// "Common searches": the specialties with the most doctors; one tap fills the search box
function renderCommonSearches() {
  const top = [...specialties].filter((s) => s.doctor_count > 0).sort((a, b) => b.doctor_count - a.doctor_count).slice(0, 4);
  const box = qs('#common-searches');
  box.querySelectorAll('button').forEach((b) => b.remove());
  box.hidden = top.length === 0;
  for (const s of top) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rounded-full bg-surface-container px-3 py-1 text-label-sm text-on-surface-variant transition hover:bg-surface-container-high';
    b.textContent = s.name;
    b.addEventListener('click', () => {
      if (!user) { requireLogin(); return; } // guests only look at this page
      const input = qs('#nav-q');
      if (!input) return;
      setSearchOpen(true); // spreads the navbar search out (on a phone it opens the panel)
      input.value = s.name;
      input.focus();
    });
    box.appendChild(b);
  }
}

// ---- verified hospitals ----------------------------------------------------------------
const hospitalSection = qs('#hospitals');
const hospitalGrid = qs('#hospital-grid');

function hospitalCard(h) {
  const next = h.next_available;
  const initial = (h.name || '?').trim()[0].toUpperCase();
  return `
    <article class="card flex flex-col overflow-hidden" data-hospital="${h.id}">
      <div class="relative flex h-32 items-center justify-center bg-gradient-to-br from-primary-container/20 via-surface-container-low to-secondary-fixed/40">
        <span class="font-display text-display-lg font-extrabold text-primary/30" aria-hidden="true">${esc(initial)}</span>
        <span class="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-surface-container-lowest/95 px-2.5 py-1 text-label-sm font-bold text-tertiary shadow-sm"><span class="material-symbols-outlined text-xs" aria-hidden="true">verified</span>Verified hospital</span>
        <span class="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg bg-on-surface/60 px-2.5 py-1 text-label-sm text-white backdrop-blur-md"><span class="material-symbols-outlined text-xs" aria-hidden="true">location_on</span>${esc(h.district)}</span>
      </div>
      <div class="flex flex-1 flex-col justify-between p-4">
        <div>
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="font-display text-headline-sm font-bold leading-snug">${esc(h.name)}</h3>
              <p class="mt-0.5 line-clamp-2 text-body-sm text-on-surface-variant">${esc(h.address)}</p>
            </div>
            ${h.fee_from ? `<div class="shrink-0 text-right"><span class="block text-label-sm text-on-surface-variant">Consult from</span><span class="font-display text-headline-sm font-extrabold text-primary">${esc(money(h.fee_from))}</span></div>` : ''}
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-on-surface-variant">
            ${next ? `<span class="flex items-center gap-1 font-semibold ${next.is_today ? 'text-tertiary' : 'text-secondary'}"><span class="material-symbols-outlined text-sm" aria-hidden="true">schedule</span>Next: ${esc(next.is_today ? 'Today' : fmtDate(next.date))}, ${esc(time12(next.time))}</span>` : '<span>No open times right now</span>'}
            <span>&bull; ${h.doctor_count} doctor${h.doctor_count === 1 ? '' : 's'}</span>
            ${h.total_beds ? `<span>&bull; ${h.total_beds} beds</span>` : ''}
            ${h.facilities.map((f) => `<span>&bull; ${esc(f)}</span>`).join('')}
          </div>
        </div>
        <div class="mt-4 flex items-center gap-2">
          <a href="${esc(doctorsUrl({ type: 'HOSPITAL', q: h.name }))}" class="btn-primary flex-1"><span class="material-symbols-outlined text-lg" aria-hidden="true">calendar_month</span>Book a doctor here</a>
          ${h.phone ? `<a href="tel:${esc(h.phone.replace(/[^0-9+]/g, ''))}" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface transition hover:bg-surface-container-high" title="Call ${esc(h.name)}" aria-label="Call ${esc(h.name)}"><span class="material-symbols-outlined text-lg" aria-hidden="true">call</span></a>` : ''}
        </div>
      </div>
    </article>`;
}

let hospitalsRun = 0;
async function loadHospitals() {
  const run = ++hospitalsRun;
  const q = new URLSearchParams({ limit: '3' });
  if (loc.state_id) q.set('state_id', loc.state_id);
  if (loc.district_id) q.set('district_id', loc.district_id);
  try {
    const d = await api.get(`/api/home/hospitals?${q}`);
    if (run !== hospitalsRun) return;
    hospitalSection.hidden = d.items.length === 0;
    const where = placeName();
    qs('#hospital-sub').textContent = `${d.total} verified hospital${d.total === 1 ? '' : 's'}${where ? ` in ${where}` : ''}, soonest available first`;
    hospitalGrid.innerHTML = d.items.map(hospitalCard).join('');
  } catch {
    hospitalSection.hidden = true; // the rest of the page works without it
  }
}

// ---- live counts -------------------------------------------------------------------------
async function loadStats() {
  try {
    const s = await api.get('/api/home/stats');
    // A green chip, only when something really was added in the period (counted from real dates)
    const chip = (g, noun) => (g && g.new > 0
      ? `<span class="mt-2 inline-flex items-center gap-1 rounded-full bg-tertiary-fixed/70 px-2.5 py-1 text-label-md font-bold text-on-tertiary-fixed-variant" data-growth><span class="material-symbols-outlined text-[16px]" aria-hidden="true">trending_up</span>${g.new.toLocaleString('en-IN')} new${noun ? ` ${noun}` : ''} this month${g.percent !== null ? ` &middot; +${g.percent}%` : ''}</span>`
      : '');
    const cell = (n, label, sub, cls, growth = '') => `<div class="flex flex-col items-center"><span class="font-display text-display-lg-mobile font-extrabold sm:text-display-lg ${cls}">${n.toLocaleString('en-IN')}</span><span class="mt-1 text-label-md font-bold">${label}</span><span class="text-body-sm text-on-surface-variant">${sub}</span>${growth}</div>`;
    qs('#stats').innerHTML =
      cell(s.doctors, 'Verified doctors', `Across ${s.districts} district${s.districts === 1 ? '' : 's'}`, 'text-primary', chip(s.growth.doctors, '')) +
      cell(s.hospitals, 'Verified hospitals', 'Checked before listing', 'text-secondary', chip(s.growth.hospitals, '')) +
      cell(s.specialties, 'Specialties', 'With doctors ready to book', 'text-tertiary') +
      cell(s.appointments, 'Appointments booked', 'Through Liberty Health Care', 'text-on-surface', chip(s.growth.appointments, ''));
  } catch {
    qs('#stats').closest('section').hidden = true;
  }
}

await loadSpecialties();
await Promise.all([loadHospitals(), loadStats()]);

// ---- symptoms -> recommended department --------------------------------------------
const chips = qs('#symptom-chips');
const recommend = qs('#recommend');
const picked = new Set();
let symptoms = [];

// Only the first row of problems shows until "View all" is pressed (searching shows every match)
const moreSymptoms = qs('#symptom-more');
let symptomsExpanded = false;

function syncChipRows(searching) {
  const open = symptomsExpanded || searching;
  chips.classList.toggle('max-h-[2.75rem]', !open);
  chips.classList.toggle('overflow-hidden', !open);
  chips.classList.toggle('max-h-56', open);
  chips.classList.toggle('overflow-y-auto', open);
  chips.classList.toggle('pr-1', open);
  // Offer the toggle only when there is more than one row to show
  const hasMore = open ? symptomsExpanded && !searching : chips.scrollHeight > chips.clientHeight + 1;
  moreSymptoms.hidden = searching || !hasMore;
  moreSymptoms.setAttribute('aria-expanded', String(symptomsExpanded));
  moreSymptoms.innerHTML = symptomsExpanded
    ? 'Show fewer <span class="material-symbols-outlined text-base" aria-hidden="true">expand_less</span>'
    : `View all ${symptoms.length} problems <span class="material-symbols-outlined text-base" aria-hidden="true">expand_more</span>`;
}

function renderChips() {
  const needle = qs('#symptom-filter').value.trim().toLowerCase();
  let list = symptoms.filter((s) => picked.has(s.id) || s.name.toLowerCase().includes(needle));
  // While collapsed, chosen problems come first so they are never hidden below the fold
  if (!symptomsExpanded && !needle) list = [...list.filter((s) => picked.has(s.id)), ...list.filter((s) => !picked.has(s.id))];
  chips.innerHTML = list.length
    ? list.map((s) => `<button type="button" data-symptom="${s.id}" aria-pressed="${picked.has(s.id)}" class="rounded-full border px-4 py-2 font-display text-label-md transition ${picked.has(s.id) ? 'border-primary-container bg-primary-container text-on-primary' : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'}">${esc(s.name)}</button>`).join('')
    : '<p class="text-body-md text-on-surface-variant">No problem matches that. Try another word, or browse the specialties below.</p>';
  syncChipRows(needle !== '');
}

moreSymptoms.addEventListener('click', () => { symptomsExpanded = !symptomsExpanded; renderChips(); });
window.addEventListener('resize', () => syncChipRows(qs('#symptom-filter').value.trim() !== ''));

function renderRecommendation() {
  if (!picked.size) { recommend.hidden = true; recommend.innerHTML = ''; return; }
  const score = new Map();
  for (const s of symptoms.filter((x) => picked.has(x.id))) {
    for (const sp of s.specialties) score.set(sp.id, (score.get(sp.id) || 0) + 1);
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([id, n]) => ({ ...specialties.find((s) => s.id === id), n })).filter((s) => s.id);
  recommend.hidden = false;
  recommend.innerHTML = `
    <h3 class="font-display text-headline-sm">Suggested ${ranked.length === 1 ? 'department' : 'departments'}</h3>
    <p class="mt-1 text-body-sm text-on-surface-variant">Based on ${picked.size} problem${picked.size === 1 ? '' : 's'} you picked. Not sure? A General Medicine doctor can help first.</p>
    <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${ranked.map((s, i) => `
        <a href="${esc(doctorsUrl({ specialty_id: s.id }))}" class="flex flex-col gap-1 rounded-2xl border ${i === 0 ? 'border-primary-container bg-primary-fixed/30' : 'border-outline-variant'} p-4 transition hover:shadow-pop">
          ${i === 0 ? '<span class="badge badge-info w-fit">Best match</span>' : ''}
          <span class="font-display text-label-lg">${esc(s.name)}</span>
          <span class="text-body-sm text-on-surface-variant">Matches ${s.n} of ${picked.size} problem${picked.size === 1 ? '' : 's'}</span>
          <span class="mt-1 text-body-sm font-semibold text-primary">${s.doctor_count ? `${s.doctor_count} doctor${s.doctor_count === 1 ? '' : 's'}` : 'No doctors yet'} &rarr;</span>
        </a>`).join('')}
    </div>`;
}

try {
  symptoms = (await api.get('/api/symptoms')).items;
  renderChips();
} catch {
  chips.innerHTML = '<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">Could not load the list of problems. Please refresh the page.</p>';
}

chips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-symptom]');
  if (!b) return;
  if (!user) { requireLogin(); return; } // guests only look at this page
  const id = Number(b.dataset.symptom);
  if (picked.has(id)) picked.delete(id); else picked.add(id);
  renderChips();
  renderRecommendation();
});
qs('#symptom-filter').addEventListener('input', renderChips);
for (const evt of ['focus', 'pointerdown', 'click']) qs('#symptom-filter').addEventListener(evt, (e) => { if (!user) { e.preventDefault(); e.target.blur(); requireLogin(); } });
