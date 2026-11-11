import {categories} from './facility-report-ui.js?v=phase4b';
import {mountLocationPicker} from './location-map.js?v=home-location-14';

const textLengths = {title: [5, 120], description: [10, 3000], address: [5, 300]};
const categoryIcons = {tps: 'fa-trash-can', collection_site: 'fa-truck', waste_bank: 'fa-recycle', other: 'fa-ellipsis'};

export async function checkImage(file, url) {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const png = /\.png$/i.test(file.name) && signature.length === 8 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
    const jpeg = /\.jpe?g$/i.test(file.name) && signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    if (!png && !jpeg) throw new Error('Pilih gambar JPEG atau PNG dengan ekstensi yang sesuai.');
    const image = new Image();
    image.src = url;
    try {
        await image.decode();
    } catch {
        throw new Error('Gambar tidak dapat dibaca. Pilih foto lain.');
    }
    if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error('Resolusi foto maksimal 16 megapiksel.');
}

export function mountReportForm(root) {
    root.insertAdjacentHTML('beforeend', `
        <section id="facility-form-view" class="facility-stack" aria-labelledby="facility-form-heading" hidden>
            <h3 id="facility-form-heading" tabindex="-1">Buat laporan fasilitas</h3>
            <form id="facility-form" class="facility-stack" enctype="multipart/form-data">
                <fieldset class="facility-stack sp-report-fields">
                    <section class="sp-pickup-panel">
                        <h4><i class="fas fa-location-dot" aria-hidden="true"></i> Tentukan Lokasi Fasilitas</h4>
                        <div id="facility-location-search"></div>
                        <div id="facility-location-picker"></div>
                    </section><div class="sp-request-fields">
                    <section class="sp-pickup-panel">
                        <h4><i class="far fa-clipboard" aria-hidden="true"></i> Data Laporan</h4>
                        <div class="facility-field"><label for="facility-title">Judul laporan <span class="sp-required" aria-hidden="true">*</span></label>
                            <input id="facility-title" name="title" minlength="5" required aria-describedby="facility-title-help" placeholder="Contoh: TPS penuh dan tidak terawat">
                            <small id="facility-title-help">Tulis masalah utamanya, misalnya “TPS penuh di Jalan Melati”. 5–120 karakter.</small>
                        </div>
                        <div class="facility-field"><label for="facility-description">Deskripsi <span class="sp-required" aria-hidden="true">*</span></label>
                            <textarea id="facility-description" name="description" rows="4" minlength="10" required aria-describedby="facility-description-help" placeholder="Jelaskan kondisi fasilitas dan masalah yang ditemukan."></textarea>
                            <small id="facility-description-help">Ceritakan apa yang terjadi dan bagian yang bermasalah. 10–3.000 karakter.</small>
                        </div>
                        <fieldset class="sp-report-categories">
                            <legend><i class="fas fa-layer-group" aria-hidden="true"></i> Kategori Fasilitas <span class="sp-required" aria-hidden="true">*</span></legend>
                            <p>Pilih jenis fasilitas yang dilaporkan.</p>
                            <div id="facility-category-cards" class="sp-report-category-grid"></div>
                        </fieldset>
                    </section>
                    <section class="sp-pickup-panel">
                        <h4><i class="fas fa-map-pin" aria-hidden="true"></i> Alamat &amp; Lokasi</h4>
                        <div class="facility-field"><label for="facility-address">Alamat lengkap <span class="sp-required" aria-hidden="true">*</span></label>
                            <textarea id="facility-address" name="address" rows="2" maxlength="300" minlength="5" required aria-describedby="facility-address-help" placeholder="Alamat terisi otomatis setelah memilih titik di peta."></textarea>
                            <small id="facility-address-help">Alamat mengikuti titik peta. Periksa dan tambahkan patokan bila perlu.</small>
                        </div>
                        <div class="sp-pickup-photo">
                            <h4><i class="far fa-image" aria-hidden="true"></i> Foto Bukti (Opsional)</h4>
                            <label class="sp-pickup-upload" for="facility-photo">
                                <i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>
                                <strong>Unggah Foto</strong>
                                <span id="facility-photo-help">JPEG atau PNG, maksimal 5 MiB dan 16 megapiksel.</span>
                                <input type="file" id="facility-photo" name="photo" accept=".jpg,.jpeg,.png,image/jpeg,image/png" aria-describedby="facility-photo-help facility-photo-status">
                            </label>
                            <output id="facility-photo-status" class="facility-muted" aria-live="polite"></output>
                            <img id="facility-preview" class="facility-photo" alt="Pratinjau foto fasilitas" hidden>
                        </div>
                    </section>
                    </div><div class="sp-report-controls">
                        <button type="button" id="facility-form-back" class="facility-button">Kembali</button>
                        <button type="submit" id="facility-submit" class="facility-button primary">Kirim laporan</button>
                    </div>
                </fieldset>
            </form>
            <div class="facility-actions">
                <button type="button" id="facility-retry-post" class="facility-button primary" hidden>Coba kirim ulang</button>
                <button type="button" id="facility-discard-post" class="facility-button" hidden>Abaikan percobaan</button>
            </div>
        </section>
    `);
    const form = root.querySelector('#facility-form');
    const pickerHost = root.querySelector('#facility-location-picker');
    const picker = mountLocationPicker(pickerHost, {
        title: 'Titik Lokasi Fasilitas yang Dilaporkan', prefix: 'facility', digits: 6, includeSaved: true, compact: true, addressField: form.elements.address
    });
    const preview = root.querySelector('#facility-preview');
    const photoStatus = root.querySelector('#facility-photo-status');
    const fileInput = form.elements.photo;
    const submit = root.querySelector('#facility-submit');
    let previewURL;

    const cards = root.querySelector('#facility-category-cards');
    for (const [value, name] of Object.entries(categories)) {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'category';
        radio.value = value;
        radio.required = true;
        const icon = document.createElement('i');
        icon.className = 'fas ' + categoryIcons[value];
        icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('strong');
        title.textContent = name;
        label.append(radio, icon, title);
        cards.append(label);
    }
    function clearPreview() {
        if (previewURL) URL.revokeObjectURL(previewURL);
        previewURL = null;
        preview.removeAttribute('src');
        preview.hidden = true;
        photoStatus.textContent = '';
        fileInput.setCustomValidity('');
        submit.disabled = false;
    }

    fileInput.addEventListener('change', async () => {
        clearPreview();
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            const message = 'Ukuran foto maksimal 5 MiB.';
            photoStatus.textContent = message;
            fileInput.setCustomValidity(message);
            return;
        }
        const url = URL.createObjectURL(file);
        previewURL = url;
        submit.disabled = true;
        photoStatus.textContent = 'Memeriksa foto…';
        try {
            await checkImage(file, url);
            if (previewURL !== url) return;
            preview.src = url;
            preview.hidden = false;
            photoStatus.textContent = 'Foto siap diunggah.';
        } catch (error) {
            if (previewURL !== url) return;
            clearPreview();
            fileInput.setCustomValidity(error.message);
            photoStatus.textContent = error.message;
        } finally {
            if (previewURL === url) submit.disabled = false;
        }
    });

    form.addEventListener('input', event => {
        if (event.target === fileInput) return;
        event.target.setCustomValidity('');
    });

    function reset(report) {
        form.reset();
        picker.reset(report);
        clearPreview();
        form.elements.category.value = report?.category ?? '';
        for (const name of ['title', 'description', 'address']) {
            form.elements[name].value = report?.[name] ?? '';
            form.elements[name].setCustomValidity('');
        }
        root.querySelector('#facility-form-heading').textContent = report ? 'Perbaiki laporan fasilitas' : 'Buat laporan fasilitas';
        root.querySelector('#facility-photo-help').textContent = report?.photo_url
            ? 'Kosongkan untuk mempertahankan foto saat ini. Foto baru harus JPEG atau PNG, maksimal 5 MiB dan 16 megapiksel.'
            : 'JPEG atau PNG, maksimal 5 MiB dan 16 megapiksel.';
        submit.textContent = report ? 'Kirim revisi' : 'Kirim laporan';
    }

    function payload() {
        if (submit.disabled || !form.reportValidity()) return null;
        const values = {};
        for (const name of ['category', 'title', 'description', 'address']) {
            values[name] = form.elements[name].value.trim();
        }
        for (const [name, [min, max]] of Object.entries(textLengths)) {
            const count = [...values[name]].length;
            if (count < min || count > max) form.elements[name].setCustomValidity('Isi ' + min + '–' + max + ' karakter.');
        }
        if (!form.reportValidity()) return null;
        const coordinates = picker.fields();
        if (!coordinates) return null;
        const body = new FormData();
        for (const [name, value] of Object.entries({...values, ...coordinates})) body.set(name, value);
        if (fileInput.files[0]) body.set('photo', fileInput.files[0]);
        return body;
    }

    return {form, reset, payload};
}
