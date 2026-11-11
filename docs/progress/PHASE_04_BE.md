# SAMPIRA Phase 4A — Backend Penanganan Fasilitas

## Identitas dan kondisi awal

| Item | Nilai |
|---|---|
| Cakupan | Penugasan, asesmen, penanganan, validasi hasil, progres publik, dan koordinasi eksternal |
| Branch | `BE` |
| Commit baseline | `77e19da`, setara dengan `origin/BE` saat audit |
| Environment uji | Go 1.24.6, MariaDB XAMPP 10.4.32 terisolasi, Node.js dan Chromium |
| Skill | **ponytail** untuk memakai kembali arsitektur dan menghindari dependensi baru |

Seluruh perubahan frontend Phase 3B sudah tercatat di `FE` pada `19db878`. Saat pemeriksaan ulang, checkout sudah berada di `BE`. Laporan pemulihan server diamankan di arsip lokal di luar repo dengan SHA-256 yang cocok, lalu `git switch BE` mengonfirmasi branch aktif. Working tree bersih saat baseline. Referensi branch dan dokumentasi Phase 1–3A tersedia. [Audit Phase 1–2](SAMPIRA_PHASE_01_02_COMPREHENSIVE_REPORT.md) · [Laporan Phase 3A](PHASE_03_BE.md)

## Rancangan dan kompatibilitas

Phase 4A menggunakan sesi, proteksi origin, envelope HTTP, validasi foto, cursor pagination dan pola repository yang sudah ada. Hasil verifikasi Phase 3A tetap disimpan pada `facility_reports.status`. Phase 4A hanya mengizinkan mutasi setelah verifikasi `approved` dan menyimpan status, versi dan histori operasionalnya di tabel tambahan. Dengan pemisahan ini, FE Phase 3B masih membaca `approved` dengan makna semula dan `rejected` tetap terminal. Status dan versi Phase 4 tersedia melalui sembilan operasi baru di namespace laporan. Pickup dan reward tetap memiliki jalur terpisah.

## Migrasi dan struktur

| Tabel baru | Kolom dan invariant | Indeks dan relasi |
|---|---|---|
| `facility_handling` | `report_id`, status lapangan, versi, status koordinasi, ringkasan publik, versi foto publik, waktu perubahan UTC. Constraint versi dan hasil publik mengikat penyelesaian. Status koordinasi terverifikasi mensyaratkan status lapangan selesai. | PK/FK `report_id` ke Phase 3A. Indeks `(status, report_id)`. |
| `facility_assignments` | ID, laporan, Petugas, Admin penugas, status `active/reassigned/completed`, waktu penugasan dan penutupan. | FK ke agregat dan akun. Kolom generated `active_report_id` bernilai ID hanya untuk assignment aktif, dengan indeks unik. Indeks `(petugas_id,status,report_id)`. Kunci unik `(report_id,id)` mendukung FK histori. |
| `facility_handling_events` | Versi, aktor, assignment, aksi, status sebelum/sesudah, catatan publik/internal, kondisi, asesmen, tindakan, hasil, serta metadata koordinasi dan waktu UTC. | PK `(report_id,version)`, FK ke agregat, aktor, dan assignment dari laporan yang sama. |
| `facility_handling_photos` | Satu JPEG/PNG per event, MIME dan byte foto. | PK/FK `(report_id,version)` ke event. |

`003_facility_handling.sql` hanya menambah tabel. Startup menjalankan SQL tertanam setelah 002. Tidak ada ALTER pada enum Phase 3A, backfill, atau mutasi pada skema lama. Dump fixture yang berisi data Phase 3A dipulihkan ke skema uji, lalu migrasi diterapkan dua kali. Data lama, termasuk histori dan foto laporan serta ledger pickup, dibandingkan dengan checksum. DDL MySQL/MariaDB melakukan implicit commit. Jika proses berhenti, periksa kegagalan dan jalankan ulang setelah perbaikan. Database utama tidak dipakai untuk pengujian atau migrasi Phase 4A.

## Penugasan, pekerjaan lapangan dan validasi

`approved → assigned → assessment_in_progress → handling_in_progress → resolution_submitted → completed`.

- Admin memilih satu Petugas aktif. Pengalihan membutuhkan alasan, menutup assignment lama, dan memulai asesmen lagi dengan assignment baru. Riwayat mencatat ID assignment dan ID Petugas terdahulu bagi role berwenang. Akun nonaktif ditolak saat pemilihan dan kehilangan akses melalui sesi. Admin dapat mengalihkannya tanpa menghapus riwayat.
- Petugas memulai asesmen, mencatat kondisi dan hasil pemeriksaan, memperbarui tindakan, lalu menyerahkan hasil. Catatan hasil mencerminkan pekerjaan yang benar-benar dilakukan, termasuk bila pekerjaan hanya berupa pemeriksaan. Foto opsional pada event yang relevan.
- Admin dapat meminta koreksi `resolution_revision_required`. Petugas mencatat tindakan koreksi untuk kembali ke `handling_in_progress` sebelum menyerahkan ulang. Validasi selesai menutup tugas dan menyimpan ringkasan publik. Admin dapat memilih satu bukti dari assignment yang menyampaikan hasil untuk dipublikasikan kepada pemilik.
- Satu transaksi mengunci laporan induk, mengecek status/verifikasi/versi dan peran, mengubah assignment/agregat, menambah histori, dan menyimpan foto. Versi basi memberi 409. Jika penulisan histori atau foto gagal, semua perubahan rollback.

## Koordinasi eksternal dan visibilitas

Admin mencatat satu jalur koordinasi manual per laporan. `not_forwarded → forwarded → receipt_confirmed → follow_up_reported → resolution_verified`. Penerusan mencatat instansi, waktu, saluran, catatan dan referensi atau foto jika ada. Konfirmasi penerimaan serta verifikasi eksternal memakai referensi atau foto. `follow_up_reported` hanya menyimpan informasi yang dilaporkan instansi. `resolution_verified` memerlukan bukti dan penyelesaian yang sudah divalidasi pada workflow lapangan. Mutasi koordinasi hanya menaikkan versi dan memperbarui histori/status koordinasi. Status lapangan berubah melalui review Admin.

API menggunakan role dan status aktif dari database. User hanya mendapat data miliknya, ringkasan, histori publik, dan foto yang secara eksplisit dipublikasikan. Petugas baru mengambil alih akses ketika assignment berubah. Petugas penyelesai dapat membaca tugas selesai miliknya. Foto dan metadata koordinasi hanya dapat dibaca Admin. Administrator tidak memiliki izin operasional Phase 4. Rute foto memiliki `no-store`, `nosniff`, dan kebijakan same-origin. RBAC foto dan histori memakai satu snapshot. Bukti lapangan maksimal satu foto per event dengan 5 MiB, 16 megapiksel, ekstensi sesuai, signature dan decode JPEG/PNG.

## Endpoint dan serah terima

Lima operasi baca menyediakan daftar penanganan, daftar Petugas aktif, detail, histori, dan foto. Empat operasi tulis mencatat assignment, aktivitas lapangan, review dan koordinasi. Seluruh endpoint berada di `/api/ecorecycle/facility-reports`. Kontrak mencakup payload, status, izin, cursor dan versi. [Kontrak Phase 4A](PHASE_04_API_CONTRACT.md) · [OpenAPI](../openapi.json) · [Catatan integrasi](PHASE_04_BE_INTEGRATION_NOTES.md)

## Daftar file

| File | Perubahan |
|---|---|
| `cmd/server/main.go` | Menjalankan migrasi 003 dan mendaftarkan rute Phase 4. |
| `db_init/migrations/003_facility_handling.sql` | Skema additive empat tabel. |
| `db_init/migrations/facility_reports.go` | Menjalankan migrasi 002 dan 003 melalui helper SQL tertanam yang sama. |
| `internal/models/facility_handling.go` | State machine, koordinasi, command dan representasi respons. |
| `internal/models/facility_handling_test.go` | Uji transisi yang sah dan dilarang serta urutan koordinasi. |
| `internal/repositories/facility_handling.go` | Penguncian, RBAC transaksional, assignment, versioning, histori dan foto. |
| `internal/repositories/facility_handling_reads.go` | Query ringkasan, antrean, Petugas aktif, histori, dan proyeksi foto/field sesuai role. |
| `internal/handlers/auth_handler.go` | Menghubungkan repository penanganan ke `App`. |
| `internal/handlers/facility_reports.go` | Berbagi helper header foto privat dengan Phase 4, dengan perilaku Phase 3A yang sama. |
| `internal/handlers/facility_handling.go` | Rute, sesi, pagination dan pemetaan error. |
| `internal/handlers/facility_handling_validation.go` | Validasi body JSON/multipart, field spesifik aksi, dan foto. |
| `internal/handlers/facility_handling_validation_test.go` | Uji versi awal, ID, dan field yang dilarang. |
| `scripts/check-phase1-migration.mjs` | Menjalankan suite Phase 4 dengan `SAMPIRA_TEST_PHASE4=1`. |
| `scripts/check-phase4-handling.mjs` | Upgrade fixture yang dipulihkan, RBAC, konkurensi, foto, rollback dan data historis. |
| `docs/openapi.json` | Sembilan operasi baru dan skema Phase 4. |
| `docs/progress/PHASE_04_BE.md` | Laporan backend dan hasil uji. |
| `docs/progress/PHASE_04_API_CONTRACT.md` | Kontrak bagi FE Phase 4B. |
| `docs/progress/PHASE_04_BE_INTEGRATION_NOTES.md` | Panduan migrasi, fixture dan integrasi lintas branch. |

## Hasil verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Baseline sebelum perubahan | PASS. Go test, vet, build, API Phase 1–3A dan Chromium pada fixture. |
| `go test -count=1 ./...`, `go vet ./...`, build server dan initializer | PASS. Termasuk unit test state machine dan parser. |
| Migrasi 003 dari restore fixture berisi data Phase 3A | PASS. Empat tabel dibuat. Eksekusi ulang lulus dan checksum tabel lama tetap sama. |
| Suite HTTP Phase 4A | PASS. RBAC, target nonaktif, dua Admin bersamaan, pengalihan bersamaan dengan update Petugas, versi basi, retry, foto dan privasi, review, koordinasi, rollback histori dan foto. |
| Pengujian constraint | PASS. Insert assignment aktif kedua sengaja memicu SQL 1062 pada indeks unik. |
| Regresi Phase 1–3A sesudah perubahan | PASS. Auth empat role, sesi dan CSRF, pickup, timbang, reward dan bukti privat, seluruh skenario laporan Phase 3A, serta Chromium. |
| OpenAPI | PASS. JSON dan referensi internal valid, sembilan path ditambah, path dan schema lama tetap identik. |
| Lintas branch FE Phase 3B | PASS. Chromium memakai view, aset dan suite dari arsip `FE` dengan biner BE Phase 4A pada fixture segar. Registrasi, pengajuan, foto, revisi, keputusan Admin, konflik, retry dan sesi lulus. |
| UI Phase 4B dan deployment | NOT TESTED. Menunggu implementasi UI dan lingkungan deployment. |

Temuan saat pengujian. Harness sementara pertama masih merujuk ke skrip Phase 4A dengan port default. Salinan runner diperbaiki agar harness dan skrip anak memakai port fixture yang sama. Kondisi fault-injection pada penulisan histori/foto dan assignment ganda menghasilkan error yang diharapkan tanpa perubahan data tersisa.

## Batasan dan kesiapan

- Koordinasi adalah pencatatan manual satu jalur. Sistem hanya merekam informasi yang dimasukkan Admin dan tidak menerima konfirmasi otomatis dari instansi.
- Satu foto dapat dilampirkan per event. Publikasi maksimum satu foto lapangan per penyelesaian, dipilih Admin. Pemilihan foto dan catatan publik perlu memperhatikan informasi sensitif karena foto yang diunggah disimpan dengan byte asli.
- Semua migrasi dan mutasi pengujian berjalan di fixture. Migrasi deployment, integrasi layar Phase 4B, dan pengujian lintas lingkungan mengikuti catatan integrasi.

## Checklist penerimaan

- [x] Admin dapat menugaskan laporan approved, mencegah tugas aktif ganda, dan mengalihkan dengan alasan.
- [x] Petugas melihat tugasnya, memulai asesmen, menyimpan kondisi, mencatat tindakan, mengunggah bukti dan menyerahkan hasil.
- [x] Admin dapat meminta koreksi dan memvalidasi hasil. Retry, konflik dan rollback telah diuji.
- [x] Pemilik dapat membaca progres, hasil publik dan foto terpilih. IDOR dan redaksi catatan privat teruji.
- [x] Koordinasi mencatat penerusan, bukti penerimaan, tindak lanjut dan verifikasi, terpisah dari status lapangan.
- [x] Migrasi additive, restore, re-run dan data Phase 1–3A teruji.
- [x] Kontrak, OpenAPI dan catatan integrasi tersedia.

**PASS WITH NOTES.** Backend siap diintegrasikan oleh Phase 4B berdasarkan kontrak yang diuji. Perubahan tersedia di working tree `BE`. Pengujian Phase 4B dan penerapan pada database utama berada pada tahap integrasi berikutnya.
