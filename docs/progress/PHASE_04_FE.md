# SAMPIRA Phase 4B — Frontend Penanganan Fasilitas

## Identitas dan baseline

| Item | Nilai |
|---|---|
| Branch dan commit baseline | `FE` pada `19db878`, working tree bersih sebelum perubahan |
| Backend fixture | `BE` pada `722f041fd2d074bd0889cf49275e7d7cceb4794d` |
| Environment | Windows, Chromium, Node.js, MariaDB XAMPP 10.4.32 terisolasi |
| Skill | **frontend-design** untuk konsistensi portal dan hierarki status. **ponytail** untuk memanfaatkan kembali navigasi, helper fetch, desain kartu, dialog native, dan fixture. |

Baseline Phase 1–3B lulus sebelum perubahan. Audit mencakup README, desain dan dokumentasi portal, kontrak Phase 4A, form Phase 3B, sesi, dialog, status, dan navigasi Petugas. Pilihan visual mengikuti palet dan tipografi portal. Ringkasan penanganan menempatkan verifikasi, penanganan, penugasan dan koordinasi pada empat bidang berlabel agar tiap status bisa dibaca secara terpisah.

## Cakupan dan navigasi

- **Admin `/admin`** memilih Verifikasi Laporan atau Penanganan Laporan. Antrean awal menampilkan `approved` yang menunggu penugasan. Filter status dan kategori mendukung monitoring lanjutan. Detail menampilkan lokasi, Petugas, histori, bukti privat, review, dan koordinasi.
- **Petugas `/petugas`** mengakses Tugas Fasilitas dari sidebar desktop atau navigasi bawah mobile. Daftar tugas fasilitas memakai endpoint sendiri. Detail menunjukkan alamat dan koordinat bila tersedia, lalu tindakan sesuai status. Tampilan pickup existing tetap tersedia melalui navigasi awal.
- **User `/dashboard`** melihat Progres Penanganan Fasilitas di detail laporan Phase 3B. Laporan sebelum approved mendapat keterangan bahwa tindak lanjut belum tersedia. Pemilik dapat membaca progres dan histori publik, ringkasan tervalidasi, serta foto yang dipilih Admin.
- **Administrator** menggunakan portal existing. API Phase 4 tetap menentukan izin dan kepemilikan bagi semua role.

## Endpoint dan keputusan implementasi

Base URL `/api/ecorecycle/facility-reports`. Lima GET melayani daftar, Petugas aktif, ringkasan, histori dan foto. Empat POST melayani assignment, activity, review dan coordination. Pemetaan lengkap ada di catatan integrasi. [Catatan integrasi](PHASE_04_FE_INTEGRATION_NOTES.md)

- Assignment memakai daftar Petugas aktif dari API. Pengalihan mengecualikan Petugas saat ini, meminta alasan internal, dan menjelaskan bahwa asesmen akan dimulai ulang. Perubahan dikonfirmasi dalam dialog. Setelah API berhasil, detail, histori dan daftar dimuat ulang.
- Petugas memulai asesmen tanpa foto, mencatat kondisi dan asesmen, mencatat tindakan, lalu menyerahkan hasil. Pada status koreksi, alasan internal Admin tampil di histori Petugas. Petugas harus mencatat tindakan koreksi sebelum dapat menyerahkan ulang.
- Review Admin tersedia saat hasil diserahkan. Revisi membutuhkan alasan internal. Penyelesaian membutuhkan ringkasan publik dan dapat menyertakan satu foto lapangan dari assignment yang mengirim hasil.
- Koordinasi memandu langkah yang sah dari status saat ini. Form penerusan meminta instansi, saluran dan waktu lokal yang dikonversi ke RFC 3339. Field tersebut dikeluarkan dari payload tahap berikutnya. Konfirmasi penerimaan dan verifikasi eksternal meminta referensi atau foto. Catatan koordinasi ditampilkan terpisah dari status lapangan.
- Timeline memakai cursor `before_version`. Daftar dan pilihan Petugas memakai `before_id`. Filter baru mengosongkan cursor. Respons daftar/detail lama diabaikan jika pengguna sudah memilih tampilan lain.
- User hanya melihat field publik yang dirender dengan DOM text. Foto User dibangun dari `public_evidence_version` setelah status selesai. Histori publik tidak merender foto privat, ID aktor, catatan internal, atau metadata komunikasi. Foto hilang memiliki fallback. Server tetap menentukan otorisasi.

## Validasi, sesi dan penanganan error

Fetch memakai cookie same-origin dan mempertahankan envelope API. Mutasi memakai versi dari ringkasan penanganan. Pada 409, dialog ditutup, data dimuat ulang, dan aksi baru perlu ditinjau ulang. Pada 404/403 karena perubahan akses, detail dibersihkan dan daftar diperbarui. Pada 401 UI mengumumkan sesi berakhir dan mengarah ke login. Validasi dan error format tetap ditampilkan pada dialog. Setelah timeout atau kegagalan server, UI memuat kondisi terbaru tanpa retry mutasi otomatis.

Input dipangkas dan dibatasi sesuai kontrak, termasuk ID numerik dan ukuran foto. JPEG/PNG diverifikasi melalui ekstensi, signature, decode dan resolusi hingga 16 megapiksel. Ukuran maksimum 5 MiB. Preview memakai object URL yang dicabut saat diganti atau dialog ditutup. Activity dan coordination menggunakan FormData dengan boundary browser. Assignment dan review mengirim JSON.

Aksesibilitas menggunakan label form, indikator fokus, tombol native, status live, dan dialog dengan Escape. Card dan field menyesuaikan ukuran layar. Target sentuh dan navigasi mobile ikut diperiksa.

## File yang berubah

| File | Fungsi |
|---|---|
| `app/Views/admin.html` | Navigasi verifikasi dan penanganan serta mount Admin. |
| `app/Views/collector.html` | Menu Tugas Fasilitas untuk sidebar dan navigasi bawah Petugas. |
| `app/Views/dashboard.html` | Memuat gaya Phase 4B untuk detail User. |
| `assets/css/facility-reports.css` | Berbagi token dan aturan elemen tersembunyi dengan panel Phase 4. |
| `assets/css/facility-handling.css` | Gaya status, timeline, dialog, fokus dan viewport kecil. |
| `assets/js/facility-api.js` | Helper Fetch dari Phase 3 yang dipakai bersama. |
| `assets/js/facility-reports.js` | Memasang progres publik pada detail User dan menggunakan helper bersama. |
| `assets/js/facility-report-ui.js` | Berbagi format waktu serta menyesuaikan keterangan approved. |
| `assets/js/facility-report-form.js` | Berbagi pemeriksaan foto. |
| `assets/js/facility-handling.js` | Alur daftar, detail, histori, pagination, versi dan pemulihan error. |
| `assets/js/facility-handling-ui.js` | Card, ringkasan empat status, timeline sesuai role dan bukti foto. |
| `assets/js/facility-handling-form.js` | Dialog dan payload spesifik per role serta aksi. |
| `scripts/check-ui-quality.cjs` | Mencakup CSS baru. |
| `scripts/check-phase1-browser.mjs` | Menjalankan suite Phase 4B secara opsional. |
| `scripts/check-phase3-frontend.mjs` | Menyesuaikan ekspektasi copy approved yang kini memiliki bagian progres. |
| `scripts/check-phase4-frontend.mjs` | Workflow browser dengan backend nyata dan akun sintetis. |
| `docs/progress/PHASE_04_FE.md` | Laporan implementasi dan verifikasi. |
| `docs/progress/PHASE_04_FE_INTEGRATION_NOTES.md` | Prasyarat, pemetaan API dan uji integrasi. |

## Hasil pengujian

| Pemeriksaan | Hasil |
|---|---|
| Baseline Phase 1–3B | PASS. API regresi, autentikasi, empat role, pickup, timbang, reward, CMS, dan Chromium Phase 3B. |
| Pemeriksaan statis | PASS. Sintaks JavaScript, CSS, sembilan view, tes CMS, dan diff. |
| Regresi Phase 1–3B setelah UI Phase 4B | PASS pada fixture. Biner berasal dari arsip BE dan view/aset dari FE. |
| E2E Phase 4B di Chromium 1280, 390 dan 320 px | PASS. Assignment, pengalihan, konflik 409, hak akses, koordinasi, asesmen, progres, review, koreksi, foto privat dan publikasi diuji dengan API nyata. Pemeriksaan layout, label dan penutupan dialog dengan Escape lulus. |
| Histori publik dan pemeriksaan visual | PASS. Browser memuat 20 aktivitas lalu melanjutkan ke halaman kedua dengan total 23. Foto publik tampil dan foto internal ditolak. Tangkapan layar Admin dan User diperiksa pada viewport mobile. |

Pengujian awal menemukan foto yang sudah diminta Admin menunggu pemuatan lazy ketika elemen berada di bawah viewport. Foto bukti sekarang dimuat saat pengguna memilih **Tampilkan foto bukti**, dan fokus berpindah ke elemen foto. Foto privat pada histori baru dimuat setelah aksi tersebut.

## Keterbatasan dan checklist

UI penanganan membutuhkan server Phase 4A. Pengujian memakai fixture, tanpa migrasi pada database utama dan tanpa penggabungan branch. Pilihan publikasi foto di dialog memakai halaman histori yang sudah dimuat. Peta lokasi tidak ditambahkan karena alamat dan koordinat memenuhi kebutuhan tampilan. Pembaca layar, browser selain Chromium, dan deployment akhir berada di luar uji ini.

- [x] UI Admin untuk antrean, assignment, pengalihan, monitoring, validasi dan koordinasi.
- [x] UI Petugas untuk tugas fasilitas, asesmen, progres, bukti, pengajuan dan koreksi.
- [x] UI User untuk progres, histori publik dan hasil.
- [x] Integrasi sembilan operasi, empat status, versi, dan visibilitas role.
- [x] Laporan dan catatan integrasi.
- [x] Verifikasi akhir E2E lintas branch dan viewport.

**PASS WITH NOTES.** Phase 4B siap untuk integrasi akhir setelah Phase 6. Pengujian dilakukan terhadap API Phase 4A nyata di fixture terisolasi. Deployment gabungan dan pengujian lintas browser masih menjadi pekerjaan tahap integrasi.
