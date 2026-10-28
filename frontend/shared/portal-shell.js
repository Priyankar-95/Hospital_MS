// The page frame of the staff portals (Hospital Admin, Branch Admin): a fixed sidebar on the left, a top bar and the content.
// It follows the UI reference (screens 14 and 16): a light sidebar for hospitals, a dark one for Branch Admins.
// On phones the sidebar slides in from the left. Loaded only on portal pages (dynamic import from layout.js), so patient pages stay light.
import { esc, qs, qsa } from './dom.js';
import { APP_NAME, ROLE_LABELS, avatarHtml } from './layout.js';

const THEMES = {
  light: {
    aside: 'bg-surface-container-low text-on-surface',
    brand: 'text-primary', sub: 'text-on-surface-variant', label: 'text-on-surface-variant',
    link: 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
    active: 'bg-primary-container text-on-primary shadow-[0_2px_10px_rgba(15,118,110,0.25)]',
    soon: 'text-outline', scope: 'bg-surface-container-high text-on-surface', logo: 'bg-primary text-on-primary',
  },
  dark: {
    aside: 'bg-inverse-surface text-inverse-on-surface',
    brand: 'text-inverse-on-surface', sub: 'text-primary-fixed-dim', label: 'text-inverse-on-surface/60',
    link: 'text-inverse-on-surface/80 hover:bg-white/10 hover:text-inverse-on-surface',
    active: 'bg-primary-container text-on-primary shadow-[0_2px_10px_rgba(15,118,110,0.35)]',
    soon: 'text-inverse-on-surface/40', scope: 'bg-white/10 text-inverse-on-surface', logo: 'bg-primary-container text-on-primary',
  },
};

function navItem(t, item, active) {
  const inner = `<span class="material-symbols-outlined text-[20px]" aria-hidden="true">${esc(item.icon)}</span><span class="min-w-0 flex-1 truncate">${esc(item.label)}</span>${item.count ? `<span class="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm font-bold text-on-secondary-container" data-nav-count="${esc(item.id)}">${esc(item.count)}</span>` : `<span data-nav-count="${esc(item.id)}"></span>`}`;
  if (item.soon) {
    return `<span class="flex items-center gap-3 rounded-xl px-4 py-2.5 font-display text-label-lg ${t.soon}" title="Coming in ${esc(item.soon)}" aria-disabled="true">${inner}<span class="rounded-full bg-black/5 px-2 py-0.5 text-label-sm">Soon</span></span>`;
  }
  const on = item.id === active;
  return `<a href="${esc(item.href)}" ${on ? 'aria-current="page"' : ''} class="flex items-center gap-3 rounded-xl px-4 py-2.5 font-display text-label-lg transition-colors ${on ? t.active : t.link}">${inner}</a>`;
}

/**
 * Draw the portal frame into #portal-root and return the content element (#app-main).
 *  opts: { user, theme: 'light'|'dark', subtitle, navLabel, items: [{ id, label, icon, href, soon?, count? }], active, scope (html), topLeft (html) }
 */
export function renderPortalShell({ user, theme = 'light', subtitle = '', navLabel = '', items, active, scope = '', topLeft = '' }) {
  const t = THEMES[theme] || THEMES.light;
  qs('#portal-root').innerHTML = `
    <div class="min-h-screen bg-background">
      <div data-portal-backdrop hidden class="fixed inset-0 z-40 bg-on-surface/50 backdrop-blur-sm lg:hidden"></div>
      <aside id="portal-sidebar" aria-label="Portal menu" class="fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col justify-between overflow-y-auto shadow-[0_1px_8px_rgba(0,0,0,0.06)] transition-transform duration-300 lg:translate-x-0 ${t.aside}">
        <div class="flex min-h-0 flex-1 flex-col">
          <a href="${esc(user.home)}" class="flex h-20 shrink-0 items-center gap-3 px-6" aria-label="${esc(APP_NAME)} home">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${t.logo}"><span class="material-symbols-outlined text-[24px]" aria-hidden="true">local_hospital</span></span>
            <span class="min-w-0 leading-tight"><span class="block truncate font-display text-headline-sm font-bold tracking-tight ${t.brand}">${esc(APP_NAME)}</span><span class="block text-label-sm font-medium uppercase tracking-wide ${t.sub}">${esc(subtitle)}</span></span>
          </a>
          ${scope ? `<div class="px-4 pb-2"><div class="flex items-center justify-between gap-2 rounded-lg px-4 py-2 text-label-md ${t.scope}">${scope}</div></div>` : ''}
          <nav class="space-y-1 px-4 py-3" aria-label="Sections">
            ${navLabel ? `<p class="px-4 pb-1 text-label-sm font-semibold uppercase tracking-wider ${t.label}">${esc(navLabel)}</p>` : ''}
            ${items.map((i) => navItem(t, i, active)).join('')}
          </nav>
        </div>
        <div class="px-4 pb-5">
          <button type="button" data-logout class="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left font-display text-label-lg ${t.link}"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>Log out</button>
        </div>
      </aside>

      <div class="lg:pl-72">
        <header class="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 bg-surface/90 px-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl sm:px-6">
          <div class="flex min-w-0 items-center gap-3">
            <button type="button" data-portal-menu class="rounded-full p-2 hover:bg-surface-container lg:hidden" aria-label="Open menu" aria-expanded="false" aria-controls="portal-sidebar"><span class="material-symbols-outlined">menu</span></button>
            <div id="portal-topleft" class="min-w-0">${topLeft}</div>
          </div>
          <div id="portal-user">${userMenuHtml(user)}</div>
        </header>
        <main id="app-main" class="px-4 py-6 sm:px-6"></main>
      </div>
    </div>`;
  bindShell();
  return qs('#app-main');
}

/** The profile menu in the top bar (same hooks as the public navbar, so Profile settings and Log out work the same). */
function userMenuHtml(user) {
  const isDoctor = user.role === 'DOCTOR';
  return `
    <div class="relative" data-user-menu>
      <button type="button" data-user-toggle aria-haspopup="menu" aria-expanded="false" aria-controls="user-dropdown" class="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-surface-container">
        ${avatarHtml(user, 'h-9 w-9')}
        <span class="hidden text-left leading-tight sm:block">
          <span class="block max-w-[10rem] truncate font-display text-label-lg" data-user-name>${esc(user.name)}</span>
          <span class="block text-body-sm text-on-surface-variant">${esc(ROLE_LABELS[user.role] || user.role)}</span>
        </span>
        <span class="material-symbols-outlined hidden text-[20px] text-on-surface-variant sm:block" aria-hidden="true">expand_more</span>
      </button>
      <div id="user-dropdown" role="menu" hidden class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-outline-variant bg-surface p-1 shadow-lg">
        ${isDoctor ? '' : '<button type="button" role="menuitem" data-open-account class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-body-md hover:bg-surface-container"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">manage_accounts</span>Profile settings</button>'}
        <button type="button" role="menuitem" data-logout class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-body-md text-error hover:bg-surface-container"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>Log out</button>
      </div>
    </div>`;
}

/** Redraw just the profile chip (after a name or picture change). */
export function updatePortalUser(user) {
  const box = qs('#portal-user');
  if (box) box.innerHTML = userMenuHtml(user);
}

/** A number on a sidebar item (for example the waiting applications). Pass 0 / '' to clear it. */
export function setNavCount(id, n) {
  qsa(`[data-nav-count="${id}"]`).forEach((el) => {
    if (!n) { el.textContent = ''; el.className = ''; return; }
    el.textContent = String(n);
    el.className = 'rounded-full bg-secondary-container px-2 py-0.5 text-label-sm font-bold text-on-secondary-container';
  });
}

function bindShell() {
  const side = qs('#portal-sidebar');
  const backdrop = qs('[data-portal-backdrop]');
  const toggle = qs('[data-portal-menu]');
  const set = (open) => {
    side.classList.toggle('-translate-x-full', !open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('overflow-hidden', open && window.innerWidth < 1024);
  };
  toggle.addEventListener('click', () => set(side.classList.contains('-translate-x-full')));
  backdrop.addEventListener('click', () => set(false));
  side.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) set(false); });
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) set(false); });
}
