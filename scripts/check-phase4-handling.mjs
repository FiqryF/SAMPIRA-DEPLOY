// Runs only against the isolated MariaDB and Go instance prepared by check-phase1-migration.mjs.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const {SAMPIRA_TEST_MYSQL, SAMPIRA_TEST_PASSWORD} = process.env;
assert(SAMPIRA_TEST_MYSQL && SAMPIRA_TEST_PASSWORD);
const database = 'sampira_phase1_test';
const base = 'http://127.0.0.1:18081';
const reports = '/api/ecorecycle/facility-reports';
const list = reports + '/handling';
const connection = ['--no-defaults','--protocol=tcp','-h','127.0.0.1','-P','13316','-u','root'];
const sql = (query, schema = database) => execFileSync(SAMPIRA_TEST_MYSQL, [
    ...connection,'-N','-B',...(schema ? [schema] : [])
], {input:query, encoding:'utf8'}).trim();
assert.equal(sql("SELECT COUNT(*) FROM users WHERE id=101 AND email='admin@phase1.invalid'"),'1');

const oldTables = 'facility_reports, facility_report_history, facility_report_photos, pickups, pickup_history, pickup_rewards, transactions';
const fingerprint = (schema = database) => sql('CHECKSUM TABLE ' + oldTables + ' EXTENDED',schema).replaceAll(schema + '.','');
const old = fingerprint();
const migration = readFileSync(new URL('../db_init/migrations/003_facility_handling.sql',import.meta.url),'utf8');
const handlingTables = ['facility_handling','facility_assignments','facility_handling_events','facility_handling_photos'];
const upgrade = 'sampira_phase4_upgrade';
assert.equal(sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='"+upgrade+"'",null),'0');
const legacyDump = execFileSync(join(dirname(SAMPIRA_TEST_MYSQL),'mysqldump.exe'),[
    ...connection,'--single-transaction','--skip-add-drop-table','--hex-blob',
    ...handlingTables.map(table=>'--ignore-table='+database+'.'+table),database
]);
sql('CREATE DATABASE ' + upgrade,null);
sql(legacyDump,upgrade);
assert.equal(fingerprint(upgrade),old);
sql(migration,upgrade);
sql(migration,upgrade);
assert.equal(fingerprint(upgrade),old);
assert.equal(sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('facility_handling','facility_assignments','facility_handling_events','facility_handling_photos')",upgrade),'4');
assert.equal(sql('SELECT COUNT(*) FROM facility_handling',upgrade),'0');
console.log('PASS Phase 4A migration on populated Phase 3A restore, replay and old data checksums.');

async function call(path,{user,cookie,origin,method='GET',body,key}={}) {
    const headers={};
    if(user) headers.Authorization='Bearer '+user.token;
    if(cookie) headers.Cookie=cookie;
    if(origin) headers.Origin=origin;
    if(key) headers['Idempotency-Key']=key;
    if(body && !(body instanceof FormData)){
        headers['Content-Type']='application/json';
        body=JSON.stringify(body);
    }
    const response=await fetch(base+path,{method,headers,body,redirect:'manual'});
    const isJSON=response.headers.get('content-type')?.includes('application/json');
    return {code:response.status,headers:response.headers,body:isJSON?await response.json():Buffer.from(await response.arrayBuffer())};
}

async function expect(path,code,options) {
    const result=await call(path,options);
    assert.equal(result.code,code,path+' '+(result.body.message||''));
    return result;
}
async function login(email,role) {
    const {body,headers}=await expect('/api/auth/login',200,{method:'POST',body:{email,password:SAMPIRA_TEST_PASSWORD}});
    assert.equal(body.data.role,role);
    return {...body.data,cookie:headers.get('set-cookie').split(';')[0]};
}
async function newAccount(role) {
    const email=randomUUID()+'@phase4.invalid';
    await expect('/api/auth/register',201,{method:'POST',body:{name:'Isolated Phase 4 account',email,password:SAMPIRA_TEST_PASSWORD}});
    if(role==='admin') sql("UPDATE users SET role='admin' WHERE email='"+email+"'");
    return login(email,role);
}
const user=await login('owner@phase1.invalid','user');
const admin=await login('admin@phase1.invalid','admin');
const officer=await login('collector@phase1.invalid','petugas');
let second=await login('second-collector@phase1.invalid','petugas');
const administrator=await login('administrator@phase1.invalid','administrator');
const admin2=await newAccount('admin');
const other=await newAccount('user');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64');
function form(fields,photo) {
    const body=new FormData();
    for(const [name,value] of Object.entries(fields)) body.set(name,String(value));
    if(photo) body.set('photo',new Blob([photo],{type:'image/png'}),'fixture.png');
    return body;
}
async function report(status='approved') {
    const {body}=await expect(reports,201,{method:'POST',user,key:randomUUID(),body:form({
        category:'tps',title:'Kondisi pintu TPS',description:'Pintu perlu penilaian petugas.',address:'Jalan Fixture Bandung',
        latitude:-6.923501,longitude:107.611209
    })});
    if(status!=='pending') await expect(reports+'/'+body.data.id+'/verification',200,{method:'POST',user:admin,
        body:{version:1,status,note:status==='rejected'?'Laporan duplikat.':null}});
    return body.data.id;
}
const pending=await report('pending');
const rejected=await report('rejected');
const id=await report();
const raceID=await report();
const originalFingerprint=fingerprint();
const detail=reports+'/'+id;
const path=detail+'/handling';
const race=reports+'/'+raceID+'/handling';
const history=path+'/history';
const photoPath=version=>history+'/'+version+'/photo';
const post=(user,body)=>({method:'POST',user,body});
const assign=(version,petugas_id,actor=admin,internal_note)=>post(actor,{version,petugas_id,internal_note});
const activity=(actor,version,action,fields={},photo)=>post(actor,form({version,action,...fields},photo));
const review=(version,decision,fields={})=>post(admin,{version,decision,...fields});
const coordination=(version,status,fields={},photo)=>post(admin,form({version,status,internal_note:'Catatan koordinasi privat.',...fields},photo));
const beforeDetail=(await expect(detail,200,{user})).body.data;
const beforeHistory=(await expect(detail+'/history',200,{user})).body.data;
async function expectLocation(actor) {
    const {body:{data}}=await expect(path,200,{user:actor});
    assert.deepEqual([data.latitude,data.longitude,data.address],[-6.923501,107.611209,'Jalan Fixture Bandung']);
}
for(const route of [list,path,history,photoPath(1),list+'/officers']) await expect(route,401);
for(const route of [list,path,history,photoPath(1),list+'/officers']) await expect(route,403,{user:administrator});
await expect(list,403,{user});
await expect(list+'/officers',403,{user:officer});
await expect(path,404,{user:other});
await expect(history,404,{user:other});
await expect(photoPath(1),404,{user:other});
await expect(path,404,{user:officer});
await expect(detail,403,{user:officer});
for(const rejectedID of [pending,rejected]){
    const blocked=reports+'/'+rejectedID+'/handling';
    const item=(await expect(blocked,200,{user})).body.data;
    assert.equal(item.status,null);
    assert.equal(item.assignment_status,null);
    await expect(blocked+'/assignment',409,assign(0,officer.id));
}
const unassigned=(await expect(path,200,{user})).body.data;
assert.equal(unassigned.status,'approved');
assert.equal(unassigned.version,0);
assert.equal(unassigned.assignment_status,'unassigned');
assert.equal(unassigned.coordination_status,'not_forwarded');
await expectLocation(admin);
await expectLocation(user);
assert.equal((await expect(list+'?status=approved&category=tps&limit=1',200,{user:admin})).body.data.next_before_id,raceID);
await expect(list+'?status=pending',400,{user:admin});
assert.equal((await expect(list+'/officers?limit=1',200,{user:admin})).body.data.items[0].id,second.id);
await expect(path+'/assignment',403,assign(0,officer.id,user));
await expect(path+'/assignment',400,post(admin,{petugas_id:officer.id}));
await expect(path+'/assignment',400,post(admin,{version:0,petugas_id:officer.id,actor_id:admin.id}));
await expect(path+'/assignment?version=0',400,assign(0,officer.id));
await expect(path+'/assignment',409,assign(0,admin.id));
sql('UPDATE users SET is_active=0 WHERE id='+second.id);
try{
    await expect(path+'/assignment',409,assign(0,second.id));
    assert(!(await expect(list+'/officers',200,{user:admin})).body.data.items.some(item=>item.id===second.id));
    await expect(list,401,{user:second});
}finally{sql('UPDATE users SET is_active=1 WHERE id='+second.id);}
second=await login('second-collector@phase1.invalid','petugas');

sql("CREATE TRIGGER phase4_fixture_history_failure BEFORE INSERT ON facility_handling_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'");
try{
    await expect(path+'/assignment',500,assign(0,officer.id));
    assert.equal(sql('SELECT COUNT(*) FROM facility_assignments WHERE report_id='+id),'0');
    assert.equal((await expect(path,200,{user})).body.data.version,0);
}finally{sql('DROP TRIGGER phase4_fixture_history_failure');}

const assignments=await Promise.all([call(path+'/assignment',assign(0,officer.id)),call(path+'/assignment',assign(0,officer.id,admin2))]);
assert.deepEqual(assignments.map(item=>item.code).sort(),[200,409]);
const initial=assignments.find(item=>item.code===200).body.data;
assert.equal(initial.assignment.petugas_id,officer.id);
assert.equal(initial.version,1);
await expectLocation(officer);
assert.throws(()=>sql("INSERT INTO facility_assignments (report_id,petugas_id,assigned_by,status,assigned_at) VALUES ("+
    [id,second.id,admin.id].join(',')+",'active',UTC_TIMESTAMP(6))"),err=>String(err.stderr).includes('uq_handling_active_report'));
assert.deepEqual((await expect(list,200,{user:officer})).body.data.items.map(item=>item.report_id),[id]);
await expect(path,404,{user:second});
await expect(path+'/activity',404,activity(second,1,'start_assessment'));
await expect(path+'/activity',403,activity(user,1,'start_assessment'));
await expect(path+'/activity',409,activity(officer,1,'submit_resolution',{result:'Terlalu awal'}));

await expect(race+'/assignment',200,assign(0,officer.id));
const racing=await Promise.all([
    call(race+'/assignment',assign(1,second.id,admin,'Alihkan saat Petugas mengirim asesmen.')),
    call(race+'/activity',activity(officer,1,'start_assessment'))
]);
assert.equal(racing.filter(result=>result.code===200).length,1);
assert(racing.some(result=>[404,409].includes(result.code)));
const raceState=(await expect(race,200,{user:admin})).body.data;
const disabledOfficer=raceState.assignment.petugas_id===officer.id?officer:second;
const alternate=disabledOfficer===officer?second:officer;
sql('UPDATE users SET is_active=0 WHERE id='+disabledOfficer.id);
try{
    await expect(race,401,{user:disabledOfficer});
    await expect(race+'/assignment',200,assign(raceState.version,alternate.id,admin,'Akun Petugas lama nonaktif.'));
}finally{sql('UPDATE users SET is_active=1 WHERE id='+disabledOfficer.id);}
assert.equal(sql("SELECT COUNT(*) FROM facility_assignments WHERE report_id="+raceID+" AND status='active'"),'1');

let current=initial;
async function mutate(segment,options) {
    current=(await expect(path+'/'+segment,200,options)).body.data;
    return current;
}
await mutate('activity',activity(officer,current.version,'start_assessment'));
assert.equal(current.status,'assessment_in_progress');
const assessment={condition:'Engsel pintu macet.',assessment:'Pintu tidak bisa ditutup.',
    internal_note:'Nomor kontak privat',public_note:'Pemeriksaan lapangan dilakukan.'};
await expect(path+'/activity',400,activity(officer,current.version,'record_assessment',assessment,Buffer.from('<svg/>')));
await expect(path+'/activity',400,activity(officer,current.version,'record_assessment',{...assessment,actor_id:officer.id},image));
sql("CREATE TRIGGER phase4_fixture_photo_failure BEFORE INSERT ON facility_handling_photos FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'");
try{
    await expect(path+'/activity',500,activity(officer,current.version,'record_assessment',assessment,image));
    assert.equal((await expect(path,200,{user:admin})).body.data.version,current.version);
    assert.equal((await expect(history,200,{user:admin})).body.data.items.length,current.version);
}finally{sql('DROP TRIGGER phase4_fixture_photo_failure');}
await mutate('activity',activity(officer,current.version,'record_assessment',assessment,image));
const oldEvidence=current.version;
assert.equal(current.status,'handling_in_progress');
const privatePhoto=await expect(photoPath(oldEvidence),200,{user:officer});
assert.equal(privatePhoto.headers.get('cache-control'),'no-store');
assert.equal(privatePhoto.headers.get('cross-origin-resource-policy'),'same-origin');
assert.deepEqual(privatePhoto.body,image);
await expect(photoPath(oldEvidence),404,{user});

await expect(path+'/coordination',403,{...coordination(current.version,'forwarded'),user:officer});
await expect(path+'/coordination',409,coordination(current.version,'follow_up_reported'));
await mutate('coordination',coordination(current.version,'forwarded',{agency:'Instansi Fixture',channel:'Surat',
    forwarded_at:'2025-01-01T08:00:00+07:00',reference:'SURAT-FIXTURE'},image));
const communication=current.version;
assert.equal(current.coordination_status,'forwarded');
assert.equal(current.status,'handling_in_progress');
await expect(photoPath(communication),200,{user:admin});
await expect(photoPath(communication),404,{user:officer});
await expect(photoPath(communication),404,{user});
await expect(path+'/coordination',400,coordination(current.version,'receipt_confirmed'));
await mutate('coordination',coordination(current.version,'receipt_confirmed',{reference:'TERIMA-FIXTURE'}));
await mutate('coordination',coordination(current.version,'follow_up_reported',{internal_note:'Instansi melaporkan jadwal pemeriksaan.'}));
await expect(path+'/coordination',409,coordination(current.version,'resolution_verified',{reference:'VERIF-FIXTURE'}));
await mutate('activity',activity(officer,current.version,'record_progress',{action_taken:'Memeriksa kapasitas penanganan.'}));
await expect(path+'/assignment',409,assign(current.version,second.id));
await mutate('assignment',assign(current.version,second.id,admin,'Alihkan ke petugas pengganti.'));
assert.equal(current.status,'assigned');
assert.equal(sql("SELECT status FROM facility_assignments WHERE id="+initial.assignment.id),'reassigned');
await expect(path,404,{user:officer});
await expectLocation(second);
await expect(history,404,{user:officer});
await expect(photoPath(oldEvidence),404,{user:officer});
await expect(path+'/activity',404,activity(officer,current.version-1,'record_progress',{action_taken:'Perubahan lama'}));
await expect(path+'/activity',409,activity(second,current.version-1,'start_assessment'));
await mutate('activity',activity(second,current.version,'start_assessment'));
await mutate('activity',activity(second,current.version,'record_assessment',assessment,image));
await mutate('activity',activity(second,current.version,'submit_resolution',{result:'Pemeriksaan tuntas. Perbaikan fisik dilakukan instansi.'},image));
assert.equal(current.status,'resolution_submitted');
await expect(path+'/activity',409,activity(second,current.version-1,'submit_resolution',{result:'Retry pengiriman.'}));
await expect(path+'/review',400,review(current.version,'request_revision'));
await mutate('review',review(current.version,'request_revision',{internal_note:'Tambahkan hasil uji pengunci.',public_note:'Hasil masih diperiksa.'}));
assert.equal(current.status,'resolution_revision_required');
assert((await expect(history,200,{user:second})).body.data.items.some(event=>event.internal_note==='Tambahkan hasil uji pengunci.'));
await expect(path+'/activity',409,activity(second,current.version,'submit_resolution',{result:'Belum mencatat koreksi.'}));
await mutate('activity',activity(second,current.version,'record_progress',{action_taken:'Menguji pengunci setelah tindakan instansi.'}));
await mutate('activity',activity(second,current.version,'submit_resolution',{result:'Pengunci lulus uji.'},image));
const published=current.version;
await expect(path+'/review',409,review(current.version,'complete',{public_note:'Tervalidasi.',public_evidence_version:oldEvidence}));
await expect(path+'/review',409,review(current.version,'complete',{public_note:'Tervalidasi.',public_evidence_version:communication}));
await mutate('review',review(current.version,'complete',{public_note:'Pengunci diuji dan berfungsi.',public_evidence_version:published}));
assert.equal(current.status,'completed');
assert.equal(current.assignment.status,'completed');
assert.equal(current.coordination_status,'follow_up_reported');
await expect(path+'/assignment',409,assign(current.version,officer.id,admin,'Sudah selesai.'));
await expect(path+'/activity',404,activity(second,current.version,'record_progress',{action_taken:'Setelah tutup'}));
await expectLocation(second);
await mutate('coordination',coordination(current.version,'resolution_verified',{reference:'VERIF-FIXTURE'}));
assert.equal(current.status,'completed');
assert.equal(current.coordination_status,'resolution_verified');

const publicState=(await expect(path,200,{user})).body.data;
assert.equal(publicState.public_result,'Pengunci diuji dan berfungsi.');
assert.equal(publicState.public_evidence_version,published);
assert.equal(publicState.assignment_status,'completed');
assert(!('assignment' in publicState));
assert.deepEqual((await expect(photoPath(published),200,{user})).body,image);
await expect(photoPath(oldEvidence),404,{user});
const page=(await expect(history+'?limit=2',200,{user})).body.data;
assert.equal(page.next_before_version,current.version-1);
assert.equal((await expect(history+'?before_version='+page.next_before_version,200,{user})).body.data.items[0].version,current.version-2);
const publicHistory=(await expect(history,200,{user})).body.data.items;
assert.equal(publicHistory.length,current.version);
assert.equal(new Set(publicHistory.map(event=>event.version)).size,current.version);
assert(publicHistory.find(event=>event.version===published).has_photo);
for(const event of publicHistory){
    for(const field of ['actor_id','assignment_id','petugas_id','internal_note','condition','assessment','action_taken','result','agency','channel','reference','forwarded_at']) {
        assert(!(field in event),'Leaked '+field);
    }
}
const adminHistory=(await expect(history,200,{user:admin})).body.data.items;
assert.equal(adminHistory.find(event=>event.version===communication).agency,'Instansi Fixture');
assert.equal(adminHistory.find(event=>event.version===communication).forwarded_at,'2025-01-01T01:00:00Z');
assert.equal(adminHistory.find(event=>event.action==='assign').petugas_id,officer.id);
assert.equal(adminHistory.find(event=>event.action==='reassign').petugas_id,second.id);
assert.deepEqual((await expect(detail,200,{user})).body.data,beforeDetail);
assert.deepEqual((await expect(detail+'/history',200,{user})).body.data,beforeHistory);
assert.equal(fingerprint(),originalFingerprint);
console.log('PASS Phase 4A: RBAC, assignment/reassignment races, inactive officer, stale versions, field activity, evidence privacy, coordination, public history and transactional rollback. Phase 2/3A data preserved.');
