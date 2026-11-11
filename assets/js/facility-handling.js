import {base, request} from './facility-api.js?v=phase5b';
import {adminTable, categories, element, options} from './facility-report-ui.js?v=admin-6b4';
import {button, handlingCard, handlingEvent, handlingStatuses, handlingSummary} from './facility-handling-ui.js?v=admin-6b4';
import {handlingActions, openHandlingForm} from './facility-handling-form.js?v=phase4b';
import {mountLocationDetail} from './location-map.js?v=phase8';

const listPath = base + '/handling';
const pageLimit = 20;
const detailPath = id => base + '/' + id + '/handling';

function message(error) {
    switch (error.status) {
    case 400: return error.message || 'Periksa isian.';
    case 401: return 'Sesi berakhir. Anda akan diarahkan ke halaman masuk.';
    case 403: return 'Akun atau asal permintaan tidak diizinkan.';
    case 404: return 'Data penanganan tidak tersedia untuk akun ini.';
    case 409: return 'Versi atau status berubah. Tinjau detail terbaru sebelum mengirim lagi.';
    case 413: return 'Ukuran kiriman terlalu besar.';
    case 415: return 'Format kiriman tidak didukung.';
    default: return 'Layanan penanganan gagal merespons. Periksa kondisi terbaru sebelum mencoba lagi.';
    }
}

let redirecting = false;
function sessionEnded(status) {
    status.textContent = message({status:401});
    if (!redirecting) {
        redirecting = true;
        setTimeout(() => window.location.replace('/login'), 800);
    }
}

function historyPanel(report, role, onFailure) {
    const root = element('section', undefined, 'facility-stack');
    const status = element('output', '', 'facility-muted');
    const items = element('ol', undefined, 'facility-timeline handling-timeline');
    const events = [];
    let cursor = null;
    const more = button('Muat histori berikutnya', () => void load());
    root.append(element('h4', 'Histori penanganan'), status, items, more);
    async function load() {
        status.textContent = 'Memuat histori…';
        more.disabled = true;
        try {
            const query = new URLSearchParams({limit:pageLimit});
            if (cursor !== null) query.set('before_version', cursor);
            const page = await request(detailPath(report.report_id) + '/history?' + query);
            if (!root.isConnected) return;
            const first = events.length;
            cursor = page.next_before_version;
            events.push(...page.items);
            items.append(...page.items.map(event => handlingEvent(event, report, role)));
            status.textContent = events.length ? events.length + ' aktivitas ditampilkan.' : 'Belum ada aktivitas penanganan.';
            more.hidden = cursor === null;
            more.textContent = 'Muat histori berikutnya';
            if (first && items.children[first]) {
                items.children[first].tabIndex = -1;
                items.children[first].focus();
            }
        } catch (error) {
            if (!root.isConnected) return;
            status.textContent = message(error);
            more.textContent = 'Coba lagi memuat histori';
            if (error.status === 401 || error.status === 404 || error.status === 403) onFailure(error);
        } finally { more.disabled = false; }
    }
    return {root, events, load};
}

export function mountPublicHandling(container, report) {
    const root = element('section', undefined, 'facility-stack handling-public');
    const status = element('output', '', 'facility-muted');
    const data = element('div', undefined, 'facility-stack');
    const reload = button('Muat ulang progres', () => void load());
    root.append(element('h4', 'Progres Penanganan Fasilitas'), status, data);
    container.append(root);
    if (report.status !== 'approved') {
        status.textContent = 'Tindak lanjut lapangan belum tersedia untuk laporan ini.';
        return;
    }
    root.append(reload);
    async function load() {
        reload.disabled = true;
        status.textContent = 'Memuat progres penanganan…';
        data.replaceChildren();
        try {
            const summary = await request(detailPath(report.id));
            if (!root.isConnected) return;
            status.textContent = '';
            const history = historyPanel(summary, 'user', error => {
                data.replaceChildren();
                if (error.status === 401) sessionEnded(status);
                else status.textContent = message(error);
            });
            data.append(handlingSummary(summary, 'user'), history.root);
            void history.load();
        } catch (error) {
            if (!root.isConnected) return;
            if (error.status === 401) sessionEnded(status);
            else status.textContent = message(error);
        } finally { reload.disabled = false; }
    }
    void load();
}

function workspace(root) {
    const role = root.dataset.facilityHandling;
    const admin = role === 'admin';
    const header = element('header', undefined, 'facility-header');
    const intro = element('div');
    const heading = element('h2', admin ? 'Penanganan Laporan' : 'Tugas Fasilitas');
    heading.tabIndex = -1;
    intro.append(element('p', admin ? 'Ruang tindak lanjut' : 'Ruang kerja lapangan', 'facility-kicker'), heading,
        element('p', admin ? 'Tugaskan Petugas, pantau penanganan, dan validasi hasil laporan fasilitas.' : 'Lihat tugas dari Admin dan catat kegiatan di lokasi fasilitas.'));
    header.append(intro);
    const notice = element('output', '', 'facility-notice');
    const errorBox = element('p', '', 'facility-notice error');
    errorBox.setAttribute('role','alert');
    const listView = element('section', undefined, 'facility-panel');
    const detailView = element('section', undefined, 'facility-panel facility-stack');
    detailView.hidden = true;
    const detailHeading = element('h3', 'Detail penanganan');
    detailHeading.tabIndex = -1;
    const detailTop = element('div', undefined, 'facility-actions');
    const refresh = button('Muat ulang detail', () => void openDetail(selected));
    const back = button('Kembali ke daftar', () => showList());
    detailTop.append(detailHeading, back, refresh);
    const detailBody = element('div', undefined, 'facility-stack');
    detailView.append(detailTop, detailBody);

    const filters = element('div', undefined, 'facility-filters');
    function filter(title, values, blank) {
        const input = element('select');
        input.append(options(values, blank));
        const label = element('label', title, 'facility-field');
        label.append(input);
        filters.append(label);
        input.addEventListener('change', () => void loadList());
        return input;
    }
    const statusFilter = filter('Status penanganan', handlingStatuses, 'Semua status');
    const categoryFilter = filter('Kategori', categories, 'Semua kategori');
    if (admin) statusFilter.value = 'approved';
    const listStatus = element('output', '', 'facility-muted');
    const cards = element(admin ? 'tbody' : 'ul', undefined, 'facility-cards');
    const queue = admin ? adminTable('Tabel penanganan laporan', ['Laporan', 'Penanganan', 'Penugasan', 'Koordinasi', 'Diperbarui', 'Aksi'], cards) : cards;
    const more = button('Muat laporan berikutnya', () => void loadList(cursor));
    const reload = button('Muat ulang daftar', () => void loadList());
    const toolbar = element('div', undefined, 'facility-toolbar');
    toolbar.append(filters, reload);
    listView.append(element('h3', admin ? 'Antrean dan monitoring' : 'Daftar tugas saya'), toolbar, listStatus, queue, more);
    root.append(header, notice, errorBox, listView, detailView);

    let listSequence = 0;
    let detailSequence = 0;
    let cursor = null;
    let selected;
    let disposeLocation;
    function handleReadError(error, destination) {
        if (error.status === 401) sessionEnded(errorBox);
        else destination.textContent = message(error);
    }

    async function loadList(before = null) {
        const sequence = ++listSequence;
        const query = new URLSearchParams({limit:pageLimit});
        if (statusFilter.value) query.set('status', statusFilter.value);
        if (categoryFilter.value) query.set('category', categoryFilter.value);
        if (before !== null) query.set('before_id', before);
        else { cards.replaceChildren(); cursor = null; }
        listStatus.textContent = 'Memuat daftar penanganan…';
        listStatus.setAttribute('aria-live', 'polite');
        cards.setAttribute('aria-busy', 'true');
        more.disabled = true;
        more.hidden = true;
        try {
            const page = await request(listPath + '?' + query);
            if (sequence !== listSequence) return;
            const newCards = page.items.map(report => handlingCard(report, id => {
                notice.textContent = errorBox.textContent = '';
                void openDetail(id);
            }, admin));
            cards.append(...newCards);
            if (before !== null) newCards[0]?.querySelector('button').focus();
            cursor = page.next_before_id;
            more.hidden = cursor === null;
            listStatus.textContent = cards.children.length ? cards.children.length + ' laporan ditampilkan.' : 'Belum ada laporan untuk filter ini.';
        } catch (error) {
            if (sequence === listSequence) handleReadError(error, listStatus);
        } finally {
            if (sequence === listSequence) {
                more.disabled = false;
                cards.removeAttribute('aria-busy');
            }
        }
    }

    function showList() {
        ++detailSequence;
        selected = null;
        disposeLocation?.();
        detailBody.replaceChildren();
        detailView.hidden = true;
        listView.hidden = false;
        heading.focus();
        void loadList();
    }

    async function openDetail(id, navigation) {
        if (!Number.isSafeInteger(id) || id < 1) return;
        selected = id;
        const sequence = ++detailSequence;
        detailView.hidden = false;
        listView.hidden = true;
        detailHeading.focus();
        const status = element('output', 'Memuat detail penanganan…', 'facility-muted');
        disposeLocation?.();
        detailBody.replaceChildren(status);
        refresh.disabled = true;
        try {
            const report = await request(detailPath(id));
            if (sequence !== detailSequence) return;
            const history = historyPanel(report, role, error => {
                handleReadError(error, errorBox);
                if (error.status === 404 || error.status === 403) showList();
            });
            const actions = element('div', undefined, 'facility-actions handling-actions');
            for (const config of handlingActions(report, role)) actions.append(button(config.title, () => {
                openHandlingForm(root, report, config, history.events, async (endpoint, payload, close) => {
                    notice.textContent = errorBox.textContent = '';
                    try {
                        const updated = await request(detailPath(id) + '/' + endpoint, payload);
                        close();
                        notice.textContent = 'Perubahan tersimpan. Versi penanganan ' + updated.version + '.';
                        void loadList();
                        void openDetail(id);
                    } catch (error) {
                        if (![401,403,404,409,500,0].includes(error.status)) throw new Error(message(error));
                        close();
                        if (error.status === 401) { sessionEnded(errorBox); return; }
                        errorBox.textContent = message(error);
                        if (error.status === 404 || error.status === 403) showList();
                        else {
                            void loadList();
                            void openDetail(id);
                        }
                    }
                }, () => sessionEnded(errorBox));
            }, true));
            const location = element('div');
            detailBody.replaceChildren(handlingSummary(report, role), location, actions, history.root);
            disposeLocation = mountLocationDetail(location, {
                title: 'Titik lokasi fasilitas', point: report, address: report.address, reported: true, autoTiles: true, kind:'facility',
                navigation: admin ? null : {...navigation, authorize, recheck: true}
            });
            void history.load();

            async function authorize() {
                if (sequence !== detailSequence || root.hidden || !root.getClientRects().length) return false;
                try {
                    const latest = await request(detailPath(id));
                    if (sequence !== detailSequence || !root.getClientRects().length) return false;
                    if (['latitude', 'longitude', 'address'].some(field => latest[field] !== report[field])) {
                        void openDetail(id);
                        return false;
                    }
                    return true;
                } catch (error) {
                    if (sequence !== detailSequence) return false;
                    if ([401, 403, 404].includes(error.status)) {
                        handleReadError(error, errorBox);
                        showList();
                        return false;
                    }
                    throw new Error('Akses tugas belum dapat diperiksa. Coba lagi saat koneksi tersedia.');
                }
            }
        } catch (error) {
            if (sequence !== detailSequence) return;
            handleReadError(error, errorBox);
            if (error.status === 404 || error.status === 403) showList();
            else status.textContent = 'Detail gagal dimuat.';
        } finally { if (sequence === detailSequence) refresh.disabled = false; }
    }

    window.addEventListener('sampira:handling-detail', event => {
        if (root.getClientRects().length) void openDetail(event.detail.id, event.detail.navigation);
    });
    root.addEventListener('sampira:close', () => {
        ++detailSequence;
        ++listSequence;
        disposeLocation?.();
        detailBody.replaceChildren();
    });
    for (const trigger of document.querySelectorAll('[data-open-handling]')) {
        trigger.addEventListener('click', () => {
            if (admin) {
                root.hidden = false;
                document.querySelector('[data-facility-reports="admin"]').hidden = true;
                trigger.setAttribute('aria-pressed', 'true');
                document.querySelector('[data-open-verification]').setAttribute('aria-pressed', 'false');
            }
            notice.textContent = errorBox.textContent = '';
            showList();
        });
    }
    if (admin) document.querySelector('[data-open-verification]').addEventListener('click', event => {
        ++detailSequence;
        ++listSequence;
        disposeLocation?.();
        detailBody.replaceChildren();
        root.hidden = true;
        const verification = document.querySelector('[data-facility-reports="admin"]');
        verification.hidden = false;
        verification.querySelector('h2')?.focus();
        event.currentTarget.setAttribute('aria-pressed','true');
        document.querySelector('[data-open-handling]').setAttribute('aria-pressed','false');
    });
    if (!admin) window.addEventListener('sampira:collector-view', () => {
        if (root.getClientRects().length) return;
        ++detailSequence;
        selected = null;
        disposeLocation?.();
        detailBody.replaceChildren();
    });
}

const root = document.querySelector('[data-facility-handling]');
if (root) workspace(root);
