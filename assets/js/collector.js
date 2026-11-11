let globalActiveMission = null;
let missionSequence = 0;
let disposeMissionLocation;
const missionLocation = document.getElementById('mission-location');
const missionMaps = import('./location-map.js?v=collector-tasks-2');

function clearMissionLocation() {
    ++missionSequence;
    disposeMissionLocation?.();
    disposeMissionLocation = null;
    missionLocation.replaceChildren();
    document.getElementById('mission-dest').textContent = '—';
    document.getElementById('mission-details').replaceChildren();
    document.getElementById('mission-title').textContent = 'Memuat rincian tugas…';
    document.getElementById('mission-instruction').textContent = 'Tinjau lokasi dan status terbaru sebelum melanjutkan.';
    const contact = document.getElementById('mission-contact');
    contact.hidden = true;
    contact.removeAttribute('href');
    document.getElementById('mission-coordinates').textContent = '';
    document.getElementById('mission-map-destination').textContent = '';
    document.getElementById('mission-route-action').replaceChildren();
    document.getElementById('mission-map-gps').replaceChildren();
    const button = document.getElementById('mission-btn');
    button.disabled = true;
    button.onclick = null;
}

const upcomingList = document.getElementById('upcoming-task-list');
const historyBody = document.getElementById('history-table-body');

const collectorStatusMeta = {
    pending: {
        label: 'Menunggu Diambil',
        shortLabel: 'ANTREAN',
        description: 'Tugas baru dari warga, belum diambil petugas.',
        nextAction: 'Ambil tugas untuk melihat detail penjemputan.'
    },
    pickup: {
        label: 'Siap Dijemput',
        shortLabel: 'JEMPUT',
        description: 'Tugas sudah menjadi milik Anda. Datangi alamat donor dan ambil sampah.',
        nextAction: 'Klik Mulai Transit setelah barang sudah diambil.'
    },
    transit: {
        label: 'Menuju Hub',
        shortLabel: 'MENUJU HUB',
        description: 'Sampah sedang Anda bawa menuju Recycling Hub.',
        nextAction: 'Klik Tiba di Hub setelah barang diterima hub.'
    },
    arrived: {
        label: 'Tiba di Hub',
        shortLabel: 'TIBA DI HUB',
        description: 'Barang sudah tiba di hub dan menunggu verifikasi berat aktual.',
        nextAction: 'Tidak ada aksi petugas berikutnya.'
    },
    completed: {
        label: 'Selesai',
        shortLabel: 'SELESAI',
        description: 'Penjemputan tercatat selesai di riwayat.',
        nextAction: 'Misi masuk riwayat.'
    }
};

function getCollectorStatusMeta(status) {
    return collectorStatusMeta[status] || collectorStatusMeta.pending;
}

function switchView(viewId, element) {
    if (viewId !== 'active-mission') clearMissionLocation();
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) {
        target.classList.add('active');
    }
    window.dispatchEvent(new Event('sampira:collector-view'));
    if (viewId === 'dashboard') document.querySelector('[data-collector-summary]')?.dispatchEvent(new Event('sampira:open'));

    document.querySelectorAll('.sidebar-item, .nav-item').forEach(item => item.classList.remove('active'));
    if (viewId === 'operations') {
        document.querySelectorAll('[data-collector-view="operations"]').forEach(item => item.classList.add('active'));
    } else if (element) {
        element.classList.add('active');
    } else {
        const navItems = document.querySelectorAll('.sidebar-item, .nav-item');
        navItems.forEach(item => {
            const text = item.innerText.toLowerCase();
            const viewLabels = {dashboard:['dashboard','beranda'],history:['riwayat'],earnings:['komisi'],profile:['profil'],facility:['fasilitas'],'active-mission':['pickup aktif','misi']};
            const matchesView = (viewLabels[viewId] || [viewId.replace('-', ' ')]).some(label => text === label || (label !== 'misi' && text.includes(label)));
            const matchesHome = viewId === 'dashboard' && text.includes('home');
            if (matchesView || matchesHome) item.classList.add('active');
        });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openActiveMission() {
    if (globalActiveMission) {
        void viewActiveMission(globalActiveMission.tracking_number);
    } else {
        Swal.fire({
            icon: 'info',
            title: 'Tidak Ada Misi Aktif',
            text: 'Saat ini Anda tidak memiliki misi penjemputan aktif. Silakan ambil tugas dari Antrean.',
            confirmButtonColor: '#126048'
        });
        switchView('dashboard');
    }
}

async function fetchMission(tracking) {
    const query = new URLSearchParams({tracking_number: tracking});
    const response = await portalFetch('/api/ecorecycle/pickup_status?' + query);
    if ([401, 403, 404].includes(response.status)) return null;
    const body = await response.json();
    if (!response.ok || !body.data) throw new Error('Detail tugas belum dapat dimuat. Coba lagi.');
    return body.data;
}

async function viewActiveMission(tracking, navigation) {
    clearMissionLocation();
    switchView('active-mission');
    const sequence = missionSequence;
    document.getElementById('mission-resi').textContent = '—';
    document.getElementById('mission-status').textContent = 'Memuat';
    missionLocation.textContent = 'Memuat lokasi penjemputan…';
    try {
        const item = await fetchMission(tracking);
        if (sequence !== missionSequence) return;
        if (!item) {
            missionLocation.textContent = 'Detail pickup tidak tersedia untuk akun ini.';
            void loadCollectorData();
            return;
        }
        renderMission(item);
        try {
            const {mountLocationDetail} = await missionMaps;
            if (sequence !== missionSequence) return;
            disposeMissionLocation = mountLocationDetail(missionLocation, {
                title: 'Titik tujuan penjemputan', point: item, address: item.pickup_address, autoTiles: true,
                popup: {title: 'Lokasi donor: ' + (item.donor_name || 'Warga'), address: item.pickup_address || 'Alamat belum tersedia.'},
                navigation: {...navigation, authorize, compact: true, gpsHost: document.getElementById('mission-map-gps'), externalHost: document.getElementById('mission-route-action')}
            });
        } catch {
            missionLocation.textContent = 'Peta belum tersedia. Gunakan alamat penjemputan.';
        }

        async function authorize() {
            if (sequence !== missionSequence) return false;
            const latest = await fetchMission(tracking);
            if (sequence !== missionSequence) return false;
            if (!latest) {
                clearMissionLocation();
                missionLocation.textContent = 'Akses tugas berakhir. Kembali ke daftar tugas.';
                void loadCollectorData();
                return false;
            }
            if (['latitude', 'longitude', 'pickup_address'].some(field => latest[field] !== item[field])) {
                void viewActiveMission(tracking);
                return false;
            }
            return true;
        }
    } catch (error) {
        if (sequence === missionSequence) missionLocation.textContent = error.message;
    }
}

function renderMission(item) {
    globalActiveMission = item;
    const statusMeta = getCollectorStatusMeta(item.status);
    
    document.getElementById('mission-title').textContent = 'Penjemputan ' + (item.category_name || 'sampah');
    document.getElementById('mission-instruction').textContent = statusMeta.nextAction;
    document.getElementById('mission-resi').innerText = item.tracking_number;
    document.getElementById('mission-status').innerText = statusMeta.label;
    document.getElementById('mission-status').dataset.status = item.status;

    const statusOrder = ['pickup', 'transit', 'arrived'];
    const currentStatusIndex = statusOrder.indexOf(item.status);
    document.querySelectorAll('.mission-progress-step').forEach((step, index) => {
        step.classList.toggle('completed', index < currentStatusIndex);
        step.classList.toggle('current', index === currentStatusIndex);
    });

    document.getElementById('mission-dest').innerText = item.pickup_address || 'Alamat penjemputan belum tersedia.';
    document.getElementById('mission-map-destination').textContent = 'Tujuan: ' + (item.pickup_address || 'Alamat belum tersedia.');
    const hasPoint = item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
    document.getElementById('mission-coordinates').textContent = hasPoint ? 'Titik tersimpan: ' + item.latitude + ', ' + item.longitude : 'Titik presisi belum tersedia. Alamat digunakan untuk navigasi.';
    document.getElementById('mission-details').innerHTML = `
        <dl class="mission-detail-list">
            <div><dt>Kategori</dt><dd>${escapePortalHTML(item.category_name)}</dd></div>
            <div><dt>Deskripsi</dt><dd>${escapePortalHTML(item.item_description)}</dd></div>
            <div><dt>Estimasi berat</dt><dd>${item.weight_kg} KG</dd></div>
            <div><dt>Donor</dt><dd>${escapePortalHTML(item.donor_name || 'Belum tersedia')}</dd></div>
            <div><dt>Kontak</dt><dd>${escapePortalHTML(item.contact_phone || 'Belum tersedia')}</dd></div>
        </dl>
    `;
    const contact = document.getElementById('mission-contact');
    const phone = String(item.contact_phone || '').replace(/[\s-]/g, '');
    if (/^(\+62|62|0)8\d{8,13}$/.test(phone)) {
        contact.href = 'https://wa.me/' + phone.replace(/^\+/, '').replace(/^0/, '62');
        contact.hidden = false;
    } else {
        contact.hidden = true;
        contact.removeAttribute('href');
    }

    const btn = document.getElementById('mission-btn');
    if (btn) {
        btn.disabled = false;
        if (item.status === 'pickup') {
            btn.innerHTML = '<i class="fas fa-truck-fast"></i> Mulai Transit (Bawa Sampah ke Hub)';
            btn.onclick = () => updateMissionStatus(item.tracking_number, 'transit', 'Di Perjalanan', 'Limbah telah diangkut oleh petugas menuju Recycling Hub.');
        } else if (item.status === 'transit') {
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Tiba di Hub';
            btn.onclick = () => updateMissionStatus(item.tracking_number, 'arrived', 'Recycling Hub Bandung', 'Sampah telah tiba di Recycling Hub dan siap ditimbang.');
        } else if (item.status === 'arrived') {
            btn.textContent = item.verified_at ? 'Berat aktual sudah tercatat' : 'Catat Berat Aktual';
            btn.disabled = Boolean(item.verified_at);
            btn.onclick = () => recordActualWeight(item.id);
        }
    }
}

async function recordActualWeight(pickupId) {
    const rows=globalActiveMission?.id===pickupId?globalActiveMission.items:null;
    const result = rows?.length ? await Swal.fire({title:'Berat aktual per kategori (kg)',customClass:{popup:'pickup-weighing-dialog'},confirmButtonColor:'#174c3c',html:rows.map((row,index)=>`<label class="pickup-actual-field">${escapePortalHTML(row.category)}<input class="swal2-input" type="number" min="0.01" max="99999.99" step="0.01" id="actual-item-${index}" value="${row.weight_kg}"></label>`).join(''),showCancelButton:true,cancelButtonText:'Batal',confirmButtonText:'Simpan penimbangan',preConfirm:()=>{const items=rows.map((row,index)=>({category:row.category,weight_kg:Number(document.getElementById('actual-item-'+index).value)}));if(items.some(row=>!row.weight_kg||row.weight_kg<=0||row.weight_kg>99999.99||Math.abs(row.weight_kg*100-Math.round(row.weight_kg*100))>.00001)){Swal.showValidationMessage('Isi berat aktual tiap kategori, maksimal dua desimal.');return false;}return items;}}) : await Swal.fire({
        title: 'Berat aktual di hub (kg)', input: 'number', inputAttributes: {min: '0.01', max: '99999.99', step: '0.01'},
        showCancelButton: true, confirmButtonText: 'Simpan',
        inputValidator: value => /^\d{1,5}(\.\d{1,2})?$/.test(value) && Number(value) > 0 ? undefined : 'Masukkan berat lebih dari nol.'
    });
    if (!result.isConfirmed) return;
    try {
        const response = await portalFetch('/api/ecorecycle/verify_pickup', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({pickup_id: pickupId, final_weight_kg: rows?.length ? Math.round(result.value.reduce((sum,row)=>sum+row.weight_kg,0)*100)/100 : Number(result.value), ...(rows?.length?{items:JSON.stringify(result.value)}:{})})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        await Swal.fire({icon: 'success', title: 'Berat aktual tercatat, penjemputan selesai'});
        switchView('dashboard');
        await loadCollectorData();
    } catch (error) {
        await Swal.fire({icon: 'error', title: 'Gagal mencatat berat', text: error.message});
    }
}

async function updateMissionStatus(trackingNum, newStatus, location, notes) {
    const result = await Swal.fire({title: 'Konfirmasi Perubahan Status', text: 'Ubah status penjemputan ' + trackingNum + ' menjadi ' + newStatus.toUpperCase() + '?', icon: 'question', showCancelButton: true, confirmButtonColor: '#126048', cancelButtonColor: '#64748b', confirmButtonText: 'Ya, Update!', cancelButtonText: 'Batal'});
    if (!result.isConfirmed) return;
    try {
        const response = await portalFetch('api/ecorecycle/pickup_status', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({tracking_number: trackingNum, status: newStatus, location, notes})});
        const data = await response.json();
        if (data.status !== 'success') {
            await Swal.fire({icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#126048'});
            return;
        }
        await Swal.fire({icon: 'success', title: 'Berhasil', text: 'Status misi berhasil diperbarui!', timer: 1500, showConfirmButton: false});
        await loadCollectorData();
        switchView('dashboard');
    } catch {
        await Swal.fire({icon: 'error', title: 'Kesalahan', text: 'Gagal terhubung ke server.', confirmButtonColor: '#126048'});
    }
}

async function claimPickup(trackingNum) {
    const result = await Swal.fire({title: 'Ambil Tugas Penjemputan', text: 'Apakah Anda bersedia menjemput sampah ' + trackingNum + '?', icon: 'question', showCancelButton: true, confirmButtonColor: '#126048', cancelButtonColor: '#64748b', confirmButtonText: 'Ya, Jemput!', cancelButtonText: 'Batal'});
    if (!result.isConfirmed) return;
    try {
        const response = await portalFetch('api/ecorecycle/assign_collector', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({tracking_number: trackingNum})});
        const data = await response.json();
        if (data.status !== 'success') {
            await Swal.fire({icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#126048'});
            return;
        }
        await Swal.fire({icon: 'success', title: 'Tugas Diambil!', text: 'Silakan lihat rincian alamat penjemputan masyarakat di tab Misi Aktif.', confirmButtonColor: '#126048'});
        await loadCollectorData();
        void viewActiveMission(trackingNum);
    } catch {
        await Swal.fire({icon: 'error', title: 'Kesalahan', text: 'Gagal menghubungi server.', confirmButtonColor: '#126048'});
    }
}

function renderCollectorHistory(item) {
    const statusMeta = getCollectorStatusMeta(item.status);
    const dateObj = new Date(item.verified_at || item.created_at);
    const dateStr = Number.isFinite(dateObj.getTime()) ? new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'Asia/Jakarta'}).format(dateObj) : 'Belum tersedia';
    const weight = item.final_weight_kg == null ? '—' : Number(item.final_weight_kg).toLocaleString('id-ID',{maximumFractionDigits:2}) + ' kg';
    return `
                        <tr>
                            <td><strong>${escapePortalHTML(item.tracking_number)}</strong><small>${escapePortalHTML(item.category_name || 'Penjemputan sampah')}</small></td>
                            <td>${dateStr}<small>${item.verified_at ? 'Ditimbang di hub' : 'Tanggal pengajuan'}</small></td>
                            <td><strong>${weight}</strong></td>
                            <td><span class="status-pill success">${statusMeta.label}</span></td>
                        </tr>
                    `;
}

function renderAssignedCollectorTask(item) {
    const statusMeta = getCollectorStatusMeta(item.status);
    const colors = {transit: ['#276e57', '#f0fdfa'], arrived: ['#15803d', '#f0fdf4']};
    const [badgeColor, badgeBg] = colors[item.status] || ['#1d4ed8', '#eff6ff'];
    return `
                            <button type="button" class="task-item" data-mission="${escapePortalHTML(item.tracking_number)}" onclick="viewActiveMission(this.dataset.mission)">
                                <div style="display:flex; align-items:center; gap:14px;">
                                    <div style="background:#ecfdf5; color: #087443; width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;"><i class="fas fa-truck-pickup"></i></div>
                                    <div>
                                        <div style="font-weight:900; font-size: 0.9rem; color:#064e3b;">${escapePortalHTML(item.tracking_number)}</div>
                                        <div style="font-size:0.75rem; color:#64748b;">${escapePortalHTML((item.pickup_address || "").slice(0, 25))}...</div>
                                    </div>
                                </div>
                                <span style="background:${badgeBg}; color:${badgeColor}; font-weight:800; padding:4px 10px; border-radius:50px; font-size:0.7rem;">${statusMeta.shortLabel}</span>
                            </button>
                        `;
}

function renderOpenCollectorTask(item) {
    const statusMeta = getCollectorStatusMeta(item.status);
    return `
                            <div class="task-item" style="cursor:default;">
                                <div style="display:flex; align-items:center; gap:14px; flex:1;">
                                    <div style="background:#fffbeb; color: #8a5315; width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;"><i class="fas fa-hand-holding-hand"></i></div>
                                    <div style="flex:1;">
                                        <div style="font-weight:900; font-size: 0.9rem; color:#064e3b;">${escapePortalHTML(item.tracking_number)}</div>
                                        <div style="font-size:0.75rem; color:#64748b;">${escapePortalHTML(item.category_name)} • ${item.weight_kg} KG</div>
                                        <div style="font-size:0.72rem; color: #8a5315; font-weight:800; margin-top:3px;">${statusMeta.nextAction}</div>
                                    </div>
                                </div>
                                <button type="button" class="btn-primary" style="padding: 8px 16px; font-size: 0.75rem; border-radius: 8px; width:auto; border:none;" data-tracking="${escapePortalHTML(item.tracking_number)}" onclick="claimPickup(this.dataset.tracking)">AMBIL</button>
                            </div>
                        `;
}

function summarizeCollectorPickups(list, userId) {
    const result = {weight: 0, historyHtml: '', tasksHtml: '', activeMission: null, activeCount: 0, queueCount: 0, completedCount: 0};
    for (const item of list) {
        if (item.status === 'completed') {
            result.completedCount++;
            result.weight += Number(item.final_weight_kg ?? 0);
            result.historyHtml += renderCollectorHistory(item);
        } else if (String(item.collector_id) === String(userId)) {
            if (['pickup', 'transit', 'arrived'].includes(item.status)) result.activeCount++;
            if (['pickup', 'transit'].includes(item.status)) result.activeMission = item;
            result.tasksHtml += renderAssignedCollectorTask(item);
            result.queueCount++;
        } else if (item.status === 'pending') {
            result.tasksHtml += renderOpenCollectorTask(item);
            result.queueCount++;
        }
    }
    return result;
}

function renderCollectorDashboard(list, userId) {
    const result = summarizeCollectorPickups(list, userId);
    globalActiveMission = result.activeMission;
    document.getElementById('stat-packages').innerText = result.weight.toFixed(1) + ' KG';
    document.getElementById('stat-active-tasks').textContent = result.activeCount;
    document.getElementById('stat-profit').innerText = '—';
    document.getElementById('earnings-total').innerText = '—';
    document.getElementById('earnings-completed-count').textContent = result.completedCount;
    document.getElementById('earnings-weight').textContent = result.weight.toLocaleString('id-ID',{maximumFractionDigits:2}) + ' kg';
    document.getElementById('collector-history-count').textContent = result.completedCount + ' misi selesai';
    document.getElementById('collector-queue-count').textContent = result.queueCount + ' tugas';
    if (upcomingList) upcomingList.innerHTML = result.tasksHtml || '<div class="collector-queue-empty"><i class="fas fa-inbox" aria-hidden="true"></i><strong>Tidak ada antrean pickup tersedia</strong><p>Tugas baru akan tampil di sini saat tersedia. Anda juga dapat meninjau tugas fasilitas.</p><button type="button" class="sp-button sp-button--quiet" onclick="switchView(\'facility\')">Lihat Tugas Fasilitas</button></div>';
    if (historyBody) historyBody.innerHTML = result.historyHtml || '<tr><td colspan="4" class="collector-history-empty"><i class="fas fa-clipboard-check" aria-hidden="true"></i><strong>Belum ada misi selesai</strong><p>Penjemputan yang sudah selesai akan tercatat di sini.</p></td></tr>';
}

let collectorLoadSequence=0;
const collectorStatus=document.getElementById('collector-load-status');
const collectorRetry=document.getElementById('collector-retry');
async function loadCollectorData() {
    const run=++collectorLoadSequence;
    collectorStatus.parentElement.hidden=false;
    collectorStatus.textContent='Memuat daftar penjemputan…';
    collectorRetry.hidden=true;
    try {
        const user=await portalUser('petugas');
        if (run !== collectorLoadSequence) return;
        if (!user) throw new Error('Profile unavailable');
        document.getElementById('desktop-greeting').innerText=`Halo, ${user.name}. Tinjau penjemputan dan tugas fasilitasmu.`;
        document.getElementById('collector-welcome-title').textContent=`Halo, ${user.name}.`;
        document.getElementById('mobile-name').innerText=user.name;
        document.getElementById('profile-name').innerText=user.name;
        document.getElementById('collector-profile-email').textContent=user.email;
        document.getElementById('mobile-avatar').innerText=user.name.substring(0,2).toUpperCase();
        document.getElementById('profile-avatar-large').innerText=user.name.substring(0,2).toUpperCase();
        const response=await portalFetch('/api/ecorecycle/list_pickups?type=petugas',{signal:AbortSignal.timeout(15000)});
        if (run !== collectorLoadSequence) return;
        if (response.status === 401 || response.status === 403) {logoutPortal(false);return;}
        const data=await response.json();
        if (run !== collectorLoadSequence) return;
        if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) throw new Error('Tasks unavailable');
        renderCollectorDashboard(data.data,user.id);
        collectorStatus.parentElement.hidden=true;
    } catch {
        if (run !== collectorLoadSequence) return;
        globalActiveMission=null;
        collectorStatus.textContent='Daftar penjemputan belum dapat dimuat.';
        collectorRetry.hidden=false;
        upcomingList.textContent='Coba muat ulang daftar penjemputan.';
        historyBody.replaceChildren();
        document.getElementById('stat-active-tasks').textContent='—';
        document.getElementById('stat-packages').textContent='—';
        for(const id of ['earnings-completed-count','earnings-weight','collector-history-count'])document.getElementById(id).textContent='—';
        document.getElementById('collector-queue-count').textContent='—';
    }
}
collectorRetry.addEventListener('click',loadCollectorData);
document.getElementById('collector-refresh').addEventListener('click', async event => {
    const button=event.currentTarget;
    if(button.disabled)return;
    button.disabled=true;
    document.querySelector('[data-collector-summary]').dispatchEvent(new Event('sampira:open'));
    try { await loadCollectorData(); } finally { button.disabled=false; }
});
window.addEventListener('sampira:session-ended',() => {collectorLoadSequence++;clearMissionLocation();});
window.addEventListener('focus',() => {
    if (document.hidden) return;
    if (document.getElementById('view-dashboard').classList.contains('active')) void loadCollectorData();
    else if (document.getElementById('view-active-mission').classList.contains('active') && globalActiveMission)
        void viewActiveMission(globalActiveMission.tracking_number);
});

function logoutCollector() {
    logoutPortal();
}

// Global Exports
window.switchView = switchView;
window.openActiveMission = openActiveMission;
window.viewActiveMission = viewActiveMission;
window.claimPickup = claimPickup;
window.logoutCollector = logoutCollector;

document.addEventListener('DOMContentLoaded', loadCollectorData);
