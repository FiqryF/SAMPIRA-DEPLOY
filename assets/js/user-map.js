const locationMaps = import('/assets/js/location-map.js?v=phase8');
let userLocationSequence = 0;
let disposeUserLocation;

function clearUserPickupMap() {
    ++userLocationSequence;
    disposeUserLocation?.();
    disposeUserLocation = null;
    document.getElementById('user-tracking-location').replaceChildren();
}

async function showPickupOnUserMap(pickup) {
    clearUserPickupMap();
    const sequence = userLocationSequence;
    const host = document.getElementById('user-tracking-location');
    try {
        const {mountLocationDetail} = await locationMaps;
        if (sequence !== userLocationSequence) return;
        disposeUserLocation = mountLocationDetail(host, {
            title: 'Titik lokasi penjemputan', point: pickup, address: pickup.pickup_address, external: true, autoTiles: true
        });
    } catch {
        if (sequence === userLocationSequence) host.textContent = pickup.pickup_address || 'Alamat penjemputan belum tersedia.';
    }
}
