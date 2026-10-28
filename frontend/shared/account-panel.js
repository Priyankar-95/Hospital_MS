// Profile settings: picture, name / phone and password. Used inside a modal (from the profile menu)
// and on the standalone account page. Doctors have their own profile page instead.
import { api, ApiError } from '/frontend/shared/api-client.js';
import { avatarHtml, refreshHeader } from '/frontend/shared/layout.js';
import { qs, showFieldErrors, clearFieldErrors, withBusy } from '/frontend/shared/dom.js';
import { toast } from '/frontend/shared/toast.js';

const AVATAR_MAX = 5 * 1024 * 1024;

export function accountPanelHtml() {
  return `
    <div class="space-y-5">
      <section class="flex flex-col items-center gap-5 rounded-2xl border border-outline-variant/60 p-5 sm:flex-row">
        <div class="relative shrink-0">
          <div id="avatar-preview" class="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-primary-container font-display text-4xl text-on-primary"></div>
          <button type="button" id="avatar-camera" class="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-primary-container text-on-primary shadow" aria-label="Change profile picture"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">photo_camera</span></button>
        </div>
        <div class="text-center sm:text-left">
          <h3 class="font-display text-headline-sm">Profile picture</h3>
          <p class="mt-1 text-body-sm text-on-surface-variant">JPG, PNG or WEBP, up to 5 MB. Only you can see it.</p>
          <p id="avatar-error" role="alert" hidden class="mt-2 rounded-xl bg-error-container px-3 py-2 text-body-sm text-on-error-container"></p>
          <div class="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button type="button" id="avatar-upload" class="btn-primary btn-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">upload</span><span data-label>Upload photo</span></button>
            <button type="button" id="avatar-remove" class="btn-outline btn-sm text-error" hidden><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>Remove</button>
          </div>
          <input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-label="Choose profile picture">
        </div>
      </section>

      <form id="profile-form" class="space-y-4 rounded-2xl border border-outline-variant/60 p-5" novalidate>
        <h3 class="font-display text-headline-sm">Your details</h3>
        <div data-field>
          <label for="name" class="field-label">Full name</label>
          <input id="name" name="name" class="field-input" maxlength="150" autocomplete="name">
        </div>
        <div data-field>
          <label for="email" class="field-label">Email</label>
          <input id="email" class="field-input" disabled>
          <p class="mt-1 text-body-sm text-on-surface-variant">Your email is your sign-in and cannot be changed here.</p>
        </div>
        <div data-field>
          <label for="phone" class="field-label">Phone <span class="normal-case text-outline">(optional)</span></label>
          <input id="phone" name="phone" class="field-input" maxlength="20" autocomplete="tel" inputmode="tel">
        </div>
        <div class="flex justify-end"><button type="submit" id="profile-save" class="btn-primary">Save changes</button></div>
      </form>

      <form id="password-form" class="space-y-4 rounded-2xl border border-outline-variant/60 p-5" novalidate hidden>
        <h3 class="font-display text-headline-sm">Change password</h3>
        <div data-field>
          <label for="current_password" class="field-label">Current password</label>
          <input id="current_password" name="current_password" type="password" class="field-input" autocomplete="current-password">
        </div>
        <div data-field>
          <label for="new_password" class="field-label">New password</label>
          <input id="new_password" name="new_password" type="password" class="field-input" autocomplete="new-password">
          <p class="mt-1 text-body-sm text-on-surface-variant">8 to 72 characters, with at least one letter and one number.</p>
        </div>
        <div class="flex justify-end"><button type="submit" id="password-save" class="btn-primary">Change password</button></div>
      </form>
      <p id="google-note" hidden class="rounded-2xl border border-outline-variant/60 p-5 text-body-md text-on-surface-variant">You sign in with Google, so there is no password to change here.</p>
    </div>`;
}

/** Wire up the panel inside `root` (which already holds accountPanelHtml()). */
export async function mountAccountPanel(root) {
  const profile = qs('#profile-form', root);
  const password = qs('#password-form', root);
  const fileInput = qs('#avatar-file', root);
  const avatarError = qs('#avatar-error', root);
  let hasAvatar = false;

  // withBusy swaps a button's contents while it works, so the label is set again once it is done
  const syncAvatarLabel = () => {
    const label = qs('#avatar-upload [data-label]', root);
    if (label) label.textContent = hasAvatar ? 'Change photo' : 'Upload photo';
  };
  const showAvatar = (a) => {
    hasAvatar = Boolean(a.avatar_url);
    qs('#avatar-preview', root).innerHTML = avatarHtml({ name: a.name, avatar_url: a.avatar_url }, 'h-28 w-28', 'text-4xl');
    qs('#avatar-remove', root).hidden = !hasAvatar;
    syncAvatarLabel();
  };
  const avatarFail = (message) => { avatarError.textContent = message; avatarError.hidden = false; };

  function fill(a) {
    showAvatar(a);
    profile.elements.name.value = a.name || '';
    qs('#email', root).value = a.email || '';
    profile.elements.phone.value = a.phone || '';
    password.hidden = !a.can_change_password;
    qs('#google-note', root).hidden = a.can_change_password;
  }

  for (const id of ['#avatar-upload', '#avatar-camera']) qs(id, root).addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    avatarError.hidden = true;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return avatarFail('Choose a JPG, PNG or WEBP picture.');
    if (file.size > AVATAR_MAX) return avatarFail('That picture is larger than 5 MB.');
    const form = new FormData();
    form.append('photo', file);
    await withBusy(qs('#avatar-upload', root), async () => {
      try {
        const d = await api.upload('/api/account/avatar', form);
        showAvatar(d.account);
        toast.success('Profile picture updated.');
        refreshHeader();
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        avatarFail((err.details && err.details.photo) || err.message);
      }
    });
    syncAvatarLabel();
  });

  qs('#avatar-remove', root).addEventListener('click', async () => {
    avatarError.hidden = true;
    await withBusy(qs('#avatar-remove', root), async () => {
      try {
        const d = await api.delete('/api/account/avatar');
        showAvatar(d.account);
        toast.success('Profile picture removed.');
        refreshHeader();
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        avatarFail(err.message);
      }
    });
  });

  // Submit helper: field errors under the inputs, a toast on success
  function wire(form, button, path, body, done) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      await withBusy(qs(button, root), async () => {
        try {
          done(await api.post(path, body()));
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          if (err.details && Object.keys(err.details).length) showFieldErrors(form, err.details);
          else toast.error(err.message);
        }
      });
    });
  }

  wire(profile, '#profile-save', '/api/account', () => ({ name: profile.elements.name.value.trim(), phone: profile.elements.phone.value.trim() }), (d) => {
    fill(d.account);
    toast.success('Your details are saved.');
    refreshHeader(); // the name in the navbar changes at once, no reload
  });
  wire(password, '#password-save', '/api/account/password', () => ({ current_password: password.elements.current_password.value, new_password: password.elements.new_password.value }), () => {
    password.reset();
    toast.success('Your password was changed.');
  });

  try {
    fill((await api.get('/api/account')).account);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : 'Could not load your details.');
  }
}
