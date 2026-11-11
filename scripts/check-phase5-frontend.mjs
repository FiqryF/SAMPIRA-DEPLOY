// Real Chromium and Phase 5A API, with an in-browser simulated routing provider.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

const api = '/api/ecorecycle/';
const reports = api + 'facility-reports';
const pickupPicker = '#pickup-location-picker';
const editPicker = '#edit-pickup-location';
const facilityPicker = '#facility-location-picker';
const userMap = '#user-tracking-location';
const mission = '#mission-location';
const handling = '[data-facility-handling]';
const confirm = ' .location-actions .primary';
const ownerEmail = 'owner@phase1.invalid';
const officerEmail = 'collector@phase1.invalid';
const adminEmail = 'admin@phase1.invalid';
const secondEmail = 'second-collector@phase1.invalid';

export async function checkLocationBrowser({send, js, login, click, text, waitFor, profile, password}) {
    const q = JSON.stringify;
    const origin = await js('location.origin');
    const ready = selector => waitFor(() => js('Boolean(document.querySelector(' + q(selector) + ')?.getClientRects().length)'), 'Missing ' + selector);
    const absent = selector => js('!document.querySelector(' + q(selector) + ')');
    const value = (selector, next) => js('(() => { const input = document.querySelector(' + q(selector) +
        '); input.value=' + q(String(next)) + '; input.dispatchEvent(new Event("input",{bubbles:true})); })()');
    const readValue = selector => js('document.querySelector(' + q(selector) + ').value');
    const submit = selector => js('document.querySelector(' + q(selector) + ').requestSubmit(); void 0');
    const data = path => js('fetch(' + q(path) + ').then(r => r.json()).then(body => body.data)');
    const viewport = width => send('Emulation.setDeviceMetricsOverride', {width, height: 850, deviceScaleFactor: 1, mobile: width < 500});
    const pickupPath = tracking => api + 'pickup_status?' + new URLSearchParams({tracking_number: tracking});
    const point = item => [item.latitude, item.longitude];
    const action = (parent, label) => js('Array.from(document.querySelectorAll(' + q(parent + ' button') +
        ')).find(button => button.textContent.trim() === ' + q(label) + ' && button.getClientRects().length).click()');
    const reportTitle = 'Peta fasilitas fixture ' + randomUUID().slice(0, 6);
    const description = 'Perangkat rusak untuk pengujian peta';
    const png = join(profile, 'phase5-facility.png');
    writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64'));

    async function request(path, code, token, body) {
        const headers = token ? {Authorization: 'Bearer ' + token} : {};
        if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
        if (body instanceof FormData) headers['Idempotency-Key'] = randomUUID();
        const response = await fetch(origin + path, {method: body ? 'POST' : 'GET', headers,
            body: body && !(body instanceof FormData) ? JSON.stringify(body) : body});
        assert.equal(response.status, code, path);
        return (await response.json()).data;
    }
    const bearer = email => request('/api/auth/login', 200, null, {email, password});
    const [owner, officer, admin, second] = await Promise.all([ownerEmail, officerEmail, adminEmail, secondEmail].map(bearer));

    async function layout(panel) {
        for (const width of [1280, 768, 390, 320]) {
            await viewport(width);
            await ready(panel);
            assert(await js('document.documentElement.scrollWidth <= innerWidth + 2'), 'Page overflow at ' + width + ' in ' + panel);
            assert(await js('(() => {const r = document.querySelector(' + q(panel) +
                ').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1})()'), 'Map panel clipped at ' + width);
            if (width <= 768) assert(await js('!document.body.classList.contains("role-collector") || getComputedStyle(document.querySelector(".sidebar")).display === "none"'),
                'Desktop sidebar obscured the mobile route at ' + width);
        }
        await viewport(1280);
    }

    async function screenshot(name, selector) {
        await js('document.querySelector(' + q(selector) + ').scrollIntoView({behavior:"instant",block:"center"}); void 0');
        const result = await send('Page.captureScreenshot', {format: 'png'});
        writeFileSync(join(profile, name), Buffer.from(result.data, 'base64'));
    }

    async function clickMap(selector) {
        await ready(selector + '.leaflet-container');
        await js('document.querySelector(' + q(selector) + ').scrollIntoView({behavior:"instant",block:"center"}); void 0');
        const {x, y} = await waitFor(() => js('(() => { const el = document.querySelector(' + q(selector) +
            '); const r = el.getBoundingClientRect(); const x = Math.round(r.left + r.width * .61); const y = Math.round(r.top + r.height * .4);' +
            'return el.contains(document.elementFromPoint(x, y)) ? {x,y} : null; })()'), 'Map click target was covered in ' + selector);
        await send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
        await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1});
    }

    async function dragMarker(selector) {
        await ready(selector);
        await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const {x, y} = await waitFor(() => js('(() => { const el = document.querySelector(' + q(selector) +
            '); const r = el.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);' +
            'return el.contains(document.elementFromPoint(x, y)) ? {x,y} : null; })()'), 'Marker drag target was covered in ' + selector);
        await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
        await send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
        for (const delta of [9, 20, 34]) {
            await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: x + delta, y: y + delta / 2, buttons: 1, button: 'left'});
            await js('new Promise(requestAnimationFrame)');
        }
        await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: x + 34, y: y + 17, button: 'left', clickCount: 1});
    }

    async function track(tracking) {
        await click('[data-target="lacak-pickup"]');
        await value('#track-number-search', tracking);
        await click('.tracking-search button');
        await text('#track-disp-number', tracking);
    }

    async function openReport(title, list = '#facility-list') {
        await text(list, title);
        await js('Array.from(document.querySelectorAll(' + q(list + ' > *') +
            ')).find(row => row.querySelector("h4")?.textContent === ' + q(title) + ').querySelector("button").click()');
    }

    await login(ownerEmail, '/dashboard');
    await click('[data-target="setor-sampah"]');
    for (const [selector, next] of [
        ['#form-donor-phone', '081234567890'], ['#form-pickup-address', 'Jalan Pengujian Peta 10 Bandung'],
        ['#form-request-title', 'Jemput perangkat uji'], ['#form-item-description', description],
        ['#form-waste-weight', '2'], ['#form-waste-category', 'Computers']
    ]) await value(selector, next);
    await ready(pickupPicker + ' .leaflet-tile-loaded');
    assert(await js('document.querySelector("#pickup-location-picker .location-map-tools button").hidden'));
    await layout(pickupPicker + ' .location-map');
    await viewport(320);
    await screenshot('phase5-user-mobile.png', pickupPicker + ' .location-map');
    await viewport(1280);
    await click('[data-target="beranda"]');
    await waitFor(() => absent(pickupPicker + ' .leaflet-tile'), 'Tile layer remained active while pickup form was hidden');
    await send('Network.setBlockedURLs', {urls: ['https://tile.openstreetmap.org/*']});
    await click('[data-target="setor-sampah"]');
    await text(pickupPicker, 'Peta jalan gagal dimuat');
    await send('Network.setBlockedURLs', {urls: []});
    await action(pickupPicker, 'Coba muat peta lagi');
    await ready(pickupPicker + ' .leaflet-tile-loaded');
    await ready(pickupPicker + ' .location-pin-T');
    await text(pickupPicker, 'Geser pin awal');
    assert.equal(await readValue('#pickup-latitude'), '', 'The starting pin is only a visual guide');
    assert.equal(await readValue('#pickup-longitude'), '');
    await js(`window.pickupSearchFetch = fetch; window.fetch = (url, options) =>
        String(url).startsWith('https://photon.komoot.io/api/')
            ? Promise.resolve(Response.json({features:[{properties:{name:'Jalan Braga',city:'Bandung'},
                geometry:{type:'Point',coordinates:[107.6089686,-6.916285]}}]}))
            : pickupSearchFetch(url, options); void 0`);
    await value('#pickup-address-search', 'Jalan Braga');
    await click('#pickup-search-button');
    await text('#pickup-search-results', 'Jalan Braga, Bandung');
    await click('#pickup-search-results button');
    await js('window.fetch = pickupSearchFetch; void 0');
    assert.equal(Number(await readValue('#pickup-latitude')), -6.916285);
    assert.equal(Number(await readValue('#pickup-longitude')), 107.6089686);
    await js('document.querySelector("#pickup-location-picker .location-map").scrollIntoView({behavior:"instant",block:"center"}); void 0');
    await dragMarker(pickupPicker + ' .location-pin-T');
    await text(pickupPicker, 'Titik dipilih');
    await submit('#pickup-request-form');
    await text(pickupPicker, 'Konfirmasi titik sebelum menyimpan');

    await send('Browser.setPermission', {origin, permission: {name: 'geolocation'}, setting: 'granted'});
    await send('Emulation.setGeolocationOverride', {latitude: -6.92123456, longitude: 107.61765432, accuracy: 150});
    await js('window.gpsCalls = 0; const locate = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition = (...args) => { gpsCalls++; locate(...args) }; void 0');
    assert.equal(await js('gpsCalls'), 0);
    await action(pickupPicker, 'Gunakan Lokasi Saya');
    await text(pickupPicker + ' .location-coordinate-grid + .location-status', '150 m');
    assert.equal(await readValue('#pickup-latitude'), '-6.9212346');
    assert.equal(await js('gpsCalls'), 1);
    await send('Browser.setPermission', {origin, permission: {name: 'geolocation'}, setting: 'denied'});
    await action(pickupPicker, 'Gunakan Lokasi Saya');
    await text(pickupPicker + ' .location-coordinate-grid + .location-status', 'Izin lokasi ditolak');

    await clickMap(pickupPicker + ' .location-map');
    await click(pickupPicker + confirm);
    await text(pickupPicker, 'Titik dikonfirmasi');
    const selected = await readValue('#pickup-longitude');
    await dragMarker(pickupPicker + ' .location-pin-T');
    await waitFor(async () => (await readValue('#pickup-longitude')) !== selected, 'Pickup marker drag did not update coordinate');
    await submit('#pickup-request-form');
    await text(pickupPicker, 'Konfirmasi titik sebelum menyimpan');
    await click(pickupPicker + confirm);
    const saved = [Number(await readValue('#pickup-latitude')), Number(await readValue('#pickup-longitude'))];
    await js('window.requestPickupFetch = fetch; window.fetch = (url, options) => String(url).endsWith("/request_pickup")' +
        ' ? Promise.resolve(Response.json({status:"error",message:"Fixture server gagal"}, {status:503})) : requestPickupFetch(url, options); void 0');
    await submit('#pickup-request-form');
    await text('.swal2-html-container', 'Fixture server gagal');
    await click('.swal2-confirm');
    await js('window.fetch = requestPickupFetch; void 0');
    assert.equal(Number(await readValue('#pickup-latitude')), saved[0]);
    await js(`window.phase7PickupRequests = [];
        window.fetch = async (url, options) => {
            const response = await requestPickupFetch(url, options);
            if (!String(url).endsWith('/request_pickup')) return response;
            const result = await response.clone().json();
            phase7PickupRequests.push({key:options.headers['Idempotency-Key'], code:response.status, id:result.data?.pickup_id});
            if (phase7PickupRequests.length === 1) throw new TypeError('Simulated lost pickup response');
            return response;
        }; void 0`);
    await submit('#pickup-request-form');
    await text('.swal2-html-container', 'Gagal menghubungi server.');
    await click('.swal2-confirm');
    await submit('#pickup-request-form');
    await text('.swal2-title', 'Permohonan Berhasil');
    const retries = await js('phase7PickupRequests');
    assert.deepEqual(retries.map(item => item.code), [201,200]);
    assert(retries[0].key && retries[0].key === retries[1].key);
    assert.equal(retries[0].id, retries[1].id);
    await js('window.fetch = requestPickupFetch; delete window.phase7PickupRequests; void 0');
    const tracking = await js('document.querySelector(".swal2-html-container strong").textContent');
    await click('.swal2-confirm');
    await text(userMap, saved.join(', '));
    await text('#track-disp-title', 'Jemput perangkat uji');
    await ready(userMap + ' .location-pin-B');
    assert.deepEqual(point(await data(pickupPath(tracking))), saved);

    async function editPickup(number = tracking) {
        await click('[data-target="beranda"]');
        const selector = 'button[data-edit-tracking=' + q(number) + ']';
        await ready(selector);
        await click(selector);
        await ready(editPicker + ' .location-map');
    }
    async function saveEdit(expected) {
        await click('.swal2-confirm');
        await text('.swal2-title', 'Pengajuan Diperbarui');
        await click('.swal2-confirm');
        assert.deepEqual(point(await data(pickupPath(tracking))), expected);
    }
    await editPickup();
    await ready(editPicker + ' .location-pin-T');
    await layout(editPicker + ' .location-map');
    await value('#edit-pickup-address', 'Jalan Pengujian Alamat Baru Bandung');
    await saveEdit(saved);
    await editPickup();
    await value('#edit-pickup-latitude', 0);
    await value('#edit-pickup-longitude', 0);
    await click(editPicker + confirm);
    await saveEdit([0, 0]);
    await editPickup();
    await action(editPicker, 'Hapus titik');
    await saveEdit([null, null]);
    await track('PHASE1-LEGACY');
    await text(userMap, 'Titik presisi belum tersedia');
    assert(await absent(userMap + ' .location-pin-B'));

    await editPickup();
    const updated = [-6.9174639, 107.6191228];
    await value('#edit-pickup-latitude', updated[0]);
    await value('#edit-pickup-longitude', updated[1]);
    await click(editPicker + confirm);
    await saveEdit(updated);
    const race = await request(api + 'request_pickup', 201, owner.token, {
        item_description: 'Pengujian edit setelah tugas diklaim', pickup_address: 'Jalan Pengujian Klaim 12 Bandung',
        contact_phone: '081234567890', weight_kg: 2, category: 'Computers'
    });
    await js('loadDashboardData(); void 0');
    await editPickup(race.tracking_number);
    await request(api + 'assign_collector', 200, second.token, {tracking_number: race.tracking_number});
    await click('.swal2-confirm');
    await text('.swal2-title', 'Pengajuan sudah berubah');
    await click('.swal2-confirm');

    await click('[data-target="laporan-fasilitas"]');
    await click('#facility-new');
    await ready(facilityPicker + ' .leaflet-tile-loaded');
    assert(await js('document.querySelector("#facility-location-picker .location-map-tools button").hidden'));
    await layout(facilityPicker + ' .location-map');
    await click('#facility-category-cards input[value=tps]');
    await value('#facility-title', reportTitle);
    await value('#facility-description', 'Pintu fasilitas perlu ditinjau oleh petugas.');
    await value('#facility-address', 'Jalan Fasilitas Uji Bandung');
    await text(facilityPicker, 'Geser pin awal');
    assert.equal(await readValue('#facility-latitude'), '');
    assert.equal(await readValue('#facility-longitude'), '');
    await js('document.querySelector("#facility-location-picker .location-map").scrollIntoView({behavior:"instant",block:"center"}); void 0');
    await dragMarker(facilityPicker + ' .location-pin-T');
    await text(facilityPicker, 'Titik dipilih');
    await submit('#facility-form');
    await text(facilityPicker, 'Konfirmasi titik sebelum menyimpan');
    await click(facilityPicker + confirm);
    const facilityPoint = [Number(await readValue('#facility-latitude')), Number(await readValue('#facility-longitude'))];
    const {root} = await send('DOM.getDocument');
    const {nodeId} = await send('DOM.querySelector', {nodeId: root.nodeId, selector: '#facility-photo'});
    await send('DOM.setFileInputFiles', {nodeId, files: [png]});
    await text('#facility-photo-status', 'Foto siap diunggah');
    await submit('#facility-form');
    await text('#facility-detail .location-panel', facilityPoint.join(', '));
    await ready('#facility-detail .location-pin-B');
    const report = (await data(reports)).items.find(item => item.title === reportTitle);
    assert.deepEqual(point(report), facilityPoint);
    assert(report.photo_url);

    await login(adminEmail, '/admin');
    await click('[data-open-verification]');
    assert.equal(await js('window.L?.version'), '1.9.4');
    await js(`window.destinationMarkers = [];
        L.Marker.addInitHook(function() {
            if (this.options.icon?.options.className?.includes('location-pin-B')) {
                const {lat, lng} = this.getLatLng();
                window.destinationMarkers.push([lat, lng]);
            }
        }); void 0`);
    await openReport(reportTitle);
    await text('#facility-detail .location-panel', 'Titik dari pelapor');
    await text('#facility-detail .location-panel', facilityPoint.join(', '));
    await ready('#facility-detail .location-pin-B');
    assert.deepEqual(await js('destinationMarkers.at(-1)'), facilityPoint);
    await ready('#facility-detail .leaflet-tile-loaded');
    await layout('#facility-detail .location-map');
    await click('[data-open-handling]');
    await send('Network.setBlockedURLs', {urls: ['https://tile.openstreetmap.org/*']});
    await click('[data-open-verification]');
    await text('#facility-detail .location-panel', 'Peta jalan gagal dimuat');
    await ready('#facility-detail .location-pin-B');
    await send('Network.setBlockedURLs', {urls: []});
    await action('#facility-detail .location-panel', 'Coba muat peta lagi');
    await ready('#facility-detail .leaflet-tile-loaded');
    assert.equal(await js('document.querySelectorAll("#facility-detail .leaflet-container").length'), 1);
    const verification = reports + '/' + report.id + '/verification';
    await request(verification, 200, admin.token, {status: 'revision_required', version: report.version, note: 'Pastikan titik dan alamat fasilitas sudah cocok.'});

    await login(ownerEmail, '/dashboard');
    await click('[data-target="laporan-fasilitas"]');
    await openReport(reportTitle);
    await ready('#facility-revise');
    await click('#facility-revise');
    await ready(facilityPicker + ' .leaflet-tile-loaded');
    await ready(facilityPicker + ' .location-pin-T');
    assert.deepEqual([Number(await readValue('#facility-latitude')), Number(await readValue('#facility-longitude'))], facilityPoint);
    await value('#facility-address', 'Jalan Fasilitas Uji Nomor 2 Bandung');
    await submit('#facility-form');
    await text('#facility-success', 'Revisi terkirim');
    let revised = await data(reports + '/' + report.id);
    assert.deepEqual(point(revised), facilityPoint);
    await request(verification, 200, admin.token, {status: 'revision_required', version: revised.version, note: 'Pindahkan titik ke pintu sebelah timur.'});
    await click('#facility-detail-view [data-facility-back]');
    await openReport(reportTitle);
    await ready('#facility-revise');
    await click('#facility-revise');
    const finalPoint = [-6.917463, 107.619122];
    await value('#facility-latitude', finalPoint[0]);
    await value('#facility-longitude', finalPoint[1]);
    await click(facilityPicker + confirm);
    await submit('#facility-form');
    await text('#facility-detail .location-panel', finalPoint.join(', '));
    revised = await data(reports + '/' + report.id);
    assert.deepEqual(point(revised), finalPoint);
    assert.equal(revised.photo_url, report.photo_url);
    await request(verification, 200, admin.token, {status: 'approved', version: revised.version});
    const facilityTask = reports + '/' + report.id + '/handling';
    await request(facilityTask + '/assignment', 200, admin.token, {version: 0, petugas_id: officer.id});
    const legacyForm = new FormData();
    for (const [name, item] of Object.entries({
        category: 'tps', title: 'Fasilitas tanpa titik fixture', description: 'Lokasi historis tanpa koordinat.',
        address: 'Jalan Lokasi Fasilitas Historis'
    })) legacyForm.set(name, item);
    const legacyFacility = await request(reports, 201, owner.token, legacyForm);
    await request(reports + '/' + legacyFacility.id + '/verification', 200, admin.token, {status: 'approved', version: 1});
    await request(reports + '/' + legacyFacility.id + '/handling/assignment', 200, admin.token, {version: 0, petugas_id: officer.id});

    await login(adminEmail, '/admin');
    await click('[data-open-handling]');
    await js('const filter = document.querySelector("[data-facility-handling] select"); filter.value = "assigned"; filter.dispatchEvent(new Event("change")); void 0');
    await openReport(reportTitle, handling + ' .facility-cards');
    await text(handling + ' .location-panel', finalPoint.join(', '));
    await ready(handling + ' .location-pin-B');
    await ready(handling + ' .leaflet-tile-loaded');
    await layout(handling + ' .location-map');
    await action(handling, 'Kembali ke daftar');
    await openReport(legacyFacility.title, handling + ' .facility-cards');
    await text(handling + ' .location-panel', 'Titik presisi belum tersedia');
    assert(await absent(handling + ' .location-pin-B'));
    await click('[data-open-verification]');
    await js('{ const filter = document.querySelector("#facility-status"); filter.value = "approved"; filter.dispatchEvent(new Event("change")); } void 0');
    await openReport(legacyFacility.title);
    await text('#facility-detail .location-panel', 'Titik presisi belum tersedia');
    assert(await absent('#facility-detail .location-pin-B'));
    await request(pickupPath(tracking), 403, admin.token);
    const addressOnly = 'Jalan Tujuan Tanpa Titik Bandung';
    const addressPickup = await request(api + 'request_pickup', 201, owner.token, {
        item_description: 'Pickup dengan alamat saja', pickup_address: addressOnly,
        contact_phone: '081234567890', weight_kg: 2, category: 'Computers'
    });
    await request(api + 'assign_collector', 200, officer.token, {tracking_number: addressPickup.tracking_number});

    await login(officerEmail, '/petugas');
    const queue = '[data-tracking=' + q(tracking) + ']';
    await ready(queue);
    assert.equal(await js('document.querySelector(' + q(queue) + ').closest(".task-item")?.innerText.includes("Alamat Baru") || false'), false);
    const pending = (await data(api + 'list_pickups?type=petugas')).find(item => item.tracking_number === tracking);
    assert.deepEqual(point(pending), [null, null]);
    assert.equal(pending.pickup_address, null);
    await request(pickupPath(tracking), 403, officer.token);
    await click(queue);
    await text('.swal2-title', 'Ambil Tugas Penjemputan');
    await click('.swal2-confirm');
    await text('.swal2-title', 'Tugas Diambil');
    await click('.swal2-confirm');
    await text(mission + ' .location-panel', updated.join(', '));
    await ready(mission + ' .location-pin-B');
    await ready(mission + ' .leaflet-tile-loaded');
    await action(mission, 'Lihat Rute');
    await text(mission, 'Layanan rute belum dikonfigurasi');
    assert(await absent(mission + ' path.leaflet-interactive'));
    await request(pickupPath(tracking), 403, second.token);
    await request(api + 'update_pickup', 409, owner.token, {
        tracking_number: tracking, item_description: description, pickup_address: 'Jalan Pengujian Alamat Baru Bandung',
        contact_phone: '081234567890', weight_kg: 2, category: 'Computers', latitude: 0, longitude: 0
    });

    async function fakeRoutes() {
        await js(`document.querySelector('meta[name="sampira-routing-url"]').content = 'https://route.fixture.invalid/osrm';
            window.fixtureFetch = fetch;
            window.routeCalls = [];
            window.fetch = (url, options) => {
                if (!String(url).startsWith('https://route.fixture.invalid/')) return fixtureFetch(url, options);
                window.routeCalls.push(String(url));
                return new Promise((resolve, reject) => {
                    window.releaseRoute = (data, status=200) => resolve(Response.json(data, {status}));
                    options.signal.addEventListener('abort', () => {
                        window.routeAborted = true;
                        reject(options.signal.reason);
                    }, {once:true});
                });
            };
            window.anchorClick = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function() {
                if (this.href.startsWith('https://www.google.com/maps/dir/')) window.externalDestination = this.href;
                else return anchorClick.call(this);
            }; void 0`);
    }
    const routeGeometry = {type: 'LineString', coordinates: [[107.6012, -6.9012], [107.6100, -6.912], [107.6191, -6.91746]]};
    const routeResponse = {code: 'Ok', routes: [{geometry: routeGeometry, distance: 2400, duration: 480}]};
    await fakeRoutes();
    const reopenMission = async trackingNumber => {
        await js('switchView("dashboard"); void 0');
        await click('[data-mission=' + q(trackingNumber) + ']');
        await ready(mission + ' .location-panel');
    };
    await reopenMission(tracking);
    await layout(mission + ' .location-map');
    await send('Browser.setPermission', {origin, permission: {name: 'geolocation'}, setting: 'granted'});
    await send('Emulation.setGeolocationOverride', {latitude: -6.9012, longitude: 107.6012, accuracy: 20});
    assert.equal(await readValue('#origin-pickup-latitude'), '');
    await action(mission, 'Gunakan Lokasi Saya');
    await ready(mission + ' .location-pin-A');
    assert.equal(await readValue('#origin-pickup-latitude'), '-6.9012000');
    await value('#origin-pickup-latitude', '-6.9012345');
    await value('#origin-pickup-longitude', '107.6012345');
    await action(mission, 'Lihat Rute');
    await text(mission, 'menghitung rute jalan');
    await waitFor(() => js('routeCalls.length === 1'), 'Provider request missing');
    assert.match(await js('routeCalls[0]'), /107\.6012345,-6\.9012345;107\.6191228,-6\.9174639/);
    await js('releaseRoute(' + q(routeResponse) + '); void 0');
    await text(mission, '8 menit');
    await ready(mission + ' path.leaflet-interactive');
    await viewport(390);
    await waitFor(() => js(`(() => {
        const frame = document.querySelector('#mission-location .location-map');
        const bounds = frame.getBoundingClientRect();
        return [...frame.querySelectorAll('.location-pin')].every(pin => {
            const r = pin.getBoundingClientRect();
            return r.left >= bounds.left && r.right <= bounds.right && r.top >= bounds.top && r.bottom <= bounds.bottom;
        });
    })()`), 'Route endpoints were clipped after mobile resize');
    await screenshot('phase5-officer-mobile.png', mission + ' .location-map');
    await viewport(1280);
    await action(mission, 'Lihat Rute');
    await waitFor(() => js('routeCalls.length === 2'), 'Second provider request missing');
    await value('#origin-pickup-latitude', '-6.9012346');
    await waitFor(() => js('routeAborted === true'), 'Origin change did not cancel provider request');
    assert(await absent(mission + ' path.leaflet-interactive'));
    await action(mission, 'Lihat Rute');
    await waitFor(() => js('routeCalls.length === 3'), 'Third provider request missing');
    await js('releaseRoute({code:"NoRoute"},400); void 0');
    await text(mission, 'tidak ditemukan');
    assert(await absent(mission + ' path.leaflet-interactive'));
    await ready(mission + ' .location-pin-B');
    await action(mission, 'Buka di Google Maps');
    await waitFor(() => js('Boolean(window.externalDestination)'), 'Navigation link missing');
    assert.deepEqual(Object.fromEntries(new URL(await js('externalDestination')).searchParams), {api: '1', destination: updated.join(',')});
    await action(mission, 'Lihat Rute');
    await waitFor(() => js('routeCalls.length === 4'), 'Route before task switch missing');
    await js('window.routeAborted = false; void 0');
    await reopenMission('PHASE1-LEGACY');
    await waitFor(() => js('routeAborted === true'), 'Task switch did not cancel provider request');
    assert(await absent(mission + ' .location-pin-B'));
    await text(mission, 'Navigasi tidak tersedia');
    assert(await js('document.querySelector("#mission-location .location-actions button").disabled'));
    await reopenMission(addressPickup.tracking_number);
    await text(mission, 'Alamat digunakan');
    assert(await absent(mission + ' .location-pin-B'));
    await js('window.externalDestination = null; void 0');
    await action(mission, 'Buka di Google Maps');
    await waitFor(() => js('Boolean(window.externalDestination)'), 'Address fallback link missing');
    assert.equal(new URL(await js('externalDestination')).searchParams.get('destination'), addressOnly);

    await click('.sidebar [data-open-handling]');
    await openReport(legacyFacility.title, handling + ' .facility-cards');
    await text(handling + ' .location-panel', 'Titik presisi belum tersedia');
    assert(await absent(handling + ' .location-pin-B'));
    await js('window.externalDestination = null; void 0');
    await action(handling + ' .location-panel', 'Buka di Google Maps');
    await waitFor(() => js('Boolean(window.externalDestination)'), 'Facility address fallback missing');
    assert.equal(new URL(await js('externalDestination')).searchParams.get('destination'), legacyFacility.address);
    await action(handling, 'Kembali ke daftar');
    await openReport(reportTitle, handling + ' .facility-cards');
    await text(handling + ' .location-panel', finalPoint.join(', '));
    await ready(handling + ' .location-pin-B');
    await ready(handling + ' .leaflet-tile-loaded');
    await layout(handling + ' .location-map');
    await clickMap(handling + ' .location-map');
    await ready(handling + ' .location-pin-A');
    await action(handling + ' .location-panel', 'Lihat Rute');
    await waitFor(() => js('routeCalls.length === 5'), 'Facility provider request missing');
    await js('releaseRoute(' + q(routeResponse) + '); void 0');
    await ready(handling + ' path.leaflet-interactive');
    await js('window.externalDestination = null; void 0');
    await action(handling + ' .location-panel', 'Buka di Google Maps');
    await waitFor(() => js('Boolean(window.externalDestination)'), 'Facility navigation link missing');
    assert.equal(new URL(await js('externalDestination')).searchParams.get('destination'), finalPoint.join(','));
    await action(handling + ' .location-panel', 'Lihat Rute');
    await waitFor(() => js('routeCalls.length === 6'), 'Route before reassignment missing');
    await js('window.routeAborted = false; void 0');
    await request(facilityTask + '/assignment', 200, admin.token,
        {version: 1, petugas_id: second.id, internal_note: 'Alihkan pengujian ke petugas kedua.'});
    await js('window.dispatchEvent(new Event("focus")); void 0');
    await waitFor(() => absent(handling + ' .location-panel'), 'Revoked task retained its map');
    await waitFor(() => js('routeAborted === true'), 'Reassignment did not cancel provider request');
    await text(handling, 'tidak tersedia untuk akun ini');
    await request(facilityTask, 404, officer.token);
    assert.deepEqual(point(await request(facilityTask, 200, second.token)), finalPoint);
    assert.equal(await js('localStorage.getItem("user")'), null);
    await js('logoutCollector(); void 0');
    await waitFor(() => js('location.pathname === "/login"'), 'Officer logout failed');
    assert(await absent('.location-panel'));
    await send('Browser.resetPermissions');
    await send('Emulation.clearGeolocationOverride');
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('PASS Chromium Phase 5B: real pickup and facility save/revision, authorized markers, GPS, mobile layout, simulated route, cancellation, external fallback and reassignment cleanup.');
    console.log('Phase 5B screenshots: ' + profile);
}
