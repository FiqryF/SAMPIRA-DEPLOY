// Run from the isolated Chromium harness with the real Phase 4A backend.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {captureAdmin} from './admin-visual-fixture.mjs';

const reports = '/api/ecorecycle/facility-reports';
const adminEmail = 'admin@phase1.invalid';
const ownerEmail = 'owner@phase1.invalid';
const firstEmail = 'collector@phase1.invalid';
const secondEmail = 'second-collector@phase1.invalid';
const title = 'Pemeriksaan TPS fixture ' + randomUUID().slice(0,8);
const root = '[data-facility-handling]';
const publicPanel = '.handling-public';
const dialog = 'dialog.handling-dialog[open]';

export async function checkHandlingBrowser({send, js, login, click, text, waitFor, profile, password}) {
    const q = JSON.stringify;
    const origin = await js('location.origin');
    const png = join(profile, 'phase4-proof.png');
    writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64'));
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64');
    const validForm = (values, photo=false) => {
        const form = new FormData();
        for(const [key,value] of Object.entries(values)) form.set(key,value);
        if (photo) form.set('photo',new Blob([pngBytes],{type:'image/png'}),'phase4-proof.png');
        return form;
    };
    async function api(path, options = {}, code = 200) {
        const {token, body, headers, method} = options;
        const response = await fetch(origin + path, {method, headers: {
            ...(token ? {Authorization:'Bearer ' + token} : {}),
            ...(body && !(body instanceof FormData) ? {'Content-Type':'application/json'} : {}),
            ...headers
        }, body: body && !(body instanceof FormData) ? JSON.stringify(body) : body});
        assert.equal(response.status, code, path);
        return (response.headers.get('content-type') || '').includes('application/json') ? (await response.json()).data : null;
    }
    const bearer = email => api('/api/auth/login',{method:'POST',body:{email,password}});
    const admin = await bearer(adminEmail);
    const owner = await bearer(ownerEmail);
    const first = await bearer(firstEmail);
    const second = await bearer(secondEmail);
    const otherEmail = randomUUID()+'@phase4b.invalid';
    await api('/api/auth/register',{method:'POST',body:{name:'Other browser fixture',email:otherEmail,password}},201);
    const other = await bearer(otherEmail);
    const created = await api(reports,{token:owner.token,method:'POST',headers:{'Idempotency-Key':randomUUID()},body:validForm({
        category:'tps',title,description:'Engsel dan pengunci perlu diperiksa.',address:'Jalan Pengujian Bandung',
        latitude:'-6.9',longitude:'107.6'
    })},201);
    const id = created.id;
    const path = reports+'/'+id+'/handling';
    await api(reports+'/'+id+'/verification',{token:admin.token,method:'POST',body:{status:'approved',version:created.version}});
    const viewport = width => send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width<500});
    const ready = selector => waitFor(() => js('Boolean(document.querySelector('+q(selector)+')?.getClientRects().length)'), 'Missing visible '+selector);
    const absent = selector => js('!document.querySelector('+q(selector)+')');
    const value = (selector, next) => js('(()=>{const field=document.querySelector('+q(selector)+');field.value='+q(String(next))+
        ';field.dispatchEvent(new Event("input",{bubbles:true}));field.dispatchEvent(new Event("change",{bubbles:true}));})()');
    async function clickText(selector, expected) {
        await waitFor(() => js('(()=>{const item=Array.from(document.querySelectorAll('+q(selector)+')).find(e=>e.textContent.trim()==='+q(expected)+'&&e.getClientRects().length);if(!item)return false;item.click();return true})()'), 'Missing button ' + expected);
    }
    async function openCard(selector, name = title) {
        await text(selector, name);
        await js('Array.from(document.querySelectorAll('+q(selector+' > *')+')).find(e=>e.querySelector("h4")?.textContent==='+q(name)+').querySelector("button").click()');
    }
    const queue = () => openCard(root+' .facility-cards');
    const workflowButton = name => clickText(root+' .handling-actions button',name);
    async function fillField(name, fieldValue) {
        const selector = dialog+' [name="'+name+'"]';
        await waitFor(() => js('(()=>{const field=document.querySelector('+q(selector)+');return field && (!field.options||Array.from(field.options).some(o=>o.value==='+q(String(fieldValue))+'))})()'), 'Missing field or option ' + name);
        await value(selector,fieldValue);
    }
    function fill(fields) {
        return Object.entries(fields).reduce(
            (previous, [name, fieldValue]) => previous.then(() => fillField(name, fieldValue)),
            Promise.resolve()
        );
    }
    async function upload() {
        const {root:doc} = await send('DOM.getDocument');
        const {nodeId} = await send('DOM.querySelector',{nodeId:doc.nodeId,selector:dialog+' input[type=file]'});
        await send('DOM.setFileInputFiles',{nodeId,files:[png]});
        await ready(dialog+' img');
    }
    async function save() {
        await click(dialog+' button[type=submit]');
        await waitFor(() => absent(dialog),'Dialog did not close');
    }
    async function act(action, fields = {}, photo = false) {
        await workflowButton(action);
        await ready(dialog);
        await fill(fields);
        if(photo) await upload();
        await save();
        await text(root+' .facility-notice','Perubahan tersimpan');
    }
    async function assertLayoutAtWidth(width) {
        await viewport(width);
        assert(await js('document.documentElement.scrollWidth <= innerWidth + 2'), 'Horizontal overflow at ' + width);
    }
    async function assertLayout() {
        await assertLayoutAtWidth(1280);
        await assertLayoutAtWidth(390);
        await assertLayoutAtWidth(320);
    }
    async function openOwner() {
        await login(ownerEmail,'/dashboard');
        await viewport(1280);
        await click('[data-target="laporan-fasilitas"]');
        await openCard('#facility-list');
        await text(publicPanel, 'Progres Penanganan Fasilitas');
    }
    async function openAdmin(status = 'approved') {
        await login(adminEmail,'/admin');
        await viewport(1440);
        await click('[data-open-handling]');
        if (status !== 'approved') await value(root+' select',status);
        if (status === 'approved') {
            await text(root+' .facility-cards', title);
            await captureAdmin(send, js, '05-penanganan-monitor');
        }
        await queue();
        await text(root, 'Detail penanganan');
    }
    async function openOfficer(email, mobile = false) {
        await login(email,'/petugas');
        await viewport(mobile ? 390 : 1280);
        await click((mobile ? '.bottom-nav' : '.sidebar')+' [data-open-handling]');
    }

    await openOwner();
    await text(publicPanel,'Menunggu penugasan');
    await text(publicPanel,'Belum ada aktivitas');
    await api(path,{token:other.token},404);

    await openAdmin();
    assert(await js('document.querySelector("[data-facility-reports=admin]").hidden'));
    await text(root,'Jalan Pengujian Bandung');
    await captureAdmin(send, js, '06-penanganan-detail');
    await workflowButton('Tugaskan Petugas');
    await text(dialog,'Pilih Petugas aktif');
    await waitFor(() => js('document.querySelector('+q(dialog+' select')+')?.options.length >= 3'), 'Officers were not loaded');
    await captureAdmin(send, js, '07-penugasan');
    await assertLayout();
    assert(await js('(()=>{const r=document.querySelector('+q(dialog)+').getBoundingClientRect();return r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'));
    assert(await js('Array.from(document.querySelectorAll('+q(dialog+' select, '+dialog+' textarea')+')).every(x=>x.labels.length)'));
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor(() => absent(dialog),'Escape did not close dialog');
    assert.equal((await api(path,{token:admin.token})).version,0);
    await act('Tugaskan Petugas',{petugas_id:first.id,internal_note:'Catatan penugasan privat'});
    await text(root,'Petugas ditugaskan');

    await openOwner();
    await text(publicPanel,'Petugas ditugaskan');
    await text(publicPanel,'Penugasan Petugas');
    assert(!(await js('document.querySelector('+q(publicPanel)+').innerText.includes("Catatan penugasan privat")')));

    await openOfficer(firstEmail,true);
    await queue();
    await text(root,'-6.9, 107.6');
    await openAdmin('assigned');
    await workflowButton('Alihkan tugas');
    await text(dialog,'memulai siklus asesmen baru');
    await waitFor(() => js('document.querySelector('+q(dialog+' select')+')?.options.length === 2'),'Replacement list not loaded');
    assert(await js('Array.from(document.querySelector('+q(dialog+' select')+').options).every(option=>option.value!=='+q(String(first.id))+')'));
    const assigned = await api(path,{token:first.token});
    await api(path+'/activity',{token:first.token,method:'POST',body:validForm({version:assigned.version,action:'start_assessment'})});
    await fill({petugas_id:second.id,internal_note:'Alihkan saat asesmen berubah.'});
    await save();
    await text(root+' [role=alert]','Versi atau status berubah');
    await text(root,'Sedang diperiksa');
    assert.equal((await api(path,{token:admin.token})).assignment.petugas_id,first.id);
    await act('Alihkan tugas',{petugas_id:second.id,internal_note:'Alihkan ke Petugas kedua.'});
    await text(root,'Pengalihan tugas');
    await api(path,{token:first.token},404);
    await api(path+'/activity',{token:first.token,method:'POST',body:validForm({version:3,action:'start_assessment'})},404);

    await workflowButton('Catat penerusan');
    await ready(dialog);
    await captureAdmin(send, js, '09-koordinasi');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor(() => absent(dialog),'Dialog koordinasi tidak tertutup');
    await act('Catat penerusan',{agency:'Instansi Fixture',channel:'Surat',forwarded_at:'2025-01-01T08:00',internal_note:'Surat benar-benar dikirim.',reference:'SURAT-FIXTURE'},true);
    await text(root,'Penerimaan oleh instansi belum dikonfirmasi.');
    await text(root,'Petugas ditugaskan');
    await workflowButton('Catat penerimaan dikonfirmasi');
    await fill({internal_note:'Instansi mengonfirmasi penerimaan.'});
    await click(dialog+' button[type=submit]');
    await text(dialog+' [role=alert]','Sertakan nomor referensi atau foto bukti.');
    await fill({reference:'TERIMA-FIXTURE'});
    await save();
    await text(root,'Penerimaan dikonfirmasi');
    await act('Catat tindak lanjut dilaporkan',{internal_note:'Instansi melaporkan jadwal pemeriksaan.'});
    assert.equal((await api(path,{token:admin.token})).status,'assigned');
    const privateEvent = (await api(path+'/history',{token:admin.token})).items.find(e=>e.agency==='Instansi Fixture');
    await api(path+'/history/'+privateEvent.version+'/photo',{token:owner.token},404);
    await api(path+'/history/'+privateEvent.version+'/photo',{token:second.token},404);

    await openOfficer(firstEmail);
    await text(root,'Belum ada laporan');
    await openOfficer(secondEmail,true);
    await queue();
    await act('Mulai asesmen',{public_note:'Petugas menuju lokasi.'});
    await text(root,'Sedang diperiksa');
    await act('Catat hasil pemeriksaan',{condition:'Pengunci tidak rapat.',assessment:'Perlu uji pengunci.',internal_note:'Temuan teknis privat',public_note:'Kondisi sudah diperiksa.'},true);
    await text(root,'Dalam penanganan');
    const assessment = (await api(path+'/history',{token:second.token})).items.find(e=>e.action==='record_assessment');
    assert(assessment.has_photo);
    await api(path+'/history/'+assessment.version+'/photo',{token:owner.token},404);
    await act('Catat tindakan',{action_taken:'Menyiapkan pengujian pengunci.'});
    await act('Serahkan hasil',{result:'Uji awal selesai.'});
    await text(root,'Hasil telah diserahkan dan menunggu validasi Admin.');

    await openAdmin('resolution_submitted');
    await text(root,'Temuan teknis privat');
    await clickText(root+' .handling-timeline button','Tampilkan foto bukti');
    await waitFor(() => js('Array.from(document.querySelectorAll('+q(root+' .handling-timeline img')+')).some(img=>img.naturalWidth>0)'), 'Admin photo did not load');
    await act('Minta perbaikan hasil',{internal_note:'Ulangi uji pengunci setelah penyesuaian.',public_note:'Hasil sedang diperiksa ulang.'});
    await text(root,'Perlu perbaikan hasil');

    await openOfficer(secondEmail,true);
    await queue();
    await text(root,'Ulangi uji pengunci setelah penyesuaian.');
    assert(!(await js('Array.from(document.querySelectorAll('+q(root+' .handling-actions button')+')).some(x=>x.textContent==="Serahkan hasil")')));
    await act('Catat tindakan',{action_taken:'Menyesuaikan posisi pengunci dan menguji kembali.'});
    // Each progress update needs the version returned by the previous one.
    const progressNotes = Array.from({length:8}, (_, index) => 'Pemeriksaan berulang '+(index+1));
    await progressNotes.reduce((previous, note) => previous.then(state =>
        api(path+'/activity',{token:second.token,method:'POST',body:validForm({
            version:state.version,action:'record_progress',action_taken:note
        })})
    ), api(path,{token:second.token}));
    await clickText(root+' button','Muat ulang detail');
    await text(root,'Pemeriksaan berulang 8');
    await act('Serahkan hasil',{result:'Pengunci lulus uji ulang.'},true);
    const submitted = await api(path,{token:second.token});

    await openAdmin('resolution_submitted');
    await text(root,'Pengunci lulus uji ulang.');
    await workflowButton('Validasi penyelesaian');
    await captureAdmin(send, js, '08-validasi-hasil');
    const eligible = await js('Array.from(document.querySelector('+q(dialog+' select')+').options).map(x=>x.value)');
    assert(eligible.includes(String(submitted.version)));
    assert(!eligible.includes(String(privateEvent.version)));
    await fill({public_note:'Pengunci telah diuji ulang dan berfungsi.',public_evidence_version:submitted.version});
    await save();
    await text(root,'Hasil tervalidasi');
    await act('Catat penyelesaian eksternal terverifikasi',{reference:'VERIF-FIXTURE',internal_note:'Penyelesaian telah diperiksa.'});
    await text(root,'Penyelesaian eksternal terverifikasi');

    await openOwner();
    await text(publicPanel,'Hasil tervalidasi');
    await text(publicPanel,'Pengunci telah diuji ulang dan berfungsi.');
    await text(publicPanel,'Penyelesaian eksternal terverifikasi');
    await text(publicPanel,'20 aktivitas ditampilkan.');
    await clickText(publicPanel+' button','Muat histori berikutnya');
    await text(publicPanel,'23 aktivitas ditampilkan.');
    await waitFor(() => js('document.querySelector(".handling-public img")?.naturalWidth === 1'), 'Published photo did not load');
    assert.equal(await js('document.querySelectorAll(".handling-public img").length'),1);
    const publicHistory = await js('document.querySelector(".handling-public").innerText');
    for (const privateText of ['Temuan teknis privat','Ulangi uji pengunci','Instansi Fixture','SURAT-FIXTURE']) {
        assert(!publicHistory.includes(privateText), 'Private text appeared in public history: '+privateText);
    }
    await api(path+'/history/'+assessment.version+'/photo',{token:owner.token},404);
    await api(path+'/history/'+submitted.version+'/photo',{token:owner.token});
    await assertLayout();
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('PASS Chromium Phase 4B: Admin assignment, reassignment and conflict; Petugas activity, evidence and corrections; User progress, publication and privacy; external coordination and responsive keyboard UI.');
}
