// Toasts: toast.success('Saved'), toast.error('Failed'), toast.info('FYI').
import { esc } from './dom.js';

const STYLES = {
  success: { icon: 'check_circle', cls: 'bg-tertiary-container text-on-tertiary' },
  error: { icon: 'error', cls: 'bg-error text-on-error' },
  info: { icon: 'info', cls: 'bg-inverse-surface text-inverse-on-surface' },
};

function container() {
  let el = document.getElementById('toast-region');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-region';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.className = 'pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end';
    document.body.appendChild(el);
  }
  return el;
}

function show(type, message, ms = 4500) {
  const s = STYLES[type];
  const node = document.createElement('div');
  node.className = `pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 shadow-pop ${s.cls}`;
  node.innerHTML = `<span class="material-symbols-outlined mt-0.5 text-[20px]" aria-hidden="true">${s.icon}</span>
    <p class="flex-1 text-body-md">${esc(message)}</p>
    <button type="button" class="-mr-1 rounded p-1 opacity-80 hover:opacity-100" aria-label="Dismiss"><span class="material-symbols-outlined text-[18px]">close</span></button>`;
  const remove = () => node.remove();
  node.querySelector('button').addEventListener('click', remove);
  container().appendChild(node);
  setTimeout(remove, ms);
}

export const toast = {
  success: (m) => show('success', m),
  error: (m) => show('error', m, 7000),
  info: (m) => show('info', m),
};
