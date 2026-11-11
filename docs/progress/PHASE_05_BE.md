# SAMPIRA Phase 5A — Laporan Backend

**Status: PASS** untuk cakupan Backend Phase 5A. Baseline `BE` pada `722f041fd2d074bd0889cf49275e7d7cceb4794d` sama dengan `origin/BE` saat audit dan working tree bersih. Implementasi tersimpan di working tree `BE`.

## Audit dan keputusan implementasi

- Skill **ponytail** dipakai untuk menjaga solusi tetap kecil. Audit mencakup README, dokumentasi Phase 1–4A, skema dan migrasi, handler pickup dan laporan, kebijakan peran, serta skrip regresi. Baseline Go dan fixture Phase 1–4A lulus sebelum perubahan.
- Pickup menyimpan `pickup_address` dan deskripsi, sementara detail, daftar, klaim, histori, timbang, dan reward sudah memiliki alur tersendiri. Lokasi baru ditambahkan pada row pickup dan disimpan dalam transaksi create/edit yang sama dengan histori.
- Laporan fasilitas sudah menyimpan latitude `DECIMAL(8,6)` dan longitude `DECIMAL(9,6)`. API verifikasi dan ringkasan penanganan sudah mengirim lokasi. Validasi rentang WGS84 dipakai ulang dengan presisi masing-masing. Revisi fasilitas tetap mengikuti versi dan status `revision_required`. Penugasan, koordinasi, dan akses bukti mengikuti Phase 4A.
- Leaflet dan tile OSM sudah dipakai di UI. Tidak ada mesin rute jalan dalam alur yang diaudit. Rute jalan Phase 5B memakai provider yang dikonfigurasi operator jika syarat akses browser terpenuhi. Pilihan eksternal dibuka setelah tindakan Petugas. [Spesifikasi routing dan izin](PHASE_05_BE_INTEGRATION_NOTES.md#peta-dan-routing)

## Skema, API, dan akses

`004_precise_locations.sql` menambah `pickups.latitude` dan `pickups.longitude` sebagai `DECIMAL(10,7) NULL` serta constraint `chk_pickup_coordinates` untuk pasangan lengkap dalam rentang atau dua null. DDL diterapkan saat startup setelah 002/003. PK, FK, dan indeks lama dipertahankan. Baris lama dibaca dengan dua null tanpa backfill. Rollback biner dapat mempertahankan kolom aditif. [Migrasi dan pemulihan](PHASE_05_BE_INTEGRATION_NOTES.md#migrasi-dan-pemulihan)

- `POST /api/ecorecycle/request_pickup` dan `POST /api/ecorecycle/update_pickup` menerima pasangan opsional di body. Validasi mencakup tipe, format, presisi, duplikasi, kehadiran pasangan, dan rentang. Nol adalah koordinat sah. Pada edit, field yang dihilangkan mempertahankan titik, sedangkan pasangan kosong menghapusnya. Perubahan alamat tidak menggeser titik.
- `GET /api/ecorecycle/pickup_status?tracking_number=…` dan `GET /api/ecorecycle/list_pickups?type=…` menambahkan dua field angka nullable. User membaca pengajuan sendiri. Petugas membaca tugas sendiri setelah klaim. Antrean belum diklaim menutupi titik dan detail tetap dilindungi. Admin dan Administrator tidak mendapat hak pickup baru. Statistik Administrator tetap agregat.
- Untuk fasilitas, User membaca laporan miliknya, Admin membaca sesuai API verifikasi, dan Petugas memperoleh lokasi melalui detail penanganan yang diizinkan. Petugas lama kehilangan akses setelah pengalihan. Petugas yang menyelesaikan tugas tetap mengikuti izin Phase 4A.
- Kontrak pickup menerima klien lama yang mengirim alamat saja. Konfirmasi titik untuk alur map baru menjadi keputusan UI Phase 5B. Deskripsi dan alamat tetap tersedia sesuai akses. Nilai yang dikirim pengguna tidak menjadi bukti kehadiran fisik. [Kontrak Phase 5A](PHASE_05_API_CONTRACT.md) · [OpenAPI](../openapi.json)

## File yang berubah

| Area | File |
|---|---|
| Migrasi dan startup | `db_init/migrations/004_precise_locations.sql`, `db_init/migrations/facility_reports.go`, `cmd/server/main.go` |
| Write/read dan validasi | `internal/handlers/pickup_location.go`, `internal/handlers/pickup_handler.go`, `internal/handlers/pickup_rows.go`, `internal/handlers/tracking_handler.go`, `internal/handlers/facility_report_validation.go` |
| Pengujian fixture | `scripts/check-phase1-migration.mjs`, `scripts/check-phase3-reports.mjs`, `scripts/check-phase4-handling.mjs`, `scripts/check-phase5-locations.mjs` |
| Kontrak dan laporan | `docs/openapi.json`, `docs/progress/PHASE_05_BE.md`, `docs/progress/PHASE_05_API_CONTRACT.md`, `docs/progress/PHASE_05_BE_INTEGRATION_NOTES.md` |

## Verifikasi

| Uji | Hasil |
|---|---|
| `go test -count=1 ./...`, `go vet ./...`, `go build ./cmd/server ./db_init` | PASS. Paket repository tidak memiliki suite unit tersendiri. Jalur database diuji melalui fixture API. |
| MariaDB 10.4.32 terisolasi | PASS. Restore dump sintetis berisi data Phase 1–4 ke skema berbentuk sebelum 004, terapkan 004 dua kali, bandingkan nilai pickup lama, checksum histori, transaksi, reward, laporan, foto, handling, assignment, FK, dan indeks. Baris lama tetap null. Constraint menolak satu koordinat dan nilai di luar rentang. |
| API Phase 5A dan keamanan | PASS. Bandung dan Ambon, nol, batas, negatif, tujuh desimal, tipe/format invalid, NaN/Infinity, duplikasi, presisi berlebih, query string, clear/preserve edit, percobaan mass assignment, akses lintas User, masking antrean, akses setelah klaim, dan penolakan edit setelah klaim. |
| Phase 1–2 | PASS. Registrasi, empat role, sesi, logout, origin, tracking, klaim, progres, timbang, reward, payout, dan bukti privat. |
| Phase 3A–4A | PASS. Pengajuan dan revisi koordinat fasilitas, akses lokasi Admin dan Petugas, verifikasi, pengalihan dan pencabutan akses, tugas selesai, histori, bukti, koordinasi, konflik, dan rollback transaksi. |
| Chromium lintas branch | PASS. BE Phase 5A dengan view/aset dari arsip FE `023e08ba53b220588215167a15642f2333bcb6a5`. Suite Chromium portal dan Phase 3B/4B berjalan pada satu origin dan database uji segar. |
| Routing Backend / E2E peta Phase 5B | Tidak berlaku pada Phase 5A. Provider produksi dan UI navigasi belum diuji. |

Kegagalan constraint dalam log fixture merupakan uji negatif yang diharapkan. Instance utama tidak dipakai untuk migrasi atau pengujian.

## Checklist penerimaan

- [x] Audit, baseline, dan kompatibilitas Phase 1–4.
- [x] Penyimpanan tujuan pickup presisi serta dukungan lokasi fasilitas yang sudah ada.
- [x] Akses sesuai role, masking antrean, dan pencabutan akses tugas fasilitas setelah pengalihan.
- [x] Penanganan record historis, migrasi aditif dan replay, preservasi reward dan pembayaran.
- [x] Kontrak, OpenAPI, dan handoff peta, rute jalan, izin perangkat, serta fallback.
- [x] Uji Go, MariaDB, API, dan kompatibilitas Chromium lintas branch.
- [x] Perubahan terbatas pada Backend, skrip uji, dan dokumentasi. Branch `BE` tetap aktif, tanpa merge, commit, atau push.
