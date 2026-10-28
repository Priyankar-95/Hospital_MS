// Starts a Hospital Admin portal page: guards the page, draws the sidebar frame, and gives helpers the pages share.
import { loadSession } from '/frontend/shared/api-client.js';
import { initPage } from '/frontend/shared/layout.js';
import { esc, qs } from '/frontend/shared/dom.js';

export const HOSPITAL_NAV = [
  { id: 'overview', label: 'Dashboard Overview', icon: 'grid_view', href: '/frontend/hospital/dashboard.html' },
  { id: 'doctors', label: 'Doctors', icon: 'stethoscope', href: '/frontend/hospital/doctors.html', soon: 'the next step' },
  { id: 'departments', label: 'Departments', icon: 'apartment', href: '/frontend/hospital/departments.html' },
  { id: 'beds', label: 'Bed Count', icon: 'bed', href: '/frontend/hospital/beds.html' },
  { id: 'facilities', label: 'Facilities & Amenities', icon: 'health_and_safety', href: '/frontend/hospital/facilities.html' },
  { id: 'fees', label: 'OPD Fees', icon: 'payments', href: '/frontend/hospital/fees.html', soon: 'a later step' },
  { id: 'frontdesk', label: 'Front Desk', icon: 'support_agent', href: '/frontend/hospital/staff.html', soon: 'a later step' },
  { id: 'profile', label: 'Hospital Profile', icon: 'domain', href: '/frontend/hospital/profile.html' },
];

const TOP_SKELETON = '<div class="h-9 w-56 animate-pulse rounded-full bg-surface-container" aria-hidden="true"></div>';

/**
 * Open a portal page. An admin whose hospital is not approved yet is sent to the dashboard, which shows the waiting screen.
 * Returns { user, main }.
 */
export async function startHospitalPortal(active) {
  const { user: sessionUser } = await loadSession();
  if (sessionUser && sessionUser.role === 'HOSPITAL_ADMIN' && sessionUser.hospital_status !== 'APPROVED' && active !== 'overview') {
    location.replace('/frontend/hospital/dashboard.html');
    await new Promise(() => {});
  }
  const portal = sessionUser && sessionUser.role === 'HOSPITAL_ADMIN' && sessionUser.hospital_status === 'APPROVED'
    ? { theme: 'light', subtitle: 'Hospital operations', navLabel: 'Facility operations', items: HOSPITAL_NAV, active, topLeft: TOP_SKELETON }
    : null;
  if (portal) qs('#plain')?.remove(); // the plain page frame is only for the waiting and rejected screens
  const user = await initPage({ roles: ['HOSPITAL_ADMIN'], portal });
  return { user, main: qs('#app-main'), approved: Boolean(portal) };
}

/** The hospital name and place in the top bar (filled when the page's data arrives, so the frame never waits). */
export function setTopbarHospital(name, place) {
  const box = qs('#portal-topleft');
  if (!box) return;
  box.innerHTML = `<div class="flex min-w-0 items-center gap-3 rounded-2xl bg-surface-container-low px-4 py-2">
      <span class="material-symbols-outlined text-primary" aria-hidden="true">domain</span>
      <span class="min-w-0 leading-tight"><span class="block truncate font-display text-label-lg">${esc(name)}</span><span class="block truncate text-body-sm text-on-surface-variant">${esc(place)}</span></span>
    </div>`;
}

/** Skeleton blocks while a page loads. */
export const skeleton = (n = 3, h = 'h-28') => Array.from({ length: n }, () => `<div class="${h} animate-pulse rounded-2xl bg-surface-container" aria-hidden="true"></div>`).join('');

export function pageHeader(title, text, actions = '') {
  return `<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="font-display text-headline-lg-mobile font-bold sm:text-headline-lg">${esc(title)}</h1>${text ? `<p class="mt-1 max-w-2xl text-body-md text-on-surface-variant">${esc(text)}</p>` : ''}</div>
      ${actions}
    </div>`;
}

/** Colour band for an occupancy percentage (as in the reference: calm, busy, critical). */
export function occupancyTone(percent) {
  if (percent >= 90) return { bar: 'bg-error', text: 'text-error', chip: 'bg-error-container text-on-error-container', label: 'Critical' };
  if (percent >= 70) return { bar: 'bg-secondary-container', text: 'text-secondary', chip: 'bg-secondary-fixed text-on-secondary-fixed-variant', label: 'High' };
  return { bar: 'bg-tertiary-container', text: 'text-tertiary', chip: 'bg-tertiary-fixed text-on-tertiary-fixed-variant', label: 'Normal' };
}

export const bar = (percent, cls) => `<div class="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuenow="${Math.round(percent)}" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-full ${cls}" style="width:${Math.min(100, Math.max(0, percent))}%"></div></div>`;

export const num = (n) => Number(n).toLocaleString('en-IN');
