// Initial application tariffs; research and operational assumptions: docs/waste-categories.md.
const wasteCategories = [
    { name: 'Organik', group: 'Organik', label: 'Sisa makanan & daun', rate: 0, feePerKg: 0, icon: 'fa-leaf', weight: 2, example: 'Sisa sayur, kulit buah, dan daun. Pisahkan dari plastik serta kemasan.', note: 'Setoran organik tanpa reward. Pisahkan sisa makanan dan daun dari kemasan.' },
    { name: 'Plastik PET', group: 'Anorganik', label: 'Botol plastik PET bening', rate: 3000, feePerKg: 0, icon: 'fa-bottle-water', weight: 1, example: 'Botol PET bening yang bersih, kering, dan terpilah.', note: 'Tarif acuan untuk PET bening bersih. Plastik lain perlu dipilah tersendiri.' },
    { name: 'Kertas dan Kardus', group: 'Anorganik', label: 'Kertas & kardus', rate: 1000, feePerKg: 0, icon: 'fa-box', weight: 2, example: 'Kardus dan kertas bersih, kering, tanpa sisa makanan.', note: 'Tarif acuan kardus dan kertas bersih. Pisahkan material yang basah atau berminyak.' },
    { name: 'Besi', group: 'Anorganik', label: 'Besi bekas', rate: 2500, feePerKg: 0, icon: 'fa-gears', weight: 2, example: 'Besi bekas yang dipisahkan dari material lain.', note: 'Tarif ini untuk besi, bukan aluminium, tembaga, atau semua logam.' },
    { name: 'Kaca', group: 'Anorganik', label: 'Botol & beling kaca', rate: 150, feePerKg: 0, icon: 'fa-wine-bottle', weight: 1, example: 'Botol kaca dan beling terpilah. Beri tahu kolektor bila ada pecahan.', note: 'Pisahkan kaca dari lampu dan kemasan bahan berbahaya.' },
    { name: 'Small Gadgets', group: 'Elektronik', label: 'Gadget kecil', rate: 5000, feePerKg: 500, icon: 'fa-mobile-screen-button', weight: .5, example: 'HP rusak, tablet, kamera digital, charger, atau perangkat kecil lainnya.', note: 'Perangkat kecil dan aksesori elektronik. Baterai lepas dipilih pada kategori B3.' },
    { name: 'Computers', group: 'Elektronik', label: 'Komputer', rate: 7000, feePerKg: 1000, icon: 'fa-laptop', weight: 2, example: 'Laptop rusak, CPU, monitor, motherboard, RAM, atau keyboard.', note: 'Laptop, PC, monitor, dan komponen komputer.' },
    { name: 'Large Appliances', group: 'Elektronik', label: 'Elektronik besar', rate: 10000, feePerKg: 5000, icon: 'fa-tv', weight: 8, example: 'TV, kulkas, AC, mesin cuci, atau perangkat elektronik besar.', note: 'Jelaskan jenis dan kondisi perangkat agar kolektor dapat menyiapkan penjemputan.' },
    { name: 'Batteries', group: 'B3 rumah tangga', label: 'Baterai & aki', rate: 3000, feePerKg: 2000, icon: 'fa-car-battery', weight: 1, example: 'Baterai laptop, powerbank rusak, aki, atau baterai UPS. Jelaskan kondisinya.', note: 'Termasuk kelompok B3. Pisahkan dari sampah lain dan jelaskan bila bocor atau rusak.' },
    { name: 'B3 Rumah Tangga', group: 'B3 rumah tangga', label: 'Lampu & kemasan bekas B3', rate: 0, feePerKg: 0, icon: 'fa-triangle-exclamation', weight: 1, example: 'Lampu bekas atau kemasan bekas produk B3 rumah tangga. Jelaskan jenis, isi tersisa, dan kondisinya.', note: 'Tanpa reward awal. Penjemputan menyesuaikan jenis dan kesiapan penanganan; jangan dicampur dengan sampah lain. Bukan untuk limbah medis atau industri.' }
];

function populateWasteOptions(select, selected, {showTariff = true} = {}) {
    select.replaceChildren();
    for (const group of new Set(wasteCategories.map(category => category.group))) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        for (const category of wasteCategories.filter(item => item.group === group)) {
            const option = document.createElement('option');
            option.value = category.name;
            const tariff = category.rate ? 'Rp' + category.rate.toLocaleString('id-ID') + '/kg' : 'tanpa reward';
            option.textContent = showTariff ? `${category.label} · ${tariff}` : category.label;
            option.defaultSelected = category.name === selected;
            optgroup.append(option);
        }
        select.append(optgroup);
    }
}

// Allow the read-only Node check to import the catalogue without evaluating source text.
if (typeof module === 'object') module.exports = {wasteCategories};
