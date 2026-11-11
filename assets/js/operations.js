import { base, request } from "./facility-api.js";
import { categories, statuses } from "./facility-report-ui.js";
import { assignmentStatuses, coordinationStatuses, handlingStatuses } from "./facility-handling-ui.js";
import { locationPoint } from "./location-routing.js";
import {createMap, streetTiles, statusIcon, mapStatus, mapLegend, bindMapPopup, facilityMapStates} from "./map-core.js?v=phase8";

const consoleNav = document.querySelector(".sp-admin-nav");
if (consoleNav) {
    const verify = consoleNav.querySelector("[data-open-verification]");
    const handling = consoleNav.querySelector("[data-open-handling]");
    consoleNav.addEventListener("click", event => {
        const trigger = event.target.closest("button[aria-controls]");
        if (!trigger) return;
        for (const button of consoleNav.querySelectorAll("button[aria-controls]")) {
            const panel = document.getElementById(button.getAttribute("aria-controls"));
            const active = button === trigger;
            if (!active && !panel.hidden) panel.dispatchEvent(new Event("sampira:close"));
            panel.hidden = !active;
            button.setAttribute("aria-pressed", String(active));
            if (active && button !== verify && button !== handling) panel.dispatchEvent(new Event("sampira:open"));
        }
    });
}

const root = document.querySelector("[data-operation-map]");
if (root) {
    const admin = root.dataset.operationMap === "admin";
    const form = root.querySelector("[data-operation-filter]");
    const list = root.querySelector("ul");
    const status = root.querySelector("[role=status], .sp-map-layout output");
    const more = root.querySelector("[data-more]");
    const canvas = root.querySelector("[data-map-canvas]");
    const retry = root.querySelector("[data-map-retry]");
    const mapFeedback = root.querySelector("[data-map-feedback]");
    const create = (tag, label, className) => {
        const element = document.createElement(tag);
        element.textContent = label || "";
        if (className) element.className = className;
        return element;
    };
    root.querySelector("[data-map-heading]").textContent = admin ? "Monitoring lokasi fasilitas" : "Peta operasional Petugas";
    root.querySelector("[data-map-intro]").textContent = admin
        ? "Pilih titik pada peta atau lokasi dalam daftar untuk membuka detail laporan."
        : "Lihat penjemputan yang kamu ambil dan fasilitas yang ditugaskan kepadamu. Buka detail tugas untuk memeriksa tujuan dan rute.";
    form.elements.category.append(new Option(admin ? "Semua kategori" : "Semua", ""), ...Object.entries(admin ? categories : {
        pickup: "Penjemputan", facility: "Tugas fasilitas"
    }).map(([key, label]) => new Option(label, key)));
    const verification = Object.fromEntries(Object.entries(statuses).filter(([key]) => key !== "draft"));
    form.elements.status.append(new Option("Semua status", ""),
        ...Object.entries(admin ? verification : { pickup: "Siap dijemput", transit: "Menuju hub", arrived: "Tiba di hub" })
            .map(([key, label]) => new Option(label, key)),
        ...Object.entries(handlingStatuses).map(([key, label]) => new Option(label, "handling:" + key)),
        ...Object.entries(assignmentStatuses).map(([key, label]) => new Option(label + " (penugasan)", "assignment:" + key)));

    let map;
    let pins;
    let version = 0;
    let cursor = null;
    let loaded = [];
    let tilesFailed = false;
    let origin;
    let originMarker;
    let geoRevision = 0;
    const originForm = root.querySelector("[data-map-origin]");

    function setOrigin(point) {
        ++geoRevision;
        origin = point;
        const feedback = originForm.querySelector("output");
        originForm.closest("details").querySelector("summary").textContent = point ? "Titik awal siap · Ubah" : "Atur titik awal Petugas";
        originMarker?.remove();
        if (point && map) {
            const icon = L.divIcon({ className: "sp-map-marker sp-map-marker--origin", html: "A", iconSize: [28, 28], iconAnchor: [14, 14] });
            originMarker = L.marker(point, { icon, alt: "Titik awal A", title: "Titik awal A" }).addTo(map);
            map.panTo(point);
        }
        feedback.textContent = point ? "Titik awal A siap." : "Titik awal dihapus.";
        originForm.elements.lat.value = point?.[0] ?? "";
        originForm.elements.lon.value = point?.[1] ?? "";
    }
    originForm?.addEventListener("submit", event => {
        event.preventDefault();
        setOrigin(locationPoint(originForm.elements.lat.valueAsNumber, originForm.elements.lon.valueAsNumber));
    });
    originForm?.querySelector("[data-clear-origin]").addEventListener("click", () => setOrigin(null));
    originForm?.querySelector("[data-use-gps]").addEventListener("click", () => {
        const run = ++geoRevision;
        const feedback = originForm.querySelector("output");
        if (!navigator.geolocation) { feedback.textContent = "Lokasi perangkat tidak tersedia."; return; }
        feedback.textContent = "Meminta izin lokasi perangkat…";
        navigator.geolocation.getCurrentPosition(position => {
            if (run === geoRevision) setOrigin(locationPoint(position.coords.latitude, position.coords.longitude));
        }, () => {
            if (run === geoRevision) feedback.textContent = "Lokasi tidak dapat dibaca. Gunakan koordinat manual.";
        }, { timeout: 10000, maximumAge: 0 });
    });

    function open(item, action) {
        const navigation = { origin, action };
        if (item.type === "pickup") {
            window.viewActiveMission(item.tracking, navigation).catch(() => {
                feedback.textContent = 'Detail penjemputan belum dapat dibuka. Coba lagi.';
            });
            return;
        }
        const selector = item.handling ? "[data-open-handling]" : "[data-open-verification]";
        const button = admin ? document.querySelector(".sp-admin-nav " + selector)
            : Array.from(document.querySelectorAll(selector)).find(element => element.getClientRects().length);
        button?.click();
        window.dispatchEvent(new CustomEvent(item.handling ? "sampira:handling-detail" : "sampira:report-detail", {
            detail: { id: item.id, navigation }
        }));
    }

    function facility(row, handling) {
        const appearance = mapStatus('facility',handling ? {...row,handling_status:row.status} : row);
        return {
            id: row.report_id || row.id, type: "facility", title: row.title, address: row.address, tracking: row.tracking_number,
            state: handling ? row.status : row.verification_status || row.status, assignment: row.assignment_status,
            verification: row.verification_status, coordination: row.coordination_status,
            point: locationPoint(row.latitude, row.longitude), handling, appearance
        };
    }

    async function getPickups() {
        const user = await window.portalUser("petugas");
        if (!user) throw new Error("Sesi berakhir. Masuk kembali.");
        const response = await window.portalFetch("/api/ecorecycle/list_pickups?type=petugas",{signal:AbortSignal.timeout(15000)});
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data)) throw new Error("Daftar penjemputan gagal dimuat.");
        return result.data.filter(item => Number(item.collector_id) === Number(user.id) &&
            ["pickup", "transit", "arrived"].includes(item.status)).map(item => ({
            type: "pickup", tracking: item.tracking_number, title: item.tracking_number,
            address: item.pickup_address, state: item.status, point: locationPoint(item.latitude, item.longitude),
            appearance:mapStatus('pickup',item)
        }));
    }

    function appendLocationRow(item, label, kind) {
            const row = create("li");
            const action = create("button", item.title, "sp-map-open");
            action.type = "button";
            action.addEventListener("click", () => open(item));
            row.append(create("small", kind + " · " + label), action, create("p", item.address || "Alamat belum tersedia"));
            if (item.assignment) row.append(create("small", "Penugasan · " + (assignmentStatuses[item.assignment] || item.assignment)));
            if (!item.point) row.append(create("small", "Titik presisi belum tersedia"));
            list.append(row);
    }

    function addMapMarker(item, label, kind) {
            const pin = statusIcon(item.type,item.appearance,"sp-map-marker sp-map-marker--" + item.type);
            const marker = L.marker(item.point, { icon: pin, alt: kind + " · " + item.title + ' · ' + item.appearance.label,
                title:item.appearance.label }).addTo(pins);
            const popup = create("div", "", "sp-map-popup");
            popup.append(create("strong", item.title), create("p", [kind, label, item.tracking].filter(Boolean).join(" · ")),
                create("p", item.address || "Alamat belum tersedia"));
            if (admin && item.handling) {
                popup.append(create("p", "Verifikasi · " + (statuses[item.verification] || "Belum tersedia")),
                    create("p", "Penanganan · " + label),
                    create("p", "Penugasan · " + (assignmentStatuses[item.assignment] || "Belum tersedia")),
                    create("p", "Koordinasi · " + (coordinationStatuses[item.coordination] || "Belum tersedia")));
            }
            const actions = [["Buka detail", null]];
            if (!admin) actions.push(["Lihat Rute", "route"], ["Buka Navigasi", "external"]);
            else if (!item.handling && item.state === "approved") {
                const handlingStatus = create("p", "Memuat status penanganan…");
                popup.append(handlingStatus);
                marker.on("popupopen", async () => {
                    try {
                        const report = await request(base + "/" + item.id + "/handling");
                        handlingStatus.textContent = "Penanganan · " + (handlingStatuses[report.status] || "Belum tersedia");
                        item.appearance=mapStatus('facility',report);
                        marker.setIcon(statusIcon('facility',item.appearance,'sp-map-marker sp-map-marker--facility'));
                        marker.getElement()?.setAttribute('aria-label',kind+' · '+item.title+' · '+item.appearance.label);
                    } catch {
                        handlingStatus.textContent = "Status penanganan belum tersedia.";
                    }
                    if (marker.isPopupOpen()) marker.getPopup().update();
                });
                actions.push(["Buka penanganan", "handling"]);
            }
            for (const [title, action] of actions) {
                const button = create("button", title, "sp-map-open");
                button.type = "button";
                button.addEventListener("click", () => open(action === "handling" ? { ...item, handling: true } : item, action));
                popup.append(button);
            }
            bindMapPopup(marker,popup);
    }

    function render() {
        list.replaceChildren();
        pins?.clearLayers();
        const points = [];
        for (const item of loaded) {
            const label = (item.handling ? handlingStatuses[item.state] : statuses[item.state]) ||
                { pickup: "Siap dijemput", transit: "Menuju hub", arrived: "Tiba di hub" }[item.state] || "Belum tersedia";
            const kind = item.type === "pickup" ? "Penjemputan" : "Fasilitas";
            appendLocationRow(item, label, kind);
            if (!item.point || !map) continue;
            points.push(item.point);
            addMapMarker(item, label, kind);
        }
        if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 15, animate:false });
        const count = loaded.filter(item => item.point).length;
        status.textContent = loaded.length ? loaded.length + " lokasi dimuat · " + count + " memiliki titik presisi."
            : "Tidak ada lokasi untuk filter ini.";
        if (!admin && tilesFailed) status.textContent += " Peta jalan gagal dimuat. Daftar tetap tersedia.";
        else if (!map && !admin) status.textContent += " Peta tidak tersedia. Gunakan daftar.";
    }

    function prepareLocationView(append) {
        status.textContent = "Memuat lokasi…";
        if (admin) {
            status.dataset.state = "loading";
            retry.hidden = true;
            more.hidden = !append;
        }
        more.disabled = true;
        if (!append) {
            loaded = [];
            list.replaceChildren();
            pins?.clearLayers();
            cursor = null;
        }
        if (!map && window.L) {
            map = createMap(canvas);
            const currentMap=map;
            streetTiles().on("tileerror", () => {
                if (map !== currentMap) return;
                if (!tilesFailed && mapFeedback) {
                    mapFeedback.textContent = "Sebagian gambar peta gagal dimuat. Alamat tetap bisa dibuka dari daftar.";
                    mapFeedback.hidden = false;
                } else if (!tilesFailed) status.textContent += " Peta jalan gagal dimuat.";
                tilesFailed = true;
            }).addTo(map);
            pins = L.layerGroup().addTo(map);
        }
        if (mapFeedback && !map) {
            mapFeedback.textContent = "Peta belum tersedia. Gunakan daftar lokasi.";
            mapFeedback.hidden = false;
        }
        map?.invalidateSize();
    }

    function locationQuery(append) {
        const category = form.elements.category.value;
        const selected = form.elements.status.value;
        const [group, value] = selected.split(":");
        const handling = !admin || group === "handling" || group === "assignment";
        const pickupOnly = !admin && (category === "pickup" || Boolean(selected && !value));
        const withPickups = !admin && !append && category !== "facility" && !value;
        const params = new URLSearchParams({ limit: "20" });
        if (cursor !== null) params.set("before_id", cursor);
        if (admin && category) params.set("category", category);
        if (group === "handling" || (!handling && group)) params.set("status", value || group);
        return {params, handling, pickupOnly, withPickups, selected, group, value};
    }

    async function applyLocationResults(results, query, run, append) {
        const {handling, selected, group, value} = query;
            const [facilityResult, pickupResult] = results;
            if (admin && facilityResult.status === "rejected") {
                status.dataset.state = "error";
                status.textContent = append ? "Lokasi berikutnya gagal dimuat." : "Daftar lokasi gagal dimuat.";
                if (facilityResult.reason.status === 404) status.textContent = "Layanan lokasi tidak tersedia di server ini.";
                retry.hidden = append;
                return;
            }
            const page = facilityResult.value;
            const pickups = (pickupResult.value || []).filter(item => !selected || item.state === selected);
            let source = page?.items || [];
            if (admin && !handling) source = await facilityMapStates(source,request,base);
            if (run !== version) return;
            const facilities = source.filter(item => group !== "assignment" || item.assignment_status === value)
                .map(item => facility(item, handling));
            loaded.push(...pickups, ...facilities);
            cursor = page?.next_before_id ?? null;
            render();
            if (admin) status.dataset.state = loaded.length ? "ready" : "empty";
            const failures = results.filter(result => result.status === "rejected");
            if (failures.length) status.textContent += " Sebagian sumber lokasi gagal dimuat. Terapkan filter untuk mencoba lagi.";
    }

    async function load(append = false) {
        const run = ++version;
        try {
            prepareLocationView(append);
            const query = locationQuery(append);
            const facilityPath = base + (query.handling ? "/handling" : "") + "?" + query.params;
            const results = await Promise.allSettled([
                query.pickupOnly ? null : request(facilityPath),
                query.withPickups ? getPickups() : []
            ]);
            if (run !== version) return;
            await applyLocationResults(results, query, run, append);
        } catch {
            if (run !== version) return;
            status.textContent = "Lokasi gagal dimuat. Periksa koneksi lalu coba lagi.";
            if (admin) { status.dataset.state = "error"; retry.hidden = false; }
        } finally {
            if (run === version) {
                more.disabled = false;
                more.hidden = cursor === null;
            }
        }
    }

    form.addEventListener("submit", async event => { event.preventDefault(); await load(); });
    form.addEventListener("reset", () => requestAnimationFrame(async () => { await load(); }));
    more.addEventListener("click", async () => { await load(true); });
    root.addEventListener("sampira:open", async () => { await load(); });
    function clearMap() {
        ++version;
        loaded = [];
        pins?.clearLayers();
        list.replaceChildren();
        if (originForm) setOrigin(null);
        map?.remove();
        map=pins=null;
        tilesFailed=false;
    }
    root.addEventListener("sampira:close", clearMap);
    window.addEventListener("sampira:session-ended", clearMap);
    window.addEventListener("pagehide", clearMap);
    window.addEventListener("sampira:collector-view", async () => {
        if (root.classList.contains("active")) await load();
        else clearMap();
    });
    if (!admin) window.addEventListener("focus", async () => {
        if (root.classList.contains("active") && !document.hidden) await load();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && originForm) setOrigin(null);
    });
    const observer=new ResizeObserver(() => {
        if (map && canvas.clientWidth && canvas.clientHeight) map.invalidateSize({pan:false});
    });
    observer.observe(canvas);
    window.addEventListener('pagehide',() => observer.disconnect(),{once:true});
    mapLegend(root.querySelector('[data-map-legend]') || root);
}

const metrics = document.querySelector("#sp-system-metrics");
if (metrics) {
    const message = metrics.querySelector("output, [role=status]");
    const number = new Intl.NumberFormat("id-ID");
    const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
    function refreshSystemMetrics() {
        for (const field of metrics.querySelectorAll('[data-metric]')) field.textContent = '—';
        message.textContent = 'Memuat ringkasan…';
        window.portalFetch("/api/ecorecycle/pickup_status?type=stats")
            .then(async response => {
                if (!response.ok) throw new Error("Ringkasan sistem gagal dimuat.");
                const result = await response.json();
                for (const field of metrics.querySelectorAll("[data-metric]")) {
                    const value = result.data?.[field.dataset.metric];
                    if (typeof value === "number") field.textContent = (field.dataset.currency !== undefined ? rupiah : number).format(value);
                }
                message.textContent = "";
            }).catch(error => { message.textContent = error.message; });
    }
    window.addEventListener('sampira:cash-updated', refreshSystemMetrics);
    refreshSystemMetrics();
}
