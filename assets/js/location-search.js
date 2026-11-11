const mountedSearches = new WeakMap();
let nextRequestAt = 0;

export function mountLocationSearch(host, pickerHost, picker, prefix) {
    mountedSearches.get(host)?.();
    host.innerHTML = `
        <div class="sp-pickup-field">
            <label for="${prefix}-address-search">Cari jalan atau tempat di Bandung</label>
            <div class="sp-pickup-weight">
                <input id="${prefix}-address-search" type="search" maxlength="160" autocomplete="off" placeholder="Contoh: Jalan Braga" aria-describedby="${prefix}-search-help">
                <button id="${prefix}-search-button" type="button" class="sp-button sp-button--quiet">Cari</button>
            </div>
            <small id="${prefix}-search-help">Kata kunci dikirim ke <a href="https://photon.komoot.io/">Photon</a>. Cari nama jalan atau tempat umum, lalu isi detail alamat di bawah.</small>
            <p id="${prefix}-search-status" class="sp-location-search-status" role="status"></p>
            <ul id="${prefix}-search-results" class="sp-pickup-search-results" hidden></ul>
        </div>
    `;
    const searchInput = host.querySelector(`#${prefix}-address-search`);
    const searchButton = host.querySelector(`#${prefix}-search-button`);
    const searchStatus = host.querySelector(`#${prefix}-search-status`);
    const searchResults = host.querySelector(`#${prefix}-search-results`);
    const form = host.closest('form');
    let revision = 0;
    let controller;

    function clearSearch() {
        revision++;
        controller?.abort();
        controller = null;
        searchButton.disabled = false;
        searchResults.replaceChildren();
        searchResults.hidden = true;
        searchStatus.textContent = '';
    }

    searchInput.addEventListener('input', clearSearch);
    form.addEventListener('reset', clearSearch);
    function onKey(event) {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        searchButton.click();
    }
    searchInput.addEventListener('keydown', onKey);
    function appendSearchResult(feature) {
        const [longitude, latitude] = feature.geometry?.coordinates || [];
        if (feature.geometry?.type !== 'Point' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        const {name, street, district, city} = feature.properties || {};
        const label = [...new Set([name, street, district, city].filter(Boolean))].join(', ');
        if (!label) return;
        const result = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => {
            picker.selectPoint(latitude, longitude);
            clearSearch();
            searchStatus.textContent = 'Lokasi dipilih. Periksa dan konfirmasi titik di peta.';
            pickerHost.querySelector('.location-actions .primary')?.focus();
        });
        result.append(button);
        searchResults.append(result);
    }

    async function search() {
        clearSearch();
        const query = searchInput.value.trim();
        if (query.length < 3) {
            searchStatus.textContent = 'Masukkan minimal 3 karakter.';
            searchInput.focus();
            return;
        }
        searchButton.disabled = true;
        searchStatus.textContent = 'Mencari lokasi…';
        const run = revision;
        const task = new AbortController();
        controller = task;
        try {
            const scheduled = Math.max(Date.now(), nextRequestAt);
            nextRequestAt = scheduled + 1100;
            const wait = Math.max(0,scheduled-Date.now());
            if (wait) await new Promise(resolve => setTimeout(resolve,wait));
            if (run !== revision || !host.isConnected) return;
            const endpoint = new URL('https://photon.komoot.io/api/');
            endpoint.search = new URLSearchParams({q: query, bbox: '107.50,-7.00,107.75,-6.80', limit: '5'});
            const response = await fetch(endpoint, {credentials: 'omit', referrerPolicy: 'no-referrer',
                signal:AbortSignal.any([task.signal,AbortSignal.timeout(8000)])});
            if (!response.ok) throw new Error('Pencarian gagal');
            const {features} = await response.json();
            if (run !== revision || !host.isConnected) return;
            for (const feature of Array.isArray(features) ? features : []) {
                appendSearchResult(feature);
            }
            searchResults.hidden = !searchResults.childElementCount;
            searchStatus.textContent = searchResults.hidden ? 'Lokasi tidak ditemukan. Coba nama jalan lain.' : 'Pilih salah satu hasil pencarian.';
        } catch {
            if (run === revision && !task.signal.aborted) searchStatus.textContent = 'Pencarian tidak tersedia. Pilih titik di peta atau isi alamat secara manual.';
        } finally {
            if (run === revision) {
                controller=null;
                searchButton.disabled = false;
            }
        }
    }
    searchButton.addEventListener('click',search);
    function dispose() {
        clearSearch();
        searchInput.removeEventListener('input',clearSearch);
        searchInput.removeEventListener('keydown',onKey);
        searchButton.removeEventListener('click',search);
        form.removeEventListener('reset',clearSearch);
        window.removeEventListener('pagehide',dispose);
        mountedSearches.delete(host);
    }
    mountedSearches.set(host,dispose);
    window.addEventListener('pagehide',dispose,{once:true});
    return dispose;
}
