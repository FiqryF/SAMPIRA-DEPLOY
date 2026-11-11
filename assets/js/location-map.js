import {mountPointAddress} from './location-address.js?v=home-location-14';
import {locationPoint, navigationURL, roadRoute, routingConfig} from './location-routing.js?v=phase5b';
import {createMap, streetTiles, statusIcon, mapStatus} from './map-core.js?v=phase8';

const bandung = [-6.9175, 107.6191];
const activePanels = new Set();

function clearPanels() {
    for (const dispose of activePanels) { dispose(); }
}

window.addEventListener('pagehide', clearPanels);
window.addEventListener('pageshow', event => {
    if (event.persisted) { window.location.reload(); }
});
window.addEventListener('sampira:session-ended', clearPanels);

function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text) { el.textContent = text; }
    if (className) { el.className = className; }
    return el;
}

function action(text, fn, primary = false) {
    const button = node('button', text, 'location-action' + (primary ? ' primary' : ''));
    button.type = 'button';
    button.addEventListener('click', fn);
    return button;
}

function panel(host, title) {
    const root = node('section', null, 'location-panel');
    root.append(node('h4', title));
    host.replaceChildren(root);
    return root;
}

function output(root) {
    const status = node('p', '', 'location-status');
    status.setAttribute('role', 'status');
    root.append(status);
    return status;
}

function mapPanel(root, onPoint, {onHide, authorize, autoTiles = false, kind = 'pickup', record, compact = false, popup} = {}) {
    const frame = node('div', null, 'location-map');
    frame.setAttribute('role', 'region');
    frame.setAttribute('aria-label', 'Peta lokasi');
    const tools = node('div', null, 'location-map-tools');
    const tileStatus = output(tools);
    const loadTiles = action(autoTiles ? 'Coba muat peta lagi' : 'Muat peta jalan OpenStreetMap', attachTiles);
    loadTiles.hidden = autoTiles;
    tileStatus.textContent = autoTiles ? '' : 'Memuat peta jalan membagikan area yang terlihat kepada OpenStreetMap.';
    tools.prepend(loadTiles);
    root.append(tools, frame);

    async function attachTiles() {
        if (!map || !visible || tiles || authorizingTiles) { return; }
        loadTiles.disabled = true;
        if (autoTiles) { loadTiles.hidden = true; }
        if (authorize) {
            authorizingTiles = true;
            try {
                if (!await authorize() || !map || !visible) {
                    loadTiles.disabled = false;
                    return;
                }
            } catch {
                tileStatus.textContent = 'Akses tugas belum dapat diperiksa. Coba lagi saat koneksi tersedia.';
                loadTiles.disabled = false;
                loadTiles.hidden = false;
                return;
            } finally {
                authorizingTiles = false;
            }
        }
        tileStatus.textContent = autoTiles ? '' : 'Peta jalan diminta dari OpenStreetMap.';
        const layer = streetTiles();
        tiles = layer;
        layer.on('tileerror', () => {
            if (tiles !== layer) { return; }
            tileStatus.textContent = compact ? 'Peta jalan gagal dimuat. Coba muat lagi atau gunakan lokasi perangkat.' : 'Peta jalan gagal dimuat. Titik dan isian manual tetap bisa digunakan.';
            layer.remove();
            tiles = null;
            loadTiles.disabled = false;
            loadTiles.hidden = false;
        });
        layer.addTo(map);
    }

    let map;
    let tiles;
    let authorizingTiles = false;
    let visible = false;
    let geometry;
    const points = new Map();
    const markers = new Map();
    let routeLayer;

    function renderMarker(label) {
        markers.get(label)?.remove();
        markers.delete(label);
        const point = points.get(label);
        if (!map || !point) { return; }
        const state = record ? mapStatus(kind, record) : null;
        const marker = L.marker(point, {
            draggable: label === 'T', alt: markerTitle(label,state),
            icon: label === 'B' && state ? statusIcon(kind, state, 'location-pin location-pin-B')
                : L.divIcon({className: 'location-pin location-pin-' + label, html: label === 'T' ? '●' : label,
                    iconSize: [30, 30], iconAnchor: [15, 28]})
        }).addTo(map);
        if (label === 'T') { marker.on('dragend', () => {
            const {lat, lng} = marker.getLatLng();
            onPoint(lat, lng);
        }); }
        markers.set(label, marker);
        if (label === 'B' && popup) {
            const content = node('div', null, 'location-destination-popup');
            content.append(node('strong', popup.title), node('p', popup.address));
            marker.bindPopup(content).openPopup();
        }
    }

    function fit() {
        if (!map) { return; }
        const positions = [...points.values()].filter(Boolean);
        const options = {paddingTopLeft: [52, popup ? 150 : 38], paddingBottomRight: [36, 36], maxZoom: 16, animate: false};
        if (routeLayer) {
            const bounds = routeLayer.getBounds();
            positions.forEach(point => bounds.extend(point));
            map.fitBounds(bounds, options);
        } else if (positions.length === 1) { map.setView(positions[0], 16, {animate: false}); }
        else if (positions.length > 1) { map.fitBounds(positions, options); }
    }

    function renderRoute() {
        routeLayer?.remove();
        routeLayer = map && geometry ? L.geoJSON(geometry, {
            style: {color: '#155b88', weight: 5, opacity: 0.9}
        }).addTo(map) : null;
        if (routeLayer) { fit(); }
    }

    function hideMap(){
            if (visible) {
                onHide?.();
                if (tiles) {
                    tiles.remove();
                    tiles = null;
                    loadTiles.disabled = false;
                    tileStatus.textContent = autoTiles ? '' : 'Muat kembali peta jalan bila diperlukan.';
                }
            }
            visible = false;

            }
    function resize() {
        const hasSize = frame.getBoundingClientRect().width > 0;
        if(!hasSize){hideMap();return;}
        const opening = !visible;
        visible = true;
        if (!window.L) {
            frame.hidden = true;
            tileStatus.textContent = compact ? 'Peta belum tersedia. Gunakan lokasi perangkat atau muat ulang halaman.' : 'Peta tidak tersedia. Gunakan pilihan manual atau alamat.';
            loadTiles.hidden = true;
            observer.disconnect();
            return;
        }
        if (!map) {
            map = createMap(frame, bandung);
            if (onPoint) { map.on('click', ({latlng}) => onPoint(latlng.lat, latlng.lng)); }
            for (const label of points.keys()) { renderMarker(label); }
            renderRoute();
            fit();
        }
        map.invalidateSize({pan: autoTiles, animate: false});
        if (routeLayer || (autoTiles && opening)) { fit(); }
        if (autoTiles && opening) { void attachTiles(); }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    return {
        marker(label, point, center = false) {
            points.set(label, point);
            renderMarker(label);
            if (center) {
                if (point) { fit(); }
                else if (![...points.values()].some(Boolean)) { map?.setView(bandung, 12, {animate: false}); }
            }
        },
        route(line) {
            geometry = line;
            renderRoute();
        },
        destroy() {
            observer.disconnect();
            map?.remove();
            markers.clear();
            points.clear();
            map = tiles = geometry = routeLayer = null;
        }
    };
}

function coordinateInputs(root, prefix) {
    const grid = node('div', null, 'location-coordinate-grid');
    const inputs = ['Latitude', 'Longitude'].map(label => {
        const wrapper = node('label', label);
        const input = node('input');
        input.id = prefix + '-' + label.toLowerCase();
        input.type = 'text';
        input.inputMode = 'decimal';
        input.maxLength = 12;
        input.autocomplete = 'off';
        wrapper.htmlFor = input.id;
        wrapper.append(input);
        grid.append(wrapper);
        return input;
    });
    root.append(grid);
    return inputs;
}

function enteredPoint(inputs, digits) {
    const values = inputs.map(input => input.value.trim());
    const pattern = new RegExp(String.raw`^-?\d{1,3}(\.\d{1,${digits}})?$`);
    if (!values.every(value => pattern.test(value))) { return null; }
    return locationPoint(...values.map(Number));
}

function writePoint(inputs, point, digits) {
    inputs.forEach((input, index) => { input.value = point ? point[index].toFixed(digits) : ''; });
}

function locate(status, current, accept, {compact = false} = {}) {
    if (!window.isSecureContext || !navigator.geolocation) {
        status.textContent = compact ? 'Lokasi perangkat tidak tersedia. Geser pin pada peta.' : 'Lokasi perangkat tidak tersedia di halaman ini. Gunakan peta atau isi koordinat manual.';
        return;
    }
    status.textContent = 'Menunggu lokasi perangkat…';
    navigator.geolocation.getCurrentPosition(({coords}) => {
        if (!current()) { return; }
        const point = locationPoint(coords.latitude, coords.longitude);
        if (point) { accept(point); }
        let displayValue1; if (!point) { displayValue1 = 'Lokasi perangkat tidak valid. Pilih titik manual.'; } else if (coords.accuracy > 100) { displayValue1 = 'Perkiraan GPS meleset hingga sekitar ' + Math.round(coords.accuracy) + ' m. Periksa dan geser titik bila perlu.'; } else { displayValue1 = 'Lokasi perangkat diterima. Periksa titik pada peta.'; }
status.textContent = displayValue1;
    }, error => {
        if (!current()) { return; }
        const reason = {1: 'Izin lokasi ditolak.', 2: 'Perangkat belum dapat menentukan posisi.', 3: 'Waktu tunggu lokasi habis.'};
        status.textContent = (reason[error.code] || 'Lokasi perangkat tidak tersedia.') + (compact ? ' Geser pin pada peta.' : ' Gunakan peta atau isi koordinat manual.');
    }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 0});
}

export function mountLocationPicker(host, {title, prefix, digits, saved, includeSaved = false, compact = false, addressField}) {
    const root = panel(host, title);
    if (compact) {
        root.classList.add('location-picker-compact');
        root.firstElementChild.hidden = true;
        root.append(node('p', 'Gunakan lokasi Anda atau seret pin pada peta untuk menentukan titik ' + (prefix === 'facility' ? 'fasilitas.' : 'penjemputan.'), 'location-picker-hint'));
    } else { root.append(node('p', 'Periksa alamat dan titik tujuan. Klik peta, geser marker, atau isi kedua koordinat. Kamu tetap bisa mengirim alamat saja jika titik belum tersedia.')); }
    let choice = 'untouched';
    let gpsSequence = 0;
    const map = mapPanel(root, (lat, lon) => pick(locationPoint(lat, lon)), {autoTiles: true, compact});
    const inputs = coordinateInputs(root, prefix);
    if (compact) {
        inputs[0].parentElement.parentElement.hidden = true;
        for (const input of inputs) { input.type = 'hidden'; }
    }
    const status = output(root);
    const actions = node('div', null, 'location-actions');
    actions.append(action('Gunakan Lokasi Saya', () => {
            const id = ++gpsSequence;
            locate(status, () => root.isConnected && gpsSequence === id, pick, {compact});
        }));
    if (!compact) { actions.append(
        action(prefix === 'facility' ? 'Konfirmasi Titik Fasilitas' : 'Konfirmasi Titik Penjemputan', () => {
            ++gpsSequence;
            const point = read();
            if (!point) { return; }
            choice = 'confirmed';
            map.marker('T', point, true);
            status.textContent = 'Titik dikonfirmasi.';
            pointAddress.select(point);
        }, true),
        action('Hapus titik', () => {
            ++gpsSequence;
            choice = 'cleared';
            writePoint(inputs, null, digits);
            map.marker('T', null, true);
            status.textContent = 'Titik akan dikosongkan saat disimpan.';
        })
    ); }
    root.append(actions);
    const pointAddress=mountPointAddress(root,addressField);

    function pick(point) {
        if (!point) { return; }
        ++gpsSequence;
        choice = compact ? 'confirmed' : 'draft';
        writePoint(inputs, point, digits);
        map.marker('T', enteredPoint(inputs, digits), true);
        status.textContent = compact ? '' : 'Titik dipilih. Periksa lalu konfirmasi.';
        if(compact){ pointAddress.select(enteredPoint(inputs,digits)); }
    }

    for (const input of inputs) { input.addEventListener('input', () => {
        ++gpsSequence;
        choice = compact ? 'confirmed' : 'draft';
        map.marker('T', enteredPoint(inputs, digits), true);
        status.textContent = compact ? '' : 'Periksa dan konfirmasi kedua koordinat.';
    }); }

    function read() {
        const point = enteredPoint(inputs, digits);
        if (!point) {
            status.textContent = compact ? 'Pilih titik pada peta atau gunakan lokasi perangkat.'
                : 'Isi kedua koordinat dengan angka desimal dalam rentang dan maksimal ' + digits + ' desimal, atau gunakan Hapus titik.';
            if (!compact) { inputs.find(input => !input.value.trim())?.focus(); }
        }
        return point;
    }

    function reset(report) {
        pointAddress.cancel();
        ++gpsSequence;
        choice = 'untouched';
        const point = locationPoint(report?.latitude, report?.longitude) ?? (compact ? bandung : null);
        if (compact) { choice = 'confirmed'; }
        writePoint(inputs, point, digits);
        map.marker('T', point ?? bandung, true);
        let displayValue2; if (compact) { displayValue2 = ''; } else if (point) { displayValue2 = 'Titik tersimpan. Pindahkan jika ingin menggantinya.'; } else { displayValue2 = 'Geser pin awal ke lokasi yang tepat, lalu konfirmasi.'; }
status.textContent = displayValue2;
    }

    function fields() {
        if (compact) { return read() ? {latitude: inputs[0].value.trim(), longitude: inputs[1].value.trim()} : null; }
        if (choice === 'draft') {
            if (read()) {
                status.textContent = 'Konfirmasi titik sebelum menyimpan, atau gunakan Hapus titik.';
                actions.querySelector('.primary').focus();
            }
            return null;
        }
        if (choice === 'cleared') { return {latitude: '', longitude: ''}; }
        if (choice === 'confirmed' || (includeSaved && enteredPoint(inputs, digits))) {
            return {latitude: inputs[0].value.trim(), longitude: inputs[1].value.trim()};
        }
        return {};
    }

    function dispose() {
        activePanels.delete(dispose);
        ++gpsSequence;
        pointAddress.dispose();
        map.destroy();
        root.remove();
    }
    activePanels.add(dispose);
    reset(saved);
    return {reset, fields, dispose, selectPoint: (latitude, longitude) => pick(locationPoint(latitude, longitude))};
}

function appendExternalDestination(root,destination,label){
        const url = navigationURL(destination, label);
        if (url) {
            const link = node('a', 'Lihat tujuan di Google Maps');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            root.append(link, node('p', 'Tautan ini mengirim tujuan ke Google Maps.', 'location-privacy'));
        }
    }
function coordinateLabel(reported,destination){return (reported?'Titik dari pelapor · ':'Titik tersimpan · ')+destination.join(', ');}
function locationAddress(address){return typeof address==='string'?address.trim():'';}
export function mountLocationDetail(host, {title, point, address, reported = false, navigation, external = false, autoTiles = false, kind = 'pickup', popup}) {
    const root = panel(host, title);
    const destination = locationPoint(point?.latitude, point?.longitude);
    const label = locationAddress(address);
    root.append(node('p', label || 'Alamat belum tersedia.'));
    root.append(node('p', destination
        ? coordinateLabel(reported,destination)
        : 'Titik presisi belum tersedia.', 'location-coordinate-readout'));
    if(external){ appendExternalDestination(root,destination,label); }
    const onMapPoint=navigation?(lat,lon)=>navigationUI?.select(lat,lon):undefined;
    const map = destination ? mapPanel(root, onMapPoint, {
        onHide: () => navigationUI?.clear(), authorize: navigation?.authorize, autoTiles, kind, record:point, popup
    }) : null;
    map?.marker('B', destination, true);
    if (destination && autoTiles) { root.append(node('p', 'Peta dasar OpenStreetMap memuat area yang terlihat.', 'location-privacy')); }
    const navigationUI = navigation ? mountNavigation(root, map, destination, label, navigation) : null;
    if (navigation?.compact) {
        root.classList.add('location-detail-compact');
        for (const item of [...root.children].slice(0,3)) { item.hidden = true; }
        root.querySelector('.location-route-options')?.append(...root.querySelectorAll(':scope>.location-privacy'));
    }
    function dispose() {
        activePanels.delete(dispose);
        navigationUI?.dispose();
        map?.destroy();
        root.remove();
    }
    activePanels.add(dispose);
    return dispose;
}

function routeSummary(route){            const metrics = [];
            if (Number.isFinite(route.distance) && route.distance >= 0) { metrics.push((route.distance / 1000).toLocaleString('id-ID', {maximumFractionDigits: 1}) + ' km'); }
            if (Number.isFinite(route.duration) && route.duration >= 0) { metrics.push(Math.ceil(route.duration / 60) + ' menit'); }
            return metrics.length ? 'Estimasi penyedia · ' + metrics.join(' · ') : 'Rute jalan tersedia.';
}
function markerTitle(label,state){if(label==='A'){ return 'Titik awal'; }return 'Titik tujuan'+(state?' · '+state.label:'');}
function externalPrivacy(destination){return (destination?'':'Alamat digunakan karena titik presisi belum tersedia. ')+'Google Maps akan menerima tujuan saat dibuka.';}
function routeUnavailable(config,origin){if(!config){ return 'Layanan rute belum dikonfigurasi. Gunakan navigasi eksternal.'; }if(!origin){ return 'Pilih titik awal A terlebih dahulu.'; }return 'Peta belum tersedia. Gunakan navigasi eksternal.';}
function mountNavigation(root, map, destination, address, {authorize, recheck = false, origin: initialOrigin, action: initialAction, compact = false, gpsHost, externalHost}) {
    let origin;
    let controller;
    let gpsSequence = 0;
    let disposed = false;
    let linkPending = false;
    let checkPending = false;
    let routeButton;
    let inputs;
    let gpsButton;
    let instruction;
    const url = navigationURL(destination, address);
    const controls = node('div', null, 'location-actions');
    const status = output(root);
    const config = routingConfig();
    if(destination){ setupRouteFields(); }
    function setupRouteFields(){
        instruction = node('p', 'Tentukan titik awal A lewat peta, isian manual, atau lokasi perangkat. Lihat Rute mengirim titik A dan B ke layanan rute yang dikonfigurasi.');
        root.append(instruction);
        inputs = coordinateInputs(root, 'origin-' + (recheck ? 'facility' : 'pickup'));
        for (const input of inputs) { input.addEventListener('input', () => {
            ++gpsSequence;
            updateOrigin(enteredPoint(inputs, 7), true);
        }); }
        routeButton = action('Lihat Rute', calculate, true);
        gpsButton = action(compact ? 'Lokasi Saya' : 'Gunakan Lokasi Saya', () => {
            const id = ++gpsSequence;
            locate(status, () => !disposed && id === gpsSequence, point => select(...point));
        });
        controls.append(gpsButton, routeButton);
        if (!config && !compact) { status.textContent = 'Layanan rute belum dikonfigurasi. Gunakan navigasi eksternal.'; }
        }
    const externalButton = action(compact ? 'Petunjuk Rute (Buka Google Maps)' : 'Buka di Google Maps', openExternal);
    controls.append(externalButton);
    externalButton.disabled = !url;
    root.append(controls, node('p', url
        ? externalPrivacy(destination)
        : 'Navigasi tidak tersedia karena tujuan dan alamat belum tersedia.', 'location-privacy'));
    if(compact){ arrangeControls(); }
    function arrangeControls(){
        const advanced = node('details', null, 'location-route-options');
        advanced.append(node('summary', 'Opsi rute lainnya'));
        if (initialAction === 'route') { advanced.open = true; }
        if (instruction) { advanced.append(instruction, inputs[0].parentElement.parentElement); }
        if (gpsHost && gpsButton) { gpsHost.replaceChildren(gpsButton); }
        if (externalHost) { externalHost.replaceChildren(externalButton); }
        advanced.append(controls);
        root.append(advanced);
        }

    function cancelRoute() {
        controller?.abort();
        controller = null;
        if (routeButton) { routeButton.disabled = false; }
        map?.route(null);
    }

    function updateOrigin(point, center) {
        cancelRoute();
        origin = point;
        map?.marker('A', origin, center);
        status.textContent = point ? 'Titik awal A siap.' : 'Pilih atau isi kedua koordinat titik awal A.';
    }

    function select(latitude, longitude) {
        const point = locationPoint(latitude, longitude);
        if (!point || !inputs) { return; }
        ++gpsSequence;
        writePoint(inputs, point, 7);
        updateOrigin(enteredPoint(inputs, 7), true);
    }

    function clear() {
        ++gpsSequence;
        cancelRoute();
        origin = null;
        if (inputs) { writePoint(inputs, null, 7); }
        map?.marker('A', null);
        status.textContent = '';
    }

    async function calculate() {
        if (controller) { return; }
        if (!config || !origin || !window.L) {
            status.textContent=routeUnavailable(config,origin);
            return;
        }
        const task = new AbortController();
        controller = task;
        const start = origin;
        routeButton.disabled = true;
        map.route(null);
        status.textContent = 'Memeriksa tugas dan menghitung rute jalan…';
        try {
            if (!await authorize() || task.signal.aborted || disposed) { return; }
            const route = await roadRoute(config, start, destination, task.signal);
            if (task.signal.aborted || disposed) { return; }
            map.route(route.geometry);
            status.textContent=routeSummary(route);
        } catch (error) {
            if (!task.signal.aborted && !disposed) { status.textContent = error.message + ' Gunakan navigasi eksternal bila perlu.'; }
        } finally {
            if (controller === task) {
                controller = null;
                routeButton.disabled = false;
            }
        }
    }

    async function openExternal() {
        if (!url || linkPending) { return; }
        linkPending = true;
        const button = externalButton;
        button.disabled = true;
        try {
            if (!await authorize() || disposed) { return; }
            const link = node('a');
            link.href = url;
            link.rel = 'noreferrer';
            link.hidden = true;
            root.append(link);
            link.click();
            link.remove();
        } catch (error) {
            if (!disposed) { status.textContent = error.message; }
        } finally {
            button.disabled = false;
            linkPending = false;
        }
    }

    async function checkAccess() {
        if (disposed || checkPending || document.hidden || !root.getClientRects().length) { return; }
        checkPending = true;
        try {
            await authorize();
        } catch {
            // The detail remains available until the server reports revoked access.
        } finally {
            checkPending = false;
        }
    }

    const interval = recheck ? setInterval(checkAccess, 20000) : null;
    if (recheck) { window.addEventListener('focus', checkAccess); }
    function onVisibility() {
        if (document.hidden) { clear(); }
        else if (recheck) { void checkAccess(); }
    }
    document.addEventListener('visibilitychange', onVisibility);
    if (initialOrigin && destination) { select(...initialOrigin); }
    if (initialAction === 'route') {
        routeButton?.focus();
        if (initialOrigin && destination) { void calculate(); }
    } else if (initialAction === 'external') {
        externalButton.focus();
    }

    return {select, clear, dispose() {
        disposed = true;
        gpsButton?.remove();
        externalButton.remove();
        clear();
        clearInterval(interval);
        window.removeEventListener('focus', checkAccess);
        document.removeEventListener('visibilitychange', onVisibility);
    }};
}
