// Requires the isolated MariaDB/server setup in docs/phase-01-operations.md.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';

const database = 'sampira_phase1_test';
const base = 'http://127.0.0.1:18081';
const password = process.env.SAMPIRA_TEST_PASSWORD;
assert(password && process.env.SAMPIRA_TEST_MYSQL, 'Configure the isolated Phase 1 test instance first.');

function sql(query) {
    return execFileSync(process.env.SAMPIRA_TEST_MYSQL, [
        '--no-defaults', '--protocol=tcp', '-h', '127.0.0.1', '-P', '13316',
        '-u', 'root', '-N', '-B', database, '-e', query
    ], {encoding: 'utf8'}).trim();
}

async function request(path, {token, cookie, body, origin, site, portal, method = 'GET'} = {}) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    if (site) headers['Sec-Fetch-Site'] = site;
    if (portal) headers['X-SAMPIRA-Portal'] = '1';
    if (body && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
    }
    const response = await fetch(base + path, {method, headers, body, redirect: 'manual'});
    const type = response.headers.get('content-type') || '';
    const data = type.includes('json') ? await response.json() : null;
    return {code: response.status, data, headers: response.headers};
}

async function expect(path, status, options) {
    const result = await request(path, options);
    assert.equal(result.code, status, path + ' ' + (result.data?.message || ''));
    return result;
}

async function login(email, role) {
    const result = await expect('/api/auth/login', 200, {method: 'POST', body: {email, password}});
    assert.equal(result.data.data.role, role);
    const cookie = result.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/i);
    return {...result.data.data, cookie: cookie.split(';')[0]};
}

await expect('/api/auth/login?email=fixture@example.invalid&password=synthetic',400,{method:'POST'});
const admin = await login('admin@phase1.invalid', 'admin');
const administrator = await login('administrator@phase1.invalid', 'administrator');
const petugas = await login('collector@phase1.invalid', 'petugas');
const colleague = await login('second-collector@phase1.invalid', 'petugas');
const owner = await login('owner@phase1.invalid', 'user');
assert.equal(petugas.id, 102);
assert.equal(admin.id, 101);

await expect('/api/auth/login', 401, {method: 'POST', body: {email: admin.email, password: password + 'invalid'}});
let anotherUser;
for (const role of [undefined, 'admin', 'administrator', 'petugas', 'collector']) {
    const email = randomUUID() + '@phase1.invalid';
    await expect('/api/auth/register', 201, {method: 'POST', body: {name: 'Test account', email, password, role}});
    anotherUser = await login(email, 'user');
}

await expect('/administrator', 303);
for (const user of [owner, petugas, admin]) {
    await expect('/administrator', 403, user);
    await expect('/api/administrator/session', 403, user);
}
await expect('/administrator', 200, administrator);
await expect('/api/administrator/session', 200, administrator);
await expect('/api/administrator/session', 401, {token: administrator.token.slice(0, -1) + 'X'});
await expect('/api/administrator/session?token=query-only-test', 401);
for (const [route, user] of [['/admin', admin], ['/petugas', petugas], ['/dashboard', owner], ['/profile', owner]]) {
    await expect(route, 200, user);
}
await expect('/collector', 307, petugas);
await expect('/admin', 403, petugas);
await expect('/api/users/petugas', 403, petugas);
await expect('/api/users/collectors', 403, admin);
await expect('/api/users/collectors', 200, administrator);
await expect('/api/ecorecycle/announcements', 403, {...petugas, method: 'POST', body: {}});

try {
    sql('UPDATE users SET role = "user" WHERE id = ' + administrator.id);
    await expect('/api/administrator/session', 403, administrator);
    await expect('/administrator', 403, administrator);
} finally {
    sql('UPDATE users SET role = "administrator" WHERE id = ' + administrator.id);
}

const logoutSession = await login('administrator@phase1.invalid', 'administrator');
assert.notEqual(logoutSession.token, administrator.token);
const cookie = logoutSession.cookie;
const crossSite = {cookie, method: 'POST', origin: 'https://untrusted.invalid', site: 'cross-site'};
await expect('/logout', 403, crossSite);
await expect('/logout', 403, {cookie, method: 'POST', origin: 'http://localhost:18081', site: 'same-site'});
await expect('/logout', 403, {cookie, method: 'POST'});
await expect('/api/user/profile', 403, {...crossSite, body: {name: 'Blocked'}});
await expect('/api/auth/login', 403, {...crossSite, body: {email: owner.email, password}});
await expect('/api/administrator/session', 200, {cookie});
const logout = await expect('/logout', 303, {cookie, method: 'POST', origin: base, site: 'same-origin'});
assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
await expect('/api/administrator/session', 401, {token: logoutSession.token});
await expect('/administrator', 303, {cookie});
await expect('/api/administrator/session', 200, administrator);
const portalLogin = await expect('/api/auth/login', 200, {method: 'POST', origin: base, portal: true,
    body: {email: owner.email, password}});
assert.deepEqual(Object.keys(portalLogin.data.data).sort(), ['id', 'name', 'role']);
assert.match(portalLogin.headers.get('cache-control'), /no-store/);
const inactive = await login('second-collector@phase1.invalid', 'petugas');
try {
    sql('UPDATE users SET is_active=FALSE WHERE id=' + inactive.id);
    await expect('/api/user/profile', 401, inactive);
    await expect('/petugas', 303, inactive);
    await expect('/api/auth/login', 401, {method: 'POST', body: {email: inactive.email, password}});
} finally {
    sql('UPDATE users SET is_active=TRUE WHERE id=' + inactive.id);
}
const expired = await login('administrator@phase1.invalid', 'administrator');
const expiredDigest = createHash('sha256').update(expired.token).digest('hex');
sql("UPDATE auth_sessions SET expires_at=0 WHERE token_digest=UNHEX('" + expiredDigest + "')");
await expect('/administrator', 303, expired);
await expect('/api/administrator/session', 401, expired);

const api = '/api/ecorecycle/';
const list = api + 'list_pickups?type=';
const detail = tracking => api + 'pickup_status?tracking_number=' + encodeURIComponent(tracking);
await expect(list + 'petugas', 403, owner);
await expect(list + 'collector', 403, owner);
await expect(list + 'all', 403, petugas);
await expect(list + 'all', 403, administrator);
await expect(api + 'pickup_status?type=stats', 403, owner);
await expect(api + 'pickup_status?type=stats', 403, admin);
const stats = await expect(api + 'pickup_status?type=stats', 200, administrator);
assert.equal(stats.data.data.total_reward_paid, 0);
await expect(list + 'user', 200, owner);
await expect(list + 'all', 403, admin);
await expect(api + 'announcements', 403, {...admin, method: 'POST', body: {title: 'Test target', message: 'Blocked role'}});
await expect(api + 'announcements', 400, {...administrator, method: 'POST',
    body: {title: 'Test target', message: 'Invalid role', target_role: 'administrator'}});
const cms = await expect(api + 'announcements', 201, {cookie: administrator.cookie, origin: base, method: 'POST',
    body: {title: 'Test CMS', message: 'Administrator only', target_role: 'user'}});
await expect(api + 'announcements?id=' + cms.data.data.id, 200, {...administrator, method: 'DELETE'});
for (const session of [owner, petugas]) {
    const legacy = await expect(detail('PHASE1-LEGACY'), 200, session);
    assert.equal(legacy.data.data.collector_id, 102);
    assert.equal(legacy.data.data.payment_status, 'requires_reconciliation');
    assert.equal(legacy.data.data.history[0].notes, 'Legacy history');
}
await expect(detail('PHASE1-LEGACY'), 403, colleague);
await expect(detail('PHASE1-LEGACY'), 403, admin);
await expect(detail('PHASE1-LEGACY'), 403, administrator);
await expect(detail('PHASE1-LEGACY'), 403, anotherUser);
const announcements = await expect(api + 'announcements', 200, petugas);
assert(announcements.data.data.some(item => item.title === 'Phase 1 legacy' && item.target_role === 'petugas'));

const body = new FormData();
for (const [key, value] of Object.entries({
    item_description: 'Fixture pickup', pickup_address: 'Private address', contact_phone: '081000000000',
    weight_kg: '2', category: 'Computers'
})) body.append(key, value);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=', 'base64');

const unsafe = new FormData();
for (const [key, value] of body) unsafe.append(key, value);
unsafe.append('photo', new Blob(['not an image'], {type: 'image/png'}), 'fixture.png');
await expect(api + 'request_pickup', 400, {...owner, method: 'POST', body: unsafe});
await expect(api + 'request_pickup', 400, {...owner, method: 'POST',
    body: {...Object.fromEntries(body), contact_phone:'abc'}});
await expect(api + 'request_pickup', 400, {...owner, method: 'POST',
    body: {...Object.fromEntries(body), weight_kg:'0.001'}});
body.append('photo', new Blob([png], {type: 'image/png'}), 'fixture.png');
const created = (await expect(api + 'request_pickup', 201, {...owner, method: 'POST', body})).data.data;
const tracking = created.tracking_number;
const edit = {method: 'POST', body: {tracking_number: tracking, item_description: 'Updated fixture pickup',
    pickup_address: 'Private address', contact_phone: '081000000000', weight_kg: 2, category: 'Computers'}};
await expect(api + 'update_pickup', 404, {...anotherUser, ...edit});
await expect(api + 'update_pickup', 200, {...owner, ...edit});
await expect(api + 'cancel_pickup', 400, {...anotherUser, method: 'POST', body: {tracking_number: tracking}});
const photo = '/' + (await expect(detail(tracking), 200, owner)).data.data.photo_url.replace(/^\//, '');
await expect(photo, 401);
await expect(photo, 403, anotherUser);
await expect(photo, 403, petugas);
await expect(photo, 200, {cookie: owner.cookie});
const queue = (await expect(list + 'collector', 200, petugas)).data.data.find(row => row.id === created.pickup_id);
assert(queue);
for (const field of ['user_id', 'pickup_address', 'contact_phone', 'photo_url', 'item_description']) assert.equal(queue[field], null, field);
assert.equal(queue.donor_name, '');
for (const session of [admin, administrator]) {
    await expect(api + 'assign_collector', 403, {...session, method: 'POST', body: {tracking_number: tracking, collector_id: petugas.id}});
    await expect(photo, 403, session);
}
const claims = await Promise.all([petugas, colleague].map(user => request(api + 'assign_collector', {
    ...user, method: 'POST', body: {tracking_number: tracking, collector_id: admin.id}
})));
assert.deepEqual(claims.map(result => result.code).sort(), [200, 400]);
const winnerIndex = claims.findIndex(result => result.code === 200);
const winner = [petugas, colleague][winnerIndex];
const loser = [colleague, petugas][winnerIndex];
assert.equal(claims[winnerIndex].data.data.collector_id, winner.id);
await expect(photo, 200, winner);
await expect(photo, 403, loser);
await expect(detail(tracking), 403, loser);
await expect(api + 'update_pickup', 409, {...owner, ...edit});
const progress = (user, status) => ({...user, method: 'POST', body: {tracking_number: tracking, status}});
await expect(api + 'pickup_status', 403, progress(loser, 'transit'));
await expect(api + 'pickup_status', 403, progress(admin, 'transit'));
await expect(api + 'pickup_status', 400, progress(winner, 'arrived'));
const concurrentProgress = await Promise.all([1, 2].map(() => request(api + 'pickup_status', progress(winner, 'transit'))));
assert.deepEqual(concurrentProgress.map(result => result.code).sort(), [200, 400]);
await expect(api + 'pickup_status', 200, progress(winner, 'arrived'));
const verify = {method: 'POST', body: {pickup_id: created.pickup_id, final_weight_kg: 3}};
await expect(api + 'verify_pickup', 403, {...loser, ...verify});
await expect(api + 'verify_pickup', 403, {...admin, ...verify});
await expect(api + 'verify_pickup', 403, {...administrator, ...verify});

const concurrentWeights = await Promise.all([1,2].map(() => request(api + 'verify_pickup', {...winner, ...verify})));
assert.deepEqual(concurrentWeights.map(row => row.code).sort(), [200,409]);
const verified = concurrentWeights.find(row => row.code === 200);
assert.equal(verified.data.data.final_weight_kg, 3);
assert.equal(verified.data.data.final_eco_reward, 21000);
await expect(api + 'verify_pickup', 409, {...winner, ...verify});
await expect(api + 'process_payout', 409, {...administrator, method: 'POST', body: {pickup_id: created.pickup_id}});
assert.equal(sql('SELECT COUNT(*) FROM transactions WHERE pickup_id = ' + created.pickup_id), '0');
const tracked = (await expect(detail(tracking), 200, owner)).data.data;
assert.equal(tracked.status, 'completed');
assert.equal(tracked.payment_status, 'pending');
assert.equal(tracked.reward_amount, '18000.00');
assert.equal(tracked.history[0].actor_id, winner.id);
assert.equal(tracked.history[0].status, 'completed');
assert.equal(tracked.history.find(row=>row.status==='transit').actor_id, winner.id);
await expect(detail(tracking), 403, anotherUser);
const rewardPath = '/api/administrator/pickup-rewards';
await expect(rewardPath, 403, admin);
assert((await expect(rewardPath, 200, administrator)).data.data.some(row => row.pickup_id === created.pickup_id && row.status === 'pending'));
function payment(id, amount, reference, image = png, confirm = true) {
    const form = new FormData();
    form.set('pickup_id', id);
    form.set('amount', amount);
    form.set('reference', reference);
    if (confirm) form.set('confirm_payment', 'true');
    if (image) form.set('proof', new Blob([image], {type: 'image/png'}), 'test-proof.png');
    return form;
}
const record = (actor, form) => ({...actor, method:'POST', body:form});
const payoutPath = api + 'process_payout';
await expect(payoutPath, 403, record(winner, payment(created.pickup_id, '18000.00', 'FIXTURE-REF')));
await expect(payoutPath, 400, record(administrator, payment(created.pickup_id, '18000.00', 'FIXTURE-REF', null)));
await expect(payoutPath, 400, record(administrator, payment(created.pickup_id, '18000.00', 'FIXTURE-REF', png, false)));
await expect(payoutPath, 409, record(administrator, payment(created.pickup_id, '18000.01', 'FIXTURE-REF')));
assert.equal((await expect(detail(tracking), 200, owner)).data.data.payment_status, 'pending');
const payouts = await Promise.all([1,2].map(() => request(payoutPath, record(administrator,
    payment(created.pickup_id, '18000.00', 'FIXTURE-REF')))));
assert.deepEqual(payouts.map(row=>row.code).sort(), [200,409]);
const paid = (await expect(detail(tracking), 200, owner)).data.data;
assert.equal(paid.payment_status, 'paid');
assert.equal(paid.payment_reference, 'FIXTURE-REF');
assert(paid.paid_at);
assert.equal((await expect(detail(tracking), 200, winner)).data.data.payment_reference, undefined);
await expect(rewardPath + '/' + created.pickup_id + '/proof', 200, administrator);
await expect(rewardPath + '/' + created.pickup_id + '/proof', 403, owner);
assert.equal(sql('SELECT paid_by FROM pickup_rewards WHERE pickup_id=' + created.pickup_id), String(administrator.id));

async function completeAnother(category) {
    const data = (await expect(api + 'request_pickup', 201, {...owner, method: 'POST',
        body: {category, item_description:'Second test pickup', pickup_address:'Example test address',
            contact_phone:'081000000000',weight_kg:'1.25'}})).data.data;
    await expect(api + 'assign_collector', 200, {...winner, method:'POST',body:{tracking_number:data.tracking_number}});
    for (const status of ['transit','arrived']) {
        await expect(api + 'pickup_status',200,{...winner, method:'POST',body:{tracking_number:data.tracking_number,status}});
    }
    await expect(api + 'verify_pickup',200,{...winner,method:'POST',body:{pickup_id:data.pickup_id,final_weight_kg:'1.25'}});
    return data;
}
const another = await completeAnother('Computers');
await expect(payoutPath,409,record(administrator,payment(another.pickup_id,'7500.00','FIXTURE-REF')));
await expect(payoutPath,409,record(administrator,payment(another.pickup_id,'7500.00','FIXTURE-SECOND')));
assert.equal((await expect(detail(another.tracking_number),200,owner)).data.data.payment_status,'pending');
sql("INSERT INTO waste_categories (category_name,reward_per_kg,processing_fee_per_kg) VALUES ('Zero tariff',0,0)");
const zero = await completeAnother('Zero tariff');
const zeroDetail = (await expect(detail(zero.tracking_number),200,owner)).data.data;
assert.equal(zeroDetail.status,'completed');
assert.equal(zeroDetail.payment_status,'not_due');
assert.equal(zeroDetail.reward_amount,'0.00');
await expect(payoutPath,409,record(administrator,payment(zero.pickup_id,'0.00','FIXTURE-ZERO')));
assert.equal(sql('SELECT COUNT(*) FROM transactions'), '1');
assert.equal((await expect(list + 'user', 200, owner)).data.data.find(row => row.tracking_number === 'PHASE1-LEGACY').payment_status, 'requires_reconciliation');
sql('RENAME TABLE pickup_history TO pickup_history_unavailable');
try {
    await expect(detail(tracking), 500, owner);
} finally {
    sql('RENAME TABLE pickup_history_unavailable TO pickup_history');
}
console.log('PASS audit: query-only login rejected, legacy transaction classified, tracking fails closed when history is unavailable.');
console.log('PASS Phase 2: validation, atomic weighing and reward, ownership, audit actor, pending/paid/zero, proof isolation and duplicate protection.');
assert.equal(tracked.history.filter(row => row.status === 'transit').length, 1);
assert.equal(tracked.weight_kg, 2);
assert.equal(tracked.final_weight_kg, 3);
console.log('PASS: registration, four portals, 401/403, role revocation, logout replay, disabled accounts, expiry, CSRF, CMS, legacy history/announcements, private photos, concurrent claims/progress, actual weight and payout controls.');
