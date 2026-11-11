// Reuse the project's Photon provider; never send cookies, contact details or form text.
let nextLookupAt=0;
const cache=new Map();

export function addressLabel(properties={}){
    const street=[properties.street,properties.housenumber].filter(value=>typeof value==='string'&&value.trim()).join(' ');
    return [...new Set([properties.name,street,properties.district,properties.city,properties.county,properties.state,properties.postcode,properties.country]
        .filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))].join(', ');
}

export function mountPointAddress(root,field){
    if(!field){ return {select(){},cancel(){},dispose(){}}; }
    const status=document.createElement('p');status.className='location-address-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
    let sequence=0,timer,controller,writing=false;
    function cancel(){sequence++;clearTimeout(timer);controller?.abort();controller=null;status.textContent='';status.dataset.addressState='';}
    function manual(){if(writing){ return; }cancel();status.dataset.addressState='manual';status.textContent='Alamat disesuaikan secara manual.';}
    field.addEventListener('input',manual);
    function write(value){writing=true;field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));writing=false;}
    const isCurrent=run=>run===sequence&&root.isConnected;
    async function lookup(point,key,run){
                    const at=Math.max(Date.now(),nextLookupAt);nextLookupAt=at+1100;
                    if(at>Date.now()){ await new Promise(resolve=>setTimeout(resolve,at-Date.now())); }
                    if(!isCurrent(run)){ return null; }
                    controller=new AbortController();
                    const url=new URL('https://photon.komoot.io/reverse');url.search=new URLSearchParams({lat:point[0],lon:point[1],limit:'1',radius:'1'});
                    const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
                    if(!response.ok){ throw new Error('Address lookup failed'); }const data=await response.json();
                    const label=addressLabel(data.features?.[0]?.properties);
                    if(!label){ throw new Error('No address'); }
                    cache.set(key,label);if(cache.size>20){ cache.delete(cache.keys().next().value); }
                    return label;
    }
    function select(point){
        cancel();if(!point){ return; }const run=sequence;
        write('');status.dataset.addressState='loading';status.textContent='Mencari alamat dari titik terpilih…';
        const key=point.map(value=>Number(value).toFixed(6)).join(',');
        timer=setTimeout(async()=>{
            try{
                let label=cache.get(key);
                if(!label){
                    label=await lookup(point,key,run);
                }
                if(!isCurrent(run)){ return; }
                write(label.slice(0,field.maxLength>0?field.maxLength:1000));
                status.dataset.addressState='ready';status.textContent='Alamat terisi otomatis. Periksa dan tambahkan patokan bila perlu.';
            }catch{
                if(!isCurrent(run)){ return; }
                status.dataset.addressState='error';status.textContent='Alamat belum dapat ditemukan. Coba geser pin atau isi alamat secara manual.';
            }
        },450);
    }
    return {select,cancel,dispose(){cancel();field.removeEventListener('input',manual);status.remove();}};
}
