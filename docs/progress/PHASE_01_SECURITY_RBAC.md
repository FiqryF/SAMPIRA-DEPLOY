# SAMPIRA Phase 1 — Security Hardening, RBAC & Four-Role Foundation

## 1. Informasi Phase

- Tanggal pengerjaan 5 November 2026 (Asia/Bangkok)
- Branch `codex/phase-01-security-rbac`
- Commit awal `e648496f8c947bea8d21d145e9514ad6daa9a286`
- Working tree awal memuat perubahan lokal pada dua log server.

- Status COMPLETED untuk cakupan Phase 1

## 2. Ringkasan Eksekutif

Phase 1 mengunci registrasi publik ke role Masyarakat, memeriksa role terkini pada API dan portal, serta menyediakan portal dan prosedur bootstrap Administrator. Petugas mengambil penjemputan dari antrean tanpa persetujuan. Aplikasi mencatat berat estimasi dan aktual secara terpisah serta menahan pencairan sampai pembayaran dapat dikonfirmasi.

Migrasi teruji pada MariaDB terisolasi dan diterapkan ke skema lokal `ecorecycle` setelah pencadangan. Akun lama, riwayat, transaksi, dan foreign key dipertahankan. Server lokal pada port 8080 menjalankan biner Phase 1.

## 3. Hasil Audit Awal

| Area | Temuan sebelum perubahan |
|---|---|
| Registrasi dan login | Bcrypt sudah digunakan. Registrasi mempercayai role dari klien untuk `admin` dan `collector`. |
| Token | HMAC-SHA256 dan kedaluwarsa 24 jam sudah tersedia. Ada secret fallback yang diketahui publik. Header, query dan form menerima token. Otorisasi membaca role dari token tanpa melihat akun terkini. |
| RBAC dan privasi | Semua role bisa membaca antrean dengan `type=collector`. Detail tracking mengekspos alamat, telepon, foto dan riwayat tanpa pemeriksaan kepemilikan. Statistik juga terbuka untuk semua akun. Direktori unggahan dapat diakses publik. |
| Penjemputan | Klaim menggunakan update bersyarat. Validasi progres dan perubahan status memakai operasi terpisah. Update pengajuan dapat menulis riwayat walau klaim konkuren menang. |
| Pembayaran | API lama menyimpan transaksi sukses dan mengklaim transfer dengan nomor referensi acak tanpa mekanisme pembayaran. |
| Database | Inisialisasi lama memiliki enum tiga role, target pengumuman `collector`, akun demo bawaan, dan perintah reset. Relasi pickup mengacu pada ID akun, bukan role. |
| Frontend | Dashboard publik sebagai dokumen HTML, dengan guard berbasis localStorage. Beberapa nilai lintas pengguna diinterpolasi tanpa escaping. Admin lama merangkap fungsi penugasan, hub, payout, dan pengumuman. |

Acuan yang ditemukan meliputi README, OpenAPI, dokumentasi kategori/UI, dan skrip pengujian. Gap Analysis, BRD, dan Laporan Analisis yang disebutkan di brief tidak ditemukan di repository.


Metadata instance lokal mengonfirmasi enam foreign key, seluruh tabel aplikasi memakai InnoDB, dan enum lama cocok dengan baseline. `pickups.user_id`, `pickups.collector_id`, dan `portal_announcements.created_by` merujuk ke `users.id`. `pickups.category_id` merujuk ke `waste_categories.id`. `pickup_history.pickup_id` dan `transactions.pickup_id` merujuk ke `pickups.id`.

## 4. Skill yang Digunakan

| Skill yang ditemukan | Penggunaan |
|---|---|
| `brainstorming` | Memetakan keputusan bisnis yang sudah ditetapkan dalam brief ke komponen lama, titik perubahan, dan skenario pengujian. Instruksi implementasi langsung tanpa commit di brief menjadi acuan eksekusi. |
| `ponytail` | Mempertahankan Go, MySQL/MariaDB, HMAC, bcrypt dan Vanilla JS. Menggunakan transaksi dan pembatasan SQL yang ada. |
| `systematic-debugging` | Menelusuri sumber privilege escalation, kebocoran tracking, urutan transaksi, dan kegagalan awal harness Windows. |
| `verification-before-completion` | Menjalankan Go test, kompilasi, gofmt, vet, migrasi dan regresi HTTP, serta pemeriksaan frontend. |
| `frontend-design`, `design-taste-frontend`, `impeccable` | Tidak digunakan karena perubahan antarmuka berfokus pada sesi, label, dan kompatibilitas dengan gaya yang sudah ada. |
| `computer-use`, `pdf`, `documents`, `figma` | Tidak digunakan. Pemeriksaan endpoint memakai HTTP langsung dan dokumentasi proyek yang tersedia berbentuk Markdown/JSON. |

Katalog yang tersedia tidak memiliki skill khusus Go, MySQL/MariaDB, atau audit backend. Pekerjaan tersebut menggunakan inspeksi source, alat Go, dan MariaDB aktual.

## 5. Perubahan dan Penambahan Fitur

- Empat role terpusat, role database terkini pada setiap permintaan, token API di header Bearer, cookie portal HttpOnly, dan proteksi halaman di server.
- Pemeriksaan pemilik dan penugasan pada detail pelacakan dan foto. Antrean yang belum diklaim menyembunyikan identitas, kontak, alamat, deskripsi, dan foto. Tujuan pembayaran tersedia di profil pemilik.
- Klaim pickup atomik. Perubahan progres dan pengeditan pengajuan memeriksa status sambil mengunci baris dalam transaksi yang juga mencatat riwayat.
- Verifikasi berat aktual tetap tersedia. Endpoint payout mengembalikan `409` setelah validasi jika pembayaran belum dapat dikonfirmasi. Label status lama menyebut catatan historis. Portal Petugas tidak lagi menghitung komisi rekaan.
- CLI bootstrap dan halaman Administrator. Portal Admin lama mempertahankan pemantauan, penugasan opsional, verifikasi hub dan pengumuman untuk kompatibilitas.
- Installer khusus skema baru tanpa reset atau akun dan transaksi demo. Migrasi skema lama terpisah.

## 6. File yang Ditambahkan

| File | Fungsi | Keterangan |
|---|---|---|
| `internal/handlers/access.go` | Pemeriksaan sesi dan akses | Portal, foto, dan endpoint sesi Administrator. |
| `internal/services/auth_service_test.go` | Pengujian token | Secret lemah, token kedaluwarsa dan tanda tangan diubah. |
| `cmd/server/bootstrap.go` | Bootstrap internal | Password dari stdin dan bcrypt, akun baru melalui email unik. |
| `app/Views/administrator.html` | Portal Administrator | Halaman dasar dan logout. |
| `assets/js/portal-session.js` | Perilaku sesi frontend | Pembacaan sesi, logout dan escaping nilai dinamis. |
| `db_init/migrations/001_four_roles.sql` | Migrasi empat role | Memindahkan role akun dan target pengumuman. |
| `scripts/check-phase1-migration.mjs` | Pengujian integrasi | Skema lama dari commit awal, fixture, migrasi ulang, bootstrap, dan server uji. |
| `docs/phase-01-operations.md` | Panduan operasi | Matriks izin, instalasi, migrasi, pemulihan dan pengujian. |
| `docs/progress/PHASE_01_SECURITY_RBAC.md` | Laporan Phase 1 | Audit, implementasi dan bukti pengujian. |

## 7. File yang Dimodifikasi

| File | Perubahan | Alasan |
|---|---|---|
| `.env.example`, `.htaccess` | Secret contoh kosong dan akses jalur privat dibatasi | Memerlukan secret aktual dan mencegah jalur alternatif melalui Apache. |
| `cmd/server/main.go` | Registrasi rute, inisialisasi auth, limit body, pengalihan CLI | Menegakkan proteksi server dan batas request. |
| `db_init/db_init.go` | Installer skema baru, enum baru, seed kategori saja | Menghindari reset, akun demo, dan transaksi demo. |
| `internal/models/user.go`, `internal/services/auth_service.go`, `internal/middleware/auth_middleware.go` | Role terpusat, validasi token dan secret, respons API no-store | Mengurangi sumber otorisasi ganda dan paparan data sesi. |
| `internal/handlers/auth_handler.go`, `internal/repositories/user_repository.go` | Registrasi role tetap, login dan daftar Petugas | Mencegah privilege escalation dan mengganti filter role lama. |
| `internal/handlers/announcement_handler.go`, `internal/repositories/announcement_repository.go` | Target pengumuman `petugas`, alias input dan validasi | Mempertahankan pengumuman lama tanpa salah menyiarkan target. |
| `internal/handlers/pickup_handler.go`, `pickup_helpers.go`, `pickup_rows.go` | Izin daftar, privasi antrean, klaim dan pengeditan | Membatasi akses dan menghindari perubahan status konkuren yang tidak konsisten. |
| `internal/handlers/tracking_handler.go`, `tracking_validation.go`, `pickup_rules_test.go` | Detail sesuai cakupan, status dalam transaksi, pengujian role baru | Menjaga kepemilikan, penugasan dan integritas riwayat. |
| `internal/handlers/payout_handler.go` | Mempertahankan verifikasi dan menahan pencairan | Membutuhkan mekanisme pembayaran sebelum menyatakan transaksi sukses. |
| `app/Views/admin.html`, `auth.html`, `collector.html`, `dashboard.html`, `login.html`, `profile.html`, `register.html` | Tautan, label, sesi, verifikasi hub dan tampilan riwayat | Menjaga kompatibilitas portal empat role. |
| `assets/js/admin.js`, `auth.js`, `collector.js`, `dashboard.js` | Redirect, logout, escaping, privasi antrean, dan label payout | Menyesuaikan perilaku browser dengan otorisasi backend dan data aktual. |
| `scripts/check-api-regressions.mjs`, `check-admin-ui.cjs`, `check-ui-quality.cjs` | Pengujian API/portal, UI mock, pemeriksaan HTML | Mencakup alur role baru dan perilaku penjemputan lama. |
| `README.md`, `docs/openapi.json` | Panduan menjalankan dan kontrak API | Mendokumentasikan perubahan keamanan dan kompatibilitas. |

## 8. Perubahan Database

`users.role` berpindah dari `admin`, `collector`, `user` ke `admin`, `user`, `petugas`, `administrator`. `portal_announcements.target_role` juga memindahkan `collector` ke `petugas`. Migrasi `001_four_roles.sql` menggunakan perluasan enum, update transaksional, lalu pembatasan enum final. ID, foreign key, password hash, dan timestamp pengumuman dipertahankan.

Instance lokal `ecorecycle` berisi satu akun `admin`, satu `user`, dan satu `petugas` setelah migrasi. Snapshot baris, field akun di luar role, timestamp pengumuman, dan enam foreign key cocok sebelum dan sesudah. Cadangan pra-migrasi tersedia di `%LOCALAPPDATA%/SAMPIRA/backups/ecorecycle-pre-phase1-20261105-212705.sql`. Biner lokal dipasang di `%LOCALAPPDATA%/SAMPIRA/phase-01/` dan dijalankan dari root repository. Proses aplikasi lama dihentikan selama cutover.

Untuk skema lain, hentikan penulisan, simpan dump, jalankan migrasi pada database tujuan, dan bandingkan ID, jumlah baris serta relasi. Jika terjadi kegagalan parsial, perbaiki penyebabnya sebelum mengulang skrip. Pemulihan snapshot dilakukan ke skema terpisah sesuai [panduan operasi](../phase-01-operations.md).

## 9. Perubahan Autentikasi dan RBAC

Registrasi selalu memakai `user`. Token bertanda tangan HMAC-SHA256 berlaku 24 jam. Server membaca akun dan role dari database setelah memvalidasi tanda tangan dan expiry. Otorisasi menolak sesi gagal dengan `401`, serta role atau penugasan yang tidak memenuhi izin dengan `403`. Beberapa operasi berbasis kepemilikan, seperti edit pengajuan, menggunakan `404` untuk menyamarkan keberadaan data orang lain.

Permintaan API terautentikasi memakai header Bearer. Portal dan akses foto browser memakai cookie HttpOnly. Pemilik, Petugas yang ditugaskan, dan Admin yang menangani operasi lama dapat membaca detail pickup. Admin dan Administrator memiliki portal serta izin berbeda. Administrator mengakses endpoint pemeriksaan sesi khusus. Lihat [matriks izin](../phase-01-operations.md#role-dan-izin).

## 10. Perubahan Frontend

Login mengarahkan empat role ke `/dashboard`, `/petugas`, `/admin`, dan `/administrator`. Server memvalidasi sesi sebelum mengirim halaman. Logout menghapus cookie dan sesi browser. Alias `/collector` tetap menuju portal Petugas. Dashboard menampilkan estimasi dan berat aktual pada detail pelacakan. Nilai lintas pengguna di templat portal di-escape sebelum masuk ke markup. Landing dan gaya portal lama dipertahankan.

## 11. Hasil Pengujian

| Pengujian | Perintah atau skenario | Hasil | Keterangan |
|---|---|---|---|
| Go test | `go test -count=1 ./...` | PASS | Paket handler dan layanan lulus termasuk expiry, secret, transisi dan verifikasi payout. |
| Format dan analisis | `gofmt -l` pada file Go berubah, `go vet ./...` | PASS | Tidak ada file Go yang berubah tanpa format atau temuan vet. |
| Kompilasi | `go build` untuk `./cmd/server` dan `./db_init` | PASS | Biner server dan initializer terbentuk. |
| MariaDB terisolasi | `node scripts/check-phase1-migration.mjs` pada MariaDB 10.4.32 | PASS | Installer menolak skema yang sudah ada, migrasi dapat diulang, bootstrap menolak email ganda, data dan relasi bertahan. |
| Autentikasi dan RBAC | Skenario HTTP dalam `scripts/check-api-regressions.mjs` | PASS | Registrasi biasa dan empat input role, 401/403, login dan portal empat role, pencabutan hak dari token lama. |
| Regresi penjemputan | Skenario HTTP dalam `scripts/check-api-regressions.mjs` | PASS | Tracking lama, pengumuman lama, cakupan data/foto, update pengajuan, klaim dan progres serentak, estimasi vs aktual, serta payout tanpa transaksi baru. |
| Frontend | `node scripts/check-admin-ui.cjs`, `node scripts/check-ui-quality.cjs`, `node --check` | PASS | UI Admin melalui DOM/API mock, sembilan HTML, dan sintaks JavaScript. |
| API dan diff | Parsing OpenAPI dan pemeriksaan referensi internal, `git diff --check` | PASS | JSON valid, referensi ditemukan, dan tidak ada kesalahan whitespace. |
| Cutover lokal | Migrasi `ecorecycle` pada 3306 dan smoke HTTP pada 8080 | PASS | Data yang seharusnya tetap cocok. Login 200, portal anonim 303, API Administrator anonim 401. |
| QA visual browser dan MySQL selain MariaDB uji | Pemeriksaan manual lintas browser dan mesin MySQL lain | NOT TESTED | UI diperiksa melalui HTTP, skrip HTML, dan mock DOM. |
| Pemulihan dari dump lokal | Restore snapshot ke skema terpisah | NOT TESTED | Cadangan dibuat dan langkah pemulihan didokumentasikan. |

## 12. Bug dan Risiko Tersisa

- Registrasi lama memungkinkan akun istimewa dibuat publik. Peninjauan legitimasi akun dan rotasi password lama menjadi tugas operator. Akun Administrator lokal dapat dibuat dengan CLI setelah pemilik akun memilih kredensial.
- Penyimpanan token Bearer di browser dan logout bersifat client-side. Salinan bearer yang valid tetap berlaku hingga expiry atau rotasi secret, dengan izin sesuai role saat ini. Konfigurasi secret lokal yang sudah memenuhi syarat dipakai kembali.
- Pencairan membutuhkan mekanisme yang dapat mengonfirmasi pembayaran. Riwayat lama dipertahankan untuk rekonsiliasi bukti eksternal. Grafik lama yang menggunakan posisi perkiraan tidak dapat dipakai sebagai bukti lokasi.
- Pengujian lintas browser, restore dump, dan mesin MySQL lain belum dijalankan.

## 13. Checklist Acceptance Criteria

- [x] Registrasi publik aman dari privilege escalation.
- [x] Empat role dikenali dan diuji.
- [x] Migrasi aman dari `collector` ke `petugas`.
- [x] Izin Admin dan Administrator terpisah.
- [x] RBAC diterapkan pada backend.
- [x] Kepemilikan dan penugasan diperiksa.
- [x] Login, bootstrap, dan portal Administrator tersedia.
- [x] Token lama kehilangan akses yang dicabut.
- [x] Database lama dipertahankan dan diverifikasi.
- [x] Pengujian dasar dan regresi yang relevan dijalankan.
- [x] Dokumentasi diperbarui.
- [x] Laporan Phase 1 tersedia.

## 14. Dampak terhadap Phase Berikutnya

Phase 2 dapat memakai role dari database sebagai dasar otorisasi laporan fasilitas. Modul laporan perlu menegakkan kepemilikan laporan, verifikasi Admin sebelum penugasan, akses Petugas sesuai tugas, dan riwayat setiap perubahan status. Penerusan ke pemerintah memerlukan status dan bukti komunikasi yang terpisah.

## 15. Kesimpulan

**COMPLETED.** Kriteria Phase 1 terpenuhi. Pencairan berada dalam status ditahan sampai tersedia konfirmasi pembayaran. Bootstrap Administrator lokal, login, akses portal, dan logout telah diverifikasi. Rekonsiliasi transaksi historis tetap menjadi tindak lanjut operasional.

## Final Verification Addendum

5 November 2026. Finalisasi menambah pencabutan sesi server, proteksi CSRF, status akun nonaktif, pemisahan izin pickup dan CMS, serta QA Chromium nyata dan restore database. Server final berjalan di loopback lokal. Ketiga akun seed yang terkonfirmasi dinonaktifkan dengan persetujuan operator dan data historis tetap tersedia.

Pada pemeriksaan awal, status acceptance masih **PARTIALLY COMPLETED**. Go, API, RBAC, Chrome empat role, migrasi, dan dua restore telah lulus. Bootstrap dan login Administrator lulus pada instance terisolasi. Verifikasi akun Administrator pada database lokal utama menunggu kredensial dari operator.

Rincian bukti, risiko, dan checklist akhir tersedia di [laporan Final Verification](PHASE_01_FINAL_VERIFICATION.md).

**Pembaruan 5 November 2026 pukul 22.06 WIB.** Bootstrap, login, akses portal dan logout Administrator pada database lokal utama telah diverifikasi. Status akhir Phase 1 berubah menjadi **COMPLETED**.

**Verifikasi akses operator.** Setelah kata sandi Administrator lokal diganti atas permintaan operator, sesi lama dicabut. Login dengan kredensial baru lulus dan operator mengonfirmasi akses. Kredensial dikelola di luar dokumentasi proyek.
