function communityQuery(cursor){return new URLSearchParams(cursor?{before_id:cursor}:{});}
function communityError(error){
    if(error.status===404||(error.status===400&&error.message==='ID laporan tidak valid.')){ return 'Laporan warga belum aktif di server ini. Form laporan pribadi tetap tersedia.'; }
    return error.message||'Laporan warga gagal dimuat. Pilih Perbarui untuk mencoba lagi.';
}
import {base,request} from './facility-api.js';
import {categories,element,dateLabel,userStatusBadge} from './facility-report-ui.js?v=community-13';

export function mountCommunityReports(root){
    const section=element('section',undefined,'facility-community');
    section.setAttribute('aria-labelledby','community-heading');
    const heading=element('header');
    const intro=element('div');const title=element('h2','Laporan fasilitas warga');title.id='community-heading';title.tabIndex=-1;
    intro.append(element('span','LINGKUNGAN KITA','community-eyebrow'),title,element('p','Ikut terdampak? Dukung laporan yang sudah ada tanpa membuat laporan baru.'));
    const refresh=element('button','Perbarui','sp-button sp-button--quiet');refresh.type='button';const actions=element('div',undefined,'community-actions');const create=element('button','Lapor fasilitas','sp-button');create.type='button';create.addEventListener('click',()=>{const target=root.querySelector('#facility-form-heading');target?.focus();target?.scrollIntoView({block:'start'});});actions.append(refresh,create);heading.append(intro,actions);
    const note=element('p','Jumlah dihitung per akun, termasuk pelapor. Verifikasi tetap dilakukan Admin.','community-note');
    const output=element('p',undefined,'community-state');output.setAttribute('role','status');output.setAttribute('aria-live','polite');
    const list=element('ul',undefined,'community-list');list.setAttribute('aria-label','Laporan fasilitas warga');
    const more=element('button','Muat laporan berikutnya','sp-button sp-button--quiet');more.type='button';more.hidden=true;
    section.append(heading,note,output,list,more);root.append(section);
    let cursor=null,sequence=0,ended=false,pending=[],detailDialog;
    function card(report){
        const item=element('li',undefined,'community-card');item.dataset.communityReport=report.id;
        const top=element('div',undefined,'community-card-top');top.append(element('small',categories[report.category]||'Fasilitas'),userStatusBadge(report.handling_status==='completed'?'completed':report.status));
        const count=element('strong',report.affected_count+' akun terdampak','facility-affected-count');
        const button=element('button','','sp-button sp-button--quiet');button.type='button';button.dataset.confirmAffected=report.id;
        const setLabel=()=>{let displayValue1; if (report.is_mine) { displayValue1 = 'Laporan Anda'; } else if (report.confirmed_by_me) { displayValue1 = 'Anda sudah mengonfirmasi'; } else if (report.can_confirm) { displayValue1 = 'Saya juga terdampak'; } else { displayValue1 = 'Penanganan selesai'; }
button.textContent=displayValue1;button.disabled=!report.can_confirm;};setLabel();
        const feedback=element('p',undefined,'community-card-state');feedback.setAttribute('role','status');
        const foot=element('div',undefined,'community-card-footer');const controls=element('div',undefined,'community-card-controls');const detail=element('button','Detail','sp-button sp-button--quiet');detail.type='button';detail.dataset.communityDetail=report.id;detail.addEventListener('click',()=>void openDetail(report.id,detail));controls.append(detail,button);foot.append(count,controls);item.append(top,element('h3',report.title),element('p',report.address,'community-address'),element('small',dateLabel(report.created_at)),foot,feedback);
        button.addEventListener('click',async()=>{
            if(button.disabled||ended){ return; }button.disabled=true;feedback.textContent='Mencatat konfirmasi…';
            try{
                const result=await request(base+'/'+report.id+'/affected',{method:'POST'});if(ended){ return; }
                report.confirmed_by_me=result.confirmed_by_me;report.can_confirm=false;count.textContent=result.affected_count+' akun terdampak';setLabel();
                feedback.textContent='Anda tercatat ikut terdampak. Tidak perlu membuat laporan yang sama.';
            }catch(error){if(ended){ return; }feedback.textContent=error.message||'Konfirmasi belum tercatat. Coba lagi.';button.disabled=false;}
        });
        return item;
    }
    async function openDetail(id,opener){
        detailDialog?.close();
        const dialog=element('dialog',undefined,'community-detail-dialog');detailDialog=dialog;
        const head=element('header',undefined,'community-detail-top');const title=element('h2','Detail laporan fasilitas');title.id='community-detail-title';const close=element('button','Tutup','sp-button sp-button--quiet');close.type='button';head.append(title,close);
        const state=element('p','Memuat detail laporan…','community-state');state.setAttribute('role','status');const body=element('div');dialog.append(head,state,body);dialog.setAttribute('aria-labelledby',title.id);document.body.append(dialog);
        let disposeMap;
        close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{disposeMap?.();dialog.remove();if(detailDialog===dialog){ detailDialog=null; }if(opener.isConnected){ opener.focus(); }},{once:true});dialog.showModal();
        try{
            const item=await request(base+'/community/detail/'+id);if(ended||!dialog.open){ return; }
            const summary=element('div',undefined,'community-detail-summary');summary.append(element('small',categories[item.category]||'Fasilitas'),userStatusBadge(item.handling_status||item.status),element('h3',item.title),element('p',item.tracking_number+' · '+dateLabel(item.created_at)),element('strong',item.affected_count+' akun terdampak','facility-affected-count'));
            const grid=element('div',undefined,'community-detail-grid');const story=element('section',undefined,'community-detail-story');story.append(element('h4','Kondisi fasilitas'),element('p',item.description));
            if(item.photo_url){const image=element('img');image.src=item.photo_url;image.alt='Foto laporan fasilitas: '+item.title;image.addEventListener('error',()=>image.replaceWith(element('p','Foto belum dapat dimuat. Tutup lalu coba kembali.')));story.append(image);}else { story.append(element('p','Foto belum tersedia.','community-state')); }
            if(item.public_result){ story.append(element('h4','Hasil penanganan'),element('p',item.public_result)); }
            const location=element('section',undefined,'community-detail-location');grid.append(story,location);body.replaceChildren(summary,grid);state.textContent='';
            const {mountLocationDetail}=await import('./location-map.js?v=home-location-14');if(ended||!dialog.open){ return; }
            disposeMap=mountLocationDetail(location,{title:'Alamat & titik fasilitas',point:item,address:item.address,reported:true,external:true,autoTiles:true,kind:'facility'});
        }catch(error){if(!ended&&dialog.open){ state.textContent=error.message||'Detail laporan belum dapat dimuat.'; }}
    }
    async function load(append=false){
        if(ended){ return; }if(append&&pending.length){list.append(...pending.splice(0,4).map(card));more.hidden=!cursor&&!pending.length;output.textContent=list.children.length+' laporan ditampilkan.';return;}const run=++sequence;const current=append?cursor:null;
        output.textContent='Memuat laporan warga…';more.disabled=refresh.disabled=true;
        if(!append){list.replaceChildren();pending=[];cursor=null;more.hidden=true;}
        const params=communityQuery(current);
        try{
            const result=await request(base+'/community?'+params);if(run!==sequence||ended){ return; }
            pending=result.items;list.append(...pending.splice(0,4).map(card));cursor=result.next_before_id;more.hidden=!cursor&&!pending.length;
            output.textContent=list.children.length?list.children.length+' laporan ditampilkan. Konfirmasi hanya jika fasilitas dan masalahnya sesuai.':'Belum ada laporan warga. Gunakan Lapor fasilitas untuk membuat laporan.';
        }catch(error){if(run===sequence&&!ended){output.textContent=communityError(error);}}
        finally{if(run===sequence&&!ended){ more.disabled=refresh.disabled=false; }}
    }
    refresh.addEventListener('click',()=>void load());more.addEventListener('click',()=>void load(true));
    window.addEventListener('sampira:user-view',event=>{if(event.detail==='laporan-fasilitas'){ void load(); }});
    window.addEventListener('sampira:facility-community-updated',()=>void load());
    window.addEventListener('sampira:session-ended',()=>{detailDialog?.close();ended=true;sequence++;list.replaceChildren();section.hidden=true;});
    void load();
    return section;
}


