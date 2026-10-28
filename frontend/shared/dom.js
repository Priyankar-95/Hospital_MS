// Small DOM helpers shared by all pages.

/** Escape text before putting it inside an innerHTML template. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function qs(selector, root = document) { return root.querySelector(selector); }
export function qsa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

/** Show API field errors under their inputs. Inputs are matched by name. Returns true if any were shown. */
export function showFieldErrors(form, details = {}) {
  clearFieldErrors(form);
  let any = false;
  for (const [name, message] of Object.entries(details)) {
    const input = form.elements[name];
    if (!input) continue;
    any = true;
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.className = 'field-error';
    p.dataset.errorFor = name;
    p.id = `err-${name}`;
    p.textContent = message;
    input.setAttribute('aria-describedby', p.id);
    (input.closest('[data-field]') || input.parentElement).appendChild(p);
  }
  const first = form.querySelector('[aria-invalid="true"]');
  if (first) first.focus();
  return any;
}

export function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  form.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
}

/** Disable a submit button while a request is running. */
export async function withBusy(button, fn) {
  const label = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Please wait';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = label;
  }
}
