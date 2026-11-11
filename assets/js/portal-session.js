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

function logoutPortal() {
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
