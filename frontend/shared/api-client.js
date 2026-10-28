// API client: one place for fetch, CSRF token handling and error shape.
// Every backend response is { success, data, error: { code, message, details } }.

let csrfToken = null;
let sessionCache = null;

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, { body, form } = {}, retried = false) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET' && !csrfToken) await loadSession(true);
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  let payload;
  if (form) {
    payload = form; // FormData: the browser sets the multipart header
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }

  if (json && json.data && json.data.csrf_token) csrfToken = json.data.csrf_token;

  if (!res.ok || !json || json.success !== true) {
    const err = json && json.error ? json.error : {};
    // The session may have expired: fetch a fresh token and retry once.
    if (res.status === 403 && err.code === 'CSRF_INVALID' && !retried) {
      csrfToken = null;
      await loadSession(true);
      return request(method, path, { body, form }, true);
    }
    throw new ApiError(res.status, err.code || 'SERVER_ERROR', err.message || 'Something went wrong. Please try again.', err.details || {});
  }
  return json.data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, { body: body ?? {} }),
  put: (path, body) => request('PUT', path, { body: body ?? {} }),
  patch: (path, body) => request('PATCH', path, { body: body ?? {} }),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, { form: formData }),
};

/** { user, csrf_token }. user is null for guests. Cached for the page; pass force to refresh. */
export async function loadSession(force = false) {
  if (sessionCache && !force) return sessionCache;
  const data = await request('GET', '/api/auth/me');
  csrfToken = data.csrf_token;
  sessionCache = data;
  return data;
}

export function setCurrentUser(user, token) {
  csrfToken = token || csrfToken;
  sessionCache = { user, csrf_token: csrfToken };
}

export async function logout() {
  try { await api.post('/api/auth/logout'); } catch { /* already logged out */ }
  sessionCache = null;
  csrfToken = null;
}

/** Only same-site relative paths are allowed as post-login destinations (blocks open redirects). */
export function safeReturnPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  return path;
}
