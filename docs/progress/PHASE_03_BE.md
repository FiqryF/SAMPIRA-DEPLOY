# SAMPIRA Phase 3A — Backend Laporan Fasilitas

## Identitas dan kondisi awal

| Item | Nilai |
|---|---|
| Cakupan | Pengajuan laporan fasilitas, revisi User, dan verifikasi Admin |
| Branch kerja | `BE` |
| Baseline awal | `e648496` pada `BE` dan `origin/BE` |
| Baseline sinkronisasi | `ae276ef` dari `origin/develop`, dengan tree identik dengan `origin/main` pada `2d9be58` |
| Status | **PASS** untuk cakupan backend pada fixture terisolasi |

Fast-forward lokal dilakukan dari working tree bersih setelah riwayat dan laporan audit kumulatif diperiksa. Implementasi Phase 3A tersedia sebagai perubahan lokal di `BE`. Referensi remote `BE` masih menunjuk baseline awal. [Audit Phase 1–2](SAMPIRA_PHASE_01_02_COMPREHENSIVE_REPORT.md)

Audit repository mencakup rute Go, pola handler/repository/model, sesi dari database, proteksi penulisan browser, penyimpanan foto pickup, penyimpanan bukti privat pada ledger Phase 2, serta skema dan laporan sebelumnya. Skill **ponytail** dipakai untuk memanfaatkan kembali pola tersebut tanpa menambah framework, layanan perantara, atau dependensi. Pengujian HTTP menggunakan harness fixture MariaDB dan Chromium yang sudah tersedia.

## Cakupan dan arsitektur

Masyarakat mengajukan laporan fasilitas dan dapat membaca detail, histori, dan foto miliknya. Admin memeriksa antrean, menyetujui, meminta revisi, atau menolak. Penanganan fisik, penugasan Petugas, koordinasi pemerintah, dan UI integrasi berada pada fase selanjutnya.

Rute `net/http` berada di bawah `/api/ecorecycle/facility-reports`. Handler mengambil identitas dari sesi Phase 1 dan menggunakan guard origin yang sama dengan API sebelumnya. Repository menyimpan laporan, foto, dan histori dalam transaksi InnoDB. Foto disimpan sebagai BLOB privat dengan pola penyimpanan bukti Phase 2. Status, tabel, dan endpoint pickup serta reward tetap terpisah.

## Migrasi dan struktur database

| Tabel | Data dan relasi | Indeks |
|---|---|---|
| `facility_reports` | Nomor laporan, pelapor dan verifikator ke `users.id`, kategori, lokasi, koordinat desimal, status, versi dan waktu UTC. | PK `id`, nomor unik, key pengajuan unik per pelapor, indeks daftar berdasarkan pelapor/status/kategori dan ID. |
| `facility_report_photos` | Satu foto aktif per laporan, tipe MIME dan byte gambar. FK ke `facility_reports.id`. | PK `report_id`. |
| `facility_report_history` | Aktor ke `users.id`, status sebelum/sesudah, alasan dan timestamp. FK ke laporan. | PK gabungan `(report_id, version)` untuk mencegah histori ganda. |

Kategori tetap berupa enum terpisah dari kategori pickup. Koordinat menggunakan presisi enam angka desimal dan constraint pasangan/rentang. Waktu dibuat dalam UTC dengan presisi mikrodetik. ID pelapor, verifikator dan aktor berasal dari sesi. FK mempertahankan referensi historis ke akun.

Migrasi `002_facility_reports.sql` menambahkan tiga tabel melalui `CREATE TABLE IF NOT EXISTS`. Bootstrap server menjalankan DDL yang sama dari file tertanam setelah penyiapan skema Phase 1–2. File SQL yang sama dapat dijalankan secara eksplisit oleh operator. DDL MySQL/MariaDB melakukan implicit commit. Bila satu pernyataan gagal, perbaiki penyebabnya sebelum mengulang skrip. Migrasi ini tidak menulis ke tabel Phase 1–2.

## State machine dan konsistensi

| Dari | Ke | Syarat |
|---|---|---|
| Belum ada | `pending` | User mengirim form valid dan UUID idempotensi. |
| `pending` | `revision_required` | Admin mengirim versi saat ini dan alasan. |
| `revision_required` | `pending` | User pemilik mengirim ulang form dan versi saat ini. |
| `pending` | `approved` | Admin mengirim versi saat ini. Catatan opsional. |
| `pending` | `rejected` | Admin mengirim versi saat ini dan alasan. |

`approved` dan `rejected` bersifat terminal. Perubahan mengambil row lock melalui `SELECT ... FOR UPDATE`, membandingkan status dan versi, menaikkan versi sekali, lalu menulis histori pada transaksi yang sama. Retry pengajuan dengan key yang sama mengembalikan laporan yang sudah dibuat. Retry revisi atau verifikasi dengan versi basi mendapat 409. Jika histori gagal ditulis, perubahan laporan dan foto ikut di-rollback.

## Endpoint dan hak akses

| Endpoint relatif | User | Admin |
|---|---|---|
| `POST /api/ecorecycle/facility-reports` | Buat | — |
| `GET /api/ecorecycle/facility-reports` | Daftar sendiri | Semua, filter status/kategori |
| `GET /api/ecorecycle/facility-reports/{id}` | Milik sendiri | Baca |
| `PUT /api/ecorecycle/facility-reports/{id}` | Revisi milik sendiri | — |
| `GET /api/ecorecycle/facility-reports/{id}/history` | Milik sendiri | Baca |
| `GET /api/ecorecycle/facility-reports/{id}/photo` | Milik sendiri | Baca |
| `POST /api/ecorecycle/facility-reports/{id}/verification` | — | Verifikasi |

Petugas dan Administrator tidak memiliki izin laporan Phase 3A. Semua rute laporan membutuhkan sesi aktif. ID milik User lain diperlakukan sebagai resource yang tidak ditemukan. Skema request dan respons, contoh fetch, serta pagination tersedia di kontrak integrasi. [Kontrak API untuk FE](PHASE_03_API_CONTRACT.md) · [OpenAPI](../openapi.json)

## Validasi dan keamanan

- Form membatasi field ke daftar yang diizinkan dan menolak field berulang. Body JSON verifikasi menolak field asing dan dokumen tambahan. Mutasi tidak menerima nilai dari query string.
- Panjang teks dan koordinat diverifikasi sebelum menulis. Alasan wajib untuk revisi dan penolakan.
- Unggahan menerima satu JPEG atau PNG maksimal 5 MiB dan 16 megapiksel. Server memeriksa ekstensi, signature, dan keberhasilan decode. Nama file dari klien tidak digunakan untuk path atau respons.
- Foto hanya keluar melalui rute berautentikasi dengan `no-store`, `nosniff`, dan kebijakan resource same-origin. Respons error menyembunyikan detail SQL.
- Cookie HttpOnly, autentikasi Bearer, pencabutan sesi, role dari database, dan pemeriksaan origin tetap memakai mekanisme Phase 1.

## File yang ditambah dan diubah

| File | Perubahan |
|---|---|
| `cmd/server/main.go` | Menjalankan migrasi dan memasang rute laporan. |
| `db_init/migrations/002_facility_reports.sql` | Tiga tabel, FK, indeks dan constraint baru. |
| `db_init/migrations/facility_reports.go` | Menjalankan SQL tertanam per pernyataan. |
| `internal/handlers/auth_handler.go` | Menambahkan repository laporan pada `App`. |
| `internal/handlers/facility_reports.go` | Rute, sesi, RBAC, pembacaan privat, pagination dan respons. |
| `internal/handlers/facility_report_validation.go` | Validasi form, JSON, koordinat dan foto. |
| `internal/handlers/facility_report_validation_test.go` | Unit test untuk koordinat, decode gambar dan body verifikasi. |
| `internal/models/facility_report.go` | Model laporan, histori dan status. |
| `internal/repositories/facility_reports.go` | Kueri kepemilikan dan transaksi laporan, foto, histori serta retry. |
| `scripts/check-phase1-migration.mjs` | Menjalankan suite Phase 3A saat `SAMPIRA_TEST_PHASE3=1`. |
| `scripts/check-phase3-reports.mjs` | Integrasi HTTP dan MariaDB untuk seluruh workflow laporan. |
| `docs/openapi.json` | Tujuh operasi API beserta skema dan status HTTP. |
| `docs/progress/PHASE_03_API_CONTRACT.md` | Kontrak integrasi Phase 3B. |
| `docs/progress/PHASE_03_BE.md` | Audit, operasi, hasil pengujian dan checklist ini. |

## Hasil pengujian

| Pengujian | Hasil |
|---|---|
| Baseline `go test -count=1 ./...`, `go vet ./...`, build server dan initializer | PASS setelah fast-forward. |
| Baseline `node scripts/check-phase1-migration.mjs` dengan MariaDB 10.4.32 dan Chromium | PASS. Migrasi role, sesi, logout, RBAC, CSRF, pickup, tracking, timbang, ledger, bukti dan empat portal. |
| `SAMPIRA_TEST_PHASE3=1` dengan harness yang sama | PASS. Pengajuan valid dan invalid, pengulangan key, RBAC dan kepemilikan, akses foto, pagination, seluruh transisi, alasan, verifikasi bersamaan dan rollback histori. |
| Migrasi additive dan re-run pada fixture berisi data lama | PASS. Server berhasil menyiapkan tabel. Eksekusi ulang SQL dua kali dan mutasi laporan tidak mengubah checksum pickup, histori pickup, transaksi, atau ledger. |
| Regresi API Phase 1–2 dan Chromium sesudah implementasi | PASS. Auth, logout, RBAC empat role, pickup, timbang, ledger dan kontrol bukti. Chromium melaporkan nol error resource eksternal. |
| Unit test Phase 3A, `go test -count=1 ./...`, `go vet ./...`, dan build | PASS. Koordinat, decode foto, validasi body, dan paket Go yang sudah ada. |
| Pemeriksaan statis | PASS. JSON dan referensi OpenAPI, tujuh operasi, sintaks skrip, pemeriksaan sembilan view, dan tes CMS Administrator. |
| `check-phase1-restore.mjs` dengan dua instance MariaDB fixture | PASS. Struktur dan fingerprint 11 tabel cocok, termasuk ketiga tabel laporan dan data foto. Pemeriksaan integritas ledger dan FK Phase 1–2 lulus. |
| `check-waste-categories.mjs` pada server fixture dengan skema baru | PASS. Sepuluh tarif cocok, estimasi benar, dan lima kategori invalid ditolak. |

Pengujian integrasi berjalan pada port loopback alternatif karena port HTTP fixture standar sedang dipakai. Pemindahan port dilakukan di salinan skrip sementara. Jalur database produksi tidak digunakan. Pengujian menyuntikkan kegagalan INSERT histori melalui trigger khusus fixture dan memverifikasi rollback, kemudian melepas trigger.

## Temuan, risiko, dan pekerjaan lanjutan

- Port HTTP fixture standar `18081` sedang digunakan. Fixture diuji pada port terpisah tanpa menghentikan proses yang sudah ada.
- Runner sementara sempat gagal karena path temp sandbox tidak tersedia pada proses yang dieskalasi dan karena sintaks penyisipan perintah restore. Runner dijalankan langsung dengan sintaks yang diperbaiki. Suite lengkap kemudian lulus.
- Penyimpanan foto di database menyederhanakan rollback dan backup. Ukuran dump bertambah sesuai jumlah foto. Kebijakan retensi dan pemantauan volume diperlukan saat penggunaan bertambah.
- Histori menyimpan status, aktor dan catatan. Revisi mengganti isi laporan dan foto aktif jika ada unggahan baru. Versi lama isi form dan byte foto tidak tersedia sebagai arsip.
- Verifikasi dilakukan pada MariaDB 10.4.32 dan Chromium lokal. Uji lingkungan deployment dan integrasi UI laporan menjadi bagian serah terima.
- Integrasi form dan dashboard verifikasi dapat memakai kontrak sekarang. Penugasan Petugas dan tindak lanjut fasilitas berada pada Phase 4.

## Persiapan environment dan migrasi

1. Gunakan skema Phase 1–2 yang sudah dimigrasikan. Untuk instalasi baru, buat skema dengan `go run ./db_init`. Untuk skema lama, ikuti [panduan Phase 1](../phase-01-operations.md#migrasi-database-yang-sudah-ada) dan [panduan Phase 2](PHASE_02_PICKUP_WORKFLOW.md#8-perubahan-database).
2. Hentikan penulisan dan buat cadangan yang sudah diverifikasi. Bila operator menjalankan DDL manual, pilih skema dari `DB_NAME`, lalu jalankan `SOURCE db_init/migrations/002_facility_reports.sql` dari klien MariaDB. Hentikan pada error. Startup `go run ./cmd/server` juga menerapkan DDL tersebut. Akun yang menerapkan migrasi membutuhkan izin DDL sesuai konfigurasi database.
3. Periksa tiga tabel baru dengan `SHOW CREATE TABLE`, termasuk FK dan indeks, lalu uji login User/Admin dan rute daftar. Untuk pemulihan, pulihkan cadangan ke skema terpisah dan verifikasi sebelum cutover.
4. Jalankan `go test -count=1 ./...` dan `go vet ./...`. Untuk suite HTTP, siapkan instance fixture sesuai panduan Phase 1, build biner terbaru, lalu jalankan perintah berikut dari root repo.

   ```powershell
   $env:SAMPIRA_TEST_PHASE3 = '1'
   node scripts/check-phase1-migration.mjs
   ```

## Checklist penerimaan

- [x] User dapat membuat laporan dengan data dan foto valid.
- [x] User dapat membaca daftar, detail, histori dan foto miliknya.
- [x] Admin dapat melihat antrean, memfilter, menyetujui, meminta revisi dan menolak.
- [x] User dapat memperbaiki laporan yang membutuhkan revisi.
- [x] Alasan revisi dan penolakan tersimpan serta dapat dilihat pemilik.
- [x] RBAC, sesi dan kepemilikan teruji.
- [x] Status, versi dan histori konsisten pada retry, konkurensi dan kegagalan histori.
- [x] Migrasi additive dan re-run teruji pada database terisolasi.
- [x] Regresi penting Phase 1–2 lulus.
- [x] Kontrak API dan laporan backend tersedia.

## Kesimpulan

**PASS.** Acceptance criteria Phase 3A terpenuhi pada MariaDB dan HTTP terisolasi. Kontrak tujuh operasi siap dipakai untuk Phase 3B. Penerapan pada database utama dan validasi deployment berada di luar pengujian ini.
