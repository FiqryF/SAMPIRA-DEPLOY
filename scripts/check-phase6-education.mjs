// Run only inside the isolated Phase 1–5 fixture.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const {SAMPIRA_TEST_MYSQL, SAMPIRA_TEST_PASSWORD} = process.env;
assert(SAMPIRA_TEST_MYSQL && SAMPIRA_TEST_PASSWORD);
const db = 'sampira_phase1_test';
const upgrade = 'sampira_phase6_upgrade';
const connection = ['--no-defaults', '--protocol=tcp', '-h', '127.0.0.1', '-P', '13316', '-u', 'root'];
const sql = (input, schema = db) => execFileSync(SAMPIRA_TEST_MYSQL, [
    ...connection, '-N', '-B', ...(schema ? [schema] : [])
], {input, encoding: 'utf8'}).trim().replaceAll('\r', '');

assert.equal(sql("SELECT COUNT(*) FROM users WHERE id=101 AND email='admin@phase1.invalid'"), '1');
assert.equal(sql('SELECT COUNT(*) FROM education_articles'), '0', 'Startup must not seed articles.');
assert.equal(sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + upgrade + "'", null), '0');
const legacyTables = sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'education_articles' ORDER BY TABLE_NAME").split('\n');
const fingerprint = schema => [
    sql('CHECKSUM TABLE ' + legacyTables.join(', ') + ' EXTENDED', schema).replaceAll(schema + '.', ''),
    sql("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'education_articles' ORDER BY TABLE_NAME,ORDINAL_POSITION", schema),
    sql("SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'education_articles' ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION", schema),
    sql("SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'education_articles' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX", schema)
];
const original = fingerprint(db);
const dump = execFileSync(join(dirname(SAMPIRA_TEST_MYSQL), 'mysqldump.exe'), [
    ...connection, '--single-transaction', '--skip-add-drop-table', '--hex-blob',
    '--ignore-table=' + db + '.education_articles', db
]);
sql('CREATE DATABASE ' + upgrade, null);
sql(dump, upgrade);
assert.deepEqual(fingerprint(upgrade), original);
assert.equal(sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='education_articles'", upgrade), '0');
const migration = readFileSync(new URL('../db_init/migrations/005_education_content.sql', import.meta.url), 'utf8');
const educationDDL = 'SHOW CREATE TABLE education_articles';
for (let run = 0; run < 2; run++) {
    sql(migration, upgrade);
    assert.deepEqual(fingerprint(upgrade), original);
    assert.equal(sql(educationDDL, upgrade), sql(educationDDL));
    assert.equal(sql('SELECT COUNT(*) FROM education_articles', upgrade), '0');
}
assert.match(sql(educationDDL, upgrade), /UNIQUE KEY .uq_education_slug./);
assert.equal(sql("SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='education_articles' AND REFERENCED_TABLE_NAME='users'", upgrade), '2');
console.log('PASS Phase 6A migration: populated pre-005 restore, replay, unchanged legacy rows, schema, indexes and references.');

const base = 'http://127.0.0.1:18081';
const publicPath = '/api/ecorecycle/education/articles';
const managePath = '/api/ecorecycle/education/manage/articles';
async function call(path, status, {token, cookie, origin, method = 'GET', body, mediaType = 'application/json'} = {}) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    if (body !== undefined) {
        headers['Content-Type'] = mediaType;
        if (typeof body !== 'string') body = JSON.stringify(body);
    }
    const response = await fetch(base + path, {method, headers, body});
    const payload = await response.json();
    assert.equal(response.status, status, method + ' ' + path + ' ' + payload.message);
    assert.equal(payload.status, status >= 400 ? 'error' : 'success');
    if (status >= 400) assert.equal(payload.data, undefined);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return {data: payload.data, headers: response.headers, message: payload.message};
}

async function login(email) {
    const result = await call('/api/auth/login', 200, {method: 'POST', body: {email, password: SAMPIRA_TEST_PASSWORD}});
    return {token: result.data.token, cookie: result.headers.get('set-cookie').split(';')[0], id: result.data.id};
}
const [user, officer, admin, administrator] = await Promise.all([
    'owner@phase1.invalid', 'collector@phase1.invalid', 'admin@phase1.invalid', 'administrator@phase1.invalid'
].map(login));
const beforeContent = fingerprint(db);
const initial = (await call(publicPath, 200)).data;
assert.deepEqual(initial.items, []);
assert.equal(initial.next_page, null);
assert.equal(initial.categories.length, 7);
assert.equal(new Set(initial.categories.map(item => item.key)).size, 7);

const article = {
    slug: 'panduan-pickup-fixture', title: '  Panduan pickup  ',
    summary: 'Ajukan penjemputan melalui portal pengguna.',
    body: 'Buka formulir penjemputan.\nPeriksa alamat dan konfirmasi titik jika tersedia.',
    category: 'panduan-sampira', sources: [' https://example.invalid/panduan ']
};
const create = (status, body, actor = admin) => call(managePath, status, {token: actor.token, method: 'POST', body});
const edit = (status, id, body) => call(managePath + '/' + id, status, {token: admin.token, method: 'PUT', body});
const publication = (status, id, version, state, actor = admin) =>
    call(managePath + '/' + id + '/publication', status, {token: actor.token, method: 'POST', body: {version, status: state}});
await call(managePath, 401);
await call(managePath, 401, {method: 'POST', body: article});
for (const actor of [user, officer, administrator]) {
    await call(managePath, 403, actor);
    await create(403, article, actor);
}
await call(managePath, 403, {cookie: admin.cookie, method: 'POST', body: article});
await call(managePath, 403, {cookie: admin.cookie, origin: 'https://example.invalid', method: 'POST', body: article});
await call(managePath, 415, {token: admin.token, method: 'POST', body: '{}', mediaType: 'text/plain'});
await call(managePath + '?slug=x', 400, {token: admin.token, method: 'POST', body: article});
for (const invalid of [
    {slug: 'Bad Slug'}, {slug: 'slug--ganda'}, {slug: 'a'.repeat(121)}, {title: 'x'}, {summary: 'pendek'},
    {body: 'a'.repeat(12001)}, {category: 'missing'}, {body: 'Teks dengan <script>alert(1)</script>'},
    {body: 'Artikel <iframe src="https://example.invalid">berbahaya</iframe>'},
    {summary: '<img src=x onerror=alert(1)>'}, {title: 'Baris\nkedua'},
    {sources: ['javascript:alert(1)']}, {sources: ['data:text/html,foo']}, {sources: ['https://user:pass@example.invalid']},
    {sources: ['http://example.invalid']}, {sources: ['https://']}, {sources: Array(9).fill('https://example.invalid')},
    {status: 'published'}, {created_by: 103}, {published_at: '2025-01-01'}
]) await create(400, {...article, ...invalid});
for (const invalid of ['null', '{} {}', '{"slug":', '[]']) await create(400, invalid);
await create(413, '{"body":"' + 'x'.repeat(193 * 1024) + '"}');
for (const query of ['?status=draft', '?category=bogus', '?q=', '?q=%FF', '?page=0', '?page=1001', '?limit=51', '?limit=1&limit=2', '?x=y']) {
    await call(publicPath + query, 400);
}
await call(managePath + '?status=invalid', 400, admin);
await call(publicPath + '/INVALID', 404);

const {data: first, headers} = await call(managePath, 201, {cookie: admin.cookie, origin: base, method: 'POST', body: article});
assert.equal(headers.get('location'), managePath + '/' + first.id);
assert.equal(first.status, 'draft');
assert.equal(first.version, 1);
assert.equal(first.title, 'Panduan pickup');
assert.equal(first.created_by, admin.id);
assert.deepEqual(first.sources, ['https://example.invalid/panduan']);
assert.equal(first.published_at, null);
assert.deepEqual((await call(publicPath, 200)).data.items, []);
await call(publicPath + '/' + first.slug, 404);
await create(409, article);
await call(managePath + '/999999', 404, admin);
await call(managePath + '/abc', 400, admin);
await edit(404, 999999, {...article, version: 1});
await publication(404, 999999, 1, 'published');
await publication(403, first.id, 1, 'published', officer);

const second = (await create(201, {...article, slug: 'panduan-pemisahan-fixture', title: 'Pisahkan perangkat 100% utuh', category: 'sampah-elektronik', sources: undefined})).data;
assert.deepEqual(second.sources, []);
await edit(409, second.id, {...article, version: 1});
const firstEdited = (await edit(200, first.id, {...article, title: 'Panduan pickup SAMPIRA', version: 1})).data;
assert.equal(firstEdited.version, 2);
assert.equal(firstEdited.updated_by, admin.id);
assert.equal(firstEdited.created_at, first.created_at);
await edit(409, first.id, {...article, version: 1});
await publication(400, first.id, 2, 'draft');
const adminDrafts = (await call(managePath + '?status=draft&limit=1', 200, admin)).data;
assert.equal(adminDrafts.items.length, 1);
assert.equal(adminDrafts.items[0].id, second.id);
assert.equal(adminDrafts.items[0].body, undefined);
assert.equal(adminDrafts.next_page, 2);

const results = await Promise.all([publicationResult(first.id, 2), publicationResult(first.id, 2)]);
assert.deepEqual(results.sort(), [200, 409]);
async function publicationResult(id, version) {
    const response = await fetch(base + managePath + '/' + id + '/publication', {method: 'POST',
        headers: {Authorization: 'Bearer ' + admin.token, 'Content-Type': 'application/json'},
        body: JSON.stringify({version, status: 'published'})});
    return response.status;
}
const firstPublished = (await call(managePath + '/' + first.id, 200, admin)).data;
assert.equal(firstPublished.version, 3);
assert(firstPublished.published_at);
await edit(409, first.id, {...article, version: 3});
const secondPublished = (await publication(200, second.id, 1, 'published')).data;
assert(secondPublished.published_at);
const publicPage = (await call(publicPath + '?limit=1', 200)).data;
assert.equal(publicPage.items[0].id, second.id);
assert.equal(publicPage.next_page, 2);
assert.equal(publicPage.items[0].body, undefined);
const pageTwo = (await call(publicPath + '?limit=1&page=2', 200)).data;
assert.equal(pageTwo.items[0].id, first.id);
assert.equal(pageTwo.next_page, null);
const filtered = (await call(publicPath + '?category=panduan-sampira&q=' + encodeURIComponent('PICKUP'), 200)).data;
assert.deepEqual(filtered.items.map(item => item.id), [first.id]);
for (const query of ["' OR 1=1 --", '_', '100!%', '%tidakada']) {
    assert.deepEqual((await call(publicPath + '?q=' + encodeURIComponent(query), 200)).data.items, []);
}
assert.deepEqual((await call(publicPath + '?q=%25', 200)).data.items.map(item => item.id), [second.id]);
const detail = (await call(publicPath + '/' + first.slug, 200)).data;
assert.equal(detail.body, article.body);
assert.deepEqual(detail.sources, first.sources);
for (const key of ['status', 'version', 'created_by', 'updated_by', 'created_at', 'updated_at']) {
    assert.equal(detail[key], undefined);
    assert.equal(publicPage.items[0][key], undefined);
}

const archived = (await publication(200, first.id, 3, 'archived')).data;
assert.equal(archived.status, 'archived');
assert.equal(archived.published_at, firstPublished.published_at);
await call(publicPath + '/' + first.slug, 404);
await publication(409, first.id, archived.version, 'published');
assert.deepEqual((await call(publicPath, 200)).data.items.map(item => item.id), [second.id]);
const discarded = (await create(201, {...article, slug: 'draft-diarsipkan-fixture'})).data;
assert.equal((await publication(200, discarded.id, 1, 'archived')).data.published_at, null);
await call(publicPath + '/' + discarded.slug, 404);
assert.deepEqual(fingerprint(db), beforeContent, 'Education actions must preserve legacy workflow data and schema.');
console.log('PASS Phase 6A API: Admin RBAC, cookie origin, draft/public/archive isolation, search/pagination, audit, XSS/SQL injection and concurrent publication.');
