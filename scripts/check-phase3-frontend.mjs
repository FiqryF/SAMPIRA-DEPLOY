// Run through check-phase1-browser.mjs with SAMPIRA_TEST_PHASE3_FE=1 and the real Phase 3A fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {captureAdmin} from './admin-visual-fixture.mjs';

const base = '/api/ecorecycle/facility-reports';
const navButton = '[data-target="laporan-fasilitas"]';
const title = 'Pintu TPS <img src=x onerror=alert(1)> rusak';
const reason = 'Lengkapi alamat pintu yang perlu diperiksa.';
const rejection = 'Laporan duplikat untuk lokasi yang sama.';
const otherTitles = ['Bank sampah perlu diperiksa', 'Tempat pengumpulan rusak'];

export async function checkFacilityBrowser({send, js, nav, login, click, text, waitFor, waitPath, profile, password}) {
    const q = JSON.stringify;
    const value = (id, next) => js('(() => { const field = document.getElementById(' + q(id) +
        '); field.value = ' + q(next) + '; field.dispatchEvent(new Event("input", {bubbles: true}));' +
        ' field.dispatchEvent(new Event("change", {bubbles: true})); })()');
    const submit = id => js('document.getElementById(' + q(id) + ').requestSubmit(); void 0');
    const visible = selector => js('Boolean(document.querySelector(' + q(selector) + ')?.getClientRects().length)');
    const get = path => js('fetch(' + q(path) + ').then(r => r.json()).then(body => body.data)');
    const setViewport = width => send('Emulation.setDeviceMetricsOverride', {width, height: 850, deviceScaleFactor: 1, mobile: width < 500});
    async function noOverflow() {
        for (const width of [1280, 390, 320]) {
            await setViewport(width);
            assert(await js('document.documentElement.scrollWidth <= innerWidth + 2'), 'Layout overflow at ' + width);
        }
    }
    async function setFile(file) {
        const {root} = await send('DOM.getDocument');
        const {nodeId} = await send('DOM.querySelector', {nodeId: root.nodeId, selector: '#facility-photo'});
        await send('DOM.setFileInputFiles', {nodeId, files: [file]});
    }
    async function openCard(name) {
        await js('Array.from(document.querySelectorAll("#facility-list > *")).find(el => el.querySelector("h4").textContent === ' +
            q(name) + ').querySelector("button").click()');
        await text('#facility-detail', name);
    }
    async function decision(status, note = '') {
        await value('facility-decision', status);
        await value('facility-note', note);
        await submit('facility-verify');
        await waitFor(() => visible('#facility-confirm[open]'), 'Verification dialog did not open');
    }
    async function confirm() {
        await click('#facility-confirm button[value="confirm"]');
    }

    const email = 'browser-facility-' + randomUUID() + '@fixture.invalid';
    await nav('/register');
    await value('register-name', 'Facility browser fixture');
    await value('register-email', email);
    await value('register-password', password);
    await value('register-confirm-password', password);
    await submit('register-form');
    await waitFor(() => visible('#register-success'), 'Registration success was not shown');
    await text('#register-success', 'Pendaftaran berhasil');
    await click('#register-success a');
    await waitPath('/login');
    await login(email, '/dashboard');
    await setViewport(390);
    await click('#mobileMenuToggle');
    await waitFor(() => js('getComputedStyle(document.querySelector(' + q(navButton) + ')).visibility === "visible"'), 'Mobile sidebar did not open');
    await js('document.querySelector(' + q(navButton) + ').focus()');
    assert(await js('document.activeElement.matches(' + q(navButton) + ')'));
    await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
    assert(await js('document.querySelector("#laporan-fasilitas").classList.contains("active")'), 'Keyboard activation did not select the report tab');
    await text('#facility-list-message', 'Belum ada laporan');
    assert.equal(await js('document.activeElement.id'), 'facility-heading');
    assert.equal(await js('document.querySelector("#mobileMenuToggle").getAttribute("aria-expanded")'), 'false');
    await click('#facility-new');
    await noOverflow();
    assert(await js('Array.from(document.querySelectorAll("[data-facility-reports] input, [data-facility-reports] select, [data-facility-reports] textarea")).every(field => field.labels.length > 0)'));
    await js('document.querySelector("#facility-category-cards input[value=tps]").click(); void 0');
    await value('facility-title', '    ');
    await value('facility-description', 'Pintu TPS macet sejak kemarin.');
    await value('facility-address', 'Jalan Contoh 12 Bandung.');
    await submit('facility-form');
    assert.match(await js('document.querySelector("#facility-title").validationMessage'), /5–120/);
    await value('facility-title', title);
    await value('facility-latitude', '-6.923501');
    await submit('facility-form');
    await text('#facility-location-picker .location-coordinate-grid + .location-status', 'Isi kedua koordinat');
    await value('facility-longitude', '107.611209');
    await click('#facility-location-picker .location-actions .primary');

    const invalid = join(profile, 'invalid-facility.png');
    const valid = join(profile, 'facility-fixture.png');
    writeFileSync(invalid, '<svg onload="alert(1)"/>');
    writeFileSync(valid, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64'));
    await setFile(invalid);
    await text('#facility-photo-status', 'Pilih gambar JPEG atau PNG');
    assert.equal(await visible('#facility-preview'), false);
    await setFile(valid);
    await text('#facility-photo-status', 'Foto siap diunggah');
    assert.equal(await visible('#facility-preview'), true);

    // The first real POST commits, then the client loses its response. Retry must replay the same key.
    await js('window.facilityQAPosts=[]; window.facilityRealFetch=window.fetch; window.fetch=async (url, opts) => {' +
        ' if(url !== ' + q(base) + ' || opts?.method !== "POST") return window.facilityRealFetch(url, opts);' +
        ' const entry={key:opts.headers["Idempotency-Key"]}; window.facilityQAPosts.push(entry);' +
        ' const response=await window.facilityRealFetch(url,opts); entry.status=response.status;' +
        ' if(window.facilityQAPosts.length===1) throw new TypeError("QA lost response"); return response; }; void 0');
    await js('document.querySelector("#facility-form").requestSubmit(); document.querySelector("#facility-form").requestSubmit(); void 0');
    await text('#facility-error', 'Hasil pengiriman belum dapat dipastikan');
    assert.equal(await js('window.facilityQAPosts.length'), 1);
    assert(await js('document.querySelector("#facility-title").matches(":disabled")'));
    await click('#facility-retry-post');
    await text('#facility-success', 'Nomor laporan FAC-');
    await text('#facility-detail', title);
    await text('#facility-history', 'Pengajuan → Menunggu Verifikasi');
    const postRequests = await js('window.facilityQAPosts');
    assert.deepEqual(postRequests.map(item => item.status), [201, 200]);
    assert.equal(postRequests[0].key, postRequests[1].key);
    assert.match(postRequests[0].key, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    await js('window.fetch=window.facilityRealFetch; void 0');
    assert.equal(await js('document.querySelector("#facility-detail h4 img") === null'), true);
    await waitFor(() => js('document.querySelector("#facility-detail img")?.naturalWidth === 1'), 'Private photo did not load');

    const mine = await get(base);
    assert.equal(mine.items.length, 1);
    const reportId = mine.items[0].id;
    const seed = await js('(async () => { const titles=' + q([...otherTitles, ...Array.from({length: 18}, (_, i) => 'Laporan pagination ' + i)]) +
        '; const results=[]; for(const [i,title] of titles.entries()) { const body=new FormData();' +
        ' for(const [k,v] of Object.entries({category:i===0?"waste_bank":i===1?"collection_site":"other",title,' +
        ' description:"Kondisi fasilitas perlu diperiksa.",address:"Jalan Fixture 123"})) body.set(k,v);' +
        ' const r=await fetch(' + q(base) + ',{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body});' +
        ' if(r.status!==201) throw new Error(await r.text()); results.push((await r.json()).data.id); } return results; })()');
    await click('#facility-detail-view [data-facility-back]');
    await text('#facility-list-message', '20 laporan');
    assert(await visible('#facility-list-more'));
    await click('#facility-list-more');
    await text('#facility-list-message', '21 laporan');
    assert.equal(await visible('#facility-list-more'), false);
    await value('facility-category', 'tps');
    await text('#facility-list-message', '1 laporan');
    await openCard(title);
    await noOverflow();

    await login('admin@phase1.invalid', '/admin');
    await click('[data-open-verification]');
    await text('#facility-list-heading', 'Antrean laporan');
    assert.equal(await js('document.querySelector("#facility-status").value'), 'pending');
    await value('facility-category', 'tps');
    await text('#facility-list-message', '1 laporan');
    await send('Emulation.setDeviceMetricsOverride', {width:1440,height:992,deviceScaleFactor:1,mobile:false});
    await captureAdmin(send, js, '03-verifikasi-daftar');
    await openCard(title);
    await text('#facility-detail', 'Pelapor');
    await waitFor(() => js('document.querySelector("#facility-detail img")?.naturalWidth === 1'), 'Admin photo missing');
    await captureAdmin(send, js, '04-verifikasi-detail');
    await value('facility-decision', 'revision_required');
    await submit('facility-verify');
    assert.equal(await visible('#facility-confirm[open]'), false);
    assert.equal(await js('document.querySelector("#facility-note").validity.valueMissing'), true);
    await decision('revision_required', reason);
    await noOverflow();
    assert(await js('(() => {const rect = document.querySelector("#facility-confirm").getBoundingClientRect(); return rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;})()'));
    assert.equal(await js('document.activeElement.value'), 'cancel');
    await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent', {type:'keyUp', key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
    await waitFor(async () => !await visible('#facility-confirm[open]'), 'Escape did not close the dialog');
    assert.equal((await get(base + '/' + reportId)).status, 'pending');
    await decision('revision_required', reason);
    await confirm();
    await text('#facility-detail', 'Perlu Revisi');
    await text('#facility-history', reason);
    await click('#facility-detail-view [data-facility-back]');
    await text('#facility-list-message', 'Belum ada laporan');
    await value('facility-status', 'revision_required');
    await text('#facility-list-message', '1 laporan');

    await login(email, '/dashboard');
    await setViewport(1280);
    await click(navButton);
    await value('facility-category', 'tps');
    await text('#facility-list-message', '1 laporan');
    await openCard(title);
    await text('#facility-detail', reason);
    await click('#facility-revise');
    assert.equal(await js('document.querySelector("#facility-title").value'), title);
    await text('#facility-photo-help', 'mempertahankan foto');
    await value('facility-address', 'Jalan Contoh 12 Bandung, pintu sebelah timur.');
    await submit('facility-form');
    await text('#facility-success', 'Revisi terkirim');
    await text('#facility-detail', 'pintu sebelah timur');
    await text('#facility-history', 'Perlu Revisi → Menunggu Verifikasi');
    await waitFor(() => js('document.querySelector("#facility-detail img")?.naturalWidth === 1'), 'Original photo was not kept');

    await login('admin@phase1.invalid', '/admin');
    await click('[data-open-verification]');
    await value('facility-category', 'tps');
    await text('#facility-list-message', '1 laporan');
    await openCard(title);
    await decision('approved');
    await confirm();
    await text('#facility-detail', 'Laporan lolos verifikasi.');
    await text('#facility-history', 'Menunggu Verifikasi → Disetujui');

    await click('#facility-detail-view [data-facility-back]');
    await value('facility-category', 'waste_bank');
    await text('#facility-list-message', '1 laporan');
    await openCard(otherTitles[0]);
    await decision('rejected', rejection);
    await confirm();
    await text('#facility-detail', rejection);
    await text('#facility-history', 'Menunggu Verifikasi → Ditolak');
    assert.equal(await visible('#facility-verify'), false);

    await click('#facility-detail-view [data-facility-back]');
    await value('facility-category', 'collection_site');
    await text('#facility-list-message', '1 laporan');
    await openCard(otherTitles[1]);
    await decision('approved');
    const secondAdminPath = base + '/' + seed[1] + '/verification';
    assert.equal(await js('fetch(' + q(secondAdminPath) + ', {method:"POST",headers:{"Content-Type":"application/json"},' +
        ' body:JSON.stringify({status:"revision_required",version:1,note:"Perubahan dari sesi lain."})}).then(r=>r.status)'), 200);
    await confirm();
    await text('#facility-error', 'Versi atau status laporan berubah');
    await text('#facility-detail', 'Perubahan dari sesi lain.');
    assert.equal(await visible('#facility-verify'), false);
    await text('#facility-history', 'Menunggu Verifikasi → Perlu Revisi');

    const origin = await js('location.origin');
    async function bearer(actorEmail) {
        const response = await fetch(origin + '/api/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: actorEmail, password})
        });
        assert.equal(response.status, 200);
        return (await response.json()).data.token;
    }
    const adminToken = await bearer('admin@phase1.invalid');
    const userToken = await bearer(email);
    const paginatedReport = base + '/' + seed[2];
    for (let version = 1; version < 20; version += 2) {
        const verification = await fetch(origin + paginatedReport + '/verification', {
            method: 'POST', headers: {Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({status:'revision_required', version, note:'Lengkapi lokasi fasilitas.'})
        });
        assert.equal(verification.status, 200);
        const revision = new FormData();
        for (const [name, value] of Object.entries({category:'other', title:'Laporan pagination 0',
            description:'Kondisi fasilitas perlu diperiksa.', address:'Jalan Fixture 123', version:version+1})) revision.set(name, value);
        const revised = await fetch(origin + paginatedReport, {method:'PUT', headers:{Authorization:'Bearer ' + userToken}, body:revision});
        assert.equal(revised.status, 200);
    }
    await click('#facility-detail-view [data-facility-back]');
    await value('facility-category', 'other');
    await text('#facility-list-message', '18 laporan');
    await openCard('Laporan pagination 0');
    await text('#facility-history-message', '20 perubahan');
    await click('#facility-history-more');
    await text('#facility-history-message', '21 perubahan');
    assert.equal(await visible('#facility-history-more'), false);

    await login(email, '/dashboard');
    await click(navButton);
    await text('#facility-list-message', '20 laporan');
    await value('facility-category', 'collection_site');
    await text('#facility-list-message', '1 laporan');
    await openCard(otherTitles[1]);
    await click('#facility-revise');
    assert.equal(await js('fetch(' + q(base + '/' + seed[1]) + ', (()=>{const body=new FormData();' +
        ' for(const [key,val] of Object.entries({category:"collection_site",title:"Revisi dari sesi lain",' +
        ' description:"Lokasi sudah diperbarui oleh pelapor.",address:"Jalan Contoh 123",version:"2"})) body.set(key,val);' +
        ' return {method:"PUT",body};})()).then(r=>r.status)'), 200);
    await submit('facility-form');
    await text('#facility-error', 'Versi atau status laporan berubah');
    await text('#facility-detail', 'Revisi dari sesi lain');
    assert.equal(await visible('#facility-revise'), false);
    await click('#facility-detail-view [data-facility-back]');
    await value('facility-category', 'waste_bank');
    await text('#facility-list-message', '1 laporan');
    await openCard(otherTitles[0]);
    await text('#facility-detail', rejection);
    await js('fetch("/logout", {method:"POST",redirect:"manual"}).then(()=>true)');
    await click('#facility-detail-view [data-facility-back]');
    await text('#facility-error', 'Sesi berakhir');
    await waitPath('/login');
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('PASS Chromium Phase 3B: real API, registration, keyboard/mobile, validation and photo, lost-response idempotency, cursor/filter, revision, approval/rejection, conflict, and expired session.');
}
