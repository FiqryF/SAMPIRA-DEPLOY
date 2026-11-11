// Both forms keep their existing file input, validation, preview and upload flow.
let stream, source, generation = 0;
const dialog = document.createElement('dialog');
dialog.className = 'user-camera';
dialog.setAttribute('aria-labelledby', 'user-camera-title');
dialog.innerHTML = `<header><h2 id="user-camera-title">Ambil Foto</h2><button type="button" class="sp-button sp-button--quiet" data-camera-close aria-label="Tutup kamera">Tutup</button></header>
    <video autoplay muted playsinline aria-label="Pratinjau kamera"></video>
    <p role="status">Meminta akses kamera…</p>
    <footer><button type="button" class="sp-button" data-camera-capture disabled>Ambil Foto</button></footer>`;
document.body.append(dialog);
const video = dialog.querySelector('video');
const capture = dialog.querySelector('[data-camera-capture]');
const cameraStatus = dialog.querySelector('[role="status"]');

function closeCamera() {
    generation++;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    source = null;
    capture.disabled = true;
    if (dialog.open) dialog.close();
}

async function openCamera(input, output) {
    closeCamera();
    const current = generation;
    source = input;
    output.textContent = '';
    cameraStatus.textContent = 'Meminta akses kamera…';
    dialog.showModal();
    try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
        const media = await navigator.mediaDevices.getUserMedia({audio: false, video: {
            facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 960}
        }});
        if (current !== generation) { media.getTracks().forEach(track => track.stop()); return; }
        stream = media;
        video.srcObject = media;
        await video.play();
        if (current !== generation) return;
        capture.disabled = false;
        cameraStatus.textContent = 'Arahkan kamera ke sampah atau fasilitas, lalu ambil foto.';
    } catch (error) {
        if (current !== generation) return;
        closeCamera();
        output.textContent = error.name === 'NotAllowedError'
            ? 'Akses kamera ditolak. Izinkan kamera pada browser atau gunakan Unggah Foto.'
            : 'Kamera tidak tersedia. Periksa kamera dan izin browser, atau gunakan Unggah Foto. Kamera memerlukan HTTPS atau localhost.';
    }
}

capture.addEventListener('click', async () => {
    if (!source || capture.disabled || !video.videoWidth) return;
    capture.disabled = true;
    const current = generation;
    const input = source;
    try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        if (current !== generation) return;
        if (!blob) throw new Error('capture');
        const files = new DataTransfer();
        files.items.add(new File([blob], 'foto-kamera-' + Date.now() + '.jpg', {type: 'image/jpeg'}));
        input.files = files.files;
        input.dispatchEvent(new Event('change', {bubbles: true}));
        closeCamera();
    } catch {
        if (current !== generation) return;
        cameraStatus.textContent = 'Foto gagal diambil. Coba kembali atau gunakan Unggah Foto.';
        capture.disabled = false;
    }
});
dialog.querySelector('[data-camera-close]').addEventListener('click', closeCamera);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeCamera(); });
dialog.addEventListener('close', () => { if (!dialog.open) closeCamera(); });
window.addEventListener('pagehide', closeCamera);
window.addEventListener('sampira:session-ended', closeCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) closeCamera(); });
document.addEventListener('click', event => { if (event.target.closest('.hub-tab')) closeCamera(); });
document.addEventListener('reset', closeCamera, true);

function mountButtons() {
    for (const id of ['form-waste-photo', 'facility-photo']) {
        const input = document.getElementById(id);
        const host = input?.closest('.sp-pickup-photo');
        if (!host || host.querySelector('[data-open-camera]')) continue;
        const actions = document.createElement('div');
        actions.className = 'photo-camera-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sp-button sp-button--quiet';
        button.dataset.openCamera = id;
        button.textContent = 'Ambil Foto';
        const output = document.createElement('p');
        output.setAttribute('role', 'status');
        button.addEventListener('click', () => openCamera(input, output));
        actions.append(button, output);
        input.closest('label').after(actions);
    }
}
mountButtons();
new MutationObserver(mountButtons).observe(document.getElementById('user-main') || document.body, {childList: true, subtree: true});
