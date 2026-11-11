// Synthetic accounts and fixtures only. Invoked by check-phase6b-fixture.ps1.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';

const base='http://127.0.0.1:18081';
const password=process.env.SAMPIRA_TEST_PASSWORD;
assert(password && process.env.SAMPIRA_TEST_MYSQL);
const sql=(query,database='sampira_phase1_test')=>execFileSync(process.env.SAMPIRA_TEST_MYSQL,['--no-defaults','--protocol=tcp','-h','127.0.0.1','-P','13316','-u','root','-N','-B',database,'-e',query],{encoding:'utf8'}).trim();
const count=query=>Number(sql(query));
async function request(path,{actor,body,method,key,cookie,origin}={}) {
 const response=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{...(actor?{Authorization:'Bearer '+actor.token}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});
 return {code:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function expect(path,status,options){const result=await request(path,options);assert.equal(result.code,status,path+' '+JSON.stringify(result.body));return result.body.data;}
async function login(email){return expect('/api/auth/login',200,{body:{email,password}});}
async function user(){const email=randomUUID()+'@phase9.invalid';await expect('/api/auth/register',201,{body:{name:'Phase 9 fixture',email,password}});return login(email);}
const owner=await user(),other=await user();
const officer=await login('collector@phase1.invalid');
const admin=await login('admin@phase1.invalid');
const administrator=await login('administrator@phase1.invalid');
const ownPaths=['/api/user/contributions','/api/user/points','/api/user/rewards','/api/user/vouchers','/api/vouchers'];
const systemPaths=['/api/administrator/vouchers','/api/administrator/accounts','/api/administrator/contribution-audit'];
for(const path of [...ownPaths,...systemPaths,'/api/analytics','/api/analytics/facility-grid'])await expect(path,401);
for(const actor of [owner,officer,admin,administrator]){
 for(const path of ownPaths)await expect(path,actor===owner?200:403,{actor});
 for(const path of systemPaths)await expect(path,actor===administrator?200:403,{actor});
 await expect('/api/analytics',200,{actor});
 await expect('/api/analytics/facility-grid',[admin,administrator].includes(actor)?200:403,{actor});
 await expect('/api/administrator/vouchers',actor===administrator?400:403,{actor,body:{}});
 await expect('/api/vouchers/1/redeem',actor===owner?400:403,{actor,body:{}});
 await expect('/api/administrator/accounts/1',actor===administrator?400:403,{actor,method:'PATCH',body:{}});
 await expect('/api/administrator/pickup-rewards/1/void',actor===administrator?400:403,{actor,body:{}});
}
const begin=await expect('/api/user/contributions',200,{actor:owner});assert.equal(begin.balance,0);

async function pickup(actor,weight=2.5){
 const p=await expect('/api/ecorecycle/request_pickup',201,{actor,key:randomUUID(),body:{item_description:'Sampah uji kontribusi',category:'Computers',weight_kg:999,pickup_address:'Alamat privat Phase 9 Bandung',contact_phone:'081234567890',latitude:-6.91,longitude:107.61}});
 await expect('/api/ecorecycle/assign_collector',200,{actor:officer,body:{tracking_number:p.tracking_number}});
 for(const status of ['transit','arrived'])await expect('/api/ecorecycle/pickup_status',200,{actor:officer,body:{tracking_number:p.tracking_number,status}});
 return {...p,weight};
}
const p=await pickup(owner);
const verification={actor:officer,body:{pickup_id:p.pickup_id,final_weight_kg:p.weight}};
// Fault at the final ledger stage must roll back weight, reward and wallet.
sql("CREATE TRIGGER phase9_credit_failure BEFORE INSERT ON point_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PRIVATE FAILURE'");
try{
 await expect('/api/ecorecycle/verify_pickup',500,verification);
 assert.equal(sql('SELECT status FROM pickups WHERE id='+p.pickup_id),'arrived');
 assert.equal(count('SELECT COUNT(*) FROM pickup_rewards WHERE pickup_id='+p.pickup_id),0);
 assert.equal(count('SELECT COUNT(*) FROM cash_reward_events WHERE pickup_id='+p.pickup_id),0);
 assert.equal(count('SELECT COUNT(*) FROM point_wallets WHERE user_id='+owner.id),0);
}finally{sql('DROP TRIGGER phase9_credit_failure');}
const race=await Promise.all([1,2,3].map(()=>request('/api/ecorecycle/verify_pickup',verification)));
assert.deepEqual(race.map(r=>r.code).sort(),[200,409,409]);
assert.equal(count('SELECT amount FROM pickup_rewards WHERE pickup_id='+p.pickup_id),15000);
assert.equal(count('SELECT COUNT(*) FROM cash_reward_events WHERE pickup_id='+p.pickup_id),1);
assert.equal((await expect('/api/user/contributions',200,{actor:owner})).balance,25);
assert.equal((await expect('/api/user/contributions',200,{actor:other})).balance,0);
await expect('/api/ecorecycle/verify_pickup',409,verification);

const validFrom=new Date(Date.now()-3600000).toISOString(),validUntil=new Date(Date.now()+86400000).toISOString();
const voucherBody={name:'Voucher demonstrasi',description:'SIMULASI, tidak berlaku di merchant.',category:'simulasi',point_cost:10,stock:3,valid_from:validFrom,valid_until:validUntil,active:true};
async function voucher(overrides={}){return expect('/api/administrator/vouchers',200,{actor:administrator,body:{...voucherBody,...overrides}});}
const v=await voucher();
const redeem=(actor,id,key=randomUUID())=>({actor,key,method:'POST'});
await expect(`/api/vouchers/${v.id}/redeem`,409,redeem(other,v.id));
await expect(`/api/vouchers/${v.id}/redeem`,400,{actor:owner,method:'POST',key:'invalid'});
const key=randomUUID();
// Failure in audit occurs after stock debit: all changes must roll back.
sql("CREATE TRIGGER phase9_redeem_failure BEFORE INSERT ON phase9_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PRIVATE AUDIT FAILURE'");
try{
 await expect(`/api/vouchers/${v.id}/redeem`,500,redeem(owner,v.id,key));
 assert.equal(count('SELECT stock FROM voucher_catalog WHERE id='+v.id),3);
 assert.equal(count('SELECT balance FROM point_wallets WHERE user_id='+owner.id),25);
 assert.equal(count('SELECT COUNT(*) FROM voucher_redemptions WHERE user_id='+owner.id),0);
}finally{sql('DROP TRIGGER phase9_redeem_failure');}
const redeemed=await Promise.all(Array.from({length:5},()=>request(`/api/vouchers/${v.id}/redeem`,redeem(owner,v.id,key))));
assert.deepEqual(redeemed.map(r=>r.code).sort(),[200,200,200,200,201]);
assert(redeemed.every(r=>JSON.stringify(r.body.data)===JSON.stringify(redeemed[0].body.data)));
assert.equal(count('SELECT balance FROM point_wallets WHERE user_id='+owner.id),15);
assert.equal(count('SELECT lifetime FROM point_wallets WHERE user_id='+owner.id),25);
assert.equal(count('SELECT stock FROM voucher_catalog WHERE id='+v.id),2);
const otherVoucher=await voucher();await expect(`/api/vouchers/${otherVoucher.id}/redeem`,409,redeem(owner,otherVoucher.id,key));
const own=await expect('/api/user/vouchers',200,{actor:owner});assert.equal(own.length,1);assert.equal(own[0].simulation,true);
assert.deepEqual(await expect('/api/user/vouchers',200,{actor:other}),[]);
const expired=await voucher();sql(`UPDATE voucher_catalog SET valid_from='2020-01-01',valid_until='2020-02-01' WHERE id=${expired.id}`);
const inactive=await voucher({active:false});const sold=await voucher({stock:0});const future=await voucher({valid_from:new Date(Date.now()+3600000).toISOString()});
for(const item of [expired,inactive,sold,future])await expect(`/api/vouchers/${item.id}/redeem`,409,redeem(owner,item.id));
await expect('/api/administrator/vouchers/'+expired.id,200,{actor:administrator,method:'PUT',body:{...voucherBody,active:false,valid_from:'2020-01-01T00:00:00Z',valid_until:'2020-02-01T00:00:00Z',version:1}});
// Catalog edits are optimistic and do not mutate previously issued snapshots.
await expect('/api/administrator/vouchers/'+v.id,409,{actor:administrator,method:'PUT',body:{...voucherBody,version:1}});
await expect('/api/administrator/vouchers/'+v.id,200,{actor:administrator,method:'PUT',body:{...voucherBody,name:'Nama baru',version:2}});
assert.equal((await expect('/api/user/vouchers',200,{actor:owner}))[0].name,voucherBody.name);

// Two independently credited users race for one unit of stock.
const p2=await pickup(other,2);await expect('/api/ecorecycle/verify_pickup',200,{actor:officer,body:{pickup_id:p2.pickup_id,final_weight_kg:2}});
const last=await voucher({stock:1});
const stockRace=await Promise.all([owner,other].map(actor=>request(`/api/vouchers/${last.id}/redeem`,redeem(actor,last.id))));
assert.deepEqual(stockRace.map(r=>r.code).sort(),[201,409]);assert.equal(count('SELECT stock FROM voucher_catalog WHERE id='+last.id),0);
const balanceBefore=count('SELECT balance FROM point_wallets WHERE user_id='+other.id);
const cheap=await voucher({point_cost:15,stock:100});
const balanceRace=await Promise.all(Array.from({length:4},()=>request(`/api/vouchers/${cheap.id}/redeem`,redeem(other,cheap.id))));
assert.equal(balanceRace.filter(r=>r.code===201).length,Math.floor(balanceBefore/15));
assert.equal(count('SELECT COUNT(*) FROM point_wallets WHERE balance<0 OR lifetime<balance'),0);
assert.equal(count('SELECT COUNT(*) FROM voucher_catalog WHERE stock<0'),0);

// Safe pending-only monetary cancellation; immutable verified weight and point award.
await expect(`/api/administrator/pickup-rewards/${p.pickup_id}/void`,200,{actor:administrator,body:{reason:'Pembatalan kewajiban untuk audit fixture'}});
await expect(`/api/administrator/pickup-rewards/${p.pickup_id}/void`,409,{actor:administrator,body:{reason:'Retry pembatalan kewajiban fixture'}});
assert.equal(count('SELECT SUM(amount) FROM cash_reward_events WHERE pickup_id='+p.pickup_id),0);
assert.equal((await expect('/api/user/rewards',200,{actor:owner}))[0].payment_status,'voided');
const paidID=sql("SELECT pickup_id FROM pickup_rewards WHERE status='paid' LIMIT 1");assert(paidID);
await expect(`/api/administrator/pickup-rewards/${paidID}/void`,409,{actor:administrator,body:{reason:'Pembayaran historis harus tidak berubah'}});

const summary=await expect('/api/analytics',200,{actor:owner});assert.equal(summary.pickups,1);assert.equal(summary.verified_weight_kg,2.5);assert.equal(summary.cash_reward,0);
assert.equal((await expect('/api/analytics',200,{actor:other})).verified_weight_kg,2);
assert(!JSON.stringify(summary).includes('107.61'));assert(!JSON.stringify(summary).includes('Alamat privat'));
for(const path of ['/api/analytics?user_id='+other.id,'/api/user/points?user_id='+other.id,'/api/user/vouchers?limit=101','/api/user/rewards?before=-1'])await expect(path,400,{actor:owner});
for(const query of ['limit=101','category=invalid','min_lat=NaN','min_lat=91&max_lat=92&min_lng=0&max_lng=1','user_id=103','limit=1&limit=2'])await expect('/api/analytics/facility-grid?'+query,400,{actor:admin});
// Controlled approved facility sample; rejected and pending locations excluded.
for(let i=0;i<3;i++)sql(`INSERT INTO facility_reports(tracking_number,reporter_id,request_key,category,title,description,address,latitude,longitude,status,version,created_at,updated_at) VALUES('GRID9-${String(i).padStart(22,'0')}',${owner.id},'${randomUUID()}','tps','Grid fixture','Valid fixture','Alamat fasilitas',-6.123456,107.123456,'approved',1,NOW(),NOW())`);
const grid=await expect('/api/analytics/facility-grid?min_lat=-6.13&max_lat=-6.12&min_lng=107.12&max_lng=107.13&category=tps',200,{actor:admin});
assert.equal(grid.cells.length,1);assert.equal(grid.cells[0].count,3);assert.equal(grid.cells[0].south,-6.13);assert(!JSON.stringify(grid).includes('user_id'));

// Account changes are audited, reject self modification/stale writes and revoke sessions.
const account=await user();
const change={role:'user',is_active:false,expected_role:'user',expected_active:true,reason:'Menonaktifkan akun sintetis pengujian'};
await expect('/api/administrator/accounts/'+administrator.id,400,{actor:administrator,method:'PATCH',body:change});
await expect('/api/administrator/accounts/'+account.id,200,{actor:administrator,method:'PATCH',body:change});
await expect('/api/analytics',401,{actor:account});
await expect('/api/administrator/accounts/'+account.id,409,{actor:administrator,method:'PATCH',body:change});
await expect('/api/administrator/accounts/'+account.id,200,{actor:administrator,method:'PATCH',body:{...change,role:'admin',is_active:true,expected_active:false}});
const roleChanged=await login(sql('SELECT email FROM users WHERE id='+account.id));assert.equal(roleChanged.role,'admin');
await expect('/api/user/points',403,{actor:roleChanged});
assert((await expect('/api/administrator/contribution-audit',200,{actor:administrator})).some(item=>item.action==='account_change'));
// Browser mutation protection applies to new endpoints too.
const browser=await request('/api/auth/login',{body:{email:sql('SELECT email FROM users WHERE id='+owner.id),password}});
await expect(`/api/vouchers/${v.id}/redeem`,403,{method:'POST',cookie:browser.cookie,origin:'https://foreign.invalid',key:randomUUID()});

const snapshot=()=>sql('SELECT * FROM point_wallets ORDER BY user_id; SELECT * FROM point_entries ORDER BY id; SELECT * FROM voucher_redemptions ORDER BY id; SELECT * FROM cash_reward_events ORDER BY id; SELECT * FROM contribution_rules; SELECT id,status,final_weight_kg,final_eco_reward FROM pickups ORDER BY id; SELECT pickup_id,amount,status FROM pickup_rewards ORDER BY pickup_id; SELECT id,SHA2(CONCAT_WS("|",name,email,password,role),256) FROM users ORDER BY id;');
const before=snapshot();const ddl=readFileSync(new URL('../db_init/migrations/008_rewards_points_vouchers.sql',import.meta.url),'utf8');sql(ddl);sql(ddl);assert.equal(snapshot(),before);
sql(ddl,'sampira_phase1_fresh');sql(ddl,'sampira_phase1_fresh');
assert.equal(Number(sql('SELECT COUNT(*) FROM point_wallets','sampira_phase1_fresh')),0);
assert.equal(Number(sql('SELECT COUNT(*) FROM voucher_catalog','sampira_phase1_fresh')),0);
assert.equal(count('SELECT COUNT(*) FROM point_entries WHERE source_key='+"'pickup:"+p.pickup_id+"'"),1);
console.log('PASS Phase 9: verified cash/points once, rollback, four-role RBAC, voucher stock/balance races, retry/conflict, expired/inactive/future rejection, private histories/analytics, grid validation, audited cash cancellation/accounts/session revocation, migration replay.');
