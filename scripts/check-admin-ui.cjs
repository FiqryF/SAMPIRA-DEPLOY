// Tests the legacy CMS controls now hosted by the Administrator portal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const nodes = new Map();
const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, {innerHTML: '', innerText: '', value: ''});
    return nodes.get(id);
};
const button = {};
let start;
let submit;
let allowDelete = false;
const calls = [];
const form = getNode('announcement-form');
form.querySelector = () => button;
form.addEventListener = (_, listener) => { submit = listener; };
form.reset = () => {};
globalThis.document = {
    getElementById: getNode,
    addEventListener: (_, listener) => { start = listener; }
};
globalThis.window = {confirm: () => allowDelete, alert() {}, location: {replace() {}}};
globalThis.localStorage = {removeItem() {}};
globalThis.fetch = async (url, options = {}) => {
    calls.push({url, method: options.method || 'GET', body: options.body && JSON.parse(options.body)});
    const data = [{id: 7, title: '<script>fixture</script>', message: 'Notice', target_role: 'petugas',
        is_active: true, created_at: '2026-01-01'}];
    return {status: 200, json: async () => ({status: 'success', data})};
};
for (const file of ['portal-session', 'admin']) {
    vm.runInThisContext(fs.readFileSync(require.resolve('../assets/js/' + file + '.js'), 'utf8'));
}

async function main() {
    await start();
    const list = getNode('announcement-admin-list').innerHTML;
    assert(list.includes('&lt;script&gt;fixture&lt;/script&gt;'));
    assert(list.includes('Petugas'));
    assert(!list.includes('<script>'));
    await toggleAnnouncement(7, false);
    assert.deepEqual(calls.find(call => call.body?.action === 'toggle').body, {action: 'toggle', id: 7, is_active: false});
    await deleteAnnouncement(7);
    assert(!calls.some(call => call.method === 'DELETE'));
    allowDelete = true;
    await deleteAnnouncement(7);
    assert(calls.some(call => call.method === 'DELETE' && call.url.endsWith('?id=7')));
    getNode('announcement-title').value = ' Title ';
    getNode('announcement-message').value = ' Message ';
    getNode('announcement-target').value = 'user';
    await submit.call(form, {preventDefault() {}});
    assert.deepEqual(calls.find(call => call.body?.title === 'Title').body,
        {title: 'Title', message: 'Message', target_role: 'user'});
    assert.equal(button.disabled, false);
    console.log('PASS: Administrator CMS escaping, toggle, publish, delete confirmation and canceled delete (mock DOM).');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
