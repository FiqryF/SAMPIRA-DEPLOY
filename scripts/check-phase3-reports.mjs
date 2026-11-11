// Run via check-phase1-migration.mjs against its isolated fixture only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';

const {SAMPIRA_TEST_MYSQL, SAMPIRA_TEST_PASSWORD} = process.env;
assert(SAMPIRA_TEST_MYSQL && SAMPIRA_TEST_PASSWORD);
const base = 'http://127.0.0.1:18081';
const reports = '/api/ecorecycle/facility-reports';
const password = SAMPIRA_TEST_PASSWORD;
const sql = query => execFileSync(SAMPIRA_TEST_MYSQL, [
    '--no-defaults', '--protocol=tcp', '-h', '127.0.0.1', '-P', '13316',
    '-u', 'root', '-N', '-B', 'sampira_phase1_test'
], {input: query, encoding: 'utf8'}).trim();
assert.equal(sql("SELECT COUNT(*) FROM users WHERE id=101 AND email='admin@phase1.invalid';"), '1');
const pickupFingerprint = () => sql('CHECKSUM TABLE pickups, pickup_history, pickup_rewards, transactions EXTENDED;');
const initialPickupData = pickupFingerprint();
const migrate = readFileSync(new URL('../db_init/migrations/002_facility_reports.sql', import.meta.url), 'utf8');
sql(migrate);
sql(migrate);
assert.equal(pickupFingerprint(), initialPickupData);

async function call(path, {method = 'GET', user, cookie, origin, body, key} = {}) {
    const headers = {};
    if (user) headers.Authorization = 'Bearer ' + user.token;
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    if (key !== undefined) headers['Idempotency-Key'] = key;
    if (body && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const response = await fetch(base + path, {method, headers, body, redirect: 'manual'});
    const type = response.headers.get('content-type') || '';
    return {
        code: response.status,
        headers: response.headers,
        body: type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer())
    };
}

async function expect(path, code, options) {
    const response = await call(path, options);
    assert.equal(response.code, code, path + ' ' + (response.body.message || ''));
    return response;
}

async function login(email, role) {
    const {body, headers} = await expect('/api/auth/login', 200, {method: 'POST', body: {email, password}});
    assert.equal(body.data.role, role);
    return {...body.data, cookie: headers.get('set-cookie').split(';')[0]};
}

const user = await login('owner@phase1.invalid', 'user');
const admin = await login('admin@phase1.invalid', 'admin');
const petugas = await login('collector@phase1.invalid', 'petugas');
const administrator = await login('administrator@phase1.invalid', 'administrator');
const email = randomUUID() + '@phase3.invalid';
await expect('/api/auth/register', 201, {method: 'POST', body: {email, password, name: 'Other reporter'}});
const other = await login(email, 'user');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64');
const replacement = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAsTj2FAAAAABJRU5ErkJggg==', 'base64');
function form(values = {}, photo, name = 'fixture.png') {
    const body = new FormData();
    const fields = {category: 'tps', title: 'Pintu TPS rusak', description: 'Pintu TPS macet sejak kemarin.',
        address: 'Jalan Contoh 12', ...values};
    for (const [key, value] of Object.entries(fields)) body.set(key, String(value));
    if (photo) body.set('photo', new Blob([photo], {type: 'image/png'}), name);
    return body;
}
const creation = (body = form(), key = randomUUID(), actor = user) => ({method: 'POST', user: actor, body, key});
const revision = (version, values = {}, photo, actor = user) => ({method: 'PUT', user: actor, body: form({version, ...values}, photo)});
const verify = (version, status, note, actor = admin) => ({method: 'POST', user: actor, body: {version, status, note}});

await expect(reports, 401);
await expect(reports, 401, creation(form(), randomUUID(), null));
for (const role of [petugas, administrator]) await expect(reports, 403, {user: role});
await expect(reports, 403, creation(form(), randomUUID(), admin));
await expect(reports, 400, creation(form(), ''));
await expect(reports, 415, creation({title: 'Wrong media'}));
await expect(reports, 403, {method: 'POST', cookie: user.cookie, origin: 'https://untrusted.invalid', key: randomUUID(), body: form()});
await expect(reports, 403, {method: 'POST', cookie: user.cookie, key: randomUUID(), body: form()});
for (const fields of [{title: 'x'}, {description: ''}, {address: ''}, {category: 'computers'}, {latitude: 0},
    {latitude: '90.000001', longitude: '180'}, {latitude: 0, longitude: 181}, {latitude: '1e1', longitude: 1},
    {reporter_id: other.id}, {actor_id: admin.id}, {status: 'approved'}, {id: 999}, {version: 1}]) {
    await expect(reports, 400, creation(form(fields)));
}
await expect(reports + '?reporter_id=1', 400, creation());
const duplicateField = form();
duplicateField.append('title', 'Judul kedua');
await expect(reports, 400, creation(duplicateField));
const duplicatePhoto = form({}, png);
duplicatePhoto.append('photo', new Blob([png]), 'duplicate.png');
await expect(reports, 400, creation(duplicatePhoto));
await expect(reports, 400, creation(form({}, Buffer.from('<svg/>'))));
await expect(reports, 400, creation(form({}, png.subarray(0, 33))));
await expect(reports, 400, creation(form({}, png, 'wrong.jpg')));
await expect(reports, 400, creation(form({}, Buffer.alloc(5 * 1024 * 1024 + 1))));
await expect(reports, 413, creation(form({}, Buffer.alloc(6 * 1024 * 1024))));

const key = randomUUID();
const initialRequests = await Promise.all([
    call(reports, creation(form({latitude: '-6.123456', longitude: '107.012345'}, png), key)),
    call(reports, creation(form({latitude: '-6.123456', longitude: '107.012345'}, png), key))
]);
assert.deepEqual(initialRequests.map(result => result.code).sort(), [200, 201]);
const report = initialRequests[0].body.data;
assert.equal(initialRequests[1].body.data.id, report.id);
const detail = reports + '/' + report.id;
const photo = detail + '/photo';
const history = detail + '/history';
const verification = detail + '/verification';
assert.equal(initialRequests.find(result => result.code === 201).headers.get('location'), detail);
assert.equal(report.status, 'pending');
assert.equal(report.version, 1);
assert.equal(report.reporter_id, user.id);
assert.equal(report.latitude, -6.123456);
assert.equal(report.longitude, 107.012345);
assert.equal(report.photo_url, photo);
assert.match(report.tracking_number, /^FAC-[A-F0-9]{24}$/);
assert.match(report.created_at, /Z$/);
assert.equal((await expect(detail, 200, {cookie: user.cookie})).body.data.id, report.id);
await expect(history, 401);
await expect(photo, 401);
await expect(reports + '/xyz', 400, {user});
await expect(reports + '/2147483647', 404, {user: admin});
for (const path of [detail, history, photo]) {
    await expect(path, 404, {user: other});
    for (const role of [petugas, administrator]) await expect(path, 403, {user: role});
}
assert.deepEqual((await expect(reports, 200, {user: other})).body.data, {items: [], next_before_id: null});
for (const owner of [user, admin]) {
    const image = await expect(photo, 200, {user: owner});
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('cache-control'), 'no-store');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(image.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.deepEqual(image.body, png);
}
assert.equal((await expect(history, 200, {user})).body.data.items.length, 1);
await expect(detail, 409, revision(1));
for (const role of [user, petugas, administrator]) await expect(verification, 403, verify(1, 'approved', null, role));
for (const body of [{status: 'pending', version: 1}, {status: 'rejected', version: 1}, {status: 'revision_required', version: 1, note: ' '},
    {status: 'approved', version: 1, note: 'x'.repeat(1001)}, {status: 'approved', version: 1, actor_id: 1},
    {status: 'approved'}, {status: 'approved', version: 1, reporter_id: 1}, '{"status":"approved","version":1} {}']) {
    await expect(verification, 400, {method: 'POST', user: admin, body});
}
await expect(verification, 413, {method: 'POST', user: admin, body: {status: 'approved', version: 1, note: 'x'.repeat(17000)}});
const page = (await expect(reports + '?status=pending&category=tps&limit=1', 200, {user: admin})).body.data;
assert.equal(page.items[0].id, report.id);
assert.equal(page.next_before_id, null);
for (const query of ['status=unknown', 'category=unknown', 'limit=101', 'limit=1&limit=2', 'before_id=-1', 'reporter_id=1']) {
    await expect(reports + '?' + query, 400, {user: admin});
}
const reason = 'Lengkapi lokasi dan kondisi pintu.';
const requested = (await expect(verification, 200, verify(1, 'revision_required', reason))).body.data;
assert.equal(requested.status, 'revision_required');
assert.equal(requested.version, 2);
assert.equal(requested.reviewed_by, admin.id);
assert.equal(requested.verification_note, reason);
await expect(detail, 404, revision(2, {}, png, other));
await expect(verification, 409, verify(2, 'approved'));

sql("CREATE TRIGGER phase3_fixture_history_failure BEFORE INSERT ON facility_report_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure';");
try {
    await expect(detail, 500, revision(2, {title: 'Judul akan di-rollback'}, replacement));
    await expect(reports, 500, creation(form({}, png)));
    assert.equal((await expect(detail, 200, {user})).body.data.status, 'revision_required');
    assert.equal((await expect(detail, 200, {user})).body.data.title, report.title);
    assert.deepEqual((await expect(photo, 200, {user})).body, png);
    assert.equal((await expect(history, 200, {user})).body.data.items.length, 2);
    assert.equal(sql('SELECT COUNT(*) FROM facility_reports;'), '1');
    assert.equal(sql('SELECT COUNT(*) FROM facility_report_photos;'), '1');
} finally {
    sql('DROP TRIGGER phase3_fixture_history_failure;');
}

const resubmitted = (await expect(detail, 200, revision(2, {
    title: 'Kondisi pintu terbaru', latitude: '-6.917463', longitude: '107.619122'
}, replacement))).body.data;
assert.equal(resubmitted.status, 'pending');
assert.equal(resubmitted.version, 3);
assert.deepEqual([resubmitted.latitude, resubmitted.longitude], [-6.917463, 107.619122]);
assert.equal(resubmitted.verification_note, null);
assert.equal(resubmitted.reviewed_by, null);
assert.deepEqual((await expect(photo, 200, {user})).body, replacement);
await expect(detail, 409, revision(2));
await expect(verification, 409, verify(1, 'approved'));
const approvals = await Promise.all([call(verification, verify(3, 'approved')), call(verification, verify(3, 'approved'))]);
assert.deepEqual(approvals.map(result => result.code).sort(), [200, 409]);
const approved = approvals.find(result => result.code === 200).body.data;
assert.equal(approved.status, 'approved');
assert.equal(approved.version, 4);
const adminDetail = (await expect(detail, 200, {user: admin})).body.data;
assert.deepEqual([adminDetail.latitude, adminDetail.longitude], [-6.917463, 107.619122]);
await expect(verification, 409, verify(4, 'rejected', 'Tidak dapat diubah'));
await expect(detail, 409, revision(4));
const firstHistory = (await expect(history + '?limit=2', 200, {user})).body.data;
assert.equal(firstHistory.next_before_version, 3);
const lastHistory = (await expect(history + '?limit=2&before_version=3', 200, {user: admin})).body.data;
assert.equal(lastHistory.next_before_version, null);
assert.deepEqual([...firstHistory.items, ...lastHistory.items].map(({version, actor_id, from_status, to_status, note}) =>
    [version, actor_id, from_status, to_status, note]), [
    [4, admin.id, 'pending', 'approved', null], [3, user.id, 'revision_required', 'pending', null],
    [2, admin.id, 'pending', 'revision_required', reason], [1, user.id, null, 'pending', null]
]);
const replay = (await expect(reports, 200, creation(form(), key))).body.data;
assert.equal(replay.version, 4);

const another = (await expect(reports, 201, creation(form({category: 'waste_bank'}), key, other))).body.data;
assert.equal(another.photo_url, null);
assert.deepEqual([another.latitude, another.longitude], [null, null]);
await expect(reports + '/' + another.id + '/photo', 404, {user: other});
const rejection = (await expect(reports + '/' + another.id + '/verification', 200, verify(1, 'rejected', 'Laporan duplikat.'))).body.data;
assert.equal(rejection.status, 'rejected');
assert.equal(rejection.verification_note, 'Laporan duplikat.');
const latest = (await expect(reports + '?limit=1', 200, {user: admin})).body.data;
assert.equal(latest.next_before_id, another.id);
const older = (await expect(reports + '?limit=1&before_id=' + another.id, 200, {user: admin})).body.data;
assert.equal(older.items[0].id, report.id);
assert.equal(older.next_before_id, null);
assert.deepEqual((await expect(reports, 200, {user})).body.data.items.map(item => item.id), [report.id]);
await expect('/logout', 303, {method: 'POST', user: other});
await expect(reports, 401, {user: other});
assert.equal(pickupFingerprint(), initialPickupData);
console.log('PASS Phase 3A: additive migration, RBAC, ownership, validation, private photos, filters, pagination, all transitions, retries, concurrency, atomic rollback, and unchanged pickup/reward data.');
