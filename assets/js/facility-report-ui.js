export const categories = {
    tps: 'Tempat Penampungan Sementara (TPS)',
    collection_site: 'Tempat Pengumpulan Sampah',
    waste_bank: 'Bank Sampah',
    other: 'Fasilitas Lainnya'
};

export const categoryIcons = {
    tps: 'fa-trash-can',
    collection_site: 'fa-truck',
    waste_bank: 'fa-recycle',
    other: 'fa-layer-group'
};

export const statuses = {
    pending: 'Menunggu Verifikasi',
    revision_required: 'Perlu Revisi',
    approved: 'Disetujui',
    rejected: 'Ditolak'
};

const dateFormat = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta'
});

export function dateLabel(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.valueOf()) ? dateFormat.format(date) + ' WIB' : '—';
}

export function options(labels, placeholder) {
    const select = document.createDocumentFragment();
    select.append(new Option(placeholder, ''));
    for (const [value, label] of Object.entries(labels)) select.append(new Option(label, value));
    return select;
}

export function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

export function userStatusBadge(status) {
    const meta = {
        pending: { label: 'Menunggu Verifikasi', icon: 'fa-clock', className: 'pending' },
        revision_required: { label: 'Perlu Revisi', icon: 'fa-triangle-exclamation', className: 'cancelled' },
        approved: { label: 'Disetujui', icon: 'fa-circle-check', className: 'completed' },
        rejected: { label: 'Ditolak', icon: 'fa-circle-xmark', className: 'cancelled' },
        assigned: { label: 'Ditugaskan', icon: 'fa-user-check', className: 'pickup' },
        assessment_in_progress: { label: 'Asesmen Lapangan', icon: 'fa-magnifying-glass', className: 'transit' },
        handling_in_progress: { label: 'Dalam Penanganan', icon: 'fa-wrench', className: 'transit' },
        resolution_submitted: { label: 'Menunggu Validasi', icon: 'fa-hourglass-half', className: 'arrived' },
        resolution_revision_required: { label: 'Perlu Perbaikan', icon: 'fa-rotate-left', className: 'cancelled' },
        completed: { label: 'Selesai', icon: 'fa-circle-check', className: 'completed' }
    };
    const item = meta[status] || {
        label: statuses[status] || 'Status belum dikenal',
        icon: 'fa-info-circle',
        className: 'pending'
    };
    const node = element('span', undefined, `status-badge ${item.className}`);
    node.dataset.status = status;
    const icon = element('i', undefined, `fas ${item.icon}`);
    icon.setAttribute('aria-hidden', 'true');
    node.append(icon, document.createTextNode(' ' + item.label));
    return node;
}

function badge(status) {
    const node = element('span', Object.hasOwn(statuses, status) ? statuses[status] : 'Status belum dikenal', 'facility-badge');
    node.dataset.status = status;
    return node;
}

function time(value) {
    const node = element('time', dateLabel(value));
    if (value && Number.isFinite(Date.parse(value))) node.dateTime = value;
    return node;
}

export function adminTable(label, columns, body) {
    const region = element('div', undefined, 'sp-table-wrap sp-admin-queue');
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', label);
    const table = element('table');
    const head = table.createTHead().insertRow();
    for (const column of columns) {
        const cell = element('th', column);
        cell.scope = 'col';
        head.append(cell);
    }
    table.append(body);
    region.append(table);
    return region;
}

export function reportCard(report, admin, openDetail, base) {
    const item = element('li', undefined, 'facility-card');
    const category = Object.hasOwn(categories, report.category) ? categories[report.category] : 'Kategori belum dikenal';
    const catIconClass = categoryIcons[report.category] || 'fa-tag';

    if (!admin) {
        item.className = 'sp-history-card';
        const thumb = element('span', undefined, 'sp-history-thumb');
        thumb.setAttribute('aria-hidden', 'true');
        thumb.append(element('i', undefined, 'fas ' + catIconClass));
        const photoPath = base + '/' + report.id + '/photo';
        if (report.photo_url === photoPath) {
            const photo = element('img');
            photo.alt = '';
            photo.loading = 'lazy';
            photo.addEventListener('error', () => photo.remove());
            photo.src = photoPath;
            thumb.append(photo);
        }

        const copy = element('div', undefined, 'sp-history-card-copy');
        const titleHeading = element('h4', report.title);
        const refPara = element('p', report.tracking_number, 'sp-history-reference');

        const meta = element('p', undefined, 'sp-history-meta');
        const dateSpan = element('span');
        const calIcon = element('i', undefined, 'far fa-calendar');
        calIcon.setAttribute('aria-hidden', 'true');
        dateSpan.append(calIcon, document.createTextNode(' ' + dateLabel(report.created_at)));
        meta.append(dateSpan);

        if (report.address) {
            const addrSpan = element('span');
            const pinIcon = element('i', undefined, 'fas fa-map-pin');
            pinIcon.setAttribute('aria-hidden', 'true');
            addrSpan.append(pinIcon, document.createTextNode(' ' + report.address));
            meta.append(addrSpan);
        }

        const catSpan = element('span');
        const catIcon = element('i', undefined, 'fas ' + catIconClass);
        catIcon.setAttribute('aria-hidden', 'true');
        catSpan.append(catIcon, document.createTextNode(' ' + category));
        meta.append(catSpan);

        const rewardLine = element('p', undefined, 'sp-history-reward');
        if (report.public_result) {
            rewardLine.textContent = 'Hasil: ' + report.public_result;
        } else if (report.verification_note) {
            rewardLine.textContent = 'Catatan: ' + report.verification_note;
        } else if (report.description) {
            rewardLine.textContent = report.description;
        }

        copy.append(titleHeading, refPara, meta, rewardLine);

        const actions = element('div', undefined, 'sp-history-card-actions');
        const badgeNode = userStatusBadge(report.status);

        const action = element('button', undefined, 'sp-button sp-button--quiet');
        action.type = 'button';
        action.setAttribute('aria-label', 'Detail ' + report.tracking_number);
        const arrowIcon = element('i', undefined, 'fas fa-arrow-right');
        arrowIcon.setAttribute('aria-hidden', 'true');
        action.append(document.createTextNode('Detail '), arrowIcon);
        action.addEventListener('click', () => openDetail(report.id));

        actions.append(badgeNode, action);
        item.append(thumb, copy, actions);
        return item;
    }

    const action = element('button', report.status === 'pending' ? 'Tinjau laporan' : 'Lihat detail', 'facility-button');
    action.type = 'button';
    action.setAttribute('aria-label', action.textContent + ' ' + report.tracking_number);
    action.addEventListener('click', () => openDetail(report.id));

    const row = element('tr');
    row.insertCell().append(element('h4', report.title), element('small', report.tracking_number));
    row.insertCell().append(element('span', category), element('small', 'Pelapor #' + report.reporter_id));
    row.insertCell().append(badge(report.status),element('small',(report.affected_count??1)+' akun terdampak'));
    row.insertCell().append(time(report.created_at), element('small', 'Diperbarui ' + dateLabel(report.updated_at)));
    row.insertCell().append(action);
    return row;
}

export function reportDetails(report, admin, base) {
    const content = element('div', undefined, 'facility-stack');
    if(admin)content.classList.add('admin-report-summary');
    const top = element('div', undefined, 'facility-card-head');
    top.append(element('span', report.tracking_number, 'facility-ref'), badge(report.status));
    const meta = element('dl', undefined, 'facility-detail-meta');
    const fields = [
        ['Kategori', Object.hasOwn(categories, report.category) ? categories[report.category] : '—'],
        ['Alamat', report.address],
        ['Akun terdampak',String(report.affected_count??1)+' (termasuk pelapor)'],
        ['Diajukan', dateLabel(report.created_at)],
        ['Diperbarui', dateLabel(report.updated_at)]
    ];
    if (report.latitude !== null && report.longitude !== null) {
        fields.push(['Koordinat', String(report.latitude) + ', ' + String(report.longitude)]);
    }
    if (admin) fields.push(['Pelapor', '#' + report.reporter_id]);
    if (report.reviewed_at) fields.push(['Waktu verifikasi', dateLabel(report.reviewed_at)]);
    for (const [label, value] of fields) {
        const group = element('div');
        group.append(element('dt', label), element('dd', value));
        meta.append(group);
    }
    content.append(top, element('h4', report.title), element('p', report.description, 'facility-copy'), meta);
    if (report.status === 'approved') {
        content.append(element('p', 'Laporan lolos verifikasi.', 'facility-notice'));
    }
    if (report.verification_note) {
        const note = element('div');
        const labels = {revision_required: 'Catatan revisi', rejected: 'Alasan penolakan'};
        note.append(element('h4', labels[report.status] || 'Catatan Admin'), element('p', report.verification_note, 'facility-copy'));
        content.append(note);
    }
    const photo = element('div', undefined, 'facility-stack');
    photo.append(element('h4', 'Foto fasilitas'));
    const photoPath = base + '/' + report.id + '/photo';
    if (report.photo_url === photoPath) {
        const image = element('img', undefined, 'facility-photo');
        image.alt = 'Foto fasilitas pada laporan ' + report.tracking_number;
        image.addEventListener('error', () => image.replaceWith(element('p', 'Foto tidak dapat dimuat. Muat ulang detail untuk mencoba kembali.', 'facility-muted')));
        image.src = photoPath;
        photo.append(image);
    } else {
        photo.append(element('p', 'Laporan ini tidak memiliki foto.', 'facility-muted'));
    }
    content.append(photo);
    return content;
}

export function historyEntry(event, admin) {
    const entry = element('li');
    const origin = Object.hasOwn(statuses, event.from_status) ? statuses[event.from_status] : 'Pengajuan';
    const target = Object.hasOwn(statuses, event.to_status) ? statuses[event.to_status] : 'Status belum dikenal';
    entry.append(element('strong', origin + ' → ' + target));
    const meta = element('p', undefined, 'facility-muted');
    meta.append(time(event.created_at));
    if (admin) meta.append(' · Aktor #' + event.actor_id);
    entry.append(meta);
    if (event.note) entry.append(element('p', event.note, 'facility-copy'));
    return entry;
}

// Static markup shared by the two portal mounts. API content is rendered with DOM nodes.
export function mountReports(root, admin) {
    if (admin) {
        root.innerHTML = `
            <header class="facility-header">
                <div>
                    <p class="facility-kicker">Ruang verifikasi</p>
                    <h2 id="facility-heading" tabindex="-1">Verifikasi laporan fasilitas</h2>
                    <p>Tinjau kondisi, foto, dan histori laporan fasilitas yang masuk.</p>
                </div>
            </header>
            <output id="facility-success" class="facility-notice" aria-live="polite"></output>
            <p id="facility-error" class="facility-notice error" role="alert" tabindex="-1"></p>
            <section id="facility-list-view" class="facility-panel" aria-labelledby="facility-list-heading">
                <h3 id="facility-list-heading" tabindex="-1">Antrean laporan</h3>
                <div class="facility-toolbar">
                    <div class="facility-filters">
                        <label class="facility-field" for="facility-status">Status <select id="facility-status"></select></label>
                        <label class="facility-field" for="facility-category">Kategori <select id="facility-category"></select></label>
                    </div>
                </div>
                <p id="facility-list-message" class="facility-muted" aria-live="polite"></p>
                <ul id="facility-list" class="facility-cards"></ul>
                <div class="facility-actions">
                    <button type="button" id="facility-list-retry" class="facility-button" hidden>Coba lagi</button>
                    <button type="button" id="facility-list-more" class="facility-button" hidden>Muat laporan berikutnya</button>
                </div>
            </section>
            <section id="facility-detail-view" class="facility-panel facility-stack" aria-labelledby="facility-detail-heading" hidden>
                <div class="facility-actions">
                    <h3 id="facility-detail-heading" tabindex="-1">Detail laporan</h3>
                    <button type="button" class="facility-button" data-facility-back>Kembali ke daftar</button>
                </div>
                <p id="facility-detail-message" class="facility-muted" aria-live="polite" hidden></p>
                <button type="button" id="facility-detail-retry" class="facility-button" hidden>Muat ulang detail</button>
                <div id="facility-detail"></div>
                ${verificationMarkup}
                <section id="facility-history-section" aria-labelledby="facility-history-heading" hidden>
                    <h4 id="facility-history-heading">Histori status</h4>
                    <p id="facility-history-message" class="facility-muted" aria-live="polite"></p>
                    <ol id="facility-history" class="facility-timeline"></ol>
                    <button type="button" id="facility-history-more" class="facility-button" hidden>Muat histori sebelumnya</button>
                </section>
            </section>
        `;
        root.querySelector('#facility-status').append(options(statuses, 'Semua status'));
        root.querySelector('#facility-category').append(options(categories, 'Semua kategori'));
        const body = element('tbody');
        body.id = 'facility-list';
        root.querySelector('#facility-list').replaceWith(adminTable('Tabel verifikasi laporan', ['Laporan', 'Kategori', 'Verifikasi', 'Tanggal', 'Aksi'], body));
        return;
    }

    // User portal mount: matches the layout of Riwayat Penjemputan exactly!
    root.innerHTML = `
        <header class="sp-history-intro ref-form-hero">
            <div>
                <span class="ref-hero-label">Pusat Monitoring Laporan</span>
                <h2 id="facility-heading" tabindex="-1">Riwayat &amp; Pelacakan</h2>
                <p>Lihat riwayat penjemputan sampah dan laporan fasilitas yang Anda ajukan.</p>
            </div>
            <div class="ref-hero-note">
                <i class="fas fa-clock" aria-hidden="true"></i>
                <span>AKTIVITAS ANDA<strong>Status dari catatan terbaru</strong></span>
            </div>
        </header>
        <output id="facility-success" class="facility-notice" aria-live="polite"></output>
        <p id="facility-error" class="facility-notice error" role="alert" tabindex="-1"></p>
        <section id="facility-list-view" aria-labelledby="facility-list-heading">
            <div class="sp-history-switch" aria-label="Jenis riwayat">
                <button type="button" class="sp-button sp-button--quiet" data-sp-user-tab="riwayat-payout"><i class="fas fa-truck" aria-hidden="true"></i> Riwayat Penjemputan</button>
                <button type="button" class="sp-button" aria-current="page"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Riwayat Lapor Fasilitas</button>
            </div>
            <h3 id="facility-list-heading" tabindex="-1" class="sr-only">Laporan saya</h3>
            <div class="sp-workspace-filters sp-history-filters">
                <label class="sp-history-search"><span>Cari penjemputan</span><input id="facility-search" type="search" placeholder="Cari berdasarkan judul atau ID…"></label>
                <label>Status<select id="facility-status"></select></label>
                <label>Urutkan<select id="facility-sort"><option value="newest">Terbaru</option><option value="oldest">Terlama</option></select></label>
                <label>Kategori<select id="facility-category"></select></label>
            </div>
            <ul id="facility-list" class="sp-history-cards" aria-label="Daftar laporan fasilitas"></ul>
            <div class="sp-history-pagination">
                <p id="facility-list-message" role="status" aria-live="polite"></p>
                <nav class="sp-history-page-controls" aria-label="Halaman riwayat laporan fasilitas">
                    <button type="button" id="facility-list-retry" class="sp-button sp-button--quiet" hidden>Coba lagi</button>
                    <button type="button" id="facility-list-more" class="sp-button sp-button--quiet" hidden>Muat laporan berikutnya</button>
                </nav>
            </div>
            <button type="button" id="facility-new" class="sp-button sp-button--quiet hub-tab sp-history-track">Buat laporan fasilitas baru</button>
        </section>
        <section id="facility-detail-view" class="facility-panel facility-stack" aria-labelledby="facility-detail-heading" hidden>
            <div class="facility-actions">
                <h3 id="facility-detail-heading" tabindex="-1">Detail laporan</h3>
                <button type="button" class="facility-button" data-facility-back>Kembali ke daftar</button>
            </div>
            <p id="facility-detail-message" class="facility-muted" aria-live="polite" hidden></p>
            <button type="button" id="facility-detail-retry" class="facility-button" hidden>Muat ulang detail</button>
            <div id="facility-detail"></div>
            <button type="button" id="facility-revise" class="facility-button primary" hidden>Perbaiki laporan</button>
            <section id="facility-history-section" aria-labelledby="facility-history-heading" hidden>
                <h4 id="facility-history-heading">Histori status</h4>
                <p id="facility-history-message" class="facility-muted" aria-live="polite"></p>
                <ol id="facility-history" class="facility-timeline"></ol>
                <button type="button" id="facility-history-more" class="facility-button" hidden>Muat histori sebelumnya</button>
            </section>
        </section>
    `;
    root.querySelector('#facility-status').append(options(statuses, 'Semua status'));
    root.querySelector('#facility-category').append(options(categories, 'Semua kategori'));
    if (admin) {
        const body = element('tbody');
        body.id = 'facility-list';
        root.querySelector('#facility-list').replaceWith(adminTable('Tabel verifikasi laporan', ['Laporan', 'Kategori', 'Verifikasi', 'Tanggal', 'Aksi'], body));
    }
}

const verificationMarkup = `
    <form id="facility-verify" class="facility-stack" hidden>
        <fieldset class="facility-stack">
            <legend><strong>Periksa laporan</strong></legend>
            <label for="facility-decision" class="facility-field">Pilih keputusan
                <select id="facility-decision" name="status" required>
                    <option value="">Pilih tindakan</option>
                    <option value="approved">Setujui laporan</option>
                    <option value="revision_required">Minta pelapor memperbaiki laporan</option>
                    <option value="rejected">Tolak laporan</option>
                </select>
            </label>
            <div id="facility-officer-field" class="facility-field" hidden>
                <label for="facility-verify-officer">Petugas yang ditugaskan</label>
                <select id="facility-verify-officer" name="petugas_id"><option value="">Pilih Petugas aktif</option></select>
                <small>Petugas ini akan menerima tugas untuk menangani laporan.</small>
                <output id="facility-officer-state" aria-live="polite"></output>
                <button type="button" id="facility-officer-more" class="facility-button">Muat Petugas</button>
            </div>
            <div id="facility-note-field" class="facility-field" hidden><label id="facility-note-label" for="facility-note">Apa yang perlu diperbaiki pelapor?</label>
                <textarea id="facility-note" name="note" rows="3" aria-describedby="facility-note-help"></textarea>
                <small id="facility-note-help">Jelaskan dengan singkat agar pelapor memahami alasannya. Maksimal 1.000 karakter.</small>
            </div>
            <div><button id="facility-verify-submit" type="submit" class="facility-button primary">Simpan</button></div>
            <output id="facility-verify-feedback" aria-live="polite"></output>
        </fieldset>
    </form>

`;
