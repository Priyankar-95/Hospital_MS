// Standalone account page (the profile menu opens the same panel as a modal). Doctors use their own profile page.
import { initPage } from '/frontend/shared/layout.js';
import { qs } from '/frontend/shared/dom.js';
import { accountPanelHtml, mountAccountPanel } from '/frontend/shared/account-panel.js';

await initPage({ navSearch: false, roles: ['PATIENT', 'HOSPITAL_ADMIN', 'HOSPITAL_FRONTDESK', 'BRANCH_ADMIN', 'VENDOR_ADMIN', 'SUPER_ADMIN'] });

const root = qs('#account-root');
root.innerHTML = accountPanelHtml();
await mountAccountPanel(root);
