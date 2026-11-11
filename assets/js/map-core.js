
const pickupStates = {
    pending:['waiting','Menunggu penjemputan'], pickup:['accepted','Diambil Petugas'],
    transit:['progress','Menuju hub'], arrived:['progress','Menunggu verifikasi berat'],
    completed:['complete','Selesai'], cancelled:['rejected','Dibatalkan']
};
const verificationStates = {
    pending:['waiting','Menunggu verifikasi'], revision_required:['revision','Perlu revisi'],
    rejected:['rejected','Ditolak'], approved:['accepted','Disetujui']
};
const handlingStates = {
    approved:['accepted','Menunggu penugasan'], assigned:['accepted','Petugas ditugaskan'],
    assessment_in_progress:['progress','Sedang diperiksa'], handling_in_progress:['progress','Dalam penanganan'],
    resolution_submitted:['progress','Menunggu validasi'], resolution_revision_required:['revision','Perlu perbaikan hasil'],
    completed:['complete','Selesai']
};
const unknownStates = new Set();

export function mapStatus(kind, record = {}) {
    let value = record.status;
    let state;
    if (kind === 'pickup') state = pickupStates[value];
    else {
        const verification = record.verification_status || record.status;
        if (verification !== 'approved' && verificationStates[verification]) state = verificationStates[verification];
        else if (record.handling_unavailable) return {tone:'neutral', label:'Disetujui · penanganan belum dapat dimuat'};
        else {
            value = record.handling_status || record.status;
            state = record.handling_status ? handlingStates[value] : (handlingStates[value] || verificationStates[verification]);
        }
    }
    if (!state) {
        const key = kind + '/' + value;
        if (!unknownStates.has(key)) {
            unknownStates.add(key);
            console.warn('SAMPIRA map status unknown', key);
        }
        return {tone:'neutral', label:'Status belum tersedia'};
    }
    return {tone:state[0], label:state[1]};
}

export function createMap(container, center = [-6.9175,107.6191], zoom = 12) {
    return L.map(container, {scrollWheelZoom:false, zoomAnimation:false, fadeAnimation:false})
        .setView(center, zoom);
}

export function streetTiles() {
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:19,
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
}

const icons = {
    pickup:'<path d="M3 6h11v11H3z M14 10h4l3 4v3h-7 M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/>',
    facility:'<path d="m12 3 10 18H2z M12 9v5 M12 17v1"/>'
};

export function statusIcon(kind, state, extraClass = '') {
    const type = kind === 'pickup' ? 'pickup' : 'facility';
    return L.divIcon({
        className:'sp-status-pin sp-status-tone-' + state.tone + ' ' + extraClass,
        html:'<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[type] + '</svg>',
        iconSize:[32,32], iconAnchor:[16,30], popupAnchor:[0,-26]
    });
}

export function bindMapPopup(marker, content) {
    marker.bindPopup(content, {
        maxWidth:Math.min(260, Math.max(140, window.innerWidth - 115)),
        maxHeight:220, autoPanPadding:[16,16], keepInView:true
    });
    return marker;
}

export function mapLegend(host) {
    if (host.querySelector('.sp-status-legend')) return;
    const legend = document.createElement('ul');
    legend.className = 'sp-status-legend';
    legend.setAttribute('aria-label','Warna status peta');
    for (const [tone,label] of [
        ['waiting','Menunggu'], ['accepted','Diterima'], ['progress','Dalam proses'],
        ['complete','Selesai'], ['rejected','Ditolak / dibatalkan'], ['revision','Perlu revisi'],
        ['neutral','Beberapa status / belum tersedia']
    ]) {
        const item = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'sp-status-dot sp-status-tone-' + tone;
        dot.setAttribute('aria-hidden','true');
        item.append(dot,document.createTextNode(label));
        legend.append(item);
    }
    host.append(legend);
}

export async function facilityMapStates(items, read, base) {
    return Promise.all(items.map(async item => {
        if (item.status !== 'approved') return item;
        try {
            const handling = await read(base + '/' + item.id + '/handling');
            return {...item, handling_status:handling.status};
        } catch {
            return {...item, handling_unavailable:true};
        }
    }));
}

export {locationPoint} from './location-routing.js';
