// Portal warga SAMPIRA

let monthlyChart = null;

const categoryConfig = Object.fromEntries(wasteCategories.map(category => [category.name, category]));

const categorySelect = document.getElementById('form-waste-category');
if (categorySelect) { populateWasteOptions(categorySelect, 'Small Gadgets'); }
let multiCategoryBackendReady=false;
let selectedPickupItems = new Map([['Small Gadgets',1]]);
const categoryGrid = document.getElementById('category-helper-grid');
if (categoryGrid) {
    categoryGrid.replaceChildren();
    for (const category of wasteCategories) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'category-helper-card';
        card.dataset.category = category.name;
        card.dataset.weight = category.weight;
        card.dataset.example = category.example;
        const icon = document.createElement('i');
        icon.className = `fas ${category.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('strong');
        title.textContent = category.label;
        const group = document.createElement('span');
        group.textContent = category.group;
        card.append(icon, title, group);
        categoryGrid.append(card);
    }
}
const pickupStatusFlow = ['pending', 'pickup', 'transit', 'arrived', 'completed'];
const pickupStatusMeta = {
    pending: {
        label: 'Menunggu Petugas',
        icon: 'fa-clock',
        description: 'Pengajuan diterima dan sedang menunggu petugas mengambil tugas.',
        nextAction: 'Berikutnya: petugas menerima pickup.'
    },
    pickup: {
        label: 'Petugas Ditugaskan',
        icon: 'fa-truck-pickup',
        description: 'Petugas sudah mengambil tugas dan akan menuju alamat penjemputan.',
        nextAction: 'Berikutnya: barang dijemput dan dibawa menuju hub.'
    },
    transit: {
        label: 'Menuju Hub',
        icon: 'fa-truck-fast',
        description: 'Sampah sedang dalam perjalanan menuju Recycling Hub.',
        nextAction: 'Berikutnya: barang diterima oleh hub.'
    },
    arrived: {
        label: 'Tiba di Hub',
        icon: 'fa-clipboard-check',
        description: 'Sampah sudah tiba di hub dan menunggu verifikasi berat aktual.',
        nextAction: 'Berikutnya, Petugas mencatat berat aktual.'
    },
    completed: {
        label: 'Selesai',
        icon: 'fa-circle-check',
        description: 'Penjemputan selesai. Status pembayaran ditampilkan terpisah.',
        nextAction: 'Proses selesai.'
    },
    cancelled: {
        label: 'Dibatalkan',
        icon: 'fa-ban',
        description: 'Pengajuan dibatalkan sebelum petugas mengambil tugas.',
        nextAction: 'Buat pengajuan baru jika masih ingin menyetor sampah.'
    }
};

function pickupPaymentLabel(item) {
    if (item.reward_amount == null) {
        return item.payment_status === 'requires_reconciliation' ? 'Perlu rekonsiliasi' : 'Belum ditimbang';
    }
    if (item.payment_status === 'not_due') { return 'Tanpa pembayaran'; }
    return item.payment_status === 'paid' ? 'Pembayaran tercatat' : 'Menunggu pembayaran';
}

function pickupRewardLabel(item) {
    const format = amount => new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', maximumFractionDigits: 2
    }).format(amount);
    if (item.reward_amount != null) { return 'Final ' + format(Number(item.reward_amount)); }
    if (item.payment_status === 'requires_reconciliation') { return 'Catatan historis'; }
    if (item.eco_reward == null) { return '—'; }
    return 'Estimasi ' + format(Math.max(0, Number(item.eco_reward) - Number(item.processing_fee)));
}

function getPickupStatusMeta(status) {
    return pickupStatusMeta[status] || pickupStatusMeta.pending;
}

function getStatusBadgeClass(status) {
    if (status === 'pickup') { return 'pickup'; }
    if (status === 'transit') { return 'transit'; }
    if (status === 'arrived') { return 'arrived'; }
    if (status === 'completed') { return 'completed'; }
    if (status === 'cancelled') { return 'cancelled'; }
    return 'pending';
}

// Tab Switching
const tabs = document.querySelectorAll('.hub-tab');
const panes = document.querySelectorAll('.tab-pane');
const workspaceLabel = document.getElementById('workspace-label');
const headerMenus = document.querySelectorAll('.sp-header-menu');

for (const menu of headerMenus) {
    menu.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !menu.open) { return; }
        menu.open = false;
        menu.querySelector('summary').focus();
    });
}
document.addEventListener('click', event => {
    for (const menu of headerMenus) {
        if (!menu.contains(event.target) || event.target.closest('[data-sp-user-tab]')) { menu.open = false; }
    }
});

tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        tabs.forEach(t => t.removeAttribute('aria-current'));
        tab.setAttribute('aria-current', 'page');

        const target = tab.dataset.target;
        if (target === 'lacak-pickup') {
            const historyTab = document.querySelector('.hub-tab[data-target="riwayat-payout"]');
            historyTab.classList.add('active');
            historyTab.setAttribute('aria-current', 'page');
            tab.removeAttribute('aria-current');
        }
        workspaceLabel.textContent = target === 'beranda' ? workspaceLabel.dataset.greeting : tab.textContent.trim();
        panes.forEach(p => p.classList.remove('active'));

        const targetPane = document.getElementById(target);
        if (targetPane) {
            targetPane.classList.add('active');
        }
        if (target !== 'lacak-pickup') { resetTracking(); }
        window.dispatchEvent(new CustomEvent('sampira:user-view', {detail: target}));
        window.scrollTo({top: 0, behavior: 'instant'});

        // Close sidebar on mobile
        closeSidebar();
    });
});

// Mobile Sidebar Toggle
const hamburgerBtn = document.getElementById('mobileMenuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebar() {
    if (sidebar) { sidebar.classList.add('active'); }
    if (sidebarOverlay) { sidebarOverlay.style.display = 'block'; }
    document.body.style.overflow = 'hidden';
    if (hamburgerBtn) { hamburgerBtn.setAttribute('aria-expanded', 'true'); }
}

function closeSidebar() {
    if (sidebar) { sidebar.classList.remove('active'); }
    if (sidebarOverlay) { sidebarOverlay.style.display = 'none'; }
    document.body.style.overflow = '';
    if (hamburgerBtn) { hamburgerBtn.setAttribute('aria-expanded', 'false'); }
}

if (hamburgerBtn) { hamburgerBtn.addEventListener('click', openSidebar); }
if (sidebarOverlay) { sidebarOverlay.addEventListener('click', closeSidebar); }
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar?.classList.contains('active')) {
        closeSidebar();
        if (hamburgerBtn) { hamburgerBtn.focus(); }
    }
});

// Payout Preview Calculation

let previewRequest = 0;
function pickupItems(){return [...selectedPickupItems].map(([category,weight])=>({category,weight_kg:Number(weight)}));}
function renderPickupItems(){
 const host=document.getElementById('pickup-category-items');if(!host){ return; }
 host.innerHTML=pickupItems().map(item=>`<label class="pickup-item-weight">${escapePortalHTML(categoryConfig[item.category]?.label||item.category)}<span><input type="number" min="0.01" max="99999.99" step="0.01" required value="${item.weight_kg||''}" data-item-category="${escapePortalHTML(item.category)}" aria-label="Berat ${escapePortalHTML(item.category)}"> kg</span><small data-item-estimate="${escapePortalHTML(item.category)}">Estimasi reward menunggu berat valid.</small></label>`).join('');
 document.querySelectorAll('.category-helper-card').forEach(card=>{const active=selectedPickupItems.has(card.dataset.category);card.classList.toggle('active',active);card.setAttribute('aria-pressed',String(active));});
 updatePickupTotal();
}
function updatePickupTotal(){
 const total=pickupItems().reduce((sum,item)=>sum+(Number.isFinite(item.weight_kg)?item.weight_kg:0),0);
 document.getElementById('form-waste-weight').value=(Math.round(total*100)/100)||'';
 document.getElementById('form-waste-category').value=pickupItems()[0]?.category||'';
}
async function calculateFormPreview(){
 const request=++previewRequest,fields=['preview-gross-reward','preview-fee','preview-net-reward','preview-carbon'];
 fields.forEach(id=>document.getElementById(id).textContent='—');
 const items=pickupItems();if(!items.length||items.some(item=>!Number.isFinite(item.weight_kg)||item.weight_kg<=0||item.weight_kg>99999.99||Math.abs(item.weight_kg*100-Math.round(item.weight_kg*100))>.00001)){ return; }
 try{
  const response=await portalFetch('/api/ecorecycle/estimate_reward',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:items[0].category,weight_kg:items[0].weight_kg,items:JSON.stringify(items)})});
  if(!response.ok){ throw new Error('Estimasi belum tersedia'); }const {data}=await response.json();
  if(request!==previewRequest){ return; }
  multiCategoryBackendReady=Array.isArray(data.items);
  const weightInput=document.getElementById('form-waste-weight');weightInput.setCustomValidity(items.length>1&&!multiCategoryBackendReady?'Layanan beberapa kategori belum aktif. Pilih satu kategori atau tunggu aktivasi Backend.':'');
  if(items.length>1&&!multiCategoryBackendReady){document.getElementById('preview-net-reward').textContent='Layanan beberapa kategori belum aktif';return;}
  const currency=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:2});
  const values=[currency.format(data.total_estimate),currency.format(data.processing_fee),currency.format(data.net_estimate),Number(data.co2_saved).toFixed(1)];
  fields.forEach((id,i)=>document.getElementById(id).textContent=values[i]);
  document.querySelectorAll('[data-item-estimate]').forEach(output=>{const row=data.items?.find(item=>item.category===output.dataset.itemEstimate);output.textContent='Estimasi reward bersih '+currency.format(row?Math.max(0,row.eco_reward-row.processing_fee):data.net_estimate);});
 }catch{if(request===previewRequest){ document.getElementById('preview-net-reward').textContent='Estimasi belum tersedia'; }}
}

const formWeight = document.getElementById('form-waste-weight');
const formCat = document.getElementById('form-waste-category');

if (formWeight) { formWeight.addEventListener('input', calculateFormPreview); }

function syncCategoryCards(category){selectedPickupItems=new Map([[category,Number(formWeight.value)||1]]);renderPickupItems();}
if(categoryGrid){
 const hint=document.createElement('p');hint.className='pickup-items-hint';hint.textContent='Pilih satu atau beberapa kategori. Isi estimasi berat masing-masing dalam kg.';categoryGrid.before(hint);
 const host=document.createElement('div');host.id='pickup-category-items';categoryGrid.after(host);
 host.addEventListener('input',event=>{if(!event.target.matches('[data-item-category]')){ return; }selectedPickupItems.set(event.target.dataset.itemCategory,Number(event.target.value));updatePickupTotal();void calculateFormPreview();});
 document.querySelectorAll('.category-helper-card').forEach(card=>card.addEventListener('click',()=>{const category=card.dataset.category;if(selectedPickupItems.has(category)){ selectedPickupItems.delete(category); }else { selectedPickupItems.set(category,Number(card.dataset.weight)||1); }renderPickupItems();void calculateFormPreview();}));
 formWeight.readOnly=true;renderPickupItems();
}
if(formCat){ formCat.addEventListener('change',()=>{syncCategoryCards(formCat.value);void calculateFormPreview();}); }


const photoInput = document.getElementById('form-waste-photo');
const photoPreviewCard = document.getElementById('photo-preview-card');
const photoPreviewImg = document.getElementById('photo-preview-img');
const removePhotoBtn = document.getElementById('remove-photo-btn');

function clearPhotoPreview() {
    if (photoInput) { photoInput.value = ''; }
    if (photoPreviewImg) { photoPreviewImg.removeAttribute('src'); }
    if (photoPreviewCard) { photoPreviewCard.style.display = 'none'; }
}

if (photoInput) {
    photoInput.addEventListener('change', () => {
        const file = photoInput.files[0];
        if (!file) {
            clearPhotoPreview();
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            clearPhotoPreview();
            void Swal.fire({
                icon: 'warning',
                title: 'Format Foto Tidak Sesuai',
                text: 'Gunakan foto JPG, PNG, atau WEBP.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            clearPhotoPreview();
            void Swal.fire({
                icon: 'warning',
                title: 'Foto Terlalu Besar',
                text: 'Ukuran foto maksimal 5 MB.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (photoPreviewImg && photoPreviewCard) {
            photoPreviewImg.src = URL.createObjectURL(file);
            photoPreviewCard.style.display = 'block';
        }
    });
}

if (removePhotoBtn) { removePhotoBtn.addEventListener('click', clearPhotoPreview); }

// Logout
function logoutUser() {
    logoutPortal();
}

function openTrackingDetail(trackingNumber) {
    const trackInput = document.getElementById('track-number-search');
    if (trackInput) { trackInput.value = trackingNumber; }
    const trackingTab = document.querySelector('.hub-tab[data-target="lacak-pickup"]');
    if (trackingTab) { trackingTab.click(); }
    searchTracking();
}


let loadingPickupEdit = false;

function showPickupEditConflict() {
    void Swal.fire({icon: 'warning', title: 'Pengajuan sudah berubah', text: 'Pengajuan ini sudah tidak bisa diedit. Status terbaru dimuat ulang.'});
    void loadDashboardData();
}

function splitPickupDescription(value = '') {
    const match = /^Judul: ([^\r\n]+)\r?\n\r?\n([\s\S]*)$/.exec(value);
    return match ? {title: match[1], description: match[2]} : {title: '', description: value};
}

function formatPickupDescription(title, description) {
    return title ? `Judul: ${title}\n\n${description}` : description;
}

async function editPendingPickup(trackingNumber) {
    if (loadingPickupEdit) { return; }
    loadingPickupEdit = true;
    let item;
    try {
        const query = new URLSearchParams({tracking_number: trackingNumber});
        const response = await portalFetch('/api/ecorecycle/pickup_status?' + query);
        if (response.status === 401) { return; }
        const {data, message} = await response.json();
        if (!response.ok || !data) { throw new Error(message || 'Detail pickup belum tersedia.'); }
        item = data;
    } catch (error) {
        void Swal.fire({icon: 'error', title: 'Gagal membuka pengajuan', text: error.message});
        return;
    } finally {
        loadingPickupEdit = false;
    }
    if (item.status !== 'pending') {
        showPickupEditConflict();
        return;
    }
    let editPicker;
    let editOpen = true;
    const {title: originalTitle, description: originalDescription} = splitPickupDescription(item.item_description || '');
    const result = await Swal.fire({
        title: 'Edit Pengajuan Pending',
        html: `
            <div style="text-align:left;">
                <label class="swal-form-label" for="edit-request-title">Judul Permintaan</label>
                <input id="edit-request-title" class="swal2-input" maxlength="120" style="margin:0 0 10px; width:100%;" value="${escapePortalHTML(originalTitle)}">
                <label class="swal-form-label" for="edit-item-description">Deskripsi barang</label>
                <textarea id="edit-item-description" class="swal2-textarea" style="margin:0 0 10px; width:100%;">${escapePortalHTML(originalDescription)}</textarea>
                <label class="swal-form-label">Alamat penjemputan</label>
                <textarea id="edit-pickup-address" class="swal2-textarea" style="margin:0 0 10px; width:100%;">${escapePortalHTML(item.pickup_address || '')}</textarea>
                <div id="edit-pickup-location"></div>
                <label class="swal-form-label">Nomor HP / WhatsApp</label>
                <input id="edit-contact-phone" class="swal2-input" style="margin:0 0 10px; width:100%;" value="${escapePortalHTML(item.contact_phone || '')}">
                <label class="swal-form-label">Kategori</label>
                <select ${item.items?.length?'hidden':''} id="edit-category" class="swal2-select" style="margin:0 0 10px; width:100%;">
                    ${Object.keys(categoryConfig).map(category => ("<option value=\"" + String(category) + "\" " + String(item.category_name === category ? 'selected' : '') + ">" + String(categoryConfig[category].label) + "</option>")).join('')}
                </select>
                <label class="swal-form-label">Estimasi berat (KG)</label>
                ${item.items?.length?("<div id=\"edit-category-items\">" + String(item.items.map(row=>("<label>" + String(escapePortalHTML(categoryConfig[row.category]?.label||row.category)) + " (kg)<input type=\"number\" min=\"0.01\" max=\"99999.99\" step=\"0.01\" data-edit-item=\"" + String(escapePortalHTML(row.category)) + "\" value=\"" + String(row.weight_kg) + "\"></label>")).join('')) + "</div>"):''}
                <input ${item.items?.length?'hidden':''} id="edit-weight" type="number" min="0.01" max="99999.99" step="0.01" class="swal2-input" style="margin:0; width:100%;" value="${item.weight_kg || ''}">
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Simpan Perubahan',
        cancelButtonText: 'Batal',
        didOpen: async popup => {
            const host = popup.querySelector('#edit-pickup-location');
            try {
                const {mountLocationPicker} = await locationMaps;
                if (!editOpen || !host.isConnected) { return; }
                editPicker = mountLocationPicker(host, {
                    title: 'Titik Lokasi Penjemputan', prefix: 'edit-pickup', digits: 7, saved: item
                });
            } catch {
                host.textContent = 'Peta belum tersedia. Titik yang tersimpan akan dipertahankan.';
            }
        },
        willClose: () => {
            editOpen = false;
            editPicker?.dispose();
        },
        preConfirm: () => {
            const title = document.getElementById('edit-request-title').value.trim();
            const description = document.getElementById('edit-item-description').value.trim();
            const payload = {
                tracking_number: item.tracking_number,
                item_description: formatPickupDescription(title, description),
                pickup_address: document.getElementById('edit-pickup-address').value.trim(),
                contact_phone: document.getElementById('edit-contact-phone').value.trim(),
                category: document.getElementById('edit-category').value,
                weight_kg: Number.parseFloat(document.getElementById('edit-weight').value)
            };
            if(item.items?.length){const items=[...document.querySelectorAll('[data-edit-item]')].map(input=>({category:input.dataset.editItem,weight_kg:Number(input.value)}));if(items.some(row=>!row.weight_kg||row.weight_kg<=0)){Swal.showValidationMessage('Isi berat tiap kategori.');return false;}payload.items=JSON.stringify(items);payload.category=items[0].category;payload.weight_kg=Math.round(items.reduce((sum,row)=>sum+row.weight_kg,0)*100)/100;}
            if (originalTitle && !title) {
                Swal.showValidationMessage('Isi judul permintaan.');
                return false;
            }
            if (description.length < 10 || payload.pickup_address.length < 15 || !payload.contact_phone || !payload.weight_kg || payload.weight_kg <= 0) {
                Swal.showValidationMessage('Lengkapi deskripsi, alamat, kontak, dan berat dengan benar.');
                return undefined;
            }
            if (new TextEncoder().encode(payload.item_description).length > 2000) {
                Swal.showValidationMessage('Judul dan deskripsi terlalu panjang. Persingkat deskripsi.');
                return false;
            }
            const fields = editPicker ? editPicker.fields() : {};
            return fields ? {...payload, ...fields} : false;
        }
    });

    if (!result.isConfirmed) { return; }
    const headers = {'Content-Type': 'application/json'};

    portalFetch('api/ecorecycle/update_pickup', {
        method: 'POST',
        headers,
        body: JSON.stringify(result.value)
    })
    .then(async res => ({code: res.status, data: await res.json()}))
    .then(({code, data}) => {
        if (data.status === 'success') {
            void Swal.fire({ icon: 'success', title: 'Pengajuan Diperbarui', text: 'Perubahan berhasil disimpan sebelum pickup diambil petugas.', confirmButtonColor: '#10b981' });
            void loadDashboardData();
        } else if (code === 409) {
            showPickupEditConflict();
        } else {
            void Swal.fire({ icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#10b981' });
        }
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Kesalahan', text: 'Gagal menghubungi server.', confirmButtonColor: '#10b981' }));
}

async function cancelPendingPickup(trackingNumber) {
    const result = await Swal.fire({
        title: 'Batalkan Pengajuan?',
        html: `
            <p style="color:#475569;">Pengajuan <strong>${escapePortalHTML(trackingNumber)}</strong> hanya bisa dibatalkan selama masih menunggu petugas.</p>
            <textarea id="cancel-reason" class="swal2-textarea" placeholder="Alasan pembatalan (opsional)" style="width:100%; margin:10px 0 0;"></textarea>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Batalkan',
        cancelButtonText: 'Kembali'
    });
    if (!result.isConfirmed) { return; }

    const headers = {'Content-Type': 'application/json'};

    portalFetch('api/ecorecycle/cancel_pickup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            tracking_number: trackingNumber,
            reason: document.getElementById('cancel-reason') ? document.getElementById('cancel-reason').value.trim() : ''
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            void Swal.fire({ icon: 'success', title: 'Pengajuan Dibatalkan', text: 'Pickup dibatalkan dan tidak akan masuk antrean petugas.', confirmButtonColor: '#10b981' });
            void loadDashboardData();
        } else {
            void Swal.fire({ icon: 'error', title: 'Gagal', text: data.message, confirmButtonColor: '#10b981' });
        }
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Kesalahan', text: 'Gagal menghubungi server.', confirmButtonColor: '#10b981' }));
}

function setInputValue(id, value) {
    const field = document.getElementById(id);
    if (field) { field.value = value || ''; }
}

function populateProfileFields(profile) {
    if (!profile) { return; }
    setInputValue('settings-name', profile.name);
    setInputValue('settings-email', profile.email);
    setInputValue('settings-phone', profile.phone);
    setInputValue('settings-address', profile.address);
    setInputValue('settings-payout-method', profile.payout_method);
    setInputValue('settings-payout-name', profile.payout_account_name);
    setInputValue('settings-payout-number', profile.payout_account_number);

    setInputValue('form-donor-name', profile.name);
    setInputValue('form-donor-phone', profile.phone);
    setInputValue('form-pickup-address', profile.address);
}

const historyDate = new Intl.DateTimeFormat('id-ID', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta'});

function pickupHistoryTitle(item) {
    return splitPickupDescription(item.item_description || '').title || 'Penjemputan ' + (item.category_name || 'sampah');
}

function renderTrackingBreakdown(item){            const breakdown=document.getElementById('track-item-breakdown');breakdown.replaceChildren();
            for(const row of item.items||[]){const line=document.createElement('p');line.textContent=`${categoryConfig[row.category]?.label||row.category} · ${row.final_weight_kg??row.weight_kg} kg · ${row.final_weight_kg==null?'Estimasi':'Terverifikasi'} Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0,(row.final_eco_reward??row.eco_reward)-(row.final_processing_fee??row.processing_fee)))}`;breakdown.append(line);}
}
function historyWeight(item,weight){return (item.final_weight_kg==null?'± ':'')+weight+' kg';}
function renderUserHistoryCard(item) {
    const category = categoryConfig[item.category_name];
    const weight = Number.parseFloat(item.final_weight_kg ?? item.weight_kg);
    const timestamp = Date.parse(item.created_at);
    const statusMeta = getPickupStatusMeta(item.status);
    const badgeClass = getStatusBadgeClass(item.status);
    const photo = /^\/?uploads\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(item.photo_url || '')
        ? '/' + item.photo_url.replace(/^\//, '') : '';
    return `
        <li class="sp-history-card">
            <span class="sp-history-thumb" aria-hidden="true">
                <i class="fas ${category?.icon || 'fa-truck'}"></i>
                ${photo ? ("<img src=\"" + String(escapePortalHTML(photo)) + "\" alt=\"\" loading=\"lazy\" onerror=\"this.hidden=true\">") : ''}
            </span>
            <div class="sp-history-card-copy">
                <h3>${escapePortalHTML(pickupHistoryTitle(item))}</h3>
                <p class="sp-history-reference">${escapePortalHTML(item.tracking_number)}</p>
                <p class="sp-history-meta">
                    <span><i class="far fa-calendar" aria-hidden="true"></i> ${Number.isFinite(timestamp) ? historyDate.format(timestamp) + ' WIB' : 'Tanggal belum tersedia'}</span>
                    <span><i class="fas fa-weight-hanging" aria-hidden="true"></i> ${Number.isFinite(weight) ? historyWeight(item,weight) : '—'}</span>
                    <span><i class="fas ${category?.icon || 'fa-tag'}" aria-hidden="true"></i> ${escapePortalHTML(category?.label || item.category_name || '—')}</span>
                </p>
                <p class="sp-history-reward">${pickupRewardLabel(item)} · ${pickupPaymentLabel(item)}</p>
            </div>
            <div class="sp-history-card-actions">
                <span class="status-badge ${badgeClass}"><i class="fas ${statusMeta.icon}" aria-hidden="true"></i> ${statusMeta.label}</span>
                <button type="button" class="sp-button sp-button--quiet" data-tracking="${escapePortalHTML(item.tracking_number)}" onclick="openTrackingDetail(this.dataset.tracking)">Detail <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
            </div>
        </li>
    `;
}

function renderUserActivePickup(item) {
    if (['completed', 'cancelled'].includes(item.status)) { return ''; }
    const weight = Number.parseFloat(item.weight_kg);
    const statusMeta = getPickupStatusMeta(item.status);
    const badgeClass = getStatusBadgeClass(item.status);
    const pendingActions = item.status === 'pending' ? `
                        <div class="sp-request-actions">
                        <button type="button" class="btn btn-outline pickup-flow-track-btn" data-edit-tracking="${escapePortalHTML(item.tracking_number)}" onclick="editPendingPickup(this.dataset.editTracking)">Edit</button>
                        <button type="button" class="btn btn-outline pickup-flow-track-btn danger" data-tracking="${escapePortalHTML(item.tracking_number)}" onclick="cancelPendingPickup(this.dataset.tracking)">Batalkan</button>
                        </div>
                    ` : '';
    return `
                        <div class="active-pickup-card pickup-flow-card">
                            <div class="pickup-flow-card-main">
                                <span class="sp-request-eyebrow">Penjemputan aktif</span>
                                <h4>${escapePortalHTML(item.category_name)} <span>· ${weight} kg</span></h4>
                                <p class="sp-request-tracking">${escapePortalHTML(item.tracking_number)}</p>
                            </div>
                            <div class="pickup-flow-card-status">
                                <div class="pickup-flow-icon"><i class="fas ${statusMeta.icon}"></i></div>
                                <div class="pickup-flow-copy">
                                    <span class="status-badge ${badgeClass}">${statusMeta.label}</span>
                                    <p>${statusMeta.description}</p>
                                    <small>${statusMeta.nextAction}</small>
                                </div>
                                <button type="button" class="btn btn-outline pickup-flow-track-btn" data-tracking="${escapePortalHTML(item.tracking_number)}" onclick="openTrackingDetail(this.dataset.tracking)">Lacak</button>
                                ${pendingActions}
                            </div>
                        </div>
                    `;
}

function summarizeUserPickups(pickups) {
    const summary = {totalWeight: 0, totalCarbon: 0, totalReward: 0, activeCount: 0, completedCount: 0, activeHtml: '', monthlyWeights: {}};
    for (const item of pickups) {
        if (item.status === 'completed') { summary.completedCount++; }
        else if (item.status !== 'cancelled') { summary.activeCount++; }
        if (item.status === 'completed' && item.final_weight_kg != null) {
            const weight = Number(item.final_weight_kg);
            summary.totalWeight += weight;
            summary.totalCarbon += weight * 2.5;
            const verifiedDate = new Date(item.verified_at || item.created_at);
            if (Number.isFinite(verifiedDate.valueOf())) {
                const parts = new Intl.DateTimeFormat('en-US', {
                    year:'numeric',month:'2-digit',timeZone:'Asia/Jakarta'
                }).formatToParts(verifiedDate);
                const month = parts.find(part => part.type === 'year').value + '-' +
                    parts.find(part => part.type === 'month').value;
                summary.monthlyWeights[month] = (summary.monthlyWeights[month] || 0) + weight;
            }
        }
        if (item.payment_status === 'paid') { summary.totalReward += Number(item.reward_amount); }
        summary.activeHtml += renderUserActivePickup(item);
    }
    return summary;
}

function setDashboardMarkup(id, markup, emptyMarkup) {
    const element = document.getElementById(id);
    if (element) { element.innerHTML = markup || emptyMarkup; }
}

function showPickupNotification(item) {
    const message = document.getElementById('notification-message');
    document.getElementById('sp-notification-dot').hidden = !item;
    message.textContent = item
        ? `Penjemputan ${item.tracking_number} · ${getPickupStatusMeta(item.status).label}.`
        : 'Tidak ada pemberitahuan terbaru.';
}

const historyFilters = {
    status: document.getElementById('pickup-history-status'),
    category_name: document.getElementById('pickup-history-category')
};
const historyPrev = document.getElementById('pickup-history-prev');
const historyNext = document.getElementById('pickup-history-next');
const historyMessage = document.getElementById('pickup-history-message');
const historySearch = document.getElementById('pickup-history-search');
const historySort = document.getElementById('pickup-history-sort');
const historyPages = document.getElementById('pickup-history-pages');
let pickupHistory = [];
let pickupPage = 0;

function renderPickupHistory() {
    const pageSize = 5;
    const query = historySearch.value.trim().toLocaleLowerCase('id-ID');
    const matching = pickupHistory.filter(item => Object.entries(historyFilters)
        .every(([key, filter]) => !filter.value || item[key] === filter.value || (key==='category_name' && item.items?.some(row=>row.category===filter.value))) &&
        [pickupHistoryTitle(item), item.tracking_number].some(value => String(value).toLocaleLowerCase('id-ID').includes(query)));
    const direction = historySort.value === 'oldest' ? 1 : -1;
    matching.sort((first, second) => direction * ((Date.parse(first.created_at) || 0) - (Date.parse(second.created_at) || 0)));
    const pageCount = Math.ceil(matching.length / pageSize);
    pickupPage = Math.max(0, Math.min(pickupPage, pageCount - 1));
    const offset = pickupPage * pageSize;
    const page = matching.slice(offset, offset + pageSize);
    setDashboardMarkup('payout-history-table-body', page.map(renderUserHistoryCard).join(''),
        '<li class="sp-panel">Tidak ada penjemputan untuk pilihan ini.</li>');
    historyMessage.textContent = matching.length ? `Menampilkan ${offset + 1}–${offset + page.length} dari ${matching.length} penjemputan` : '0 penjemputan';
    historyPages.replaceChildren();
    const firstPage = Math.max(0, Math.min(pickupPage - 1, pageCount - 3));
    for (let index = firstPage; index < Math.min(pageCount, firstPage + 3); index++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sp-button sp-button--quiet';
        button.textContent = index + 1;
        button.dataset.page = index;
        button.setAttribute('aria-label', 'Halaman ' + (index + 1));
        if (index === pickupPage) { button.setAttribute('aria-current', 'page'); }
        historyPages.append(button);
    }
    historyPrev.disabled = pickupPage === 0;
    historyNext.disabled = offset + pageSize >= matching.length;
}

function resetPickupHistoryPage() {
    pickupPage = 0;
    renderPickupHistory();
}
for (const filter of [...Object.values(historyFilters), historySort]) { filter.addEventListener('change', resetPickupHistoryPage); }
historySearch.addEventListener('input', resetPickupHistoryPage);
historyPages.addEventListener('click', event => {
    const page = event.target.closest('[data-page]');
    if (!page) { return; }
    pickupPage = Number(page.dataset.page);
    renderPickupHistory();
    historyPages.querySelector('[aria-current=page]')?.focus();
});
historyPrev.addEventListener('click', () => { pickupPage--; renderPickupHistory(); });
historyNext.addEventListener('click', () => { pickupPage++; renderPickupHistory(); });

function renderUserDashboard(pickups) {
    const summary = summarizeUserPickups(pickups);
    const userLevel = window.sampiraContributionLevel || 'Memuat level…';
    document.getElementById('user-display-level').textContent = userLevel;
    document.getElementById('profile-avatar').dataset.level = userLevel;
    document.getElementById('metric-total-weight').innerText = summary.totalWeight.toFixed(1);
    document.getElementById('metric-total-carbon').innerText = summary.totalCarbon.toFixed(1);
    document.getElementById('metric-total-reward').innerText = new Intl.NumberFormat('id-ID', {style: 'currency', currency: 'IDR', minimumFractionDigits: 0}).format(summary.totalReward);
    document.getElementById('sp-home-paid-reward').textContent = document.getElementById('metric-total-reward').textContent;
    document.getElementById('metric-active-pickups').textContent = summary.activeCount;
    document.getElementById('metric-completed-pickups').textContent = summary.completedCount;
    const latest = pickups.reduce((current, item) =>
        !current || Date.parse(item.created_at) > Date.parse(current.created_at) ? item : current, null);
    document.getElementById('sp-home-latest-status').textContent = latest ? getPickupStatusMeta(latest.status).label : 'Belum ada';
    pickupHistory = pickups;
    for (const [key, filter] of Object.entries(historyFilters)) {
        const selected = filter.value;
        const values = Array.from(new Set(pickups.flatMap(item => key==='category_name' && item.items?.length ? item.items.map(row=>row.category) : [item[key]]).filter(Boolean)));
        filter.replaceChildren(filter.options[0], ...values.map(value => new Option(
            key === 'status' ? getPickupStatusMeta(value).label : value, value)));
        if (values.includes(selected)) { filter.value = selected; }
    }
    renderPickupHistory();
    window.dispatchEvent(new CustomEvent('sampira:user-pickups', {detail: pickups}));
    setDashboardMarkup('active-pickups-container', summary.activeHtml, '<div style="text-align:center; padding:24px;">Tidak ada penjemputan sampah aktif saat ini.</div>');
    showPickupNotification(pickups.find(item => !['completed', 'cancelled'].includes(item.status)));
    renderChart(summary.monthlyWeights);
}

function renderAccountName(name) {
    document.getElementById('hero-welcome').innerText = `Halo, ${name}!`;
    document.getElementById('user-display-name').innerText = name;
    document.getElementById('profile-avatar').innerText = name.substring(0, 2).toUpperCase();
    workspaceLabel.dataset.greeting = 'Beranda Anda';
    if (document.getElementById('beranda').classList.contains('active')) {
        workspaceLabel.textContent = workspaceLabel.dataset.greeting;
    }
}

workspaceLabel.dataset.greeting = workspaceLabel.textContent;

// 4. Load User Data & Pickups
let dashboardLoadSequence = 0;
let dashboardProfileLoaded = false;
const dashboardStatus = document.getElementById('dashboard-load-status');
const dashboardRetry = document.getElementById('dashboard-retry');
async function loadDashboardData() {
    const run = ++dashboardLoadSequence;
    dashboardStatus.textContent = 'Memuat data penjemputan…';
    dashboardStatus.parentElement.hidden = false;
    dashboardRetry.hidden = true;
    try {
        const user = await portalUser('user');
        if (run !== dashboardLoadSequence) { return; }
        if (!user) { throw new Error('Profile unavailable'); }

        // Set Profile Info
        renderAccountName(user.name);

        if (!dashboardProfileLoaded) {
            populateProfileFields(user);
            dashboardProfileLoaded = true;
        }

        // Fetch Pickups from API
        const response = await portalFetch('/api/ecorecycle/list_pickups?type=user', {
            signal:AbortSignal.timeout(15000)
        });
        if (run !== dashboardLoadSequence) { return; }
        if (response.status === 401 || response.status === 403) { logoutPortal(false); return; }
        const data = await response.json();
        if (run !== dashboardLoadSequence) { return; }
        if (!response.ok || data.status !== 'success' || !Array.isArray(data.data)) { throw new Error('Pickup data unavailable'); }
        renderUserDashboard(data.data);
        dashboardStatus.parentElement.hidden = true;
    } catch {
        if (run !== dashboardLoadSequence) { return; }
        dashboardStatus.textContent = 'Data penjemputan belum dapat dimuat. Coba lagi.';
        dashboardRetry.hidden = false;
        pickupHistory=[];
        renderPickupHistory();
        historyMessage.textContent = 'Riwayat penjemputan belum dapat dimuat.';
        document.getElementById('active-pickups-container').textContent = 'Status permintaan belum dapat dimuat.';
        for (const id of ['metric-total-weight','metric-total-carbon','metric-total-reward','sp-home-paid-reward',
            'metric-active-pickups','metric-completed-pickups','sp-home-latest-status']) {
            document.getElementById(id).textContent = '—';
        }
        monthlyChart?.destroy();
        monthlyChart=null;
        document.querySelector('.sp-monthly-chart').hidden=true;
        const chartStatus=document.getElementById('monthly-waste-empty');
        chartStatus.hidden=false;
        chartStatus.textContent='Data kontribusi belum dapat dimuat.';
        window.dispatchEvent(new Event('sampira:user-pickups-failed'));
    }
}
dashboardRetry.addEventListener('click',loadDashboardData);
window.addEventListener('sampira:session-ended',() => {dashboardLoadSequence++;});
window.addEventListener('sampira:user-view',event => {
    if (event.detail === 'beranda') { void loadDashboardData(); }
});
window.addEventListener('focus',() => {
    if (document.getElementById('beranda').classList.contains('active') && !document.hidden) { void loadDashboardData(); }
});

// 5. Submit New Pickup Form
const pickupForm = document.getElementById('pickup-request-form');
if (pickupForm) {
    let picker;
    let pendingRequest;
    const submit = pickupForm.querySelector('button[type="submit"]');
    const host = document.getElementById('pickup-location-picker');
    const requestTitle = document.getElementById('form-request-title');
    document.addEventListener('DOMContentLoaded', async () => {
      try { const {mountLocationPicker}=await locationMaps;
        picker = mountLocationPicker(host, {title: 'Titik Lokasi Penjemputan', prefix: 'pickup', digits: 7, compact: true, addressField: document.getElementById('form-pickup-address')});
      } catch { host.textContent='Peta belum tersedia. Kamu dapat mengirim alamat lengkap saja.'; }
    },{once:true});
    pickupForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (submit.disabled) { return; }
        if(pickupItems().length>1&&!multiCategoryBackendReady){void Swal.fire({icon:'warning',title:'Layanan beberapa kategori belum siap',text:'Tunggu estimasi berhasil atau aktivasi Backend terbaru.'});return;}
        const btn = submit;
        const originalHtml = btn.innerHTML;

        const phone = document.getElementById('form-donor-phone').value.trim();
        const address = document.getElementById('form-pickup-address').value.trim();
        const description = document.getElementById('form-item-description').value.trim();
        const weight = Number.parseFloat(document.getElementById('form-waste-weight').value);
        const title = requestTitle.value.trim();
        if (!title) {
            requestTitle.value = '';
            requestTitle.reportValidity();
            return;
        }
        const itemDescription = formatPickupDescription(title, description);
        if (new TextEncoder().encode(itemDescription).length > 2000) {
            void Swal.fire({icon: 'warning', title: 'Deskripsi terlalu panjang', text: 'Persingkat judul atau deskripsi sampah.'});
            return;
        }

        if (!/^(\+62|62|0)8\d{8,13}$/.test(phone.replace(/[\s-]/g, ''))) {
            void Swal.fire({
                icon: 'warning',
                title: 'Nomor Kontak Belum Valid',
                text: 'Masukkan nomor WhatsApp Indonesia yang aktif.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (address.length < 15 || description.length < 10 || !weight || weight <= 0) {
            void Swal.fire({
                icon: 'warning',
                title: 'Data Belum Lengkap',
                text: 'Pastikan alamat, deskripsi barang, dan berat sudah diisi dengan benar.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        const fields = picker ? picker.fields() : {};
        if (!fields) { return; }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('item_description', itemDescription);
        formData.append('pickup_address', address);
        formData.append('contact_phone', phone);
        formData.append('weight_kg', weight);
        formData.append('category', document.getElementById('form-waste-category').value);
        formData.append('items',JSON.stringify(pickupItems()));
        for (const [key, value] of Object.entries(fields)) { formData.set(key, value); }

        const photoInput = document.getElementById('form-waste-photo');
        if (photoInput?.files?.length > 0) {
            formData.append('photo', photoInput.files[0]);
        }
        const signature = JSON.stringify([...formData].filter(([name]) => name !== 'photo'));
        const photo = photoInput?.files[0] || null;
        if (pendingRequest?.signature !== signature || pendingRequest.photo !== photo) {
            pendingRequest = {signature, photo, key: crypto.randomUUID()};
        }

        portalFetch('api/ecorecycle/request_pickup', {
            method: 'POST',
            headers: {'Idempotency-Key': pendingRequest.key},
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                pendingRequest = null;
                Swal.fire({
                    icon: 'success',
                    title: 'Permohonan Berhasil!',
                    html: `Nomor Tracking: <strong>${data.data.tracking_number}</strong><br>Petugas kami akan segera menghubungi Anda.`,
                    confirmButtonColor: '#10b981',
                    confirmButtonText: 'Lacak Status'
                }).then(() => {
                    pickupForm.reset();
                    picker?.reset();
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    clearPhotoPreview();
                    selectedPickupItems=new Map([['Small Gadgets',1]]);renderPickupItems();
                    void calculateFormPreview();
                    void loadDashboardData();
                    const trackInput = document.getElementById('track-number-search');
                    if (trackInput) { trackInput.value = data.data.tracking_number; }
                    document.querySelector('.hub-tab[data-target="lacak-pickup"]').click();
                    searchTracking();
                });
            } else {
                void Swal.fire({
                    icon: 'error',
                    title: 'Gagal',
                    text: data.message,
                    confirmButtonColor: '#10b981'
                });
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        })
        .catch(() => {
            void Swal.fire({
                icon: 'error',
                title: 'Kesalahan',
                text: 'Gagal menghubungi server.',
                confirmButtonColor: '#10b981'
            });
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    });
}

// 6. Track Search
let trackingSequence = 0;
let trackingController;
const trackingFeedback=document.getElementById('tracking-feedback');
const trackingSubmit=document.getElementById('tracking-submit');
window.addEventListener('sampira:session-ended', resetTracking);
document.getElementById('tracking-search-form').addEventListener('submit', event => {
    event.preventDefault();
    searchTracking();
});
document.getElementById('track-number-search').addEventListener('input',resetTracking);

function resetTracking() {
    ++trackingSequence;
    trackingController?.abort();
    trackingController=null;
    trackingFeedback.textContent='';
    trackingSubmit.disabled=false;
    clearUserPickupMap();
    const container = document.getElementById('tracking-timeline-container');
    container.style.display = 'none';
    document.getElementById('track-timeline-list').replaceChildren();
}

function searchTracking() {
    const input = document.getElementById('track-number-search');
    const container = document.getElementById('tracking-timeline-container');

    if (!input || !container) { return; }
    const trackingNum = input.value.trim();

    if (trackingNum === '') {
        resetTracking();
        trackingFeedback.textContent='Masukkan nomor tracking penjemputan.';
        input.focus();
        return;
    }

    resetTracking();
    const sequence = trackingSequence;
    trackingController=new AbortController();
    trackingFeedback.textContent='Memuat detail penjemputan…';
    trackingSubmit.disabled=true;
    portalFetch(`api/ecorecycle/pickup_status?tracking_number=${encodeURIComponent(trackingNum)}`, {
        method: 'GET', signal:AbortSignal.any([trackingController.signal,AbortSignal.timeout(15000)])
    })
    .then(async response => ({ok:response.ok,data:await response.json()}))
    .then(async ({ok,data}) => {
        if (sequence !== trackingSequence) { return; }
        if (ok && data.status === 'success') {
            const item = data.data;
            const history = item.history || [];
            await showPickupOnUserMap(item);
            if (sequence !== trackingSequence) return;

            document.getElementById('track-disp-number').innerText = item.tracking_number;
            const requestTitle = document.getElementById('track-disp-title');
            requestTitle.textContent = splitPickupDescription(item.item_description || '').title;
            requestTitle.hidden = !requestTitle.textContent;

            const statusMeta = getPickupStatusMeta(item.status);
            const badgeClass = getStatusBadgeClass(item.status);

            const statusBadge = document.getElementById('track-disp-status');
            statusBadge.className = `status-badge ${badgeClass}`;
            statusBadge.innerText = statusMeta.label;

            document.getElementById('track-disp-detail').innerText = `${item.category_name} • Estimasi ${item.weight_kg} KG` +
                (item.final_weight_kg == null ? "" : ` • Aktual ${item.final_weight_kg} KG`);

            renderTrackingBreakdown(item);
            document.getElementById('track-disp-reward').textContent = [
                pickupRewardLabel(item), pickupPaymentLabel(item), item.payment_reference ? 'Ref. ' + item.payment_reference : ''
            ].filter(Boolean).join(' • ');

            // Populate Timeline
            const timelineList = document.getElementById('track-timeline-list');
            timelineList.innerHTML = '<h3 class="ref-detail-history-title">Perkembangan permintaan</h3>';

            if (history.length === 0) {
                timelineList.innerHTML += '<p style="color:var(--text-secondary);">Belum ada log pelacakan.</p>';
            } else {
                history.forEach(log => {
                    const dateObj = new Date(log.updated_at);
                    const timeStr = `${dateObj.getDate()} ${dateObj.toLocaleString('id-ID', { month: 'short' })} ${dateObj.getFullYear()}, ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                    const logMeta = getPickupStatusMeta(log.status);

                    timelineList.innerHTML += `
                        <div class="timeline-node">
                            <div class="timeline-node-dot"></div>
                            <div class="timeline-node-time">${timeStr}</div>
                            <div class="timeline-node-title">${logMeta.label}</div>
                            <div class="timeline-node-desc">Lokasi: <strong>${escapePortalHTML(log.location)}</strong><br>${log.status === "completed" && item.payment_status === "requires_reconciliation" ? "Catatan historis memerlukan rekonsiliasi pembayaran." : escapePortalHTML(log.notes)}</div>
                        </div>
                    `;
                });
            }

            timelineList.innerHTML += `
                <div class="tracking-next-step">
                    <strong>Langkah berikutnya</strong>
                    <span>${statusMeta.nextAction}</span>
                </div>
            `;

            container.style.display = 'block';
            trackingFeedback.textContent='';
        } else {
            trackingFeedback.textContent='Detail belum tersedia. Periksa nomor tracking dan akses akun Anda.';
        }
    })
    .catch(() => {
        if (sequence !== trackingSequence) { return; }
        trackingFeedback.textContent='Detail penjemputan gagal dimuat. Coba lagi.';
    })
    .finally(() => {
        if (sequence === trackingSequence) { trackingSubmit.disabled=false; }
    });
}

// 7. Update Settings Form
const settingsForm = document.getElementById('settings-profile-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const payload = {
            name: document.getElementById('settings-name').value.trim(),
            phone: document.getElementById('settings-phone').value.trim(),
            address: document.getElementById('settings-address').value.trim(),
            payout_method: document.getElementById('settings-payout-method').value,
            payout_account_name: document.getElementById('settings-payout-name').value.trim(),
            payout_account_number: document.getElementById('settings-payout-number').value.trim()
        };

        if (!payload.name) {
            void Swal.fire({
                icon: 'warning',
                title: 'Nama Belum Diisi',
                text: 'Nama lengkap wajib diisi.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        if (payload.payout_method && payload.payout_method !== 'cash' && (!payload.payout_account_name || !payload.payout_account_number)) {
            void Swal.fire({
                icon: 'warning',
                title: 'Data Payout Belum Lengkap',
                text: 'Isi nama penerima dan nomor rekening/e-wallet untuk metode payout non-tunai.',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        const submitBtn = this.querySelector('button[type="submit"]');
        const originalHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

        portalFetch('api/user/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                populateProfileFields(data.data);
                renderAccountName(data.data.name);
                void Swal.fire({
                    icon: 'success',
                    title: 'Profil Disimpan',
                    text: 'Data tujuan pembayaran tersimpan di profil Anda.',
                    confirmButtonColor: '#10b981'
                });
            } else {
                void Swal.fire({
                    icon: 'error',
                    title: 'Gagal',
                    text: data.message,
                    confirmButtonColor: '#10b981'
                });
            }
        })
        .catch(() => {
            void Swal.fire({
                icon: 'error',
                title: 'Kesalahan',
                text: 'Gagal menghubungi server.',
                confirmButtonColor: '#10b981'
            });
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        });
    });
}

// 8. Render Chart.js
function renderChart(monthlyWeights) {
    const ctx = document.getElementById('monthlyWasteChart');
    if (!ctx) { return; }

    const months = Object.keys(monthlyWeights).sort((a,b)=>a.localeCompare(b));
    const labels = months.map(month => new Date(month+'-01T00:00:00+07:00')
        .toLocaleString('id-ID',{month:'short',year:'numeric',timeZone:'Asia/Jakarta'}));
    const weights = months.map(month => monthlyWeights[month]);

    if (monthlyChart) {
        monthlyChart.destroy();
        monthlyChart = null;
    }
    const hasChart = labels.length > 0 && typeof Chart === 'function';
    ctx.parentElement.hidden = !hasChart;
    const emptyMessage = document.getElementById('monthly-waste-empty');
    emptyMessage.hidden = hasChart;
    emptyMessage.textContent = labels.length
        ? 'Grafik kontribusi tidak dapat dimuat.'
        : 'Grafik akan tampil setelah berat penjemputan diverifikasi.';
    if (!hasChart) { return; }

    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Berat Sampah (KG)',
                data: weights,
                backgroundColor: '#277355',
                borderRadius: 6,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    void loadDashboardData();
    syncCategoryCards(formCat ? formCat.value : 'Small Gadgets');
    void calculateFormPreview();
});
