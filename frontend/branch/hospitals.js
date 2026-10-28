// Branch Admin: hospitals in my districts (invitations, applications waiting for review, approved, rejected).
import { api } from '/frontend/shared/api-client.js';
import { esc, qs, qsa } from '/frontend/shared/dom.js';
import { setNavCount } from '/frontend/shared/portal-shell.js';
import { startBranchPortal, setScope, skeleton, pageHeader, fmtDate, emptyBox, errorBox, debounce, chipsHtml, pagerHtml, filterBarHtml } from './portal.js';
import { loadInvites, openAddHospital, openHospitalReview, DOC_LABELS, STATUS_BADGE } from './hospital-actions.js';

const { main } = await startBranchPortal('hospitals');
main.innerHTML = `${pageHeader('Hospitals', 'Invite hospitals to join, follow their invitations, and review the hospitals that applied.', '<button type="button" id="add-hospital" class="btn-primary"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">add_business</span>Add hospital</button>')}<div id="filters"></div><div id="chips" class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Status"></div><div id="list" class="mt-5 space-y-3" aria-live="polite">${skeleton(3, 'h-28')}</div><div id="pager"></div>`;

const CHIPS = [['INVITED', 'Invited'], ['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']];
const initial = new URLSearchParams(location.search).get('status');
const state = { status: CHIPS.some(([k]) => k === initial) ? initial : 'PENDING', page: 1, q: '', district_id: '' };
let counts = {};
let districts = [];
let seq = 0; // so a slow answer for an old search never overwrites a newer one

const list = qs('#list');
const reload = () => load();

function card(h) {
  const pending = h.verification_status === 'PENDING';
  const docs = h.document_types.length
    ? h.document_types.map((t) => `<span class="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-label-md text-on-surface-variant"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">description</span>${esc(DOC_LABELS[t] || t)}</span>`).join('')
    : '<span class="text-body-sm text-outline">No documents</span>';
  return `<article class="card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0 space-y-1.5">
        <div class="flex flex-wrap items-center gap-2"><h2 class="truncate font-display text-headline-sm">${esc(h.name)}</h2><span class="badge ${STATUS_BADGE[h.verification_status]}">${esc(h.verification_status)}</span></div>
        <p class="text-body-md text-on-surface-variant">${esc(h.district)}, ${esc(h.state)} &middot; Admin: ${esc(h.admin.name)} (${esc(h.admin.email)})</p>
        <div class="flex flex-wrap gap-2">${docs}</div>
        <p class="text-body-sm text-outline">${pending ? 'Submitted' : 'Decided'} ${esc(fmtDate(pending ? h.submitted_at : h.verified_at || h.submitted_at))}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        ${pending ? `<button type="button" class="btn-outline btn-sm" data-request-changes="${h.id}">Request changes</button><button type="button" class="btn-primary btn-sm" data-approve="${h.id}">Approve</button>` : `<button type="button" class="btn-outline btn-sm" data-view="${h.id}">View</button>`}
      </div>
    </article>`;
}

function drawChips() {
  qs('#chips').innerHTML = chipsHtml(CHIPS, counts, state.status);
  qsa('[data-chip]', qs('#chips')).forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.chip; state.page = 1; load(); }));
}

async function load() {
  const mine = ++seq;
  drawChips();
  list.innerHTML = skeleton(3, 'h-28');
  qs('#pager').innerHTML = '';
  try {
    if (state.status === 'INVITED') {
      const name = districts.find((d) => String(d.id) === state.district_id)?.name || '';
      await loadInvites(list, reload, { q: state.q, districtName: name });
      const open = (await api.get('/api/branch/hospital-invites')).open_count;
      if (mine === seq) { counts.INVITED = open; drawChips(); }
      return;
    }
    const params = new URLSearchParams({ status: state.status, page: state.page, per_page: 10 });
    if (state.q) params.set('q', state.q);
    if (state.district_id) params.set('district_id', state.district_id);
    const [data, inv] = await Promise.all([api.get(`/api/branch/hospitals?${params}`), api.get('/api/branch/hospital-invites')]);
    if (mine !== seq) return;
    counts = { INVITED: inv.open_count, ...data.counts };
    setNavCount('hospitals', counts.PENDING + counts.INVITED);
    drawChips();
    if (!data.items.length) {
      list.innerHTML = emptyBox('inbox', state.q ? 'No hospitals match your search.' : state.status === 'PENDING' ? 'No hospital applications are waiting for review.' : `No ${state.status.toLowerCase()} hospitals yet.`);
      return;
    }
    list.innerHTML = data.items.map(card).join('');
    qs('#pager').innerHTML = pagerHtml(data.pagination);
    qsa('[data-page]', qs('#pager')).forEach((b) => b.addEventListener('click', () => { state.page = Number(b.dataset.page); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    qsa('[data-approve], [data-view]', list).forEach((b) => b.addEventListener('click', () => openHospitalReview(Number(b.dataset.approve || b.dataset.view), reload)));
    qsa('[data-request-changes]', list).forEach((b) => b.addEventListener('click', () => openHospitalReview(Number(b.dataset.requestChanges), reload, { focusReject: true })));
  } catch (e) {
    if (mine === seq) list.innerHTML = errorBox(e, 'Could not load the hospitals.');
  }
}

(async () => {
  try {
    ({ districts } = await api.get('/api/branch/districts'));
    setScope(districts);
  } catch { /* the page still works without the district filter */ }
  qs('#filters').innerHTML = filterBarHtml(districts, 'Search by hospital, admin name or email');
  qs('#f-q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  qs('#f-district')?.addEventListener('change', (e) => { state.district_id = e.target.value; state.page = 1; load(); });
  qs('#add-hospital').addEventListener('click', () => openAddHospital(reload));
  load();
})();
