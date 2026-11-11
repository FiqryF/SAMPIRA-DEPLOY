(() => {
    const form = document.getElementById('reward-payment-form');
    const select = document.getElementById('reward-pickup-id');
    const status = document.getElementById('reward-payment-status');
    const list = document.getElementById('reward-payment-list');
    const proofInput = document.getElementById('reward-payment-proof');
    const preview = document.getElementById('reward-proof-preview');
    const referenceInput = form.elements.namedItem('reference');
    const amountInput = form.elements.namedItem('amount');
    const filter=document.getElementById('reward-payment-filter');
    const search=document.getElementById('reward-payment-search');
    const reload=document.getElementById('reward-payment-refresh');
    const overview=document.getElementById('reward-payment-overview');
    const count=document.getElementById('reward-payment-count');
    const formEmpty=document.getElementById('reward-payment-form-empty');
    const rupiah=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:2});
    let rewards=[],refreshRun=0,selectedId='';
    function element(tag,className,text){const node=document.createElement(tag);if(className){ node.className=className; }if(text!==undefined){ node.textContent=text; }return node;}
    function choose(id,focus=false){
        if(submitting||ended){ return; }
        const row=rewards.find(row=>String(row.pickup_id)===String(id)&&row.status==='pending');
        if(!row){ return; }
        if(selectedId!==String(id)){
            referenceInput.value='';referenceInput.setCustomValidity('');referenceInput.removeAttribute('aria-invalid');proofInput.value='';clearPreview();preparedFile=preparedPromise=null;form.querySelector('#reward-payment-confirm').checked=false;
        }
        selectedId=String(id);
        select.value=String(row.pickup_id);amountInput.value=row.amount;amountInput.setCustomValidity('');amountInput.removeAttribute('aria-invalid');
        if(focus){form.scrollIntoView({block:'start',behavior:'instant'});referenceInput.focus({preventScroll:true});}
    }
    select.addEventListener('change',()=>{if(select.value){ choose(select.value); }else {selectedId='';amountInput.value='';}});
    function appendPaymentProof(row,li,actions){
                const meta=element('dl','payment-record-meta');
                const paidAt=row.paid_at?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(row.paid_at))+' WIB':'Belum tersedia';
                for(const[label,value]of [['Referensi transfer',row.reference||'Belum tersedia'],['Dicatat',paidAt],['Pelaksana',row.paid_by?'Akun #'+row.paid_by:'Belum tersedia']]){const group=element('div');group.append(element('dt','',label),element('dd','',value));meta.append(group);}
                const proof=element('a','sp-button sp-button--quiet','Unduh bukti');proof.href='/api/administrator/pickup-rewards/'+row.pickup_id+'/proof';actions.append(proof);li.append(meta);
                }
    function render(){
        if(ended){ return; }
        const query=search?.value.trim().toLocaleLowerCase('id-ID')||'';
        const rows=rewards.filter(row=>(!filter?.value||row.status===filter.value)&&(!query||[row.tracking_number,row.reference].join(' ').toLocaleLowerCase('id-ID').includes(query)));
        list.replaceChildren();
        if(count){ count.textContent=rows.length+' pembayaran ditampilkan · dari data yang dimuat'; }
        if(!rows.length){ list.append(element('li','payment-empty','Tidak ada pembayaran untuk pilihan ini.')); }
        for(const row of rows){
            const li=element('li','payment-record');
            const top=element('div','payment-record-top');
            const identity=element('div','payment-record-identity');identity.append(element('span','payment-caption','Nomor penjemputan'),element('strong','payment-tracking',row.tracking_number));
            const labels={pending:'Menunggu pembayaran',paid:'Pembayaran tercatat',voided:'Kewajiban dibatalkan'};
            top.append(identity,element('span','payment-badge payment-'+row.status,labels[row.status]||'Status belum tersedia'));
            li.append(top,element('strong','payment-record-amount',rupiah.format(Number(row.amount))));
            const actions=element('div','payment-record-actions');
            if(row.status==='pending'){
                const pick=element('button','sp-button payment-pick','Catat pembayaran');pick.type='button';pick.dataset.selectReward=String(row.pickup_id);pick.disabled=submitting;pick.addEventListener('click',()=>choose(row.pickup_id,true));
                const cancel=element('button','sp-button sp-button--quiet payment-void','Batalkan kewajiban');cancel.type='button';cancel.dataset.voidReward=row.pickup_id;
                actions.append(pick,cancel);
            }
            if(row.status==='paid'){ appendPaymentProof(row,li,actions); }
            li.append(actions);list.append(li);
        }
    }
    filter?.addEventListener('change',render);search?.addEventListener('input',render);
    const referenceMessage = 'Referensi transfer harus 6–100 karakter, diawali huruf/angka, dan hanya berisi huruf, angka, titik (.), garis bawah (_), garis miring (/), atau tanda hubung (-). Spasi tidak diperbolehkan.';
    const amountMessage = 'Nominal harus berupa angka, maksimal 13 digit dan 2 angka desimal. Gunakan titik untuk desimal, tanpa pemisah ribuan.';
    function validatePaymentInput(input) {
        const rule = input===referenceInput ? /^[A-Za-z0-9][A-Za-z0-9._/-]{5,99}$/ : /^\d{1,13}(\.\d{1,2})?$/;
        let displayValue1; if (rule.test(input.value.trim())) { displayValue1 = ''; } else if (input===referenceInput) { displayValue1 = referenceMessage; } else { displayValue1 = amountMessage; }
const message = displayValue1;
        input.setCustomValidity(message);
        input.setAttribute('aria-invalid', String(Boolean(message)));
        if(message){status.textContent=message;status.dataset.error='true';}
        else if(status.textContent===referenceMessage||status.textContent===amountMessage){ status.textContent=''; }
        return !message;
    }
    for(const input of [referenceInput,amountInput]){ input.addEventListener('input',()=>validatePaymentInput(input)); }
    let submitting = false, ended = false, preparedFile, preparedPromise, previewURL;
    const errorMessages = {401:'Sesi berakhir. Silakan masuk kembali.',403:'Pencatatan pembayaran hanya untuk Administrator dengan sesi yang sah.',409:'Status, nominal, referensi, atau bukti sudah berubah/digunakan. Periksa riwayat terbaru.',413:'Bukti terlalu besar. Pilih gambar hingga 5 MB untuk dioptimalkan.',500:'Pencatatan belum dapat dipastikan. Periksa riwayat pembayaran sebelum mencoba lagi.'};
    async function readResponse(response) {
        const result = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(errorMessages[response.status] || (response.status===400 && result?.message) || 'Layanan pembayaran belum dapat merespons. Periksa riwayat sebelum mencoba lagi.');
            error.status=response.status;throw error;
        }
        if (!result?.data) { throw new Error('Respons pembayaran tidak lengkap. Periksa riwayat sebelum mencoba lagi.'); }
        return result;
    }
    function clearPreview() {if(previewURL){ URL.revokeObjectURL(previewURL); }previewURL=null;if(preview){preview.hidden=true;preview.removeAttribute('src');}}
    function prepareProof(file) {
        if(file===preparedFile){ return preparedPromise; }
        preparedFile=file;
        preparedPromise=(async()=>{
            if(!file?.size){ throw new Error('Bukti pembayaran wajib diunggah.'); }
            if(file.size>5*1024*1024){ throw new Error('Bukti pembayaran maksimal 5 MB.'); }
            const {prepareHandlingPhoto}=await import('./handling-photo.js');
            const optimized=await prepareHandlingPhoto(file);
            return optimized===file?file:new File([optimized],'bukti-pembayaran.jpg',{type:optimized.type,lastModified:file.lastModified});
        })();return preparedPromise;
    }
    proofInput.addEventListener('change',async()=>{
        const file=proofInput.files[0];clearPreview();if(!file){ return; }
        try{const proof=await prepareProof(file);if(ended||proofInput.files[0]!==file){ return; }
            if(preview){previewURL=URL.createObjectURL(proof);preview.src=previewURL;preview.hidden=false;}
            status.dataset.error='false';status.textContent=proof===file?'Bukti siap. Periksa nominal, penerima, dan keterbacaan bukti.':'Bukti dioptimalkan menjadi JPEG maksimal 750 KiB. Periksa keterbacaan pratinjau sebelum mencatat; file asli tidak diubah.';
        }catch(error){status.dataset.error='true';status.textContent=error.message;}
    });

    async function refresh() {
        const run=++refreshRun;if(reload){ reload.disabled=true; }
        try {
        const response = await portalFetch('/api/administrator/pickup-rewards');
        const {data} = await readResponse(response);
        if(ended||run!==refreshRun){ return; }
        rewards=data;
        const selected=select.value;
        select.replaceChildren();
        select.add(new Option('Pilih penjemputan yang akan dicatat',''));
        for (const row of data) {
            if(row.status==='pending'){ select.add(new Option(row.tracking_number+' · '+rupiah.format(Number(row.amount)),row.pickup_id)); }
        }
        if(Array.from(select.options).some(option=>option.value===selected)){ select.value=selected; }
        else {selectedId='';amountInput.value='';amountInput.setCustomValidity('');amountInput.removeAttribute('aria-invalid');}
        form.hidden=select.options.length===1;
        if(formEmpty){ formEmpty.hidden=!form.hidden; }
        if(overview){overview.replaceChildren();for(const[key,label]of [['pending','Menunggu pembayaran'],['paid','Pembayaran tercatat']]){const rows=data.filter(row=>row.status===key);const card=element('div','payment-summary');card.append(element('span','payment-caption',label),element('strong','',rupiah.format(rows.reduce((sum,row)=>sum+Number(row.amount),0))),element('small','',rows.length+' pembayaran · data dimuat'));overview.append(card);}}
        render();
        } finally {if(reload&&run===refreshRun){ reload.disabled=false; }}
    }
    reload?.addEventListener('click',()=>{if(submitting){ return; }status.dataset.error='false';status.textContent='Memuat ulang pembayaran…';refresh().then(()=>{if(!ended){ status.textContent='Daftar pembayaran diperbarui.'; }}).catch(error=>{status.dataset.error='true';status.textContent=error.message;});});

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if(submitting||ended){ return; }
        if(!validatePaymentInput(referenceInput)||!validatePaymentInput(amountInput)){form.reportValidity();return;}
        submitting=true;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const body = new FormData(form);
            const proof=await prepareProof(proofInput.files[0]);
            if(ended){ return; }
            body.set('proof',proof,proof.name);
            if (form.querySelector('#reward-payment-confirm').checked) { body.set('confirm_payment', 'true'); }
            const response = await portalFetch('/api/ecorecycle/process_payout', {method: 'POST', body});
            const result = await readResponse(response);
            form.reset();
            clearPreview();preparedFile=preparedPromise=null;
            status.textContent = result.message;
            status.dataset.error='false';
            if(filter){ filter.value='paid'; }if(search){ search.value=''; }
            await refresh();
            window.dispatchEvent(new Event('sampira:cash-updated'));
        } catch (error) {
            status.dataset.error='true';
            status.textContent = error instanceof TypeError ? 'Koneksi terputus; pencatatan belum dapat dipastikan. Periksa riwayat sebelum mencoba lagi.' : error.message;
            if(!ended&&(error instanceof TypeError||error.status>=500||error.status===409)){ await refresh().catch(()=>{}); }
        } finally {
            submitting=false;
            button.disabled = false;
        }
    });
    refresh().catch(error => { status.dataset.error='true';status.textContent = error.message; });
    window.addEventListener('sampira:cash-updated', () => {
        refresh().catch(error => { status.dataset.error='true';status.textContent = error.message; });
    });
    window.addEventListener('pagehide',clearPreview);
    window.addEventListener('sampira:session-ended',()=>{ended=true;clearPreview();rewards=[];form.reset();form.hidden=true;select.replaceChildren();list.replaceChildren();overview?.replaceChildren();if(formEmpty){ formEmpty.hidden=true; }if(count){ count.textContent=''; }});
})();
