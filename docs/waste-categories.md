# Kategori dan tarif awal EcoRecycle

Diperbarui 29 Oktober 2026. Kelompok tampilan: organik, anorganik, elektronik, dan B3 rumah tangga. Satu pengajuan menyimpan satu kategori. Elektronik tetap dikelompokkan tersendiri untuk memudahkan pengguna; pemisahan ini tidak berarti elektronik bebas kandungan B3.

| Kategori database | Reward/kg | Biaya/kg | Dasar |
| --- | ---: | ---: | --- |
| Organik | 0 | 0 | Kebijakan aplikasi: setoran tanpa reward, bukan harga kompos |
| Plastik PET | 3000 | 0 | Acuan PET bening bersih |
| Kertas dan Kardus | 1000 | 0 | Acuan kardus dan arsip putih |
| Besi | 2500 | 0 | Acuan besi, bukan semua jenis logam |
| Kaca | 150 | 0 | Acuan beling/kaca |
| Small Gadgets | 5000 | 500 | Tarif proyek sebelumnya, dipertahankan |
| Computers | 7000 | 1000 | Tarif proyek sebelumnya, dipertahankan |
| Large Appliances | 10000 | 5000 | Tarif proyek sebelumnya, dipertahankan |
| Batteries | 3000 | 2000 | Tarif proyek sebelumnya, dikelompokkan ke B3 |
| B3 Rumah Tangga | 0 | 0 | Kebijakan aplikasi: tanpa reward awal; tidak menganggap semua B3 bernilai jual |

## Riset dan batas penerapan

- [Daftar harga Bank Sampah Indonesia Induk Kota Palembang](https://banksampahindonesia.com/daftar-harga/), diakses 29 Oktober 2026: PET bening Rp3.000, kardus dan arsip putih Rp1.000, besi Rp2.500, beling/kaca Rp150. Halaman menyatakan harga dapat berubah dan material harus bersih serta terpilah. Tidak mencantumkan tanggal efektif harga. Angka dipakai sebagai acuan awal aplikasi, bukan penawaran resmi Bandung atau mitra EcoRecycle.
- [Bank Sampah Bantul](https://banksampah.id/web/bsbantul), diakses 29 Oktober 2026: tarif berbeda untuk material dan kondisi berbeda. Contoh harga lampu dan aki tidak dapat digeneralisasi menjadi harga seluruh B3.
- [DLH Sleman: pengelolaan limbah B3 domestik](https://dinlh.slemankab.go.id/pemetaan-pengelolaan-limbah-b3-domestik-di-kabupaten-sleman/): baterai, lampu, dan kemasan B3 memerlukan pemilahan; layanan pengambilan DLH tanpa biaya yang disebut di sana merupakan konteks Sleman, bukan jaminan layanan gratis di Bandung.
- [Pemprov DKI: pengelolaan organik dan anorganik di Pondok Bambu](https://www.jakarta.go.id/siaran-pers-wilayah/1/4147-SP-JAKTIM-04-2026): organik dipilah dan dikelola terpisah. Tidak memberikan tarif beli umum organik mentah. Harga produk kompos tidak dipakai sebagai harga sisa makanan.

Biaya kategori baru **belum diberlakukan** (nol), merupakan keputusan awal proyek, bukan biaya pasar hasil riset atau janji subsidi penanganan B3. Sebelum operasional nyata, pengelola perlu menetapkan penerimaan material, tarif lokal, biaya, serta kesiapan penanganan B3. Kategori B3 rumah tangga tidak mencakup limbah medis dan industri.

Simulasi karbon lama menggunakan faktor tetap 2,5 kg CO2/kg untuk semua kategori. Ini belum merupakan faktor emisi terverifikasi per material dan tidak boleh dianggap pengukuran dampak nyata.

## Memperbarui database yang sudah ada

Jalankan `db_init/add_waste_categories.sql` pada database aplikasi. Skrip hanya menambahkan enam kategori yang belum ada; tidak menghapus tabel, mengubah ID lama, atau menimpa tarif yang telah diubah pengelola. Jangan menjalankan ulang `db_init/db_init.go` untuk migrasi karena initializer tersebut menghapus database.

Metadata kategori dan tarif awal frontend berada di `assets/js/waste-categories.js`. Tarif backend dihitung dari `waste_categories`. Jika tarif diubah, sinkronkan keduanya. Kategori API harus menggunakan nama kategori lengkap; pencarian tidak lagi menerima potongan nama agar kategori keliru tidak diam-diam menggunakan tarif gadget.
