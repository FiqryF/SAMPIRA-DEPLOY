# Dataset persampahan Bandung

Snapshot CSV dan PDF metadata berasal dari tiga ZIP yang diberikan pengguna, diintegrasikan 9 November 2026. ZIP asli tidak digandakan di repository. Tidak ada impor ke database operasional SAMPIRA.

| Folder | Produsen menurut PDF | Cakupan/periode | Baris CSV | Satuan CSV |
|---|---|---|---|---|
| anggota-bank-sampah | Kecamatan Coblong | Kecamatan Coblong, 2019–2025 | 180 | ORANG |
| produksi-sampah | Dinas Lingkungan Hidup | Kota Bandung, 2018–2025 | 72 | TON/HARI |
| capaian-penanganan | Dinas Lingkungan Hidup | Kota Bandung, bulanan 2017–2025 | 108 | TON |

Metadata anggota diperbarui 29 Juli 2026; dua dataset lainnya 17 Juni 2026. Waktu unduh asli dan URL sumber tidak disertakan dalam lampiran, sehingga tidak dikarang.

## Batas interpretasi

- **Satuan produksi tidak konsisten:** CSV seluruhnya `TON/HARI`, tetapi PDF menyebut `m3/hari`, bahkan uraian variabel satuan memuat teks orang yang tidak sesuai. UI mengikuti satuan CSV dengan peringatan eksplisit. Jangan melakukan konversi atau menghitung rasio penanganan/produksi sebelum produsen mengonfirmasi satuannya.
- Produksi dikelompokkan per jenis/tahun; total harian adalah penjumlahan jenis pada tahun yang sama. Tidak menjumlahkan ton/hari lintas tahun menjadi ton.
- Penanganan: angka per bulan dalam ton; total tahunan menjumlahkan 12 bulan. Tidak ditampilkan sebagai persentase capaian karena tidak ada target/denominator yang konsisten.
- Anggota: dijumlahkan per kelurahan/tahun dari unit bank sampah. Orang yang tercatat di dua unit tidak bisa dideduplikasi, sehingga total bukan jumlah warga unik. Tahun2025 memuat33 catatan unit di6 kelurahan Coblong, bukan seluruh Bandung. Jangan menjumlahkan anggota lintas tahun.
- Tidak ada koordinat/geometri. Tidak membuat titik peta atau hotspot rekaan dari alamat bank.

## Publikasi dan pembaruan

Jalankan `python scripts/build-city-datasets.py` dari root repo sesudah memperbarui CSV yang telah diverifikasi. Hasil tetap: `assets/data/bandung-waste.json` (sekitar5,5KB), termasuk checksum dan jumlah baris sumber. Nama pengelola dan alamat unit pada CSV asli **tidak diterbitkan** dalam JSON; frontend hanya menerima agregat jenis/bulan/kelurahan/tahun.

UI memakai data statis tanpa dependency baru: Admin → Statistik & Sebaran; Administrator → Statistik sistem; User → Pusat Edukasi (ringkasan dan grafik yang dapat diperluas). Data eksternal selalu dibedakan dari statistik transaksi SAMPIRA. Filter tahun, tren dan tabel aksesibel memakai snapshot yang sama.

## Revisi cakupan

Sesuai permintaan pengguna, dataset anggota bank sampah Coblong dikeluarkan dari JSON publik dan seluruh UI. CSV/PDF asal dipertahankan sebagai arsip lokal; builder hanya menerbitkan produksi dan penanganan tingkat Kota Bandung. Grafik/summary kini berisi dua dataset.
