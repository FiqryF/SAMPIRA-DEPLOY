# Phase 08 — Leaflet Maps Stabilization & UI/UX Unification

Tanggal: 7 November 2026. Status: **PASS WITH NOTES**.

## Kondisi awal dan batas perubahan

- Branch tetap `main`, HEAD `eea06e9eff82307899a0e67808ae53376684a517`. Perubahan Phase 7 yang belum di-commit dipertahankan.
- Ditemukan tiga jalur Leaflet dengan pengaturan terpisah, marker berdasarkan tipe saja, import helper dengan beberapa cache key, pencarian yang dapat menerima respons lama, grafik berdasarkan urutan input, dan pemuatan dashboard tanpa pemulihan yang memadai.
- Referensi visual adalah `app/Views/index.html` dan stylesheet Landing yang benar-benar digunakan, `assets/css/landing.css`: Inter/Manrope, hijau `#174c3c`, kanvas `#f7f9f5`, garis `#d4e1d8`, radius 14px, shadow ringan.
- Phase 8 tidak mengubah source Backend, migrasi, Landing, atau Login/Register. Diff Backend/auth yang masih ada berasal dari Phase 7. Tidak ada commit, push, merge, reset, rebase, perpindahan branch, atau perubahan database utama.

## Perubahan Maps

`assets/js/map-core.js` menjadi helper kecil untuk inisialisasi Leaflet, layer jalan, ikon, popup, legenda, dan pemetaan status. Semua pemanggilan `L.map` dan `L.tileLayer` kini berada di helper ini. Koordinat tetap menggunakan validator WGS84 existing.

| Data aktual | Warna |
| --- | --- |
| Pickup `pending`; fasilitas `pending` | Amber |
| Pickup `pickup`; fasilitas `approved`/`assigned` | Biru |
| Pickup `transit`/`arrived`; fasilitas `assessment_in_progress`/`handling_in_progress`/`resolution_submitted` | Ungu |
| Pickup/fasilitas `completed` | Hijau |
| Pickup `cancelled`; fasilitas `rejected` | Merah |
| Fasilitas `revision_required`/`resolution_revision_required` | Oranye |
| Status tidak dikenal, handling tidak dapat dimuat, kelompok dengan beberapa status | Netral |

- Ikon kendaraan dan peringatan membedakan pickup/fasilitas. Label, popup, dan legenda melengkapi warna. Status tidak dikenal dicatat sekali per jenis/status melalui `console.warn`.
- Fasilitas approved membaca endpoint handling yang sudah berwenang agar approved tidak disamakan dengan completed. Kegagalan enrichment memakai status netral, bukan mengasumsikan selesai.
- Dashboard User memakai API milik pengguna; peta Petugas memakai pickup yang diambil/tugas yang ditugaskan; Admin tetap menggunakan API Admin. Tidak ada koordinat buatan bagi record tanpa titik.
- Popup memiliki lebar/tinggi terbatas dan aksi detail. Aktivitas berdekatan dikelompokkan dengan jumlah; kelompok status campuran berwarna netral, sementara popup menampilkan status setiap record.
- Import helper memakai cache key yang sama. Cleanup menghapus layer/map, membatalkan state lama, dan memutus ResizeObserver saat keluar. Ukuran di-invalidasi saat container berubah. Peta tersembunyi tidak mempertahankan tile picker yang aktif.
- Peta picker tetap di atas input, menyediakan klik, drag pin, GPS, koordinat manual, dan konfirmasi eksplisit. Pin awal Bandung hanya panduan visual; tidak dikirim otomatis. Idempotency-Key Phase 7 untuk pickup dan fasilitas dipertahankan.
- Photon memakai pencarian eksplisit minimal 3 karakter, bbox Bandung, limit 5, slot request berjarak 1,1 detik antarkomponen, timeout 8 detik, AbortController, dan nomor revisi. Pergantian input, reset, remount, serta pagehide membatalkan hasil lama; input saja tidak mengirim pencarian.

## Perubahan UI dan pemuatan data

- User/Petugas memakai token visual Landing melalui CSS yang dibatasi pada kedua role. Tidak ada framework atau dependency baru.
- Marker lebih kecil, legenda status berada di bawah peta, panel/form lebih ringkas, riwayat dan pelacakan lebih terbaca, serta pengaturan dibagi menjadi identitas, alamat dan pembayaran sesuai field Backend existing.
- Dashboard Petugas memakai panel arahan singkat dan antrean yang jelas, menggantikan ruang kosong besar. KPI, misi, tugas fasilitas, penimbangan dan workflow tetap memakai logika existing.
- HTTP 500/timeout mengakhiri loading, menghapus tampilan data lama yang gagal dimuat, menampilkan pesan dan tombol coba lagi. Hasil async lama diabaikan. Pergantian Beranda/focus menyegarkan data tanpa menimpa isian profil/form yang belum disimpan.
- Grafik mengelompokkan berat terverifikasi menurut `YYYY-MM`, mengurutkan key kronologis, dan menampilkan label bulan/tahun Indonesia dalam zona Asia/Jakarta. Created date hanya fallback bagi data legacy tanpa verified date.
- Jumlah laporan yang masih memiliki cursor ditandai `+`, diberi label laporan dimuat dan penjelasan jumlah parsial; tidak dianggap total keseluruhan. Empty/error dibedakan dari nilai nol.
- Pelacakan memakai form dengan Enter, status loading, pembatalan saat input berubah, timeout, dan pesan inline jika detail tidak tersedia. Tidak menambahkan perjalanan atau status fiktif.

## Pengujian yang lulus

| Pemeriksaan | Hasil |
| --- | --- |
| `node scripts/check-phase8.mjs` | Seluruh mapping status aktual, fallback tidak dikenal/gagal, enrichment approved saja, urutan bulan/tahun dan batas zona waktu Jakarta, grafik kosong lulus |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase6b-fixture.ps1 -SkipBrowser` | Migration/replay, API dan regression Phase 1–7 lulus pada database fixture terisolasi |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase6b-fixture.ps1 -Screenshots <direktori lokal>` | Chromium Phase 1–8 lulus: login/role/logout, API riil, pickup/report save, revisi/approval, tugas/evidence, koordinat/GPS, lost-response idempotency, ownership/privacy, peta, profil dan pendidikan |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase6b-fixture.ps1 -Phase8BrowserOnly -Screenshots <direktori lokal>` | Pin amber berubah biru setelah penugasan aktual; dashboard pulih dari HTTP500; A→B→A mengabaikan respons lama; abort/reset; aktivasi peta berulang tanpa container ganda; layout lima lebar lulus |
| Landing dan Login/Register | Regression Chromium desktop/mobile, keyboard, validasi, navigasi, reduced motion lulus; tidak diubah oleh Phase 8 |
| Syntax dan whitespace | Node syntax checks pada modul yang berubah dan `git diff --check` lulus |

Fixture membuat MariaDB sementara di port 24367 dan server 24934. Semua penulisan test dilakukan pada database fixture, bukan database runtime/utama. Pesan duplicate-key/check-constraint pada negative tests adalah penolakan yang diharapkan dan assertion-nya lulus.

## Visual QA

Chromium merender Dashboard User, Pickup, Facility, History, Tracking, Settings, Dashboard/Peta Petugas dan Monitoring Maps Admin pada lebar **360, 390, 768, 1280, 1440**. Suite existing juga memeriksa 320, 430 dan 1024 pada halaman terkait. Pemeriksaan overflow lulus; screenshot desktop/mobile ditinjau untuk hierarki, panjang tracking, panel, marker, kontrol dan legenda. Pengujian mouse/keyboard/CDP geolocation lulus; perangkat sentuh fisik tidak diuji.

Screenshot ada di folder lokal (bukan laporan terpisah):
`C:\Users\FIQRY FIRMANSYAH\.codex\visualizations\2026\11\05\01a1ad5d-f300-7af2-8431-4d188d8eeb81\phase8-qa\phase8`

Pengambilan ulang yang menunggu transisi selesai, termasuk detail tracking aktual, lulus pada `phase8-qa-final\phase8` di direktori induk yang sama. Mode browser-only memakai persiapan fixture browser; kasus koordinat ekstrem dan data negative-test tetap diuji terpisah melalui `-SkipBrowser`.

## Runtime lokal

- URL: `http://localhost:8080`, PID aplikasi **15732**, executable `SAMPIRA-Phase7/server.exe` di direktori visualizations yang sama. Backend Phase 7 yang sudah aktif tidak memerlukan rebuild untuk perubahan Frontend Phase 8.
- View/aset runtime dijunction ke working tree aktif; `/assets/js/map-core.js` terverifikasi HTTP 200; source `user-activity.js` terbaru juga terverifikasi melalui HTTP. Endpoint fasilitas tanpa sesi memberi HTTP 401 (bukan 404). Refresh browser memuat cache key Phase 8.
- Database runtime: clone **127.0.0.1:24369/sampira_phase7_local**, dengan 5 akun, 6 pickup dan 1 laporan saat pemeriksaan read-only. Database utama `ecorecycle` tidak dimigrasi atau diubah.
- Launcher existing `SAMPIRA-Phase7/phase7-local.ps1` tetap digunakan dengan aksi `Status`, `Start`, `Stop`; pemeriksaan identitas proses tetap berlaku. Phase 8 tidak menghentikan atau mengganti proses lain.

## File utama Phase 8

- `assets/js/map-core.js`, `location-map.js`, `location-search.js`, `user-map.js`, `user-activity.js`, `operations.js`.
- `assets/js/dashboard.js`, `collector.js`, `facility-reports.js`, `facility-report-form.js`, `facility-handling.js`.
- `assets/css/portal-workspace.css`, `location-map.css`, `user-workspace.css`.
- `app/Views/dashboard.html`, `collector.html`, `admin.html` (Admin hanya pemakaian aset peta).
- `scripts/check-phase8.mjs`, `check-phase8-frontend.mjs`, `check-phase1-browser.mjs`, `check-phase6b-fixture.ps1`.
- `docs/progress/PHASE_08.md` sebagai satu-satunya laporan Phase 8.

## Catatan dan batas verifikasi

Tidak ada blocker kritis yang diketahui setelah pengujian. Pencarian Photon dan routing diuji dengan provider mock di browser agar race/failure deterministik; ini bukan klaim keberhasilan pencarian/rute publik secara live. Tile OpenStreetMap benar-benar termuat pada screenshot. GPS memakai geolocation Chromium, bukan sensor perangkat fisik. Uji memori berupa siklus map/cleanup dan pemeriksaan container/listener melalui perilaku browser, bukan profiling heap jangka panjang.

Provider publik tetap bergantung koneksi dan ketersediaan layanan. Penggunaan tile mempertahankan attribution dan cache browser normal, tanpa prefetch/bulk download, mengikuti [kebijakan tile OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). Pencarian dibatasi untuk pemakaian ringan pada [demo Photon](https://github.com/komoot/photon); tidak mengasumsikan SLA. Jika provider gagal, koordinat manual/alamat dan navigasi eksternal tetap tersedia. Phase 9 belum dikerjakan.

## UI/UX Redesign 4 Role

7 November 2026 — **PASS WITH NOTES**, lanjutan Phase 8 di `main`. Perubahan existing dipertahankan; tidak ada commit/push/merge/rebase/reset/switch branch, perubahan Backend/migrasi/API, atau operasi destruktif database. Landing dan Login/Register tidak diubah dalam lanjutan ini.

### Halaman yang selesai

| Role | Cakupan existing dan komposisi |
| --- | --- |
| User | Beranda/peta/aktivitas, pickup dan laporan satu halaman dengan field dua kolom, riwayat/pelacakan/pembayaran, edukasi, pengaturan dan profil. Identitas terpisah dari editor profil; tab data/pengaturan/kebijakan berfungsi. |
| Petugas | Dashboard mendahulukan antrean dengan briefing/rute di samping; detail misi, progres, peta, dialog penimbangan, fasilitas/asesmen/form foto, riwayat, komisi existing, profil. Navigasi mobile dan aksi tugas tetap terjangkau. |
| Admin | Ringkasan metrik dan strip akses pekerjaan, laporan terbaru dalam tabel penuh, verifikasi/detail, penugasan/penanganan, monitoring/peta, daftar/editor/lifecycle artikel edukasi. |
| Administrator | Navigasi tetap untuk ringkasan, pengumuman, pembayaran reward; metrik sistem, daftar publikasi di samping editor, kewajiban dan formulir bukti/konfirmasi pembayaran. |

### Design system dan source

Acuan tunggal `app/Views/index.html` dan `assets/css/landing.css`: Inter/Manrope, `#174c3c`, `#103d2f`, `#f7f9f5`, `#d4e1d8`, radius 14px, tombol 8px, shadow ringan. Tidak membuat identitas atau aset baru dari layanan lain.

`portal-design.css` menyatukan form, tombol, tabel, status, dialog, focus, feedback, map container dan responsive behavior. HTML disusun ulang; `admin-workspace.css` ditulis ulang. Template tidak lagi memuat portal-workspace lama; Petugas melepas collector-inline/portal-system yang bertabrakan. Inline CSS profil dan class/data-style hasil ekspor Petugas dibersihkan. File lama tidak dihapus. Komposisi khusus User tetap pada user-theme.

Profil lama memiliki alert simpan palsu dan toggle tanpa API. Simpan sekarang memakai `/api/user/profile` existing, mempertahankan metadata payout; kegagalan memuat profil menampilkan retry dan menonaktifkan simpan sampai pulih. Kontrol keamanan/WhatsApp yang belum didukung diganti keterangan. Email Petugas berasal dari sesi; informasi armada hardcoded tidak ditampilkan sebagai data akun.

Leaflet/status marker, privacy/RBAC, picker di atas form, search cancellation, koordinat, tracking/timeline, grafik kronologis, idempotency, upload, transaksi/reward dan lifecycle edukasi dipertahankan. Basemap diredam tanpa mengubah warna status dan attribution.

### Testing dan visual QA

- **PASS** runner penuh `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase6b-fixture.ps1 -Screenshots <folder>`: baseline API/session/RBAC, CMS, pembayaran, private photos, pickup/report/handling, GPS/koordinat, upload, idempotency, tracking, browser regression Phase 1–8 dan QA empat role.
- **PASS** `-PortalDesignOnly`: seluruh view pada 360, 390, 768, 1280, 1440px; tanpa horizontal overflow halaman. Suite User existing juga memeriksa 320/430/1024px. Tabel dan dialog memiliki scroll internal bila diperlukan.
- `check-portal-design.mjs` menguji simpan profil tanpa mengubah field/payout; pemulihan HTTP500 profil; approval dan penugasan melalui dialog; detail misi aktual; dialog berat; asesmen lewat form; form foto pemeriksaan; CMS dan bukti pembayaran. Upload, penimbangan dan pembayaran persisten diuji regression existing.
- Keyboard/focus, menu mobile, touch target, reduced motion, panjang tracking, loading/empty/error dan modal diperiksa. Syntax checks dan `git diff --check` lulus. Tidak mengklaim pengujian perangkat sentuh fisik, profiling memori jangka panjang, atau provider routing/search publik live; batas verifikasi provider Phase 8 sebelumnya tetap berlaku.
- Seluruh penulisan test memakai MariaDB sementara 24367 dan HTTP fixture 24934. Database utama dan clone runtime 8080 tidak dipakai untuk penulisan fixture.

Screenshot rendered ditinjau setelah font/aset termuat. Perbandingan lebar 1440px menunjukkan perbedaan komposisi; before berasal dari capture existing sebelum redesign kumulatif, bukan mockup. Timestamp/data fixture dapat berbeda; tidak mengklaim pixel match atau metrik produksi.

| Role | Before | After |
| --- | --- | --- |
| User | [Sebelum](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/before/user-1440.png>) | [Sesudah](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/roles/user-home-1440.png>) |
| Petugas | [Sebelum](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/before/petugas-1440.png>) | [Sesudah](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/roles/petugas-dashboard-1440.png>) |
| Admin | [Sebelum](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/before/admin-1440.png>) | [Sesudah](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/roles/admin-overview-1440.png>) |
| Administrator | [Sebelum](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/before/administrator-1440.png>) | [Sesudah](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/roles/administrator-overview-1440.png>) |

66 screenshot detail desktop/mobile: `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase8-four-roles/roles`. Capture tambahan workflow existing tersedia pada direktori induk dan `phase8`. Termasuk editor, penugasan, misi, berat, asesmen/foto, profil, CMS dan formulir pembayaran.

Source bundle SHA-256: `e1edd631f6651f58b363f93f1ef38603b3de6805d6b7453e85d77825fd82d658`. Fingerprint dibentuk dari path dan hash terurut atas lima template, portal-design/admin-workspace/user-theme CSS, collector.js, check-portal-design/check-phase1-browser dan runner fixture. Capture memakai working tree, bukan branch lain.

### File dan kendala tersisa

Utama: lima template pada `app/Views/`; `assets/css/portal-design.css`, `admin-workspace.css`; `assets/js/collector.js`; `scripts/check-portal-design.mjs`, `check-phase1-browser.mjs`, `check-phase6b-fixture.ps1`. Laporan hanya memperbarui file ini.

Tidak ada halaman existing dalam tabel yang ditinggalkan. Pengelolaan akun/role dan pengaturan sistem Administrator, gamification, voucher, analytics baru dan pencairan komisi yang belum tersedia tetap Phase 9; tidak dibuat sebagai fitur/tombol aktif palsu. Runtime Frontend tetap satu origin `http://localhost:8080`; aset/template tidak memerlukan restart Backend.
