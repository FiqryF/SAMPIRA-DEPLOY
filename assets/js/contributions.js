import {mountCityData} from './city-datasets.js?v=bandung-2';
import {request} from './facility-api.js';
import {createMap, streetTiles} from './map-core.js?v=phase8';
import {countChart} from './admin-charts.js?v=maps-reader-9';

const $ = (selector, root = document) => root.querySelector(selector);
const money = value => new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:2}).format(value);
const number = value => new Intl.NumberFormat('id-ID', {maximumFractionDigits:2}).format(value);
const date = value => value ? new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(value)) : 'Belum tersedia';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button = (label, attrs = '') => `<button type="button" ${attrs}>${label}</button>`;
const heading = (title, copy, action = '') => `<header class="p9-heading"><div><span class="p9-kicker">SAMPIRA · Kontribusi & layanan</span><h2>${title}</h2><p>${copy}</p></div>${action}</header>`;
const notice = '<p class="p9-note">Voucher <strong>SIMULASI</strong> untuk demonstrasi. Tidak berlaku di merchant nyata. Poin tidak dapat diuangkan.</p>';
const stat = (label, value) => `<div class="p9-stat"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
const badge = label => `<span class="p9-badge">${escape(label)}</span>`;
let ended = false;
window.addEventListener('sampira:session-ended', () => {
    ended=true;
    document.querySelectorAll('.p9-dialog').forEach(item => item.remove());
    for(const root of document.querySelectorAll('.p9')){
        const message=document.createElement('p');message.className='p9-state';message.setAttribute('role','status');
        message.textContent='Sesi berakhir. Silakan masuk kembali untuk mengakses data Anda. ';
        const link=document.createElement('a');link.href='/login';link.textContent='Masuk kembali';message.append(link);
        root.replaceChildren(message);
    }
});

async function api(path, options) {
    if(ended) { throw new Error('Sesi telah berakhir.'); }
    try { const result=await request(path,options); if(ended){ throw new Error('Sesi telah berakhir.'); } return result; }
    catch(error) {
        if(error.status===404) { error.message='Layanan ini belum tersedia pada server. Coba lagi setelah layanan aktif.'; }
        if(!error.status) { error.message='Koneksi belum berhasil. Periksa jaringan lalu coba lagi.'; }
        throw error;
    }
}
const json = (method, body) => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function state(host, message, error=false) { if(ended){ return; } host.textContent=message; host.dataset.error=String(error); }

function dialog(title, markup, submit, label='Simpan') {
    const root=document.createElement('dialog'); root.className='p9-dialog';
    root.innerHTML=`<div class="p9-dialog-head"><h2 id="p9-dialog-title">${escape(title)}</h2>${button('Tutup','data-dialog-close')}</div><form><div data-dialog-body>${markup}</div><p class="p9-state" role="alert" data-dialog-state></p><div class="p9-actions"><button class="p9-primary" type="submit">${label}</button></div></form>`;
    root.setAttribute('aria-labelledby','p9-dialog-title'); document.body.append(root);
    const form=$('form',root), close=$('[data-dialog-close]',root), output=$('[data-dialog-state]',root), send=$('[type=submit]',root);
    let busy=false;
    close.addEventListener('click',()=>root.close());
    root.addEventListener('cancel',event=>{ if(busy){ event.preventDefault(); } });
    root.addEventListener('close',()=>root.remove(),{once:true});
    form.addEventListener('submit',async event=>{
        event.preventDefault(); if(busy){ return; } if(!form.reportValidity()){ return; } busy=true; send.disabled=close.disabled=true; state(output,'Menyimpan…');
        try { const result=await submit(new FormData(form),root); if(result!==false){ root.close(); } }
        catch(error){state(output,error.message||'Permintaan gagal. Coba lagi.',true);}
        finally {busy=false;send.disabled=close.disabled=false;}
    });
    form.addEventListener('invalid',event=>state(output,event.target.validationMessage||'Lengkapi isian wajib.',true),true);
    root.showModal(); return root;
}

// Each paginated list labels its filters as applying to loaded rows only.
function list(host,path,render,{key='id',search,filter}={}) {
    host.innerHTML=`${search?'<div class="p9-toolbar"><label>Cari pada data dimuat<input type="search" data-list-search placeholder="Cari nama atau ID"></label></div>':''}<p role="status" class="p9-state" data-list-state></p><div data-list-items></div><div class="p9-actions">${button('Muat ulang','data-list-retry')}${button('Muat berikutnya','data-list-more hidden')}</div>`;
    const items=$('[data-list-items]',host), message=$('[data-list-state]',host), more=$('[data-list-more]',host), retry=$('[data-list-retry]',host);
    let rows=[], before=0, sequence=0, busy=false;
    const show=()=>{
        const query=$('[data-list-search]',host)?.value.trim().toLocaleLowerCase('id-ID')||'';
        const matching=rows.filter(row=>(!filter||filter(row))&&(!query||search(row).toLocaleLowerCase('id-ID').includes(query)));
        items.innerHTML=matching.length?render(matching):'<p class="p9-state">Belum ada data untuk pilihan ini.</p>';
    };
    async function load(append=false) {
        if(ended){ return; }const run=++sequence;busy=true; more.disabled=retry.disabled=true;
        if(!append){rows=[];before=0;items.replaceChildren();more.hidden=true;}
        state(message,'Memuat data…');host.setAttribute('aria-busy','true');
        try {
            const page=await api(path+'?limit=20'+(append?'&before='+before:''));if(run!==sequence){ return; }
            rows=append?[...rows,...page]:page;before=page.at(-1)?.[key]||0;more.hidden=page.length<20;
            show();const continuation=more.hidden?'':' · masih ada halaman berikutnya';state(message,rows.length?rows.length+' data dimuat'+continuation+'.':'Belum ada data.');
        }catch(error){if(run===sequence){ state(message,error.message,true); }}
        finally{if(run===sequence){busy=false;more.disabled=retry.disabled=false;host.removeAttribute('aria-busy');}}
    }
    retry.addEventListener('click',()=>load());more.addEventListener('click',()=>{if(!busy){ void load(true); }});
    $('[data-list-search]',host)?.addEventListener('input',show);
    void load(); return {reload:()=>load(),rows:()=>rows,show};
}

const paymentStates={pending:'Menunggu pembayaran',paid:'Pembayaran tercatat',not_due:'Tidak ada kewajiban bayar',voided:'Kewajiban dibatalkan'};
const simulation = '<span class="p9-badge p9-badge--simulation">SIMULASI</span>';
let wallet=null, actor=null;
async function userWorkspace(root) {
    root.innerHTML=heading('Poin & Voucher','Kontribusi terverifikasi Anda, apresiasi untuk langkah berikutnya.',button('Muat ulang','data-points-refresh'))+
        `<p class="p9-state" role="status" data-wallet-state></p><div data-wallet></div>${notice}<nav class="p9-tabs" aria-label="Bagian poin dan voucher">${button('Katalog voucher','data-points-view="catalog" aria-pressed="true"')}${button('Voucher Saya','data-points-view="mine" aria-pressed="false"')}${button('Riwayat poin','data-points-view="ledger" aria-pressed="false"')}${button('Statistik kontribusi','data-points-view="analytics" aria-pressed="false"')}</nav><section data-points-panel="catalog"><h3>Katalog voucher</h3><div data-catalog></div></section><section data-points-panel="mine" hidden><h3>Voucher Saya & riwayat penukaran</h3><div data-mine></div></section><section data-points-panel="ledger" hidden><h3>Riwayat poin</h3><div data-ledger></div></section><section data-points-panel="analytics" hidden data-p9-analytics="user"></section>`;
    let version=0;
    async function loadWallet(){
        const run=++version; wallet=null;$('[data-wallet]',root).replaceChildren();state($('[data-wallet-state]',root),'Memuat saldo dan level…');
        try{
            const value=await api('/api/user/contributions');if(run!==version){ return; }wallet=value;
            window.sampiraContributionLevel=value.level;$('#user-display-level').textContent=value.level;$('#profile-avatar').dataset.level=value.level;
            $('[data-wallet]',root).innerHTML=`<div class="p9-stats">${stat('Saldo poin',number(value.balance))}${stat('Total poin kontribusi',number(value.lifetime_points))}${stat('Level Anda',value.level)}</div><h3>Pencapaian Anda</h3><div class="p9-badges">${value.badges.length?value.badges.map(badge).join(''):'<p>Badge pertama diperoleh setelah kontribusi menghasilkan poin.</p>'}</div><p>${escape(value.points_per_kg)} poin/kg dari berat aktual terverifikasi, dibulatkan ke bawah. Berlaku untuk verifikasi baru; penukaran tidak mengurangi level.</p>`;
            state($('[data-wallet-state]',root),'Saldo sesuai catatan terakhir di server.');
        }catch(error){if(ended){ return; }if(run===version){window.sampiraContributionLevel='Level belum tersedia';$('#user-display-level').textContent='Level belum tersedia';state($('[data-wallet-state]',root),error.message,true);}}
    }
    await loadWallet();
    const catalog=list($('[data-catalog]',root),'/api/vouchers',rows=>`<div class="p9-cards">${rows.map(row=>{ let displayValue1; if (row.stock<1) { displayValue1 = 'Stok habis'; } else if (wallet&&wallet.balance<row.point_cost) { displayValue1 = 'Poin belum cukup'; } else { displayValue1 = 'Tukar'; }
return "<article class=\"p9-card\">" + String(simulation) + "<h3>" + String(escape(row.name)) + "</h3><p>" + String(escape(row.description)) + "</p><small>" + String(escape(row.category)) + " · Stok " + String(number(row.stock)) + "</small><small>Berlaku hingga " + String(date(row.valid_until)) + " WIB</small><div class=\"p9-card-footer\"><strong>" + String(number(row.point_cost)) + " poin</strong>" + String(button(displayValue1,("data-redeem=\"" + String(row.id) + "\" " + String(row.stock<1||!wallet||wallet.balance<row.point_cost?'disabled':'')))) + "</div></article>"; }).join('')}</div>`,{search:row=>row.name+' '+row.category});
    const mine=list($('[data-mine]',root),'/api/user/vouchers',rows=>`<div class="p9-cards">${rows.map(row=>("<article class=\"p9-card\">" + String(simulation) + String(badge(row.status==='expired'?'Kedaluwarsa':'Tersedia · simulasi')) + "<h3>" + String(escape(row.name)) + "</h3><p>" + String(escape(row.description)) + "</p><small>Ditukar " + String(date(row.created_at)) + " WIB · " + String(number(row.point_cost)) + " poin</small><small>Berlaku hingga " + String(date(row.valid_until)) + " WIB</small><div class=\"p9-card-footer\">" + String(button('Detail & kode',("data-voucher-detail=\"" + String(row.id) + "\""))) + "</div></article>")).join('')}</div>`,{search:row=>row.name+' '+row.id});
    const ledger=list($('[data-ledger]',root),'/api/user/points',rows=>table(['Tanggal (WIB)','Keterangan','Poin','Saldo sesudah'],rows.map(row=>[date(row.created_at),escape(row.description),`${row.amount>0?'+':''}${number(row.amount)}`,number(row.balance_after)])));
    async function refresh(){await loadWallet();if(ended){ return; }await Promise.all([catalog.reload(),mine.reload(),ledger.reload()]);}
    function refreshVisible(){
        if(ended||document.hidden||!root.getClientRects().length||document.querySelector('.p9-dialog[open]')){ return; }
        void refresh();
    }
    window.addEventListener('sampira:user-view',event=>{if(event.detail==='poin-voucher'){ refreshVisible(); }});
    window.addEventListener('focus',refreshVisible);
    document.addEventListener('visibilitychange',refreshVisible);
    $('[data-points-refresh]',root).addEventListener('click',()=>void refresh());
    window.addEventListener('sampira:user-pickups',()=>void loadWallet().then(()=>catalog.show()));
    root.addEventListener('click',event=>{
        const tab=event.target.closest('[data-points-view]');if(tab){for(const control of root.querySelectorAll('[data-points-view]')){ control.setAttribute('aria-pressed',String(control===tab)); }for(const panel of root.querySelectorAll('[data-points-panel]')){ panel.hidden=panel.dataset.pointsPanel!==tab.dataset.pointsView; }}
        const detail=event.target.closest('[data-voucher-detail]');
        if(detail){const row=mine.rows().find(item=>item.id===Number(detail.dataset.voucherDetail));if(!row){ return; }const modal=dialog('Detail voucher simulasi',`${simulation}<h3>${escape(row.name)}</h3><p>${escape(row.description)}</p><p>Kode voucher</p><code class="p9-code">${escape(row.code)}</code><p>Berlaku hingga ${date(row.valid_until)} WIB · ${row.status==='expired'?'Kedaluwarsa':'Tersedia untuk simulasi'}</p>${notice}`,async()=>true,'Selesai');$('.p9-code',modal).setAttribute('aria-label','Kode voucher');}
        const redeem=event.target.closest('[data-redeem]');if(!redeem){ return; }
        const row=catalog.rows().find(item=>item.id===Number(redeem.dataset.redeem));if(!row||!wallet){ return; }
        dialog('Konfirmasi penukaran',`${simulation}<h3>${escape(row.name)}</h3><p>${number(row.point_cost)} poin akan dipotong dari saldo ${number(wallet.balance)} poin. Penukaran tidak dapat dibatalkan melalui aplikasi.</p><p>Berlaku hingga ${date(row.valid_until)} WIB.</p>${notice}`,async(_,modal)=>{
            // Persist before sending. A lost response retries this same intent,
            // including after navigation/reload in the same browser tab.
            const storageKey=`sampira:redeem:${actor.id}:${row.id}`;
            let key;try{key=sessionStorage.getItem(storageKey)||crypto.randomUUID();sessionStorage.setItem(storageKey,key);}catch{throw new Error('Penyimpanan retry tidak tersedia. Aktifkan penyimpanan browser sebelum menukar.');}
            let receipt;
            try{receipt=await api(`/api/vouchers/${row.id}/redeem`,{method:'POST',headers:{'Idempotency-Key':key,'X-Expected-Point-Cost':String(row.point_cost)}});}
            catch(error){if(error.status===409){$('.p9-actions',modal).hidden=true;await refresh();error.message+=' Tutup dialog lalu pilih kembali voucher dari katalog terbaru.';}throw error;}
            try{sessionStorage.removeItem(storageKey);}catch{/* A confirmed receipt is still a successful redemption. */}
            $('[data-dialog-body]',modal).innerHTML=`${simulation}<h3>Penukaran berhasil</h3><p>${escape(row.name)}</p><code class="p9-code">${escape(receipt.code)}</code><p>Voucher tersimpan di Voucher Saya. Kode ini tidak berlaku di merchant nyata.</p>`;
            $('.p9-actions',modal).hidden=true;state($('[data-dialog-state]',modal),'Penukaran tercatat. Memuat ulang saldo dan stok…');
            await refresh();state($('[data-dialog-state]',modal),'Saldo dan stok diminta ulang dari server. Periksa status pemuatan di halaman.');return false;
        },'Konfirmasi tukar');
    });
}

function table(headers,rows){return `<div class="p9-table-wrap" role="region" aria-label="Daftar ${escape(headers[0])}" tabindex="0"><table><thead><tr>${headers.map(label=>("<th scope=\"col\">" + String(label) + "</th>")).join('')}</tr></thead><tbody>${rows.map(cells=>("<tr>" + String(cells.map(value=>("<td>" + String(value) + "</td>")).join('')) + "</tr>")).join('')}</tbody></table></div>`;}

function rewardWorkspace(root){
    root.innerHTML=heading('Reward Saya','Uang berdasarkan berat aktual dan tarif yang telah diverifikasi, terpisah dari poin.')+`<div data-reward-summary data-p9-analytics="reward"></div><p class="p9-note">Hanya status “Pembayaran tercatat” yang membuktikan pembayaran telah dicatat Administrator. Nilai estimasi pengajuan tidak dihitung sebagai uang dibayar.</p><label>Status pembayaran<select data-reward-filter><option value="">Semua status dimuat</option>${Object.entries(paymentStates).map(([key,value])=>("<option value=\"" + String(key) + "\">" + String(value) + "</option>")).join('')}</select></label><div data-reward-list></div>`;
    const filter=$('[data-reward-filter]',root);
    const entries=list($('[data-reward-list]',root),'/api/user/rewards',rows=>table(['Penjemputan','Berat aktual','Nilai tercatat','Status','Keterangan'],rows.map(row=>{ let displayValue1; if (row.payment_status==='paid') { displayValue1 = 'Pembayaran eksternal dicatat.'; } else if (row.payment_status==='pending') { displayValue1 = 'Belum tercatat dibayar.'; } else if (row.payment_status==='voided') { displayValue1 = 'Kewajiban dibatalkan; kontribusi fisik tetap tercatat.'; } else { displayValue1 = 'Tidak ada kewajiban pembayaran.'; }
return [escape(row.tracking_number),number(row.verified_weight_kg)+' kg',money(row.amount),badge(paymentStates[row.payment_status]||'Belum tersedia'),displayValue1]; })),{key:'pickup_id',filter:row=>!filter.value||filter.value===row.payment_status});
    filter.addEventListener('change',entries.show);
    function refreshVisibleRewards(){
        if(ended||document.hidden||!root.getClientRects().length){ return; }
        void entries.reload();$('[data-reward-summary]',root).dispatchEvent(new Event('sampira:open'));
    }
    window.addEventListener('sampira:user-view',event=>{if(event.detail==='reward-user'){ refreshVisibleRewards(); }});
    window.addEventListener('focus',refreshVisibleRewards);
    document.addEventListener('visibilitychange',refreshVisibleRewards);
}

const metricLabels={pickups:'Total penjemputan',completed_pickups:'Penjemputan selesai',verified_weight_kg:'Berat terverifikasi (kg)',cash_reward:'Total kewajiban reward',cash_paid:'Reward dibayar',points_balance:'Saldo poin',lifetime_points:'Total poin kontribusi',facility_reports:'Laporan fasilitas',redemptions:'Penukaran voucher',assigned_pickups:'Penjemputan ditugaskan',in_progress_pickups:'Penjemputan berjalan',active_facility_tasks:'Tugas fasilitas aktif',completed_facility_tasks:'Tugas fasilitas selesai',reports:'Total laporan',pending_verification:'Menunggu verifikasi',approved_reports:'Laporan disetujui',awaiting_assignment:'Menunggu penugasan',assigned:'Penugasan aktif',awaiting_validation:'Menunggu validasi hasil',handling_in_progress:'Dalam penanganan',completed:'Penanganan selesai',accounts:'Total akun',active_accounts:'Akun aktif',cash_pending:'Reward menunggu pembayaran',legacy_transactions:'Transaksi historis',active_vouchers:'Voucher aktif',voucher_redemptions:'Penukaran voucher'};
function analytics(root,role){
    const actualRole=role==='reward'?'user':role;
    const collectorSummary=actualRole==='petugas'&&root.dataset.collectorSummary!==undefined;
    const adminCharts=actualRole==='admin'&&root.dataset.adminCharts!==undefined;
    root.innerHTML=heading(role==='reward'?'Ringkasan reward':'Statistik '+({user:'kontribusi',admin:'operasional',petugas:'tugas',administrator:'sistem'}[role]),'Seluruh waktu · sesuai kewenangan akun. Angka dapat berubah saat ada aktivitas baru.',button('Perbarui statistik','data-analytics-retry'))+'<p role="status" class="p9-state" data-analytics-state></p><div data-analytics-values></div>';
    if(adminCharts){$('h2',root).textContent='Statistik Laporan';$('.p9-kicker',root).textContent='Analisis operasional';}
    if(collectorSummary){ root.innerHTML='<div class="collector-summary-heading"><div><h2>Ringkasan operasional</h2><p>Seluruh waktu · sesuai penugasan akun Anda.</p></div>'+button('Perbarui statistik','data-analytics-retry')+'</div><div data-analytics-values></div><p role="status" class="p9-state" data-analytics-state></p>'; }
    if(actualRole==='admin'||actualRole==='administrator'){ mountCityData(root); }
    let sequence=0;
    async function load(){if(ended||!root.isConnected){ return; }const run=++sequence;state($('[data-analytics-state]',root),'Memuat statistik…');$('[data-analytics-values]',root).replaceChildren();
        try{const data=await api('/api/analytics');if(run!==sequence){ return; }if(data.role!==actualRole){ throw new Error('Cakupan statistik tidak sesuai sesi.'); }
            if(adminCharts){
                const rows=keys=>keys.map(key=>({key,label:metricLabels[key],value:data[key]}));
                $('[data-analytics-values]',root).innerHTML='<div class="admin-chart-grid">'+countChart('Laporan & verifikasi',rows(['reports','pending_verification','approved_reports']),'Seluruh waktu · satuan jumlah laporan. Indikator dapat saling beririsan.',true)+countChart('Penanganan & penugasan',rows(['awaiting_assignment','assigned','handling_in_progress','awaiting_validation','completed']),'Seluruh waktu · jumlah catatan/tugas, bukan bagian dari satu total.')+'</div>';
                state($('[data-analytics-state]',root),'Diperbarui '+date(new Date().toISOString())+' WIB.');return;
            }
            if(collectorSummary){
                const cards=[['completed_pickups','Penjemputan selesai','Status selesai','fa-circle-check','green'],['active_facility_tasks','Tugas fasilitas aktif','Perlu penanganan','fa-clipboard-list','amber'],['in_progress_pickups','Pickup berjalan','Termasuk menunggu hub','fa-truck','blue'],['completed_facility_tasks','Fasilitas selesai','Penugasan diselesaikan','fa-screwdriver-wrench','green']];
                $('[data-analytics-values]',root).innerHTML='<div class="collector-summary-grid">'+cards.map(([key,label,note,icon,tone])=>`<article class="collector-summary-card ${tone}"><div><h3>${label}</h3><strong data-collector-metric="${key}">${typeof data[key]==='number'?number(data[key]):'—'}</strong><p>${note}</p></div><span class="collector-summary-icon"><i class="fas ${icon}" aria-hidden="true"></i></span></article>`).join('')+'</div>';
                state($('[data-analytics-state]',root),'Diperbarui '+date(new Date().toISOString())+' WIB.');return;
            }
            const keys=Object.keys(metricLabels).filter(key=>typeof data[key]==='number'&&(role!=='reward'||['cash_reward','cash_paid','verified_weight_kg'].includes(key)));
            const countKeys=keys.filter(key=>!key.includes('cash')&&!key.includes('weight')&&!key.includes('points')&&!key.includes('lifetime'));
            const max=Math.max(1,...countKeys.map(key=>data[key]));
            $('[data-analytics-values]',root).innerHTML=`<div class="p9-stats">${keys.map(key=>stat(metricLabels[key],key.includes('cash')?money(data[key]):number(data[key]))).join('')}</div>`+(role!=='reward'?`<div class="p9-chart" role="img" aria-label="Grafik jumlah aktivitas seluruh waktu"><h3>Aktivitas seluruh waktu</h3><p>Satuan: jumlah catatan. Indikator dapat saling beririsan; bukan bagian dari satu total.</p>${countKeys.map(key=>("<div class=\"p9-bar\"><span>" + String(metricLabels[key]) + "</span><progress max=\"" + String(max) + "\" value=\"" + String(data[key]) + "\" aria-label=\"" + String(metricLabels[key]) + ": " + String(data[key]) + "\"></progress><strong>" + String(number(data[key])) + "</strong></div>")).join('')}</div>`:'');
            state($('[data-analytics-state]',root),'Diperbarui '+date(new Date().toISOString())+' WIB.');
        }catch(error){if(run===sequence){ state($('[data-analytics-state]',root),error.message,true); }}
    }
    $('[data-analytics-retry]',root).addEventListener('click',()=>void load());root.addEventListener('sampira:open',()=>void load());window.addEventListener('sampira:cash-updated',()=>void load());void load();return load;
}

function voucherFields(row={}){
    const localDate=value=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
    return `${notice}<div class="p9-form-grid"><label>Nama voucher<input name="name" maxlength="120" required value="${escape(row.name)}"></label><label>Kategori<input name="category" maxlength="60" required value="${escape(row.category||'simulasi')}"></label><label class="p9-wide">Deskripsi<textarea name="description" maxlength="1000" rows="3">${escape(row.description)}</textarea></label><label>Biaya poin<input name="point_cost" type="number" min="1" max="1000000000" step="1" required value="${row.point_cost||''}"></label><label>Stok tersedia<input name="stock" type="number" min="0" max="1000000" step="1" required value="${row.stock??0}"></label><label>Berlaku mulai (waktu lokal)<input name="valid_from" type="datetime-local" required value="${localDate(row.valid_from)}"></label><label>Berlaku hingga (waktu lokal)<input name="valid_until" type="datetime-local" required value="${localDate(row.valid_until)}"></label><label class="p9-wide"><span><input name="active" type="checkbox" ${row.active?'checked':''}> Tampilkan voucher di katalog User</span><small>Jika tidak dicentang, voucher disimpan nonaktif. Publikasi mengikuti masa berlaku; stok nol tetap ditandai habis. Seluruh voucher tetap simulasi.</small></label></div>`;
}
function publicationMessage(body){
 if(!body.active){ return 'Tersimpan nonaktif. Centang publikasi agar tampil di katalog User.'; }
 if(Date.parse(body.valid_from)>Date.now()){ return 'Tersimpan aktif, dijadwalkan tampil pada waktu mulai berlaku.'; }
 if(Date.parse(body.valid_until)<=Date.now()){ return 'Tersimpan, tetapi masa berlaku telah berakhir.'; }
 return 'Tersimpan aktif dan dalam masa berlaku. Katalog User menampilkan stok terbaru saat dibuka kembali.';
}
function manageCatalog(root){
    root.innerHTML=heading('Manajemen Voucher','Atur biaya poin, stok dan masa berlaku. Voucher yang telah terbit mempertahankan data asal.',button('Buat voucher','data-voucher-new class="p9-primary"'))+notice+'<p role="status" data-publish-state></p><div data-admin-catalog></div>';
    const catalog=list($('[data-admin-catalog]',root),'/api/administrator/vouchers',rows=>table(['Voucher','Biaya / stok','Masa berlaku (WIB)','Status','Aksi'],rows.map(row=>{ let displayValue2; if (!row.active) { displayValue2 = 'Nonaktif'; } else if (Date.parse(row.valid_until)<=Date.now()) { displayValue2 = 'Kedaluwarsa'; } else if (Date.parse(row.valid_from)>Date.now()) { displayValue2 = 'Terjadwal'; } else { displayValue2 = 'Aktif'; }
return [`${escape(row.name)}<small>${escape(row.category)} · SIMULASI</small>`,`${number(row.point_cost)} poin<small>Stok ${number(row.stock)}</small>`,`${date(row.valid_from)}<small>s.d. ${date(row.valid_until)}</small>`,badge(displayValue2),button('Edit',`data-voucher-edit="${row.id}"`)]; })),{search:row=>row.name+' '+row.category+' '+row.id});
    function edit(row){
        dialog(row?'Edit voucher':'Buat voucher simulasi',voucherFields(row),async data=>{
            const body=Object.fromEntries(data);body.point_cost=Number(body.point_cost);body.stock=Number(body.stock);body.active=data.has('active');
            body.valid_from=new Date(body.valid_from).toISOString();body.valid_until=new Date(body.valid_until).toISOString();
            if(Date.parse(body.valid_until)<=Date.parse(body.valid_from)){ throw new Error('Masa berlaku akhir harus setelah waktu mulai.'); }
            if(row){ body.version=row.version; }
            try{await api('/api/administrator/vouchers'+(row?'/'+row.id:''),json(row?'PUT':'POST',body));}
            catch(error){if(error.status===409){ error.message+=' Tutup dialog dan muat ulang katalog sebelum mengedit kembali.'; }throw error;}
            await catalog.reload();window.dispatchEvent(new Event('sampira:cash-updated'));
            $('[data-publish-state]',root).textContent=publicationMessage(body);
        },row?'Simpan perubahan':'Buat voucher');
    }
    $('[data-voucher-new]',root).addEventListener('click',()=>edit());
    root.addEventListener('click',event=>{const control=event.target.closest('[data-voucher-edit]');if(control){ edit(catalog.rows().find(row=>row.id===Number(control.dataset.voucherEdit))); }});
}

function accounts(root){
    root.innerHTML=heading('Akun & Role','Role akun bersifat tetap. Anda dapat mengatur status aktif akun; perubahan status mencabut sesi akun terkait.')+'<div data-accounts-list></div>';
    const entries=list($('[data-accounts-list]',root),'/api/administrator/accounts',rows=>table(['Akun','Role','Status','Aksi'],rows.map(row=>[`${escape(row.name)}<small>${escape(row.email)}</small>`,escape(row.role),badge(row.is_active?'Aktif':'Nonaktif'),button(row.id===actor.id?'Akun Anda':'Kelola',`data-account-edit="${row.id}" ${row.id===actor.id?'disabled':''}`)])),{search:row=>row.name+' '+row.email+' '+row.role+' '+row.id});
    root.addEventListener('click',event=>{
        const control=event.target.closest('[data-account-edit]');if(!control){ return; }const row=entries.rows().find(item=>item.id===Number(control.dataset.accountEdit));if(!row){ return; }
        dialog('Kelola akun',`<p><strong>${escape(row.name)}</strong><br>${escape(row.email)}</p><div class="p9-form-grid"><label>Role (tidak dapat diubah)<input name="role" value="${escape(row.role)}" readonly aria-readonly="true"></label><label>Status akun<select name="is_active"><option value="true" ${row.is_active?'selected':''}>Aktif</option><option value="false" ${!row.is_active?'selected':''}>Nonaktif</option></select></label><label class="p9-wide">Alasan perubahan (wajib, minimal 10 karakter)<textarea name="reason" minlength="10" maxlength="1000" rows="3" placeholder="Contoh: Akun dinonaktifkan atas permintaan pemilik." required></textarea></label></div><p>Sesi akun ini akan dicabut. Perubahan akun sendiri tidak diizinkan.</p>`,async data=>{
            await api('/api/administrator/accounts/'+row.id,json('PATCH',{role:data.get('role'),is_active:data.get('is_active')==='true',expected_role:row.role,expected_active:row.is_active,reason:data.get('reason')}));
            await entries.reload();window.dispatchEvent(new Event('sampira:cash-updated'));
        },'Konfirmasi perubahan');
    });
}

function audit(root){
    root.innerHTML=heading('Monitoring penukaran & audit','Riwayat penukaran, pengelolaan voucher, akun dan pembatalan reward. Pelaksana ditampilkan sebagai ID akun; cocokkan melalui menu Akun & Role.')+'<div data-audit-list></div>';
    const names={voucher_save:'Perubahan katalog',voucher_redeem:'Penukaran voucher simulasi',cash_void:'Pembatalan reward',account_change:'Perubahan akun'};
    list($('[data-audit-list]',root),'/api/administrator/contribution-audit',rows=>table(['Waktu (WIB)','Kegiatan','Pelaksana','Catatan'],rows.map(row=>{
        let details;try{details=JSON.parse(row.details);}catch{details={};}
        let description='';
        if(row.action==='voucher_redeem'){ description=`Penukaran #${row.entity_id} · voucher #${details.voucher_id} · ${number(details.points)} poin. SIMULASI.`; }
        if(row.action==='voucher_save'){ description=`Voucher #${row.entity_id} · ${details.after?.name||''} · stok ${details.after?.stock??'—'}`; }
        if(row.action==='account_change'){ description=`Akun #${row.entity_id}: ${details.before_role} → ${details.role}. ${details.active?'Aktif':'Nonaktif'}. ${details.reason||''}`; }
        if(row.action==='cash_void'){ description=`Penjemputan #${row.entity_id} · ${money(details.amount)} · ${details.reason||''}`; }
        return [date(row.created_at),escape(names[row.action]||row.action),`Akun #${row.actor_id}`,escape(description)];
    })),{search:row=>row.action+' '+row.entity_id+' '+row.actor_id+' '+row.details});
}

function facilityGrid(root){
    const chartOnly=document.body.classList.contains('sp-admin')&&Boolean(document.querySelector('[data-admin-charts]'));
    root.innerHTML=heading('Sebaran laporan fasilitas','Jumlah laporan fasilitas yang disetujui per sel, bukan ukuran kepadatan sampah.')+`<p class="p9-note">Hanya sel dengan minimal 3 laporan disetujui yang ditampilkan. Lingkaran hijau menunjukkan pusat sel agregasi 0,01°, bukan titik rumah atau fasilitas. Tidak memuat titik penjemputan privat Warga.</p><form class="p9-grid-filter"><label>Kategori<select name="category"><option value="">Semua kategori</option><option value="tps">TPS</option><option value="collection_site">Lokasi pengumpulan</option><option value="waste_bank">Bank sampah</option><option value="other">Lainnya</option></select></label><label>Maksimal sel<input name="limit" type="number" min="1" max="100" value="50" required></label><button type="submit" class="p9-primary">Terapkan filter</button><details><summary>Batasi area koordinat (opsional)</summary><div class="p9-form-grid">${['min_lat','max_lat','min_lng','max_lng'].map((name,index)=>("<label>" + String(['Lintang minimum','Lintang maksimum','Bujur minimum','Bujur maksimum'][index]) + "<input name=\"" + String(name) + "\" type=\"number\" step=\"any\" min=\"" + String(index<2?-90:-180) + "\" max=\"" + String(index<2?90:180) + "\"></label>")).join('')}</div></details></form><p role="status" class="p9-state" data-grid-state></p><div class="p9-map" aria-label="Peta agregasi laporan fasilitas"></div><div data-grid-table></div>`;
    if(chartOnly){$('.p9-map',root).hidden=true;$('.p9-note',root).textContent='Grafik menampilkan sel agregasi 0,01° dengan minimal 3 laporan disetujui. Bukan titik rumah/fasilitas dan bukan klaim hotspot.';}
    let map,layer,sequence=0;
    function renderGridMap(result){
            if(!chartOnly&&!window.L){ throw new Error('Peta belum dapat dimuat. Periksa koneksi lalu terapkan filter kembali.'); }
            if(window.L&&!map&&!chartOnly){map=createMap($('.p9-map',root));streetTiles().on('tileerror',()=>state($('[data-grid-state]',root),'Peta jalan belum tersedia. Tabel sebaran tetap dapat dibaca.',true)).addTo(map);layer=L.layerGroup().addTo(map);}
            const bounds=[];
            for(const cell of result.cells){const extent=[[cell.south,cell.west],[cell.south+result.cell_degrees,cell.west+result.cell_degrees]];bounds.push(...extent);if(layer){const label=document.createElement('span');label.textContent=number(cell.count)+' laporan disetujui dalam sel agregasi';L.rectangle(extent,{color:'#277553',weight:1,fillOpacity:.35}).addTo(layer).bindPopup(label);L.circleMarker([cell.south+result.cell_degrees/2,cell.west+result.cell_degrees/2],{radius:8,color:'#fff',weight:2,fillColor:'#277553',fillOpacity:1}).addTo(layer).bindPopup(label.cloneNode(true));}}
            if(map){map.invalidateSize();if(bounds.length){ map.fitBounds(bounds,{padding:[20,20],maxZoom:14,animate:false}); }}
    }
    function renderGridTable(result){
            let displayValue4; if (result.cells.length) { if (chartOnly) { displayValue4 = countChart('Laporan disetujui per wilayah agregasi',result.cells.map((cell,index)=>({key:'cell-'+index,label:cell.south.toFixed(2)+', '+cell.west.toFixed(2),value:cell.count})),'Label: sudut selatan/barat sel, bukan koordinat pribadi. Satuan: jumlah laporan.'); } else { displayValue4 = table(['Sel (selatan, barat)','Laporan disetujui'],result.cells.map(cell=>[`${cell.south.toFixed(2)}, ${cell.west.toFixed(2)}`,number(cell.count)])); } } else { displayValue4 = '<p class="p9-state">Belum ada sel dengan minimal 3 laporan disetujui untuk filter ini.</p>'; }
$('[data-grid-table]',root).innerHTML=displayValue4;
    }
    async function load(){
        const run=++sequence;const form=$('form',root),send=$('[type=submit]',form);send.disabled=true;
        state($('[data-grid-state]',root),'Memuat sebaran…');layer?.clearLayers();$('[data-grid-table]',root).replaceChildren();
        try{
            const data=new FormData(form);const coordinates=['min_lat','max_lat','min_lng','max_lng'].map(key=>data.get(key));
            if(coordinates.some(Boolean)&&!coordinates.every(Boolean)){ throw new Error('Isi empat batas koordinat atau kosongkan seluruhnya.'); }
            const query=new URLSearchParams([...data].filter(([,value])=>value!==''));
            const result=await api('/api/analytics/facility-grid?'+query);if(run!==sequence){ return; }
            renderGridMap(result);
            renderGridTable(result);
            state($('[data-grid-state]',root),`${result.cells.length} sel ditampilkan${result.truncated?' · hasil dibatasi; persempit area atau tambah batas sel':''}. Tidak cukup untuk menyimpulkan hotspot atau kepadatan sampah.`);
        }catch(error){if(run===sequence){ state($('[data-grid-state]',root),error.message,true); }}
        finally{if(run===sequence){ send.disabled=false; }}
    }
    $('form',root).addEventListener('submit',event=>{event.preventDefault();void load();});
    const canvas=$('.p9-map',root);
    const observer=new ResizeObserver(()=>{if(map&&canvas.clientWidth&&canvas.clientHeight){ map.invalidateSize({pan:false}); }});
    observer.observe(canvas);
    root.addEventListener('sampira:open',()=>{if(map){ map.invalidateSize(); }else { void load(); }});
    const close=()=>{sequence++;observer.disconnect();map?.remove();map=layer=null;};
    window.addEventListener('sampira:session-ended',close);
    window.addEventListener('pagehide',close,{once:true});
    void load();
}

function cashCancellation(){
    document.addEventListener('click',event=>{
        const control=event.target.closest('[data-void-reward]');if(!control){ return; }
        dialog('Batalkan kewajiban reward',`<p>Penjemputan #${escape(control.dataset.voidReward)}. Hanya kewajiban pending yang dapat dibatalkan. Tidak melakukan refund eksternal atau mengubah kontribusi fisik.</p><label>Alasan pembatalan<textarea name="reason" minlength="10" maxlength="1000" rows="3" required></textarea></label>`,async data=>{
            await api('/api/administrator/pickup-rewards/'+control.dataset.voidReward+'/void',json('POST',{reason:data.get('reason')}));window.dispatchEvent(new Event('sampira:cash-updated'));
        },'Konfirmasi pembatalan');
    });
}

function workspaceRole(){if($('[data-p9-user]')){ return 'user'; }if(document.body.classList.contains('sp-system')){ return 'administrator'; }if(document.body.classList.contains('sp-admin')){ return 'admin'; }return 'petugas';}
async function boot(){
    const role=workspaceRole();
    actor=await window.portalUser(role);if(!actor){ throw new Error('Sesi akun belum dapat dimuat.'); }
    const user=$('[data-p9-user]');if(user){ await userWorkspace(user); }
    const rewards=$('[data-p9-rewards]');if(rewards){ rewardWorkspace(rewards); }
    for(const root of document.querySelectorAll('[data-p9-analytics]')){
        analytics(root,root.dataset.p9Analytics);
        if(root.dataset.p9Analytics==='admin'){const grid=document.createElement('section');grid.className='p9';root.append(grid);facilityGrid(grid);root.addEventListener('sampira:open',()=>grid.dispatchEvent(new Event('sampira:open')));}
    }
    if($('[data-p9-catalog-admin]')){ manageCatalog($('[data-p9-catalog-admin]')); }
    if($('[data-p9-accounts]')){ accounts($('[data-p9-accounts]')); }
    if($('[data-p9-audit]')){ audit($('[data-p9-audit]')); }
    for(const root of document.querySelectorAll('[data-p9-grid]')){ facilityGrid(root); }
    if(role==='administrator'){ cashCancellation(); }
}
try { await boot(); } catch(error) {
    if(!ended){ for(const root of document.querySelectorAll('[data-p9-user],[data-p9-rewards],[data-p9-analytics],[data-p9-catalog-admin],[data-p9-accounts],[data-p9-audit],[data-p9-grid]')){
        root.innerHTML='<p class="p9-state" role="status"></p>'+button('Coba lagi','data-boot-retry');state($('[role=status]',root),error.message,true);$('[data-boot-retry]',root).addEventListener('click',()=>window.location.reload());
    } }
}
