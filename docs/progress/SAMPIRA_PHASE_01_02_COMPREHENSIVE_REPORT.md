# SAMPIRA — Laporan Kumulatif Audit Phase 1–2

## 1. Informasi Proyek

| Item | Nilai |
|---|---|
| Proyek | SAMPIRA, Sampah, Informasi, Pelaporan, dan Respons Aksi |
| Tagline | Laporkan Sampah, Pantau Perubahannya. |
| Audit | 5 November 2026, Asia/Bangkok |
| Branch | `codex/phase-02-pickup-workflow` |
| Commit dasar | `e648496f8c947bea8d21d145e9514ad6daa9a286` |
| Status | **PASS WITH NOTES** |

Perubahan Phase 1 dan 2 ada di working tree pada branch ini. Pengelompokan historis mengacu pada laporan phase dan diff terhadap commit dasar. Tidak ada commit phase baru yang diasumsikan.

## 2. Ringkasan Eksekutif

Phase 1 dan 2 terverifikasi untuk cakupan masing-masing. Alur pickup dan pencatatan reward berjalan dengan batas role, histori, dan bukti operator. Audit memperbaiki parser body, konsistensi tracking, klasifikasi transaksi lama, tarif landing, dan angka kontribusi User. Backup delapan tabel berhasil dipulihkan ke instance terisolasi. Basis kode siap untuk Phase 3. Penggunaan publik masih memerlukan kredensial Administrator yang layak, konfigurasi HTTPS, dan penyiapan akun operasional.

## 3. Kondisi Awal EcoRecycle

Commit dasar menyediakan landing, estimator, akun, portal User/Collector/Admin, dan alur pickup dengan verifikasi berat. Role lama adalah `user`, `collector`, dan `admin`. Registrasi, tracking, dan sesi memiliki celah akses. Seeder memuat akun demo serta transaksi dengan penanda sukses tanpa konfirmasi transfer. Baseline diperiksa melalui Git, deklarasi DDL, dan laporan audit awal. Gap Analysis, BRD, Laporan Analisis EcoRecycle, serta dokumen desain eksternal tidak tersedia di repository.

## 4. Riwayat Pengerjaan Phase 1

Phase 1 menetapkan registrasi publik sebagai User, bootstrap Administrator lewat CLI, bcrypt, secret HMAC wajib, sesi aktif yang dapat dicabut, cookie HttpOnly, dan perlindungan CSRF. Migrasi mempertahankan ID saat mengganti Collector menjadi Petugas. Backend menegakkan role dan kepemilikan untuk portal, profil, foto, dan tracking. CMS dipindahkan ke Administrator, dan Admin dipisahkan dari pickup. Akun seed lokal dinonaktifkan atas persetujuan operator. Backup, restore, RBAC, expiry, logout, dan empat portal diuji. Rincian historis ada di [progres Phase 1](PHASE_01_SECURITY_RBAC.md) dan [verifikasi final](PHASE_01_FINAL_VERIFICATION.md).

## 5. Riwayat Pengerjaan Phase 2

Phase 2 menambah validasi input dan unggahan, audit aktor, timbang aktual sekali tulis, dan penutupan pickup atomik bersama kewajiban reward. Portal User dan Petugas mengintegrasikan tracking, antrean, dan timbang. Administrator mencatat pembayaran eksternal menggunakan nominal cocok, referensi, dan bukti. Constraint mencegah kewajiban ganda dan pengulangan referensi atau digest. Suite asli memperbaiki fixture kategori default dan semantik form. Rincian historis ada di [progres Phase 2](PHASE_02_PICKUP_WORKFLOW.md).

## 6. Skill yang Digunakan

| Skill | Kontribusi |
|---|---|
| `brainstorming` | Menyelaraskan keputusan bisnis dan membatasi perbaikan pada Phase 1–2. |
| `ponytail` | Memakai ulang parser, estimator REST, transaksi SQL, dan harness yang ada. |
| `systematic-debugging` | Mereproduksi penerimaan query oleh parser POST dan menelusuri sumber tarif serta angka dashboard. |
| `verification-before-completion` | Menjalankan Go, build, API, Chromium, restore, dan pemeriksaan akhir. |
| `impeccable` | Membaca konteks dan panduan audit UI, mempertahankan gaya, serta menjalankan detektor pada landing dan dashboard. Detektor bekerja dalam mode regex terbatas. |

## 7. Arsitektur Sistem Saat Ini

Go melayani template HTML, aset Vanilla JS, Leaflet dan Chart.js, serta REST pada origin yang sama. Middleware menerapkan origin pada penulisan berbasis cookie. Handler menggunakan sesi dan role terkini dari database, lalu menjalankan kueri atau transaksi melalui driver MySQL. MariaDB menyimpan akun, sesi, kategori, pickup, histori, CMS, dan ledger. Peta tracking mengambil alamat yang tercatat. Koordinat real-time tidak tersedia.

## 8. Struktur Role dan Hak Akses

| Fungsi | User | Petugas | Admin | Administrator |
|---|---|---|---|---|
| Portal dan profil sendiri | Ya | Ya | Ya | Ya |
| Buat, edit, batal pickup pending | Milik sendiri | — | — | — |
| Antrean ringkas, klaim | — | Untuk diri sendiri | — | — |
| Detail dan foto pickup | Milik sendiri | Ditugaskan | — | — |
| Progres dan timbang | — | Ditugaskan | — | — |
| CMS, direktori Petugas dan statistik | — | — | — | Ya |
| Catat pembayaran dan akses bukti | — | — | — | Ya |
| Kerangka portal laporan fasilitas | — | — | Ya | — |

Workflow laporan fasilitas, assignment laporan, dan pemerintah adalah target Phase 3–4. Pemerintah adalah pihak eksternal. Pengelolaan sistem lengkap melalui UI Administrator masih terencana.

## 9. Alur Penjemputan Final

User mengajukan dan menerima tracking. Petugas mengklaim baris `pending` yang belum memiliki assignee lewat update bersyarat. Alur `pending → pickup → transit → arrived → completed` tidak memerlukan persetujuan Admin atau Administrator. User dapat mengedit dan membatalkan pengajuan miliknya selama pending. Progres, aktor, dan catatan tersimpan pada transaksi yang sama. Detail dan histori kini dibaca dalam satu snapshot. Kegagalan membaca histori menghasilkan error.

## 10. Alur Reward dan Transaksi

Landing dan form menggunakan tarif server. Reward bruto dan biaya dihitung dari berat aktual, dengan nominal bersih minimal nol. Timbang dan pembuatan satu kewajiban dilakukan atomik. `not_due` berarti nol, `pending` menunggu pembayaran, dan `paid` berarti Administrator mencatat pembayaran eksternal dengan bukti dan referensi. API membatasi akses gambar bukti kepada Administrator dan metadata pembayaran kepada pemilik. Pickup dengan transaksi lama tanpa ledger baru membutuhkan rekonsiliasi, termasuk ketika status operasional lama belum selesai. Angka aktual di dashboard hanya menghitung pickup selesai yang memiliki ledger. Aplikasi tidak menjalankan transfer.

## 11. Database

Audit membaca MariaDB 10.4.32 dan memeriksa delapan tabel InnoDB serta sepuluh foreign key.

| Tabel | Kunci dan peran |
|---|---|
| `users` | PK ID, email unik, enum empat role, akun aktif. |
| `auth_sessions` | PK digest, FK akun dan indeks expiry. |
| `waste_categories` | PK ID, tarif dan biaya DECIMAL. |
| `pickups` | PK ID, tracking unik, FK pemilik, Petugas dan kategori. |
| `pickup_history` | PK ID, FK pickup dan aktor nullable. |
| `pickup_rewards` | PK/FK pickup, FK aktor pembayaran, referensi dan digest unik, nominal DECIMAL, constraint status/bukti. |
| `transactions` | PK ID dan FK pickup. Arsip transaksi lama. |
| `portal_announcements` | PK ID dan FK pembuat. |

Sumber lokal berisi empat akun, tiga pickup, delapan histori, satu transaksi legacy, dan ledger baru kosong. Hanya Administrator yang aktif. Cadangan audit `ecorecycle-audit-20261105-224308.sql` dipulihkan di MariaDB terpisah. Struktur, seluruh baris, ID, role, relasi, aktor dan invariant ledger cocok. Pemeriksaan orphan menghasilkan nol. Audit tidak menambah migrasi skema.

## 12. Perubahan Source Code

| Kelompok | File atau keluarga file | Fungsi dan alasan |
|---|---|---|
| Baru Phase 1 | `cmd/server/bootstrap.go`, `internal/handlers/access.go`, `internal/repositories/session_repository.go`, `access_test.go`, `auth_service_test.go` | Bootstrap, proteksi portal/foto, sesi dan pengujian keamanan. |
| Baru Phase 1 | `db_init/migrations/001_four_roles.sql`, `app/Views/administrator.html`, `assets/js/portal-session.js` | Migrasi role, portal Administrator dan pengelolaan sesi browser. |
| Baru Phase 1 | `scripts/check-phase1-migration.mjs`, `check-phase1-browser.mjs`, `check-phase1-restore.mjs`, `docs/phase-01-operations.md`, dua laporan Phase 1 | Fixture, Chromium, restore dan dokumentasi operasi. |
| Diubah Phase 1 | `.env.example`, `.htaccess`, `cmd/server/main.go`, `db_init/db_init.go`, `internal/models/user.go`, `pickup.go`, `internal/services/auth_service.go`, `internal/middleware/auth_middleware.go` | Konfigurasi, rute, keamanan, model role, dan installer aman. |
| Diubah Phase 1 | `internal/handlers/{auth,announcement,pickup,tracking,payout}_handler.go`, `pickup_helpers.go`, `pickup_rows.go`, `pickup_rules_test.go`, `tracking_validation.go`, `payout_helpers.go`, `internal/repositories/{user,announcement}_repository.go` | Menerapkan batas hak akses, kepemilikan dan validasi pickup. |
| Diubah Phase 1 | `app/Views/{admin,auth,collector,dashboard,login,profile,register}.html`, `assets/js/{admin,auth,collector,dashboard,portal-announcements}.js` | Redirect, cookie, role portal, dan CMS. |
| Diubah Phase 1 | `README.md`, `docs/openapi.json`, `scripts/check-api-regressions.mjs`, `check-admin-ui.cjs`, `check-ui-quality.cjs` | Kontrak, penggunaan, dan regresi. |
| Baru Phase 2 | `internal/repositories/pickup_workflow_schema.go`, `internal/handlers/reward_payment_handler.go`, `assets/js/reward-payments.js`, `PHASE_02_PICKUP_WORKFLOW.md` | Ledger, API bukti, form Administrator, dan laporan. |
| Diubah Phase 2 | `cmd/server/main.go`, `internal/handlers/{pickup,payout,tracking}_handler.go`, `pickup_upload.go`, `pickup_helpers.go`, `pickup_rows.go`, `payout_helpers.go`, `pickup_rules_test.go` | Startup, timbang, validasi gambar, metadata reward dan pengujian. |
| Diubah Phase 2 | `app/Views/{dashboard,collector,administrator}.html`, `assets/js/{dashboard,collector}.js`, `scripts/check-api-regressions.mjs`, `check-phase1-browser.mjs`, `check-phase1-migration.mjs`, `README.md`, `docs/openapi.json`, `phase-01-operations.md` | Menghubungkan UI, fixture dan kontrak Phase 2. |
| Audit backend | `internal/middleware/auth_middleware.go`, `auth_middleware_test.go`, `internal/handlers/{pickup_handler,pickup_helpers,pickup_rows,tracking_handler}.go` | Body-only, konsolidasi parser, snapshot histori, transaksi lama dan metrik aktual. |
| Audit frontend | `app/Views/{index,dashboard}.html`, `assets/js/{home,dashboard}.js` | Estimator server, loading/error, serta kontribusi dari berat aktual. |
| Audit QA dan docs | `scripts/check-api-regressions.mjs`, `check-phase1-browser.mjs`, `check-phase1-migration.mjs`, `check-phase1-restore.mjs`, `README.md`, `docs/openapi.json`, laporan dan changelog audit | Bukti regresi, restore ledger, dan kontrak body serta metrik. |

Log server yang sudah berubah di working tree dipertahankan. Biner lokal berada di luar repository.

## 13. Hasil Pengujian

| Skenario | Perintah dan lingkungan | Hasil | Bukti |
|---|---|---|---|
| Reproduksi parser lama | `go test -run TestRequestDataIgnoresQuery ./internal/middleware` sebelum patch | FAIL | Query diterima oleh parser lama. |
| Go | `go test -count=1 ./...`, `go vet ./...`, gofmt dan build | PASS | Paket handler, middleware dan service lulus. Server dan initializer terbangun. |
| API, RBAC, migrasi dan konkurensi | `node scripts/check-phase1-migration.mjs` pada MariaDB terisolasi | PASS | Klaim/timbang/pembayaran serentak, hak role, bukti, expiry, logout, CSRF, data lama dan error histori teruji. |
| Chrome desktop dan mobile | Harness `scripts/check-phase1-browser.mjs` | PASS | Empat role, landing dengan tarif fixture berbeda dari nilai statis, berat aktual 5,5 kg, penimbangan dan form bukti. Tidak ada error eksternal pada run. |
| Restore | `scripts/check-phase1-restore.mjs`, sumber lokal dan instance terisolasi | PASS | Delapan tabel, struktur dan fingerprint cocok. Ledger dan aktor tidak orphan. |
| Frontend dan kontrak | `node --check`, `check-ui-quality.cjs`, `check-admin-ui.cjs`, validasi referensi OpenAPI | PASS | Sembilan halaman lulus pemeriksaan struktur. Referensi OpenAPI ditemukan. |
| Detektor UI | `impeccable detect` pada landing/dashboard | FAIL | Peringatan gaya incumbent, placeholder foto tersembunyi, dan parser opsional tidak tersedia. Hasil tidak mengukur kontras terkomputasi. |
| Runtime lokal | Smoke test loopback dan checksum | PASS | Login 200, reward anonim 401, kredensial query 400, checksum historis sama. |
| Browser lintas mesin, TLS publik dan transfer riil | Lingkungan operasional eksternal | NOT TESTED | Pengujian Chrome memakai satu mesin dan fixture. Tidak ada dana yang ditransfer. |

## 14. Temuan Audit

| Severity | Penyebab dan file | Perbaikan | Status |
|---|---|---|---|
| Sedang | `RequestData` mencampur `r.Form` dan body, sehingga kredensial dan nilai mutasi bisa dibaca dari URL. | Parser memakai body saja. Regression test unit dan API. | Fixed |
| Sedang | `tracking_handler.go` memakai dua bacaan terpisah dan menelan kegagalan histori. | Snapshot repeatable-read dan respons 500 bila histori gagal. | Fixed |
| Sedang | `pickup_rows.go` dan tracking mengandalkan flag pickup untuk fallback legacy. | Transaksi legacy terkait ikut menentukan rekonsiliasi. | Fixed |
| Sedang | `home.js` memakai tarif JavaScript dan hasil awal hardcoded. | Estimasi API dengan loading, pesan gagal, dan penolakan respons basi. | Fixed |
| Sedang | `dashboard.js` menghitung berat estimasi termasuk pickup yang belum selesai. | Metrik memakai berat aktual pickup selesai dengan ledger. Label CO₂ tetap estimasi berbasis faktor. | Fixed |
| Rendah | Harness restore belum mencakup ledger dan aktor Phase 2. | Tambah pemeriksaan orphan dan state ledger. | Fixed |
| Tinggi untuk publik | Password Administrator lokal dipilih untuk pengujian dan telah dibagikan di chat. | Pertahankan bind loopback. Rotasi dengan persetujuan operator sebelum akses publik. | Open, operasional |
| Rendah | Detektor menemukan gaya lama dan elemen preview foto tanpa src saat tersembunyi. | Catat tipografi, aksen, preview dan audit kontras untuk Phase 5. | Planned |

## 15. Fitur yang Sudah Berfungsi

| Tingkat | Bukti |
|---|---|
| Implemented | Auth, sesi, RBAC, klaim, timbang, audit, ledger dan bukti tersedia di source. |
| Tested | Go, fixture MariaDB, regresi API, dan Chrome menjalankan skenario. |
| Verified | Restore cocok, hasil uji diamati, dan server lokal merespons smoke test. |
| Operational | Loopback aktif, portal Administrator tersedia, ledger lokal kosong. Role User/Petugas/Admin masih perlu provisioning akun sah. |

## 16. Fitur yang Belum Selesai

- **Sisa Phase 1**. Tidak ada regresi yang teramati pada cakupan yang diuji. Provisioning, kebijakan percobaan login, dan rotasi kredensial merupakan tindak lanjut operasional sebelum publik.
- **Sisa Phase 2**. Pencatatan manual tersedia. Verifikasi ke penyedia eksternal, rekonsiliasi transaksi lama, dan penggunaan transfer nyata berada di luar hasil yang diuji.
- **Backlog operasional**. HTTPS deployment, pembatasan percobaan login, retensi dan akses backup berisi bukti, observabilitas, serta pagination ledger jika volume meningkat.
- **Phase 3–4**. Workflow laporan fasilitas, penugasan, bukti lapangan, dan koordinasi eksternal berstatus **NOT IMPLEMENTED / PLANNED**.
- **Phase 5–6**. Rebranding, penataan UI menyeluruh dan pekerjaan lanjutan sesuai roadmap.

## 17. Rebranding EcoRecycle ke SAMPIRA

| Lokasi | Identitas tersisa dan risiko |
|---|---|
| `go.mod`, import di `internal/handlers`, `internal/repositories`, `internal/services`, `cmd/server` | Nama modul `ecorecycle`. Rename memerlukan pembaruan import dan build. |
| `cmd/server/main.go`, `db_init/db_init.go`, `.env.example`, `README.md`, `docs/phase-01-operations.md` | Nama database default, banner, instruksi lama, dan file executable. Pergantian nama database membutuhkan migrasi terpisah. |
| `docs/openapi.json`, `docs/swagger.html`, `docs/waste-categories.md`, `scripts/check-api-regressions.mjs`, `check-phase1-browser.mjs`, `check-phase1-restore.mjs`, `check-waste-categories.mjs` | Namespace API, identitas dokumen dan fixture. Pertahankan alias kompatibilitas saat Phase 5. |
| `app/Views/{index,login,register,dashboard,collector,profile}.html`, `assets/js/{admin,collector,dashboard,home,portal-announcements,reward-payments}.js` | Label, teks, aset, dan pemanggilan URL legacy. |
| `assets/css/{admin,collector,dashboard,style}.css`, `assets/img/landing-generation.md` | Referensi gaya, aset, dan brief gambar lama. |
| `assets/img/` | `ecorecycle_collector_bike.png`, `blog_ecorecycle_role.png`, `ecorecycle_service_computers.png`, `ecorecycle_illustration.png`, `ecorecycle_hero_illustration.png`, `ecorecycle_service_appliances.png`, `ecorecycle_hero.png`, `ecorecycle_about_illustration.png`, `ecorecycle_bg.png`, `ecorecycle_service_gadgets.png`. |
| `docs/progress/`, log dan biner lama | Catatan historis. Arsipkan sebagai riwayat, dan kendalikan publikasi log. |

## 18. Risiko dan Keterbatasan

Uji database pada MariaDB 10.4.32. Perilaku CHECK, timezone dan reverse proxy HTTPS harus diuji pada target deployment. Bukti gambar dipagari ukuran, ekstensi, tipe dan akses, tetapi otentisitasnya diperiksa Administrator di luar aplikasi. Digest mencegah penggunaan ulang byte identik. Perubahan isi bukti tetap membutuhkan pemeriksaan operator. Kontras terkomputasi, screen reader, browser selain Chrome, dan transfer riil belum diverifikasi. Data riil tidak dipakai untuk fixture transaksi.

## 19. Checklist Acceptance Criteria

**Phase 1**

- [x] Registrasi, bootstrap, HMAC, expiry, logout, role terbaru, akun nonaktif dan CSRF.
- [x] Empat portal, pemisahan role, kepemilikan, privasi foto dan migrasi Collector.
- [x] Backup/restore dan regresi terverifikasi.

**Phase 2**

- [x] Pengajuan, antrean dan klaim tunggal tanpa persetujuan.
- [x] Status, audit aktor, timbang aktual dan hasil backend.
- [x] Ledger pending/paid/not_due, bukti privat dan kontrol duplikasi.
- [x] Dashboard, pelacakan, data legacy, dan pengujian E2E.

## 20. Kesiapan Phase 3

Siap untuk memulai pengembangan laporan fasilitas di lingkungan pengembangan. Phase 3 dapat memakai role dan sesi yang ada, sambil menetapkan transisi, assignment laporan dan akses bukti yang terpisah dari pickup. Deployment publik menunggu tindak lanjut operasional pada bagian risiko.

## 21. Kesimpulan

**PASS WITH NOTES.** Implementasi Phase 1–2, perbaikan audit, regresi, dan integritas data terverifikasi. Catatan tersisa meliputi kredensial dan deployment publik, bukti manual, keterbatasan detektor UI, serta backlog di luar cakupan.
