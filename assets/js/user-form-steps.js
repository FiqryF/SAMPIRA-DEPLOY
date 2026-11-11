function coordinateValid(field,max){return Boolean(field?.value)&&Number.isFinite(Number(field.value))&&Math.abs(Number(field.value))<=max;}
function mapIssue(panel,kind){
    if(panel.querySelector('[data-address-state=loading]')){ return 'Tunggu alamat otomatis selesai dimuat.'; }
    const prefix=kind==='pickup'?'pickup':'facility';
    if(panel.querySelector('.location-status')?.textContent.startsWith('Menunggu lokasi')){ return 'Tunggu pencarian lokasi perangkat selesai.'; }
    if(!coordinateValid(document.getElementById(prefix+'-latitude'),90)||!coordinateValid(document.getElementById(prefix+'-longitude'),180)){ return 'Tunggu peta siap, lalu pilih titik lokasi.'; }
    return '';
}
function validateField(field,kind){
    if(field.disabled||field.type==='hidden'){ return true; }
    const rules=kind==='pickup'?{'form-request-title':[1,120],'form-item-description':[10,null],'form-pickup-address':[15,null]}:{'facility-title':[5,120],'facility-description':[10,3000],'facility-address':[5,300]};
    const rule=rules[field.id];
    if(rule){
        const length=[...field.value.trim()].length;let message='';
        if(length<rule[0]){ message='Isi minimal '+rule[0]+' karakter.'; }
        else if(rule[1]&&length>rule[1]){ message='Maksimal '+rule[1]+' karakter.'; }
        field.setCustomValidity(message);
    }
    if(field.id==='form-donor-phone'){ field.setCustomValidity(/^(\+62|62|0)8\d{8,13}$/.test(field.value.trim().replace(/[\s-]/g,''))?'':'Masukkan nomor WhatsApp Indonesia yang aktif.'); }
    return field.checkValidity();
}
function validateDescription(kind){
    if(kind!=='pickup'||typeof window.formatPickupDescription!=='function'){ return true; }
    const title=document.getElementById('form-request-title'),description=document.getElementById('form-item-description');
    if(new TextEncoder().encode(window.formatPickupDescription(title.value.trim(),description.value.trim())).length<=2000){ return true; }
    description.setCustomValidity('Persingkat judul atau deskripsi sampah (maksimal 2.000 byte gabungan).');description.reportValidity();return false;
}

// User form navigation only. Existing submission, retry and version handlers own the requests.
export function mountFormSteps(form, panels, navigation, footer, kind) {
    if (form.dataset.wizardReady || panels.some(panel => !panel) || !navigation || !footer) { return; }
    form.dataset.wizardReady = 'true';
    form.noValidate = true; // Validate visible steps before existing handlers validate the final payload.
    let step = 0;
    const submit = form.querySelector('[type="submit"]');
    const exit = footer.querySelector('button[type="button"]');
    const previous = document.createElement('button'); previous.type = 'button';
    previous.className = 'sp-button sp-button--quiet wizard-previous'; previous.textContent = 'Kembali';
    const next = document.createElement('button'); next.type = 'button';
    next.className = 'sp-button wizard-next'; next.textContent = 'Lanjutkan';
    const status = document.createElement('p'); status.className = 'wizard-status'; status.setAttribute('role','alert');
    footer.before(status); footer.prepend(previous); footer.append(next);
    navigation.setAttribute('role','list');
    const markers = [...navigation.children].map((link,index) => {
        const item = document.createElement('div'); item.className = 'wizard-indicator'; item.setAttribute('role','listitem');
        item.append(...link.childNodes); item.dataset.stepNumber = index + 1; link.replaceWith(item); return item;
    });
    panels.forEach(panel => panel.classList.add('wizard-step'));
    function show(index, scroll = false) {
        step = index; form.dataset.wizardStep = String(step + 1); status.textContent = '';
        panels.forEach((panel,i) => {panel.hidden = i !== step;});
        markers.forEach((item,i) => {
            item.classList.toggle('completed',i < step);
            if(i === step){ item.setAttribute('aria-current','step'); } else { item.removeAttribute('aria-current'); }
        });
        previous.hidden = step === 0; next.hidden = step === 2; submit.hidden = step !== 2;
        let displayValue1; if (step === 0) { displayValue1 = 'Lanjut ke Lokasi'; } else if (kind === 'pickup') { displayValue1 = 'Lanjut ke Kontak & Reward'; } else { displayValue1 = 'Lanjut ke Alamat'; }
next.textContent = displayValue1;
        if (exit) { exit.hidden = kind === 'facility' || step !== 0; }
        form.dispatchEvent(new CustomEvent('sampira:form-step',{bubbles:true,detail:{step:step+1}}));
        if (scroll) { navigation.scrollIntoView({block:'start',behavior:'auto'}); }
    }
    function validate(index) {
        const panel = panels[index];
        const mapMessage = index === 1 ? mapIssue(panel,kind) : '';
        if(mapMessage){status.textContent=mapMessage;return false;}
        const fields = [...panel.querySelectorAll('input,select,textarea')];
        const invalid = fields.find(field=>!validateField(field,kind));
        if(invalid){
            if(index!==step){ show(index,true); }
            status.textContent='Lengkapi isian yang ditandai sebelum melanjutkan.';
            invalid.reportValidity();return false;
        }
        if(index===0&&!validateDescription(kind)){status.textContent='Persingkat judul atau deskripsi sampah.';return false;}
        if(index===0&&submit.disabled){status.textContent='Tunggu pemeriksaan foto atau pengiriman sebelumnya selesai.';return false;}
        return true;
    }
    next.addEventListener('click', () => {if(validate(step)){ show(Math.min(2,step+1),true); }});
    previous.addEventListener('click', () => show(Math.max(0,step-1),true));
    form.addEventListener('input', event => {if (event.target.type !== 'file'){ event.target.setCustomValidity?.(''); }status.textContent = '';});
    form.addEventListener('submit', event => {
        if (step < 2) {
            event.preventDefault();event.stopImmediatePropagation();
            if(validate(step)){ show(step+1,true); }
            return;
        }
        for(let index=0;index<3;index++)if(!validate(index)) {event.preventDefault();event.stopImmediatePropagation();return;}
    },true);
    form.addEventListener('reset',()=>show(0));
    show(0);
}

if (document.body.classList.contains('user-reference')) {
    function setup() {
        const pickup = document.getElementById('pickup-request-form');
        if(pickup){ mountFormSteps(pickup,[document.getElementById('pickup-data'),document.getElementById('pickup-map'),pickup.querySelector('.ref-contact-grid')],pickup.querySelector('.ref-form-navigation'),pickup.querySelector('.sp-pickup-controls'),'pickup'); }
        const facility = document.getElementById('facility-form');
        if(facility && document.getElementById('report-data')){ mountFormSteps(facility,[document.getElementById('report-data'),document.getElementById('report-map'),document.getElementById('report-address')],facility.previousElementSibling,facility.querySelector('.sp-report-controls'),'facility'); }
    }
    const observer = new MutationObserver(setup); observer.observe(document.getElementById('user-main'),{childList:true,subtree:true});
    setup();window.addEventListener('sampira:session-ended',()=>observer.disconnect(),{once:true});
}
