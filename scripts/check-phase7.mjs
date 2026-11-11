// Run only through the isolated database harness.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';

const base = 'http://127.0.0.1:18081';
const database = 'sampira_phase1_test';
const password = process.env.SAMPIRA_TEST_PASSWORD;
assert(password && process.env.SAMPIRA_TEST_MYSQL);
const sql = query => execFileSync(process.env.SAMPIRA_TEST_MYSQL, [
    '--no-defaults', '--protocol=tcp', '-h', '127.0.0.1', '-P', '13316',
    '-u', 'root', '--default-character-set=utf8mb4', '-N', '-B', database, '-e', query
], {encoding:'utf8'}).trim();
const count = query => Number(sql(query));
const files = () => {
    try { return readdirSync('uploads').sort(); } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
};

async function request(path, {token, body, key, headers = {}} = {}) {
    const response = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: {
            ...(token ? {Authorization:'Bearer ' + token} : {}),
            ...(body && !(body instanceof FormData) ? {'Content-Type':'application/json'} : {}),
            ...(key !== undefined ? {'Idempotency-Key':key} : {}),
            ...headers
        },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        redirect: 'manual'
    });
    return {code:response.status, body:await response.json()};
}
async function expect(path, code, options) {
    const result = await request(path, options);
    assert.equal(result.code, code, path + ' ' + result.body.message);
    return result.body.data;
}
const email = () => randomUUID() + '@phase7.invalid';
const valid = {name:'Pengguna Uji', email:email(), password};
const registration = '/api/auth/register';
const invalid = [
    {...valid, name:''}, {...valid, name:'   '}, {...valid, name:'é'.repeat(101)},
    {...valid, name:'Nama\u0000Uji'}, {...valid, email:'audit@'}, {...valid, email:'bukan-email'},
    {...valid, email:'Nama <audit@example.invalid>'}, {...valid, email:'a'.repeat(90)+'@example.invalid'},
    {...valid, password:'12345'}, {...valid, password:'é'.repeat(37)}
];
await Promise.all(invalid.map(body => expect(registration, 400, {body})));
await expect(registration, 201, {body:{name:'  Fiqry 林 é  ', email:'  UNICODE@Phase7.Invalid  ', password:'ééé'}});
assert.equal(sql("SELECT CONCAT(name,'|',email) FROM users WHERE email='unicode@phase7.invalid'"), 'Fiqry 林 é|unicode@phase7.invalid');
await expect('/api/auth/login', 200, {body:{email:' UNICODE@PHASE7.INVALID ', password:'ééé'}});
await expect(registration, 409, {body:{...valid, email:'unicode@phase7.invalid'}});
const raceEmail = email();
const race = await Promise.all(Array.from({length:5}, () => request(registration, {body:{...valid, email:raceEmail}})));
assert.deepEqual(race.map(item => item.code).sort(), [201,409,409,409,409]);
assert.equal(count("SELECT COUNT(*) FROM users WHERE email='"+raceEmail+"'"), 1);

sql("CREATE TRIGGER phase7_user_failure BEFORE INSERT ON users FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PRIVATE DATABASE FAILURE'");
try {
    const failed = await request(registration, {body:{...valid, email:email()}});
    assert.equal(failed.code, 500);
    assert(!JSON.stringify(failed.body).includes('PRIVATE DATABASE FAILURE'));
} finally {
    sql('DROP TRIGGER phase7_user_failure');
}

async function createUser() {
    const credentials = {email:email(), password};
    await expect(registration, 201, {body:{name:'Pickup Phase 7', ...credentials}});
    return expect('/api/auth/login', 200, {body:credentials});
}
const owner = await createUser();
const other = await createUser();
const pickup = '/api/ecorecycle/request_pickup';
const payload = {
    item_description:'Botol plastik untuk pengujian', category:'Small Gadgets', weight_kg:2,
    pickup_address:'Jalan Pengujian Nomor 123 Bandung', contact_phone:'081234567890',
    latitude:-6.9175, longitude:107.6191
};
const send = (key, body=payload, user=owner) => request(pickup, {token:user.token, key, body});
const key = randomUUID();
const first = await send(key);
assert.equal(first.code, 201);
const again = await send(key);
assert.equal(again.code, 200);
assert.deepEqual(again.body.data, first.body.data);
const conflict = await send(key, {...payload, weight_kg:3});
assert.equal(conflict.code, 409);
const anotherOwner = await send(key, payload, other);
assert.equal(anotherOwner.code, 201);
assert.notEqual(anotherOwner.body.data.pickup_id, first.body.data.pickup_id);

const concurrentKey = randomUUID();
const concurrent = await Promise.all(Array.from({length:5}, () => send(concurrentKey)));
assert.deepEqual(concurrent.map(item => item.code).sort(), [200,200,200,200,201]);
assert.equal(new Set(concurrent.map(item => item.body.data.pickup_id)).size, 1);
const competingKey = randomUUID();
const competing = await Promise.all([send(competingKey), send(competingKey, {...payload, weight_kg:3})]);
assert.deepEqual(competing.map(item => item.code).sort(), [201,409]);
await Promise.all(['', 'x'.repeat(200), randomUUID().toUpperCase(), 'not-a-uuid'].map(invalidKey =>
    expect(pickup, 400, {token:owner.token, key:invalidKey, body:payload})
));
await expect(pickup, 201, {token:owner.token, body:payload}); // Legacy clients remain supported.
await expect(pickup, 401, {key:randomUUID(), body:payload});
await expect(pickup, 403, {
    token:(await expect('/api/auth/login', 200, {body:{email:'admin@phase1.invalid', password}})).token,
    key:randomUUID(), body:payload
});
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64');
function withPhoto(content=photo, filename='proof.png', type='image/png') {
    const form = new FormData();
    for (const [name, value] of Object.entries(payload)) form.set(name, value);
    form.set('photo', new Blob([content], {type}), filename);
    return form;
}
const photoKey = randomUUID();
const photoCreated = await send(photoKey, withPhoto());
assert.equal(photoCreated.code, 201);
const photoFiles = files();
assert.equal((await send(photoKey, withPhoto())).code, 200);
assert.deepEqual(files(), photoFiles);
assert.equal((await send(photoKey, withPhoto(Buffer.concat([photo, Buffer.from('changed')])))).code, 409);
await expect(pickup, 400, {token:owner.token, key:randomUUID(), body:withPhoto(Buffer.from('<script>alert(1)</script>'))});
await expect(pickup, 400, {token:owner.token, key:randomUUID(), body:withPhoto(photo, 'proof.exe')});
await expect(pickup, 400, {token:owner.token, key:randomUUID(), body:withPhoto(Buffer.alloc(5*1024*1024+1))});

const rollbackKey = randomUUID();
const beforePickups = count('SELECT COUNT(*) FROM pickups WHERE user_id='+owner.id);
const beforeFiles = files();
sql("CREATE TRIGGER phase7_pickup_failure BEFORE INSERT ON pickup_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PRIVATE PICKUP FAILURE'");
try {
    const failed = await send(rollbackKey, withPhoto());
    assert.equal(failed.code, 500);
    assert(!JSON.stringify(failed.body).includes('PRIVATE PICKUP FAILURE'));
    assert.equal(count('SELECT COUNT(*) FROM pickups WHERE user_id='+owner.id), beforePickups);
    assert.equal(count("SELECT COUNT(*) FROM pickup_requests WHERE request_key='"+rollbackKey+"'"), 0);
    assert.deepEqual(files(), beforeFiles);
} finally {
    sql('DROP TRIGGER phase7_pickup_failure');
}
assert.equal((await send(rollbackKey, withPhoto())).code, 201);
assert.equal((await send(rollbackKey, withPhoto())).code, 200);

const created = first.body.data;
await expect('/api/ecorecycle/cancel_pickup', 200, {token:owner.token, body:{tracking_number:created.tracking_number, reason:'Pengujian snapshot retry.'}});
assert.deepEqual((await send(key)).body.data, created, 'Retry must preserve the original response after a status change');
const detail = await expect('/api/ecorecycle/pickup_status?tracking_number='+created.tracking_number, 200, {token:owner.token});
assert.equal(detail.status, 'cancelled');
assert.equal(detail.latitude, payload.latitude);
assert.equal(detail.longitude, payload.longitude);
await expect('/api/ecorecycle/pickup_status?tracking_number='+created.tracking_number, 403, {token:other.token});

const ledgerBefore = sql('SELECT user_id,request_key,HEX(fingerprint),pickup_id,response FROM pickup_requests ORDER BY user_id,request_key');
const ddl = readFileSync(new URL('../db_init/migrations/006_pickup_idempotency.sql', import.meta.url), 'utf8');
sql(ddl);
sql(ddl);
assert.equal(sql('SELECT user_id,request_key,HEX(fingerprint),pickup_id,response FROM pickup_requests ORDER BY user_id,request_key'), ledgerBefore);
const accountsBefore = sql("SELECT id,SHA2(CONCAT_WS('|',name,email,password,role),256) FROM users ORDER BY id");
const unicodeDDL = readFileSync(new URL('../db_init/migrations/007_registration_unicode.sql', import.meta.url), 'utf8');
sql(unicodeDDL);
sql(unicodeDDL);
assert.equal(sql("SELECT id,SHA2(CONCAT_WS('|',name,email,password,role),256) FROM users ORDER BY id"), accountsBefore);
console.log('PASS Phase 7: registration validation, normalization, concurrent duplicate conflict, safe database errors, pickup replay/concurrency/conflict, user scope, rollback/photo cleanup, original response, coordinates and migration replay.');
