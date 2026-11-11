# SAMPIRA Phase 7

Status **PASS WITH NOTES**. Implementasi stabilisasi dikerjakan pada branch `main`, baseline `eea06e9eff82307899a0e67808ae53376684a517`. Working tree bersih saat dimulai. Skill `ponytail` dipakai untuk mempertahankan alur existing dan membatasi perubahan pada penyebab bug. Verifikasi memakai MariaDB terisolasi dan akun sintetis.

## Temuan dan perbaikan

| Task | Bukti awal | Hasil |
| --- | --- | --- |
| P7-01 | Dua POST pickup dengan key dan payload sama menghasilkan dua ID serta HTTP 201. | Ledger persisten dengan unique key pengguna dan request, fingerprint SHA-256, serta snapshot respons awal. Pickup, histori, dan ledger berada dalam satu transaksi. Retry identik mendapat 200. Payload berbeda pada key yang sama mendapat 409. |
| P7-02 | Nama whitespace dan email tanpa domain diterima. Nama 300 karakter menghasilkan 500. | Nama ditrim dan dibatasi 100 karakter. Email diparse, dinormalisasi trim dan lowercase, serta dibatasi 100 karakter. Input invalid mendapat 400. Unicode valid diuji. |
| P7-03 | Lima registrasi email sama menghasilkan satu 201 dan empat 500. | Unique constraint tetap menjadi pengaman atomik. Error driver 1062 menjadi 409. Error database lain tetap 500 dengan pesan aman. SELECT sebelum INSERT dihapus dari alur registrasi. |
| P7-04 | Main sudah menyimpan koordinat dari integrasi sebelumnya. | Simpan, baca, revisi, nilai batas, lokasi kosong, record legacy, dan izin lokasi diuji kembali. Penyimpanan koordinat existing dipertahankan. |
| P7-05 | Audit terbaru menunjukkan 8080 sudah mengenali API fasilitas dan edukasi. Dua executable lokal masih berjalan. | Dua proses lama diidentifikasi dan dihentikan. Satu runtime main Phase 7 aktif di 8080 dengan database salinan. Aset dan OpenAPI yang disajikan cocok dengan working tree. |
| P7-06 | RBAC, sesi, dan CSRF memiliki suite existing. | Regresi empat peran, logout, pencabutan sesi, pembatasan pemilik, foto privat, dan penolakan mutasi lintas origin lulus. |
| P7-07 | State machine pickup dan fasilitas sudah memiliki proteksi transaksi serta versi. | Regresi klaim serentak, pengalihan, versi stale, review, dan koordinasi lulus. Retry pickup mengembalikan snapshot awal tanpa mengembalikan status operasional ke keadaan lama. |
| P7-08 | Upload existing memeriksa ekstensi, MIME dari isi, ukuran, nama acak, dan izin baca. | Penolakan konten palsu, ekstensi executable, dan foto melebihi 5 MB diuji. Kegagalan ledger membatalkan pickup dan histori serta membersihkan foto baru. Foto existing dipertahankan. |

Uji registrasi Unicode pada restore database legacy menemukan kolom akun yang masih memakai charset lama. Migrasi 007 memperbaiki dukungan teks pada kolom nama dan email. Checksum nilai akun sebelum dan setelah replay migrasi dibandingkan.

## Kontrak idempotency

Header `Idempotency-Key` memakai UUID v4 huruf kecil, tepat 36 karakter, satu nilai header. Cakupannya adalah satu pengguna pada operasi pembuatan pickup. Tabel `pickup_requests` menyimpan fingerprint dari field yang menentukan pengajuan, berat tervalidasi, kategori, pasangan koordinat, dan digest isi foto.

Respons awal disimpan sebagai snapshot yang berisi ID pickup, tracking, estimasi reward, biaya, dan status awal. Retry mengembalikan snapshot tersebut meskipun pickup kemudian diedit, dibatalkan, diklaim, atau diselesaikan. Keadaan terbaru tetap dibaca melalui endpoint detail.

Unique constraint melindungi request bersamaan. Transaksi yang kalah pada key yang sama di-rollback sebelum mengambil hasil pemenang. Jika fingerprint berbeda, server mengembalikan 409. Kegagalan penyimpanan membatalkan pickup, histori, serta ledger sehingga key dapat dicoba lagi.

Untuk kompatibilitas, klien API legacy yang menghilangkan header tetap diterima dengan perilaku sebelumnya. Perlindungan idempotency berlaku untuk request berkunci. Form Warga selalu mengirim key, mempertahankannya setelah kegagalan pengiriman, dan membuat key baru ketika isi form atau foto berubah. Setelah sukses, key form dilepas.

## Registrasi

- Nama memakai hasil trim dengan panjang 1–100 karakter Unicode.
- Email memakai hasil trim dan lowercase, alamat valid tanpa display name, domain dengan titik, dan maksimal 100 karakter.
- Kebijakan password existing dipertahankan, 6–72 byte. Password tidak ditrim atau diubah.
- Input invalid mendapat 400, email duplikat mendapat 409, dan kegagalan database selain duplicate mendapat 500.
- Login menormalisasi email dengan aturan yang sama. Halaman registrasi menambahkan batas input serta pesan konflik tanpa perubahan desain.

## File utama

| Kelompok | File |
| --- | --- |
| Pickup | `internal/handlers/pickup_handler.go`, `pickup_idempotency.go`, `pickup_upload.go` |
| Akun | `internal/handlers/auth_handler.go` |
| Startup dan migrasi | `cmd/server/main.go`, `db_init/migrations/facility_reports.go`, `006_pickup_idempotency.sql`, `007_registration_unicode.sql` |
| Frontend | `assets/js/dashboard.js`, `assets/js/auth.js`, dan versi aset pada view dashboard, login, serta register |
| Kontrak API | `docs/openapi.json` |
| Pengujian | `scripts/check-phase7.mjs`, `check-phase1-migration.mjs`, `check-phase5-frontend.mjs`, `check-phase6b-fixture.ps1` |

## Migrasi dan rollout

Migrasi 006 membuat tabel baru `pickup_requests` dengan primary key `(user_id, request_key)`, fingerprint biner, relasi pickup, dan snapshot JSON. Record pickup lama tetap dapat dibaca tanpa ledger.

Migrasi 007 mengubah charset kolom `users.name` dan `users.email` menjadi `utf8mb4_unicode_ci`, mempertahankan batas 100 karakter dan unique index email. Startup memeriksa kolasi sebelum menjalankan ALTER. Pada data riil, backup dan uji restore perlu mencakup kemungkinan email lama yang bertabrakan setelah konversi kolasi. MariaDB akan menolak benturan unique dan menghentikan startup agar akun dapat direkonsiliasi.

Migrasi dijalankan pada database pengujian dan salinan runtime Phase 7. Database sumber `ecorecycle` hanya dibaca untuk snapshot. File `.env` sumber dipertahankan. Snapshot, kunci runtime, serta executable lokal berada di workspace visualisasi di luar repository.

## Verifikasi

| Pemeriksaan | Hasil aktual |
| --- | --- |
| `go test ./...` dan `go vet ./...` | PASS |
| Syntax JavaScript yang diubah dan `git diff --check` | PASS |
| API Phase 1–6 | PASS pada segmen regresi terisolasi, termasuk migrasi ulang, checksum legacy, empat role, CSRF, ownership, reward, koordinat, fasilitas, assignment, review, dan edukasi |
| API Phase 7 | PASS. Retry identik, lima request serentak, payload berbeda, scope pengguna, format key, klien legacy, rollback, file cleanup, snapshot setelah pembatalan, dan replay migrasi |
| Registrasi | PASS. Valid, kosong, whitespace, panjang berlebih, malformed email, Unicode, batas password, lima email serentak, dan kegagalan SQL non-duplicate |
| Browser main | PASS. Login/logout empat peran, pengajuan pickup dan fasilitas, koordinat, penugasan, privasi, profil, CMS, pembaca artikel, dan viewport responsif |
| Respons pickup hilang | PASS. Browser menerima kegagalan jaringan setelah server menyimpan. Retry memakai key yang sama, hasil 201 lalu 200, dan ID identik |
| Lifecycle edukasi | PASS. Edit draf, publish, archive, serta penolakan edit/publish ulang untuk status terminal mengikuti aturan existing |
| Runtime 8080 | PASS. Login/register 200, edukasi publik 200, endpoint terlindungi 401 tanpa sesi, input registrasi invalid 400, OpenAPI 200 |

Runner `scripts/check-phase6b-fixture.ps1` kini membangun Backend dan mengambil Frontend dari working tree main. Mode `-SkipBrowser` menjalankan suite API Phase 1–7. Mode default menjalankan suite browser dengan dataset terpisah agar data pagination tes API tidak mencemari asumsi browser. Keduanya memakai executable dari perubahan lokal yang sedang diuji.

Beberapa percobaan regresi awal gagal akibat asumsi fixture, yaitu posisi histori pada halaman pertama dan jumlah laporan Admin setelah tes API menambah data. Pemisahan dataset API/browser menyelesaikan penyebab itu. Suite browser akhir selesai dengan exit code 0.

## Runtime lokal

URL aktif adalah `http://localhost:8080`. Proses terakhir saat verifikasi adalah PID 15732, executable `SAMPIRA-Phase7/server.exe`, dibangun dari main `eea06e9` beserta perubahan Phase 7 di working tree.

Database runtime adalah `127.0.0.1:24369/sampira_phase7_local`, salinan terkini database lokal yang berisi 5 akun, 6 pickup, 1 laporan fasilitas, dan 1 artikel saat disalin. Foto lama ikut disalin ke runtime. Migrasi 006 dan 007 sudah diverifikasi pada salinan ini. Perubahan data melalui runtime ini masuk ke database salinan.

PID 4236 dan 4852 merupakan dua executable SAMPIRA lama yang telah diperiksa identitasnya sebelum dihentikan. Listener aplikasi yang tersisa adalah 127.0.0.1 port 8080. Hash HTTP untuk modul autentikasi, dashboard, dan OpenAPI cocok dengan file main.

Launcher berada di `C:\Users\FIQRY FIRMANSYAH\.codex\visualizations\2026\11\05\01a1ad5d-f300-7af2-8431-4d188d8eeb81\SAMPIRA-Phase7\phase7-local.ps1`. Perintah Status, Stop, dan Start sudah diuji menggunakan Windows PowerShell bawaan. Stop memeriksa PID, executable, waktu mulai, dan kepemilikan port. Start membangun ulang source main, memeriksa junction, dan memakai konfigurasi database salinan.

```powershell
$phase7 = 'C:\Users\FIQRY FIRMANSYAH\.codex\visualizations\2026\11\05\01a1ad5d-f300-7af2-8431-4d188d8eeb81\SAMPIRA-Phase7\phase7-local.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $phase7 Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $phase7 Stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $phase7 Start -Port 8080
```

## Catatan tersisa

- Klien legacy tanpa key tetap dapat membuat pengajuan baru pada setiap POST. Klien yang membutuhkan retry aman harus mengirim key, seperti form Warga yang diperbarui.
- Rollout migrasi pada database sumber dan deployment produksi belum dilakukan. Runtime yang tersedia memakai database salinan.
- Urutan bulan pada grafik kontribusi, pembatalan request pencarian alamat, serta aturan checker UI lama dari audit sebelumnya berada di luar perbaikan Phase 7.
- Provider rute eksternal diuji lewat simulasi existing. Redesain serta penyatuan Leaflet masuk Phase 8.
- Pemindaian SonarQube server dan pengujian beban produksi belum dijalankan.

Semua acceptance criteria fungsional Phase 7 lulus pada skenario yang diuji. Status PASS WITH NOTES mempertahankan catatan kompatibilitas klien legacy dan rollout database sumber.
