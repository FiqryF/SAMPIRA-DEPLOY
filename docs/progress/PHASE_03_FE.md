# SAMPIRA Phase 3B — Frontend Laporan Fasilitas

## Identitas dan baseline

| Item | Nilai |
|---|---|
| Branch kerja | `FE` |
| Commit awal | `e648496` |
| Baseline Phase 1–2 | `ae276ef`, fast-forward dari `origin/develop` |
| Backend fixture | `77e19da25de4162b306cf4be9250af184c5b00e6` dari `origin/BE` |
| Status | **PASS WITH NOTES**. Workflow lulus pada fixture BE dan FE terisolasi. |

Tree `FE` bersih saat sinkronisasi. Setelah fast-forward, tree identik dengan `origin/develop`, termasuk implementasi dan audit kumulatif Phase 1–2. Baseline API, Chromium dan pemeriksaan statis dijalankan sebelum source diubah. [Audit Phase 1–2](SAMPIRA_PHASE_01_02_COMPREHENSIVE_REPORT.md)

Skill **frontend-design** digunakan untuk mengikuti palet hijau, tipografi, kartu, dan navigasi portal. Daftar memakai kartu responsif dan histori memakai garis status dengan label teks. Skill **ponytail** digunakan untuk berbagi komponen antardua role, memakai `dialog` native dan menjalankan pengujian melalui harness yang sudah ada. Pemeriksaan aksesibilitas mencakup label, fokus keyboard, dialog, dan layout mobile.

## Cakupan UI

- Portal User `/dashboard` menambahkan satu menu **Lapor Fasilitas** pada sidebar existing. Di dalamnya tersedia daftar milik sendiri, filter status dan kategori, pengajuan, detail, histori, foto, dan revisi saat status meminta perbaikan.
- Portal Admin `/admin` menampilkan antrean laporan dengan filter awal **Menunggu Verifikasi**. Detail menampilkan ID pelapor dari API, kondisi dan lokasi fasilitas, foto, histori, serta form keputusan untuk status `pending`.
- Keputusan Admin tersedia sebagai setujui, minta revisi, atau tolak. Dialog native memberikan konfirmasi sebelum permintaan dikirim. Label Disetujui menjelaskan bahwa verifikasi selesai dan tindak lanjut menunggu tahap berikutnya.
- Halaman Petugas dan Administrator memakai navigasi Phase 1–2. Otorisasi rute dan kepemilikan tetap ditegakkan API.

## File yang berubah

| File | Fungsi |
|---|---|
| `app/Views/dashboard.html` | Tombol sidebar, mount laporan User, dan tautan aset. |
| `app/Views/admin.html` | Header portal, logout existing, dan mount antrean Admin. |
| `assets/css/facility-reports.css` | Kartu responsif, status, form, histori, dialog dan fokus. |
| `assets/js/facility-reports.js` | Fetch same-origin, pergantian panel, filter, cursor, retry, revisi, dan verifikasi. |
| `assets/js/facility-report-ui.js` | Markup bersama serta renderer kartu, detail, dan histori. |
| `assets/js/facility-report-form.js` | Form User, validasi, pratinjau dan FormData. |
| `scripts/check-ui-quality.cjs` | Memasukkan stylesheet laporan dalam pemeriksaan statis. |
| `scripts/check-phase1-browser.mjs` | Menjalankan pengujian Phase 3B secara opsional dalam fixture Chromium. |
| `scripts/check-phase3-frontend.mjs` | Skenario User/Admin melalui Chromium dan API nyata. |
| `docs/progress/PHASE_03_FE.md` | Laporan pekerjaan dan hasil. |
| `docs/progress/PHASE_03_FE_INTEGRATION_NOTES.md` | Prasyarat dan checklist integrasi. |

## API dan perilaku data

Tujuh operasi berada di `/api/ecorecycle/facility-reports`. Koleksi menerima GET untuk daftar dan POST untuk pengajuan. GET detail, PUT revisi, GET histori, dan GET foto memakai ID laporan. Admin memanggil POST verifikasi. Daftar memakai `before_id`, histori memakai `before_version`, dan filter baru kembali ke halaman pertama. Urutan permintaan mencegah respons lama menimpa tampilan terbaru.

Form memvalidasi panjang judul, deskripsi, alamat, koordinat berpasangan dengan presisi hingga enam desimal, serta satu foto JPEG/PNG opsional hingga 5 MiB dan 16 megapiksel. Pratinjau memakai object URL lokal yang dicabut saat diganti atau direset. Lokasi dimasukkan manual karena picker yang tersedia pada portal dipakai untuk pelacakan pickup.

Pengajuan memiliki satu UUID v4. Selama request berlangsung, kontrol pengiriman dinonaktifkan. Pada gangguan jaringan, timeout, atau 5xx, formulir menyimpan snapshot di memori dan retry memakai key dan body yang sama. Pesan sukses dan nomor tracking berasal dari respons API. Snapshot berlaku selama halaman terbuka. Jika halaman dimuat ulang, daftar laporan dapat dipakai untuk memeriksa hasil pengajuan sebelumnya.

Revisi memakai `version` dari detail, mengirim field lengkap, serta mempertahankan foto aktif jika tidak ada pengganti. Verifikasi memakai `version` dan alasan wajib untuk revisi atau penolakan. HTTP 409 memuat ulang detail serta histori. Daftar diperbarui saat kembali dari detail.

## Error, keamanan dan aksesibilitas

- UI mempunyai status memuat, kosong, gagal, sukses, dan pengiriman terkunci. HTTP 400, 403, 404, 413, 415 dan 5xx mendapat pesan sesuai konteks. HTTP 401 menampilkan pemberitahuan dan menuju `/login`.
- API content dibuat sebagai DOM text. URL foto hanya dipasang jika cocok persis dengan rute same-origin yang diharapkan. Foto yang gagal dimuat mendapat pesan pengganti.
- Cookie sesi HttpOnly dipakai melalui Fetch same-origin. Client tidak membaca cookie atau menyimpan kredensial.
- Form memakai label dan validasi native, daftar memakai elemen list, dialog memberi fokus awal ke Batal, dan tombol utama memiliki target sentuh minimal 44 px. Waktu ditampilkan dengan lokal Indonesia dan zona Asia/Jakarta.

## Hasil pengujian

| Pemeriksaan | Hasil |
|---|---|
| Baseline setelah fast-forward | PASS. Migrasi fixture Phase 1–2, regresi API, Chromium empat role, pemeriksaan UI dan CMS. |
| Pemeriksaan statis setelah perubahan | PASS. Sintaks JavaScript, stylesheet, sembilan view, dan CMS Administrator. |
| Regresi dengan aset FE dan server BE fixture | PASS. Login, registrasi, sesi, empat portal, pickup, tracking, timbang, ledger, reward dan CMS. |
| Chromium Phase 3B pada 1280, 390 dan 320 px | PASS. Navigasi keyboard, label, validasi, pratinjau dan foto privat, daftar dan histori dengan pagination, filter, revisi, persetujuan, permintaan revisi, serta penolakan. Dialog tetap di dalam viewport. |
| Retry, konflik dan sesi | PASS. Respons POST nyata 201 disembunyikan dari UI untuk mensimulasikan gangguan. Retry mengirim key yang sama dan mendapat 200 untuk laporan yang sama. Konflik revisi User serta verifikasi Admin menghasilkan 409, lalu detail dan histori diperbarui. Sesi tercabut diarahkan ke login. |
| Pemeriksaan runtime dan visual | PASS. Tidak terdeteksi exception JavaScript atau error konsol pada pengujian. Form User dan dialog Admin ditinjau melalui tangkapan layar Chromium mobile. |

Pengujian memakai salinan biner backend dari `origin/BE`, view dan aset dari working tree FE, serta MariaDB fixture. Port loopback alternatif digunakan karena port fixture standar sedang dipakai. Simulasi respons hilang dilakukan di browser setelah permintaan nyata mencapai server.

## Temuan dan keterbatasan

- Pengujian registrasi awal menunggu navigasi sebelum menyelesaikan dialog sukses dari halaman existing. Harness kini mengonfirmasi dialog itu sebelum menunggu login.
- Pengujian keyboard awal mengirim Enter tanpa payload karakter. Harness memeriksa fokus sidebar dan mengirim event lengkap sebelum memeriksa aktivasi.
- Runtime dari source `FE` sendiri belum menyediakan endpoint Phase 3A. Integrasi cabang dan validasi environment deployment berada pada Phase 3C.
- Pengujian aksesibilitas memakai keyboard, inspeksi DOM, dan viewport Chromium. Pengujian pembaca layar dan lintas browser berada di luar hasil ini.

## Checklist penerimaan

- [x] Navigasi laporan User dan antrean Admin tersedia.
- [x] Form pengajuan, pratinjau, daftar, detail, histori, dan revisi mengikuti kontrak.
- [x] Verifikasi Admin mengikuti status, alasan, dan versi dari API.
- [x] Retry mempertahankan UUID dan mengunci pengiriman selama request.
- [x] Penanganan 409 memuat kondisi terbaru.
- [x] Regresi penting Phase 1–2 lulus pada fixture.
- [x] Verifikasi desktop, mobile, dan workflow Phase 3B pada fixture BE dan FE terisolasi.
- [x] Laporan dan catatan integrasi tersedia.

## Serah terima

**PASS WITH NOTES.** UI Phase 3B siap untuk Phase 3C. Pengujian end-to-end memakai API Phase 3A nyata dalam fixture terisolasi. Validasi ulang diperlukan pada build hasil integrasi dan environment deployment. [Catatan integrasi](PHASE_03_FE_INTEGRATION_NOTES.md)
