// "Profile settings" as a modal that opens over whatever page the person is on.
import { openModal } from '/frontend/shared/modal.js';
import { accountPanelHtml, mountAccountPanel } from '/frontend/shared/account-panel.js';

export function openAccountModal() {
  openModal({
    title: 'Profile settings',
    size: 'max-w-2xl',
    html: accountPanelHtml(),
    onMount: (body) => { mountAccountPanel(body); },
  });
}
