// Run only against the isolated Phase 1–4 fixture.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const {SAMPIRA_TEST_MYSQL, SAMPIRA_TEST_PASSWORD} = process.env;
assert(SAMPIRA_TEST_MYSQL && SAMPIRA_TEST_PASSWORD);
const database = 'sampira_phase1_test';
const upgrade = 'sampira_phase5_upgrade';
const connection = ['--no-defaults', '--protocol=tcp', '-h', '127.0.0.1', '-P', '13316', '-u', 'root'];
const sql = (input, schema = database) => execFileSync(SAMPIRA_TEST_MYSQL, [
    ...connection, '-N', '-B', ...(schema ? [schema] : [])
], {input, encoding: 'utf8'}).trim().replaceAll('\r', '');
assert.equal(sql("SELECT COUNT(*) FROM users WHERE id=101 AND email='admin@phase1.invalid'"), '1');
assert.equal(sql('SELECT COUNT(*) FROM pickups WHERE latitude IS NOT NULL OR longitude IS NOT NULL'), '0');
assert.equal(sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + upgrade + "'", null), '0');

const dump = execFileSync(join(dirname(SAMPIRA_TEST_MYSQL), 'mysqldump.exe'), [
    ...connection, '--single-transaction', '--skip-add-drop-table', '--skip-extended-insert', '--hex-blob', database
], {encoding: 'utf8'});
// Reconstruct the pre-004 backup layout for pickup only. Other tables and rows are restored verbatim.
const pickupDDL = /CREATE TABLE `pickups` \([\s\S]+?\r?\n\) ENGINE=[^\r\n]+/;
assert.match(dump, pickupDDL);
const legacyDump = dump.replace(pickupDDL, ddl => {
    for (const field of ['latitude', 'longitude', 'chk_pickup_coordinates']) {
        const line = new RegExp('^  (?:CONSTRAINT )?`' + field + '` [^\\r\\n]+\\r?\\n', 'm');
        assert.match(ddl, line);
        ddl = ddl.replace(line, '');
    }
    return ddl.replace(/,\r?\n\) ENGINE=/, '\n) ENGINE=');
}).replace(/^INSERT INTO `pickups` VALUES .+;$/gm, row => {
    assert.match(row, /,NULL,NULL\);$/);
    return row.replace(/,NULL,NULL\);$/, ');');
});
sql('CREATE DATABASE ' + upgrade, null);
sql(legacyDump, upgrade);
const oldColumns = sql(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pickups' AND COLUMN_NAME NOT IN ('latitude','longitude')
    ORDER BY ORDINAL_POSITION`).split('\n').map(column => '`' + column + '`').join(',');
const pickupRows = 'SELECT ' + oldColumns + ' FROM pickups ORDER BY id';
const otherTables = 'pickup_history, pickup_rewards, transactions, facility_reports, facility_report_history, facility_report_photos, facility_handling, facility_assignments, facility_handling_events, facility_handling_photos';
const checksums = 'CHECKSUM TABLE ' + otherTables + ' EXTENDED';
const keys = `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE()
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`;
const indexes = `SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
const snapshot = schema => [sql(pickupRows, schema), sql(checksums, schema).replaceAll(schema + '.', ''), sql(keys, schema), sql(indexes, schema)];
const original = snapshot(database);
assert.deepEqual(snapshot(upgrade), original);
const coordinateColumns = `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pickups' AND COLUMN_NAME IN ('latitude','longitude')
    ORDER BY ORDINAL_POSITION`;
assert.equal(sql(coordinateColumns, upgrade), '');
const migration = readFileSync(new URL('../db_init/migrations/004_precise_locations.sql', import.meta.url), 'utf8');
for (let attempt = 0; attempt < 2; attempt++) {
    sql(migration, upgrade);
    assert.equal(sql(coordinateColumns, upgrade), 'latitude\tdecimal(10,7)\tYES\nlongitude\tdecimal(10,7)\tYES');
    assert.deepEqual(snapshot(upgrade), original);
    assert.equal(sql('SELECT COUNT(*) FROM pickups WHERE latitude IS NOT NULL OR longitude IS NOT NULL', upgrade), '0');
}
for (const pair of ['latitude=1', 'latitude=90.0000001, longitude=107', 'latitude=0, longitude=-180.0000001']) {
    assert.throws(() => sql('UPDATE pickups SET ' + pair + ' WHERE id=20', upgrade), /chk_pickup_coordinates/);
}
console.log('PASS Phase 5A migration: pre-004 fixture restore, two runs, legacy rows, rewards, reports, assignments, keys and indexes.');

const base = 'http://127.0.0.1:18081';
const api = '/api/ecorecycle/';
async function expect(path, code, token, body) {
    const headers = token ? {Authorization: 'Bearer ' + token} : {};
    if (body && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
        headers['Content-Type'] = 'application/json';
        if (typeof body !== 'string') body = JSON.stringify(body);
    }
    const response = await fetch(base + path, {headers, body, method: body ? 'POST' : 'GET'});
    const result = await response.json();
    assert.equal(response.status, code, path + ' ' + result.message);
    if (code >= 400) assert.equal(result.data, undefined);
    return result.data;
}
const post = (route, code, token, body) => expect(api + route, code, token, body);
async function login(email) {
    return (await expect('/api/auth/login', 200, null, {email, password: SAMPIRA_TEST_PASSWORD})).token;
}
const owner = await login('owner@phase1.invalid');
const officer = await login('collector@phase1.invalid');
const colleague = await login('second-collector@phase1.invalid');
const admin = await login('admin@phase1.invalid');
const administrator = await login('administrator@phase1.invalid');
const otherEmail = randomUUID() + '@phase5.invalid';
await expect('/api/auth/register', 201, null, {name: 'Isolated Phase 5', email: otherEmail, password: SAMPIRA_TEST_PASSWORD});
const other = await login(otherEmail);
const payload = {
    item_description: 'Gawai untuk pickup terisolasi', pickup_address: 'Jalan Fixture Bandung',
    contact_phone: '081234567890', category: 'Computers', weight_kg: 2
};
const detail = (tracking, token, code = 200) => expect(api + 'pickup_status?' + new URLSearchParams({tracking_number: tracking}), code, token);
const list = (role, token) => expect(api + 'list_pickups?type=' + role, 200, token);
const point = (data, lat, lon) => assert.deepEqual([data.latitude, data.longitude], [lat, lon]);
point(await detail('PHASE1-LEGACY', owner), null, null);
const legacyClient = await post('request_pickup?latitude=3&longitude=4', 201, owner, payload);
point(await detail(legacyClient.tracking_number, owner), null, null);

const malformed = [
    {latitude: 0}, {longitude: 0}, {latitude: ' ', longitude: 0}, {latitude: null},
    {latitude: -90.0000001, longitude: 0}, {latitude: 0, longitude: '180.0000001'},
    {latitude: '-6,12', longitude: 0}, {latitude: 'NaN', longitude: 0},
    {latitude: 0, longitude: 'Infinity'}, {latitude: false, longitude: 0},
    {latitude: [], longitude: 0}, {latitude: 0, longitude: {}},
    {latitude: '0.00000001', longitude: 0}, {latitude: 0, longitude: '107.00000000'}
];
const count = sql('SELECT COUNT(*) FROM pickups');
for (const fields of malformed) await post('request_pickup', 400, owner, {...payload, ...fields});
const raw = JSON.stringify(payload).slice(0, -1);
for (const fields of ['"latitude":1e-7,"longitude":0', '"latitude":NaN,"longitude":0', '"latitude":0,"longitude":Infinity',
    '"latitude":0,"latit\\u0075de":0,"longitude":0']) {
    await post('request_pickup', 400, owner, raw + ',' + fields + '}');
}
const duplicate = new URLSearchParams({...payload, latitude: '0', longitude: '0'});
duplicate.append('latitude', '1');
await post('request_pickup', 400, owner, duplicate);
const filePart = new FormData();
for (const [key, value] of Object.entries(payload)) filePart.set(key, value);
filePart.set('latitude', new Blob(['0']), 'location.txt');
await post('request_pickup', 400, owner, filePart);
assert.equal(sql('SELECT COUNT(*) FROM pickups'), count);

const pickup = await post('request_pickup', 201, owner, {
    ...payload, latitude: '-6.9174639', longitude: 107.6191228, user_id: 104, collector_id: 104,
    status: 'completed', role: 'administrator', actor_id: 104
});
const tracking = pickup.tracking_number;
const edit = (token, code, fields) => post('update_pickup', code, token, {...payload, tracking_number: tracking, ...fields});
const owned = await detail(tracking, owner);
assert.equal(owned.status, 'pending');
assert.equal(owned.user_id, 103);
assert.equal(owned.collector_id, null);
point(owned, -6.9174639, 107.6191228);
assert.equal(sql('SELECT latitude, longitude FROM pickups WHERE id=' + pickup.pickup_id), '-6.9174639\t107.6191228');
point((await list('user', owner)).find(item => item.tracking_number === tracking), -6.9174639, 107.6191228);
assert(!(await list('user', other)).some(item => item.tracking_number === tracking));
for (const token of [officer, colleague]) {
    point((await list('petugas', token)).find(item => item.tracking_number === tracking), null, null);
    await detail(tracking, token, 403);
}
await detail(tracking, null, 401);
for (const token of [other, admin, administrator]) await detail(tracking, token, 403);
const stats = await expect(api + 'pickup_status?type=stats', 200, administrator);
assert(!('latitude' in stats) && !('longitude' in stats));
await edit(other, 404, {latitude: 0, longitude: 0});
for (const token of [officer, admin, administrator]) await edit(token, 403, {latitude: 0, longitude: 0});
await edit(owner, 400, {latitude: 1, longitude: ' '});
await edit(owner, 200, {pickup_address: 'Alamat deskriptif yang diperbarui'});
point(await detail(tracking, owner), -6.9174639, 107.6191228);
await edit(owner, 200, {latitude: null, longitude: null});
point(await detail(tracking, owner), null, null);
await edit(owner, 200, {latitude: 0, longitude: 0});
point(await detail(tracking, owner), 0, 0);
await edit(owner, 200, {latitude: '0.0000001', longitude: '0'});
point(await detail(tracking, owner), 0.0000001, 0);

const ambon = new FormData();
for (const [key, value] of Object.entries({...payload, latitude: '-3.6954301', longitude: '128.1814097'})) ambon.set(key, value);
const ambonPickup = await post('request_pickup', 201, owner, ambon);
point(await detail(ambonPickup.tracking_number, owner), -3.6954301, 128.1814097);
const boundary = await post('request_pickup', 201, owner, new URLSearchParams({...payload, latitude: '-90', longitude: '180'}));
point(await detail(boundary.tracking_number, owner), -90, 180);
await post('assign_collector', 200, officer, {tracking_number: tracking, collector_id: 104});
point(await detail(tracking, officer), 0.0000001, 0);
point((await list('collector', officer)).find(item => item.tracking_number === tracking), 0.0000001, 0);
await detail(tracking, colleague, 403);
assert(!(await list('petugas', colleague)).some(item => item.tracking_number === tracking));
await edit(owner, 409, {latitude: 10, longitude: 10});
point(await detail(tracking, officer), 0.0000001, 0);
console.log('PASS Phase 5A pickup: exact WGS84 coordinates, legacy clients, pair validation, edits, IDOR and assignment-scoped access.');
