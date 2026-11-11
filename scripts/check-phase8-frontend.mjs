import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function checkPhase8Browser({send,js,login,click,text,waitFor,profile}) {
    const out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS || profile,'phase8');
    await mkdir(out,{recursive:true});
    const tab=id=>click('.hub-tab[data-target="'+id+'"]');
    const ready=selector=>waitFor(()=>js('Boolean(document.querySelector('+JSON.stringify(selector)+')?.getClientRects().length)'),'Missing '+selector);
    async function capture(name,selector) {
        if(selector)await js('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"start"}); void 0');
        else await js('window.scrollTo(0,0); void 0');
        for(const width of [360,390,768,1280,1440]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<600});
            await waitFor(()=>js('document.documentElement.scrollWidth <= innerWidth+2'),'Overflow '+name+' '+width);
            await new Promise(resolve=>setTimeout(resolve,300));
            if(width===390||width===1440) {
                const {data}=await send('Page.captureScreenshot',{format:'png'});
                await writeFile(join(out,name+'-'+width+'.png'),Buffer.from(data,'base64'));
            }
        }
    }
    await login('owner@phase1.invalid','/dashboard');
    await ready('#own-location-map .leaflet-pane');
    await ready('.sp-status-legend');
    const tracking=await js(`(async()=>{const data=new FormData();for(const [key,value] of Object.entries({item_description:'Phase 8 status refresh',pickup_address:'Jalan Fixture Peta Bandung 88',contact_phone:'081234567890',category:'Computers',weight_kg:'2',latitude:'-6.8123456',longitude:'107.5123456'}))data.set(key,value);const response=await fetch('/api/ecorecycle/request_pickup',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:data});if(response.status!==201)throw Error('Fixture pickup creation failed');return (await response.json()).data.tracking_number;})()`);
    const marker='.sp-owned-pin[title*="'+tracking+'"]';
    await js('loadDashboardData(); void 0');
    await ready(marker+'.sp-status-tone-waiting');
    await login('collector@phase1.invalid','/petugas');
    const assigned=await js(`fetch('/api/ecorecycle/assign_collector',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracking_number:${JSON.stringify(tracking)}})}).then(response=>response.status)`);
    assert.equal(assigned,200);
    await login('owner@phase1.invalid','/dashboard');
    await ready(marker+'.sp-status-tone-accepted');
    await capture('dashboard');
    await js(`window.phase8Fetch=window.fetch; window.fetch=(url,options)=>String(url).includes('/list_pickups')?Promise.resolve(Response.json({success:false},{status:500})):phase8Fetch(url,options); loadDashboardData(); void 0`);
    await ready('#dashboard-retry');
    await text('#dashboard-load-status','belum dapat dimuat');
    assert.equal(await js('document.querySelector("#monthlyWasteChart").parentElement.hidden'),true);
    await js('window.fetch=phase8Fetch; void 0');
    await click('#dashboard-retry');
    await waitFor(()=>js('document.querySelector("#dashboard-retry").hidden'),'Dashboard retry did not recover');
    await ready('#own-location-map .sp-status-pin');
    await tab('setor-sampah');
    await ready('#pickup-location-picker .leaflet-container');
    await capture('pickup');
    await js(`window.phase8Pending=[]; window.fetch=(url,options)=>String(url).startsWith('https://photon.komoot.io/api/')?new Promise(resolve=>phase8Pending.push({url:String(url),signal:options.signal,resolve})):phase8Fetch(url,options); void 0`);
    const search=async query=>{
        await js(`(()=>{const input=document.querySelector('#pickup-address-search');input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#pickup-search-button').click();})()`);
    };
    await search('Braga');
    await waitFor(()=>js('phase8Pending.length===1'),'First geocode not requested');
    await search('Dago');
    await waitFor(()=>js('phase8Pending.length===2'),'Second geocode not requested');
    await search('Braga');
    await waitFor(()=>js('phase8Pending.length===3'),'Third geocode not requested');
    assert.equal(await js('phase8Pending[0].signal.aborted && phase8Pending[1].signal.aborted'),true);
    await js(`phase8Feature=name=>Response.json({features:[{geometry:{type:'Point',coordinates:[107.61,-6.91]},properties:{name}}]});phase8Pending[0].resolve(phase8Feature('OLD BRAGA'));phase8Pending[1].resolve(phase8Feature('OLD DAGO'));void 0`);
    await waitFor(()=>js('document.querySelector("#pickup-search-results").childElementCount===0'),'Stale result survived');
    await js('phase8Pending[2].resolve(phase8Feature("LATEST BRAGA")); void 0');
    await text('#pickup-search-results','LATEST BRAGA');
    await click('#pickup-search-results button');
    await text('#pickup-search-status','konfirmasi');
    await search('Cicendo');
    await waitFor(()=>js('phase8Pending.length===4'),'Reset geocode missing');
    await js('document.querySelector("#pickup-request-form").reset();phase8Pending[3].resolve(phase8Feature("LATE RESET")); void 0');
    await waitFor(()=>js('document.querySelector("#pickup-search-results").hidden'),'Reset did not clear search');
    await js('window.fetch=phase8Fetch; void 0');
    for(let cycle=0;cycle<3;cycle++) { await tab('beranda');await ready('#own-location-map .sp-status-pin'); await tab('setor-sampah');await ready('#pickup-location-picker .leaflet-container'); }
    assert.equal(await js('document.querySelectorAll("#pickup-location-picker .leaflet-container").length'),1);
    await tab('laporan-fasilitas'); await click('#facility-new');await ready('#facility-location-picker .leaflet-container');await capture('facility');
    await tab('riwayat-payout');await capture('history');
    await tab('lacak-pickup');
    await js(`document.querySelector('#track-number-search').value=${JSON.stringify(tracking)};document.querySelector('#tracking-search-form').requestSubmit();void 0`);
    await text('#track-disp-number',tracking);
    await capture('tracking');
    await js(`const trackingInput=document.querySelector('#track-number-search');trackingInput.value='';trackingInput.dispatchEvent(new Event('input',{bubbles:true}));void 0`);
    await js('document.querySelector("#tracking-search-form").requestSubmit(); void 0');
    await text('#tracking-feedback','Masukkan nomor');
    await tab('pengaturan');await capture('settings');
    await login('collector@phase1.invalid','/petugas');await ready('#desktop-greeting');await capture('petugas');
    await click('.sidebar-item[onclick*="operations"]');await ready('[data-map-canvas] .leaflet-pane');await capture('petugas-map','[data-map-canvas]');
    await login('admin@phase1.invalid','/admin');
    await click('[aria-controls="admin-operation-map"]');await ready('[data-map-canvas] .leaflet-pane');await capture('admin-map','[data-map-canvas]');
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('PASS Chromium Phase 8: HTTP500 recovery, A-B-A geocode race and abort, reset, repeated map activation, five widths, User/Petugas/Admin screenshots. '+out);
}
