import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export async function checkAuthBrowser({send, js, nav, click, text, waitFor, waitPath, profile}) {
    const folder = process.env.SAMPIRA_AUTH_SCREENSHOTS || join(profile, 'auth-6b2');
    mkdirSync(folder, {recursive: true});
    const viewport = width => send('Emulation.setDeviceMetricsOverride', {
        width, height: width <= 430 ? 850 : 950, deviceScaleFactor: 1, mobile: width <= 430
    });
    async function capture(filename) {
        const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
        writeFileSync(join(folder, filename), Buffer.from(data, 'base64'));
    }
    const ready = () => waitFor(() => js('document.readyState === "complete"'), 'Auth page incomplete');
    const value = (id, data) => js('document.getElementById(' + JSON.stringify(id) + ').value = ' + JSON.stringify(data) + '; void 0');
    const submit = kind => js('document.getElementById(' + JSON.stringify(kind + '-form') + ').requestSubmit(); void 0');
    async function enter() {
        await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Enter', code:'Enter', text:'\r', unmodifiedText:'\r', windowsVirtualKeyCode:13});
        await send('Input.dispatchKeyEvent', {type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13});
    }

    for (const [page, heading] of [['login', 'Masuk ke Akun Anda'], ['register', 'Buat Akun Baru']]) {
        await nav('/' + page);
        await ready();
        await text('#form-title', heading);
        await js('document.fonts.ready.then(() => document.querySelector(".auth-scene img").decode())');
        assert(await js('document.querySelector(".auth-scene img").naturalWidth > 0'));
        assert(await js('document.querySelectorAll("main.auth-card").length === 1 && !document.querySelector(".auth-story")'));
        assert(await js('!/google|lupa (kata sandi|password)|ingat saya/i.test(document.body.innerText)'));
        assert(await js('Array.from(document.querySelectorAll("form input")).every(input => input.labels.length === 1)'));
        for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440]) {
            await viewport(width);
            assert(await js('document.documentElement.scrollWidth <= innerWidth + 1'), page + ' overflows at ' + width);
            assert(await js(`(() => {
                const card = document.querySelector(".auth-card").getBoundingClientRect();
                const back = document.querySelector(".back-link").getBoundingClientRect();
                return back.left >= card.left && back.right < card.right && back.top - card.top < 24;
            })()`), 'Back link is not at the top left');
            assert(await js('Array.from(document.querySelectorAll("form button, form input")).every(el => el.getBoundingClientRect().height >= 44)'));
            assert(await js(`(() => {
                const form=document.querySelector('.auth-body').getBoundingClientRect();
                const panel=document.querySelector('.auth-scene').getBoundingClientRect();
                return innerWidth < 768 ? panel.top >= form.bottom-1
                    : Math.abs(panel.top-document.querySelector('.auth-card').getBoundingClientRect().top)<2 && (document.body.dataset.authPage==='login' ? panel.left>=form.right-1 : panel.right<=form.left+1);
            })()`), 'Auth split panel placement failed at '+width);
            assert.equal(await js('getComputedStyle(document.querySelector(".auth-body")).viewTransitionName'), 'auth-'+page+'-form');
            if ([320, 390, 1440].includes(width)) await capture(page + '-' + width + '.png');
        }
    }

    const transitionProbe = await send('Page.addScriptToEvaluateOnNewDocument', {source:`window.addEventListener('pagereveal', event => {window.authTransitionObserved=Boolean(event.viewTransition);});`});
    await viewport(1440);
    await nav('/login');
    await ready();
    assert(await js('document.querySelector(".auth-card").getBoundingClientRect().width === innerWidth'));
    await click('.panel-link');
    await waitPath('/register');
    await ready();
    await waitFor(() => js('window.authTransitionObserved === true'), 'Login to register transition missing');
    await waitFor(() => js('!document.getAnimations().some(animation => animation.playState === "running")'), 'Transition did not settle');
    await click('.panel-link');
    await waitPath('/login');
    await ready();
    await waitFor(() => js('window.authTransitionObserved === true'), 'Register to login transition missing');
    await nav('/register');
    await ready();
    await send('Page.removeScriptToEvaluateOnNewDocument', {identifier:transitionProbe.identifier});
    await viewport(390);
    await submit('register');
    await text('#register-name-error', 'Isi nama lengkap');
    await text('#register-confirm-password-error', 'Isi konfirmasi');
    assert.equal(await js('document.activeElement.id'), 'register-name');
    await value('register-name', 'Fixture auth check');
    await value('register-email', 'bukan-email');
    await submit('register');
    await text('#register-email-error', 'format email');
    await value('register-email', 'validasi-auth@fixture.invalid');
    await value('register-password', 'éé');
    await value('register-confirm-password', 'éé');
    await submit('register');
    await text('#register-password-error', '6 hingga 72 byte');
    await value('register-password', 'é'.repeat(37));
    await value('register-confirm-password', 'é'.repeat(37));
    await submit('register');
    await text('#register-password-error', '6 hingga 72 byte');
    await value('register-password', 'fixture-demo');
    await value('register-confirm-password', 'fixture-berbeda');
    await submit('register');
    await text('#register-confirm-password-error', 'belum cocok');
    assert.equal(await js('document.activeElement.id'), 'register-confirm-password');
    await js('document.querySelector("[aria-controls=register-confirm-password]").focus(); void 0');
    await enter();
    assert.equal(await js('document.getElementById("register-confirm-password").type'), 'text');
    assert.equal(await js('document.getElementById("register-confirm-password").value'), 'fixture-berbeda');
    assert.equal(await js('document.querySelector("[aria-controls=register-confirm-password]").getAttribute("aria-pressed")'), 'true');
    await enter();
    assert.equal(await js('document.getElementById("register-confirm-password").type'), 'password');
    await capture('register-mismatch-390.png');
    await click('.panel-link');
    await waitPath('/login');
    await ready();

    await value('login-email', 'akun-uji-tidak-ada@fixture.invalid');
    await value('login-password', 'fixture-bukan-sandi');
    await submit('login');
    await text('.auth-error', 'Periksa email dan kata sandi');
    assert(await js('document.activeElement.matches(".auth-error")'));
    await capture('login-error-390.png');

    await js(`window.authFetchOriginal = window.fetch;
        window.authRequestCount = 0;
        window.fetch = () => {
            window.authRequestCount++;
            return new Promise(resolve => { window.resolveAuth = resolve; });
        };
        document.getElementById('login-form').requestSubmit();
        document.getElementById('login-form').requestSubmit();
        void 0;`);
    assert.equal(await js('window.authRequestCount'), 1);
    assert(await js('document.querySelector(".submit-button").disabled && document.querySelector("form").getAttribute("aria-busy") === "true"'));
    await text('.submit-button', 'Sedang masuk');
    await js('window.resolveAuth(new Response("{}", {status:503})); void 0');
    await text('.auth-error', 'Layanan sedang bermasalah');
    assert(await js('!document.querySelector(".submit-button").disabled'));
    await js('window.fetch = window.authFetchOriginal; void 0');

    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion', value:'reduce'}]});
    assert.equal(await js('getComputedStyle(document.querySelector(".submit-button")).transitionDuration'), '0s');
    await send('Emulation.setEmulatedMedia', {features:[]});
    await click('.panel-link');
    await waitPath('/register');
    await click('.back-link');
    await waitPath('/home');
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('PASS auth Phase 6B.2: 8 viewports per form, keyboard toggle, required, format, byte limits, mismatch, real login error, loading, double submit, 503, reduced motion and navigation. ' + folder);
}
