// Real Chromium QA using its DevTools protocol. Runs only with the isolated fixture server.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const chrome = process.env.SAMPIRA_TEST_CHROME;
const password = process.env.SAMPIRA_TEST_PASSWORD;
const base = 'http://127.0.0.1:18081';
assert(chrome && password);
const profile = mkdtempSync(join(tmpdir(), 'sampira-browser-'));
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--disable-background-networking',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'],
{stdio: 'ignore', windowsHide: true});

async function waitFor(fn, message, timeout = 15000) {
    const end = Date.now() + timeout;
    let value;
    while (Date.now() < end) {
        try { value = await fn(); } catch { value = false; }
        if (value) return value;
        await sleep(100);
    }
    throw new Error(message);
}

let socket;
try {
    const port = await waitFor(() => readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0],
        'Chrome DevTools did not start');
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, {once: true});
        socket.addEventListener('error', reject, {once: true});
    });

    let counter = 0;
    const pending = new Map();
    const exceptions = [];
    const consoleErrors = [];
    const responses = [];
    const failed = [];
    const requests = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++counter;
        pending.set(id, {resolve, reject});
        socket.send(JSON.stringify({id, method, params}));
    });

    socket.addEventListener('message', event => {
        const {id, method, params, result, error} = JSON.parse(event.data);
        if (id) {
            const callback = pending.get(id);
            pending.delete(id);
            if (error) callback.reject(new Error(error.message));
            else callback.resolve(result);
        } else if (method === 'Runtime.exceptionThrown') {
            exceptions.push(params.exceptionDetails.exception?.description?.split('\n')[0] || params.exceptionDetails.text);
        } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
            consoleErrors.push(params.args.map(arg => arg.description || arg.value || arg.type).join(' ').split('\n')[0]);
        } else if (method === 'Network.requestWillBeSent') {
            requests.set(params.requestId, params.request.url);
        } else if (method === 'Network.responseReceived') {
            responses.push({url: params.response.url, status: params.response.status});
        } else if (method === 'Network.loadingFailed' && !params.canceled) {
            failed.push({url: requests.get(params.requestId), error: params.errorText});
        } else if (method === 'Page.javascriptDialogOpening') {
            void send('Page.handleJavaScriptDialog', {accept: true});
        }
    });

    for (const domain of ['Page', 'Runtime', 'Network']) await send(domain + '.enable');
    const js = async expression => {
        const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
    };
    const waitPath = path => waitFor(() => js('location.pathname + location.search === ' + JSON.stringify(path) + ' && document.readyState !== "loading"'), 'Navigation failed for ' + path);
    const nav = async path => { await send('Page.navigate', {url: base + path}); await waitPath(path); };
    const text = (selector, expected) => waitFor(() => js(
        'document.querySelector(' + JSON.stringify(selector) + ')?.innerText.includes(' + JSON.stringify(expected) + ')'),
        'Expected text missing in ' + selector);
    const click = selector => js('document.querySelector(' + JSON.stringify(selector) + ').click()');
    const apiCode = path => js('fetch(' + JSON.stringify(path) + ').then(r => r.status)');

    async function login(email, destination) {
        if (!await js('location.pathname === "/login" && !location.search')) await nav('/login');
        await waitFor(() => js('document.readyState === "complete"'), 'Login did not finish loading');
        await js(`document.querySelector('#login-email').value = ${JSON.stringify(email)};
            document.querySelector('#login-password').value = ${JSON.stringify(password)};
            document.querySelector('#login-form').requestSubmit(); void 0`);
        await waitPath(destination);
        await waitFor(() => js('document.readyState === "complete"'), 'Portal did not finish loading');
        const cookies = (await send('Network.getCookies', {urls: [base]})).cookies;
        const cookie = cookies.find(item => item.name === 'sampira_session');
        assert(cookie?.httpOnly && cookie.sameSite === 'Lax');
        assert.equal(await js("document.cookie.includes('sampira_session') || localStorage.getItem('user') !== null"), false);
    }

    async function layout() {
        for (const width of [1280, 390]) {
            await send('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 500});
            await sleep(150);
            assert(await js('document.documentElement.scrollWidth <= innerWidth + 2'), 'Horizontal page overflow at ' + width);
        }
        await send('Emulation.clearDeviceMetricsOverride');
    }

    async function blocked(path) {
        const before = responses.length;
        await nav(path);
        assert(responses.slice(before).some(r => r.url === base + path && r.status === 403), 'Direct route allowed ' + path);
    }

    async function logout(selector, protectedPath) {
        await click(selector);
        await waitPath('/login');
        const cookies = (await send('Network.getCookies', {urls: [base]})).cookies;
        assert(!cookies.some(item => item.name === 'sampira_session'));
        await send('Page.navigate', {url: base + protectedPath});
        await waitPath('/login');
    }

    if (process.env.SAMPIRA_TEST_PORTAL_DESIGN_ONLY === '1') {
        const {checkPortalDesign} = await import('./check-portal-design.mjs');
        await checkPortalDesign({send, js, nav, login, click, text, waitFor, profile});
        assert.deepEqual(exceptions, [], 'Four-role JavaScript exceptions');
        assert.deepEqual(consoleErrors, [], 'Four-role console errors');
    } else if (process.env.SAMPIRA_TEST_AUTH_ONLY === '1') {
        const {checkAuthBrowser} = await import('./check-auth-frontend.mjs');
        await checkAuthBrowser({send, js, nav, click, text, waitFor, waitPath, profile});
        assert.deepEqual(exceptions, [], 'Auth JavaScript exceptions');
        assert.deepEqual(consoleErrors, [], 'Auth console errors');
    } else if (process.env.SAMPIRA_TEST_PHASE8_ONLY === '1') {
        const {checkPhase8Browser} = await import('./check-phase8-frontend.mjs');
        await checkPhase8Browser({send, js, nav, login, click, text, waitFor, profile});
        assert.deepEqual(exceptions, [], 'Uncaught JavaScript exceptions in Phase 8');
        assert.deepEqual(consoleErrors, [], 'Application console errors in Phase 8');
    } else {
    await nav('/');
    await waitFor(() => js('document.readyState === "complete"'), 'Landing incomplete');
    await click('#estimator summary');
    await js(`document.querySelector('#estimator-category').value = 'Small Gadgets';
        document.querySelector('#estimator-weight').value = '2';
        document.querySelector('#estimator-form').requestSubmit(); void 0`);
    await text('#result-reward-val', '9.200');
    await layout();
    console.log('PASS Chromium landing: estimator uses the current database tariff.');
    const qa = '/api/ecorecycle/';
    await login('owner@phase1.invalid', '/dashboard');
    await text('#metric-total-weight', '5.5');
    await click('[data-target="riwayat-payout"]');
    await text('#payout-history-table-body', 'PHASE1-LEGACY');
    await text('#payout-history-table-body', 'Menunggu pembayaran');
    await js("Array.from(document.querySelectorAll('#payout-history-table-body button')).find(el => el.closest('li').innerText.includes('Menunggu pembayaran')).click()");
    await text('#track-disp-reward', 'Menunggu pembayaran');
    await layout();
    await nav('/profile');
    await text('#profile-user-name', 'Legacy Owner');
    await layout();
    await blocked('/administrator');
    await nav('/profile');
    await logout('a[onclick^="logoutProfile"]', '/dashboard');
    console.log('PASS Chromium User: login, dashboard, private history, profile, direct denial, logout, desktop/mobile.');

    await login('collector@phase1.invalid', '/petugas');
    assert.equal(await js('document.querySelector("[data-facility-reports]") === null'), true);
    await text('#upcoming-task-list', 'PHASE1-QUEUE');
    const assigned = '[data-mission]';
    await waitFor(() => js('!!document.querySelector(' + JSON.stringify(assigned) + ')'), 'Assigned pickup missing');
    await js("Array.from(document.querySelectorAll('[data-mission]')).find(el => el.innerText.includes('PHASE1-LEGACY')).click()");
    await text('#mission-resi', 'PHASE1-LEGACY');
    assert.equal(await apiCode(qa + 'pickup_status?tracking_number=PHASE1-LEGACY'), 200);
    await js("Array.from(document.querySelectorAll('[data-mission]')).find(el => el.innerText.includes('PHASE2-WEIGH')).click()");
    await text('#mission-btn', 'Catat Berat Aktual');
    await click('#mission-btn');
    await waitFor(() => js("!!document.querySelector('#swal2-input')"), 'Weight dialog missing');
    await js("document.querySelector('#swal2-input').value='2.50'; document.querySelector('.swal2-confirm').click()");
    await text('.swal2-title', 'penjemputan selesai');
    await click('.swal2-confirm');
    await layout();
    await blocked('/admin');
    await blocked('/administrator');
    await nav('/petugas');
    await logout('button[onclick^="logoutCollector"]', '/petugas');
    console.log('PASS Chromium Petugas: login, queue, assigned detail, direct denials, logout, desktop/mobile.');

    await login('admin@phase1.invalid', '/admin');
    await text('#admin-overview', 'Ringkasan operasional');
    assert.equal(await apiCode('/api/user/profile'), 200);
    assert.equal(await apiCode('/api/administrator/session'), 403);
    await layout();
    await blocked('/administrator');
    await nav('/admin');
    await logout('form[action="/logout"] button', '/admin');
    console.log('PASS Chromium Admin: login, report shell, own session, Administrator denied, logout, desktop/mobile.');

    await login('administrator@phase1.invalid', '/administrator');
    assert.equal(await js('document.querySelector("[data-facility-reports]") === null'), true);
    await text('#announcement-admin-list', 'Phase 1 legacy');
    await text('#reward-payment-list', 'PHASE2-WEIGH');
    const proof = join(profile, 'receipt-fixture.png');
    const receipt = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=', 'base64');
    writeFileSync(proof, Buffer.concat([receipt, Buffer.from('browser-test-receipt')]));
    const dom = await send('DOM.getDocument');
    const file = await send('DOM.querySelector', {nodeId: dom.root.nodeId, selector:'#reward-payment-proof'});
    await send('DOM.setFileInputFiles', {nodeId: file.nodeId, files: [proof]});
    await js(`document.querySelector('#reward-pickup-id').value='22';
        document.querySelector('#reward-payment-amount').value='15000';
        document.querySelector('#reward-payment-reference').value='BROWSER-REF-001';
        document.querySelector('#reward-payment-confirm').checked=true;
        document.querySelector('#reward-payment-form').requestSubmit(); void 0`);
    await text('#reward-payment-status', 'Pembayaran eksternal tercatat');
    console.log('PASS Chromium Phase 2: owner reward tracking, assigned weighing, and Administrator proof form.');
    assert.equal(await apiCode('/api/administrator/session'), 200);
    await js(`document.querySelector('#announcement-title').value='Browser CMS check';
        document.querySelector('#announcement-message').value='Isolated browser fixture';
        document.querySelector('#announcement-form').requestSubmit(); void 0`);
    await text('#announcement-admin-list', 'Browser CMS check');
    await waitFor(() => js("!document.querySelector('.swal2-popup')"), 'CMS confirmation did not close');
    await layout();
    await blocked('/admin');
    await nav('/administrator');
    await logout('form[action="/logout"] button', '/administrator');
    console.log('PASS Chromium Administrator: login, CMS publication, Admin denied, logout, desktop/mobile.');

    await login('administrator@phase1.invalid', '/administrator');
    execFileSync(process.env.SAMPIRA_TEST_MYSQL, ['--no-defaults', '--protocol=tcp', '-h', '127.0.0.1',
        '-P', '13316', '-u', 'root', 'sampira_phase1_test', '-e',
        "UPDATE auth_sessions s JOIN users u ON u.id=s.user_id SET s.expires_at=0 WHERE u.role='administrator'"]);
    await send('Page.navigate', {url: base + '/administrator'});
    await waitPath('/login');
    console.log('PASS Chromium expired session redirected to login.');
    assert.deepEqual(exceptions, [], 'Uncaught JavaScript exceptions');
    assert.deepEqual(consoleErrors, [], 'Application console errors');
    const expectedUnavailableReports = r => process.env.SAMPIRA_TEST_PHASE3_FE !== '1' && r.status === 404 &&
        new URL(r.url).pathname === '/api/ecorecycle/facility-reports';
    assert.deepEqual(responses.filter(r => r.url.startsWith(base) && r.status >= 400 &&
        ![401, 403].includes(r.status) && !expectedUnavailableReports(r)),
        [], 'Unexpected local HTTP failures');
    assert.deepEqual(failed.filter(r => r.url?.startsWith(base)), [], 'Local network failures');
    const externalErrors = failed.filter(r => !r.url?.startsWith(base));
    console.log('External resource errors: ' + externalErrors.length + (externalErrors.length
        ? ' (' + [...new Set(externalErrors.map(r => r.error))].join(', ') + ')' : ''));
    if (process.env.SAMPIRA_TEST_PHASE3_FE === '1') {
        const {checkFacilityBrowser} = await import('./check-phase3-frontend.mjs');
        await checkFacilityBrowser({send, js, nav, login, click, text, waitFor, waitPath, profile, password});
        assert.deepEqual(exceptions, [], 'Uncaught JavaScript exceptions in Phase 3B');
        assert.deepEqual(consoleErrors, [], 'Application console errors in Phase 3B');
    }
    if (process.env.SAMPIRA_TEST_PHASE4_FE === '1') {
        const {checkHandlingBrowser} = await import('./check-phase4-frontend.mjs');
        await checkHandlingBrowser({send, js, login, click, text, waitFor, profile, password});
        assert.deepEqual(exceptions, [], 'Uncaught JavaScript exceptions in Phase 4B');
        assert.deepEqual(consoleErrors, [], 'Application console errors in Phase 4B');
    }
    if (process.env.SAMPIRA_TEST_PHASE5_FE === '1') {
        const {checkLocationBrowser} = await import('./check-phase5-frontend.mjs');
        await checkLocationBrowser({send, js, login, click, text, waitFor, profile, password});
        assert.deepEqual(exceptions, [], 'Uncaught JavaScript exceptions in Phase 5B');
        assert.deepEqual(consoleErrors, [], 'Application console errors in Phase 5B');
    }
    if (process.env.SAMPIRA_TEST_PHASE6_FE === '1') {
        const {checkAuthBrowser} = await import('./check-auth-frontend.mjs');
        await checkAuthBrowser({send, js, nav, click, text, waitFor, waitPath, profile});
        const {checkLandingBrowser} = await import('./check-landing-frontend.mjs');
        await checkLandingBrowser({send, js, nav, click, text, waitFor, profile});
        const {checkPhase6Browser} = await import('./check-phase6-frontend.mjs');
        await checkPhase6Browser({send, js, nav, login, click, text, waitFor, profile});
        const {checkUserWorkspace} = await import('./check-user-frontend.mjs');
        await checkUserWorkspace({send, js, nav, login, click, text, waitFor, profile});
        const {checkPhase8Browser} = await import('./check-phase8-frontend.mjs');
        await checkPhase8Browser({send, js, nav, login, click, text, waitFor, profile});
        const {checkPortalDesign} = await import('./check-portal-design.mjs');
        await checkPortalDesign({send, js, nav, login, click, text, waitFor, profile});
        assert.deepEqual(exceptions, [], 'Uncaught JavaScript exceptions in Phase 6B');
        assert.deepEqual(consoleErrors, [], 'Application console errors in Phase 6B');
    }
    }
} finally {
    socket?.close();
    browser.kill();
}
