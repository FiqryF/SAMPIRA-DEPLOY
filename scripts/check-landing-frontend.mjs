import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export async function checkLandingBrowser({send, js, nav, click, text, waitFor, profile}) {
    const folder = process.env.SAMPIRA_LANDING_SCREENSHOTS || join(profile, 'landing-6b1');
    mkdirSync(folder, {recursive: true});
    const q = JSON.stringify;
    const viewport = width => send('Emulation.setDeviceMetricsOverride', {
        width, height: width <= 430 ? 850 : 1000, deviceScaleFactor: 1, mobile: width <= 430
    });
    const key = async (name, code, virtualKeyCode) => {
        for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', {
            type, key: name, code, windowsVirtualKeyCode: virtualKeyCode,
            ...(name === 'Enter' && type === 'keyDown' ? {text: '\r', unmodifiedText: '\r'} : {})
        });
    };

    await viewport(1440);
    await nav('/');
    await text('.hero h1', 'Laporkan Sampah,');
    await text('.hero h1', 'Pantau Perubahannya.');
    assert.deepEqual(await js('Array.from(document.querySelectorAll("main > section")).map(section => section.getAttribute("aria-labelledby"))'), [
        'hero-title', 'service-title', 'workflow-title', 'benefits-title', 'education-title', 'closing-title', 'faq-title'
    ]);
    assert.equal(await js('document.querySelectorAll(".service-card").length'), 4);
    assert.deepEqual(await js('Array.from(document.querySelectorAll(".workflow ol")).map(list => list.children.length)'), [4, 4]);
    assert.equal(await js('document.querySelectorAll(".faq-list details").length'), 5);

    for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440]) {
        await viewport(width);
        await js('document.fonts.ready.then(() => document.querySelector(".hero-visual img").decode())');
        assert(await js('document.documentElement.scrollWidth <= innerWidth + 1'), 'Landing overflow at ' + width);
        assert(await js('document.querySelector(".hero-visual img").naturalWidth > 0'), 'Hero asset did not load');
        const asset = await js('document.querySelector(".hero-visual img").currentSrc');
        assert.match(asset, /landing-bandung-(640|1280)\.webp$/);
        if ([320, 390, 768, 1280, 1440].includes(width)) {
            const {cssContentSize} = await send('Page.getLayoutMetrics');
            const full = await send('Page.captureScreenshot', {
                format: 'png', captureBeyondViewport: true, clip: {x: 0, y: 0, width, height: Math.ceil(cssContentSize.height), scale: 1}
            });
            writeFileSync(join(folder, 'landing-' + width + '.png'), Buffer.from(full.data, 'base64'));
        }
    }
    const heroTiming = await js('performance.getEntriesByType("resource").filter(entry => entry.name.includes("landing-bandung")).map(({name, decodedBodySize}) => ({file: name.split("/").pop(), bytes: decodedBodySize}))');
    assert(heroTiming.some(entry => entry.bytes > 0 && entry.bytes < 200000));
    console.log('Landing hero transfer resources:', JSON.stringify(heroTiming));

    await viewport(390);
    await send('Network.setCacheDisabled', {cacheDisabled: true});
    await nav('/?viewport=mobile');
    await waitFor(() => js('document.querySelector(".hero-visual img").complete && document.querySelector(".hero-visual img").currentSrc.endsWith("landing-bandung-640.webp")'), 'Mobile hero variant was not selected');
    await send('Network.setCacheDisabled', {cacheDisabled: false});
    await waitFor(() => js('getComputedStyle(document.querySelector("#main-nav")).display === "none"'), 'Mobile menu did not initialize');
    await js('document.querySelector(".menu-toggle").focus(); void 0');
    await key('Enter', 'Enter', 13);
    assert.equal(await js('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'true');
    assert.equal(await js('document.activeElement.textContent.trim()'), 'Beranda');
    await key('Escape', 'Escape', 27);
    assert.equal(await js('document.activeElement.className'), 'menu-toggle');
    await key('Enter', 'Enter', 13);
    await click('#main-nav a[href="#layanan"]');
    await waitFor(() => js('location.hash === "#layanan" && document.activeElement.id === "layanan"'), 'Mobile anchor focus was lost');
    assert.equal(await js('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'false');
    assert.equal(await js('document.querySelector("#main-nav a[href=\'#layanan\']").getAttribute("aria-current")'), 'location');

    await js('document.querySelector(".faq-list summary").focus(); void 0');
    await key('Enter', 'Enter', 13);
    assert(await js('document.querySelector(".faq-list details").open'));
    await key('Enter', 'Enter', 13);
    assert(!(await js('document.querySelector(".faq-list details").open')));
    await click('footer a[href="#estimator"]');
    await waitFor(() => js('location.hash === "#estimator" && document.querySelector("#estimator").open'), 'Estimator link did not open the panel');
    const estimate = await js(`fetch("/api/ecorecycle/estimate_reward", {method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({category:"Small Gadgets", weight_kg:"2"})}).then(async response => {
        if (!response.ok) throw new Error("Tariff API HTTP " + response.status);
        const {data} = await response.json();
        return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(data.net_estimate).replace(/\\s/g,"");
    })`);
    await js('document.querySelector("#estimator-category").value = "Small Gadgets"; document.querySelector("#estimator-form").requestSubmit(); void 0');
    await text('#result-reward-val', estimate);
    assert.equal(await js('document.querySelector("#estimator-result-card").hidden'), false);
    await js('document.querySelector("#estimator-weight").dispatchEvent(new Event("input", {bubbles:true})); void 0');
    assert(await js('document.querySelector("#estimator-result-card").hidden'));

    await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
    await waitFor(() => js('document.querySelector(".motion-toggle").disabled'), 'Reduced motion control did not update');
    assert.equal(await js('getComputedStyle(document.documentElement).scrollBehavior'), 'auto');
    await send('Emulation.setEmulatedMedia', {features: []});

    const api = await js('fetch("/api/ecorecycle/education/articles?limit=3").then(async r => ({status:r.status, items:(await r.json()).data?.items}))');
    assert.equal(api.status, 200);
    assert(api.items.length <= 3);
    if (api.items.length) {
        await text('.education-grid', api.items[0].title);
        assert.equal(await js('document.querySelectorAll(".education-grid article").length'), api.items.length);
        const detail = '/assets/education.html?' + new URLSearchParams({artikel: api.items[0].slug});
        assert.equal(await js('document.querySelector(".education-grid article a").getAttribute("href")'), detail);
        await click('.education-grid article a');
        await text('.sp-reader-article h1', api.items[0].title);
    } else await text('.education-grid', 'Artikel edukasi akan segera tersedia.');

    await nav('/');
    await click('.service-card[href="/assets/education.html"]');
    await text('#education-reader h1', 'Pusat Edukasi Lingkungan');
    await nav('/');
    await click('.service-card[href="/login"]');
    await text('#form-title', 'Masuk ke Akun Anda');
    await nav('/');
    await click('.hero-actions a[href="/register"]');
    await text('#form-title', 'Buat Akun Baru');
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('PASS landing Phase 6B.1: 8 viewports, focus, anchors, FAQ, real tariff, Education API, login and register links, reduced motion. ' + folder);
}
