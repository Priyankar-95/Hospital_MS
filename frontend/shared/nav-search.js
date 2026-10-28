// The navbar search (a small pill that spreads out) and the location icon (spreads out to State and District),
// for guests and patients. The chosen place is remembered (shared with the home page) and the page is told when it changes.
import { savedLocation, saveLocation, wireLocationSelects } from '/frontend/patient/common.js';
import { qs } from './dom.js';
import { setSearchOpen, requireLogin } from './layout.js';

/** Current place chosen in the navbar: { state_id, district_id }. */
export function navLocation() {
  const s = qs('#nav-state');
  const d = qs('#nav-district');
  return {
    state_id: s && s.value ? Number(s.value) : null,
    district_id: d && d.value ? Number(d.value) : null,
  };
}

// A small dot on the location icon (and a tooltip) shows that a place is chosen
function showPlaceOnIcon() {
  const btn = qs('[data-loc-toggle]');
  const dot = qs('.nav-loc-dot');
  if (!btn || !dot) return;
  const s = qs('#nav-state');
  const d = qs('#nav-district');
  const district = d && d.value ? d.selectedOptions[0].textContent : '';
  const state = s && s.value ? s.selectedOptions[0].textContent : '';
  const place = [district, state].filter(Boolean).join(', ');
  dot.hidden = !place;
  btn.title = place ? `Location: ${place}` : 'Choose your location';
  btn.setAttribute('aria-label', place ? `Location: ${place}. Change` : 'Choose your location');
}

export async function initNavSearch({ guest = false } = {}) {
  const form = qs('#nav-search');
  if (!form) return;
  const stateSel = qs('#nav-state');
  const districtSel = qs('#nav-district');

  // Guests only look: using the search or the place asks for a login instead
  if (guest) {
    const input = qs('#nav-q');
    input.readOnly = true;
    form.addEventListener('focusin', () => { input.blur(); requireLogin(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); requireLogin(); });
    return;
  }

  // Using the box (click, tab or typing) spreads it out
  form.addEventListener('focusin', () => setSearchOpen(true));
  form.addEventListener('pointerdown', () => setSearchOpen(true));
  form.addEventListener('click', () => setSearchOpen(true));

  const loc = savedLocation();
  try {
    await wireLocationSelects(stateSel, districtSel, {
      ...loc,
      onChange: (state_id, district_id) => {
        saveLocation(state_id, district_id);
        showPlaceOnIcon();
        window.dispatchEvent(new CustomEvent('location-change', { detail: { state_id, district_id } }));
      },
    });
  } catch { /* the search box still works without the place filter */ }
  showPlaceOnIcon();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new URLSearchParams();
    const text = qs('#nav-q').value.trim();
    const place = navLocation();
    if (text) q.set('q', text);
    if (place.state_id) q.set('state_id', place.state_id);
    if (place.district_id) q.set('district_id', place.district_id);
    const s = q.toString();
    location.href = `/frontend/patient/doctors.html${s ? `?${s}` : ''}`;
  });
}
