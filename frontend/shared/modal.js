// Modals: openModal({ title, html, onMount }) and confirmDialog({ title, message, confirmText, danger }) -> Promise<boolean>.
import { esc } from './dom.js';

export function openModal({ title, html, onMount, onClose, size = 'max-w-md' }) {
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-on-surface/50 p-0 backdrop-blur-sm sm:items-center sm:p-4';
  document.body.classList.add('overflow-hidden');
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal-panel max-h-[92vh] w-full ${size} overflow-y-auto rounded-t-3xl bg-surface-container-lowest p-6 shadow-pop sm:rounded-3xl sm:p-8">
      <div class="mb-4 flex items-start justify-between gap-4">
        <h2 id="modal-title" class="font-display text-headline-sm">${esc(title)}</h2>
        <button type="button" data-close class="rounded-full p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div data-body>${html || ''}</div>
    </div>`;

  const dialog = overlay.firstElementChild;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    // Page scroll stays locked while any other modal is still open
    if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('overflow-hidden');
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = [...dialog.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  document.body.appendChild(overlay);
  if (onMount) onMount(dialog.querySelector('[data-body]'), close);
  // Keep focus where onMount put it (e.g. the first form field); otherwise focus the dialog's first control
  if (!dialog.contains(document.activeElement)) {
    (dialog.querySelector('[autofocus]') || dialog.querySelector('button')).focus();
  }
  return { close, body: dialog.querySelector('[data-body]') };
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value, close) => { if (!settled) { settled = true; resolve(value); } close(); };
    const { close } = openModal({
      title,
      html: `<p class="mb-6 text-body-md text-on-surface-variant">${esc(message)}</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-cancel class="btn-outline">${esc(cancelText)}</button>
          <button type="button" data-ok class="${danger ? 'btn-danger' : 'btn-primary'}" autofocus>${esc(confirmText)}</button>
        </div>`,
      onMount: (body, closeFn) => {
        body.querySelector('[data-cancel]').addEventListener('click', () => done(false, closeFn));
        body.querySelector('[data-ok]').addEventListener('click', () => done(true, closeFn));
      },
    });
    // Closing via X / Escape / backdrop counts as "cancel"
    const watcher = new MutationObserver(() => {
      if (!document.getElementById('modal-title')) { watcher.disconnect(); if (!settled) { settled = true; resolve(false); } }
    });
    watcher.observe(document.body, { childList: true });
    void close;
  });
}
