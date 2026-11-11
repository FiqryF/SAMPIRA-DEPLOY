// Remove profile and bearer data saved by the previous portal version.
try { localStorage.removeItem('user'); } catch { /* Storage can be unavailable. */ }

async function portalFetch(url, options) {
    const response = await fetch(url, {credentials: 'same-origin', ...options});
    if (response.status === 401) {
        window.dispatchEvent(new Event('sampira:session-ended'));
        window.location.replace('/login');
    }
    return response;
}

async function portalUser(role) {
    const response = await portalFetch('/api/user/profile');
    if (!response.ok) return null;
    const {data} = await response.json();
    return data?.role === role ? data : null;
}

let sessionDialog;

function showSessionDialog({title, message, confirmLabel, cancelLabel, onConfirm}) {
    if (sessionDialog?.open) { sessionDialog.focus(); return; }
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    sessionDialog = dialog;
    dialog.className = 'sp-session-dialog';
    dialog.setAttribute('aria-labelledby', 'session-dialog-title');
    dialog.setAttribute('aria-describedby', 'session-dialog-copy');
    const mark = document.createElement('img');
    mark.src = '/assets/img/sampira-mark.svg'; mark.alt = ''; mark.width = 48; mark.height = 48;
    const heading = document.createElement('h2'); heading.id = 'session-dialog-title'; heading.textContent = title;
    const copy = document.createElement('p'); copy.id = 'session-dialog-copy'; copy.textContent = message;
    function dismiss() {
        dialog.close(); dialog.remove();
        if (sessionDialog === dialog) sessionDialog = null;
        if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    const controls = document.createElement('div'); controls.className = 'sp-session-dialog-actions';
    if (cancelLabel) {
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = cancelLabel;
        cancel.className = 'sp-session-cancel'; cancel.autofocus = true;
        cancel.addEventListener('click', dismiss); controls.append(cancel);
    }
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = confirmLabel;
    confirm.className = 'sp-session-confirm'; confirm.autofocus = !cancelLabel;
    confirm.addEventListener('click', () => {
        confirm.disabled = true; dismiss(); onConfirm?.();
    });
    controls.append(confirm); dialog.append(mark, heading, copy, controls); document.body.append(dialog);
    dialog.showModal();
}

function logoutPortal(askConfirmation = true) {
    if (askConfirmation) {
        showSessionDialog({title: 'Keluar dari akun?', message: 'Anda perlu masuk kembali untuk menggunakan layanan SAMPIRA.',
            confirmLabel: 'Ya, keluar', cancelLabel: 'Batal', onConfirm: () => logoutPortal(false)});
        return;
    }
    window.dispatchEvent(new Event('sampira:session-ended'));
    const form = document.createElement('form');
    form.method = 'post';
    form.action = '/logout';
    document.body.append(form);
    form.submit();
}

function escapePortalHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

// Admin and Administrator use regular POST forms; use the same confirmation.
document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const target = new URL(form.action, window.location.href);
    if (target.origin !== window.location.origin || target.pathname !== '/logout') return;
    event.preventDefault();
    logoutPortal();
});

async function welcomeAfterLogin() {
    let loggedInAt;
    try {
        loggedInAt = Number(sessionStorage.getItem('sampira:login-welcome'));
        sessionStorage.removeItem('sampira:login-welcome');
    } catch { return; /* Storage may be disabled; keep login usable. */ }
    if (!loggedInAt || loggedInAt > Date.now() || Date.now() - loggedInAt > 120000) return;
    try {
        const response = await fetch('/api/user/profile', {credentials: 'same-origin', signal: AbortSignal.timeout(8000)});
        if (!response.ok) return;
        const result = await response.json();
        if (result.status !== 'success' || !result.data) return;
        const name = typeof result.data.name === 'string' ? result.data.name.trim() : '';
        showSessionDialog({title: name ? 'Selamat datang, ' + name + '!' : 'Selamat datang di SAMPIRA!',
            message: 'Anda berhasil masuk. Mari lanjutkan langkah untuk lingkungan yang lebih bersih.', confirmLabel: 'Mulai aktivitas'});
    } catch { /* A welcome message must never block access to the portal. */ }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', welcomeAfterLogin, {once: true});
// Defer the greeting until the current page initialization has finished.
else window.setTimeout(welcomeAfterLogin, 0);
