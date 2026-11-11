// Run on a fresh, isolated MariaDB instance. Never point port 13316 at an existing application database.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {cpSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const db = 'sampira_phase1_test';
const fresh = 'sampira_phase1_fresh';
const {SAMPIRA_TEST_MYSQL, SAMPIRA_TEST_BIN, SAMPIRA_TEST_INIT} = process.env;
assert(SAMPIRA_TEST_MYSQL && SAMPIRA_TEST_BIN && SAMPIRA_TEST_INIT, 'Set test executable paths first.');
const args = ['--no-defaults', '--protocol=tcp', '-h', '127.0.0.1', '-P', '13316', '-u', 'root', '-N', '-B'];
const sql = (database, input) => execFileSync(SAMPIRA_TEST_MYSQL, database ? [...args, database] : args, {
    input, encoding: 'utf8'
}).replaceAll('\r', '').trim();

const cwd = mkdtempSync(join(tmpdir(), 'sampira-phase1-http-'));
for (const directory of ['app', 'assets']) cpSync(directory, join(cwd, directory), {recursive: true});
const password = randomBytes(24).toString('hex');
const env = {
    ...process.env, DB_HOST: '127.0.0.1:13316', DB_USER: 'root', DB_PASS: '', DB_NAME: db,
    PORT: '18081', SAMPIRA_LISTEN_HOST: '127.0.0.1', SAMPIRA_SECURE_COOKIE: 'false', JWT_SECRET: randomBytes(32).toString('hex'), SAMPIRA_TEST_PASSWORD: password
};
const init = () => execFileSync(SAMPIRA_TEST_INIT, [], {cwd, env: {...env, DB_NAME: fresh}});
const createAdmin = (database, email) => execFileSync(SAMPIRA_TEST_BIN, ['-bootstrap-administrator', 'Phase 1 fixture', email], {
    cwd, input: password + '\n', env: {...env, DB_NAME: database}, stdio: 'pipe'
});

init();
assert.equal(sql(fresh, 'SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM pickups; SELECT COUNT(*) FROM transactions;'), '0\n0\n0');
assert.throws(init);
createAdmin(fresh, 'isolated@phase1.invalid');
const hash = sql(fresh, "SELECT password FROM users WHERE email='isolated@phase1.invalid';");
const legacy = execFileSync('git', ['show', 'e648496:db_init/db_init.go'], {encoding: 'utf8'});
const ddl = [...legacy.matchAll(/:= `(CREATE TABLE[\s\S]*?)`/g)].map(match => match[1]);
assert.equal(ddl.length, 6);
sql(null, 'CREATE DATABASE ' + db + ';');
sql(db, ddl.join(';\n') + ';');
sql(db, `
INSERT INTO users (id,name,email,password,role) VALUES
(101,'Legacy Admin','admin@phase1.invalid','${hash}','admin'),
(102,'Legacy Collector','collector@phase1.invalid','${hash}','collector'),
(103,'Legacy Owner','owner@phase1.invalid','${hash}','user'),
(104,'Legacy Collector 2','second-collector@phase1.invalid','${hash}','collector');
INSERT INTO waste_categories (id,category_name,reward_per_kg,processing_fee_per_kg) VALUES (2,'Computers',7000,1000),(3,'Small Gadgets',5100,500);
INSERT INTO pickups (id,user_id,collector_id,tracking_number,category_id,status,weight_kg) VALUES (20,103,102,'PHASE1-LEGACY',2,'transit',2);
INSERT INTO pickups (id,user_id,tracking_number,category_id,status,weight_kg) VALUES (21,103,'PHASE1-QUEUE',2,'pending',1);
INSERT INTO pickups (id,user_id,collector_id,tracking_number,category_id,status,weight_kg) VALUES (22,103,102,'PHASE2-WEIGH',2,'arrived',2);
INSERT INTO pickup_history (pickup_id,status,notes) VALUES (20,'transit','Legacy history');
INSERT INTO transactions (pickup_id,transaction_ref,amount,transaction_type,status) VALUES (20,'LEGACY-REFERENCE',100,'reward_payout','success');
INSERT INTO portal_announcements (title,message,target_role,created_by,updated_at) VALUES ('Phase 1 legacy','Fixture','collector',101,'2025-01-01 09:00:00');
`);
const references = 'SELECT id,user_id,collector_id,category_id FROM pickups; SELECT id,pickup_id,notes FROM pickup_history; SELECT id,pickup_id,transaction_ref FROM transactions; SELECT id,created_by,updated_at FROM portal_announcements;';
const foreignKeys = 'SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,COLUMN_NAME;';
const before = sql(db, references + foreignKeys);
const migrate = readFileSync('db_init/migrations/001_four_roles.sql', 'utf8');
sql(db, migrate);
assert.equal(sql(db, references + foreignKeys), before);
assert.equal(sql(db, 'SELECT id,role FROM users ORDER BY id;'), '101\tadmin\n102\tpetugas\n103\tuser\n104\tpetugas');
assert.equal(sql(db, 'SELECT target_role FROM portal_announcements;'), 'petugas');
createAdmin(db, 'administrator@phase1.invalid');
assert.throws(() => createAdmin(db, 'administrator@phase1.invalid'));
sql(db, migrate);
assert.equal(sql(db, references + foreignKeys), before);
assert.equal(sql(db, "SELECT role FROM users WHERE email='administrator@phase1.invalid';"), 'administrator');
console.log('PASS: fresh initializer, migration and re-run, bootstrap uniqueness, legacy IDs, roles, announcements, history, transaction and foreign keys.');

assert.throws(() => execFileSync(SAMPIRA_TEST_BIN, [], {cwd, env: {...env, JWT_SECRET: ''}}), /JWT_SECRET/);
const server = spawn(SAMPIRA_TEST_BIN, [], {cwd, env, stdio: 'inherit'});
try {
    let ready = false;
    for (let attempt = 0; attempt < 30 && server.exitCode === null; attempt++) {
        try {
            const response = await fetch('http://127.0.0.1:18081/login');
            if (response.ok) { ready = true; break; }
        } catch {
            // The server can take a moment to open its socket.
        }
        await delay(200);
    }
    assert(ready && server.exitCode === null, 'Isolated HTTP server failed to start.');
    execFileSync(process.execPath, [resolve('scripts/check-api-regressions.mjs')], {cwd, env, stdio: 'inherit'});
    if (process.env.SAMPIRA_TEST_PHASE3 === '1') {
        execFileSync(process.execPath, [resolve('scripts/check-phase3-reports.mjs')], {cwd, env, stdio: 'inherit'});
    }
    if (process.env.SAMPIRA_TEST_PHASE4 === '1') {
        execFileSync(process.execPath, [resolve('scripts/check-phase4-handling.mjs')], {cwd, env, stdio: 'inherit'});
    }
    if (process.env.SAMPIRA_TEST_PHASE5 === '1') {
        assert.equal(process.env.SAMPIRA_TEST_PHASE4, '1', 'Phase 5 migration needs the populated Phase 4 fixture.');
        execFileSync(process.execPath, [resolve('scripts/check-phase5-locations.mjs')], {cwd, env, stdio: 'inherit'});
    }
    if (process.env.SAMPIRA_TEST_PHASE6 === '1' || process.env.SAMPIRA_TEST_PHASE6_BROWSER_PREP === '1') {
        if (process.env.SAMPIRA_TEST_PHASE6 === '1') {
            assert.equal(process.env.SAMPIRA_TEST_PHASE5, '1', 'Phase 6 migration needs the populated Phase 5 fixture.');
        }
        execFileSync(process.execPath, [resolve('scripts/check-phase6-education.mjs')], {cwd, env, stdio: 'inherit'});
    }
    if (process.env.SAMPIRA_TEST_PHASE7 === '1') {
        execFileSync(process.execPath, [resolve('scripts/check-phase7.mjs')], {cwd, env, stdio: 'inherit'});
    }
    if (process.env.SAMPIRA_TEST_PHASE9 === '1') {
        execFileSync(process.execPath, [resolve('scripts/check-phase9.mjs')], {cwd, env, stdio: 'inherit'});
    }
    if (process.env.SAMPIRA_TEST_CHROME) {
        execFileSync(process.execPath, [resolve('scripts/check-phase1-browser.mjs')], {cwd, env, stdio: 'inherit'});
    }
} finally {
    server.kill();
}
