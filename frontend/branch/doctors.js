// Branch Admin: doctors in my districts. Check credentials, approve, or send back with a reason.
import { api } from '/frontend/shared/api-client.js';
import { esc, qs, qsa } from '/frontend/shared/dom.js';
import { setNavCount } from '/frontend/shared/portal-shell.js';
import { startBranchPortal, setScope, skeleton, pageHeader, fmtDate, emptyBox, errorBox, debounce, chipsHtml, pagerHtml, filterBarHtml } from './portal.js';
import { openDoctorReview } from './doctor-review.js';

const { main } = await startBranchPortal('doctors');
main.innerHTML = `${pageHeader('Doctors', 'Doctors who applied in your districts. Check their credentials, then approve or reject with a reason.')}<div id="filters"></div><div id="chips" class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Status"></div><div id="list" class="mt-5 space-y-3" aria-live="polite">${skeleton(3, 'h-28')}</div><div id="pager"></div>`;

const CHIPS = [['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']];
const BADGE = { PENDING: 'badge-warning', APPROVED: 'badge-success', REJECTED: 'badge-danger' };
const initial = new URLSearchParams(location.search).get('status');
const state = { status: CHIPS.some(([k]) => k === initial) ? initial : 'PENDING', page: 1, q: '', district_id: '' };
let counts = {};
let districts = [];
let seq = 0;

const list = qs('#list');
const reload = () => load();

function card(d) {
  const pending = d.verification_status === 'PENDING';
  return `<article class="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="truncate font-display text-headline-sm">${esc(d.name)}</h2>
          <span class="badge ${BADGE[d.verification_status]}">${esc(d.verification_status)}</span>
          <span class="badge">${d.doctor_type === 'HOSPITAL' ? 'Hospital doctor' : 'Private chamber'}</span>
        </div>
        <p class="text-body-md text-on-surface-variant">${esc(d.specialty)} &middot; ${esc(d.district)}, ${esc(d.state)}</p>
        <p class="text-body-sm text-outline">${esc(d.qualifications || '')} &middot; ${d.document_count} document${d.document_count === 1 ? '' : 's'} &middot; ${esc(fmtDate(d.submitted_at))}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        ${pending ? `<button type="button" class="btn-outline btn-sm" data-request-changes="${d.id}">Request changes</button><button type="button" class="btn-primary btn-sm" data-review="${d.id}">Review</button>` : `<button type="button" class="btn-outline btn-sm" data-review="${d.id}">View</button>`}
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
    const params = new URLSearchParams({ status: state.status, page: state.page, per_page: 10 });
    if (state.q) params.set('q', state.q);
    if (state.district_id) params.set('district_id', state.district_id);
    const data = await api.get(`/api/branch/doctors?${params}`);
    if (mine !== seq) return;
    counts = data.counts;
    setNavCount('doctors', counts.PENDING);
    drawChips();
    if (!data.items.length) {
      list.innerHTML = emptyBox('inbox', state.q ? 'No doctors match your search.' : state.status === 'PENDING' ? 'No applications are waiting for review.' : `No ${state.status.toLowerCase()} applications yet.`);
      return;
    }
    list.innerHTML = data.items.map(card).join('');
    qs('#pager').innerHTML = pagerHtml(data.pagination);
    qsa('[data-page]', qs('#pager')).forEach((b) => b.addEventListener('click', () => { state.page = Number(b.dataset.page); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    qsa('[data-review]', list).forEach((b) => b.addEventListener('click', () => openDoctorReview(Number(b.dataset.review), reload)));
    qsa('[data-request-changes]', list).forEach((b) => b.addEventListener('click', () => openDoctorReview(Number(b.dataset.requestChanges), reload, { focusReject: true })));
  } catch (e) {
    if (mine === seq) list.innerHTML = errorBox(e, 'Could not load the doctors.');
  }
}

(async () => {
  try {
    ({ districts } = await api.get('/api/branch/districts'));
    setScope(districts);
  } catch { /* the page still works without the district filter */ }
  qs('#filters').innerHTML = filterBarHtml(districts, 'Search by name, email or specialty');
  qs('#f-q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  qs('#f-district')?.addEventListener('change', (e) => { state.district_id = e.target.value; state.page = 1; load(); });
  load();
})();
