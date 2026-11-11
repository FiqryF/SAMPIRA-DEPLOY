const format = value => new Intl.NumberFormat('id-ID', {maximumFractionDigits:2}).format(value);
const months = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
const titles = {production:'Produksi menurut jenis sampah',handling:'Capaian penanganan sampah'};
let loading;
function data(){
    if(!loading){ loading=fetch('/assets/data/bandung-waste.json?v=education-unified-19',{credentials:'omit'}).then(async response=>{
        if(!response.ok){ throw new Error('Data belum dapat dimuat.'); }
        const result=await response.json();
        for(const key of Object.keys(titles))if(!Object.keys(result[key]?.years||{}).length){ throw new Error('Dataset belum lengkap.'); }
        return result;
    }).catch(error=>{loading=null;throw error;}); }
    return loading;
}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined){ el.textContent=text; }if(className){ el.className=className; }return el;}
const sum = values => Object.values(values).reduce((total,value)=>total+value,0);
function chart(title,rows,unit){
    const section=node('section',undefined,'city-chart');section.append(node('h4',title),node('p','Skala mulai 0 · '+unit,'city-caption'));
    const max=Math.max(1,...rows.map(([,value])=>value));const list=node('ol',undefined,'city-bars');
    for(const [label,value] of rows){
        const item=node('li');item.dataset.cityValue=value;item.append(node('span',label),node('strong',format(value)));
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 8');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
        for(const [width,color] of [[100,'#e7efe9'],[value/max*100,'#277553']]){const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('width',width);rect.setAttribute('height','8');rect.setAttribute('rx','2');rect.setAttribute('fill',color);svg.append(rect);}item.append(svg);list.append(item);
    }
    section.append(list);
    const details=node('details');details.append(node('summary','Lihat tabel data'));
    const table=node('table');const caption=node('caption',title+' · '+unit);const head=node('thead');const tr=node('tr');
    for(const text of ['Kategori / periode','Nilai']){const th=node('th',text);th.scope='col';tr.append(th);}head.append(tr);const body=node('tbody');
    for(const [label,value] of rows){const row=node('tr');row.append(node('td',label),node('td',format(value)));body.append(row);}table.append(caption,head,body);const region=node('div',undefined,'city-table-wrap');region.append(table);details.append(region);section.append(details);return section;
}
function card(key,dataset){
    const card=node('article',undefined,'city-card');card.dataset.cityDataset=key;const head=node('header');const intro=node('div');intro.append(node('h3',titles[key]),node('p',dataset.scope,'city-caption'));
    const label=node('label','Tahun');const select=node('select');select.setAttribute('aria-label','Tahun '+titles[key]);
    for(const year of Object.keys(dataset.years).sort((a,b)=>Number(b)-Number(a))){ select.add(new Option(year,year)); }label.append(select);head.append(intro,label);const content=node('div');card.append(head,content);
    const render=()=>{
        const year=select.value;let rows=Object.entries(dataset.years[year]);
        if(key==='handling'){ rows.sort((a,b)=>months.indexOf(a[0])-months.indexOf(b[0])); }else { rows.sort((a,b)=>b[1]-a[1]); }
        const total=sum(dataset.years[year]);const stat=node('p',undefined,'city-card-total');stat.append(node('strong',format(total)),document.createTextNode(' '+dataset.unit+' · '+year));
        content.replaceChildren(stat);
        if(dataset.warning){ content.append(node('p',dataset.warning,'city-warning')); }
        content.append(chart(key==='handling'?'Penanganan bulanan · '+year:'Komposisi produksi · '+year,rows,dataset.unit));
        const trend=node('details',undefined,'city-trend');trend.append(node('summary','Lihat tren '+Object.keys(dataset.years)[0]+'–'+Object.keys(dataset.years).at(-1)));
        trend.append(chart(key==='production'?'Total produksi harian menurut tahun':'Total penanganan per tahun',Object.entries(dataset.years).map(([y,values])=>[y,sum(values)]),key==='handling'?'ton/tahun':dataset.unit));content.append(trend);
        const source=node('p','Sumber: '+dataset.source+'. Metadata diperbarui '+dataset.updated+'.','city-source');source.append(node('small',dataset.file));content.append(source);
    };
    select.addEventListener('change',render);render();return card;
}
export function mountCityData(parent,compact=false){
    if(parent.querySelector('[data-city-panel]')){ return; }
    const root=node('section',undefined,'city-data');root.dataset.cityPanel='true';if(compact){ root.classList.add('city-data--compact'); }parent.append(root);
    const head=node('header',undefined,'city-heading');const copy=node('div');copy.append(node('span','DATA WILAYAH','city-eyebrow'),node('h2','Data Persampahan Kota Bandung'),node('p','Dataset eksternal untuk memahami kondisi wilayah. Terpisah dari transaksi dan aktivitas SAMPIRA.'));
    if(compact){copy.querySelector('h2').textContent='Bandung dalam data';copy.querySelector('p').textContent='Ringkasan dataset Kota Bandung · bukan aktivitas SAMPIRA.';}
    head.append(copy);const content=node('div');const state=node('p','Memuat dataset…','city-state');state.setAttribute('role','status');const retry=node('button','Coba lagi');retry.type='button';retry.hidden=true;root.append(head,state,retry,content);
    async function load(){retry.hidden=true;state.textContent='Memuat dataset…';try{
        const datasets=await data();content.replaceChildren();
        if(compact){
            const stats=node('div',undefined,'city-summary');
            for(const key of Object.keys(titles)){const item=node('div');const d=datasets[key],year=Object.keys(d.years).at(-1);item.append(node('span',key==='production'?'Produksi · satuan CSV':'Penanganan · total setahun'),node('strong',format(sum(d.years[year]))),node('small',d.unit+' · '+year));stats.append(item);}content.append(stats,node('p','Satuan produksi pada CSV dan metadata berbeda. Buka grafik untuk membaca catatan sumber.','city-warning'));
            const expand=node('details',undefined,'city-explore');expand.append(node('summary','Jelajahi grafik dan sumber data'));const grid=node('div',undefined,'city-grid');expand.append(node('p',datasets.production.warning,'city-warning'),grid);expand.addEventListener('toggle',()=>{if(expand.open&&!grid.childElementCount){ for(const key of Object.keys(titles)){ grid.append(card(key,datasets[key])); } }});content.append(expand);
        }else{const grid=node('div',undefined,'city-grid');for(const key of Object.keys(titles)){ grid.append(card(key,datasets[key])); }content.append(grid);}
        state.textContent=compact?'Data terbaru 2025 · sumber: Dinas Lingkungan Hidup Kota Bandung.':'Periode produksi 2018–2025 · penanganan 2017–2025. Tidak tersedia koordinat fasilitas pada dataset ini.';
    }catch{state.textContent='Dataset belum dapat dimuat. Periksa koneksi, lalu coba lagi.';retry.hidden=false;}}
    retry.addEventListener('click',load);void load();
}
for(const host of document.querySelectorAll('[data-city-summary]')){ mountCityData(host,true); }
