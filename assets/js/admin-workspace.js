import {base, request} from './facility-api.js';
import {dateLabel, statuses} from './facility-report-ui.js?v=history-cards';

const navigation = document.querySelector('.sp-admin-nav');
const toggle = document.getElementById('admin-menu-toggle');
const breadcrumb = document.getElementById('admin-current-view');
const content = document.getElementById('admin-content');
const overview = document.getElementById('admin-overview');
const notice = overview.querySelector('[role=status]');
const metrics = overview.querySelectorAll('[data-overview-status]');
const table = document.getElementById('admin-recent-reports');
const state = document.getElementById('admin-recent-state');
const tableRegion = table.closest('[role=region]');
const retry = overview.querySelector('[data-overview-retry]');
let sequence = 0;

function switchView(id) {
    navigation.querySelector('button[aria-controls="' + id + '"]')?.click();
}

toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
});

navigation.addEventListener('click', event => {
    const button = event.target.closest('[aria-controls]');
    if (!button) return;
    breadcrumb.textContent = button.textContent.trim();
    if (toggle.getClientRects().length && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false');
        content.focus({preventScroll: true});
    }
    window.scrollTo(0, 0);
});

document.querySelector('.sp-admin-sidebar').addEventListener('keydown', event => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
});

overview.addEventListener('click', event => {
    const shortcut = event.target.closest('[data-admin-go]');
    if (!shortcut) return;
    switchView(shortcut.dataset.adminGo);
    content.focus({preventScroll: true});
});

function addReport(report) {
    const row = table.insertRow();
    const subject = row.insertCell();
    const heading = document.createElement('strong');
    heading.textContent = report.title;
    const number = document.createElement('small');
    number.textContent = report.tracking_number;
    const date = document.createElement('small');
    date.textContent = dateLabel(report.created_at);
    subject.append(heading, number, date);
    const badge = document.createElement('span');
    badge.className = 'facility-badge';
    badge.dataset.status = report.status;
    badge.textContent = statuses[report.status] || 'Status belum tersedia';
    row.insertCell().append(badge);
    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'sp-button sp-button--quiet';
    detail.textContent = 'Detail';
    detail.setAttribute('aria-label', 'Detail ' + report.tracking_number);
    detail.addEventListener('click', () => {
        switchView('admin-report-verification');
        window.dispatchEvent(new CustomEvent('sampira:report-detail', {detail:{id:report.id}}));
    });
    row.insertCell().append(detail);
}

async function loadOverview() {
    const run = ++sequence;
    overview.setAttribute('aria-busy', 'true');
    overview.dataset.state = 'loading';
    retry.disabled = true;
    notice.textContent = 'Memuat cuplikan antrean…';
    state.textContent = 'Memuat laporan terbaru…';
    state.hidden = false;
    tableRegion.hidden = true;
    table.replaceChildren();
    for (const field of metrics) field.textContent = '—';
    try {
        const [verification, handling] = await Promise.allSettled([
            request(base + '?limit=20'), request(base + '/handling?limit=20')
        ]);
        if (run !== sequence) return;
        const count = (items, status) => items.filter(item => item.status === status).length;
        const reports = verification.value?.items;
        const tasks = handling.value?.items;
        const complete = Boolean(reports && tasks);
        for (const field of metrics) {
            const key = field.dataset.overviewStatus;
            const items = key === 'pending' ? reports : tasks;
            if (items) field.textContent = count(items, key);
        }
        for (const report of (reports || []).slice(0, 8)) addReport(report);
        tableRegion.hidden = !reports?.length;
        state.hidden = !tableRegion.hidden;
        state.textContent = reports ? 'Belum ada laporan fasilitas.' : 'Daftar laporan gagal dimuat.';
        overview.dataset.state = complete ? 'ready' : 'error';
        const unavailable = [verification, handling].some(result => result.reason?.status === 404);
        notice.textContent = complete
            ? 'Cuplikan ' + reports.length + ' laporan verifikasi dan ' + tasks.length + ' laporan penanganan' +
                ' · Perlu revisi ' + count(reports, 'revision_required') + ' · Disetujui ' + count(reports, 'approved') +
                ' · Selesai ' + count(tasks, 'completed')
            : unavailable ? 'Layanan laporan tidak tersedia di server ini.' : 'Data antrean belum dapat dimuat sepenuhnya.';
        retry.hidden = complete;
    } finally {
        if (run === sequence) {
            overview.removeAttribute('aria-busy');
            retry.disabled = false;
        }
    }
}

overview.addEventListener('sampira:open', loadOverview);
retry.addEventListener('click', loadOverview);
overview.addEventListener('sampira:close', () => { sequence++; overview.removeAttribute('aria-busy'); });
void loadOverview();
