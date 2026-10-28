// Used by login.html, register.html and doctor/register.html: these pages are just a backdrop that opens the auth modal.
//   <body data-auth-mode="login|register" data-auth-group="PATIENT|DOCTOR|STAFF">
// Query string: return_to, role_group, error (set by the Google callback).
import { loadSession, safeReturnPath } from './api-client.js';
import { openAuthModal, HOME_URL } from './auth-modal.js';

const params = new URLSearchParams(location.search);
const { authMode, authGroup } = document.body.dataset;
const group = ['PATIENT', 'DOCTOR', 'STAFF'].includes(params.get('role_group')) ? params.get('role_group') : (authGroup || 'PATIENT');

try {
  const { user } = await loadSession();
  if (user) {
    // Already logged in: go where they were heading, or to their own home page
    location.replace(safeReturnPath(params.get('return_to')) || user.home);
  } else {
    openAuthModal({
      mode: authMode === 'register' ? 'register' : 'login',
      group,
      returnTo: params.get('return_to'),
      error: params.get('error'),
      onClose: () => { location.href = HOME_URL; },
    });
  }
} catch {
  document.querySelector('main').insertAdjacentHTML('afterbegin', '<p class="text-center text-error">Cannot reach the server. Please try again shortly.</p>');
}
