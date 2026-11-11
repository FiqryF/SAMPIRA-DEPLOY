# SAMPIRA Phase 6A — Catatan Integrasi Phase 6B

## Prasyarat dan pemakaian

Gunakan biner BE Phase 6A dan skema yang telah menerapkan migrasi 001–005 sesuai kondisi awal database. Startup biner menerapkan 005 setelah 004. Untuk lingkungan yang sudah berisi data, buat backup dan verifikasi restore sebelum menjalankan biner baru pada database tersebut. MariaDB 10.4.32 lulus pengujian. Sajikan UI dan API pada origin yang sama. [Kontrak API](PHASE_06_API_CONTRACT.md)

- Landing page memanggil `GET /api/ecorecycle/education/articles?limit=3` untuk ringkasan terbaru. Gunakan judul, ringkasan, kategori, waktu terbit dan slug. Jika koleksi kosong, tampilkan keadaan kosong.
- Pusat Edukasi memakai endpoint daftar yang sama dengan `category`, `q`, `page`, dan `limit`. Gunakan `data.categories` untuk filter dan `data.next_page` untuk navigasi halaman. Buka artikel lewat `GET /api/ecorecycle/education/articles/{slug}`.
- Dashboard User dapat menautkan Pusat Edukasi publik. Halaman dan tautan navigasinya merupakan pekerjaan Phase 6B.
- Portal Admin memakai `/api/ecorecycle/education/manage/articles`. Tampilkan aksi edit/publikasi hanya pada draft, dan arsip pada draft atau published. Pada 409 muat ulang artikel sebelum menawarkan aksi ulang. Konten publik hanya berubah setelah server mengonfirmasi publikasi atau arsip.
- Administrator tetap mengelola pengumuman portal melalui API lama. Petugas, User, dan Administrator tidak memperoleh izin mutasi artikel. Tampilkan identitas produk SAMPIRA tanpa mengubah role, API lama, cookie, tracking number, atau skema utama `ecorecycle`.

## Konten dan keamanan

Isi adalah teks biasa. Pakai `textContent` dengan `white-space: pre-wrap` dan bangun tautan sumber secara terpisah setelah memeriksa skema HTTPS. Hindari penyisipan HTML dan otomatis mengubah URL dalam body menjadi tautan. Draft untuk peninjauan pengelola dapat dibuat melalui API yang sama. Artikel contoh dan sumber sintetis hanya dibuat di fixture. Tinjau isi, sumber rujukan publik, dan relevansi sebelum menerbitkan. Endpoint artikel tidak mengambil URL sumber dari jaringan dan tidak menyediakan upload.

Endpoint pengelolaan memakai sesi dan CSRF/origin existing. Klien sebaiknya menghilangkan parameter filter kosong, mempertahankan filter saat berpindah halaman, dan menampilkan status 404 jika artikel diarsipkan atau slug tidak lagi tersedia. `next_page` mengikuti paginasi offset dengan batas 1000 halaman, sehingga publikasi/arsip di antara dua request dapat menggeser halaman.

## Fixture

Ikuti [panduan fixture terisolasi Phase 1](../phase-01-operations.md#pengujian-terisolasi), dengan biner BE Phase 6A. MariaDB fixture dan server uji memakai port loopback terpisah. Harness API memerlukan urutan 3, 4, 5, lalu 6 agar pengujian 005 memulihkan data Phase 1–5 yang sudah terisi.

```powershell
$env:SAMPIRA_TEST_PHASE3 = '1'
$env:SAMPIRA_TEST_PHASE4 = '1'
$env:SAMPIRA_TEST_PHASE5 = '1'
$env:SAMPIRA_TEST_PHASE6 = '1'
node scripts/check-phase1-migration.mjs
```

Untuk browser, siapkan fixture baru tanpa flag mutasi API di atas. Build server dari BE, ekspor FE melalui `git archive FE`, lalu sajikan `app` dan `assets` FE dari working directory sementara. Jalankan suite Chromium Phase 3B, 4B, dan 5B dari arsip FE pada origin server fixture. Suite itu menguji UI existing dengan Backend Phase 6A. UI edukasi Phase 6B belum tersedia.

## Checklist integrasi

- [ ] Tentukan jadwal dan verifikasi backup/restore sebelum migrasi di deployment.
- [ ] Uji empty state, tiga artikel terbaru, filter, pencarian, pagination, dan artikel terarsip.
- [ ] Uji draft, versi basi, publikasi, dan arsip menggunakan sesi Admin.
- [ ] Render semua teks dengan node teks dan batasi tautan sumber ke HTTPS.
- [ ] Pastikan role lain hanya dapat memakai endpoint publik dan Administrator tetap mengelola pengumuman.
- [ ] Jalankan regresi UI existing. Uji peta dan routing sesuai konfigurasi provider yang dipakai deployment.

Rute Petugas pada fixture Chromium menggunakan respons provider simulasi. Endpoint edukasi dan startup migrasi 005 belum diterapkan ke database utama atau runtime lokal yang sedang dipakai.
