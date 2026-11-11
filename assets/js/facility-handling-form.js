import {base, request} from './facility-api.js?v=phase4b';
import {checkImage} from './facility-report-form.js?v=phase4b';
import {element} from './facility-report-ui.js?v=phase4b';
import {button, coordinationStatuses, fieldLabels} from './facility-handling-ui.js?v=phase4b';

const field = (name, required = false, max = 1000) => ({name, required, max});
const notes = [field('internal_note'), field('public_note')];
const actionsByStatus = {
    assigned: ['start_assessment'], assessment_in_progress: ['record_assessment'],
    handling_in_progress: ['record_progress', 'submit_resolution'],
    resolution_revision_required: ['record_progress']
};
const activity = {
    start_assessment: ['Mulai asesmen', []],
    record_assessment: ['Catat hasil pemeriksaan', [field('condition', true), field('assessment', true)]],
    record_progress: ['Catat tindakan', [field('action_taken', true)]],
    submit_resolution: ['Serahkan hasil', [field('result', true)]]
};
const nextCoordination = {
    not_forwarded: 'forwarded', forwarded: 'receipt_confirmed',
    receipt_confirmed: 'follow_up_reported', follow_up_reported: 'resolution_verified'
};

export function handlingActions(report, role) {
    if (role === 'petugas') {
        if (report.assignment_status !== 'active') return [];
        return (actionsByStatus[report.status] || []).map(action => ({
            title: activity[action][0], endpoint: 'activity', data: {action}, multipart: true,
            fields: [...activity[action][1], ...notes], photo: action !== 'start_assessment',
            hint: 'Pisahkan catatan untuk tim dari catatan yang boleh dibaca pelapor.'
        }));
    }
    if (report.verification_status !== 'approved') return [];
    const actions = [];
    const transfer = report.assignment_status === 'active';
    if (report.status === 'approved' || transfer) actions.push({
        title: transfer ? 'Alihkan tugas' : 'Tugaskan Petugas', endpoint: 'assignment',
        fields: [field('petugas_id', true), field('internal_note', transfer)],
        hint: transfer ? 'Pengalihan menutup tugas Petugas lama dan memulai siklus asesmen baru.' : 'Pilih Petugas aktif untuk memulai tindak lanjut.'
    });
    if (report.status === 'resolution_submitted') actions.push(
        {title: 'Minta perbaikan hasil', endpoint: 'review', data: {decision: 'request_revision'},
            fields: [field('internal_note', true), field('public_note')]},
        {title: 'Validasi penyelesaian', endpoint: 'review', data: {decision: 'complete'},
            fields: [field('public_note', true), field('internal_note'), field('public_evidence_version')],
            hint: 'Ringkasan dan satu foto yang dipilih akan terlihat oleh pelapor.'}
    );
    const status = nextCoordination[report.coordination_status];
    if (status && (status !== 'resolution_verified' || report.status === 'completed')) {
        const forwarding = status === 'forwarded';
        actions.push({
            title: forwarding ? 'Catat penerusan' : 'Catat ' + coordinationStatuses[status].toLowerCase(),
            endpoint: 'coordination', data: {status}, multipart: true, photo: true,
            proof: status === 'receipt_confirmed' || status === 'resolution_verified',
            fields: [...(forwarding ? [field('agency', true, 160), field('channel', true, 80), field('forwarded_at', true)] : []),
                field('reference', false, 120), field('internal_note', true)],
            hint: 'Catat komunikasi yang sudah terjadi. Form ini tidak mengirim pesan ke instansi.'
        });
    }
    return actions;
}

const extraLabels = {petugas_id:'Petugas aktif', public_evidence_version:'Foto untuk pelapor (opsional)', photo:'Foto bukti (opsional)'};

function addField(form, fieldSpec) {
    const {name, required} = fieldSpec;
    const select = name === 'petugas_id' || name === 'public_evidence_version';
    const short = ['agency','channel','reference','forwarded_at','photo'].includes(name);
    const input = element(select ? 'select' : short ? 'input' : 'textarea');
    input.name = name;
    input.required = required;
    if (input.tagName === 'TEXTAREA') input.rows = 3;
    if (name === 'forwarded_at') input.type = 'datetime-local';
    if (name === 'photo') {
        input.type = 'file';
        input.accept = '.jpg,.jpeg,.png,image/jpeg,image/png';
    }
    const label = element('label', (fieldLabels[name] || extraLabels[name]) + (required ? ' (wajib)' : ''), 'facility-field');
    label.append(input);
    form.append(label);
    return input;
}

function officerChoices(form, input, report, onSession) {
    const status = element('p', '', 'facility-muted');
    status.setAttribute('aria-live', 'polite');
    input.append(new Option('Pilih Petugas', ''));
    const more = button('Muat Petugas berikutnya', () => void load());
    form.append(status, more);
    let cursor = null;
    async function load() {
        more.disabled = true;
        status.textContent = 'Memuat Petugas aktif…';
        try {
            const query = new URLSearchParams({limit: 20});
            if (cursor !== null) query.set('before_id', cursor);
            const page = await request(base + '/handling/officers?' + query);
            if (!form.isConnected) return;
            for (const officer of page.items) {
                if (officer.id !== report.assignment?.petugas_id) input.append(new Option(officer.name + ' · #' + officer.id, officer.id));
            }
            cursor = page.next_before_id;
            more.hidden = cursor === null;
            more.textContent = 'Muat Petugas berikutnya';
            status.textContent = input.options.length === 1 ? 'Belum ada Petugas lain di halaman ini.' : '';
        } catch (error) {
            if (!form.isConnected) return;
            if (error.status === 401) onSession();
            status.textContent = 'Daftar Petugas gagal dimuat.';
            more.textContent = 'Coba lagi memuat Petugas';
        } finally {
            more.disabled = false;
        }
    }
    void load();
}

function evidenceChoices(input, report, events) {
    input.append(new Option('Tanpa foto publik', ''));
    for (const event of events) {
        if (event.assignment_id === report.assignment?.id && event.has_photo &&
            ['record_assessment','record_progress','submit_resolution'].includes(event.action)) {
            input.append(new Option('Foto versi ' + event.version, event.version));
        }
    }
}

export function openHandlingForm(root, report, config, events, submit, onSession) {
    const dialog = element('dialog', undefined, 'facility-dialog handling-dialog');
    dialog.setAttribute('aria-label', config.title);
    const form = element('form', undefined, 'facility-stack');
    const fields = element('fieldset', undefined, 'facility-stack');
    const error = element('p', '', 'facility-notice error');
    error.setAttribute('role','alert');
    const status = element('output', '', 'facility-muted');
    const close = button('Batal', () => dialog.close());
    const confirm = element('button', 'Konfirmasi dan simpan', 'facility-button primary');
    confirm.type = 'submit';
    const controls = element('div', undefined, 'facility-actions');
    controls.append(close, confirm);
    form.append(element('h3', config.title));
    if (config.hint) form.append(element('p', config.hint, 'facility-muted'));
    form.append(fields, error, status, controls);
    dialog.append(form);
    root.append(dialog);

    for (const spec of config.fields) {
        const input = addField(fields, spec);
        if (spec.name === 'petugas_id') officerChoices(fields, input, report, onSession);
        if (spec.name === 'public_evidence_version') {
            evidenceChoices(input, report, events);
            fields.append(element('p', 'Pilihan berasal dari histori yang sudah dimuat. Untuk melihat versi lain, tutup dialog dan muat histori berikutnya.', 'facility-muted'));
        }
    }

    let objectURL;
    let sending = false;
    const file = config.photo ? addField(fields, field('photo')) : null;
    const preview = element('img', undefined, 'facility-photo');
    preview.alt = 'Pratinjau foto bukti';
    preview.hidden = true;
    if (file) {
        fields.append(element('p', 'JPEG atau PNG, maksimal 5 MiB dan 16 megapiksel.', 'facility-muted'), preview);
        file.addEventListener('change', () => {
            if (objectURL) URL.revokeObjectURL(objectURL);
            objectURL = file.files[0] ? URL.createObjectURL(file.files[0]) : null;
            preview.hidden = !objectURL;
            if (objectURL) preview.src = objectURL;
            else preview.removeAttribute('src');
        });
    }
    dialog.addEventListener('cancel', event => { if (sending) event.preventDefault(); });
    dialog.addEventListener('close', () => {
        if (objectURL) URL.revokeObjectURL(objectURL);
        dialog.remove();
    }, {once: true});

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (sending) return;
        sending = true;
        error.textContent = '';
        const data = {version: report.version, ...config.data};
        const upload = file?.files[0];
        fields.disabled = close.disabled = confirm.disabled = true;
        status.textContent = 'Memeriksa dan menyimpan…';
        try {
            for (const spec of config.fields) {
                const input = form.elements[spec.name];
                const value = input.value.trim();
                if ((spec.required && !value) || [...value].length > spec.max) {
                    throw new Error((fieldLabels[spec.name] || extraLabels[spec.name]) + ' wajib sesuai batas ' + spec.max + ' karakter.');
                }
                if (!value) continue;
                if (input.type === 'datetime-local') {
                    const date = new Date(value);
                    if (!Number.isFinite(date.valueOf()) || date > new Date()) throw new Error('Waktu penerusan harus valid dan tidak di masa depan.');
                    data[spec.name] = date.toISOString();
                } else if (['petugas_id','public_evidence_version'].includes(spec.name)) {
                    const id = Number(value);
                    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new Error('Pilihan tidak valid.');
                    data[spec.name] = id;
                } else {
                    data[spec.name] = value;
                }
            }
            if (config.proof && !data.reference && !upload) throw new Error('Sertakan nomor referensi atau foto bukti.');
            if (upload) {
                if (upload.size > 5 * 1024 * 1024) throw new Error('Foto melebihi batas 5 MiB.');
                await checkImage(upload, objectURL);
            }
            let options = {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)};
            if (config.multipart) {
                const body = new FormData();
                for (const [key, value] of Object.entries(data)) body.set(key, value);
                if (upload) body.set('photo', upload);
                options = {method:'POST', body};
            }
            await submit(config.endpoint, options, () => dialog.close());
        } catch (failure) {
            error.textContent = failure.message;
        } finally {
            sending = false;
            fields.disabled = close.disabled = confirm.disabled = false;
            status.textContent = '';
        }
    });
    dialog.showModal();
}
