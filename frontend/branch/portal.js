// Starts a Branch Admin portal page (dark sidebar, like reference screen 16) and gives the pages the helpers they share.
import { ApiError } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs } from '/frontend/shared/dom.js';

export const BRANCH_NAV = [
  { id: 'overview', label: 'Regional Overview', icon: 'dashboard', href: '/frontend/branch/dashboard.html' },
  { id: 'hospitals', label: 'Hospitals', icon: 'local_hospital', href: '/frontend/branch/hospitals.html' },
  { id: 'doctors', label: 'Doctors', icon: 'stethoscope', href: '/frontend/branch/doctors.html' },
  { id: 'support', label: 'Support', icon: 'support_agent', href: '#', soon: 'a later step' },
  { id: 'history', label: 'History', icon: 'history', href: '#', soon: 'a later step' },
];

const SCOPE = '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">map</span><span class="min-w-0 flex-1 truncate" data-branch-scope>Your districts</span>';

/** Open a Branch Admin page. Returns { user, main }. */
export async function startBranchPortal(active) {
  const user = await initPage({
    roles: ['BRANCH_ADMIN'],
    portal: { theme: 'dark', subtitle: 'Regional operations', navLabel: 'Branch admin', items: BRANCH_NAV, active, scope: SCOPE, topLeft: '' },
  });
  return { user, main: qs('#app-main') };
}

/** "Your districts: Kolkata, Howrah" under the logo. */
export function setScope(districts) {
  const el = qs('[data-branch-scope]');
  if (!el) return;
  el.textContent = districts.length === 1 ? districts[0].name : `${districts.length} districts`;
  el.title = districts.map((d) => d.name).join(', ');
}

export const skeleton = (n = 3, h = 'h-28') => Array.from({ length: n }, () => `<div class="${h} animate-pulse rounded-2xl bg-surface-container" aria-hidden="true"></div>`).join('');

export function pageHeader(title, text, actions = '') {
  return `<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="font-display text-headline-lg-mobile font-bold sm:text-headline-lg">${esc(title)}</h1>${text ? `<p class="mt-1 max-w-2xl text-body-md text-on-surface-variant">${esc(text)}</p>` : ''}</div>
      ${actions}
    </div>`;
}

export const num = (n) => Number(n).toLocaleString('en-IN');

export function fmtDate(s) {
  if (!s) return '';
  return new Date(s.replace(' ', 'T')).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const emptyBox = (icon, text) => `<div class="card p-8 text-center text-on-surface-variant"><span class="material-symbols-outlined mb-2 text-4xl text-outline" aria-hidden="true">${icon}</span><p>${esc(text)}</p></div>`;
export const errorBox = (e, fallback) => `<p class="rounded-xl bg-error-container px-4 py-3 text-on-error-container">${esc(e instanceof ApiError ? e.message : fallback)}</p>`;

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Status chips with counts. chips: [[key, label]], counts: {key: n}. Buttons carry data-chip. */
export function chipsHtml(chips, counts, active) {
  return chips.map(([key, label]) => {
    const on = key === active;
    return `<button type="button" data-chip="${key}" aria-pressed="${on}" class="rounded-full px-4 py-2 font-display text-label-lg transition-colors ${on ? 'bg-primary-container text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}">${esc(label)} <span class="${on ? 'opacity-90' : 'text-outline'}">${num(counts[key] ?? 0)}</span></button>`;
  }).join('');
}

/** Previous / next with "Showing 1-10 of 34". Buttons carry data-page. */
export function pagerHtml(p) {
  if (!p || p.total <= p.per_page) return p && p.total ? `<p class="mt-4 text-body-sm text-on-surface-variant">Showing all ${num(p.total)}</p>` : '';
  const from = (p.page - 1) * p.per_page + 1;
  const to = Math.min(p.total, p.page * p.per_page);
  return `<nav class="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Pages">
      <p class="text-body-sm text-on-surface-variant">Showing ${num(from)}-${num(to)} of ${num(p.total)}</p>
      <div class="flex items-center gap-2">
        <button type="button" class="btn-outline btn-sm" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span class="text-body-sm">Page ${p.page} of ${p.pages}</span>
        <button type="button" class="btn-outline btn-sm" data-page="${p.page + 1}" ${p.page >= p.pages ? 'disabled' : ''}>Next</button>
      </div>
    </nav>`;
}

/** The search box + district select row used on the Hospitals and Doctors pages. */
export function filterBarHtml(districts, placeholder) {
  return `<div class="flex flex-col gap-3 sm:flex-row">
      <div class="relative min-w-0 flex-1">
        <span class="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true">search</span>
        <label class="sr-only" for="f-q">Search</label>
        <input id="f-q" type="search" maxlength="100" placeholder="${esc(placeholder)}" class="field-input w-full !pl-12" autocomplete="off">
      </div>
      ${districts.length > 1 ? `<div class="sm:w-60"><label class="sr-only" for="f-district">District</label>
        <select id="f-district" class="field-input w-full"><option value="">All my districts</option>${districts.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>` : ''}
    </div>`;
}
