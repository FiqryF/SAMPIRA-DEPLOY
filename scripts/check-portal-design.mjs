import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkPortalDesign({send,js,nav,login,click,text,waitFor,profile}) {
 const out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS || profile,'roles'); await mkdir(out,{recursive:true});
 const q=JSON.stringify;
 const ready=selector=>waitFor(()=>js('Boolean(document.querySelector('+q(selector)+')?.getClientRects().length)'),'Missing '+selector);
 const tab=id=>click('.hub-tab[data-target="'+id+'"]');
 const data=path=>js('portalFetch('+q(path)+').then(async response=>{if(!response.ok)throw Error("API read failed");return (await response.json()).data;})');
 const post=(path,body,expected=200)=>js('portalFetch('+q(path)+',{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify('+q(body)+')}).then(async response=>{if(response.status!=='+expected+')throw Error("Fixture write failed: "+response.status);return (await response.json()).data;})');
 async function capture(name,selector) {
  await js('document.fonts.ready');
  for(const width of [360,390,768,1280,1440]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<600});
   if(selector)await js('document.querySelector('+q(selector)+').scrollIntoView({block:"start",behavior:"instant"}); void 0');
   else await js('window.scrollTo(0,0); void 0');
   await sleep(180);
   const dimensions=await js('({page:document.documentElement.scrollWidth,viewport:innerWidth})');
   assert(dimensions.page<=dimensions.viewport+2,'Overflow '+name+' '+JSON.stringify(dimensions));
   if(width===390||width===1440){const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'-'+width+'.png'),Buffer.from(data,'base64'));}
  }
 }
 await login('collector@phase1.invalid','/petugas'); const officer=await js('portalUser("petugas")');
 await login('owner@phase1.invalid','/dashboard'); await ready('#own-location-map .leaflet-pane');
 await capture('user-home');
 await capture('user-home-map','.sp-overview-layout');
 await capture('user-home-status','.sp-request-status-panel');
 await capture('user-home-reward','.sp-home-lower');
 await tab('setor-sampah');await capture('user-pickup-map');await capture('user-pickup-fields','.sp-request-fields');
 await tab('laporan-fasilitas');await click('#facility-new');await ready('#facility-form');await capture('user-report-map');await capture('user-report-fields','#facility-form .sp-request-fields');
 await tab('riwayat-payout');await capture('user-history');
 await tab('edukasi');await capture('user-education');
 await tab('pengaturan');await capture('user-settings');
 await nav('/profile');await text('#profile-user-name','Legacy Owner');await capture('user-profile');
 const before=await data('/api/user/profile');
 await js('document.querySelector("#profile-data-form").requestSubmit(); void 0');await text('#profile-save-status','berhasil disimpan');
 const after=await data('/api/user/profile');
 for(const key of ['name','phone','address','payout_method','payout_account_name','payout_account_number'])assert.equal(after[key] || "",before[key] || "",'Profile must preserve '+key);
 await js(`window.profileOriginalFetch=window.fetch;window.fetch=(url,options)=>String(url).endsWith('/api/user/profile')?Promise.resolve(Response.json({status:'error'},{status:500})):profileOriginalFetch(url,options);loadUserData();void 0`);
 await ready('#profile-retry');assert.equal(await js('document.querySelector("#profile-data-form [type=submit]").disabled'),true);
 await js('window.fetch=profileOriginalFetch;void 0');await click('#profile-retry');await waitFor(()=>js('document.querySelector("#profile-retry").hidden && !document.querySelector("#profile-data-form [type=submit]").disabled'),'Profile recovery failed');
 await click('[data-target="pane-settings"]');await capture('user-profile-settings');
 assert.equal(await js('Boolean(document.querySelector("#profile-two-factor, #profile-notify-whatsapp"))'),false);
 await click('[data-target="pane-policy"]');await capture('user-profile-policy');
 // Real, isolated fixtures make the assignment, field form and weighing UI reachable.
 const pickup=await js(`(async()=>{const form=new FormData();for(const [key,value] of Object.entries({item_description:'QA tampilan tugas lapangan',pickup_address:'Jalan Uji Tampilan Bandung 17',contact_phone:'081234567890',category:'Computers',weight_kg:'2',latitude:'-6.91',longitude:'107.62'}))form.set(key,value);const response=await portalFetch('/api/ecorecycle/request_pickup',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:form});if(response.status!==201)throw Error('Pickup fixture failed');return (await response.json()).data;})()`);
 const report=await js(`(async()=>{const form=new FormData();for(const [key,value] of Object.entries({category:'tps',title:'QA desain fasilitas empat role',description:'Periksa fasilitas pengumpulan pada fixture pengujian visual.',address:'Jalan Uji Fasilitas Bandung 18',latitude:'-6.92',longitude:'107.63'}))form.set(key,value);const response=await portalFetch('/api/ecorecycle/facility-reports',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:form});if(response.status!==201)throw Error('Report fixture failed');return (await response.json()).data;})()`);
 await login('admin@phase1.invalid','/admin');await ready('#admin-overview');await capture('admin-overview');
 await click('[aria-controls="admin-report-verification"]');await ready('#facility-list');await capture('admin-verification');
 await post('/api/ecorecycle/facility-reports/'+report.id+'/verification',{version:report.version,status:'approved'});
 await click('[aria-controls="admin-facility-handling"]');await capture('admin-handling');
 await js(`Array.from(document.querySelectorAll('#admin-facility-handling tbody tr')).find(row=>row.textContent.includes(${q(report.tracking_number)})).querySelector('button').click(); void 0`);
 await ready('#admin-facility-handling .handling-actions');
 await js(`Array.from(document.querySelectorAll('#admin-facility-handling .handling-actions button')).find(button=>button.textContent==='Tugaskan Petugas').click(); void 0`);
 await ready('#admin-facility-handling dialog[open]');
 await waitFor(()=>js('Boolean(document.querySelector('+q('#admin-facility-handling dialog option[value="'+officer.id+'"]')+'))'),'Officer choice missing');
 await capture('admin-assignment');
 await js(`document.querySelector('#admin-facility-handling dialog [name=petugas_id]').value=${q(String(officer.id))};document.querySelector('#admin-facility-handling dialog form').requestSubmit();void 0`);
 await waitFor(()=>js('!document.querySelector("#admin-facility-handling dialog[open]")'),'Assignment did not save');
 await click('[aria-controls="admin-operation-map"]');await ready('[data-map-canvas] .leaflet-pane');await capture('admin-monitoring');
 await click('[aria-controls="education-cms"]');await capture('admin-education');await click('#education-add');await ready('#education-cms dialog[open]');await capture('admin-editor');await click('#education-close');
 await login('collector@phase1.invalid','/petugas');await ready('#upcoming-task-list');await capture('petugas-dashboard');
 await post('/api/ecorecycle/assign_collector',{tracking_number:pickup.tracking_number});
 await js('viewActiveMission('+q(pickup.tracking_number)+'); void 0');await text('#mission-resi',pickup.tracking_number);await capture('petugas-mission');
 for(const status of ['transit','arrived'])await post('/api/ecorecycle/pickup_status',{tracking_number:pickup.tracking_number,status});
 await js('viewActiveMission('+q(pickup.tracking_number)+'); void 0');await text('#mission-btn','Catat Berat Aktual');await click('#mission-btn');await ready('.swal2-popup');await capture('petugas-weighing');await click('.swal2-cancel');
 for(const view of ['history','earnings','profile','operations']) {
  await js('switchView('+q(view)+'); void 0');await ready('#view-'+view);await capture('petugas-'+view);
 }
 await click('.sidebar-item[data-open-handling]');await text('#view-facility','QA desain fasilitas empat role');await capture('petugas-facility');
 await js(`Array.from(document.querySelectorAll('#view-facility .handling-card')).find(card=>card.textContent.includes('QA desain fasilitas empat role')).querySelector('button').click(); void 0`);
 await ready('#view-facility .handling-actions');await capture('petugas-facility-detail');
 const actions=await js(`Array.from(document.querySelectorAll('#view-facility .handling-actions button')).map(button=>button.textContent)`);
 if(actions.includes('Mulai asesmen')) {
  await js(`Array.from(document.querySelectorAll('#view-facility .handling-actions button')).find(button=>button.textContent==='Mulai asesmen').click(); void 0`);
  await ready('#view-facility dialog[open]');await capture('petugas-facility-assessment');
  await js('document.querySelector("#view-facility dialog form").requestSubmit(); void 0');
  await waitFor(()=>js('!document.querySelector("#view-facility dialog[open]")'),'Assessment did not start');
  await js(`Array.from(document.querySelectorAll('#view-facility .handling-actions button')).find(button=>button.textContent==='Catat hasil pemeriksaan').click(); void 0`);
  await ready('#view-facility dialog[open] input[type=file]');await capture('petugas-facility-evidence');
  await js('document.querySelector("#view-facility dialog").close(); void 0');
 }
 await login('administrator@phase1.invalid','/administrator');await ready('#sp-system-metrics');await capture('administrator-overview');await capture('administrator-announcements','#content-view');await capture('administrator-payments','#system-payments');
 if(await js('!document.querySelector("#reward-payment-form").hidden'))await capture('administrator-proof','#reward-payment-form');
 await send('Emulation.clearDeviceMetricsOverride');
 console.log('PASS four-role design: existing views, profile save/payout preservation, assignment, mission, weighing dialog, evidence workspace, CMS, payments; five widths. '+out);
}
