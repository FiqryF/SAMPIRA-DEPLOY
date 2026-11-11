import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function checkPhase6Browser({ send, js, nav, login, click, text, waitFor, profile }) {
    const artifacts = process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS || join(profile, "phase6b");
    mkdirSync(artifacts, { recursive: true });
    const publicPath = "/assets/education.html";
    const q = JSON.stringify;
    const clear = () => send("Network.clearBrowserCookies");
    async function viewport(width) {
        await send("Emulation.setDeviceMetricsOverride", { width, height: width < 500 ? 850 : 1000, deviceScaleFactor: 1, mobile: width < 500 });
    }
    async function capture(name, width, anchor) {
        await viewport(width);
        await js((anchor ? 'document.querySelector(' + q(anchor) + ').scrollIntoView({behavior:"instant"});' : 'window.scrollTo({top:0, behavior:"instant"});') +
            " new Promise(resolve => setTimeout(resolve, 520))");
        assert(await js("document.documentElement.scrollWidth <= innerWidth + 2"), name + " overflows at " + width);
        const { data } = await send("Page.captureScreenshot", { format: "png" });
        writeFileSync(join(artifacts, name + "-" + width + ".png"), Buffer.from(data, "base64"));
    }
    async function field(selector, value) {
        await js("document.querySelector(" + q(selector) + ").value = " + q(value) + "; void 0");
    }
    async function confirmPublication(status) {
        await click('[data-publication="' + status + '"]');
        await click("#education-confirmation button");
        await text("#education-editor [role=status]", "Tersimpan");
    }
    await viewport(1440);
    await clear();
    await login("admin@phase1.invalid", "/admin");
    assert.equal(await js('document.querySelector(".sp-admin-account").textContent.trim()'), "Keluar");
    await click('[aria-controls="admin-overview"]');
    await text("#admin-overview [role=status]", "Cuplikan");
    await waitFor(() => js('Boolean(document.querySelector("#admin-recent-reports button"))'), 'Recent Admin report missing');
    for (const width of [320,360,390,430,768,1024,1280,1440]) {
        if (width === 390 || width === 1440) await capture("admin-overview", width);
        else {
            await viewport(width);
            assert(await js("document.documentElement.scrollWidth <= innerWidth + 2"), "Admin overview overflows at " + width);
        }
    }
    await viewport(390);
    await click('#admin-menu-toggle');
    assert.equal(await js('document.querySelector("#admin-menu-toggle").getAttribute("aria-expanded")'), 'true');
    await click('[aria-controls="admin-overview"]');
    assert.equal(await js('document.querySelector("#admin-menu-toggle").getAttribute("aria-expanded")'), 'false');
    await viewport(1440);
    await click('[aria-controls="admin-operation-map"]');
    await text("#admin-operation-map [role=status]", "lokasi dimuat");
    assert(await js('document.querySelector(".sp-console-content").getBoundingClientRect().width > 700'), "Admin workspace collapsed into the navigation column");
    await waitFor(() => js('Boolean(document.querySelector("#admin-operation-map .sp-map-marker--facility"))'), "Admin map lacks an authorized facility marker");
    await click("#admin-operation-map .sp-map-marker--facility");
    await text("#admin-operation-map .leaflet-popup-content", "Buka detail");
    await text("#admin-operation-map .leaflet-popup-content", "Penanganan");
    await capture("admin-map", 1440);
    await viewport(390);
    await click("#admin-menu-toggle");
    await click('[aria-controls="admin-operation-map"]');
    await text("#admin-operation-map [role=status]", "lokasi dimuat");
    await click("#admin-operation-map .sp-map-marker--facility");
    await text("#admin-operation-map .leaflet-popup-content", "Buka detail");
    await capture("admin-map", 390);
    assert(await js(`(() => {
        const map = document.querySelector("#admin-operation-map [data-map-canvas]").getBoundingClientRect();
        const popup = document.querySelector("#admin-operation-map .leaflet-popup-content-wrapper").getBoundingClientRect();
        return popup.left >= map.left && popup.right <= map.right;
    })()`), "Admin map popup is clipped on mobile");
    await viewport(1440);
    // Isolate the reported missing-route state while keeping the authenticated UI and real recovery path.
    await js(`window.adminTestFetch = window.fetch;
        window.fetch = (url, options) => String(url).startsWith('/api/ecorecycle/facility-reports?')
            ? Promise.resolve(new Response(null, {status: 404}))
            : window.adminTestFetch(url, options); void 0`);
    await click('[aria-controls="admin-overview"]');
    await text("#admin-overview [role=status]", "Layanan laporan tidak tersedia");
    assert(await js('document.querySelector("#admin-recent-reports").closest("[role=region]").hidden'), "Failed overview shows an empty table");
    assert.notEqual(await js('document.querySelector("[data-overview-status=approved]").textContent'), "—", "Working handling data should remain visible");
    await capture("admin-overview-error", 1280);
    await click('[aria-controls="admin-operation-map"]');
    await text("#admin-operation-map [role=status]", "Layanan lokasi tidak tersedia");
    await capture("admin-map-error", 1280);
    await js(`window.fetch = (url, options) => String(url).startsWith('/api/ecorecycle/facility-reports?')
        ? Promise.resolve(Response.json({status: 'success', data: {items: []}}))
        : window.adminTestFetch(url, options); void 0`);
    await click("#admin-operation-map [data-map-retry]");
    await text("#admin-operation-map [role=status]", "Tidak ada lokasi untuk filter ini.");
    assert(await js('document.querySelector("#admin-operation-map [data-map-retry]").hidden'));
    await click('[aria-controls="admin-overview"]');
    await text("#admin-recent-state", "Belum ada laporan fasilitas.");
    assert(await js('document.querySelector("#admin-recent-reports").closest("[role=region]").hidden'));
    await js("window.fetch = window.adminTestFetch; delete window.adminTestFetch; void 0");
    await click('[aria-controls="admin-overview"]');
    await text("#admin-overview [role=status]", "Cuplikan");
    await click('[aria-controls="education-cms"]');
    await waitFor(() => js('!document.querySelector("#education-add").disabled'), "CMS never became editable");
    await click("#education-add");
    const editor = "#education-editor ";
    for (const [name, value] of Object.entries({
        title: "Panduan uji pilah SAMPIRA", slug: "panduan-uji-pilah-sampira", category: "pemilahan-sampah",
        summary: "Panduan pengujian browser untuk memilah sampah rumah tangga.",
        body: "Pisahkan bahan organik dari bahan lain.\nSimpan bahan daur ulang secara terpisah.",
        sources: "https://example.com/panduan"
    })) await field(editor + '[name="' + name + '"]', value);
    await click(editor + '[type="submit"]');
    await text(editor + "[role=status]", "Tersimpan · Draf");
    await click('.sp-admin-article-preview summary');
    await text('[data-preview-body]', 'Pisahkan bahan organik');
    await capture("admin-editor", 1440);
    await field(editor + '[name="title"]', "Panduan uji pilah rumah tangga");
    await click(editor + '[type="submit"]');
    await text(editor + "[role=status]", "Tersimpan · Draf");
    await confirmPublication("published");
    await click("#education-close");
    await text("#education-cms tbody", "Panduan uji pilah rumah tangga");
    const articles = await js(`(async () => {
        const endpoint = '/api/ecorecycle/education/manage/articles';
        async function post(path, data) {
            const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (!response.ok) throw new Error('Fixture education HTTP ' + response.status);
            return (await response.json()).data;
        }
        for (let index = 1; index <= 7; index++) {
            const draft = await post(endpoint, {
                title: 'Artikel fixture ' + index, slug: 'artikel-fixture-' + index, category: 'daur-ulang',
                summary: 'Ringkasan artikel fixture untuk pagination.',
                body: 'Konten pengujian pagination dengan API asli.'
            });
            await post(endpoint + '/' + draft.id + '/publication', { version: draft.version, status: 'published' });
        }
        return 7;
    })()`);
    assert.equal(articles, 7);
    await capture("admin-education", 1440);
    await capture("admin-education", 390);
    await clear();
    await nav(publicPath);
    await text("#education-reader [role=status]", "Halaman 1");
    assert(await js('!document.querySelector("#education-next").hidden'));
    await capture("education-list", 1440);
    await capture("education-list", 390);
    await click("#education-next");
    await text("#education-reader [role=status]", "Halaman 2");
    await nav(publicPath + "?q=Panduan+uji&category=pemilahan-sampah");
    await text("#education-results", "Panduan uji pilah rumah tangga");
    await click("#education-results article a");
    await text(".sp-article-body", "Simpan bahan daur ulang");
    assert.equal(await js('document.querySelector(".sp-reader-article li a").protocol'), "https:");
    await capture("education-detail", 390);
    await nav("/home");
    await text(".hero h1", "Pantau Perubahannya.");
    for (const width of [1440, 768, 390, 320]) await capture("landing", width);
    await nav("/login");
    await capture("login", 390);
    await nav("/register");
    await capture("register", 390);
    await viewport(1440);
    await login("owner@phase1.invalid", "/dashboard");
    await click('[data-target="edukasi"]');
    await text("#edukasi", "Artikel fixture");
    await click('[data-target="beranda"]');
    await capture("warga", 1440);
    await capture("warga", 390);
    await clear();
    await viewport(1440);
    await login("collector@phase1.invalid", "/petugas");
    await capture("petugas", 1440);
    await capture("petugas", 390);
    await viewport(1440);
    await click('.sidebar-item[onclick*="operations"]');
    await text("#view-operations [role=status]", "lokasi dimuat");
    await waitFor(() => js('Boolean(document.querySelector("#view-operations .sp-map-marker--pickup"))'), "Claimed pickup missing from Petugas map");
    assert.equal(await js('document.querySelectorAll("#view-operations .sp-map-marker--facility").length'), 0, "Reassigned facility remained visible");
    await click(".sp-map-origin summary");
    await field('[data-map-origin] [name="lat"]', "-6.9");
    await field('[data-map-origin] [name="lon"]', "107.6");
    await click('[data-map-origin] [type="submit"]');
    await text("[data-map-origin] output", "Titik awal A siap");
    await click(".sp-map-origin summary");
    await click("#view-operations .sp-map-marker--pickup");
    await text("#view-operations .leaflet-popup-content", "Lihat Rute");
    await click("#view-operations .leaflet-popup-close-button");
    await capture("petugas-map", 390, "#view-operations [data-map-canvas]");
    assert(await js('document.querySelector(".bottom-nav [data-collector-view=operations]").classList.contains("active")'));
    await click("#view-operations .sp-map-marker--pickup");
    await text("#view-operations .leaflet-popup-content", "Lihat Rute");
    await js('Array.from(document.querySelectorAll("#view-operations .leaflet-popup-content button")).find(button => button.textContent === "Lihat Rute").click()');
    await text("#mission-location", "Layanan rute belum dikonfigurasi");
    assert.equal(await js('document.querySelector("#origin-pickup-latitude").value'), "-6.9000000");
    await clear();
    await viewport(1440);
    await login("administrator@phase1.invalid", "/administrator");
    await waitFor(() => js('document.querySelector("[data-metric=total_pickups]").textContent !== "—"'), "System metrics missing");
    await text("#announcement-admin-list .cms-announcement-actions", "Hapus");
    await capture("administrator", 1440);
    await capture("administrator", 320);
    await clear();
    await viewport(1440);
    await login("admin@phase1.invalid", "/admin");
    await click('[aria-controls="education-cms"]');
    await field('#education-filters [name="q"]', "Panduan uji pilah rumah tangga");
    await click('#education-filters [type="submit"]');
    await text("#education-cms tbody", "Panduan uji pilah rumah tangga");
    await click("#education-cms tbody button");
    await text("#education-editor-title", "Terbit");
    await confirmPublication("archived");
    await clear();
    await nav(publicPath + "?artikel=panduan-uji-pilah-sampira");
    await text("#education-reader [role=status]", "belum tersedia");
    console.log("PASS Chromium Phase 6B: education create/edit/publish/archive, public search/category/pagination/detail, Admin map, aggregate metrics, responsive captures.");
    console.log("Phase 6B screenshots: " + artifacts);
}
