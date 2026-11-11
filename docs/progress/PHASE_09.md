# Phase 9A — Backend & Database

Status: **siap integrasi Frontend, dengan batasan simulasi di bawah**. Dikerjakan pada `main`; perubahan lokal Phase 7–8 dipertahankan. Tidak ada perubahan UI, switch branch, commit, push, atau operasi pada database utama.

## Backend selesai

- Reward existing tetap memakai berat aktual yang dicatat Petugas penanggung jawab, tarif kategori existing, pembulatan dan potongan existing. Estimasi User bukan saldo uang. Verifikasi, kewajiban uang, histori, event accrual dan pemberian poin berada dalam satu transaksi; retry verifikasi tetap mendapat 409.
- Ledger uang existing `pickup_rewards`/transaksi historis dipertahankan. `cash_reward_events` mencatat accrual baru dan kompensasi pembatalan. Pembayaran manual existing tetap menyimpan pelaksana, referensi unik, bukti dan digest; tidak membuat gateway/pencairan otomatis.
- Administrator dapat membatalkan kewajiban **pending** dengan alasan: event negatif dan audit disimpan, amount menjadi nol. API User menampilkan `voided`. Pembayaran `paid` dan histori berat tidak dapat dihapus/ditimpa. Koreksi nominal dilakukan dengan membatalkan kewajiban yang keliru; penerbitan kewajiban pengganti/refund eksternal tidak diotomatisasi. Pembatalan uang tidak membatalkan kontribusi fisik/poin.
- Saldo poin, lifetime, ledger kredit/debit, level dan badge. Tidak ada API pemberian poin dari request User. Unique source pickup dan transaksi verifikasi mencegah double credit.
- Katalog voucher simulasi, edit dengan versi, penukaran atomik dan idempotent, kode acak unik, snapshot voucher terbit, Voucher Saya dan histori. Lock saldo mendahului lock stok; constraint mencegah saldo/stok negatif. Stok/versi ikut berubah saat redeem.
- Analytics empat role, agregasi fasilitas approved, pengelolaan role/aktivasi akun dan audit Administrator. Perubahan akun memerlukan kondisi sebelumnya dan alasan, mencabut sesi target, menolak perubahan diri sendiri serta perubahan Petugas dengan tugas aktif. Administrator pelaksana tetap aktif; perubahan akun diserialisasi dan otoritas diperiksa ulang dalam transaksi.
- Verifikasi, penugasan, penanganan, monitoring dan CMS existing direuse tanpa endpoint duplikat.

## API dan migration

Kontrak lengkap ditambahkan ke `docs/openapi.json`. Envelope tetap `{status,message,data}`. Semua endpoint privat memakai Bearer atau cookie same-origin; proteksi origin existing berlaku pada mutasi.

| Endpoint | Role / kegunaan |
| --- | --- |
| `GET /api/user/contributions` | User: saldo, lifetime, level, badge, aturan |
| `GET /api/user/points` | User: kredit/debit milik sendiri |
| `GET /api/user/rewards` | User: kewajiban uang milik sendiri; cursor memakai pickup_id |
| `GET /api/vouchers` | User: katalog aktif dalam masa berlaku |
| `POST /api/vouchers/{id}/redeem` | User: penukaran; wajib header UUID v4 `Idempotency-Key` |
| `GET /api/user/vouchers` | User: snapshot dan kode penukaran milik sendiri |
| `GET, POST /api/administrator/vouchers` | Administrator: katalog / buat |
| `PUT /api/administrator/vouchers/{id}` | Administrator: full replacement dengan `version` |
| `POST /api/administrator/pickup-rewards/{id}/void` | Administrator: batalkan pending, JSON `{reason}` |
| `GET /api/analytics` | Scope sesi: User milik sendiri; Petugas tugas sendiri; Admin fasilitas; Administrator agregat sistem |
| `GET /api/analytics/facility-grid` | Admin/Administrator: sel 0,01 derajat, minimal 3 laporan approved per sel |
| `GET /api/administrator/accounts` | Administrator: akun tanpa password/bukti pembayaran |
| `PATCH /api/administrator/accounts/{id}` | Administrator: `{role,is_active,expected_role,expected_active,reason}` |
| `GET /api/administrator/contribution-audit` | Administrator: perubahan katalog/akun, redeem dan pembatalan uang |

Daftar baru menggunakan `limit=1..100` (default 20), `before=<id>` eksklusif, urut ID turun. Query tidak dikenal/berulang ditolak. Analytics sesi tidak menerima parameter user_id. Grid menerima category, limit (default 50), dan bbox opsional lengkap `min_lat,max_lat,min_lng,max_lng`; WGS84, finite, min < max. Tidak mengembalikan koordinat pickup User atau menyimpulkan kepadatan sampah representatif. Grid kosong berarti belum ada sel yang memenuhi ambang; `truncated` menandai pembatasan hasil. Statistik merupakan live aggregates, bukan snapshot konsisten lintas semua counter.

Migration additive/replayable: `db_init/migrations/008_rewards_points_vouchers.sql`. Tabel: contribution_rules, point_wallets, point_entries, voucher_catalog, voucher_redemptions, phase9_audit, cash_reward_events. Tidak mengubah baris historis atau memberikan kredit retroaktif. Mengikuti runner migration existing saat startup server; **binary baru belum dijalankan pada runtime 8080/database utama**. Review dan arahkan konfigurasi DB secara eksplisit sebelum menjalankan binary baru di lingkungan lain.

## Aturan dan integrasi Frontend

- Aturan demonstrasi eksplisit di contribution_rules: **10 poin/kg**, floor setelah perkalian berat aktual maksimal dua desimal. Implementasi memakai satuan seperseratus kg untuk menghindari kesalahan float. Tidak dapat diuangkan. Ubah konfigurasi DB hanya melalui prosedur operasional yang diaudit; tidak disediakan editor aturan. Aturan baru hanya memengaruhi verifikasi berikutnya, bukan ledger lama.
- Level berdasarkan lifetime: Pemula 0, Penggerak 100, Pelestari 500. Badge Kontributor >0, Penggerak Hijau >=100, Pelestari Lingkungan >=500. Penukaran mengurangi saldo tanpa mengurangi lifetime/level.
- Buat voucher: name, description, category, point_cost, stock, valid_from/valid_until RFC3339, active. Simpan waktu UTC. PUT wajib versi terbaru; redeem juga meningkatkan versi. Voucher terbit menyimpan biaya/nama/deskripsi/masa berlaku asal walaupun katalog diedit.
- Redeem tanpa body, simpan UUID per aksi. Respons awal 201, retry identik 200 dengan receipt sama; key sama untuk voucher berbeda 409. Kegagalan 500 dapat dicoba ulang dengan key yang sama. Periksa saldo dan katalog ulang setelah sukses/409; jangan mengurangi saldo lokal sebagai sumber kebenaran.
- Semua voucher **SIMULASI, tidak berlaku di merchant nyata**; wajib tampilkan penjelasan ini. Tidak ada integrasi merchant, penggunaan voucher di merchant, gambar katalog, gateway atau refund otomatis. Katalog awal kosong; Administrator membuat data demonstrasi secara eksplisit.
- Frontend belum diubah/dihubungkan ke endpoint baru. Backend siap dipakai Phase 9B. Browser/UI Phase 8 tidak diuji ulang dalam task Backend ini.

## Bukti pengujian

- `go test ./...`: **PASS**, termasuk boundary poin, level/badge dan query grid. `go vet ./...` dan `node --check scripts/check-phase9.mjs`: **PASS**.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase6b-fixture.ps1 -SkipBrowser`: **PASS** pada source akhir. Regresi API/migration Phase 1–7 dan Phase 9 berjalan dengan MariaDB baru `127.0.0.1:24367`, HTTP `127.0.0.1:24934`, database sintetis sampira_phase1_test/fresh serta fixture upgrade terpisah. Runner menghentikan proses fixture setelah selesai.
- Phase 9 menguji: concurrent verifikasi sekali, tarif/berat aktual vs estimasi, rollback cash/points/berat saat ledger gagal, poin per pemilik, redeem sukses, saldo tidak cukup, stockout, expired/inactive/future, optimistic edit, snapshot terbit, retry serentak 1x201+4x200, key conflict, perebutan stok lintas User, perebutan saldo, rollback setelah debit stok, empat role 401/403, cookie lintas origin, privasi histori/statistik, query/bbox invalid, approved facility grid, pembatalan pending/retry/paid, akun nonaktif/role/stale/self dan revokasi sesi, replay migration pada fixture baru serta terisi.
- Fixture akhir: `C:/Users/FIQRYF~1/AppData/Local/Temp/sampira-6b-fe-80563793e3fc4b48a6dcbc54793a34b5`. Kegagalan constraint yang sengaja dipicu oleh suite lama merupakan negative tests yang lulus, bukan kegagalan regresi. Database utama tidak dibuka atau dimigrasikan oleh pengujian ini.

## Phase 9B — Frontend & Integration

Status source: **selesai, QA terisolasi PASS** (8 November 2026). Tetap `main`. Landing Page, Login/Register dan migrasi tidak diubah; tidak ada framework baru, commit atau push. Tampilan mengikuti warna, font Inter/Manrope, radius dan bentuk kontrol Landing Page. Pengaturan, workflow penjemputan, verifikasi, penugasan, bukti dan Maps existing dipertahankan.

### Halaman dan integrasi

| Role | Halaman / hasil |
| --- | --- |
| User | Menu **Poin & Voucher**: saldo, lifetime, level/badge Backend, aturan aktual, katalog, biaya/stok, konfirmasi, hasil penukaran, Voucher Saya, kode/masa berlaku/status dan histori poin/penukaran. Akses juga dari Beranda dan Pengaturan. |
| User | Menu **Reward Saya**: ringkasan seluruh waktu, berat terverifikasi, nilai kewajiban dan pembayaran tercatat, tabel/filter status serta keterangan. `pending`, `paid`, `not_due`, `voided` dibedakan; estimasi pengajuan tidak diperlakukan sebagai uang dibayar. |
| Admin | Menu **Statistik & Sebaran**: angka operasional dari API, grafik jumlah catatan, kategori/batas hasil/bbox, sel fasilitas approved, popup dan tabel aksesibel. Antrean verifikasi, penugasan dan monitoring existing tetap digunakan. |
| Administrator | Navigasi **Statistik sistem**, **Akun & Role**, **Manajemen Voucher**, **Monitoring & Audit**, **Sebaran Fasilitas**. Form akun memakai kondisi sebelumnya/alasan; form voucher memakai versi, biaya, stok, periode lokal yang dikonversi RFC3339 UTC dan status aktif. Pembayaran existing ditambah aksi pembatalan kewajiban pending dengan alasan. |
| Petugas | Statistik seluruh waktu berdasarkan penjemputan/tugas fasilitas miliknya, progres dan grafik angka aktual. Lokasi, rute, riwayat, bukti/catatan dan alur penyelesaian existing direuse. Pemilihan satu foto dan preview existing tetap sederhana untuk smartphone. |

API yang dipakai: `/api/user/contributions`, `/api/user/points`, `/api/user/rewards`, `/api/vouchers`, `/api/vouchers/{id}/redeem`, `/api/user/vouchers`, `/api/analytics`, `/api/analytics/facility-grid`, `/api/administrator/accounts`, `/api/administrator/accounts/{id}`, `/api/administrator/vouchers`, `/api/administrator/vouchers/{id}`, `/api/administrator/contribution-audit`, serta pembatalan `/api/administrator/pickup-rewards/{id}/void`. Pembayaran dan endpoint operasional existing tidak digandakan.

- Semua penukaran diberi label **SIMULASI, tidak berlaku di merchant nyata**. Poin tidak ditampilkan sebagai uang. Saldo/stok bukan hasil pengurangan lokal; dimuat ulang dari server setelah sukses/409.
- UUID intent disimpan di sessionStorage sebelum mutasi dan digunakan ulang jika respons hilang. Retry server yang telah berhasil mengembalikan receipt yang sama. Kegagalan 409 menutup akses konfirmasi lama; pengguna menutup dialog dan memilih ulang dari katalog yang telah diperbarui.
- Temuan integrasi: biaya dapat berubah saat konfirmasi masih terbuka. Perbaikan Backend minimal menambahkan header opsional `X-Expected-Point-Cost` (1–1.000.000.000), selalu dikirim UI baru. Pengecekan dilakukan di bawah lock voucher; biaya berbeda mendapat 409 tanpa debit. Replay yang sudah sukses tetap mengembalikan receipt asli sebelum memeriksa harga terbaru. Kontrak OpenAPI diperbarui; kompatibilitas klien Phase 9A dipertahankan. Tidak ada migration baru.
- List memakai cursor server, 20 baris per halaman, tombol muat berikutnya dan status jumlah yang dimuat. Pencarian/filter lokal diberi label berlaku pada **data dimuat**; tidak mengklaim hasil seluruh database. Statistik memakai agregat Backend seluruh waktu dengan satuan jelas; indikator yang beririsan bukan pie chart persentase.
- Peta memakai Leaflet existing, sel 0,01° dengan ambang minimal 3 laporan approved. Lingkaran menandai pusat sel agregasi, bukan rumah/titik fasilitas individual. Ada validasi bbox, batas hasil, tabel, empty/error/loading states; tidak mengklaim hotspot representatif atau membuka koordinat pickup User.
- Error koneksi/500, saldo tidak cukup, stockout, expired, harga berubah, versi stale dan penolakan Backend ditampilkan. Dialog native menjaga fokus; tabel lebar memiliki area scroll internal. Pembaruan uang/akun/voucher meminta statistik ulang.

### Pengujian dan visual

- `go test ./...`, `go vet ./...`, pemeriksaan syntax modul JS dan validasi JSON OpenAPI: **PASS**. Guard biaya diuji untuk header invalid, harga berbeda tanpa perubahan saldo/stok, serta replay receipt setelah biaya konfirmasi berubah.
- Runner: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase6b-fixture.ps1 -Phase9BrowserOnly -Screenshots <direktori output>`. Source final **PASS**, memakai MariaDB fixture `127.0.0.1:24367`, HTTP `127.0.0.1:24934`, akun sintetis dan database sampira_phase1_test/fresh. Tidak ada transaksi uji pada database utama.
- Browser Chrome nyata: navigasi empat role, CRUD voucher lewat form, perubahan role/nonaktif akun, cursor >20 data, penukaran via dialog, saldo **154 → 144**, lifetime tetap **154**, stok **3 → 2**, kode receipt cocok Voucher Saya. Respons sengaja diputus setelah commit; retry tetap hanya satu penukaran. Angka ini hanya fixture, bukan statistik pengguna sebenarnya.
- Browser menolak katalog stale karena stok habis, expired, perubahan harga meski saldo masih cukup, dan saldo yang telah dibelanjakan klien kedua. Juga memeriksa filter reward, tabel histori, detail/kode, 500 recovery, agregasi fasilitas/bbox invalid dan pembatalan pending dari UI.
- Regresi browser Phase 4B **PASS**: assignment/reassignment, konflik, aktivitas Petugas, upload/preview bukti, koreksi, publikasi/privasi User dan koordinasi eksternal. Regresi Maps Phase 8 **PASS**: perubahan status marker, 500 recovery, geocode A–B–A/abort, reset, aktivasi ulang, lima ukuran layar. Tidak ada uncaught JavaScript exception atau application `console.error`; respons gagal pada negative tests memang disengaja.
- Halaman baru dan dialog dicek pada **1280px dan 390px** tanpa overflow halaman. **52 screenshot / 26 state** disimpan di `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9b-final-ui/phase9b`; render desktop/mobile ditinjau, termasuk katalog, konfirmasi/receipt, kegagalan harga, form voucher, akun, reward, statistik Petugas dan grid Admin. Screenshot regresi peta berada pada subdirektori `phase8` direktori induknya.
- Contoh bukti: [Poin User](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9b-final-ui/phase9b/user-points-1280.png>), [Konfirmasi mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9b-final-ui/phase9b/user-redeem-confirm-390.png>), [Voucher Administrator](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9b-final-ui/phase9b/administrator-vouchers-1280.png>), [Sebaran Admin](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9b-final-ui/phase9b/admin-grid-1280.png>).
- Fixture final: `C:/Users/FIQRYF~1/AppData/Local/Temp/sampira-6b-fe-177464d0642346488d9490f2229db6d1`. Proses fixture dihentikan runner setelah selesai.

### Aktivasi lokal dan batasan

`localhost:8080` mengenali API kontribusi (401 tanpa login). HTTP 200 untuk JS/CSS Phase 9B dan dashboard.js cocok SHA-256 working tree saat diperiksa. Tidak menguji mutasi dengan akun asli pada server ini. Proses server existing dikenali sebagai Go build PID 23824; **tidak dihentikan/direstart**. `.env` menunjuk localhost/ecorecycle, sehingga startup/migration terhadap database utama tidak dijalankan otomatis. **Restart/build Backend terbaru masih diperlukan untuk mengaktifkan guard biaya yang baru pada runtime 8080**; keberhasilan guard dibuktikan pada fixture final, bukan diklaim sudah aktif di binary lama.

Tidak ada halaman Phase 9A yang sengaja dijadikan placeholder. Integrasi merchant nyata, pembayaran/refund otomatis, editor aturan poin dan penciptaan akun privileged bukan kemampuan kontrak Phase 9A dan tidak ditampilkan sebagai tombol aktif. Pembayaran tetap pencatatan manual terverifikasi. File utama: empat template role, `assets/js/contributions.js`, `assets/css/contributions.css`, pembaruan kecil dashboard/operations/reward-payments, guard Backend dan OpenAPI; QA pada `scripts/check-phase9-frontend.mjs` serta runner existing. Laporan hanya file ini.

## Phase 9C — Testing & Finalization

**Kesimpulan Phase 9A–9C: PASS WITH NOTES** — fungsi dan integritas transaksi lulus pada fixture terisolasi, tanpa bug kritis yang ditemukan pada cakupan pengujian. Source siap dilanjutkan ke Phase 10; deployment/smoke test lingkungan tujuan masih terpisah. Dikerjakan 8 November 2026 pada `main`. Perubahan 9B yang belum di-commit dipertahankan; tidak ada commit/push, fitur baru, migrasi baru, atau perubahan database utama.

### Hasil yang benar-benar diverifikasi

| Cakupan | Hasil |
| --- | --- |
| User → Petugas → reward/poin → voucher | **PASS melalui UI**: login User, isi form pickup/foto/koordinat, Petugas mengambil tugas, transit, tiba di hub, timbang dan selesaikan. Estimasi **999 kg** menghasilkan pencatatan berdasarkan berat aktual **2,50 kg**, reward **Rp15.000 pending**, dan **25 poin sekali**. Administrator membuat voucher lewat UI, User menukar **5 poin**, saldo **25 → 20**, stok **1 → 0**, kode tampil di Voucher Saya/receipt dan ledger sesuai. Angka adalah fixture sintetis, bukan data pengguna nyata. |
| Admin/Administrator | **PASS**: login/logout, verifikasi/revisi/tolak/setujui laporan, assignment/reassignment/konflik, pemantauan, katalog voucher/edit stok/periode, akun/role/nonaktif/revokasi sesi, audit penukaran, pembayaran dengan bukti dan pembatalan kewajiban pending. |
| Keamanan/transaksi | **PASS API**: concurrent redemption lintas User, perebutan saldo/stok, retry serentak satu transaksi, duplicate point/reward prevention, rollback setelah ledger/audit gagal, insufficient balance, expired/inactive/future/stockout, CSRF, empat role 401/403, validasi body/query/bbox/header biaya, harga berubah, snapshot voucher, tidak ada saldo/stok negatif, isolasi histori/kode voucher dan analytics. |
| Regresi utama | **PASS**: login/logout empat role, sesi kedaluwarsa, pickup idempotency Phase 7, koordinat pickup/fasilitas dan aksesnya, tracking, grafik kontribusi, lifecycle edukasi, pengaturan/profil dan payout fields, upload/preview bukti/koreksi, navigasi mobile. |
| Maps Phase 8 | **PASS**: marker berdasarkan status Backend, detail/rute sesuai izin, fallback, reassignment cleanup, pencarian alamat, race A–B–A/abort, reset, aktivasi ulang, 500 recovery. Uji race geocoding memakai respons terkontrol; bukan jaminan ketersediaan Nominatim setiap saat. |
| Analytics/sebaran | **PASS**: angka dari API sesuai sesi; sel fasilitas approved, ambang 3 laporan, kategori/bbox/limit, pusat sel dan tabel. Tidak membuka koordinat pickup User atau mengklaim hotspot representatif. |
| UI final | **PASS**: halaman Phase 9 pada **1280px/390px**, navigasi/form/dialog/filter/pagination, empty/loading/error/retry, kode/status/masa berlaku, perubahan saldo, respons API yang diharapkan; tidak ada overflow halaman, uncaught JavaScript exception atau application `console.error`. Negative HTTP responses sengaja diuji. |

`go test ./...` dan `go vet ./...` **PASS**. Pemeriksaan syntax JS dan `git diff --check` **PASS**. API/migration lengkap Phase 1–7 dan 9 lulus pada fase Backend fixture awal; Backend tidak berubah sepanjang 9C. Percobaan browser gabungan awal berhenti karena asumsi dataset test lama, bukan kegagalan transaksi; setelah fixture dipisah, runner final selesai dengan exit 0.

Perintah final yang dijalankan: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase6b-fixture.ps1 -Phase9Finalization -Screenshots <output>`. Runner ini menjalankan baseline API, Phase 9 API, seluruh browser regression existing dan pemeriksaan akhir Phase 9B/9C. Suite API legacy lengkap dan suite browser memakai fixture terpisah agar data pengujian API tidak mengubah jumlah antrean yang sengaja diuji browser. Reproduksi API legacy lengkap secara terpisah dapat memakai switch existing `-SkipBrowser`.

Fixture browser final: `C:/Users/FIQRYF~1/AppData/Local/Temp/sampira-6b-fe-4c6b12e4734e4baba376c8cb872ba03c`; MariaDB `127.0.0.1:24367`, HTTP `127.0.0.1:24934`. Semua akun/data sintetis; proses fixture dihentikan runner. Tidak ada uji mutasi terhadap runtime/database utama 8080.

### Bug dan perbaikan 9C

1. **Panel privat kosong setelah sesi dicabut**: kode voucher/data Phase 9 dibersihkan, tetapi tidak ada petunjuk melanjutkan. Panel sekarang menampilkan pesan sesi berakhir dan tautan login, tanpa mengembalikan data privat dari request yang terlambat. Diuji dengan penonaktifan akun User yang sebenarnya di fixture; kode voucher tidak tersisa dalam DOM.
2. **Observer peta setelah sesi berakhir**: callback membaca canvas melalui query pada panel yang sudah dibuang. Canvas kini direferensikan secara aman; observer diputus, map/layer dibersihkan dan respons lama diinvalidasi saat session-ended/pagehide. Diuji dengan revokasi akun Admin ketika peta agregasi terbuka, termasuk penantian callback resize; tanpa error JavaScript.
3. **Kerapuhan fixture regression**: record historis tidak selalu di halaman pertama setelah dataset bertambah; pengujian memakai pencarian/filter nyata. Dataset API yang mengisi antrean global Admin dipisahkan dari browser yang memeriksa jumlah antrean tertentu. Tidak mengubah aturan aplikasi untuk memenuhi asumsi test.

Perubahan aplikasi 9C terbatas pada cleanup sesi/peta di `assets/js/contributions.js`; penguatan test menggunakan runner existing dan `scripts/check-phase9-frontend.mjs`. Backend, tarif, aturan poin, schema, Landing Page, Login/Register dan alur bisnis sebelumnya tidak diubah pada 9C.

### Bukti visual akhir

Direktori: `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9c-final/`.

- `phase9b/`: **52 screenshot**, 26 state desktop/mobile halaman baru, katalog/akun/form, konflik stok/biaya/saldo, kode dan analytics.
- `phase9c/`: **12 screenshot**, 6 state desktop/mobile siklus UI/foto, timbang, reward aktual, receipt serta sesi User/Admin berakhir. Render akhir ini ditinjau bersama bukti Phase 9B; tidak mengklaim semua halaman lama telah selesai didesain ulang.
- Contoh: [Reward aktual](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9c-final/phase9c/user-verified-reward-1280.png>), [Penukaran mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9c-final/phase9c/user-e2e-redemption-390.png>), [Sesi/peta dibersihkan](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase9c-final/phase9c/admin-session-ended-390.png>).

### Catatan deployment, batasan dan backlog Phase 10

- **Aktivasi lingkungan tujuan belum diverifikasi oleh 9C.** Build/restart Backend terbaru diperlukan jika runtime masih memakai binary sebelum guard biaya 9B. Verifikasi DB tujuan/backup terlebih dahulu: startup menjalankan migration existing termasuk 008 secara additive. Jangan menjalankan `db_init` untuk database existing; jangan menunjuk runner fixture ke database utama. 9C tidak menambah migration atau menyalakan ulang server utama.
- Voucher tetap **simulasi**, tidak berlaku di merchant; poin tidak dapat diuangkan. Reward paid hanya pencatatan transfer eksternal yang diverifikasi, bukan gateway. Tidak ada refund otomatis atau penerbitan kewajiban pengganti; pembatalan pending tetap diaudit.
- Poin prospektif mengikuti konfigurasi demonstrasi 10 poin/kg dan level 0/100/500. Pencarian/filter list Phase 9 berlaku pada data dimuat dengan pagination server; angka analytics seluruh waktu bukan satu snapshot transaksi lintas seluruh counter. Uji konkurensi fungsional ini bukan load test kapasitas produksi.
- **Backlog Phase 10:** deployment terkontrol dan smoke test empat role; pencarian/filter global server bila dibutuhkan; aturan poin/merchant/refund riil hanya setelah keputusan bisnis dan dukungan API; pengukuran kapasitas/operasional sesuai lingkungan tujuan. **Redesign besar Phase 8 tetap ditunda**, bukan dinyatakan selesai oleh hasil regression ini.

Tidak ada kegagalan fungsional atau bug kritis yang masih terbuka dari pengujian Phase 9. Catatan di atas membatasi klaim kesiapan deployment/layanan eksternal; source dan integrasi terisolasi memenuhi acceptance fungsional Phase 9.

### Tindak lanjut lapangan — foto hasil pemeriksaan

Setelah 9C, ditemukan ketidaksesuaian lingkungan yang tidak tercakup fixture foto kecil: database lokal memiliki `max_allowed_packet=1048576` (1 MiB), sementara form mengizinkan foto hingga 5 MiB. Reproduksi pada MariaDB terisolasi berbatas 1 MiB dengan lampiran PNG sintetis 1,4 MB memutus koneksi MySQL saat menyimpan BLOB dan menghasilkan notifikasi penanganan gagal.

Perbaikan: foto penanganan di atas 750 KiB dioptimalkan di browser menjadi JPEG maksimal 750 KiB, dengan penyesuaian resolusi/kualitas dan penjelasan di form. File asli di perangkat tidak diubah; foto kecil mempertahankan byte/format asal. Berlaku pada pemeriksaan, progres, hasil dan koordinasi yang memakai form bersama. Backend memeriksa kapasitas paket pada koneksi transaksi sebelum mutasi dan mengembalikan 413 yang jelas untuk unggahan mentah terlalu besar; status/versi tetap utuh. Tidak mengubah skema, data, atau konfigurasi MySQL utama. Guard Backend memerlukan binary terbaru; perbaikan upload browser cukup memuat ulang halaman.

`go test ./...` **PASS**. `check-phase6b-fixture.ps1 -HandlingPhotoOnly` **PASS** pada fixture `sampira-6b-fe-0e132138487f43908109a3bc08d6006a`: foto input 1,4 MB berhasil dioptimalkan/disimpan pada aksi `record_assessment`, bukti dapat dibaca akun berwenang, raw API oversized mendapat 413 tanpa perubahan versi/status. Seluruh regresi browser penanganan (penugasan/pengalihan, bukti, koreksi, publikasi/privasi, koordinasi, mobile/keyboard) ikut lulus. Reproduksi sebelum perbaikan memang gagal; hasil akhir exit 0.
