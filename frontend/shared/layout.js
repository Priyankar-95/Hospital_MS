// Shared page layout: header with a role-specific navbar, footer, and page guards.
// Usage in a page:  const user = await initPage({ roles: ['DOCTOR'] });
// Pages need <div id="app-header"></div> and <div id="app-footer"></div>.
import { loadSession, logout } from './api-client.js';
import { esc, qs, qsa } from './dom.js';
import { toast } from './toast.js';
import { bindAuthTriggers, openAuthModal } from './auth-modal.js';

export const APP_NAME = 'Liberty Health Care';
export const LOGIN_URL = '/frontend/shared/login.html';

export const ROLE_LABELS = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  HOSPITAL_ADMIN: 'Hospital Admin',
  HOSPITAL_FRONTDESK: 'Front Desk',
  BRANCH_ADMIN: 'Branch Admin',
  VENDOR_ADMIN: 'Vendor',
  SUPER_ADMIN: 'Super Admin',
};

// Where each role lands after login. Mirrors role_home_path() in backend/core/rbac.php.
export const ROLE_HOME = {
  PATIENT: '/frontend/patient/index.html',
  DOCTOR: '/frontend/doctor/dashboard.html',
  HOSPITAL_ADMIN: '/frontend/hospital/dashboard.html',
  HOSPITAL_FRONTDESK: '/frontend/hospital/frontdesk.html',
  BRANCH_ADMIN: '/frontend/branch/dashboard.html',
  VENDOR_ADMIN: '/frontend/vendor/dashboard.html',
  SUPER_ADMIN: '/frontend/admin/dashboard.html',
};

// Navbar entries. `href` = live page. `soon` = built in a later phase: shown but not clickable.
const PATIENT_NAV = [
  { label: 'Find Doctors', href: '/frontend/patient/doctors.html' },
  { label: 'Hospitals', href: '/frontend/patient/doctors.html?type=HOSPITAL' },
  { label: 'Specialties', href: '/frontend/patient/index.html#specialties' },
  { label: 'Pharmacy', soon: 'Phase 3' },
];
const NAV = {
  GUEST: PATIENT_NAV,
  PATIENT: [...PATIENT_NAV, { label: 'My Appointments', href: '/frontend/patient/appointments.html' }],
  DOCTOR: [
    { label: 'Dashboard', href: ROLE_HOME.DOCTOR },
    { label: 'Appointments', href: '/frontend/doctor/appointments.html' },
    { label: 'Schedule', href: '/frontend/doctor/schedule.html' },
    { label: 'Profile', href: '/frontend/doctor/profile.html' },
  ],
  HOSPITAL_ADMIN: [
    { label: 'Dashboard', href: ROLE_HOME.HOSPITAL_ADMIN },
    { label: 'Doctors', soon: 'Phase 2' },
    { label: 'Front Desk', soon: 'Phase 2' },
    { label: 'Hospital Profile', soon: 'Phase 2' },
  ],
  HOSPITAL_FRONTDESK: [
    { label: 'Appointments', href: ROLE_HOME.HOSPITAL_FRONTDESK },
  ],
  BRANCH_ADMIN: [
    { label: 'Verification Queue', href: ROLE_HOME.BRANCH_ADMIN },
    { label: 'Support', soon: 'Phase 2' },
    { label: 'History', soon: 'Phase 2' },
  ],
  VENDOR_ADMIN: [
    { label: 'Dashboard', href: ROLE_HOME.VENDOR_ADMIN },
    { label: 'Inventory', soon: 'Phase 3' },
    { label: 'Orders', soon: 'Phase 3' },
  ],
  SUPER_ADMIN: [
    { label: 'Dashboard', href: ROLE_HOME.SUPER_ADMIN },
    { label: 'Branch Admins', soon: 'Phase 4' },
    { label: 'Reports', soon: 'Phase 4' },
    { label: 'Settings', soon: 'Phase 4' },
  ],
};

function navLink(item, current, mobile) {
  const base = mobile ? 'block w-full text-left rounded-xl px-4 py-3' : 'nav-pill';
  if (item.soon) {
    return `<span class="${base} nav-pill-soon" title="Coming in ${esc(item.soon)}" aria-disabled="true">${esc(item.label)}</span>`;
  }
  const active = item.href === current;
  return `<a href="${esc(item.href)}" class="${base} ${active ? 'nav-pill-active' : ''}" ${active ? 'aria-current="page"' : ''}>${esc(item.label)}</a>`;
}

// Doctors have their own rich profile page; everyone else uses the shared account page.
function profileUrl(user) {
  return user.role === 'DOCTOR' ? '/frontend/doctor/profile.html' : '/frontend/shared/account.html';
}

/** Round profile picture, or the person's initials when there is none. `size` is Tailwind height + width classes. */
export function avatarHtml(user, size = 'h-9 w-9', textSize = 'text-label-md') {
  if (user.avatar_url) {
    return `<img src="${esc(user.avatar_url)}" alt="" class="${size} shrink-0 rounded-full object-cover">`;
  }
  return `<span class="flex ${size} shrink-0 items-center justify-center rounded-full bg-primary-container font-display ${textSize} text-on-primary" aria-hidden="true">${esc(initials(user.name))}</span>`;
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

// ---- header -------------------------------------------------------------------------------
let layoutState = { withSearch: false, guest: false };

function renderHeader(user, withSearch = false) {
  // A doctor who is not approved yet sees no portal menu, only the verification screen.
  const unverified = user && ((user.role === 'DOCTOR' && user.doctor_status !== 'APPROVED') || (user.role === 'HOSPITAL_ADMIN' && user.hospital_status !== 'APPROVED'));
  const items = unverified ? [] : (NAV[user ? user.role : 'GUEST'] || []);
  const current = location.pathname;
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const isDoctor = user && user.role === 'DOCTOR';

  // Doctors have their own profile page; everyone else gets "Profile settings" as a modal
  const profileItem = (mobile) => {
    const cls = mobile
      ? 'btn-outline mb-2 w-full'
      : 'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-body-md hover:bg-surface-container';
    const icon = `<span class="material-symbols-outlined text-[${mobile ? 18 : 20}px]" aria-hidden="true">manage_accounts</span>`;
    return isDoctor
      ? `<a href="${profileUrl(user)}" ${mobile ? '' : 'role="menuitem"'} class="${cls}">${icon}Profile settings</a>`
      : `<button type="button" ${mobile ? '' : 'role="menuitem"'} data-open-account class="${cls}">${icon}Profile settings</button>`;
  };

  const authArea = user
    ? `<div class="relative hidden md:block" data-user-menu>
         <button type="button" data-user-toggle aria-haspopup="menu" aria-expanded="false" aria-controls="user-dropdown" class="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-surface-container">
           ${avatarHtml(user, 'h-9 w-9')}
           <span class="hidden text-left leading-tight min-[1180px]:block">
             <span class="block max-w-[9rem] truncate font-display text-label-lg" data-user-name>${esc(user.name)}</span>
             <span class="block text-body-sm text-on-surface-variant">${esc(ROLE_LABELS[user.role] || user.role)}</span>
           </span>
           <span class="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden="true">expand_more</span>
         </button>
         <div id="user-dropdown" role="menu" hidden class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-outline-variant bg-surface p-1 shadow-lg">
           ${profileItem(false)}
           <button type="button" role="menuitem" data-logout class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-body-md text-error hover:bg-surface-container"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>Log out</button>
         </div>
       </div>`
    : `<div class="hidden items-center gap-2 md:flex">
         <a href="${LOGIN_URL}?return_to=${returnTo}" data-auth="login" class="btn-outline btn-sm">Log in</a>
         <a href="/frontend/shared/register.html?return_to=${returnTo}" data-auth="register" class="btn-primary btn-sm">Sign up</a>
       </div>`;

  const mobileAuth = user
    ? `<div class="mt-2 border-t border-outline-variant pt-3">
         <p class="px-4 font-display text-label-lg">${esc(user.name)}</p>
         <p class="mb-2 px-4 text-body-sm text-on-surface-variant">${esc(ROLE_LABELS[user.role] || user.role)}</p>
         ${profileItem(true)}
         <button type="button" data-logout class="btn-outline w-full text-error"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>Log out</button>
       </div>`
    : `<div class="mt-2 grid grid-cols-2 gap-2 border-t border-outline-variant pt-3">
         <a href="${LOGIN_URL}?return_to=${returnTo}" data-auth="login" class="btn-outline">Log in</a>
         <a href="/frontend/shared/register.html?return_to=${returnTo}" data-auth="register" class="btn-primary">Sign up</a>
       </div>`;

  // The search lives in the main row: a small pill that spreads out when it is used
  // Search: a small pill that spreads out when used (search only; the place lives in the location button)
  const search = withSearch ? `
        <div class="nav-search-slot">
          <form id="nav-search" class="nav-search" role="search">
            <label class="nav-search-field" for="nav-q">
              <span class="material-symbols-outlined shrink-0 text-primary" aria-hidden="true">search</span>
              <span class="sr-only">Search doctors, hospitals or specialties</span>
              <input id="nav-q" type="search" maxlength="100" placeholder="Search" autocomplete="off">
            </label>
            <div class="nav-search-extra">
              <button type="submit" class="btn-accent btn-sm shrink-0">Search <span class="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span></button>
            </div>
          </form>
        </div>` : '';
  // Location: an icon that spreads out to State and District
  const location_ = withSearch ? `
        <div class="nav-loc">
          <button type="button" data-loc-toggle class="nav-loc-btn" aria-expanded="false" aria-controls="nav-loc-panel" aria-label="Choose your location" title="Choose your location">
            <span class="material-symbols-outlined" aria-hidden="true">location_on</span><span class="nav-loc-dot" hidden></span>
          </button>
          <div class="nav-loc-extra" id="nav-loc-panel">
            <div class="nav-select"><span class="material-symbols-outlined text-secondary" aria-hidden="true">flag</span><label class="sr-only" for="nav-state">State</label><select id="nav-state" class="field-input"><option value="">All states</option></select></div>
            <div class="nav-select"><span class="material-symbols-outlined text-outline" aria-hidden="true">pin_drop</span><label class="sr-only" for="nav-district">District</label><select id="nav-district" class="field-input" disabled><option value="">All districts</option></select></div>
          </div>
        </div>` : '<div class="flex-1"></div>';

  // The container (not the header inside it) is what sticks to the top, so it can slide away on scroll
  qs('#app-header').className = 'sticky top-0 z-50 transition-transform duration-300';
  qs('#app-header').innerHTML = `
    <header id="site-header" class="relative bg-surface/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-20 sm:px-6">
        <a href="${user ? ROLE_HOME[user.role] || '/' : ROLE_HOME.PATIENT}" class="flex min-w-0 shrink items-center gap-2.5" aria-label="${esc(APP_NAME)} home">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary shadow-sm sm:h-11 sm:w-11">
            <span class="material-symbols-outlined text-2xl" aria-hidden="true">local_hospital</span>
          </span>
          <span class="truncate font-display text-headline-sm font-bold tracking-tight">${esc(APP_NAME)}</span>
        </a>
        ${search}
        <nav id="main-nav" class="hidden items-center gap-1 lg:flex" aria-label="Main">${items.map((i) => navLink(i, current, false)).join('')}</nav>
        ${location_}
        <div class="flex shrink-0 items-center gap-1">
          ${authArea}
          ${withSearch ? `<button type="button" data-search-toggle class="rounded-full p-2 hover:bg-surface-container lg:hidden" aria-label="Search doctors" aria-expanded="false"><span class="material-symbols-outlined">search</span></button>` : ''}
          <button type="button" data-menu-toggle class="rounded-full p-2 hover:bg-surface-container lg:hidden" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
            <span class="material-symbols-outlined">menu</span>
          </button>
        </div>
      </div>
      <div id="mobile-menu" hidden class="border-t border-outline-variant bg-surface px-4 pb-4 pt-2 lg:hidden">
        <nav aria-label="Mobile">${items.map((i) => navLink(i, current, true)).join('')}</nav>
        <div class="md:hidden">${mobileAuth}</div>
      </div>
    </header>`;
}

/** Spread the navbar search out (or fold it back). While it is open the menu links step aside. */
export function setSearchOpen(open) {
  const header = qs('#site-header');
  if (!header) return;
  if (open) setLocOpen(false); // only one of the two spreads out at a time
  header.toggleAttribute('data-search-open', open);
  const toggle = qs('[data-search-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
  const input = qs('#nav-q');
  if (input) input.placeholder = open ? 'Search doctors, hospitals or specialties' : 'Search';
  if (open) showHeader();
}

/** Spread the location icon out to State and District (or fold it back). */
export function setLocOpen(open) {
  const header = qs('#site-header');
  if (!header) return;
  if (open) setSearchOpen(false);
  header.toggleAttribute('data-loc-open', open);
  const toggle = qs('[data-loc-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
  if (open) showHeader();
}

const setUserMenu = (open) => {
  const panel = qs('#user-dropdown');
  const btn = qs('[data-user-toggle]');
  if (!panel || !btn) return;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) panel.animate([{ opacity: 0, transform: 'translateY(-6px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'ease-out' });
};

const setMobileMenu = (open) => {
  const menu = qs('#mobile-menu');
  const toggle = qs('[data-menu-toggle]');
  if (!menu || !toggle) return;
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.querySelector('.material-symbols-outlined').textContent = open ? 'close' : 'menu';
};

// ---- guests can only look at the home page ----------------------------------------------------
/** Open the login window; after logging in the person comes back to `returnTo` (default: this page). */
export function requireLogin(returnTo = location.pathname + location.search) {
  openAuthModal({ mode: 'login', group: 'PATIENT', returnTo });
}

// Pages a guest may open: the home page, the login / sign-up pages, doctor registration (it creates an account)
function guestMayOpen(url) {
  if (url.origin !== location.origin) return true;
  const p = url.pathname;
  if (p === '/' || p === '/frontend/patient/index.html') return true;
  if (/^\/frontend\/shared\/(login|register)\.html$/.test(p) || p === '/frontend/doctor/register.html') return true;
  return p === location.pathname && url.hash !== ''; // an anchor on this same page
}

/** Guests: every link to another page, and the search / location controls, ask for a login instead. */
function bindGuestGate() {
  document.addEventListener('click', (e) => {
    if (!layoutState.guest) return;
    const control = e.target.closest('[data-loc-toggle], [data-search-toggle], #nav-search');
    if (control) {
      e.preventDefault();
      e.stopImmediatePropagation();
      requireLogin();
      return;
    }
    const a = e.target.closest('a[href]');
    if (!a || a.dataset.auth || /^(tel|mailto):/i.test(a.getAttribute('href'))) return;
    const url = new URL(a.href, location.href);
    if (guestMayOpen(url)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    requireLogin(url.pathname + url.search);
  }, true); // capture: runs before the page's own handlers
}

// ---- hide on scroll down, show on scroll up -------------------------------------------------
function showHeader() {
  const holder = qs('#app-header');
  if (holder) holder.classList.remove('-translate-y-full');
}

function headerLocked(h) {
  const dropdown = qs('#user-dropdown');
  const menu = qs('#mobile-menu');
  return h.hasAttribute('data-search-open') || h.hasAttribute('data-loc-open') || (dropdown && !dropdown.hidden) || (menu && !menu.hidden) || document.body.classList.contains('overflow-hidden');
}

// One set of listeners for the whole page; they look the header up each time, so a re-drawn header still works.
let headerEventsBound = false;
function bindHeaderEvents() {
  if (headerEventsBound) return;
  headerEventsBound = true;

  // Hide after a little scrolling down, show after a little scrolling up (distance counted per direction,
  // so slow trackpad scrolling works too)
  let lastY = window.scrollY;
  let dir = 0;
  let dist = 0;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const holder = qs('#app-header');
      const h = qs('#site-header');
      if (!holder || !h) return;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;
      lastY = y;
      if (delta === 0) return;
      const d = delta > 0 ? 1 : -1;
      if (d !== dir) { dir = d; dist = 0; }
      dist += Math.abs(delta);
      if (y < 80 || (dir === -1 && dist > 8)) showHeader();
      else if (dir === 1 && dist > 12 && !headerLocked(h)) holder.classList.add('-translate-y-full');
    });
  }, { passive: true });
  // Keyboard users tabbing into a hidden header bring it back
  document.addEventListener('focusin', (e) => { if (e.target.closest && e.target.closest('#site-header')) showHeader(); });

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-user-toggle]')) { setUserMenu(qs('#user-dropdown').hidden); return; }
    const dropdown = qs('#user-dropdown');
    if (dropdown && !dropdown.hidden && !t.closest('[data-user-menu]')) setUserMenu(false);

    if (t.closest('[data-logout]')) {
      await logout();
      location.href = LOGIN_URL;
      return;
    }
    if (t.closest('[data-open-account]')) {
      setUserMenu(false);
      setMobileMenu(false);
      const { openAccountModal } = await import('./account-modal.js');
      openAccountModal();
      return;
    }
    if (t.closest('[data-menu-toggle]')) { setMobileMenu(qs('#mobile-menu').hidden); return; }
    if (t.closest('[data-search-toggle]')) {
      const open = !qs('#site-header').hasAttribute('data-search-open');
      setSearchOpen(open);
      if (open) qs('#nav-q').focus();
      return;
    }
    if (t.closest('[data-loc-toggle]')) {
      const open = !qs('#site-header').hasAttribute('data-loc-open');
      setLocOpen(open);
      return;
    }
    // A click anywhere outside the search / location folds it back
    const header = qs('#site-header');
    if (header && header.hasAttribute('data-search-open') && !t.closest('#nav-search')) setSearchOpen(false);
    if (header && header.hasAttribute('data-loc-open') && !t.closest('.nav-loc')) setLocOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const header = qs('#site-header');
    if (header && header.hasAttribute('data-search-open')) { setSearchOpen(false); const i = qs('#nav-q'); if (i) i.blur(); return; }
    if (header && header.hasAttribute('data-loc-open')) { setLocOpen(false); const b = qs('[data-loc-toggle]'); if (b) b.focus(); return; }
    const dropdown = qs('#user-dropdown');
    if (dropdown && !dropdown.hidden) { setUserMenu(false); qs('[data-user-toggle]').focus(); }
  });
}

/** Draw the header again from fresh account data (after a name or picture change), without a page reload. */
export async function refreshHeader() {
  const session = await loadSession(true);
  if (!session.user) return;
  if (layoutState.portal) {
    const { updatePortalUser } = await import('./portal-shell.js');
    updatePortalUser(session.user);
    return;
  }
  renderHeader(session.user, layoutState.withSearch);
  if (layoutState.withSearch) {
    const { initNavSearch } = await import('./nav-search.js');
    await initNavSearch();
  }
  bindAuthTriggers();
}

// ---- footer ---------------------------------------------------------------------------------
function renderFooter() {
  const el = qs('#app-footer');
  if (!el) return;
  const link = (href, label) => `<a href="${href}" class="w-fit py-1 text-body-md text-white/85 underline-offset-4 transition hover:text-white hover:underline">${label}</a>`;
  const soon = (label, phase) => `<span class="py-1 text-body-md text-white/45" title="Coming in ${phase}">${label}</span>`;
  const heading = (text) => `<span class="mb-2 border-b border-white/20 pb-2 text-label-lg font-bold uppercase tracking-wider text-white">${text}</span>`;
  el.innerHTML = `
    <footer class="mt-16 bg-gradient-to-br from-primary via-primary to-[#00322f] text-white">
      <div class="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6">
        <div class="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div class="flex flex-col gap-4 lg:col-span-2 lg:pr-10">
            <div class="flex items-center gap-3">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary shadow"><span class="material-symbols-outlined text-2xl" aria-hidden="true">local_hospital</span></span>
              <span class="font-display text-headline-sm font-bold">${esc(APP_NAME)}</span>
            </div>
            <p class="max-w-md text-body-md text-white/85">Find verified doctors and hospitals near you, compare fees and the next free time, and book your visit online. Pay now or at the visit.</p>
            <div class="flex flex-wrap gap-2">
              <span class="flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-label-md font-semibold ring-1 ring-white/20"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified_user</span>Verified doctors &amp; hospitals</span>
              <span class="flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-label-md font-semibold ring-1 ring-white/20"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">lock</span>Your data stays private</span>
            </div>
          </div>
          <nav class="flex flex-col" aria-label="Discovery">
            ${heading('Discovery')}
            ${link('/frontend/patient/doctors.html', 'Find Doctors')}
            ${link('/frontend/patient/doctors.html?type=HOSPITAL', 'Hospitals')}
            ${link('/frontend/patient/index.html#specialties', 'Medical Specialties')}
            ${soon('Pharmacy', 'Phase 3')}
          </nav>
          <nav class="flex flex-col" aria-label="For professionals">
            ${heading('For professionals')}
            ${link('/frontend/doctor/register.html', 'Register as a doctor')}
            <span class="max-w-[15rem] py-1 text-body-sm text-white/70">Hospitals join by invitation from our regional team.</span>
            ${soon('Pharmacy partners', 'Phase 3')}
          </nav>
          <div class="flex flex-col gap-2">
            ${heading('Emergency helplines')}
            <a href="tel:108" class="rounded-2xl bg-white/12 px-4 py-3 ring-1 ring-white/20 transition hover:bg-white/20"><span class="block text-label-md text-white/80">Ambulance</span><span class="font-display text-headline-md font-extrabold text-white">108 / 112</span></a>
            <p class="text-body-sm text-white/80">In an emergency call first. Do not wait for an appointment.</p>
          </div>
        </div>

        <div class="mt-10 grid gap-5 border-t border-white/20 pt-6 md:grid-cols-[1fr_auto] md:items-center">
          <p class="flex items-start gap-3">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25"><span class="material-symbols-outlined" aria-hidden="true">shield_lock</span></span>
            <span class="text-body-md"><strong class="font-semibold text-white">Online payments are processed securely.</strong><br><span class="text-white/85">Cancel up to 24 hours before your visit for a full refund.</span></span>
          </p>
          <p class="text-body-md text-white md:text-right">&copy; ${new Date().getFullYear()} ${esc(APP_NAME)}<br><span class="text-white/85">Designed, developed and maintained by</span> <span class="font-bold text-secondary-fixed">Liberty Innovation</span></p>
        </div>
      </div>
    </footer>`;
}

/**
 * Loads the session, draws the layout and enforces access.
 *  requireLogin: true on pages guests must not open (they are sent to the login window).
 *  portal: { theme, subtitle, navLabel, items, active, scope, topLeft } draws the sidebar frame of a staff portal (needs <div id="portal-root"></div>).
 *  navSearch: false on pages that have their own search and filters (the navbar search is then left out).
 *  roles: allowed roles for this page (omit for a public page). If given, guests are sent to login and
 *         other roles to their own home page. The server still checks every API call.
 * Returns the user (or null on a public page for guests).
 */
export async function initPage({ roles = null, navSearch = true, requireLogin: loginNeeded = false, portal = null } = {}) {
  let session;
  try {
    session = await loadSession();
  } catch (e) {
    qs('#app-header').innerHTML = '';
    document.body.insertAdjacentHTML('afterbegin', '<p class="p-6 text-center text-error">Cannot reach the server. Please try again shortly.</p>');
    throw e;
  }
  const user = session.user;

  // Guests may only look at the home page: other pages send them to the login window (and bring them back afterwards)
  if (!user && loginNeeded) {
    location.replace(`${LOGIN_URL}?return_to=${encodeURIComponent(location.pathname + location.search)}`);
    await new Promise(() => {});
  }

  if (roles) {
    if (!user) {
      location.replace(`${LOGIN_URL}?return_to=${encodeURIComponent(location.pathname + location.search)}`);
      await new Promise(() => {}); // stop the page script while the browser navigates
    }
    if (!roles.includes(user.role)) {
      location.replace(ROLE_HOME[user.role] || LOGIN_URL);
      await new Promise(() => {});
    }
  }

  // Guests and patients get the search (with state / district) in the navbar, unless the page has its own filters
  const withSearch = !portal && navSearch && (!user || user.role === 'PATIENT');
  layoutState = { withSearch, guest: !user, portal: Boolean(portal) };
  if (!user) bindGuestGate();
  if (portal) {
    // Staff portals: sidebar + top bar instead of the public navbar and footer
    bindHeaderEvents();
    const { renderPortalShell } = await import('./portal-shell.js');
    renderPortalShell({ user, ...portal });
    const note = new URLSearchParams(location.search).get('notice');
    if (note) toast.info(note);
    return user;
  }
  renderHeader(user, withSearch);
  bindHeaderEvents();
  if (withSearch) {
    const { initNavSearch } = await import('./nav-search.js');
    await initNavSearch({ guest: !user });
  }
  renderFooter();
  bindAuthTriggers(); // Log in / Sign up buttons open the modal instead of leaving the page
  // On phones, tidy the open menu away behind the modal
  qsa('#mobile-menu [data-auth]').forEach((b) => b.addEventListener('click', () => setMobileMenu(false)));

  // Surface a message passed through the URL (e.g. after a redirect)
  const notice = new URLSearchParams(location.search).get('notice');
  if (notice) toast.info(notice);
  return user;
}

/** Placeholder body for portals whose features arrive in a later phase. */
export function renderPortalStub({ user, title, phase, intro, items }) {
  qs('#app-main').innerHTML = `
    <section class="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p class="mb-2"><span class="badge badge-info">${esc(ROLE_LABELS[user.role] || user.role)} portal</span></p>
      <h1 class="font-display text-headline-lg-mobile sm:text-headline-lg">${esc(title)}</h1>
      <p class="mt-2 max-w-2xl text-body-lg text-on-surface-variant">Welcome, ${esc(user.name)}. ${esc(intro)}</p>
      <div class="card mt-8 p-6">
        <div class="mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary" aria-hidden="true">construction</span>
          <h2 class="font-display text-headline-sm">Coming in ${esc(phase)}</h2>
        </div>
        <ul class="grid gap-2 sm:grid-cols-2">
          ${items.map((i) => `<li class="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-body-md"><span class="material-symbols-outlined text-[18px] text-outline" aria-hidden="true">lock_clock</span>${esc(i)}</li>`).join('')}
        </ul>
      </div>
    </section>`;
}
