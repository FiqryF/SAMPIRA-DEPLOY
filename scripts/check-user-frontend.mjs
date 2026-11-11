import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkUserWorkspace({send, js, nav, login, click, text, waitFor, profile}) {
    const output = process.env.SAMPIRA_USER_SCREENSHOTS || join(profile, 'user-6b3');
    await mkdir(output, {recursive:true});
    const visible = selector => waitFor(() => js(
        'Boolean(document.querySelector(' + JSON.stringify(selector) + ')?.getClientRects().length)'),
        'User workspace section missing: ' + selector);
    const tab = id => click('.hub-tab[data-target="' + id + '"]');
    async function viewport(width) {
        await send('Emulation.setDeviceMetricsOverride', {width, height:960, deviceScaleFactor:1, mobile:width < 600});
        await sleep(150);
        const layout = await js('({page:document.documentElement.scrollWidth, view:innerWidth})');
        if (layout.page > layout.view + 2) {
            const items = await js(`[...document.querySelectorAll('main *')].filter(el => {
                const box = el.getBoundingClientRect();
                return box.right > innerWidth + 2 && !el.closest('.leaflet-container, [role=region]');
            }).slice(0, 8).map(el => el.id || el.className || el.tagName)`);
            assert.fail('User workspace page overflow at ' + width + ' ' + JSON.stringify({layout, items}));
        }
    }
    async function capture(name) {
        await js('window.scrollTo(0, 0); void 0');
        for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440]) {
            await viewport(width);
            if (width === 390 || width === 1440) {
                const {data} = await send('Page.captureScreenshot', {format:'png'});
                await writeFile(join(output, name + '-' + width + '.png'), Buffer.from(data, 'base64'));
            }
        }
    }

    await login('owner@phase1.invalid', '/dashboard');
    await visible('#own-location-map .sp-owned-pin--pickup');
    await visible('#own-location-map .sp-owned-pin--facility');
    await text('#own-map-status', 'titik presisi');
    await capture('01-beranda');
    await waitFor(() => js('Chart.getChart("monthlyWasteChart")?.data.datasets[0].data.some(weight => weight > 0)'),
        'Chart does not show verified pickup weight');
    await js('document.querySelector(".sp-workspace-grid").scrollIntoView({block:"start"}); void 0');
    const {data: overview} = await send('Page.captureScreenshot', {format:'png'});
    await writeFile(join(output, '01-beranda-ringkasan-1440.png'), Buffer.from(overview, 'base64'));

    await tab('setor-sampah');
    for (const field of ['#pickup-location-picker', '#form-item-description', '#form-pickup-address',
        '#form-waste-weight', '.sp-pickup-upload', '#pickup-request-form [type=submit]']) await visible(field);
    assert.equal(await js('document.querySelector("#form-item-description").validity.valueMissing'), true);
    await capture('02-penjemputan');

    await tab('laporan-fasilitas');
    await click('#facility-new');
    await visible('#facility-form-view');
    await capture('03-lapor-fasilitas');

    await tab('beranda');
    await click('#own-location-map .sp-owned-pin--facility');
    const facilityAction = '#own-location-map .leaflet-popup-content [data-record-kind=facility]';
    await visible(facilityAction);
    const facilityNumber = await js('document.querySelector(' + JSON.stringify(facilityAction) +
        ').getAttribute("aria-label").replace("Buka detail ", "")');
    await click(facilityAction);
    await text('#facility-detail', facilityNumber);
    await capture('04-detail-laporan');

    await tab('riwayat-payout');
    await text('#pickup-history-message', 'Menampilkan');
    await capture('05-riwayat-penjemputan');
    await js('const search = document.getElementById("pickup-history-search"); search.value = "PHASE1-LEGACY"; search.dispatchEvent(new Event("input")); void 0');
    await text('#payout-history-table-body', 'PHASE1-LEGACY');
    assert.equal(await js('document.querySelectorAll("#payout-history-table-body .sp-history-card").length'), 1);
    await click('#riwayat-payout [data-report-view=list]');
    await text('#facility-list', 'Peta fasilitas fixture');
    await capture('05-riwayat-fasilitas');

    await tab('beranda');
    await click('#own-location-map .sp-owned-pin--pickup');
    await click('#own-location-map .leaflet-popup-content [data-record-kind=pickup]');
    await visible('#tracking-timeline-container');
    await visible('#user-tracking-location .location-pin-B');
    await capture('06-pelacakan');

    await tab('edukasi');
    await visible('#edukasi .sp-portal-articles a');
    const title = await js('document.querySelector("#edukasi .sp-portal-articles a").textContent');
    await js('document.querySelector("#edukasi input[name=q]").value = ' + JSON.stringify(title.slice(0, 90)) +
        '; document.querySelector("#edukasi form").requestSubmit(); void 0');
    await text('#edukasi [role=status]', 'artikel');
    await text('#edukasi .sp-portal-articles', title);
    await capture('07-edukasi');
    const article = await js('document.querySelector("#edukasi .sp-portal-articles a").getAttribute("href")');
    await nav(article);
    await visible('.sp-reader-article');
    await nav('/dashboard');

    await tab('pengaturan');
    await waitFor(() => js('Boolean(document.querySelector("#settings-name").value)'), 'User profile was not loaded');
    await capture('08-pengaturan');
    await js('document.querySelector("#settings-profile-form").requestSubmit(); void 0');
    await text('.swal2-title', 'Profil Disimpan');
    await click('.swal2-confirm');
    await tab('beranda');
    await visible('#own-location-map .sp-owned-pin');
    await js(`window.addEventListener('sampira:session-ended', () => sessionStorage.setItem('fixture-map-cleared',
        String(!document.querySelector('#own-location-map .sp-owned-pin, #sp-recent-activity li'))), {once:true}); void 0`);
    await click('button[onclick="logoutUser()"]');
    await waitFor(() => js('location.pathname === "/login"'), 'User workspace logout failed');
    assert.equal(await js('sessionStorage.getItem("fixture-map-cleared")'), 'true');
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('PASS Chromium Phase 6B.3: own pins and popup detail links, pickup step validation, both histories, tracking, published education, profile and eight widths per view. ' + output);
}
