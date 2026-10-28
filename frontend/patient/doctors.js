// Doctor list: filters (specialty, state, district, type, search), sorting, paging and the compare tray.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs, qsa } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';
import { doctorCard, savedLocation, saveLocation, wireLocationSelects } from './common.js';

await initPage({ navSearch: false, requireLogin: true });

const MAX_COMPARE = 4;
const params = new URLSearchParams(location.search);
const asId = (v) => (v && /^\d+$/.test(v) ? Number(v) : null);

// Location from the URL wins; otherwise the one remembered from the home page.
const remembered = savedLocation();
const hasUrlLocation = params.has('state_id') || params.has('district_id');
const filters = {
  specialty_id: asId(params.get('specialty_id')),
  state_id: hasUrlLocation ? asId(params.get('state_id')) : remembered.state_id,
  district_id: hasUrlLocation ? asId(params.get('district_id')) : remembered.district_id,
  type: ['HOSPITAL', 'PRIVATE'].includes(params.get('type')) ? params.get('type') : '',
  q: (params.get('q') || '').slice(0, 100),
  sort: ['soonest', 'fee_low', 'fee_high', 'name'].includes(params.get('sort')) ? params.get('sort') : 'soonest',
  page: asId(params.get('page')) || 1,
};

const els = {
  q: qs('#f-q'), specialty: qs('#f-specialty'), state: qs('#f-state'), district: qs('#f-district'), sort: qs('#f-sort'),
  results: qs('#results'), pager: qs('#pager'), title: qs('#title'), summary: qs('#summary'),
};
let specialties = [];

// ---- compare tray (kept while moving between pages and filters) -------------------
const CMP_KEY = 'hb_compare';
const readCompare = () => { try { const v = JSON.parse(sessionStorage.getItem(CMP_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => Number.isInteger(x.id)) : []; } catch { return []; } };
const writeCompare = (list) => { try { sessionStorage.setItem(CMP_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
let compare = readCompare();

function renderTray() {
  const tray = qs('#tray');
  tray.hidden = compare.length === 0;
  qs('#tray-count').textContent = compare.length;
  qs('#tray-chips').innerHTML = compare.map((c) => `<span class="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-body-sm">${esc(c.name)}<button type="button" data-remove="${c.id}" class="rounded-full p-0.5 hover:bg-surface-container-high" aria-label="Remove ${esc(c.name)} from comparison"><span class="material-symbols-outlined text-[16px]">close</span></button></span>`).join('');
  const go = qs('#tray-go');
  const ok = compare.length >= 2;
  go.setAttribute('aria-disabled', String(!ok));
  go.classList.toggle('pointer-events-none', !ok);
  go.classList.toggle('opacity-50', !ok);
  go.href = ok ? `/frontend/patient/compare.html?ids=${compare.map((c) => c.id).join(',')}` : '#';
  go.textContent = ok ? `Compare ${compare.length} doctors` : 'Pick at least 2';
  qsa('[data-compare]').forEach((box) => { box.checked = compare.some((c) => c.id === Number(box.dataset.compare)); });
}

qs('#tray').addEventListener('click', (e) => {
  if (e.target.closest('#tray-clear')) { compare = []; writeCompare(compare); renderTray(); return; }
  const rm = e.target.closest('[data-remove]');
  if (rm) { compare = compare.filter((c) => c.id !== Number(rm.dataset.remove)); writeCompare(compare); renderTray(); }
});

els.results.addEventListener('change', (e) => {
  const box = e.target.closest('[data-compare]');
  if (!box) return;
  const id = Number(box.dataset.compare);
  if (box.checked) {
    if (compare.length >= MAX_COMPARE) { box.checked = false; toast.info(`You can compare up to ${MAX_COMPARE} doctors at a time.`); return; }
    const name = box.closest('[data-doctor]').querySelector('h2').textContent;
    compare.push({ id, name });
  } else {
    compare = compare.filter((c) => c.id !== id);
  }
  writeCompare(compare);
  renderTray();
});

// ---- URL <-> filters ---------------------------------------------------------------
function syncUrl() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === null || v === '' || (k === 'page' && v === 1) || (k === 'sort' && v === 'soonest')) continue;
    q.set(k, v);
  }
  history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
}

function heading() {
  const sp = specialties.find((s) => s.id === filters.specialty_id);
  const base = sp ? `${sp.name} doctors` : (filters.q ? `Results for "${filters.q}"` : 'Find doctors');
  const place = filters.district_id ? els.district.selectedOptions[0].textContent : (filters.state_id ? els.state.selectedOptions[0].textContent : '');
  els.title.textContent = place && !filters.q ? `${base} in ${place}` : base;
  document.title = `${els.title.textContent} - Liberty Health Care`;
}

// ---- loading results ---------------------------------------------------------------
let seq = 0;
async function load() {
  const mine = ++seq;
  syncUrl();
  heading();
  els.results.setAttribute('aria-busy', 'true');
  els.results.innerHTML = '<div class="h-36 animate-pulse rounded-2xl bg-surface-container"></div><div class="h-36 animate-pulse rounded-2xl bg-surface-container"></div>';

  const q = new URLSearchParams({ sort: filters.sort, page: filters.page, per_page: 8 });
  for (const k of ['specialty_id', 'state_id', 'district_id', 'type', 'q']) if (filters[k]) q.set(k, filters[k]);
  try {
    const data = await api.get(`/api/doctors/search?${q}`);
    if (mine !== seq) return; // a newer search has started
    filters.page = data.page;
    els.summary.textContent = data.total === 0 ? 'No doctors found.' : `${data.total} doctor${data.total === 1 ? '' : 's'} found`;
    els.results.innerHTML = data.items.length
      ? data.items.map((d) => doctorCard(d, { compare: true, checked: compare.some((c) => c.id === d.id) })).join('')
      : `<div class="card p-8 text-center"><span class="material-symbols-outlined text-4xl text-outline" aria-hidden="true">search_off</span>
          <h2 class="mt-2 font-display text-headline-sm">No doctors match these filters</h2>
          <p class="mt-1 text-body-md text-on-surface-variant">Try another district, remove the type filter or search for something else.</p>
          <button type="button" id="empty-reset" class="btn-primary mt-4">Reset filters</button></div>`;
    renderPager(data);
    renderTray();
  } catch (e) {
    if (mine !== seq) return;
    els.summary.textContent = '';
    els.results.innerHTML = `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : 'Could not load doctors. Please try again.')}</p>`;
    els.pager.hidden = true;
  } finally {
    if (mine === seq) els.results.setAttribute('aria-busy', 'false');
  }
}

function renderPager(d) {
  els.pager.hidden = d.pages <= 1;
  if (d.pages <= 1) return;
  els.pager.innerHTML = `
    <button type="button" data-page="${d.page - 1}" class="btn-outline btn-sm" ${d.page <= 1 ? 'disabled' : ''}><span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>Previous</button>
    <span class="text-body-md text-on-surface-variant">Page ${d.page} of ${d.pages}</span>
    <button type="button" data-page="${d.page + 1}" class="btn-outline btn-sm" ${d.page >= d.pages ? 'disabled' : ''}>Next<span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span></button>`;
}

els.pager.addEventListener('click', (e) => {
  const b = e.target.closest('[data-page]');
  if (!b || b.disabled) return;
  filters.page = Number(b.dataset.page);
  load();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---- controls ----------------------------------------------------------------------
function setTypeTab() {
  qsa('[data-type]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.type === filters.type)));
}
qsa('[data-type]').forEach((t) => t.addEventListener('click', () => { filters.type = t.dataset.type; filters.page = 1; setTypeTab(); load(); }));

els.specialty.addEventListener('change', () => { filters.specialty_id = asId(els.specialty.value); filters.page = 1; load(); });
els.sort.addEventListener('change', () => { filters.sort = els.sort.value; filters.page = 1; load(); });

let timer;
els.q.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { filters.q = els.q.value.trim(); filters.page = 1; load(); }, 300);
});
qs('#filters').addEventListener('submit', (e) => e.preventDefault());

function resetFilters() {
  Object.assign(filters, { specialty_id: null, state_id: null, district_id: null, type: '', q: '', sort: 'soonest', page: 1 });
  saveLocation(null, null);
  els.q.value = ''; els.specialty.value = ''; els.sort.value = 'soonest';
  els.state.value = ''; els.state.dispatchEvent(new Event('change'));
  setTypeTab();
}
qs('#reset').addEventListener('click', resetFilters);
document.addEventListener('click', (e) => { if (e.target.closest('#empty-reset')) resetFilters(); });

// ---- start ---------------------------------------------------------------------------
els.q.value = filters.q;
els.sort.value = filters.sort;
setTypeTab();
try {
  specialties = (await api.get('/api/specialties')).items;
  els.specialty.innerHTML = '<option value="">All specialties</option>' + specialties.map((s) => `<option value="${s.id}"${s.id === filters.specialty_id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  await wireLocationSelects(els.state, els.district, {
    state_id: filters.state_id,
    district_id: filters.district_id,
    onChange: (state_id, district_id) => {
      filters.state_id = state_id; filters.district_id = district_id; filters.page = 1;
      saveLocation(state_id, district_id);
      load();
    },
  });
} catch { /* the list can still load without the dropdowns */ }
renderTray();
await load();
