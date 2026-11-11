import {mountCommunityReports} from './facility-community.js?v=community-detail-15';
import {mountReportForm} from './facility-report-form.js?v=facility-simple-2';
import {historyEntry, mountReports, reportCard, reportDetails} from './facility-report-ui.js?v=facility-simple-2';
import {base, request} from './facility-api.js?v=phase5b';
import {mountPublicHandling} from './facility-handling.js?v=facility-simple-2';
import {mountLocationDetail} from './location-map.js?v=phase8';
import {facilityMapStates} from './map-core.js?v=phase8';

const pageLimit = 20;

function submissionKey() {
    if (typeof crypto.randomUUID === 'function') { return crypto.randomUUID(); }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function messageFor(error, collection) {
    switch (error.status) {
    case 400: return error.message || 'Periksa kembali isian laporan.';
    case 403: return 'Akses laporan fasilitas ditolak.';
    case 404: return collection ? 'Layanan laporan fasilitas belum tersedia.' : 'Laporan tidak ditemukan atau tidak tersedia untuk akun ini.';
    case 409: return 'Versi atau status laporan berubah. Detail terbaru dimuat ulang.';
    case 413: return 'Ukuran unggahan terlalu besar. Pilih foto hingga 5 MiB.';
    case 415: return 'Format kiriman tidak didukung. Periksa format isian atau foto.';
    case 0: return error.message + ' Coba lagi saat koneksi tersedia.';
    default: return 'Layanan laporan sedang bermasalah. Coba lagi dalam beberapa saat.';
    }
}

function verificationButtonLabel(status) {
    const labels = {approved: 'Setujui dan tugaskan', revision_required: 'Kirim permintaan perbaikan', rejected: 'Tolak laporan'};
    return labels[status] || 'Simpan';
}

function verificationSuccess(status) {
    const messages = {
        approved: 'Laporan disetujui. Tugas sudah masuk ke akun Petugas yang dipilih.',
        revision_required: 'Permintaan perbaikan sudah dikirim ke pelapor.',
        rejected: 'Laporan ditolak. Alasan tersimpan untuk pelapor.'
    };
    return messages[status];
}

function validVerificationNote(note) {
    const value = note.value.trim();
    if ((!note.required || value) && [...value].length <= 1000) return true;
    note.setCustomValidity(value ? 'Catatan maksimal 1.000 karakter.' : 'Isi alasan keputusan ini.');
    note.reportValidity();
    return false;
}

function init(root) {
    const admin = root.dataset.facilityReports === 'admin';
    mountReports(root, admin);
    const userForm = admin ? null : mountReportForm(root);
    const community=admin?null:mountCommunityReports(root);
    const $ = name => root.querySelector('#facility-' + name);
    const list = $('list');
    const listMore = $('list-more');
    const listRetry = $('list-retry');
    const history = $('history');
    const historyMore = $('history-more');
    const backButtons = root.querySelectorAll('[data-facility-back]');
    let listRequest = 0;
    let detailRequest = 0;
    let listCursor = null;
    let retryCursor = null;
    let historyCursor = null;
    let selected;
    let detailID;
    let editing;
    let postAttempt;
    let busy = false;
    let sessionEnding = false;
    let disposeLocation;
    if (admin) { $('status').value = 'pending'; }

    function announce(text, error = false) {
        if (sessionEnding) { return; }
        $('success').textContent = error ? '' : text;
        $('error').textContent = error ? text : '';
    }

    function failure(error, collection = false) {
        if (error.status === 401) {
            announce('Sesi berakhir. Anda akan diarahkan ke halaman masuk.', true);
            if (!sessionEnding) { setTimeout(() => window.location.replace('/login'), 800); }
            sessionEnding = true;
            return;
        }
        announce(messageFor(error, collection), true);
    }

    let cachedReports = [];

    function renderDisplayedList(focusFirst = false) {
        if (admin) { return; }
        list.replaceChildren();
        const query = ($('search')?.value || '').trim().toLocaleLowerCase('id-ID');
        const sortDir = $('sort')?.value === 'oldest' ? 1 : -1;
        let items = cachedReports;
        if (query) {
            items = items.filter(report => {
                const title = String(report.title || '').toLocaleLowerCase('id-ID');
                const tracking = String(report.tracking_number || '').toLocaleLowerCase('id-ID');
                const address = String(report.address || '').toLocaleLowerCase('id-ID');
                const desc = String(report.description || '').toLocaleLowerCase('id-ID');
                return title.includes(query) || tracking.includes(query) || address.includes(query) || desc.includes(query);
            });
        }
        items = [...items].sort((a, b) => {
            const timeA = Date.parse(a.created_at) || 0;
            const timeB = Date.parse(b.created_at) || 0;
            return sortDir * (timeA - timeB);
        });
        const nodes = items.map(report => reportCard(report, admin, openFromList, base));
        list.append(...nodes);
        $('list-message').textContent = list.children.length
            ? list.children.length + ' laporan ditampilkan.'
            : 'Belum ada laporan untuk filter ini.';
        if (focusFirst && nodes.length) {
            (nodes[0].querySelector('button') || $('list-heading')).focus();
        }
    }

    function syncCommunity() {
        if(community){ community.hidden=$('form-view').hidden||Boolean(editing)||(userForm.form.dataset.wizardStep||'1')!=='1'; }
    }
    userForm?.form.addEventListener('sampira:form-step',syncCommunity);

    function updateHero(view){
        const title=root.querySelector('#facility-heading');if(!title){ return; }
        const isForm=view==='form';const hero=title.closest('.ref-form-hero');if(hero){ hero.hidden=isForm; }
        const label=root.querySelector('.ref-hero-label');if(label){ label.textContent=isForm?'Layanan Pengaduan':'Pusat Monitoring Laporan'; }
        title.textContent=isForm?'Lapor Fasilitas':'Riwayat & Pelacakan';
        const description=root.querySelector('.ref-form-hero p');if(description){ description.textContent=isForm?'Laporkan masalah pada fasilitas sampah dan pantau hasil verifikasinya.':'Lihat riwayat penjemputan sampah dan laporan fasilitas yang Anda ajukan.'; }
        const note=root.querySelector('.ref-hero-note');if(note){ note.hidden=isForm; }
    }
    function show(view) {
        if (view !== 'list') { ++listRequest; }
        if (view !== 'detail') { disposeLocation?.(); }
        for (const panel of ['list', 'detail', 'form']) {
            const section = $(panel + '-view');
            if (section) { section.hidden = panel !== view; }
        }
        syncCommunity();
        if(!admin){ updateHero(view); }
        $(view + '-heading').focus();
    }

    function renderListPage(page,cursor){
            if (admin) {
                const items = page.items.map(report => reportCard(report, admin, openFromList, base));
                list.append(...items);
                listCursor = page.next_before_id;
                $('list-message').textContent = list.children.length
                    ? list.children.length + ' laporan ditampilkan.'
                    : 'Belum ada laporan untuk filter ini.';
                if (cursor !== null) { (items[0]?.querySelector('button') || $('list-heading')).focus(); }
            } else {
                if (cursor === null) { cachedReports = page.items; }
                else { cachedReports.push(...page.items); }
                listCursor = page.next_before_id;
                renderDisplayedList(cursor !== null);
            }
    }

    async function loadList(cursor = null) {
        const sequence = ++listRequest;
        const params = new URLSearchParams({limit: pageLimit});
        for (const filter of ['status', 'category']) {
            if ($(filter).value) { params.set(filter, $(filter).value); }
        }
        if (cursor !== null) { params.set('before_id', cursor); }
        else {
            list.replaceChildren();
            cachedReports = [];
            listCursor = null;
        }
        list.setAttribute('aria-busy', 'true');
        listMore.disabled = true;
        listRetry.hidden = true;
        $('list-message').textContent = 'Memuat daftar laporan…';
        try {
            const page = await request(base + '?' + params);
            if (sequence !== listRequest) { return; }
            renderListPage(page,cursor);
        } catch (error) {
            if (sequence !== listRequest) { return; }
            retryCursor = cursor;
            $('list-message').textContent = 'Daftar laporan gagal dimuat.';
            listRetry.hidden = error.status === 401;
            failure(error, true);
        } finally {
            if (sequence === listRequest) {
                list.removeAttribute('aria-busy');
                listMore.disabled = false;
                listMore.hidden = listCursor === null || !listRetry.hidden || sessionEnding;
            }
        }
    }

    function showList() {
        ++detailRequest;
        selected = null;
        detailID = null;
        announce('');
        show('list');
        void loadList();
    }

    function openFromList(id) {
        announce('');
        void loadDetail(id);
    }

    async function loadDetail(id) {
        if (!Number.isSafeInteger(id) || id < 1) { return; }
        detailID = id;
        const sequence = ++detailRequest;
        selected = null;
        show('detail');
        disposeLocation?.();
        $('detail').replaceChildren();
        history.replaceChildren();
        $('history-section').hidden = true;
        $('detail-retry').hidden = true;
        $('detail-message').hidden = false;
        $('detail-message').textContent = 'Memuat detail laporan…';
        const action = admin ? $('verify') : $('revise');
        action.hidden = true;
        try {
            const detail = await request(base + '/' + id);
            const [report] = await facilityMapStates([detail],request,base);
            if (sequence !== detailRequest) { return; }
            selected = report;
            $('detail-message').hidden = true;
            const location = document.createElement('div');
            $('detail').replaceChildren(reportDetails(report, admin, base), location);
            disposeLocation = mountLocationDetail(location, {
                title: 'Titik lokasi fasilitas', point: report, address: report.address, reported: true, autoTiles: true, kind:'facility'
            });
            if (!admin) { mountPublicHandling($('detail'), report); }
            action.hidden = admin ? report.status !== 'pending' : report.status !== 'revision_required';
            if (admin) {
                action.reset();
                $('officer-field').hidden = true;
                $('note-field').hidden = true;
                $('verify-officer').required = false;
                $('verify-submit').textContent = 'Simpan';
                $('verify-feedback').textContent = '';
                $('note').required = false;
                $('note').setCustomValidity('');
            }
            $('history-section').hidden = false;
            historyCursor = null;
            void loadHistory();
        } catch (error) {
            if (sequence !== detailRequest) { return; }
            $('detail-message').textContent = 'Detail laporan gagal dimuat.';
            $('detail-retry').hidden = error.status === 401 || error.status === 403 || error.status === 404;
            $('detail-retry').onclick = () => openFromList(id);
            failure(error);
        }
    }

    async function loadHistory(cursor = null) {
        const sequence = detailRequest;
        const id = selected?.id;
        if (!id) { return; }
        const params = new URLSearchParams({limit: pageLimit});
        if (cursor !== null) { params.set('before_version', cursor); }
        history.setAttribute('aria-busy', 'true');
        historyMore.hidden = cursor === null;
        historyMore.disabled = true;
        $('history-message').textContent = 'Memuat histori…';
        try {
            const page = await request(base + '/' + id + '/history?' + params);
            if (sequence !== detailRequest) { return; }
            const entries = page.items.map(item => historyEntry(item, admin));
            history.append(...entries);
            historyCursor = page.next_before_version;
            $('history-message').textContent = history.children.length ? history.children.length + ' perubahan ditampilkan.' : 'Belum ada histori.';
            historyMore.textContent = 'Muat histori sebelumnya';
            historyMore.hidden = historyCursor === null;
            if (cursor !== null && entries.length) {
                entries[0].tabIndex = -1;
                entries[0].focus();
            }
        } catch (error) {
            if (sequence !== detailRequest) { return; }
            historyCursor = cursor;
            $('history-message').textContent = 'Histori gagal dimuat. ' + messageFor(error);
            historyMore.textContent = 'Coba lagi memuat histori';
            historyMore.hidden = error.status === 401;
            if (error.status === 401) { failure(error); }
        } finally {
            if (sequence === detailRequest) {
                history.removeAttribute('aria-busy');
                historyMore.disabled = false;
            }
        }
    }

    function setBusy(form, active) {
        busy = active;
        form.querySelector('fieldset').disabled = active;
        form.setAttribute('aria-busy', String(active));
        for (const button of backButtons) { button.disabled = active; }
        if (userForm) { $('form-back').disabled = active; }
    }

    function updatePostControls() {
        const uncertain = Boolean(postAttempt?.uncertain && !editing);
        userForm.form.querySelector('fieldset').disabled = busy || uncertain;
        $('retry-post').hidden = !uncertain;
        $('retry-post').disabled = busy;
        $('discard-post').hidden = !uncertain;
        $('discard-post').disabled = busy;
        $('new').textContent = postAttempt?.uncertain ? 'Lanjutkan pengiriman' : 'Buat laporan';
    }

    async function sendReport(body) {
        const form = userForm.form;
        const revision = editing;
        const attempt = postAttempt;
        setBusy(form, true);
        updatePostControls();
        announce(revision ? 'Mengirim revisi…' : 'Mengirim laporan…');
        try {
            const report = revision
                ? await request(base + '/' + revision.id, {method: 'PUT', body})
                : await request(base, {method: 'POST', headers: {'Idempotency-Key': attempt.key}, body: attempt.body});
            if (!revision) { postAttempt = null; }
            editing = null;
            userForm.reset();
            const action = revision ? 'Revisi terkirim. ' : 'Laporan tercatat. ';
            announce(action + 'Nomor laporan ' + report.tracking_number + '.');
            window.dispatchEvent(new Event('sampira:facility-community-updated'));
            void loadDetail(report.id);
        } catch (error) {
            if (!revision && (error.status === 0 || error.status >= 500)) {
                attempt.uncertain = true;
                announce('Hasil pengiriman belum dapat dipastikan. Gunakan “Coba kirim ulang” untuk melanjutkan pengajuan yang sama.', true);
                $('retry-post').hidden = false;
            } else {
                failure(error, !revision);
                if (revision && error.status === 409) {
                    editing = null;
                    userForm.reset();
                    void loadDetail(revision.id);
                }
            }
        } finally {
            setBusy(form, false);
            updatePostControls();
            if (postAttempt?.uncertain && !$('form-view').hidden && !sessionEnding) { $('retry-post').focus(); }
        }
    }

    function initUser() {
        $('new').addEventListener('click', () => {
            editing = null;
            if (!postAttempt?.uncertain) { userForm.reset(); }
            announce(postAttempt?.uncertain ? 'Lanjutkan pengajuan yang hasilnya belum dikonfirmasi.' : '');
            updatePostControls();
            show('form');
        });
        $('revise').addEventListener('click', () => {
            if (selected?.status !== 'revision_required') { return; }
            if (postAttempt?.uncertain) {
                announce('Selesaikan atau abaikan pengiriman laporan sebelumnya dari daftar sebelum membuka revisi.', true);
                return;
            }
            editing = selected;
            ++detailRequest;
            userForm.reset(editing);
            announce('Konfirmasi terdampak warga akan direset setelah revisi berhasil dikirim.');
            show('form');
        });
        $('form-back').addEventListener('click', () => {
            if (busy) { return; }
            if (editing) {
                const id = editing.id;
                editing = null;
                userForm.reset();
                openFromList(id);
            } else {
                if (!postAttempt?.uncertain) {
                    postAttempt = null;
                    userForm.reset();
                }
                document.querySelector('.sidebar-item[data-target="beranda"]').click();
            }
        });
        $('retry-post').addEventListener('click', () => {
            if (!busy && postAttempt?.uncertain && !sessionEnding) { void sendReport(); }
        });
        $('discard-post').addEventListener('click', () => {
            if (!busy && window.confirm('Hasil pengiriman belum diketahui. Periksa daftar sebelum membuat laporan baru. Abaikan percobaan ini?')) {
                postAttempt = null;
                userForm.reset();
                updatePostControls();
                showList();
            }
        });
        userForm.form.addEventListener('submit', event => {
            event.preventDefault();
            if (busy || sessionEnding || (!editing && postAttempt?.uncertain)) { return; }
            const body = userForm.payload();
            if (!body) { return; }
            if (editing) {
                body.set('version', editing.version);
            } else {
                postAttempt = {key: postAttempt?.key || submissionKey(), body, uncertain: false};
            }
            void sendReport(body);
        });
    }

    function initAdmin() {
        const form = $('verify');
        const decision = $('decision');
        const note = $('note');
        const officer = $('verify-officer');
        const officerState = $('officer-state');
        const officerMore = $('officer-more');
        let officerCursor = null, officersLoaded = false, loadingOfficers = false;
        async function loadOfficers() {
            if (loadingOfficers) return;
            loadingOfficers = true; officerMore.disabled = true;
            officerState.textContent = 'Memuat Petugas aktif…';
            try {
                const query = new URLSearchParams({limit: 100});
                if (officerCursor !== null) query.set('before_id', officerCursor);
                const page = await request(base + '/handling/officers?' + query);
                for (const item of page.items) officer.append(new Option(item.name, item.id));
                officerCursor = page.next_before_id; officersLoaded = true;
                officerMore.hidden = officerCursor === null;
                officerMore.textContent = 'Muat Petugas lainnya';
                officerState.textContent = officer.options.length > 1 ? '' : 'Belum ada Petugas aktif. Aktifkan akun Petugas terlebih dahulu.';
            } catch (error) {
                if (error.status === 401) failure(error);
                officerState.textContent = 'Daftar Petugas belum dapat dimuat. Klik Muat Petugas untuk mencoba lagi.';
            }
            finally { loadingOfficers = false; officerMore.disabled = false; }
        }
        officerMore.addEventListener('click', () => void loadOfficers());
        decision.addEventListener('change', () => {
            const approved = decision.value === 'approved';
            $('verify-submit').textContent = verificationButtonLabel(decision.value);
            $('note-label').textContent = decision.value === 'rejected' ? 'Alasan laporan ditolak' : 'Apa yang perlu diperbaiki pelapor?';
            $('officer-field').hidden = !approved; officer.required = approved;
            $('note-field').hidden = approved || !decision.value;
            if (approved && !officersLoaded) void loadOfficers();
            note.required = ['revision_required', 'rejected'].includes(decision.value);
            note.setCustomValidity('');
        });
        note.addEventListener('input', () => note.setCustomValidity(''));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (busy || sessionEnding || selected?.status !== 'pending') { return; }
            const status = decision.value;
            const value = note.value.trim();
            if (!validVerificationNote(note)) return;
            if (status === 'approved' && !officer.reportValidity()) return;
            const id = selected.id;
            const body = {status, version: selected.version, note: status === 'approved' ? null : value || null};
            if (status === 'approved') body.petugas_id = Number(officer.value);
            setBusy(form, true);
            $('verify-feedback').textContent = 'Menyimpan…';
            announce('Menyimpan…');
            try {
                await request(base + '/' + id + '/verification', {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
                });
                const success = verificationSuccess(body.status);
                $('verify-feedback').textContent = success; announce(success);
                void loadDetail(id);
            } catch (error) {
                const feedback = error.status === 400 && body.status === 'approved' && error.message === 'Body laporan tidak valid.' ? 'Persetujuan belum tersimpan. Backend mungkin belum mendukung penugasan langsung; periksa versi server.' : messageFor(error);
                $('verify-feedback').textContent = feedback;
                failure(error);
                if (error.status === 409) { void loadDetail(id); }
            } finally {
                setBusy(form, false);
            }
        });
    }

    for (const filter of ['status', 'category']) {
        $(filter).addEventListener('change', () => { announce(''); void loadList(); });
    }
    $('search')?.addEventListener('input', () => { announce(''); renderDisplayedList(); });
    $('sort')?.addEventListener('change', () => { announce(''); renderDisplayedList(); });
    listRetry.addEventListener('click', () => { announce(''); void loadList(retryCursor); });
    listMore.addEventListener('click', () => void loadList(listCursor));
    historyMore.addEventListener('click', () => void loadHistory(historyCursor));
    for (const button of backButtons) { button.addEventListener('click', showList); }
    if (admin) {
        initAdmin();
        window.addEventListener('sampira:report-detail', event => {
            if (!root.hidden) { openFromList(event.detail.id); }
        });
        root.addEventListener('sampira:close', () => {
            ++detailRequest;
            disposeLocation?.();
        });
        document.querySelector('[data-open-handling]').addEventListener('click', () => {
            ++detailRequest;
            disposeLocation?.();
        });
        document.querySelector('[data-open-verification]').addEventListener('click', () => {
            if (detailID) { void loadDetail(detailID); }
        });
        void loadList();
    } else {
        initUser();
        window.addEventListener('sampira:user-report-view', event => {
            if (!root.classList.contains('active') || busy || sessionEnding) { return; }
            if (event.detail.view === 'new') { $('new').click(); }
            else if (event.detail.view === 'detail') { openFromList(event.detail.id); }
            else if (event.detail.view === 'list' && $('list-view').hidden) { showList(); }
        });
        window.addEventListener('sampira:user-view', event => {
            if(event.detail!=='laporan-fasilitas'||busy||sessionEnding){ return; }
            if ($('form-view').hidden) { $('new').click(); }
            else { $('form-heading').focus(); }
            syncCommunity();
        });
        $('new').click();
    }
}

const root = document.querySelector('[data-facility-reports]');
if (root) { init(root); }
