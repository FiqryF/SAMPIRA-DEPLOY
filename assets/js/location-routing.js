export function locationPoint(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return [latitude, longitude];
}

export function routingConfig() {
    const url = document.querySelector('meta[name="sampira-routing-url"]')?.content.trim();
    const profile = document.querySelector('meta[name="sampira-routing-profile"]')?.content.trim();
    if (!url || !/^[a-z][a-z0-9_-]*$/i.test(profile || '')) return null;
    try {
        const base = new URL(url);
        if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return null;
        return {base, profile};
    } catch {
        return null;
    }
}

export async function roadRoute(config, origin, destination, signal) {
    if (!locationPoint(...origin) || !locationPoint(...destination)) throw new Error('Periksa kembali titik awal dan tujuan.');
    const url = new URL(config.base);
    const asOSRM = ([latitude, longitude]) => longitude.toFixed(7) + ',' + latitude.toFixed(7);
    url.pathname = url.pathname.replace(/\/$/, '') + '/route/v1/' + config.profile + '/' + asOSRM(origin) + ';' + asOSRM(destination);
    url.search = new URLSearchParams({overview: 'full', geometries: 'geojson', steps: 'false'});
    const timeout = AbortSignal.timeout(10000);
    try {
        const response = await fetch(url, {
            signal: AbortSignal.any([signal, timeout]),
            credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store'
        });
        if (response.status === 429) throw new Error('Batas permintaan rute tercapai. Tunggu sebelum mencoba lagi.');
        if (!response.ok && response.status !== 400) throw new Error('Layanan rute sedang tidak tersedia.');
        const data = await response.json().catch(() => null);
        if (timeout.aborted) throw timeout.reason;
        if (data?.code === 'NoRoute' || data?.code === 'NoSegment') throw new Error('Rute jalan antara kedua titik tidak ditemukan.');
        const route = data?.routes?.[0];
        const geometry = route?.geometry;
        if (!response.ok || data?.code !== 'Ok' || geometry?.type !== 'LineString' ||
            !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 ||
            !geometry.coordinates.every(pair => Array.isArray(pair) && pair.length === 2 && locationPoint(pair[1], pair[0]))) {
            throw new Error('Layanan tidak memberikan geometri rute yang valid.');
        }
        return route;
    } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (timeout.aborted) throw new Error('Waktu tunggu layanan rute habis.');
        if (error instanceof TypeError) throw new Error('Layanan rute tidak dapat dihubungi.');
        throw error;
    }
}

export function navigationURL(point, address) {
    const destination = point?.join(',') || address;
    if (!destination) return null;
    const url = new URL('https://www.google.com/maps/dir/');
    url.search = new URLSearchParams({api: '1', destination});
    return url.href;
}
