import {base} from './facility-api.js?v=phase4b';
import {categories, dateLabel, element, statuses} from './facility-report-ui.js?v=phase4b';

export const handlingStatuses = {
    approved: 'Menunggu penugasan', assigned: 'Menunggu Petugas mulai', assessment_in_progress: 'Ditangani',
    handling_in_progress: 'Ditangani', resolution_submitted: 'Menunggu pengecekan hasil',
    resolution_revision_required: 'Perlu perbaikan hasil', completed: 'Selesai'
};
export const assignmentStatuses = {unassigned: 'Belum ditugaskan', active: 'Aktif', completed: 'Ditutup'};
export const coordinationStatuses = {
    not_forwarded: 'Belum diteruskan', forwarded: 'Diteruskan', receipt_confirmed: 'Penerimaan dikonfirmasi',
    follow_up_reported: 'Tindak lanjut dilaporkan', resolution_verified: 'Penyelesaian eksternal terverifikasi'
};
export const activityLabels = {
    assign: 'Penugasan Petugas', reassign: 'Pengalihan tugas', start_assessment: 'Penanganan dimulai',
    record_assessment: 'Hasil pemeriksaan', record_progress: 'Pembaruan penanganan',
    submit_resolution: 'Hasil diserahkan', request_revision: 'Perbaikan diminta',
    complete: 'Penyelesaian divalidasi', coordinate: 'Koordinasi eksternal'
};
export const fieldLabels = {
    condition: 'Kondisi lapangan', assessment: 'Hasil pemeriksaan', action_taken: 'Catatan tindakan atau kendala',
    result: 'Apa yang sudah dikerjakan?', internal_note: 'Alasan atau catatan untuk tim', public_note: 'Ringkasan hasil untuk pelapor',
    agency: 'Instansi tujuan', channel: 'Saluran komunikasi', forwarded_at: 'Waktu penerusan', reference: 'Nomor referensi'
};

export function label(labels, value, fallback = 'Belum tersedia') {
    return Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function button(title, action, primary = false) {
    const control = element('button', title, primary ? 'facility-button primary' : 'facility-button');
    control.type = 'button';
    if (action) { control.addEventListener('click', action); }
    return control;
}

export function dataFields(entries, className = 'facility-detail-meta') {
    const list = element('dl', undefined, className);
    for (const [title, value] of entries) {
        const field = element('div');
        field.append(element('dt', title), element('dd', value));
        list.append(field);
    }
    return list;
}

function badge(value) {
    const node = element('span', label(handlingStatuses, value), 'facility-badge handling-badge');
    node.dataset.status = value || '';
    return node;
}

function officerTaskCopy(status) {
    return {
        assigned: ['Tugas baru', 'Periksa kondisi fasilitas di lokasi.'],
        assessment_in_progress: ['Sedang diperiksa', 'Tangani fasilitas, lalu kirim hasil pekerjaan atau laporkan kendala.'],
        handling_in_progress: ['Sedang ditangani', 'Setelah pekerjaan selesai, kirim hasil dan foto agar dapat diperiksa Admin.'],
        resolution_submitted: ['Menunggu persetujuan Admin', 'Hasil sudah dikirim dan sedang menunggu pemeriksaan Admin.'],
        resolution_revision_required: ['Perlu perbaikan', 'Buka tugas untuk melihat catatan perbaikan dari Admin.'],
        completed: ['Selesai', 'Penanganan fasilitas sudah selesai dan disetujui Admin.']
    }[status];
}

export function handlingCard(report, open, admin = false) {
    const action = button('Lihat detail', () => open(report.report_id));
    action.setAttribute('aria-label', 'Lihat detail ' + report.tracking_number);
    if (admin) {
        const row = element('tr');
        row.insertCell().append(element('h4', report.title), element('small', report.tracking_number), element('small', report.address),element('small',(report.affected_count??1)+' akun terdampak'));
        row.insertCell().append(badge(report.status));
        row.insertCell().append(element('span', label(assignmentStatuses, report.assignment_status)),
            element('small', report.assignment?.petugas_id ? 'Petugas #' + report.assignment.petugas_id : ''));
        row.insertCell().textContent = label(coordinationStatuses, report.coordination_status);
        row.insertCell().textContent = dateLabel(report.updated_at);
        row.insertCell().append(action);
        return row;
    }
    const card = element('li', undefined, 'facility-card handling-card');
    const taskText = officerTaskCopy(report.status);
    action.textContent = report.status === 'completed' ? 'Lihat hasil' : 'Buka tugas';
    const taskBadge = badge(report.status);
    if (taskText) { taskBadge.textContent = taskText[0]; }
    const header = element('div', undefined, 'facility-card-head');
    const identity = element('div', undefined, 'handling-card-identity');
    identity.append(element('span', 'No. laporan: ' + report.tracking_number, 'facility-ref'), element('h4', report.title));
    header.append(identity, taskBadge);
    const place = element('div', undefined, 'handling-card-location');
    const icon = element('i', undefined, 'fas fa-building');
    icon.setAttribute('aria-hidden', 'true');
    const address = element('div');
    address.append(element('strong', label(categories, report.category)), element('p', report.address));
    place.append(icon, address);
    const foot = element('div', undefined, 'facility-actions facility-card-foot');
    foot.append(element('p', 'Terakhir diperbarui ' + dateLabel(report.updated_at)), action);
    card.append(header, place,element('p',(report.affected_count??1)+' akun terdampak · termasuk pelapor','facility-affected-count'));
    if (taskText) { card.append(element('p', taskText[1], 'handling-card-guidance')); }
    card.append(foot);
    return card;
}

export function handlingPhoto(id, version, description) {
    const wrap = element('div', undefined, 'handling-photo-frame');
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(version) || version < 1) { return wrap; }
    const photo = element('img', undefined, 'facility-photo');
    photo.alt = description;
    photo.addEventListener('error', () => wrap.replaceChildren(element('p', 'Foto tidak tersedia untuk ditampilkan.', 'facility-muted')));
    photo.src = base + '/' + id + '/handling/history/' + version + '/photo';
    wrap.append(photo);
    return wrap;
}

function officerSummary(report,panel){
        panel.classList.add('collector-report-summary');
        const copy = officerTaskCopy(report.status);
        const top = element('div', undefined, 'collector-report-title');
        const title = element('div');
        title.append(element('p', 'Laporan fasilitas', 'facility-kicker'), element('h3', report.title), element('small', report.tracking_number, 'facility-ref'));
        const state = badge(report.status);
        if (copy) { state.textContent = copy[0]; }
        top.append(title, state);
        panel.append(top, element('h4', 'Masalah yang dilaporkan'), element('p', report.description, 'facility-copy'),
            dataFields([['Jenis fasilitas',label(categories,report.category)],['Lokasi',report.address]], 'collector-report-location'));
        if (copy) { panel.append(element('p', copy[1], 'handling-card-guidance')); }
        if (report.status === 'completed' && report.public_result) { panel.append(element('h4','Hasil penanganan'),element('p',report.public_result,'facility-copy')); }
        const extra = element('details', undefined, 'collector-extra-details');
        extra.append(element('summary','Informasi tambahan'), dataFields([
            ['Verifikasi laporan',label(statuses,report.verification_status)],['Penugasan',label(assignmentStatuses,report.assignment_status)],
            ['Koordinasi instansi',label(coordinationStatuses,report.coordination_status)],['Terakhir diperbarui',dateLabel(report.updated_at)]
        ]));
        panel.append(extra);
        return panel;
    }

export function handlingSummary(report, role) {
    const panel = element('div', undefined, 'facility-stack');
    panel.append(element('p',(report.affected_count??1)+' akun terdampak · termasuk pelapor','facility-affected-count'));
    if(role==='petugas'){ return officerSummary(report,panel); }
    if (role !== 'user') {
        const heading = element('div', undefined, 'facility-card-head');
        heading.append(element('h3', report.title), element('span', report.tracking_number, 'facility-ref'));
        const location = [
            ['Kategori', label(categories, report.category)], ['Alamat', report.address]
        ];
        if (report.latitude != null && report.longitude != null) { location.push(['Koordinat', report.latitude + ', ' + report.longitude]); }
        if (report.assignment) { location.push(['Petugas', '#' + report.assignment.petugas_id]); }
        panel.append(heading, element('p', report.description, 'facility-copy'), dataFields(location));
    }
    panel.append(dataFields([
        ['Verifikasi', label(statuses, report.verification_status)],
        ['Penanganan', label(handlingStatuses, report.status)],
        ['Penugasan', label(assignmentStatuses, report.assignment_status)],
        ['Koordinasi instansi', label(coordinationStatuses, report.coordination_status)]
    ], 'facility-detail-meta handling-status-grid'));
    panel.append(element('p', 'Diperbarui ' + dateLabel(report.updated_at), 'facility-muted'));
    if (!report.status) { panel.append(element('p', 'Tindak lanjut lapangan belum tersedia untuk laporan ini.')); }
    if (report.coordination_status === 'forwarded') { panel.append(element('p', 'Penerusan tercatat. Penerimaan oleh instansi belum dikonfirmasi.', 'facility-muted')); }
    if (report.status === 'resolution_submitted') { panel.append(element('p', 'Hasil telah diserahkan dan menunggu validasi Admin.', 'facility-notice')); }
    if (report.status === 'completed' && report.public_result) {
        panel.append(element('h4', 'Hasil tervalidasi'), element('p', report.public_result, 'facility-copy'));
        if (role === 'user' && report.public_evidence_version) {
            panel.append(handlingPhoto(report.report_id, report.public_evidence_version, 'Foto hasil penanganan yang dipublikasikan'));
        }
    }
    return panel;
}

function addAgencyFields(fields,event){
        for (const key of ['agency','channel','forwarded_at','reference']) {
            if (event[key]) { fields.push([fieldLabels[key], key === 'forwarded_at' ? dateLabel(event[key]) : event[key]]); }
        }
    }
function addEventFields(fields,event,role){
    if (role !== 'user') {
        for (const key of ['condition','assessment','action_taken','result','internal_note']) {
            if (event[key]) { fields.push([fieldLabels[key], event[key]]); }
        }
        if (event.petugas_id) { fields.push(['Petugas', '#' + event.petugas_id]); }
    }
    if(role==='admin'){ addAgencyFields(fields,event); }
}

export function handlingEvent(event, report, role) {
    const row = element('li', undefined, 'handling-event');
    const current = label(handlingStatuses, event.to_status);
    const transition = event.from_status === event.to_status ? current : label(handlingStatuses, event.from_status) + ' → ' + current;
    const fields = [['Penanganan', transition]];
    if (event.coordination_status) { fields.push(['Koordinasi', label(coordinationStatuses, event.coordination_status)]); }
    if (event.public_note) { fields.push(['Catatan publik', event.public_note]); }
    addEventFields(fields,event,role);
    row.append(element('strong', label(activityLabels, event.action, 'Aktivitas penanganan')),
        element('p', dateLabel(event.created_at), 'facility-muted'), dataFields(fields, 'handling-event-fields'));
    if (role !== 'user' && event.has_photo) {
        const reveal = button('Tampilkan foto bukti', () => {
            const preview = handlingPhoto(report.report_id, event.version, 'Foto bukti versi ' + event.version);
            preview.tabIndex = -1;
            reveal.replaceWith(preview);
            preview.focus();
        });
        row.append(reveal);
    }
    return row;
}
