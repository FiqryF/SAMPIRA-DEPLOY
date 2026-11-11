// Compares a live local snapshot with a restore on a separate MariaDB listener.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

const {SAMPIRA_MYSQL_BIN, SAMPIRA_BACKUP_PATH} = process.env;
assert(SAMPIRA_MYSQL_BIN && SAMPIRA_BACKUP_PATH, 'Configure executable directory and private backup path.');
const source = 'ecorecycle';
const restored = 'sampira_phase1_restore';
const connection = port => ['--no-defaults', '--protocol=tcp', '-h', '127.0.0.1', '-P', port, '-u', 'root'];
const sql = (port, schema, input) => execFileSync(join(SAMPIRA_MYSQL_BIN, 'mysql.exe'), [
    ...connection(port), '-N', '-B', ...(schema ? [schema] : [])
], {input, encoding: 'utf8'}).trim();
const dump = (port, schema, ...flags) => execFileSync(join(SAMPIRA_MYSQL_BIN, 'mysqldump.exe'), [
    ...connection(port), '--single-transaction', '--skip-lock-tables', '--skip-add-drop-table',
    '--order-by-primary', ...flags, schema
], {maxBuffer: 64 * 1024 * 1024});
const fingerprint = (port, schema) => createHash('sha256')
    .update(dump(port, schema, '--compact', '--no-create-info', '--skip-extended-insert')).digest('hex');

const structure = `
SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION;
SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE()
 AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, COLUMN_NAME;
SELECT id, role FROM users ORDER BY id;
`;
const before = fingerprint('3306', source);
const schema = sql('3306', source, structure);
dump('3306', source, '--result-file=' + SAMPIRA_BACKUP_PATH);
assert(statSync(SAMPIRA_BACKUP_PATH).size > 0);
assert.equal(fingerprint('3306', source), before, 'Source changed during capture. Retake backup in a quiet window.');
assert.equal(sql('3306', source, structure), schema, 'Source schema changed during capture.');
const backup = readFileSync(SAMPIRA_BACKUP_PATH);
assert(!/^\s*(?:DROP DATABASE|USE\s+)/im.test(backup.toString()), 'Unexpected cross-schema statement in dump.');
sql('13316', null, 'CREATE DATABASE ' + restored + ';');
const restoredDump = spawnSync(join(SAMPIRA_MYSQL_BIN, 'mysql.exe'), [...connection('13316'), restored],
    {input: backup, encoding: 'utf8'});
if (restoredDump.status !== 0) {
    const code = restoredDump.stderr?.match(/ERROR (\d+)/)?.[1] || 'unknown';
    throw new Error('Restore failed with MariaDB error ' + code);
}
assert.equal(sql('13316', restored, structure), schema);
assert.equal(fingerprint('13316', restored), before);
const orphanChecks = `
SELECT (SELECT COUNT(*) FROM pickups p LEFT JOIN users u ON u.id=p.user_id WHERE p.user_id IS NOT NULL AND u.id IS NULL)
+(SELECT COUNT(*) FROM pickups p LEFT JOIN users u ON u.id=p.collector_id WHERE p.collector_id IS NOT NULL AND u.id IS NULL)
+(SELECT COUNT(*) FROM pickups p LEFT JOIN waste_categories c ON c.id=p.category_id WHERE p.category_id IS NOT NULL AND c.id IS NULL)
+(SELECT COUNT(*) FROM pickup_history h LEFT JOIN pickups p ON p.id=h.pickup_id WHERE h.pickup_id IS NOT NULL AND p.id IS NULL)
+(SELECT COUNT(*) FROM transactions t LEFT JOIN pickups p ON p.id=t.pickup_id WHERE t.pickup_id IS NOT NULL AND p.id IS NULL)
+(SELECT COUNT(*) FROM portal_announcements a LEFT JOIN users u ON u.id=a.created_by WHERE a.created_by IS NOT NULL AND u.id IS NULL);
`;
assert.equal(sql('13316', restored, orphanChecks), '0');
const sessionTable = sql('13316', restored, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auth_sessions'");
if (sessionTable === '1') {
    assert.equal(sql('13316', restored, 'SELECT COUNT(*) FROM auth_sessions s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL'), '0');
}
const actorColumn = sql('13316', restored, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pickup_history' AND COLUMN_NAME='actor_id'");
if (actorColumn === '1') {
    assert.equal(sql('13316', restored, 'SELECT COUNT(*) FROM pickup_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.actor_id IS NOT NULL AND u.id IS NULL'), '0');
}
const ledgerTable = sql('13316', restored, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pickup_rewards'");
if (ledgerTable === '1') {
    assert.equal(sql('13316', restored, `
SELECT COUNT(*) FROM pickup_rewards r LEFT JOIN pickups p ON p.id=r.pickup_id LEFT JOIN users u ON u.id=r.paid_by
WHERE p.id IS NULL OR p.status<>'completed' OR (r.paid_by IS NOT NULL AND u.id IS NULL)
 OR (r.status='paid' AND (r.reference IS NULL OR r.proof IS NULL OR r.proof_digest IS NULL OR r.paid_by IS NULL OR r.paid_at IS NULL OR r.amount<=0))
 OR (r.status='not_due' AND r.amount<>0) OR (r.status='pending' AND r.amount<=0)
`), '0');
    console.log('PASS: restored Phase 2 ledger and actor integrity');
}
console.log('PASS: backup readable; restore matched table structure, four-role schema, account IDs, rows and foreign keys; zero orphans.');
console.log(sql('13316', restored, `
SELECT 'tables',COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();
SELECT 'users', COUNT(*) FROM users; SELECT 'pickups',COUNT(*) FROM pickups;
SELECT 'history',COUNT(*) FROM pickup_history; SELECT 'transactions',COUNT(*) FROM transactions;
SELECT 'announcements',COUNT(*) FROM portal_announcements;
`));
