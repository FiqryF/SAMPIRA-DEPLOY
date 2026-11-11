# SAMPIRA Phase 2 — Pickup Workflow

## 1. Informasi Phase

| Item | Nilai |
|---|---|
| Proyek | SAMPIRA |
| Tanggal | 5 November 2026, Asia/Bangkok |
| Branch | `codex/phase-02-pickup-workflow` |
| Commit dasar | `e648496f8c947bea8d21d145e9514ad6daa9a286`, ditambah perubahan Phase 1 di working tree |
| Status | **COMPLETED** untuk cakupan Phase 2 |

## 2. Ringkasan Eksekutif

Pickup berjalan dari pengajuan hingga timbang aktual dan penutupan operasional. Kewajiban reward dibuat pada transaksi database yang sama dengan hasil timbang. Pembayaran eksternal baru tercatat setelah Administrator memasukkan nominal yang cocok, referensi unik, bukti gambar, dan konfirmasi verifikasi. Regresi Phase 1, alur API, dan UI Chromium lulus pada fixture terisolasi. Runtime Phase 2 berjalan pada loopback lokal.

## 3. Skill yang Digunakan

| Skill | Pemakaian |
|---|---|
| `brainstorming` | Memetakan alur yang sudah ada, batas Phase 2, dan keputusan status operasional serta pembayaran. |
| `ponytail` | Menggunakan Go, transaksi MariaDB, portal dan harness Chromium yang tersedia. |
| `systematic-debugging` | Menelusuri kegagalan estimasi browser ke kategori default yang belum dimasukkan ke fixture. Memperbaiki semantik output dan label berdasarkan pemeriksaan HTML. |
| `verification-before-completion` | Menjalankan Go, MariaDB, Chromium, restore, smoke test, dan pemeriksaan dokumentasi. |

Katalog tidak menyediakan skill khusus Go atau MariaDB. Skill redesign frontend tidak diperlukan karena halaman memakai struktur dan gaya Phase 1.
## 4. Audit Kondisi Awal

- Phase 1 berada di working tree dan ikut terbawa ke branch baru. Commit dasar tetap e648496.
- Pengajuan langsung masuk antrean. Klaim dan transisi Petugas sudah atomik, data pribadi dibatasi menurut kepemilikan, dan Admin tidak menangani pickup.
- Verifikasi berat aktual sudah sekali tulis, tetapi pickup berhenti pada arrived. Endpoint payout lama hanya mengembalikan konflik. Belum ada kewajiban pembayaran yang tersimpan.
- Histori menyimpan waktu, lokasi, dan catatan tanpa identitas aktor. Data lama yang pernah ditandai selesai memerlukan rekonsiliasi.
- Validasi unggahan memeriksa ekstensi. Validasi kontak dan alamat jauh lebih kuat di frontend daripada di API. Dashboard mencampur nilai estimasi dan reward historis.

## 5. Perubahan dan Penambahan Fitur

- Backend memvalidasi kontak Indonesia, alamat, deskripsi, kategori, berat positif hingga dua desimal, serta foto JPG, PNG, atau WEBP maksimal 5 MiB dengan pencocokan tipe berkas.
- Riwayat baru mencatat aktor. Pengajuan, edit, batal, klaim, progres dan hasil timbang menulis histori dalam transaksi masing-masing.
- Penimbangan aktual hanya oleh Petugas yang ditugaskan saat pickup tiba. Hasil timbang bersifat sekali tulis dan menutup pickup bersama kewajiban reward.
- Portal Administrator menampilkan antrean kewajiban dan menyediakan form pencatatan serta unduh bukti pembayaran. Portal User menampilkan nilai, status, dan referensi yang diizinkan.

## 6. File Ditambahkan

| File | Fungsi | Alasan |
|---|---|---|
| `internal/repositories/pickup_workflow_schema.go` | Migrasi startup aditif | Menambah aktor riwayat dan ledger kewajiban. |
| `internal/handlers/reward_payment_handler.go` | Pencatatan, daftar, dan unduh bukti | Membatasi akses ke Administrator dan mencegah pembayaran ganda. |
| `assets/js/reward-payments.js` | Form pembayaran dan daftar kewajiban | Mengintegrasikan portal Administrator dengan API. |
| `docs/progress/PHASE_02_PICKUP_WORKFLOW.md` | Laporan implementasi dan bukti | Menyimpan hasil audit, pengujian, dan prosedur operasi. |

## 7. File Dimodifikasi

| File | Perubahan | Alasan |
|---|---|---|
| `cmd/server/main.go` | Registrasi API dan migrasi startup | Menyediakan endpoint Phase 2 setelah skema siap. |
| `internal/handlers/pickup_handler.go`, `pickup_helpers.go`, `pickup_upload.go` | Validasi, unggahan, tracking acak, aktor histori | Menjaga input dan integritas data. |
| `internal/handlers/payout_handler.go`, `payout_helpers.go`, `pickup_rules_test.go` | Finalisasi atomik dan pembulatan reward | Menghitung kewajiban dari berat dan tarif. |
| `internal/handlers/pickup_rows.go`, `tracking_handler.go` | Metadata ledger, aktor dan agregat | Menampilkan data aktual tanpa menganggap histori legacy sebagai pembayaran terkonfirmasi. |
| `app/Views/dashboard.html`, `collector.html`, `administrator.html` dan `assets/js/dashboard.js`, `collector.js` | Estimasi, pelacakan reward, timbang dan form Administrator | Integrasi UI dengan API. |
| `scripts/check-api-regressions.mjs`, `check-phase1-browser.mjs`, `check-phase1-migration.mjs` | Regresi dan fixture Phase 2 | Menguji alur, akses, konkurensi dan bukti tanpa transaksi riil. |
| `README.md`, `docs/openapi.json`, `docs/phase-01-operations.md` | Kontrak dan tautan versi terbaru | Menjaga panduan Phase 1 dan Phase 2 dapat ditelusuri. |

## 8. Perubahan Database

Startup menambah `pickup_history.actor_id` sebagai foreign key nullable. Riwayat lama mempertahankan nilai kolom sebelumnya. Tabel InnoDB `pickup_rewards` memakai `pickup_id` sebagai primary key dan foreign key, kolom `DECIMAL(15,2)`, status `not_due`, `pending`, atau `paid`, referensi unik, SHA-256 bukti unik, bukti biner, serta aktor dan waktu pembayaran. Constraint membatasi nominal sesuai status dan mewajibkan metadata untuk `paid`. Tabel transaksi lama dipertahankan.

Pada 5 November 2026, cadangan lokal sebelum migrasi dibuat sebagai `ecorecycle-pre-phase2-20261105-223051.sql` di direktori backup privat SAMPIRA. Restore terisolasi cocok untuk tujuh tabel, empat akun, tiga pickup, delapan histori, satu transaksi, dan satu pengumuman. Setelah cutover, fingerprint data historis cocok, kolom aktor tersedia, dan ledger baru kosong.

Untuk menerapkan pada skema lain, hentikan penulisan, buat dan uji backup, lalu jalankan server dari biner terbaru. Akun migrasi memerlukan izin CREATE dan ALTER. Untuk pemulihan data, pulihkan snapshot ke instance terpisah dan verifikasi checksum serta relasi. Jika Phase 2 sudah menerima penulisan, rekonsiliasi perubahan baru sebelum cutover agar kewajiban dan bukti baru tetap tersedia.

## 9. Alur Penjemputan Final

`pending → pickup → transit → arrived → completed`. User hanya mengedit atau membatalkan miliknya selama `pending`. Petugas mengklaim untuk dirinya secara atomik dan hanya memperbarui tugas yang ditugaskan. Setelah `arrived`, pencatatan berat aktual menutup pickup. Pencairan berlangsung terpisah dan tidak menghambat klaim atau penyelesaian pickup.

## 10. Alur Reward dan Transaksi

Estimasi memakai tarif kategori di server. Berat aktual menghasilkan reward bruto dan biaya yang dibulatkan ke dua desimal. Nominal bersih adalah selisih dengan batas bawah nol. Nominal positif menjadi kewajiban `pending`, sedangkan nominal nol menjadi `not_due`.

Untuk mencatat pembayaran, Administrator mencocokkan transfer eksternal, penerima, nominal, dan bukti melalui kanal yang berwenang. Form mengharuskan konfirmasi operator, nominal persis, referensi dan gambar bukti. Satu update bersyarat menyimpan status `paid`, bukti dan aktor. Aplikasi mengaudit pencatatan operator. Verifikasi langsung dengan penyedia pembayaran berada di luar cakupan. User melihat status dan referensi miliknya. Akses bukti dibatasi kepada Administrator. Hasil historis tanpa ledger baru tetap memerlukan rekonsiliasi.

## 11. Perubahan Dashboard

- User melihat estimasi dari API, berat estimasi dan aktual, reward final, status pembayaran dan riwayat yang dapat dibuka untuk pelacakan.
- Petugas melihat antrean dengan data pribadi dibatasi, detail tugas yang ditugaskan, tombol timbang setelah tiba, dan riwayat penyelesaian.
- Administrator melihat daftar pending dan paid serta form dan tautan bukti. Portal Admin tetap terpisah untuk fase laporan fasilitas.

## 12. Keamanan dan RBAC

Role dan status akun tetap diverifikasi pada sesi aktif. Klaim, pembaruan status dan timbang dilindungi oleh kepemilikan tugas. Endpoint payout lama mempertahankan path, dengan 409 untuk permintaan legacy tanpa bukti. Akses payout dan bukti memerlukan Administrator. Aturan CSRF Phase 1 tetap berlaku. Primary key dan update bersyarat mencegah pencatatan ganda dalam satu pickup, dan indeks unik menolak referensi atau berkas bukti yang sama untuk pickup lain.

## 13. Hasil Pengujian

| Pengujian | Perintah atau skenario | Hasil | Bukti |
|---|---|---|---|
| Go | `go test -count=1 ./...`, `go vet ./...`, gofmt, build server dan initializer | PASS | Semua paket yang diuji lulus. |
| API dan database | `node scripts/check-phase1-migration.mjs` dengan MariaDB terisolasi | PASS | Registrasi, sesi, CSRF, migrasi legacy, pemilik, validasi, klaim dan timbang serentak, nominal nol, pending, paid, dan duplikasi bukti/ref. |
| Browser nyata | Chromium desktop dan mobile melalui `check-phase1-browser.mjs` | PASS | Empat role, riwayat User, timbang Petugas, dan form bukti Administrator. Nol error jaringan eksternal pada run akhir. |
| UI dan JavaScript | `check-ui-quality.cjs`, `check-admin-ui.cjs`, `node --check` | PASS | Sembilan halaman dan skrip terkait. |
| Restore | `check-phase1-restore.mjs` | PASS | Snapshot pra-Phase 2 cocok dengan sumber, nol orphan. |
| Server lokal | Migrasi dan smoke test 8080 | PASS | Login 200, API reward anonim 401, fingerprint historis cocok, ledger baru kosong. |
| Transfer dana nyata | Pembayaran melalui penyedia eksternal | NOT TESTED | Suite memakai fixture terisolasi. Tidak ada transfer riil atau pencatatan pembayaran di database lokal aktif. |

## 14. Bug dan Risiko Tersisa

| Severity | Dampak | Tindak lanjut |
|---|---|---|
| Sedang | Bukti manual bergantung pada pemeriksaan operator. | Cocokkan rekening tujuan dan bukti lewat kanal tepercaya sebelum pencatatan. |
| Sedang | Catatan legacy tanpa bukti dapat memiliki penanda historis sukses. | Rekonsiliasi sebelum dipakai dalam laporan finansial. |
| Rendah | Akun seed User dan Petugas lokal masih nonaktif sesuai Phase 1. | Provision akun yang sah untuk penggunaan operasional. |

## 15. Checklist Acceptance Criteria

- [x] Pengajuan User tanpa persetujuan dan antrean Petugas.
- [x] Klaim atomik, satu pemenang, status konsisten, dan audit aktor.
- [x] Berat estimasi terpisah dari aktual dan reward berasal dari berat aktual.
- [x] Kewajiban dan status pembayaran tercatat tanpa klaim transfer otomatis.
- [x] Referensi/bukti wajib serta duplikasi transaksi dicegah.
- [x] Riwayat dan reward terlihat bagi pemilik. Role lain dibatasi.
- [x] Dashboard User dan Petugas terintegrasi. Kompatibilitas legacy yang relevan dipertahankan.
- [x] End-to-end yang tersedia lulus. Dokumentasi dan laporan tersedia.

## 16. Dampak ke Phase Berikutnya

Phase 3 dapat memakai fondasi otorisasi, histori aktor, dan transaksi atomik yang sudah diuji. Penugasan laporan fasilitas tetap dipisahkan dari klaim pickup. Data finansial historis memerlukan rekonsiliasi sebelum dipakai sebagai pembayaran terverifikasi.

## 17. Kesimpulan

**COMPLETED.** Implementasi, pengujian terisolasi, backup/restore, dan penerapan lokal lulus. Kewajiban reward positif menunggu pembayaran eksternal sampai Administrator mencatat bukti yang sudah diverifikasi.

## Catatan Audit Kumulatif

Pada 5 November 2026, regresi dan integritas data diperiksa ulang. Perbaikan parser body, snapshot tracking, klasifikasi histori dan metrik terbaru dicatat dalam [laporan audit Phase 1–2](SAMPIRA_PHASE_01_02_COMPREHENSIVE_REPORT.md).
