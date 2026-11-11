# Phase 10 — Integration Recovery

## Phase 10A — Integration Audit & Critical Bug Recovery

**Status akhir setelah Final Completion: PASS.** Runtime utama sudah memakai build terverifikasi. Mutasi end-to-end dilakukan pada fixture/clone; runtime utama diperiksa read-only setelah aktivasi. Bagian baseline berikut adalah kondisi sebelum aktivasi; hasil terbaru ada di subbagian Final Completion.

Tanggal pemeriksaan: 8 November 2026. Source tetap di `main`, baseline HEAD `b1d5b227ba44f148f5d87faa3697db97cfc9ef1b`.

### Baseline dan batas klaim

Snapshot awal berisi 22 file modified/untracked. Tidak ada file tersebut yang hilang; 17 tetap identik SHA-256. Lima file baseline mendapat perubahan terarah: `contributions.js`, `facility-handling.js`, `openapi.json`, dan dua runner browser/fixture. Perubahan Phase 7–9 lainnya dipertahankan, termasuk perbaikan foto dan `PHASE_09.md`. Tidak ada switch/merge/reset/rebase/commit/push, perubahan Landing/Login/Register, perubahan `.env`, atau penulisan database utama.

Audit utama dilakukan read-only; semua akun, mutasi, upload, transaksi, dan pengujian browser memakai MariaDB fixture baru. `db_init` hanya dipakai terhadap database fixture baru, tidak terhadap database existing.

| Pemeriksaan runtime utama | Hasil aktual |
| --- | --- |
| URL | `http://localhost:8080` |
| Proses | PID 23824, `C:\Users\FIQRYF~1\AppData\Local\Temp\go-build748970866\b001\exe\server.exe`, Go 1.24.6 |
| Umur binary | Ditulis `2026-11-08T03:57:31Z`, berjalan sejak `03:57:33Z`; source guard foto sudah diperbarui `05:10:19Z`. Binary lebih lama; build metadata tidak menyertakan revisi VCS, sehingga exact HEAD runtime tidak dapat dibuktikan. |
| Route tanpa sesi | GET facility reports, vouchers, analytics: **401**, bukan 404; ini membuktikan route tersedia, bukan membuktikan semua guard terbaru aktif. |
| Aset Frontend | `contributions.js` dan `facility-handling.js`: HTTP 200, SHA-256 cocok working tree sesudah perbaikan. `Last-Modified` ada; `Cache-Control` tidak ditetapkan. Halaman/tab yang sudah terbuka tetap perlu reload. |
| Database yang dikonfigurasi | `.env`: `localhost / ecorecycle`; tidak menyalin kredensial. Pemeriksaan SQL langsung terhadap database ini menggunakan SELECT saja. |
| Migrasi 006–008 | `pickup_requests` tersedia; name/email users berkolasi `utf8mb4_unicode_ci`; ketujuh tabel 008 tersedia. Tidak ditemukan bukti bahwa voucher hilang karena tabel 008 belum dibuat. Ini pemeriksaan struktur terarah, bukan sertifikasi seluruh schema produksi. |
| Kondisi terkait laporan | Satu handling berstatus `resolution_submitted`; voucher id 1 aktif, stok 29, biaya 100, masa berlaku mencakup waktu audit. |
| Batas paket / waktu | `max_allowed_packet=1048576`; waktu database lokal UTC+7. Katalog Backend membandingkan periode dengan `UTC_TIMESTAMP()`, sesuai penyimpanan UTC. |

Proses 8080 tidak dihentikan/direstart. Tidak melakukan login/mutasi menggunakan akun asli. **Pengujian fixture di bawah tidak merupakan klaim bahwa Backend terbaru sudah aktif di 8080.**

### Temuan, reproduksi dan perbaikan

| ID / prioritas | Reproduksi dan akar masalah | Perbaikan / hasil |
| --- | --- | --- |
| P0-01: hasil Petugas tersembunyi | User membuat laporan; Admin approve/assign; Petugas asesmen, tindakan, submit. GET handling Admin mengembalikan report yang sama dengan `resolution_submitted`, tetapi halaman awal memaksa filter `approved`. | Default menjadi semua status. Filter manual dan pagination tetap berfungsi; `resolution_submitted` tidak diubah otomatis menjadi completed. Admin tetap wajib validasi. |
| P1-01: detail antar-role stale | Admin membuka detail, Petugas memperbarui hasil melalui sesi lain; kembali ke tab tidak membaca ulang detail. API sudah terbaru tetapi teks UI lama. | Handling list/detail diperbarui saat fokus/visibility kembali, hanya saat workspace terlihat dan tidak ada dialog penanganan terbuka. Sequence guard existing dipertahankan. |
| P0-02: katalog User stale | User membuka Poin & Voucher, Administrator membuat voucher aktif dan sedang berlaku melalui sesi lain. GET `/api/vouchers` memuat voucher; Beranda → Poin & Voucher tetap memakai daftar lama. | Saldo, katalog, Voucher Saya dan ledger dimuat ulang saat halaman dibuka kembali atau tab kembali aktif. Tidak mengganggu dialog konfirmasi penukaran. Session-ended tidak memulai refresh baru. |
| P2-01: checkbox publikasi membingungkan | Form mengirim `active`, tetapi labelnya “Aktifkan voucher simulasi”. Tidak ada field mode simulasi yang dapat dipilih. | Label menjadi “Tampilkan voucher di katalog User”; petunjuk dan hasil simpan menjelaskan nonaktif/terjadwal/kedaluwarsa. Default nonaktif tidak diubah. Peringatan SIMULASI/tidak berlaku di merchant nyata tetap tampil. |
| P1-02: counter Admin salah setelah pagination | Buat 21 laporan lebih baru setelah satu hasil menunggu validasi. API analytics menghitung 1, counter UI menghitung hanya 20 baris pertama dan menampilkan 0. | Empat counter memakai `/api/analytics`, bukan cuplikan list. Tambah agregat Admin `handling_in_progress`; kegagalan/key tidak tersedia ditandai `—`, bukan angka nol palsu. Ringkasan diperbarui ketika tab kembali aktif. |
| P0-03: mismatch runtime | Aset live mengikuti working tree, tetapi binary mendahului guard Backend terbaru. Mengganti Frontend saja tidak mengaktifkan guard foto/biaya/agregat Go terbaru. | Build dan pembuktian integrasi memakai runtime fixture terbaru. **Aktivasi Backend utama BLOCKED/deferred**, sesuai larangan restart/migrasi utama otomatis. Prosedur terkontrol ada di bawah. |

Tidak mengubah aturan poin, filter masa berlaku UTC, transaksi penukaran, RBAC, state machine, schema, atau kontrak foto. Voucher stok nol tetap dapat ditampilkan dengan status habis sesuai query existing; inactive/future/expired tidak masuk katalog User.

### File yang diubah untuk 10A

- `assets/js/facility-handling.js`: filter awal dan refresh lintas tab untuk antrean/detail.
- `assets/js/contributions.js`: refresh Poin & Voucher, label/petunjuk publikasi, hasil simpan dan guard sesi.
- `assets/js/admin-workspace.js`: counter agregat dan refresh ringkasan.
- `internal/handlers/contribution_analytics.go`: satu agregat Admin tambahan; `docs/openapi.json` menambahkan deskripsinya.
- `scripts/check-phase10-integration.mjs`: reproduksi sebelum/sesudah, sesi lintas aktor, pagination, persistence dan screenshot.
- `scripts/check-phase1-browser.mjs`, `scripts/check-phase6b-fixture.ps1`: opsi Integration10 dan port fixture yang dapat dipilih; mempertahankan runner lama. Fixture berhenti bila port dipakai, tidak membunuh listener tak dikenal.

### Bukti sebelum dan sesudah

Root bukti di luar repository: `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/`.

1. `phase10a-before/phase10a/integration-observations.json`: antrean awal Admin, refresh detail, katalog saat navigasi/focus, dan kejelasan checkbox semuanya **false**. Report fixture id 4 dan voucher id 9. Test gagal sebagaimana diharapkan sebelum perbaikan.
2. `phase10a-counter-before/phase10a/integration-observations.json`: empat masalah sinkronisasi sudah true; reproduksi counter pagination masih **false**, lalu diperbaiki menggunakan agregat. Assertion label kemudian diperjelas agar membaca label checkbox, bukan seluruh petunjuk simulasi.
3. `phase10a-final/phase10a/`: screenshot Admin detail/ringkasan/validasi, katalog User, dialog publikasi Administrator, beserta observasi final. Ukuran 1280 dan 390 px; pemeriksaan overflow horizontal otomatis. Screenshot ringkasan Admin, dialog publikasi desktop, Poin & Voucher mobile, histori tindakan Admin serta dialog penukaran sukses mobile ditinjau secara visual.

Pengujian baru memakai satu ID laporan melalui assignment → asesmen → tindakan → submit → revisi → tindakan ulang → submit → validasi UI Admin → pembacaan User. Catatan internal tidak muncul pada respons User. Setelah login ulang dan memuat halaman kedua, laporan tetap dapat dibuka. Pengiriman antar-sesi menggunakan API aplikasi asli, bukan update SQL. Pengujian existing melengkapi pembuatan/pengiriman melalui form, foto, dan penukaran melalui UI.

### Pengujian akhir

Status suite akhir: **PASS**, runner exit **0** pada fixture `C:/Users/FIQRYF~1/AppData/Local/Temp/sampira-6b-fe-a817b404e9e44672a6b42faab0f17e8c`. MariaDB `127.0.0.1:24375`, HTTP `127.0.0.1:24942`, database `sampira_phase1_test` dan database migrasi sintetis. Runner menghentikan proses fixture setelah selesai; URL fixture bukan server permanen.

Perintah reproduksi dari working tree `main`:

```powershell
powershell.exe -NoProfile -File scripts/check-phase6b-fixture.ps1 -Integration10 -DatabasePort 24375 -ServerPort 24942 -Screenshots "C:\Users\FIQRY FIRMANSYAH\.codex\visualizations\2026\11\05\01a1ad5d-f300-7af2-8431-4d188d8eeb81\phase10a-final"
```

Keenam observasi final **true**: antrean awal Admin, refresh detail, counter validasi global, katalog saat kembali halaman, katalog saat fokus, dan label publikasi. Report dan voucher final berasal dari fixture baru; lihat JSON final untuk ID-nya. Assertion exception JavaScript dan application console error sama-sama kosong. Respons API positif/negatif diperiksa terhadap status yang diharapkan; HTTP 500 dan putus respons tertentu sengaja diinjeksikan untuk pengujian recovery, bukan kegagalan tak terjelaskan.

- `go test ./...`: **PASS**; `go vet ./...`: **PASS**. Syntax JS dan `git diff --check` lulus.
- Backend fixture: auth empat role, sesi/CSRF/ownership, penimbangan/reward, concurrency/idempotency pickup Phase 7, poin/voucher Phase 9 termasuk rollback, duplikasi, stock/balance race, expired/inactive/future, kode privat, analytics berizin, perubahan role dan session revocation.
- Browser penanganan: penugasan/pengalihan, stale version, asesmen/tindakan/bukti, revisi dan validasi, publikasi/privasi, koordinasi eksternal, mobile/keyboard.
- Browser Phase 9B/9C: CRUD voucher, akun, penukaran nyata, respons hilang lalu retry tepat sekali, konflik stok/harga/saldo, transaksi, siklus pickup → timbang → poin/reward, mobile navigation dan pembersihan data privat saat sesi dicabut.
- Education dan Maps: lifecycle artikel, pencarian/detail, izin peta, marker/status, koordinat, address-search stale response/reset, dan regresi Leaflet existing.

Percobaan gabungan sempat berhenti karena asumsi fixture lama: jumlah Petugas harus tepat dan peta memerlukan pickup yang belum selesai. Runner akhir menjalankan suite lama sebelum fixture pagination baru, menyiapkan pickup peta melalui API, dan menunggu respons halaman kedua dengan ID/title tepat. Tidak mengubah produk atau memanipulasi database agar assertion lulus. Port lama juga sempat tertahan listener PID 0; dipilih port terisolasi lain, tanpa kill proses yang tidak dikenal.

### Aktivasi, risiko dan pekerjaan tersisa pada audit awal

1. Untuk memakai perubahan UI pada 8080, reload penuh halaman. Katalog diperbarui saat masuk halaman/kembali fokus; ini bukan live push/polling terus-menerus pada dua tab yang sama-sama tidak kehilangan fokus.
2. **Backend utama belum diganti.** Counter baru `handling_in_progress`, guard biaya/unggahan dan perbaikan Backend sebelumnya memerlukan build/start versi terbaru. Pada binary lama, field agregat yang belum tersedia ditampilkan `—` dengan state parsial; tidak diklaim nol.
3. Aktivasi terkontrol: simpan backup database konsisten dan binary/config lama di luar repository; cocokkan schema 006–008 pada clone; build executable terbaru dan catat hash/HEAD+dirty source; identifikasi ulang PID pemilik 8080; baru lakukan penggantian proses dalam maintenance yang disetujui. Startup menjalankan migrasi additive existing, sehingga tidak diasumsikan read-only dan tidak dilakukan otomatis. Jangan menjalankan `db_init` terhadap ecorecycle.
4. Sesudah aktivasi, smoke-test empat role pada origin yang sama, hasil/foto laporan, harga/stock/saldo voucher dan counter. Rollback aplikasi memakai binary dan aset sebelumnya dengan konfigurasi yang sama; jangan downgrade/drop schema. Pemulihan backup database hanya bila benar-benar perlu melalui prosedur terpisah, bukan reset otomatis.
5. Tidak menguji merchant/payment provider nyata. Voucher tetap simulasi; pembayaran reward tetap pencatatan eksternal. Tidak ada audit dekoratif, redesign Phase 8, audit repository menyeluruh atau SonarQube dalam 10A.

### Kesimpulan audit awal, sebelum Final Completion

**PASS WITH NOTES untuk perbaikan source dan integrasi fixture**: bug laporan/voucher direproduksi lalu lolos uji browser lintas role; counter pagination diperbaiki; regresi relevan lulus. Tidak ada P0/P1 source yang masih gagal dalam cakupan pengujian ini. **Penerimaan runtime utama tetap BLOCKED**, sebab binary 8080 belum diaktifkan ulang dan smoke test empat role pada lingkungan utama belum dilakukan. Ini bukan PASS penuh untuk server utama. Tindak lanjut 10B/operasional: aktivasi terkontrol, smoke test lingkungan tujuan, serta audit keamanan lebih luas; provider eksternal dan load test produksi belum diverifikasi.

### Phase 10A — Final Completion

Bagian ini memperbarui kondisi audit sebelumnya, tanpa mengulang implementasi atau memulai Phase 10B.

#### Pemulihan pembayaran reward Administrator — P1

Endpoint existing adalah `POST /api/ecorecycle/process_payout`, khusus **Administrator**. Alur: `#reward-payment-form` → `reward-payments.js` / `portalFetch` → session/CSRF → `ProcessPayoutHandler` → `pickup_rewards`. Input kontrak: pickup_id, nominal persis, referensi transfer unik, proof gambar dan confirm_payment=true. Metode/rekening tujuan bukan field transfer pada kontrak endpoint ini; operator tetap memverifikasi penerima dan transfer eksternal secara manual. Tidak menambah gateway atau menyatakan dana dikirim aplikasi.

**Reproduksi sebelum perbaikan:** MariaDB fixture `max_allowed_packet=1048576`, reward pending dan PNG valid dengan padding 1,4 MB. API mengembalikan **500**, koneksi MySQL terputus, pembayaran lewat browser gagal; submit form dua kali menghasilkan dua request. Bukti: `phase10a-payment-before/reward-payment/observations.json` (`raw_code=500`, `browser_paid=false`, `browser_request_count=2`). Reward tetap pending, bukan paid palsu.

**Akar masalah dan perubahan minimal:**

- Jalur pembayaran menerima gambar sampai 5 MB dan langsung menulis BLOB tanpa memeriksa kapasitas paket database. Handler kini membuka transaksi, membaca `@@max_allowed_packet` pada koneksi yang sama, menolak ukuran melampaui kapasitas minus cadangan 64 KiB dengan **413 sebelum mutasi**, lalu melakukan conditional UPDATE pending+nominal dan commit. Semua error keluar melalui rollback. Unique reference/digest dan pemeriksaan RowsAffected tetap mencegah pembayaran ganda.
- Form menggunakan helper optimasi gambar existing: file besar menjadi JPEG maksimal 750 KiB, file kecil mempertahankan byte asli, file sumber di perangkat tidak berubah. Pratinjau dan penjelasan meminta operator memeriksa keterbacaan. Ada guard submit in-flight; validasi nominal, konfirmasi dan bukti tetap wajib.
- Pesan 400/401/403/409/413/500 serta respons non-JSON/koneksi gagal ditangani aman. Status paid tidak diubah secara optimistis. Pada hasil yang belum pasti, form meminta pemeriksaan riwayat dan membaca kondisi server terbaru; tidak melakukan auto-payment retry.
- Riwayat Administrator menampilkan referensi, waktu WIB, pelaksana dan tautan bukti privat. Tampilan baru mengungkap offset waktu tujuh jam: TIMESTAMP database lokal dibaca driver seolah UTC. Pembacaan `paid_at` sekarang melalui UNIX_TIMESTAMP lalu `time.Unix(...).UTC()`, tanpa mengubah nilai database atau timezone global. Test memastikan waktu respons merepresentasikan saat pembayaran sebenarnya.
- API sudah paid tetapi menu Reward Saya yang pernah dibuka masih memakai cache. Reproduksi sesudah perbaikan upload berhenti pada assertion status User stale. Kini daftar dan ringkasan reward dibaca ulang saat navigasi masuk/fokus kembali; guard sesi tetap berlaku.

File perbaikan pembayaran: `internal/handlers/reward_payment_handler.go`, `assets/js/reward-payments.js`, `assets/js/contributions.js`, `app/Views/administrator.html`, `docs/openapi.json`. Test baru `scripts/check-reward-payment.mjs` diintegrasikan ke runner browser dan fixture existing. Tidak ada schema baru.

| Skenario aktual | Hasil |
| --- | --- |
| Pending → pembayaran UI valid dengan foto 1,4 MB, database paket 1 MiB | **PASS**: optimasi JPEG, paid setelah commit, bukti dapat diunduh dan ≤750 KiB |
| Submit ganda | **PASS**: browser mengirim tepat satu request |
| Bukti mentah melebihi paket database | **PASS**: 413, reward tetap pending |
| Bukti kosong/isi gambar salah, konfirmasi tidak valid, referensi terlalu pendek | **PASS**: 400, tidak paid |
| Nominal berbeda / reward sudah paid | **PASS**: 409, tidak membayar ulang |
| Dua pembayaran bersamaan | **PASS**: satu 200, satu 409 |
| Gangguan DB melalui trigger fixture yang menolak UPDATE | **PASS**: 500 aman; status pending, proof/reference/paid_by tetap NULL; trigger dilepas di finally |
| Tanpa sesi / role Admin yang tidak berwenang | **PASS**: 401 / 403 |
| Bukti privat oleh User pemilik / Petugas lain | **PASS**: 403; endpoint bukti memang Administrator-only |
| Referensi, pelaksana, waktu, proof tersimpan | **PASS**: diperiksa langsung pada DB fixture dan API; paid_at mendekati waktu aktual |
| User kembali ke Reward Saya, refresh, Administrator login ulang | **PASS**: status paid dan riwayat tetap benar |

Targeted final exit **0**: fixture `sampira-6b-fe-cbfbb4fd4ef14412a82dcf79fc401153`, DB `24411`, HTTP `24987`; bukti `phase10a-payment-final/reward-payment/`. `raw_code=413`, `browser_paid=true`, `browser_request_count=1`. Screenshot Administrator desktop dan Reward Saya mobile diperiksa. Pengujian valid/invalid lain memeriksa respons Backend asli; gangguan DB hanya pada fixture.

Satu regresi gabungan selesai exit **0** pada `sampira-6b-fe-6e3c9de67eb94513967ec27c5daf2f5e`, DB `24409`, HTTP `24983`, `max_allowed_packet=1 MiB`: Phase 2/6/7/9 API, UI penanganan, UI Phase 9B/9C, edukasi, Maps Phase 8, integrasi Phase 10A dan pembayaran. Artefak: `phase10a-completion-final/`. Setelah koreksi khusus pembacaan timestamp, targeted pembayaran, `go test ./...`, `go vet ./...` dan smoke clone diulang dan **PASS**; suite besar tidak diulang tanpa kebutuhan. Tidak ada uncaught JavaScript exception/application console error pada runner yang lulus.

##### Hotfix pembayaran HTTP 400 — validasi referensi

**Status hotfix: PASS pada source dan fixture; aktivasi Backend utama belum dilakukan.** Hotfix ini tidak melakukan restart, pembayaran pengujian atau mutasi terhadap database utama, dan tidak mengulang audit Phase 7–10.

**Akar masalah:** kondisi gabungan di `ProcessPayoutHandler` menolak salah satu ID/amount/reference/confirm_payment dengan pesan yang sama. Payload `pickup_id=10`, `amount=260000`, `reference=BCA BRI WELL`, proof PNG valid, `confirm_payment=true` direproduksi persis pada fixture dan mendapat 400 dengan pesan gabungan lama. Multipart berhasil diparsing; ID positif, nominal integer dan konfirmasi literal true memenuhi format. **Spasi di dalam referensi** gagal terhadap aturan existing `^[A-Za-z0-9][A-Za-z0-9._/-]{5,99}$`, sebelum lookup/update reward. Bukan masalah paket upload pada request ini.

Aturan referensi tidak dilonggarkan: 6–100 karakter ASCII, diawali huruf/angka, hanya huruf/angka dan `. _ / -`; spasi internal tetap ditolak. Operator harus memakai nomor referensi transaksi asli, bukan mengubah deskripsi transfer menjadi referensi buatan. Trim whitespace di tepi tetap mengikuti perilaku existing. Nominal tetap maksimal 13 digit dengan maksimal dua desimal memakai titik; nominal harus sama persis dengan kewajiban pending agar pembayaran dapat dicatat.

Perubahan minimal:

- `internal/handlers/reward_payment_handler.go`: pecah penolakan 400 menjadi pesan spesifik ID, format nominal, format referensi, atau konfirmasi. Regex, pemeriksaan nominal pending, RBAC, transaksi, unique proof/reference dan guard upload tetap sama.
- `assets/js/reward-payments.js`: validasi referensi/nominal dengan regex dan trimming yang sama sebelum POST, `setCustomValidity`, `aria-invalid` dan pesan pada status form; validasi diperbarui saat input diperbaiki. Referensi dengan spasi tidak mengirim request.
- `app/Views/administrator.html`: petunjuk referensi asli/tanpa spasi, hubungan aksesibilitas petunjuk, serta versi URL JS baru agar browser mengambil validator terbaru. Tidak ada redesign.
- Test pembayaran existing diperluas pada `scripts/check-reward-payment.mjs`. Runner `RewardPaymentOnly` kini melewati suite API Phase lain melalui dependensi fixture `scripts/check-phase6b-fixture.ps1` / `scripts/check-phase1-migration.mjs`; hanya persiapan database sintetis dan targeted pembayaran yang dijalankan.

Hasil targeted yang benar-benar dijalankan:

| Kasus | Hasil |
| --- | --- |
| Payload persis dari DevTools, termasuk `BCA BRI WELL` | 400, sekarang pesan spesifik “Referensi transfer… Spasi tidak diperbolehkan.” |
| Kontrol `260000` / `260000.00` dengan referensi berformat valid | Lolos validasi format; masuk pemeriksaan kewajiban (409 pada ID/nominal yang tidak cocok di fixture), bukan 400 |
| Nominal koma, scientific notation, negatif, tiga desimal | 400 spesifik nominal |
| confirm_payment=`on` | 400 spesifik konfirmasi; hanya literal `true` diterima |
| Referensi berspasi pada form Administrator | Browser menolak dengan pesan spesifik; **nol POST pembayaran** |
| Referensi diperbaiki, bukti valid, nominal sesuai reward fixture | Browser berhasil, status paid tersimpan, bukti/reference/actor/waktu diperiksa; submit ganda hanya satu request |
| Duplicate dan concurrent payout | Duplicate 409; concurrent satu 200 dan satu 409 |
| Gangguan database | 500 aman dan rollback; reward pending, metadata pembayaran tidak tersimpan |
| Bukti salah/kosong, tanpa sesi, role tidak berwenang, bukti privat | Ditolak sesuai 400/401/403; guard paket 413 tetap lulus |
| Reward Saya, refresh dan login ulang | Status pembayaran sesuai Backend dan tetap tersimpan |

Reproduksi sebelum fix gagal sebagaimana diharapkan: `payment-reference-before/reward-payment/reference-400.json`. Targeted akhir exit **0**, fixture `sampira-6b-fe-623d8af538a44c4388f9573a3e0db269`, DB `127.0.0.1:24423`, HTTP `127.0.0.1:24993`. Bukti di root visualisasi yang sama: `payment-reference-final/reward-payment/`, termasuk screenshot validasi invalid desktop/mobile yang ditinjau. `go test ./internal/handlers`, `go vet ./internal/handlers`, syntax JS dan diff whitespace check **PASS**. Tidak menjalankan kembali seluruh suite fungsional.

**Runtime utama saat hotfix diperiksa ulang:** CIM TCP 8080 mengidentifikasi PID **10816**, executable `C:/Users/FIQRYF~1/AppData/Local/Temp/go-build3991578502/b001/exe/server.exe`, SHA-256 `DDF27F2FECCDE3972A86617B2E895F4E3F59FE92BEBACA4623EDA0F0942D580F`. Binary masih memuat pesan gabungan lama dan belum memuat pesan referensi baru. JS pembayaran yang disajikan lewat HTTP cocok hash working tree; validator Frontend tersedia setelah reload, tetapi **pesan Backend baru belum diaktifkan pada localhost:8080**. Tidak ada klaim hotfix Backend sudah selesai di server utama. Aktivasi ditunda sesuai larangan restart otomatis pada permintaan hotfix ini. Pembayaran tetap pencatatan manual transfer eksternal, bukan transfer uang otomatis. Tidak commit/push dan tidak mengubah reward/poin/voucher.

#### Backup, restore, build dan migrasi

- Identifikasi ulang lewat CIM TCP `LocalPort=8080`: pemilik PID **23824**, executable Go lama `go-build748970866/b001/exe/server.exe`; tidak mengandalkan PID catatan lama saja.
- Backup dibuat dengan `mysqldump --single-transaction --skip-lock-tables --routines --events --triggers --hex-blob`; seluruh tabel sumber InnoDB. Dump mencakup schema dan data, tidak mengarahkan restore ke database utama. Ukuran **1.524.973 byte**, SHA-256 `7165be916f697d9a1596ade048e182f0172bf647a8ef53c510afe32f5db0e623`.
- Restore pada MariaDB terisolasi port **24401** berhasil; **24 tabel** cocok jumlah baris dan checksum. Binary dan `.env` lama beserta snapshot views/assets/uploads tersimpan privat di luar repository, dengan ACL hanya akun saat ini dan SYSTEM. Tidak menampilkan kredensial atau isi konfigurasi.
- Lokasi privat: `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase10a-completion-private/`. Verifikasi ada di `backup-verification.json`; dump/config bukan artefak publik atau isi repository.
- Build final: `server-main-final.exe`, SHA-256 **`a1a13095378c8c1f61337b2f7b487ac751a74f8031e321046570213dd8e55635`**, dibuat dari working tree main dengan perubahan belum di-commit. HEAD tetap `b1d5b227ba44f148f5d87faa3697db97cfc9ef1b`; hash executable membedakan build ini dari HEAD bersih.
- Build final diuji terhadap restore baru `sampira_clone10a_verified_final`, HTTP `127.0.0.1:24985`. Startup migrasi 006–008 berhasil dan **jumlah baris/checksum data existing tetap identik sebelum akun sintetis ditambahkan**. Empat role login/logout, pickup/timbang/reward/payment, laporan/penugasan/bukti/review, katalog/guard harga/retry penukaran dan agregat Admin terbaru seluruhnya PASS. Manifest `clone-smoke.json` mengikat hasil tersebut ke hash binary final.
- Clone berisi salinan data utama, tetapi semua mutasi QA memakai akun/record sintetis baru pada clone saja. Tidak ada pembayaran palsu, reset atau perubahan status reward asli pada ecorecycle.

#### Rencana pergantian runtime dan rollback

Aktivasi yang telah diotorisasi dijalankan melalui script privat `activate_main.py`. Script: memverifikasi backup+smoke+hash binary, memastikan `.env` tidak berubah, mengidentifikasi ulang pemilik 8080 dan hash executable, mencatat jumlah baris/checksum utama, lalu hanya mengganti proses SAMPIRA tersebut. Startup gagal akan menjalankan binary backup dengan konfigurasi semula; tidak merestore/reset DB secara otomatis. Sesudah startup sukses, script memeriksa PID/executable baru, route terlindungi, hash aset working tree, serta jumlah baris/checksum utama.

**Aktivasi utama: PASS, setelah persetujuan eksplisit pengguna** untuk mengganti runtime 8080 dan menjalankan migrasi startup yang sudah lolos pada clone.

| Bukti setelah aktivasi | Hasil aktual |
| --- | --- |
| Origin utama | `http://localhost:8080` |
| Proses | PID baru **23076**, menggantikan hanya PID SAMPIRA **23824** yang diidentifikasi ulang dari CIM TCP |
| Executable aktif | Folder privat di atas, `server-main-final.exe` |
| Identitas build | SHA-256 `a1a13095378c8c1f61337b2f7b487ac751a74f8031e321046570213dd8e55635`, **sama persis** dengan build yang menjalani smoke test restore clone |
| Source | main HEAD `b1d5b227ba44f148f5d87faa3697db97cfc9ef1b` + perubahan working tree; 62 input Go/mod/migration tercatat SHA-256 dalam manifest privat |
| Database | Tetap `ecorecycle`; `.env` identik dengan sebelum aktivasi |
| Integritas data utama | Jumlah baris dan checksum **seluruh 24 tabel** identik tepat sebelum pergantian dan sesudah startup |
| Frontend | Hash JS payments/contributions/handling/admin-workspace dari HTTP cocok working tree; helper upload 200 |
| API tanpa sesi | Facility reports, vouchers, analytics, User rewards dan Administrator rewards: **401**, bukan 404 |
| Proteksi portal tanpa sesi | Dashboard User, Petugas, Admin, Administrator: **303 → /login** |
| Backup/rollback | Tersedia; rollback tidak perlu dipakai karena startup dan pemeriksaan berhasil |

Bukti privat: `runtime-after.json`, `main-readonly-checks.json`, `clone-smoke.json`, `backup-verification.json`, `build-source-fingerprint.json`. Aktivasi dibuktikan dengan pemilik port, executable/hash yang sama dengan clone teruji, kompatibilitas startup, kesamaan data dan aset; bukan sekadar HTTP 200.

Tiga proses Go clone dan MariaDB clone port 24401 sudah dihentikan setelah verifikasi identitas; proses utama PID 23076 dikecualikan. Backup, hasil restore dan log dipertahankan. Server utama berjalan di background dari working directory proyek; binary berada di folder privat, bukan executable go-build sementara. Perubahan Backend berikutnya tetap memerlukan build/restart terkontrol; view/aset dilayani dari working tree. Muat ulang penuh browser untuk menghindari modul yang sudah ter-cache.

**Kesimpulan Final Completion: PASS dalam cakupan lingkungan yang dinyatakan.** Source/runtime utama sinkron, backup/restore dan migrasi kompatibel, laporan/voucher/counter serta pembayaran reward lulus pada build yang sama. Tidak ada P0/P1 source yang masih terbuka dari pengujian ini. Pengujian login/logout dan mutasi lintas role dilaksanakan di clone/fixture memakai data sintetis; pemeriksaan server utama sesudah aktivasi read-only. **Tidak menguji pembayaran palsu, menukar voucher sintetis, atau membuat laporan pengujian pada database utama.** Pengujian merchant/transfer uang nyata dan kapasitas produksi tidak dilakukan. Tidak ada commit/push atau pekerjaan Phase 10B.

## Phase 10B — Comprehensive QA & Security

**Status: PASS WITH NOTES — source/fixture lulus; aktivasi Backend utama pending dan SonarQube belum diverifikasi.** Pemeriksaan tanggal 8 November 2026, tetap pada `main`, HEAD `b1d5b227ba44f148f5d87faa3697db97cfc9ef1b`. Catatan runtime 10A di atas bersifat historis; hasil read-only terbaru ada di bagian ini.

### Baseline, scope dan matriks risiko

Baseline menyimpan SHA-256 30 file modified/untracked pada awal 10B. Tidak ada file baseline yang hilang. Semua perubahan 7–10A dipertahankan; tidak switch/merge/rebase/reset/commit/push, tidak mengubah Landing/Login/Register, tidak redesign, tidak menulis/migrasi/pembayaran percobaan pada `ecorecycle`, dan tidak restart server utama. Pengujian memakai akun sintetis dan MariaDB/Chromium terisolasi.

| Area / role | Risiko dan pemeriksaan yang benar-benar dilakukan | Hasil |
| --- | --- | --- |
| Registrasi/login/sesi, empat role | Validasi/normalisasi/duplicate registrasi; login/logout, expiry, deaktivasi/perubahan role, revocation; cookie HttpOnly/SameSite/Path; limiter dan spoofed forwarded header | PASS pada fixture |
| Pickup User → Petugas → User | Idempotency/concurrent claim, kepemilikan, status ilegal, koordinat, tracking, upload/cleanup; estimasi 20 kg vs aktual 2 kg, satu kredit poin dari aktual | PASS |
| Fasilitas User → Admin → Petugas → Admin → User | Verifikasi, assignment/reassignment dan konflik, asesmen/tindakan/foto, submit/revisi/review/completion, publikasi bukti/catatan yang diizinkan | PASS API dan browser |
| Pembayaran Administrator → User | Nominal/referensi/konfirmasi, proof, packet 1 MiB, pending/paid/void; double click, concurrency, rollback DB, privasi bukti dan refresh User | PASS, pencatatan manual saja |
| Poin/voucher/Administrator audit | Kredit tunggal, stock/balance race, saldo tidak negatif, retry, perubahan harga, expiry/inactive/future, kode privat, timestamp ledger/receipt/audit | PASS |
| Admin/Administrator operasional | Akun/role, kewenangan, tugas aktif sebelum deaktivasi, audit, counter agregat, pagination, statistik dan peta berizin | PASS |
| Edukasi dan rendering input | Draft/publish/archive, filter/search/detail, validasi SQL/XSS, rendering teks voucher berisi img/onerror secara literal | PASS |
| Profil dan data privat | Read/update profile sesuai sesi, query owner override tidak dapat mengambil wallet orang lain, bukti/kode privat terisolasi | PASS pada skenario API/regresi |
| Leaflet & recovery UI | Marker/status, ulang aktivasi, stale geocode/reset, HTTP 500 recovery, navigasi mobile dan sesi berakhir | PASS; provider eksternal bukan load/SLA test |

Review source terarah memeriksa parameterized SQL pada transaksi/ownership; validasi ID/query whitelist; rendering textContent/escaping dan popup Leaflet; guard origin untuk mutasi cookie; MIME berdasarkan isi, ukuran, nama storage acak, akses foto privat dan traversal; response no-store serta error generik. Bukti pengujian dibatasi pada skenario dalam tabel, bukan klaim seluruh aplikasi bebas celah.

### Temuan baru dan perbaikan

| ID / severity | Reproduksi dan akar masalah | Perubahan minimal / retest |
| --- | --- | --- |
| 10B-01 **P1 — login tanpa throttle** | 35 password salah pada fixture tetap 401; tidak ada Retry-After/429. Login langsung memproses credential tanpa pembatas, sehingga brute-force/pekerjaan bcrypt berulang tidak dibatasi. | Limiter per peer socket: 30 kegagalan atau request in-flight per 60 detik, 429 + Retry-After. Login sukses melepaskan slot; pergantian port client/X-Forwarded-For tidak mereset budget. Map dibatasi 1024 peer, expired entries dibersihkan. Unit test expiry, release idempotent/old-window, batas memori, serta 100 request concurrent. API akhir: 30 kali 401 lalu 429, spoofed header tetap 429. |
| 10B-02 **P1 — waktu transaksi/audit salah** | Dengan database `+07:00`, created_at pada ledger poin, Voucher Saya, dan audit bergeser +7 jam dari UNIX_TIMESTAMP server. Kolom TIMESTAMP dipindai sebagai waktu/string berlabel UTC walaupun MySQL mengembalikan nilai lokal. | Baca UNIX_TIMESTAMP(created_at), lalu time.Unix(...).UTC() sebelum JSON. Tidak mengubah data, konfigurasi timezone, valid_from/valid_until DATETIME, aturan poin, harga atau periode voucher. Ketiga respons kini merepresentasikan instant yang sama dengan epoch DB; UI tetap memformat WIB. |
| 10B-03 **P2 — refresh setelah revocation** | Dedicated Admin dideaktivasi melalui Administrator; request analytics mendapat 401 dan menghapus DOM privat. Event cash-updated sesudahnya menjalankan load dan mengakses elemen analytics yang sudah dihapus, menghasilkan uncaught promise exception. | Guard ended/isConnected sebelum load menyentuh DOM. Retest memakai pencabutan akun nyata pada fixture: tidak ada exception, konten privat tetap dihapus, tautan login kembali tersedia. |

Tidak ditemukan P0 pada skenario yang dijalankan. Tidak ada P0/P1 source yang masih terbuka dari temuan 10B ini; tidak melakukan refactor kosmetik atau mengubah assertion untuk menutupi bug produk.

File produk: `internal/handlers/auth_handler.go`, `internal/handlers/login_limit.go`, `internal/handlers/contributions.go`, `internal/handlers/contribution_analytics.go`, `assets/js/contributions.js`. Unit baru `internal/handlers/login_limit_test.go`; target API/browser `scripts/check-phase10b-security.mjs` dan integrasi runner existing. Tidak menambah dependency/framework atau schema.

### Reproduksi, targeted tests dan regresi

Root artefak di luar repo tetap `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/`:

- `phase10b/baseline.json`: HEAD dan checksum baseline.
- `phase10b-before/phase10b/security-observations.json`: enam observasi gagal sebelum fix (tiga timestamp, exception setelah revocation, throttle dan spoof bypass).
- `phase10b-targeted/phase10b/`: keenam observasi **true** sesudah fix, exit **0**; fixture `sampira-6b-fe-829a0282dcbc45e9b5bb5acb16d01df1`, DB `24433`, HTTP `25003`.
- Regresi final exit **0**, fixture `sampira-6b-fe-a64fcf0d7aee41c4bb39a3572ff6b710`, MariaDB `127.0.0.1:24439`, HTTP `127.0.0.1:25007`, paket 1 MiB dan timezone eksplisit +07:00. Artefak `phase10b-final/`: Phase 9B/9C, Phase 8, integrasi 10A, pembayaran dan `phase10b/security-observations.json`.

Regresi menjalankan API auth/role/session/CSRF, bobot/reward/payment, Phase 6/7/9, lalu browser penanganan, Phase 9B/9C, edukasi, Maps, 10A, hotfix referensi pembayaran dan security 10B. Kredit 2 kg aktual menghasilkan +20 poin walaupun estimasi 20 kg; repeat verify 409 dan satu source_key ledger. Penukaran retry tidak mendebit dua kali; user_id override tidak mengembalikan wallet lain; kode privat User lain tidak muncul. Voucher text berisi img/onerror tampil literal dan tidak membuat elemen img/script berjalan.

Tambahan boundary: query limit negatif/berulang dan SQL-like cursor/ID ditolak, tanpa detail SQL; mutasi cookie cross-site 403; ekstensi salah, MIME palsu/tidak cocok dan upload >5 MB ditolak tanpa pickup baru; traversal `.env` pada route upload 404. Browser meninjau sesi dicabut dan riwayat poin pada desktop/mobile; screenshot hasil render diperiksa. Semua assertion uncaught JavaScript exception/application console error kosong pada run final. Beberapa HTTP 400/401/403/409/413/500 sengaja dihasilkan oleh negative/recovery tests dan bukan disembunyikan sebagai sukses transaksi.

Percobaan regresi pertama berhenti pada stale-voucher test. Database fixture membuktikan kandidat tersimpan aktif, stok positif dan periode valid. Aksi tes mengklik tombol retry ketika masih disabled oleh refresh navigasi sebelumnya. Helper tes kini menunggu tombol aktif sebelum klik; **assertion kandidat terlihat, penolakan stale price/stock/expiry, dan perubahan saldo/stok tetap sama**. Produk tidak diubah untuk kasus timing harness ini. Regresi diulang karena kegagalan tersebut, kemudian lulus; tidak menjalankan suite besar lagi sesudah PASS.

Coverage penutup profil/payout juga exit **0** pada targeted fixture `sampira-6b-fe-fb42322044c94aac9b069ef2cf14e5a1`, DB `24441`, HTTP `25009`, artefak `phase10b-targeted-final/phase10b/`: simpan profil bank valid pada akun sintetis, body user_id menunjuk akun lain tetap hanya mengubah pemilik sesi, akun lain identik sebelum/sesudah, tidak ada password/token pada respons, metode payout tidak didukung dan detail bank tidak lengkap ditolak 400. Ini tambahan targeted coverage; regresi besar tidak diulang.

`go test ./...` **PASS**, `go vet ./...` **PASS**; syntax JS yang diubah dan diff whitespace check lulus. Concurrency limiter dibuktikan unit goroutine/mutex; tidak mengklaim hasil race detector atau load test kapasitas produksi.

### SonarQube dan runtime utama

Tidak ditemukan report/config scanner SonarQube atau lint JS terkonfigurasi dalam pencarian file terarah; CLI sonar-scanner tidak terdeteksi. GET lokal `/api/system/status` port 9000 tidak dapat dijangkau. **Pemindaian SonarQube belum diverifikasi**: tidak mengarang jumlah vulnerability/hotspot, Quality Gate atau klaim zero findings. Pengganti yang benar-benar dijalankan adalah test, go vet, syntax check dan review source berisiko tinggi di atas.

Audit ulang read-only CIM TCP mengidentifikasi 8080 tetap dimiliki PID **10816**, executable `C:/Users/FIQRYF~1/AppData/Local/Temp/go-build3991578502/b001/exe/server.exe`, SHA-256 `DDF27F2FECCDE3972A86617B2E895F4E3F59FE92BEBACA4623EDA0F0942D580F`. Binary belum memuat validasi referensi hotfix 10A maupun pesan throttle 10B. Metadata tersimpan di `phase10b/runtime-readonly.json`. **Pending activation**: tidak restart, migrasi, atau pengujian mutasi pada utama. Hasil fixture/build terbaru tidak dipresentasikan sebagai bukti Backend 8080 sudah berubah.

### Catatan dan kesiapan Phase 10C

- **PASS WITH NOTES** berlaku untuk source dan lingkungan pengujian yang dinyatakan. Tidak ada transaksi ganda, status ilegal atau kebocoran privat pada skenario yang lulus; ini bukan jaminan aplikasi bebas bug.
- Aktivasi Backend terbaru dan smoke test target tetap tertunda sesuai larangan restart utama. Perubahan view/aset memerlukan reload agar browser tidak memakai modul cached.
- SonarQube perlu tersedia/hasil scan disediakan untuk menilai hotspot/vulnerability scanner dan Quality Gate; tidak menjadi alasan mengabaikan temuan source yang sudah terbukti.
- Limiter bersifat in-memory per proses, 30 kegagalan/in-flight per IP per menit; shared NAT/proxy berbagi budget. Tidak mempercayai forwarded header arbitrer. Multi-instance, trusted proxy/TLS dan kontrol trafik terdistribusi perlu diverifikasi pada deployment tujuan; tidak diklaim terselesaikan oleh limiter lokal.
- HTTPS delivery/Secure-cookie deployment, forensik keaslian bukti transfer, provider merchant/payment, side-channel/penetration test menyeluruh dan kapasitas produksi tidak diverifikasi. Aplikasi tetap mencatat pembayaran manual, bukan mentransfer dana.
- Source siap untuk evaluasi Phase 10C setelah catatan lingkungan/scanner ditindaklanjuti. **Phase 10C belum dimulai.**

## Phase 10B Completion

Pemeriksaan final 8 November 2026 tetap pada `main`, HEAD `b1d5b227ba44f148f5d87faa3697db97cfc9ef1b` beserta perubahan working tree. Bagian ini memperbarui status historis di atas. Seluruh perubahan sebelumnya dipertahankan; tidak commit/push/merge/rebase/reset/switch. Tidak ada perubahan produk tambahan pada finalisasi ini: tiga perbaikan 10B dan hotfix pembayaran 10A diuji kembali melalui build yang sama.

### Backup, restore dan build siap aktivasi

- Backup konsisten sumber `ecorecycle`: semua tabel InnoDB; dump single-transaction/schema/data/routines/events/triggers, **2.072.869 byte**, SHA-256 `666aab93500474d6c107002a41baf1c97c129a9341887486bcf717066ca536f2`.
- Restore terisolasi MariaDB **24451**, database `sampira_clone10final`: jumlah baris dan checksum **24 tabel** cocok. Tidak restore/reset database utama.
- Backup binary, konfigurasi dan snapshot views/assets/uploads disimpan privat di luar repo, ACL akun saat ini dan SYSTEM. Folder: `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/phase10-final-private/`. Tidak menyalin kredensial ke repository.
- Build `go build -buildvcs=false ... ./cmd/server`: SHA-256 **`2ad09b8d132e2e8ddd6494af2ee2bc1092bd2b7d2eee68b76d711804b6b5ace7`**. Manifest mencatat SHA-256 64 input Go/mod/migration. Binary identik dengan backend fixture 10B yang sudah lulus `go test ./...` dan `go vet ./...`; suite Go yang source-nya sama tidak diulang.
- Build tersebut dijalankan terhadap restore baru `sampira_clone10final_verified`, HTTP **127.0.0.1:25011**. Startup migrasi 006–008 kompatibel; jumlah baris/checksum seluruh data existing tetap identik sebelum penambahan akun sintetis. Empat role login/logout, pickup/reward/payment, fasilitas/penugasan/bukti/review, voucher/harga/retry dan analytics agregat PASS. Semua mutasi hanya memakai akun/record sintetis clone.
- Rollback binary/config siap. Helper aktivasi memvalidasi manifest, branch, konfigurasi, smoke clone, serta identitas ulang PID/executable pemilik 8080 sebelum menghentikan proses terkait saja. Startup gagal akan menjalankan binary backup; tidak merestore database otomatis. Sesudah startup memeriksa pemilik port/hash, hash aset HTTP, proteksi API dan kesamaan 24 tabel.

### SonarQube dan runtime sebelum aktivasi

Scanner CLI, konfigurasi/report scan existing dan variabel SONAR tidak ditemukan dalam pemeriksaan terarah; `http://localhost:9000/api/system/status` tidak dapat dijangkau. **SonarQube/Quality Gate UNVERIFIED**, bukan zero findings. Test keamanan dan review terarah 10B tetap berlaku.

Audit CIM sebelum aktivasi: PID **10816**, executable `C:/Users/FIQRYF~1/AppData/Local/Temp/go-build3991578502/b001/exe/server.exe`, SHA-256 `ddf27f2feccde3972a86617b2e895f4e3f59fe92bebaca4623eda0f0942d580f`. Backend utama masih lama. **Aktivasi belum dilakukan**; menunggu persetujuan eksplisit sesuai master prompt Final Completion bagian 2 langkah 6. Hasil fixture tidak membuktikan server utama telah diperbarui.

## Phase 10C Final QA

### Pengujian yang benar-benar dijalankan

Runner final exit **0**: `scripts/check-phase6b-fixture.ps1 -Integration10 -Final10C -DatabasePort 24453 -ServerPort 25013`. MariaDB dan Chrome nyata terisolasi; fixture `sampira-6b-fe-ab48ce0615734a07966dc7f64731c0c1`, paket 1 MiB dan timezone database +07:00. Perluasan run final diperlukan untuk registrasi/form fasilitas browser, lima viewport dan eksplorasi tambahan; tidak mengulang suite sesudah PASS.

| Role/alur | Bukti final | Hasil |
| --- | --- | --- |
| User | Registrasi/login/logout; pickup/foto/koordinat; laporan/form/revisi/riwayat; tracking; Reward Saya; poin/level; katalog/redeem/Voucher Saya; edukasi; simpan pengaturan | PASS fixture/browser |
| Petugas | Login/claim/transit/arrival/timbang aktual; bukti; reward/poin; penanganan fasilitas/asesmen/tindakan/submit/revisi/submit ulang | PASS |
| Admin | Verifikasi/assignment/reassignment/konflik; review/revisi/validasi; monitoring/statistik/peta; edukasi lifecycle | PASS |
| Administrator | Akun/role/revocation; katalog/stok/harga; pembayaran manual/bukti; pembatalan pending; monitoring/audit/analytics | PASS |
| Cross-role | Pickup → aktual → reward/poin; katalog → redemption → saldo/stok tepat sekali; laporan → validasi → User melihat bukti; pembayaran → User paid; perubahan akun → sesi dicabut | PASS, refresh/login ulang tercakup |
| Integritas/privasi | Concurrent redemption/payment/claim, retry idempotency, duplicate credit/payment, insufficient/expired/stock/stale price, rollback, CSRF/RBAC/ownership/private proof, invalid upload, UTC histories, throttle/XFF | PASS pada skenario API/browser yang diuji |
| Browser/recovery | Navigasi/filter/pagination/dialog/form; Leaflet marker/reaktivasi; geocode stale/reset; 500/retry; loss response; mobile navigation; sesi berakhir | PASS |

Desktop **1280/1440**, tablet **768**, mobile **360/390 px** diuji pada halaman role/pembayaran dan eksplorasi final: screenshot diambil, horizontal overflow diperiksa. Screenshot Administrator desktop dan pengaturan User mobile ditinjau secara visual; tabel/form dan navigasi tetap dapat dipakai. Screenshot bukan klaim redesign seluruh halaman lama selesai. Assertion uncaught JavaScript exception dan application console error kosong pada run final. Respons negatif 400/401/403/409/413/500 sengaja diuji, tidak dihitung sebagai transaksi berhasil.

### Eksplorasi baru dan temuan

`scripts/check-phase10c-final.mjs` menambahkan pengujian di luar suite lama:

1. Pengaturan bank tidak lengkap ditolak tanpa perubahan API; form lengkap tersimpan melalui browser dan bertahan setelah refresh.
2. Navigasi browser Back antara public/dashboard pulih tanpa kehilangan fungsi.
3. Respons pembayaran diputus **setelah server benar-benar commit**: UI memberi peringatan hasil belum pasti, refresh menampilkan pembayaran tersimpan, request satu kali, retry ditolak 409, User melihat paid. Tidak ada pembayaran kedua/status paid palsu.
4. Logout aktual empat role menghapus cookie; token lama ditolak 401; browser Back tidak membuka kembali halaman privat.

Ketujuh observasi eksplorasi bernilai **true**. Tidak menemukan P0/P1 baru pada skenario final; tidak mengubah assertion untuk menyembunyikan bug produk. Perbaikan yang disertakan tetap 10B-01 limiter login, 10B-02 timestamp UTC dan 10B-03 guard setelah revocation, ditambah hotfix referensi/unggah pembayaran 10A yang sudah didokumentasikan. Finalisasi hanya memperluas harness pengujian, tanpa redesign atau fitur baru.

Bukti di luar repo: `.../phase10-final-qa/`, termasuk `phase10c/exploratory-observations.json`, screenshot pengaturan/pembayaran/User Reward/empat portal pada lima lebar, serta hasil Maps, Phase 9, pembayaran dan security 10B. Bukti operasional privat: `phase10-final-private/backup-verification.json`, `clone-smoke.json`, `build-source-fingerprint.json`, `runtime-before.json`.

### Status akhir sementara dan keterbatasan

**PASS WITH NOTES untuk source/fixture; verifikasi release runtime masih PENDING ACTIVATION.** Backend utama belum diganti tanpa persetujuan pengguna. SonarQube/Quality Gate belum tersedia. Tidak ada P0/P1 terbuka dari skenario yang diuji; tidak mengklaim bebas bug, kapasitas produksi atau penetration test menyeluruh. Pembayaran adalah pencatatan manual, bukan transfer uang otomatis. Semua transaksi QA berada di fixture/clone, tidak ada transaksi percobaan di `ecorecycle`. Tidak memulai Phase 11.

### Aktivasi terkontrol dan kesimpulan final

**Status sementara di atas sudah ditutup: aktivasi PASS setelah pengguna menjawab “Izinkan aktivasi terkontrol di localhost:8080”.** Hanya proses pemilik 8080 yang diverifikasi ulang dihentikan: PID **10816** digantikan PID **26792**. Runtime kini `phase10-final-private/server-main-final.exe`, SHA-256 **`2ad09b8d132e2e8ddd6494af2ee2bc1092bd2b7d2eee68b76d711804b6b5ace7`**, identik dengan executable yang lulus smoke pada restore clone. Manifest source dan konfigurasi diverifikasi sebelum pergantian; startup berhasil sehingga rollback tidak diperlukan.

| Verifikasi runtime tujuan | Hasil aktual |
| --- | --- |
| URL dan database | `http://localhost:8080`, tetap **ecorecycle** |
| Frontend/Backend | PID/executable/hash terverifikasi; hash JS payments/contributions/handling/admin-workspace dari HTTP cocok working tree |
| Konfigurasi/data | `.env` tidak berubah; jumlah baris dan checksum **24 tabel** identik tepat sebelum pergantian dan sesudah startup |
| Route public | Login/Register 200; helper foto 200 |
| Proteksi API | Facility reports, vouchers, analytics, `/api/user/rewards` dan Administrator pickup-rewards **401** tanpa sesi |
| Proteksi empat portal | Dashboard, Petugas, Admin dan Administrator **303 → /login** tanpa sesi |
| Pengujian database utama | Read-only setelah aktivasi; tidak ada pembayaran atau transaksi QA pada data asli |
| Backup/rollback | Dipertahankan privat; clone Go PID 8324 dan MariaDB PID 25160 dihentikan setelah path diperiksa, utama 26792 tetap berjalan |

Bukti akhir `runtime-after.json` dan `main-readonly-checks.json` berada pada folder privat yang sama. Pemeriksaan route sempat mencoba nama tidak terdaftar `/api/ecorecycle/rewards` (404); route aktual yang dipakai UI adalah `/api/user/rewards`, sudah diperiksa dan menghasilkan 401 tanpa sesi. Ini bukan kegagalan endpoint Reward User.

Pemeriksaan baseline akhir: tidak ada file awal yang hilang; di luar laporan hanya harness final yang berubah (`check-phase1-browser.mjs`, `check-phase6b-fixture.ps1`, `check-phase9-frontend.mjs`, `check-phase10-integration.mjs`, `check-reward-payment.mjs`) dan penambahan `check-phase10c-final.mjs`. Seluruh source produk dan perubahan sebelumnya tetap utuh. `git diff --check` lulus; warning normalisasi CRLF bukan kegagalan test.

**Kesimpulan keseluruhan Phase 10: PASS WITH NOTES.** Backend/Frontend terbaru aktif dan siap pengujian manual pengguna; E2E empat role serta lima viewport lulus pada fixture, kompatibilitas build yang sama lulus pada restore clone, integritas utama terjaga. Tidak ada P0/P1 terbuka dari pengujian yang dilakukan. Catatan tersisa: SonarQube/Quality Gate **UNVERIFIED** karena server/scanner tidak tersedia; kapasitas produksi, trusted-proxy/multi-instance/TLS dan verifikasi transfer uang nyata tidak dicakup. Tidak mengklaim redesign besar Phase 8 selesai atau aplikasi bebas celah. Tidak commit/push dan tidak memulai Phase 11.

Server utama berjalan di background dengan working directory proyek; view/aset dibaca dari working tree. Perubahan Go berikutnya membutuhkan build dan restart terkontrol; jangan menghapus folder binary/backup ketika server masih digunakan. Muat ulang penuh browser saat mulai pengujian manual agar modul Frontend lama tidak tertahan cache.

## Integrasi konten Edukasi terkurasi — 8 November 2026

**Status: PASS fixture; import database utama menunggu persetujuan.** Pekerjaan content-only pada `main`, tanpa riset ulang, migrasi, redesign, perubahan source produk, restart utama, commit atau push. File lampiran disalin identik ke `docs/content/PROMPT_CODEX_EDUKASI_SAMPIRA.md` dan `docs/content/SAMPIRA_KONTEN_EDUKASI_TERVERIFIKASI.md`. SHA-256 konten sumber dan salinan sama: `10f2d06c428e5662c87eed9b1eebdb9858dd3acb393139f92c19a8415bcc82e4`.

### Pemetaan dan metode pemuatan

Sepuluh judul/slug/ringkasan dipertahankan. Body CMS berupa plain text, mempertahankan paragraf, Unicode, batasan angka/tahun/wilayah, aksi pembaca dan seluruh atribusi sumber. Kategori editorial asli dan label editorial ditampilkan pada awal body; nama/jenis/tanggal sumber beserta URL dan atribusi internal SAMPIRA ada di akhir body. **18 URL HTTPS** juga masuk field `sources` existing sehingga tersedia sebagai tautan detail. Tidak mengunduh sumber/gambar atau membuat angka/URL/artikel baru. Tanggal publikasi CMS adalah waktu publikasi SAMPIRA, bukan tanggal berita/jurnal.

| Artikel (urutan sumber) | Kategori CMS existing |
| --- | --- |
| 01 Pemilahan rumah | Pemilahan Sampah |
| 02 Sisa makanan/data Indonesia | Pengurangan Sampah |
| 03 Kompos rumah | Pengomposan |
| 04 Bank sampah | Bank Sampah |
| 05 Bahaya pembakaran terbuka | Pengurangan Sampah |
| 06 Elektronik/baterai | Sampah Elektronik |
| 07 Food waste | Pengurangan Sampah |
| 08 Kang Pisman | Pemilahan Sampah |
| 09 Kebiasaan memilah/riset | Pemilahan Sampah |
| 10 Panduan laporan SAMPIRA | Panduan SAMPIRA |

Tidak menambah taxonomy/enum: kategori asli seperti Data & Fakta, Lokal Bandung dan Riset & Jurnal tetap terbaca di body. Materi 10 mempertahankan label panduan internal, bukan hasil peer-reviewed. Menggunakan artwork milik proyek yang sudah dipakai reader; tidak mengubah landing/login atau tampilan CMS.

`scripts/import-education-content.mjs` memakai API Admin existing: GET daftar/detail managed, POST draft, dan opsi POST publication dengan version dari respons create. **Tidak mengakses SQL atau membaca `.env`.** Token Admin hanya dari environment proses `SAMPIRA_CONTENT_TOKEN`, tidak dicatat ke repo/output. Default hanya pratinjau; write memerlukan `--apply`; publikasi artikel yang baru dibuat memerlukan `--publish`. Target utama port 8080 juga memerlukan `--allow-main` sesudah persetujuan eksplisit.

Slug existing selalu dilewati, termasuk draf/published/archived; tidak PUT/delete/archive atau menerbitkan artikel existing. Isi identik dilaporkan `skipped-identical`; beda editorial `skipped-editorial-conflict`. Unique slug DB menangani import bersamaan; 409 create dilewati. Pengulangan tidak mengubah versi/timestamp artikel existing. Jika koneksi terputus setelah create atau publication gagal, draft mungkin sudah tersimpan: periksa hasil di CMS dan terbitkan manual; rerun tidak otomatis menerbitkan draf existing. Import bukan transaksi batch all-or-nothing; tidak menghapus hasil sebelumnya ketika salah satu request gagal.

### Hasil targeted fixture dan browser

Perintah yang benar-benar dijalankan, exit **0**:

```powershell
powershell.exe -NoProfile -File scripts/check-phase6b-fixture.ps1 -EducationContentOnly -DatabasePort 24461 -ServerPort 25021 -Screenshots "C:\Users\FIQRY FIRMANSYAH\.codex\visualizations\2026\11\05\01a1ad5d-f300-7af2-8431-4d188d8eeb81\education-content-qa"
```

Fixture baru `sampira-6b-fe-995a3281bab84e2da54de7bbb1742992`, MariaDB 24461/database `sampira_phase1_test`, HTTP `127.0.0.1:25021`; akun sintetis dan Chrome headless nyata. Proses fixture selesai/dihentikan otomatis, database utama tidak digunakan.

- Dry-run tanpa insert; **10 draft** baru, seluruhnya tidak muncul pada API publik (detail 404).
- Admin login lalu membuka, memeriksa kategori/body dan menerbitkan **10 artikel melalui kontrol CMS browser**.
- Import ulang draf maupun published menghasilkan skip; isi, sumber, versi dan timestamp identik. Artikel existing unrelated dan collision editorial tetap utuh. Opsi import langsung publish juga lulus memakai satu artikel sintetis tambahan yang kemudian diarsipkan melalui workflow existing, bukan artikel konten produksi.
- User login → menu Edukasi → kategori/search/pagination 6+4 → tautan detail; seluruh 10 judul, kategori dan field API sesuai paket. Body DOM sama persis dengan hasil pemetaan, termasuk Unicode dan seluruh atribusi.
- 18 anchor HTTPS detail sesuai URL sumber; `rel="noopener noreferrer"` tersedia. Klik anchor diuji dengan default navigation dicegah khusus di test, sehingga tidak melakukan fetch/riset ulang sumber eksternal. Ketersediaan eksternal tidak diklaim diperiksa.
- Body HTML/script dan URL javascript ditolak 400 oleh validator CMS existing; tidak ada script/img/iframe dari body. Console error dan uncaught JavaScript exception kosong.
- Screenshot desktop **1280** dan mobile **390 px** diambil untuk draft CMS, katalog dan seluruh detail; horizontal overflow tidak ada. Screenshot editor desktop dan detail artikel data Indonesia mobile ditinjau visual.
- Checksum seluruh tabel bisnis selain `education_articles` dan `auth_sessions` tetap sama. Sesi berubah karena login fixture; tidak menyentuh reward/poin/voucher/pickup/fasilitas atau business rules.
- Syntax kedua script baru lulus; diff whitespace check lulus. Guard utama tanpa `--allow-main` ditolak sebelum request mutasi.

Bukti: `education-content-qa/content-results.json` dan screenshot pada folder visualizations di atas. Test baru `scripts/check-education-content.mjs`; runner existing hanya mendapat jalur `-EducationContentOnly` untuk menghindari suite lintas fitur yang tidak perlu.

### Aktivasi yang aman (belum dijalankan)

1. Minta izin eksplisit import **10 artikel baru** ke CMS utama, sebagai draf untuk review atau published jika pengguna mengizinkan tayang.
2. Pakai sesi/token **Admin** yang sah (Administrator tidak berhak mengelola artikel). Jangan kirim/simpan token di chat, source, history atau file repo. Ambil backup konsisten sebelum insert utama.
3. Jalankan pratinjau API terlebih dahulu dan review collision; import melewati slug existing tanpa menimpa. Tidak perlu build atau restart utama karena source backend/UI tidak berubah.

```powershell
# Jalankan dari C:\xampp\htdocs\tubes. Token dimasukkan privat, bukan argumen/history.
$contentToken = Read-Host 'Token sesi Admin' -AsSecureString
$env:SAMPIRA_CONTENT_TOKEN = [Net.NetworkCredential]::new('', $contentToken).Password
try {
    node scripts/import-education-content.mjs --origin http://localhost:8080
    # HANYA setelah persetujuan: draft (hapus --publish) atau langsung terbit:
    # node scripts/import-education-content.mjs --origin http://localhost:8080 --apply --publish --allow-main
} finally {
    Remove-Item Env:SAMPIRA_CONTENT_TOKEN -ErrorAction SilentlyContinue
    $contentToken = $null
}
```

Sesudah import disetujui: periksa jumlah created/skipped, detail/status melalui CMS dan User. Record existing tidak diubah. **Saat laporan ini ditulis, 10 artikel baru hanya telah terverifikasi pada fixture, belum diklaim tayang di localhost:8080/ecorecycle.**

### Publikasi utama — SELESAI

**Status terbaru: 10/10 artikel PUBLISHED di `ecorecycle`, bukan hanya fixture.** Pengguna mengizinkan import dan penerbitan, kemudian menegaskan “publish semua artikel”. Pengguna login sendiri dengan akun Admin pada browser aplikasi; kredensial/token tidak diekstrak atau disimpan. Sepuluh artikel dibuat dan diterbitkan melalui formulir dan konfirmasi **CMS Admin existing** memakai sesi tersebut. Tidak memakai INSERT SQL, bypass role, perubahan source produk, restart server, commit atau push.

- Backup utama konsisten **24 tabel** dibuat sebelum perubahan: **2.072.951 byte**, SHA-256 `468b4fdc80f611b46fa897e2f299b050242c8ddec17709a1e93fb77e6a256a95`. Dump dan baseline privat di `phase10-final-private/education-publish-20261108-110008/`, di luar repository dan mewarisi ACL folder privat.
- Sebelum publikasi terdapat satu artikel editorial lama, ID 1 berstatus Arsip; tidak diterbitkan/diedit/dihapus. Sepuluh slug paket belum ada, sehingga tidak terjadi collision.
- Artikel paket tersimpan ID **2–11**, masing-masing **published**, versi **2**, `published_at` terisi, dengan `created_by` akun ber-role Admin. Total tabel artikel **11**, terdiri dari 10 artikel paket terbit dan 1 artikel lama yang tetap utuh.
- Verifikasi API publik seluruh **10 detail HTTP 200**: slug, judul, ringkasan, body, kategori dan sources **sama persis** dengan hasil pemetaan file konten; total **18 URL**. Daftar publik memuat semua 10 slug tanpa duplikasi.
- Browser utama: CMS menampilkan status Terbit untuk seluruh artikel; katalog publik halaman 1 memuat 6 dan halaman 2 memuat 4; detail artikel sisa makanan menampilkan narasi, pembatasan dataset, atribusi dan tautan sumber. Halaman katalog dibiarkan terbuka sebagai hasil.
- Checksum/jumlah baris **22 tabel bisnis lain** identik dengan baseline; satu artikel lama juga identik menurut ID/slug/status/version/hash kontennya. `.env` identik. Perubahan sesi sesuai login Admin yang sah; tidak ada transaksi reward/voucher/pickup/fasilitas pengujian pada utama.
- Bukti privat: `before.json`, `after.json`, `publication-api-verification.json`, dump `ecorecycle-before-education.sql`. Bukti visual utama: `education-content-qa/main-published-catalog.png` di folder visualizations yang sama.

Catatan historis “menunggu persetujuan/belum tayang” pada subbagian sebelumnya sudah ditutup oleh hasil publikasi ini. Buka `http://localhost:8080/assets/education.html` atau menu Pusat Edukasi pada User untuk melihat artikel. Tidak melakukan riset ulang atau pemeriksaan ketersediaan situs sumber eksternal.

## Adaptasi Portal User dari USer.zip — 8 November 2026

**Status: PASS WITH NOTES — adaptasi referensi dan regresi fungsional terverifikasi; bukan klaim pixel-perfect.** Tetap `main`; seluruh pekerjaan sebelumnya dipertahankan. Tidak mengubah Go, kontrak API, schema/data utama, portal Petugas/Admin/Administrator, Landing, Login/Register; tidak restart, commit atau push.

**Referensi:** keenam HTML asli (`penjemputan`, `pelaporam`, `riwayat`, `voucher`, `reward`, `pengaturan`) dibaca struktur/CSS/interaksinya dan dirender pada 1440/390 px. ZIP diekstrak aman tanpa overwrite/path traversal ke workspace visualizations `user-ui-reference/New folder/`, bukan aset publik aplikasi. Acuan bersama: sidebar 256 px, header 64 px, konten maksimal 1024 px, Plus Jakarta Sans, hijau `#0c3b2e`, canvas `#f4f7f2`, border slate tipis/radius 12–16 px.

**Implementasi:**

- `app/Views/dashboard.html`: shared shell delapan menu, footer logout, tipografi, banner formulir/riwayat; susunan form kategori/detail → lokasi → kontak/reward. **107 ID DOM lama tetap ada**, tiga ID anchor ditambah, tidak ada ID duplikat; dibandingkan dengan snapshot yang SHA-nya sama dengan baseline awal pekerjaan.
- `assets/css/user-reference.css`: stylesheet khusus `body.sp-portal.user-reference`, mencakup Beranda, Penjemputan, Lapor Fasilitas, Riwayat & Pelacakan, Poin & Voucher, Reward Saya, Edukasi dan Pengaturan. Tidak menimpa stylesheet shared role lain.
- `assets/js/user-reference.js`: hanya adaptasi presentasi: ikon, pengelompokan node form/tabpanel existing, anchor antarbagian, ringkasan pencapaian native details, detail edukasi dalam dialog agar shell tetap tampil. Node input/listener dan workflow existing dipertahankan; detail artikel memakai endpoint CMS existing, plain text, HTTPS sources dengan noopener/noreferrer, abort saat ditutup/sesi berakhir.
- `assets/vendor/lucide/`: Lucide **0.468.0** beserta LICENSE disimpan lokal. Tidak memakai Tailwind CDN atau framework baru; Font Awesome existing tetap fallback, font memiliki system fallback.
- Harness terarah: `scripts/check-user-reference.mjs` dan tambahan opsi pada runner/browser/migration fixture existing. Tidak mengubah source bisnis contributions/facility/dashboard JS untuk meniru data referensi.

**Perbedaan yang disengaja:** form tetap satu halaman sesuai instruksi User sebelumnya; pill adalah anchor aktif, bukan menyembunyikan kontrol wajib. Kategori/tarif/bobot/reward/level memakai API, bukan data contoh. Klaim “gratis” dan “maks. 24 jam” tidak disalin karena tidak dibuktikan kontrak. Tidak menambah progress level atau tombol merchant/pembayaran/detail bukti yang tidak didukung. Voucher tetap SIMULASI dan pembayaran tetap pencatatan manual. Badges/aturan poin tetap tersedia pada details. Beranda/Edukasi tidak memiliki HTML khusus di ZIP: memakai design system yang sama sambil mempertahankan hero/aset/konten/alur existing. Navigasi mobile memakai drawer dan bottom navigation existing, semua delapan menu dapat dijangkau.

**Uji aktual:**

1. Regresi relevan exit **0**: `-UserReferenceOnly -UserReferenceRegression`, MariaDB **24477**, HTTP **25047**, fixture `sampira-6b-fe-913588d69f404a4c810818a59d3db1e8`. Browser nyata lulus registrasi/sesi; pickup/foto/koordinat → Petugas claim/transit/timbang → reward/poin; fasilitas/foto/revisi → Admin/Petugas/validasi → User; katalog/redeem/saldo/stok/retry; pembayaran → User paid; profil tersimpan/refresh; logout/Back/revocation. Menggunakan suite existing yang relevan, bukan audit ulang seluruh Phase 10.
2. Setelah koreksi susunan foto, formulir fasilitas diuji ulang secara targeted, exit **0**, fixture `sampira-6b-fe-5cd72f5515f34380af7606da21c7151d`, DB **24481**, HTTP **25051**. Tidak melonggarkan assertion. Harness menunggu script halaman selesai sebelum registrasi; source Login/Register tidak diubah. Percobaan setup awal juga diperbaiki agar fixture voucher mendapat prerequisite pembayaran yang sudah diuji.
3. Screenshot delapan halaman pada **1440/1280/768/390/360 × 1000 px**, total **40 capture** per pass final; assertion overflow, ukuran shell, font, navigasi drawer/dropdown, detail edukasi/sumber/close dan refresh statistik Reward lulus. Enam perbandingan referensi vs implementasi pada 1440 px serta render mobile/tablet representatif ditinjau secara visual.
4. Temuan visual diperbaiki: prioritas font lama, breadcrumb bertumpuk, kategori fasilitas dua kolom di desktop, heading Reward duplikat, kontras banner Edukasi/logo mobile, dan teks tab riwayat putih akibat `color:white !important` di stylesheet shared. Exception hanya pada tab User; assertion warna aktif dan rasio kontras teks edukasi **≥4,5:1** ditambahkan.
5. Console aplikasi/uncaught exception kosong pada run yang lulus. Syntax JS dan `git diff --check` lulus. Semua mutasi QA hanya fixture; proses fixture dihentikan oleh runner. Tidak menguji kapasitas/SLA penyedia peta/font eksternal atau mengklaim seluruh aplikasi bebas bug.

**Bukti:** `C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/user-ui-qa/`: folder `reference/`, `comparison/`, `final/` (regresi), `verified-render/` (retest form), `release-render/` (capture final), serta `visual-evidence.json` dan `runtime-assets.json`. Receipt memuat hash sumber/target/capture dan cakupan pemeriksaan; angka pada screenshot fixture adalah data sintetis yang benar-benar dibaca dari API fixture.

**Runtime:** CSS/JS User dan Lucide dari `localhost:8080` diperiksa HTTP read-only: 200 dengan hash cocok source. View/aset dapat dicoba setelah **Ctrl+F5**; tidak perlu restart Backend. Pemeriksaan baseline tidak menemukan file hilang atau perubahan pada source role lain/Backend oleh pekerjaan ini. Catatan akhir terbatas pada perbedaan disengaja di atas; tidak mengklaim kesamaan piksel dengan konten dummy referensi.

Render final setelah koreksi kontras/tab exit **0** pada fixture `sampira-6b-fe-b479375fe3f14d95b4b4245e2dda9b61`, MariaDB **24487**, HTTP **25057**. Integrity checker skill `verify-visual-evidence.mjs` lulus: **40 capture, 30 input ber-hash, 71 pemeriksaan file**, tanpa stale/missing evidence. Pemeriksaan ini memvalidasi integritas artefak, bukan menggantikan inspeksi visual yang dilakukan. Tidak ada pengulangan regresi transaksi setelah PASS; run lanjutan hanya targeted form atau render/kontras/kontrol tampilan yang berubah.

### Revisi akses Lapor Fasilitas

Menu sidebar **Lapor Fasilitas langsung membuka formulir**, tanpa perantara daftar. Isian draf tidak direset saat berpindah ke Beranda lalu kembali; daftar tetap dibuka melalui Riwayat & Pelacakan → Riwayat Lapor Fasilitas atau tombol Kembali existing. Link detail, revisi, status pengiriman belum pasti, dan guard busy/session tetap menggunakan workflow existing. Perubahan hanya pada cabang User `assets/js/facility-reports.js`; query versi modul di dashboard diperbarui agar cache lama tidak mempertahankan tujuan daftar.

Targeted browser fixture exit **0**, DB **24489**, HTTP **25059**, fixture `sampira-6b-fe-32727f8c2ce841a0b2c9b21ca7dfc9ed`: desktop/mobile masuk langsung ke form, draf bertahan, submit nyata berhasil sampai detail, riwayat menampilkan laporan baru, drawer mobile menutup, tanpa overflow/exception/console aplikasi. Syntax dan diff check lulus. Bukti terkini untuk revisi navigasi: folder `user-report-entry-qa/` pada visualizations yang sama; bukti desain sebelumnya bersifat historis terhadap source sebelum revisi ini. Tidak mengubah Backend, database utama, atau me-restart server.

### Revisi wizard dan peta minimal User

Sesuai instruksi terbaru, keputusan satu halaman sebelumnya diganti dengan **tiga langkah** untuk pickup dan laporan: kategori/detail/foto → lokasi → kontak/reward atau alamat. Penanda progres berupa list item noninteraktif; tidak ada link/tombol untuk melompati tahap. `assets/js/user-form-steps.js` memvalidasi setiap tahap (required, panjang teks, berat, ukuran deskripsi gabungan, kategori, kontak dan lokasi), mendukung Enter/Kembali/reset, lalu meneruskan submit valid ke handler existing. Nilai file/input tidak dihapus saat kembali; guard busy, retry dan idempotency tetap milik handler existing.

`mountLocationPicker` mendapat opsi **compact** yang diaktifkan hanya pada formulir User terkait. UI normal hanya memuat peta/pin draggable dan tombol Gunakan Lokasi Saya; input koordinat tersembunyi, pencarian tidak dimount, konfirmasi/hapus titik tidak dibuat. Titik awal Bandung atau titik tersimpan diisi otomatis; perubahan pin/GPS langsung masuk payload dengan presisi existing. Titik awal bukan klaim lokasi perangkat. Pesan GPS/peta tetap tersedia untuk kondisi gagal. Picker non-compact dan peta navigasi role lain mempertahankan perilaku existing; tidak mengubah Backend/kontrak/schema.

**Targeted browser PASS**, exit **0**, fixture `sampira-6b-fe-27e817ca1c7f4c10993ac1bdb9875313`, DB **24491**, HTTP **25061**. Tes kedua form membuktikan: progres inert; input kosong/pendek/berat nol tidak maju; tahap akhir invalid tidak mengirim API; 30 screenshot pada **1440/1280/768/390/360 px** tanpa overflow; drag marker melalui input mouse nyata dan GPS sintetis mengubah koordinat otomatis; unggah PNG; masing-masing satu submit HTTP 201; koordinat tersimpan sesuai API detail tanpa konfirmasi. Kompatibilitas picker lama diuji: pilihan titik tetap menuntut konfirmasi saat compact tidak aktif. Console aplikasi/uncaught exception kosong; syntax dan diff check lulus. Screenshot peta desktop dan langkah alamat mobile ditinjau visual.

File terkait: dashboard HTML/cache version, `dashboard.js`, `user-map.js`, `facility-report-form.js`, versi import `facility-reports.js`, opsi pada `location-map.js`, stylesheet User, modul wizard dan targeted test `check-user-form-steps.mjs`. Bukti terkini: `user-wizard-qa/wizard-results.json`, screenshot dan `visual-evidence.json` pada visualizations yang sama. Semua mutasi hanya fixture; tidak mengubah database utama, melakukan restart/commit/push, atau menjalankan ulang seluruh audit Phase 10.

### Tambahan kamera pada formulir pickup dan laporan fasilitas

`assets/js/user-camera.js` menambahkan tombol **Ambil Foto** di kedua formulir tanpa mengganti Unggah Foto. Dialog kamera memakai getUserMedia (video saja, mengutamakan kamera belakang), menghasilkan JPEG maksimal sisi 1600 px, lalu mengisi input file existing dan memicu validasi/pratinjau existing. Foto baru dikirim saat formulir disubmit. Batal tidak mengganti foto sebelumnya; stream dihentikan setelah ambil foto, Tutup/Escape, reset, session berakhir, halaman tersembunyi atau navigasi menu. Izin ditolak/kamera tidak tersedia menampilkan pesan dan alternatif galeri. Kamera memerlukan secure context (HTTPS atau localhost). Tidak mengubah API, Backend, maupun database utama.

File integrasi: `app/Views/dashboard.html` (modul dan versi CSS), `assets/css/user-reference.css` (dialog responsif), modul kamera baru. Targeted test memakai harness existing `check-user-form-steps.mjs`/`check-user-reference.mjs`; fake camera Chrome hanya diaktifkan oleh environment pengujian khusus pada `check-phase1-browser.mjs`.

**PASS** targeted fixture exit 0: `sampira-6b-fe-0cf45a7cea274f2cb4bcef7270e2e0f4`, MariaDB port **24493**, HTTP **25063**. Kamera sintetis Chrome: kedua form berhasil membuka preview, Escape membatalkan tanpa mengganti PNG galeri, izin ditolak menampilkan pesan, pengambilan menghasilkan JPEG valid, seluruh track berhenti; dua submit nyata HTTP 201, `photo_url` tersimpan dan berkas dibaca kembali HTTP 200. Regression wizard (required/berat/deskripsi/alamat, progres inert, Back), pin drag/GPS, koordinat tersimpan, dan picker legacy lulus. Browser tanpa uncaught exception/console error aplikasi. Syntax checks modul/harness dan targeted diff check lulus. Dua percobaan awal mengungkap masalah harness (kode tombol Escape CDP dan pemulihan mock getUserMedia antarform); dikoreksi sebelum run final PASS.

Bukti: `user-camera-qa/wizard-results.json` dan 16 screenshot pada folder visualizations yang sama: dua dialog kamera dan enam tahap formulir pada **1280/390 px**. Dialog pickup mobile dan laporan desktop ditinjau visual; tidak ditemukan overflow. Pengujian memakai kamera sintetis, **kamera fisik/perangkat smartphone belum diverifikasi**. GET aset kamera pada server utama localhost:8080 menghasilkan HTTP 200 dan isinya sama dengan working tree; tidak ada restart, transaksi uji pada database utama, commit atau push.

### Penyempurnaan estimasi reward dan petunjuk peta User

Kartu Estimasi Reward dirapikan: rincian nilai sampah/biaya memakai baris berjarak dan pemisah tipis, reward bersih menjadi blok hijau dengan angka lebih menonjol, simulasi CO₂ terpisah, serta keterangan nilai akhir mengikuti penimbangan/verifikasi. Seluruh ID output dan perhitungan existing dipertahankan. Picker compact pada pickup dan laporan kini menampilkan petunjuk **Gunakan lokasi Anda atau seret pin pada peta untuk menentukan titik penjemputan/fasilitas.** Tidak mengubah picker legacy, API atau Backend.

Targeted browser fixture **PASS**, exit 0, `sampira-6b-fe-c50d8dcb125749f2a329eaee37a504c0`, DB **24495**, HTTP **25065**. Uji 1280/390 px: tidak ada overflow, petunjuk hadir pada kedua form, nilai bersih sama dengan nilai sampah dikurangi biaya, wizard/validasi/Back, pin drag/GPS, unggah dan dua submit nyata HTTP 201 serta koordinat tersimpan lulus. Tidak ada uncaught exception/console error aplikasi. Bukti `user-estimate-qa/wizard-results.json` dan 14 screenshot pada visualizations; kartu reward mobile dan peta desktop ditinjau visual. Log harness saat run masih memakai teks statis “five viewports”; run ini hanya **dua** ukuran tersebut, teks log sudah diperbaiki. Syntax dan targeted diff check lulus. Tidak mengubah database utama/restart/commit/push.

### Perbaikan header User dan nomor halaman riwayat

Menghapus border kiri pada summary profil karena pemisah sudah tersedia pada `#sp-account-menu`. Pada form laporan, banner halaman luar disembunyikan melalui `show(view)` sehingga hanya banner formulir terlihat; banner riwayat kembali tersedia pada list/detail. Nomor pagination aktif pickup diberi warna putih yang mengatasi aturan warna tombol quiet, tanpa mengganti perhitungan halaman atau event navigasi existing. File: `user-reference.css`, `facility-reports.js`, versi aset pada dashboard.

Targeted fixture **PASS**, exit 0, `sampira-6b-fe-fcc8b597442a4cc891035ebb2c1c1079`, DB **24497**, HTTP **25067**. Browser 1280/390 px membuktikan satu banner terlihat, border profil dalam 0px/pemisah luar 1px, teks halaman aktif putih, klik halaman 2 memperbarui aria-current dan daftar. Pagination diuji dengan 12 baris sintetis display-only yang dikembalikan sesudah tes; tidak memasukkan data palsu ke database utama. Regression kedua wizard, peta, upload dan submit fixture lulus; tidak ada console error aplikasi/uncaught exception. Screenshot banner desktop dan pagination mobile ditinjau; bukti `user-header-history-qa/` pada visualizations yang sama, termasuk `wizard-results.json`. Syntax dan diff check lulus; tanpa restart/commit/push/perubahan database utama.

### Pemulihan artikel dan perapian Edukasi User

Akar masalah: `education.js` mencari `[role=status]`, sementara markup portal hanya menyediakan `output[aria-live]`. Akses `message.textContent` sebelum blok try menghentikan load sebelum request artikel. Selector kini menerima elemen output existing, markup diberi role status eksplisit, dan inisialisasi juga memuat artikel jika tab sudah aktif saat modul siap. Banner artikel lama disembunyikan ketika memuat/filter berubah agar tidak menampilkan konten yang tidak sesuai hasil. API utama diperiksa baca-saja: success, **10 artikel terbit** tersedia; tidak melakukan import/publikasi/perubahan database utama.

UI User: banner artikel terbaru, grid kategori 4 kolom desktop/2 mobile, pencarian ringkas tanpa kotak besar, kartu artikel dengan ilustrasi existing, hierarki judul/ringkasan/tanggal, dan pagination terpisah. File utama: `education.js`, dashboard HTML/versi aset, `user-reference.css`.

Targeted fixture final **PASS**, exit 0, `sampira-6b-fe-f94211fc28e5462694f05d75a021d2ca`, DB **24499**, HTTP **25069**. Delapan artikel sintetis dibuat dan diterbitkan melalui CMS API fixture, lalu login User: menu otomatis memuat 6 artikel, halaman kedua memuat 2, filter kategori, pencarian kosong, respons error 503 sintetis/pemulihan, reader detail via API, dan tampilan 1280/390 px tanpa overflow lulus. Console aplikasi/uncaught exception kosong. Screenshot desktop/mobile ditinjau. Bukti `user-education-qa/education-results.json` dan empat screenshot pada visualizations yang sama.

Saat penyiapan melalui akun Admin ditemukan ketidakcocokan selector lain: overview mencari role status/region yang tidak ada pada markup existing. Dua selector pada `admin-workspace.js` diberi fallback ke class status/tabel existing; tidak mengubah workflow. Dua run awal mendeteksi exception Admin ini; final run setelah koreksi lulus tanpa pengecualian yang disembunyikan. Harness kini menyimpan stack exception lengkap agar sumber error jelas. Syntax/diff checks lulus. Semua mutasi konten hanya fixture; tidak restart/commit/push.

### Adaptasi dashboard Petugas dari referensi HTML

Isi dashboard Petugas mengikuti susunan referensi: welcome dengan Perbarui Data, empat kartu ringkasan, strip berat/estimasi komisi/pickup aktif, antrean beserta jumlah tugas, panel peta/rute, dan pengumuman existing. Header desktop/mobile dan sidebar dipertahankan. Warna, tipografi Manrope/Inter, border dan permukaan mengikuti token Landing existing; tidak menambah Tailwind/CDN/framework. CSS baru terpisah `assets/css/collector-overview.css`, dibatasi pada `#view-dashboard` agar misi, profil, sidebar/header dan role lain tidak terkena.

Ringkasan menggunakan opt-in `data-collector-summary` pada renderer analytics existing di `contributions.js` dan API `/api/analytics`: pickup selesai, tugas fasilitas aktif, pickup berjalan, fasilitas selesai. Label disesuaikan semantik Backend, tidak menyalin angka contoh atau mengklaim semua completed telah terverifikasi. Strip berat memakai final_weight existing; komisi tetap **— / nominal belum tersedia** karena API existing belum menyediakan nominal komisi. Tidak menghitung uang fiktif. `collector.js` mempertahankan klaim/misi existing, menambah jumlah antrean, refresh data/statistik dan empty state dengan akses tugas fasilitas. Statistik diperbarui ketika kembali ke dashboard. Pengumuman tetap tersedia.

Targeted fixture final **PASS**, exit 0, `sampira-6b-fe-8d4dadb31c2847bfa0a5ce6a0e296b47`, MariaDB **24501**, HTTP **25071**. Browser mengajukan pickup sintetis sebagai User, login Petugas, mencocokkan empat angka dengan API, mengambil tugas melalui dialog konfirmasi nyata, memperbarui statistik, membuka detail misi beralamat lengkap dan peta dengan lokasi termuat. Empty/error 503 simulasi display-only, retry sukses, navigasi ke tugas fasilitas, serta tidak adanya angka komisi palsu diuji. Tidak ada uncaught exception/console error aplikasi. Enam screenshot pada 1440/1280/390 px tanpa overflow; desktop/mobile dashboard dan area antrean kosong ditinjau. Bukti `collector-overview-qa/collector-results.json` dan screenshot pada visualizations yang sama.

Pengujian menemukan error existing pada operations.js: selector status hanya mencari role status, sedangkan markup Petugas memakai output. Fallback `.sp-map-layout output` memperbaiki pemuatan peta tanpa mengubah sumber/izin koordinat. Percobaan awal juga mengoreksi harness konfirmasi klaim dan memilih misi fixture baru karena baris legacy memiliki alamat null; tidak mengisi atau mengarang alamat legacy. File terkait: collector HTML, collector.js, contributions.js (cabang opt-in), operations.js (selector), CSS baru dan targeted browser test. Syntax dan diff checks lulus. Seluruh mutasi hanya fixture, tanpa Backend/DB utama/restart/commit/push.

### Adaptasi Pickup Aktif dan Tugas Fasilitas Petugas

Layout mengikuti dua HTML referensi tanpa menyalin Tailwind/CDN, angka, identitas, koordinat atau status contoh. CSS baru terpisah `assets/css/collector-tasks.css`, scoped ke konten Pickup Aktif/Tugas Fasilitas Petugas dan dialognya. Header/sidebar serta tampilan dashboard hasil pekerjaan sebelumnya dipertahankan. Warna, font dan permukaan mengikuti Landing existing.

Pickup: ringkasan kategori/tracking/status, panel progres tiga tahap noninteraktif, kartu alamat dan barang/donor, peta existing dan strip tindakan berikutnya. Status hanya berubah melalui handler/API existing beserta dialog konfirmasi. Tombol WhatsApp hanya ditampilkan untuk nomor Indonesia valid dari pickup yang berwenang diakses, tanpa mengirim pesan otomatis; nomor kosong/invalid tidak diberi link. Alamat legacy kosong diberi keterangan, tidak dibuat-buat. Peta dan authorize/recheck existing dipertahankan.

Fasilitas: header dengan muat ulang, filter status/kategori beserta jumlah hasil, kartu tracking/judul/status, kategori/alamat dan penugasan/tanggal/detail. Detail dan dialog pemeriksaan/tindakan diperhalus tanpa mengubah transaksi, versi, izin, penanganan konflik, bukti atau workflow Admin. Struktur baru hanya cabang Petugas; tabel Admin existing tidak diganti. File utama: collector HTML, collector.js, facility-handling.js, facility-handling-ui.js, CSS baru dan cache version terkait.

Targeted fixture final **PASS**, exit 0, `sampira-6b-fe-8f858b16a9744286b61dc50da1610c20`, DB **24503**, HTTP **25073**. Browser nyata: User membuat pickup/laporan sintetis; Admin menyetujui/menugaskan; Petugas mengambil pickup melalui konfirmasi, membuka alamat/peta/kontak sesuai data, transit → arrived → completed dengan berat aktual **2.5 kg** tersimpan. Filter fasilitas termasuk hasil kosong, detail, mulai asesmen, pemeriksaan dengan PNG valid, bukti tersimpan/dibaca kembali, catat tindakan dan serahkan hasil lulus. Admin memvalidasi penyelesaian; Petugas melihat tugas selesai tanpa kontrol mutasi. Tidak ada uncaught exception/console error aplikasi.

Bukti `collector-tasks-qa/task-results.json` dan **15 screenshot** pada **1440/1280/390 px** di visualizations yang sama, tanpa horizontal overflow. Pickup desktop, daftar fasilitas desktop, detail serta dialog pemeriksaan mobile ditinjau visual. Percobaan awal memperbaiki harness yang mengecek judul sukses alih-alih teks dialog dan memilih dialog lama yang sudah ditutup; final test memilih dialog `[open]`. Harness kini mempertahankan deskripsi exception evaluasi agar diagnosis jelas. Syntax dan targeted diff check lulus. Semua transaksi pengujian hanya fixture; tidak mengubah Backend/database utama atau melakukan restart/commit/push.

### Penyempurnaan Pickup Aktif sesuai foto dan bahasa kartu fasilitas

Pickup Aktif: kartu alamat kini memuat alamat aktual, titik tersimpan dan tombol Petunjuk Rute Google Maps di bawah kartu. Peta memiliki toolbar judul/tujuan dan Lokasi Saya, popup donor/alamat dari Backend, serta strip Langkah Selanjutnya berikon dengan CTA existing. Filter grayscale peta di-override hanya untuk peta misi Petugas. Padding map fit memberi ruang popup agar tidak terpotong setelah GPS. Tidak membuat alamat kelurahan/kecamatan jika tidak tersedia pada data.

`mountNavigation` mendapat mode compact opt-in untuk Petugas: kontrol GPS dipindah ke toolbar, kontrol Google Maps dipindah ke kartu alamat, isian titik awal/rute lanjutan dan keterangan privasi tetap tersedia melalui Opsi rute lainnya. Handler izin/authorize, abort, recheck, GPS dan cleanup dipertahankan; kontrol eksternal memakai referensi tombol eksplisit karena posisinya berpindah. Navigasi default role lain tidak dipindahkan. Popup dibentuk lewat DOM textContent, tanpa HTML dari isi laporan.

Kartu fasilitas memakai status yang lebih langsung (Tugas baru, Sedang ditangani, Menunggu persetujuan Admin, Selesai), keterangan langkah yang perlu dilakukan, nomor laporan yang tidak mendominasi, pembaruan tanggal sederhana, serta Buka tugas/Lihat hasil sesuai status Backend. Nilai filter/API tetap existing; branch Admin tidak berubah. CSS tetap pada collector-tasks.css, dengan collector HTML/JS, location-map.js dan facility-handling-ui.js serta versi aset terkait.

Targeted fixture final **PASS**, exit 0, `sampira-6b-fe-c49e54f98d894c3c856088fe32f2bfc0`, DB **24509**, HTTP **25079**. GPS sintetis menghasilkan origin **-6.9150000**, popup donor tampil dan tidak terpotong, filter tile computed **none**, kontrol rute berada pada kartu/toolbar, advanced awalnya tertutup. Navigasi non-compact diuji mempertahankan tiga tombol lama dan menolak pembukaan eksternal saat authorize gagal. Seluruh regression alur sebelumnya lulus: klaim pickup → transit → arrived → completed dengan berat 2.5 kg, filter fasilitas, asesmen/foto/readback, tindakan, hasil, validasi Admin dan status selesai read-only. Tidak ada uncaught exception/console error aplikasi.

Bukti `collector-tasks-refinement-qa/`: task-results.json dan **18 screenshot** pada **1440/1280/390 px** tanpa overflow; kartu alamat, peta/CTA desktop dan kartu selesai mobile ditinjau visual. Percobaan awal mengoreksi selector status GPS pada harness dan ekspektasi pesan final GPS; satu percobaan port fixture bentrok dibatalkan lalu memakai port baru tanpa menghentikan proses lain. Syntax/diff checks lulus. Header/sidebar, Backend, database utama dan source Landing tidak diubah. Tanpa restart/commit/push.

### Pembersihan SSD dan pencegahan penumpukan fixture

Dengan izin pengguna, audit memeriksa folder Local Temp terhadap executable/command line proses, service, worktree Git, penanda backup/runtime, serta reparse point. Server utama PID **26792** (`phase10-final-private/server-main-final.exe`), database PID **6408**, proyek, worktree, SAMPIRA-dev, screenshot dan backup dipertahankan. Penghapusan hanya direct-child Local Temp dengan pola nama fixture/browser/http terverifikasi, dan setiap target absolut/proses diperiksa ulang tepat sebelum Remove-Item. Lima folder tidak pasti/berpenanda backup-runtime dikecualikan.

**559 folder** berhasil dihapus, **0 gagal**, ruang bebas naik dari **4.06 GiB ke 54.61 GiB** pada akhir penghapusan, pemulihan terukur sekitar **50.54 GiB** (ukuran logis kandidat 50.32 GiB). Daftar audit `storage-cleanup/before.json`, hasil per folder `deleted.json` dan audit akhir `after.json` disimpan pada visualizations yang sama. Tidak ada penghapusan proyek, database utama, binary server aktif atau worktree; tanpa restart/commit/push.

Pencegahan: `check-phase6b-fixture.ps1` mengelompokkan seluruh child TEMP/TMP (Chrome, salinan HTTP, Go temporary build) di satu root fixture unik bertanda kepemilikan; try/finally mencakup startup/build/error; env dikembalikan; database uji dihentikan dan root dibersihkan dengan guard parent/nama/marker serta retry. Ruang kosong minimum 2 GiB diperiksa sebelum membuat fixture. Browser harness menghentikan hanya proses Chrome tree miliknya, menunggu exit dan menghapus profil; migration harness menunggu server uji keluar dan menghapus salinan HTTP termasuk jika inisialisasi gagal. Cleanup yang terhalang lock/proses tetap aktif dilaporkan, tidak dihapus secara membabi buta. `clear-sampira-test-artifacts.ps1` default audit-only; penghapusan memerlukan -Apply dan tetap melalui seluruh pemeriksaan keselamatan.

Validasi sukses: satu fixture edukasi terisolasi DB **24531**, HTTP **25101** lulus browser/CMS dan exit 0; root serta seluruh child artifact dihapus, **NewTempFoldersRemaining=[]**, TEMP parent tetap. Validasi gagal: MySqlBin sengaja tidak tersedia, exit 1 yang diharapkan, **NewTempFoldersRemaining=[]**, tanpa membuat/mengubah database utama. Syntax Node, parser PowerShell dan diff checks lulus. Verifikasi utama sesudah pembersihan: login HTTP **200**, API edukasi success dengan **10 artikel**, PID server/database tetap sama, proyek dan worktree masih tersedia. Bukti uji kecil/manifest dipertahankan secara sengaja; cache Go bersama dan folder yang belum pasti tidak dibersihkan.

### Perapian Peta Operasional, Riwayat, Komisi, Profil dan detail fasilitas Petugas

Peta Operasional kini berfokus pada canvas berwarna, marker tugas yang memang memiliki koordinat, legenda jenis tugas/warna status di bawah, serta status pemuatan dan pagination bila diperlukan. Filter, daftar samping dan pengaturan origin tidak ditampilkan pada tampilan map-only Petugas; sumber, batas kewenangan, popup dan navigasi marker existing tetap digunakan. Lokasi tanpa koordinat tidak diberi titik buatan. Legenda dirender ke host khusus, tanpa mengubah layout Admin.

Riwayat Misi memakai tracking/kategori, waktu penimbangan bila verified_at tersedia (fallback diberi label tanggal pengajuan), berat akhir dan status nyata; mobile menjadi kartu yang mudah dibaca. Komisi memiliki kartu ringkasan dan jumlah/berat pekerjaan selesai, tetapi nominal tetap **— / belum tersedia**, tanpa uang atau pencairan palsu. Profil menampilkan identitas/email/peran dengan akses Riwayat, Komisi dan logout existing; penanda navigasi programatis diperbaiki untuk label Indonesia. Header/sidebar tidak didesain ulang.

Detail fasilitas Petugas memprioritaskan masalah, jenis fasilitas, alamat, status sederhana dan petunjuk tindakan. Informasi teknis tambahan, lokasi di peta dan riwayat ditaruh dalam bagian yang bisa dibuka sesuai kebutuhan. Tindakan/status, dialog, versioning, izin dan upload foto tetap melalui workflow existing; role Admin/User mempertahankan ringkasan existing. CSS baru `collector-sections.css`, dengan perubahan collector HTML/JS, operations.js, facility-handling.js dan facility-handling-ui.js.

**PASS satu fixture** DB **24535**, HTTP **25105**, exit 0, kemudian seluruh root/nested database/build/Chrome/HTTP otomatis dihapus: **TempFoldersRemaining=[]**. Targeted Chromium menguji dua marker nyata dari pickup/fasilitas fixture, tile berwarna, legenda tunggal di bawah, filter tersembunyi, riwayat pickup selesai/berat 2.5 kg, komisi tanpa angka fiktif, profil/email dan navigasi/logout, serta seluruh alur pickup dan fasilitas (foto/readback, progress, hasil, persetujuan Admin, tugas selesai read-only). Tidak ada exception atau console error aplikasi. Syntax/diff checks lulus.

QA visual 1280/390 px tanpa overflow: map/legenda, riwayat mobile, komisi desktop, profil desktop/mobile dan detail fasilitas mobile ditinjau. Bukti pada `collector-sections-qa/` di visualizations: **10 JPEG** terkompresi dan 1 JSON, total hanya **0.52 MiB**, satu folder tetap yang dapat ditimpa; tidak membuat rangkaian salinan fixture yang tersimpan. Sisa drive C setelah uji sekitar **54.35 GiB**. Tidak mengubah Backend/database utama/Landing, restart, commit atau push.

### Penyelarasan seluruh portal Admin dan grafik statistik

**PASS.** Ringkasan, Verifikasi Laporan, Penanganan Laporan, Monitoring Peta, Statistik & Sebaran, Artikel Edukasi serta detail laporan memakai warna Landing, kartu/filter/tombol konsisten dan tata letak responsif. Detail penanganan memprioritaskan masalah, alamat, status dan tindakan; peta serta riwayat dapat dibuka sesuai kebutuhan. Workflow, izin, dialog konfirmasi dan versioning existing dipertahankan. Tabel lebar memakai scroll di dalam kontainer pada mobile, tanpa overflow halaman.

Statistik Admin kini menggunakan grafik SVG berlabel dari `/api/analytics`: jumlah laporan/verifikasi dan progres penugasan/penanganan. Grafik sebaran memakai jumlah aktual `/api/analytics/facility-grid`, agregasi 0.01 derajat dan minimum tiga laporan disetujui; tidak menampilkan koordinat privat atau klaim hotspot. Periode seluruh waktu dan satuan dijelaskan. Indikator dapat bertumpang tindih, sehingga tidak dijadikan persentase; tidak membuat tren waktu karena endpoint tidak menyediakannya. Peta operasional tetap Leaflet berwarna dengan marker data berwenang. Empty/loading/error/retry tetap tersedia. Mode grafik opt-in Admin, tanpa mengganti analitik role lain.

Perbaikan integrasi CMS: selector output status sebelumnya dapat menghasilkan null karena markup tidak memiliki role eksplisit. Markup kini memakai role=status dan JS memiliki fallback output. File utama: `admin.html`, `admin-refresh.css`, `admin-charts.js`, `contributions.js`, `education.js`, `facility-report-ui.js`, `facility-reports.js`, `facility-handling.js`; harness targeted `check-admin-refresh.mjs` dihubungkan ke fixture existing.

Final targeted Chromium **PASS**, DB fixture **24539**, HTTP **25109**, exit 0: ringkasan, verifikasi melalui dialog konfirmasi, penugasan Petugas melalui form, sedikitnya tiga marker monitoring, nilai grafik cocok dengan API, agregasi minimum tiga, simulasi error 503/retry, pembuatan draf dan publikasi artikel melalui CMS, serta navigasi mobile. Bukti `admin-refresh-qa/admin-results.json` mencatat seluruh hasil true. Desktop **1280 px** dan mobile **390 px** diperiksa melalui screenshot, termasuk detail verifikasi/penanganan, statistik/agregasi dan editor CMS. Pemeriksaan syntax/diff serta uji grafik nol dan escaping label lulus.

Bukti dipertahankan sebagai **20 JPEG + 1 JSON**, total **853,668 byte (0.81 MiB)** pada satu folder tetap `admin-refresh-qa/` di visualizations. Dua eksekusi fixture targeted (terakhir sesudah perapian visual) membersihkan database/build/Chrome/HTTP sementara; final **TempFoldersRemaining=[]**. Tidak mengubah source Backend, database utama, Landing atau Login/Register; tanpa restart server utama, commit atau push.

### Perapian per menu Administrator

**PASS.** Delapan menu Administrator kini menampilkan satu workspace per pilihan: Ringkasan, Statistik sistem, Akun & Role, Manajemen Voucher, Monitoring & Audit, Sebaran Fasilitas, Pengumuman, dan Pembayaran Reward. Navigasi memakai hash URL agar direct link, refresh dan tombol kembali browser tetap bekerja. Link pembayaran lama `#reward-payments-title` tetap dikenali. Sidebar memiliki ikon dan penanda halaman aktif; mobile memakai tombol menu, tutup melalui pilihan/outside/Escape. Leaflet menerima event open/resize existing ketika workspace ditampilkan.

Visual memakai palet Landing, header yang lebih ringkas, hero hijau Ringkasan, enam kartu metrik aktual, tautan pekerjaan utama, tabel berjarak dengan scroll internal, filter, formulir voucher/akun, kartu pengumuman, dialog dan area pembayaran yang konsisten. Angka, pembayaran, hak akses, stok dan masa berlaku tetap dari Backend existing. Tidak menambahkan framework atau mengubah logika transaksi. Bug Ringkasan existing diperbaiki pada markup: output status sebelumnya tidak memiliki role=status yang dicari operations.js, sehingga refresh berhenti sebelum mengisi angka. Primary button diberi specificity yang sesuai agar teks putih tidak berada pada latar putih.

File produk: `app/Views/administrator.html`, CSS scoped `assets/css/administrator-refresh.css` dan navigasi `assets/js/administrator-workspace.js`. Harness `check-administrator-refresh.mjs` memakai dispatch/copy fixture existing. Perubahan role lain sebelumnya dipertahankan.

Targeted browser final **PASS**, database fixture **24545**, HTTP **25115**, exit 0. Delapan menu diperiksa pada **1280/390 px**, satu panel aktif, label navigasi, ringkasan dan statistik API, pencarian akun termasuk kosong serta dialog Kelola, voucher dibuat lalu stok diubah menjadi 7 dengan readback API, audit perubahan tampil, dan pengumuman dipublikasikan dari form. Pembayaran memakai pickup sintetis baru: User mengajukan → Petugas mengambil/transit/arrived/menimbang → Administrator mengunggah bukti sintetis dan mencatat pembayaran → readback paid pada API Administrator dan Reward User. Validasi referensi berspasi ditolak. Direct link/reload dan navigasi mobile lulus; harness utama memeriksa exception/console aplikasi. Tidak ada horizontal overflow halaman.

Screenshot Ringkasan desktop, Manajemen Voucher desktop, Pengumuman mobile dan pembayaran tercatat desktop ditinjau visual; semua menu serta dua dialog memiliki capture desktop/mobile. Bukti pada satu folder tetap `administrator-refresh-qa/`: **20 JPEG + 1 JSON, 730,653 byte (0.70 MiB)**. Sentuhan akhir border/radius tombol menu diperiksa pada source setelah review screenshot. Syntax JS dan git diff check lulus. Percobaan awal menemukan bug output Ringkasan dan asumsi seed reward pending yang keliru; harness final membuat pickup sendiri sesuai workflow. Ketiga eksekusi fixture, termasuk percobaan gagal, membersihkan database/build/Chrome/HTTP, dengan **TempFoldersRemaining=[]**. Tidak ada transaksi percobaan pada database utama, perubahan Backend, restart server utama, commit atau push. Tabel lebar sengaja dapat digeser di dalam kartu pada mobile; pengelolaan akun tidak benar-benar mengubah role dalam uji visual ini.

### UI pembayaran reward yang lebih bersih

**PASS.** Halaman Pembayaran Reward Administrator kini memisahkan daftar pembayaran dan form pencatatan. Dua kartu ringkasan menghitung nominal pending/paid hanya dari data yang dimuat. Filter status dan pencarian tracking/referensi bekerja pada data tersebut. Setiap kewajiban memiliki nomor, nominal, status dan tindakan yang jelas; riwayat paid memiliki referensi, waktu WIB, pelaksana dan tautan bukti privat. Filter pembatalan tidak ditawarkan karena endpoint daftar existing hanya mengembalikan pending/paid; pembatalan tetap melalui dialog existing dan dapat dipantau pada audit serta Reward User.

Memilih kewajiban mengisi nominal Backend, membawa pengguna ke form, dan membersihkan referensi/foto/konfirmasi saat beralih ke kewajiban lain. Form memiliki kelompok input, petunjuk singkat, pratinjau bukti, konfirmasi dan tombol pencatatan lebar. Sesudah sukses, filter beralih ke pembayaran tercatat. Referensi/nominal, optimasi gambar, payload multipart, CSRF, sesi, guard double-submit dan aturan transaksi existing dipertahankan. Data teks dirender lewat textContent. Refresh memakai urutan respons agar hasil lama tidak menimpa hasil baru; sesi berakhir membersihkan daftar/ringkasan/bukti. Tombol quiet diperbaiki terhadap aturan warna !important dari CSS lama. Tidak menambahkan framework, payment gateway, atau perubahan Backend.

File: administrator.html, administrator-refresh.css, reward-payments.js dan targeted branch pada check-administrator-refresh.mjs. Final fixture **PASS**, DB **24549**, HTTP **25119**, exit 0: dua pickup sintetis diselesaikan melalui workflow User/Petugas, pencarian kosong/filter, pilih dan autofill, referensi berspasi ditolak, pratinjau foto, dua submit segera menghasilkan satu request pembayaran, paid tersimpan, bukti HTTP 200, riwayat terbaca, pembatalan pending melalui dialog, empty pending, error 503/retry, dan readback paid/voided pada Reward User. Tidak ada exception/console error aplikasi; syntax dan diff check lulus. Uji awal perlu dikoreksi karena mengharapkan riwayat voided dari endpoint yang hanya menyediakan pending/paid.

Desktop **1280 px** dan mobile **390 px** tanpa overflow halaman, screenshot daftar/form/pratinjau/paid/empty diambil; daftar desktop serta form mobile ditinjau visual. Bukti pada satu folder tetap payment-clean-qa di visualizations: **10 JPEG + 1 JSON**, total **497,539 byte (0.47 MiB)**, menimpa capture percobaan sebelumnya. Folder fixture/database/build/Chrome sementara sudah dibersihkan: final **TempFoldersRemaining=[]**; pemeriksaan sesudah percobaan awal juga tidak menemukan root fixture tersisa. Database utama tidak digunakan untuk transaksi uji. Pemeriksaan baca-saja localhost:8080 mengembalikan aset reward-payments.js terbaru dengan HTTP **200**. Tanpa restart server utama, commit atau push.

### Penyelarasan education.html publik dan tombol kembali

**PASS.** `assets/education.html` menggunakan header/hero hijau, kartu katalog, filter pencarian/kategori, pagination dan pembaca artikel dengan tipografi/palet Landing. CSS baru `education-public.css` scoped ke education-public, tanpa mengganti CMS/portal. Tombol kembali berupa tautan native: katalog menuju /home, detail artikel menuju /assets/education.html, termasuk ketika detail dibuka langsung. education.js hanya menambahkan penanda mode halaman dan tujuan/label tombol; sumber artikel, publikasi, URL filter/pagination dan sanitasi sumber existing dipertahankan. Hero katalog disembunyikan saat membaca agar judul artikel tidak diduplikasi; footer mengikuti tinggi halaman. Tidak menambah framework, gambar besar atau mengubah isi artikel.

Targeted browser final **PASS**, DB fixture **24553**, HTTP **25123**, exit 0: delapan artikel sintetis diterbitkan melalui API Admin, enam kartu halaman pertama/dua halaman kedua, previous/next, filter kategori empat artikel, pencarian kosong, reader dan sumber HTTPS, reload detail langsung serta tombol kembali. Desktop **1280 px** dan mobile **390 px** tanpa horizontal overflow; screenshot katalog desktop dan reader mobile ditinjau, lalu posisi hero/footer dirapikan dan final suite lulus kembali. Syntax dan diff checks lulus, tanpa exception/console error aplikasi. Bukti tetap di education-public-qa pada visualizations: **6 JPEG + 1 JSON**, total **205,756 byte (0.20 MiB)**, capture ditimpa pada pemeriksaan final. Kedua fixture otomatis dibersihkan, final **TempFoldersRemaining=[]**. Database/konten utama, Backend, Landing dan Login/Register tidak diubah; tanpa restart, commit atau push.

Revisi navigasi edukasi sesuai screenshot: header publik dihapus, tombol kembali menjadi ikon panah 44 px dengan aria-label/title, serta pagination menggunakan panah sebelumnya/berikutnya dan nomor halaman aktif hijau. Tautan Daftar artikel di pager dihapus; pager tidak ditampilkan pada detail karena tombol kembali sudah tersedia. Nomor dibuat dari halaman saat ini/sebelumnya dan next_page yang tersedia di API, tanpa mengarang total halaman; parameter pencarian/kategori tetap dipertahankan. Panah tanpa tujuan dinonaktifkan secara aksesibel.

Targeted fixture **PASS**, DB **24555**, HTTP **25125**, exit 0: header tidak ada, back tidak memiliki teks visual, angka aktif 1/2 sesuai perpindahan, klik nomor 2 membuka dua artikel tersisa, panah berikutnya nonaktif di halaman akhir, previous, filter, pencarian, detail/direct URL dan tombol kembali tetap lulus. Desktop 1280/mobile 390 tanpa overflow; capture katalog mobile ditinjau. Bukti kecil menimpa education-public-qa yang sama. Syntax/diff checks lulus dan **TempFoldersRemaining=[]**. Tanpa perubahan Backend/database utama, restart, commit atau push.

Penyelarasan lanjutan edukasi (katalog berikutnya dan detail): halaman detail memakai panel judul hijau dengan judul/ringkasan/tanggal, lebar workspace, ikon kembali dan isi/sumber yang konsisten dengan katalog. Tidak ada header publik atau pager katalog di detail. Konten artikel dan validasi tautan sumber tetap utuh. Versi aset diperbarui ke education-consistent-3 untuk navigasi halaman berikutnya.

Fixture **PASS**, DB **24557**, HTTP **25127**, exit 0. Pengujian membandingkan warna hero/radius kartu/ukuran back halaman 1 dan 2, klik nomor/previous, status nomor aktif, panah akhir nonaktif, kategori/pencarian, detail langsung dan back. Detail harus tanpa header, back tanpa teks visual, dan panel judul berwarna hijau yang sama. Screenshot halaman 2 dan detail pada 1280/390 px tanpa overflow; reader mobile ditinjau. Bukti ditimpa di education-public-qa: **8 JPEG + 1 JSON**, total **282,023 byte (0.27 MiB)**. Syntax/diff serta pemeriksaan exception/console lulus; **TempFoldersRemaining=[]**. Tidak ada perubahan Backend/database utama, restart, commit atau push.

### Koreksi runtime halaman kedua edukasi: versi URL dokumen

Screenshot pengguna menunjukkan HTML lama pada ?page=2. Pemeriksaan baca-saja localhost:8080 pada katalog, ?page=2 dan query baru semuanya mengembalikan HTML terbaru (CSS education-consistent-3, tanpa header publik), sedangkan respons static tidak memiliki Cache-Control. Ini konsisten dengan dokumen lama yang tersimpan per URL di browser; pengujian fixture sebelumnya memakai profil bersih sehingga tidak mereproduksinya.

Perbaikan minimal Frontend: helper publicURL menyertakan ui=education-consistent-4 pada pagination, detail artikel, submit pencarian/kategori, kembali dari detail dan tautan Bersihkan. CSS/JS pada HTML juga dinaikkan versinya. Dengan demikian navigasi meminta dokumen baru, bukan memakai entry cache ?page=N lama. Tidak mengubah Backend/cache server atau melakukan restart utama.

Verifikasi langsung melalui browser pada server utama, baca-saja tanpa login/transaksi: URL page=2&ui=education-consistent-4 menampilkan empat artikel terbit aktual, tanpa header, back ikon, tema hijau dan nomor 2 aktif. Klik nomor 1 lalu 2 berhasil; semua tautan yang diamati membawa versi dokumen baru. Screenshot penuh live-page-2.png disimpan pada education-public-qa dan ditinjau, termasuk pager. Syntax JS dan diff check lulus. Tes back fixture disesuaikan agar memeriksa pathname karena sekarang URL berisi versi. Tidak membuat fixture/build/database baru untuk pemeriksaan ini; tidak commit/push.

### Foto internet untuk seluruh artikel edukasi

**PASS.** Sepuluh artikel terverifikasi memiliki pemetaan foto utama dan pendamping di education-photos.js. Foto diambil dari Pexels (9) dan Pixabay (1), bukan hasil generasi. Foto utama muncul pada kartu katalog publik/User dan hero Edukasi User; kedua foto hadir pada halaman baca publik serta dialog baca User. Caption detail menyatakan Ilustrasi dan menautkan fotografer, halaman sumber dan lisensi; foto komunitas bukan klaim dokumentasi Bandung. Alt deskriptif, dimensi eksplisit, decoding async, lazy loading, dan penanganan kegagalan gambar dipasang. Isi artikel/sumber penelitian tidak ditulis ulang.

Lisensi diperiksa pada https://www.pexels.com/license/ dan https://pixabay.com/service/license-summary/; keduanya mengizinkan penggunaan foto sesuai batas lisensinya. Seluruh sumber/penulis/lisensi tercatat di manifest JS dan tampil sebagai kredit. Aset diunduh langsung pada ukuran tampilan 960x640 (kompos 640x480), dibatasi maksimal 256 KiB per respons; tidak menyimpan foto asli resolusi besar. Total akhir **10 JPEG = 928,038 byte (0.89 MiB)** di assets/img/education-photos. Satu komposisi daur ulang diganti setelah tinjauan visual dengan menimpa file yang sama; tidak ada salinan cadangan besar. Foto digunakan dari lokal sehingga pembacaan artikel tidak bergantung hotlink situs foto atau mengirim request gambar ke pihak ketiga.

File produk: education-photos.js, education-photos.css, education.js, user-reference.js, assets/education.html dan dashboard.html (versi aset education-photos-5). Pemetaan berdasarkan slug sepuluh artikel; artikel lain memakai fallback sesuai kategori. Belum menambah field foto pada CMS atau skema database. Landing/CMS tidak didesain ulang.

Uji Node memeriksa tepat sepuluh slug dari dokumen konten, dua foto berbeda per slug, file lokal, alt/kredit/URL HTTPS. Seluruh sepuluh file didekode dan dimensinya diperiksa; foto sumber serta capture hasil ditinjau visual. Final targeted fixture **PASS**, DB **24559**, HTTP **25129**, exit 0: katalog publik enam thumbnail berhasil dimuat, kategori, pagination/nomor halaman 1–2, pencarian kosong, detail/direct URL/back, serta katalog dan dialog User dengan dua gambar. Desktop **1280 px**/mobile **390 px** tanpa horizontal overflow; exception/console aplikasi dan syntax/diff checks lulus. Root sementara seluruh database/build/Chrome otomatis dihapus: **TempFoldersRemaining=[]**. Penggantian satu foto daur ulang setelah fixture dicek kembali melalui browser server utama.

Verifikasi utama baca-saja pada localhost:8080: keenam gambar halaman 1 dan keempat gambar halaman 2 masing-masing complete/naturalWidth>0, metadata/atribusi sesuai artikel; detail kompos memuat kedua foto beserta kredit/lisensi. Bukti education-photos-qa: 12 JPEG fixture, satu JSON, satu PNG katalog utama; total **709,696 byte (0.68 MiB)**. Tidak ada perubahan Backend, konten/database utama, migrasi, restart, commit atau push.

### Landing, nomor halaman User, dan foto CMS Admin (satu input)

**PASS WITH NOTES — aktivasi Backend utama menunggu izin.** Foto utama kini juga muncul pada Edukasi Terbaru Landing, dengan stylesheet dan versi modul baru. Angka aktif Edukasi User memakai kelas tombol khusus dan teks putih pada latar hijau. CMS Admin disederhanakan menjadi satu foto dengan pilihan Upload foto atau Tautan internet; hanya satu input terlihat. Tidak ada kolom foto pendamping/deskripsi/kredit. Alt dibuat dari judul, pratinjau dan hapus tetap tersedia. Metadata foto lama tetap dipertahankan ketika artikel diedit; pemilik foto tidak diklaim otomatis sebagai Admin. Artikel lama memakai pemetaan ilustrasi existing jika tidak mempunyai foto khusus.

Dukungan penyimpanan: migrasi additive 009 menambahkan education_articles.photos_json nullable dan education_article_photos untuk upload biner. Startup ApplyEducationContent menjalankan 005 lalu 009 secara idempoten. GET /api/ecorecycle/education/manage/photos memeriksa kemampuan (Admin); POST /api/ecorecycle/education/manage/articles/{id}/photos menerima multipart, version dan foto (Admin, draf saja). Kontrak masih menerima dua slot untuk kompatibilitas metadata lama, sedangkan UI baru hanya mengelola foto utama. GET /api/ecorecycle/education/media/{id}/{slot} hanya tersedia bagi publik untuk artikel published, atau Admin untuk draf/arsip. Cache private/no-store dan nosniff diterapkan. URL HTTPS disimpan tanpa di-fetch server. Upload JPEG/PNG/WEBP dioptimalkan client, dibatasi 750 KiB per file tersimpan, total request 2 MiB, diperiksa magic MIME/resolusi dan kapasitas packet database. Versi draf dikunci FOR UPDATE; penggantian metadata/blob atomik dan rollback pada error. Simpan teks dan simpan foto adalah dua request berurutan; bila tahap foto gagal, UI menyatakan teks sudah tersimpan dan foto belum tersimpan, tidak memalsukan sukses. Publikasi diblokir selama perubahan foto belum disimpan.

File terkait: index/dashboard/admin/education HTML, education.js, education-photos.js/CSS, user-reference.js, admin-refresh.css; model/repository/handler edukasi dan berkas photos baru; 009 dan loader migrasi; targeted check-education-cms-photos.mjs. Go tests seluruh internal/handlers, internal/models, internal/repositories dan db_init/migrations lulus; tambahan unit URL/scan metadata lulus. Syntax JS serta diff check lulus.

Final fixture **PASS**, DB **24567**, HTTP **25137**, exit 0: satu input terlihat pada kedua mode, upload disimpan, diganti URL melalui UI, diganti upload kembali, reopen preview, alt otomatis, foto draf anonymous 404, published 200, User POST 403, URL/mode campuran/SVG ditolak, versi stale 409, concurrent photo save 200/409, trigger kegagalan INSERT membuktikan rollback byte hash dan versi tidak berubah, publikasi/reader User-publik, thumbnail Landing, angka halaman putih dan desktop 1280/mobile 390 tanpa overflow. Uji awal dikoreksi pada harness (menunggu reload selesai dan dialog versi terbaru benar-benar terbuka sebelum klik publikasi). Semua fixture, termasuk percobaan gagal, membersihkan database/build/Chrome/HTTP; final **TempFoldersRemaining=[]**. Screenshot form satu input mobile ditinjau, lalu specificity warna mode aktif diperbaiki pada CSS. Bukti education-cms-qa: 10 JPEG + 1 JSON, 382,050 byte.

Runtime utama baca-saja: server PID **15088** (go-build/server.exe, parent **23852**) masih memakai build lama; skema ecorecycle memiliki **11 artikel**, belum ada kolom photos_json/tabel upload. Oleh karena itu form menampilkan bahwa penyimpanan foto belum aktif dan tidak mengizinkan simpan palsu. Backup edukasi tersimpan di visualization privat education-cms-activation/education-before-009.sql (**24,420 byte**). Candidate education-cms-activation/server-candidate.exe (**10,964,992 byte**, SHA256 **837D5D42BA745315E1333AF9FAEC3618AB1F106BE70920EE1B88EA97E5AC74DE**) sudah dibangun; satu file tetap, bukan rangkaian build. Konfigurasi/kredensial tetap di .env, tidak disalin ke repository. Belum menjalankan migrasi utama atau restart/commit/push. Aktivasi memerlukan persetujuan pengguna sesuai larangan perubahan database utama otomatis.

### Aktivasi terkontrol setelah persetujuan pengguna

Pengguna memilih **Izinkan aktivasi terkontrol** setelah backup dan kandidat siap. Identitas proses lama diverifikasi ulang (PID 15088, executable go-build berakhiran 068bbee9.../server.exe), hash kandidat dicocokkan dengan hasil build, dan binary lama masih tersedia untuk rollback. Hanya proses SAMPIRA tersebut dihentikan; tidak menghentikan MariaDB atau proses lain. Kandidat dijalankan hidden dari working tree dengan konfigurasi .env yang tetap, port 8080 dan bind 127.0.0.1. Proses aktif baru **PID 1896**, executable `education-cms-activation/server-candidate.exe`; detail lokal berada pada activation.json privat.

Verifikasi baca-saja sesudah aktivasi: /login **HTTP 200**, API artikel publik **HTTP 200 / 10 artikel terbit**, endpoint konfigurasi foto tanpa sesi **401** (route Backend baru aktif), total artikel database **11**, kolom photos_json sudah tersedia dan tabel education_article_photos berisi **0 upload**. Tidak ada artikel/pembayaran/upload percobaan pada database utama. Migrasi 009 sudah aktif sehingga input foto dapat digunakan oleh Admin setelah reload. Backup 11 artikel dipertahankan. Status fitur menjadi **PASS**; tanpa commit atau push.

### Penyegaran sidebar Admin

**PASS.** Sidebar tetap hijau tua SAMPIRA, dengan brand lebih ringkas, kelompok Operasional serta Data & publikasi, menu aktif hijau lembut dan indikator titik, jarak/ikon konsisten, serta ikon Keluar. Mobile memakai satu kolom, tombol Menu dan fokus keyboard tetap tersedia; reduced-motion dihormati. Perubahan hanya markup sidebar `app/Views/admin.html` dan aturan scoped `assets/css/admin-refresh.css` (versi admin-sidebar-8); alur Backend tidak diubah.

Uji browser fixture terisolasi pada 1280 dan 390 px: keenam menu membuka panel, satu menu aktif, form logout tetap POST /logout, buka/tutup menu mobile, tutup sesudah memilih halaman dan Escape lulus; tidak ada overflow horizontal. Screenshot desktop/mobile diperiksa di admin-sidebar-qa (dua JPEG kecil, ditimpa saat pengujian ulang). Koreksi layout mobile menjadi satu kolom juga diperiksa secara visual. Fixture, browser profile dan build sementara otomatis dibersihkan. Tidak ada perubahan database utama, restart server utama, commit atau push.


### Penyederhanaan peta, grafik, navigasi Administrator dan pembaca artikel

**PASS dengan batasan data sebaran existing.** Monitoring Admin memakai satu peta berwarna selebar konten, filter ringkas, legenda existing dan daftar alamat dalam details. Statistik Admin kini memiliki grafik batang vertikal untuk laporan/verifikasi, horizontal untuk penanganan/penugasan serta grafik agregasi wilayah. Nilai tetap berasal dari API analytics; tidak membuat deret waktu atau persentase dari indikator yang beririsan.

Akar masalah peta Administrator: halaman belum memuat CSS/JS Leaflet meskipun modul agregasi menggunakannya. Ditambahkan Leaflet 1.9.4 dengan SRI yang sama dengan Admin; error library tidak tersedia diberi pesan eksplisit. Peta berwarna memakai /api/analytics/facility-grid, pusat/area sel agregasi dan ambang minimal 3 laporan disetujui tetap dipertahankan. Tanpa sel yang memenuhi syarat, peta dasar tetap tampil tanpa mengarang titik. ResizeObserver existing tetap memperbaiki ukuran setelah navigasi. Isolasi stacking peta mencegah kontrol Leaflet menimpa sidebar mobile.

Header/sidebar Administrator memakai irama sidebar Admin: kelompok menu, ikon SVG, active state hijau lembut, header lebih ringkas dan tombol Keluar berkontras. Seluruh tautan hash dan alur akun/voucher/pembayaran dipertahankan. Pembaca artikel publik dan dialog User menggunakan paragraf serta heading plain text melalui DOM textContent (tanpa menginterpretasikan HTML), jarak baca dan foto/atribusi konsisten. CSS serta modul terkait diberi versi cache baru.

Uji nyata browser fixture DB24571/HTTP25141: tiga laporan sintetis dibuat User dan disetujui Admin, tiga marker tampil, jumlah laporan serta sel agregasi pada grafik sama dengan API (3); Administrator menampilkan satu sel agregasi dengan rectangle/circle Leaflet, tile jalan berhasil dimuat. Navigasi sidebar mobile Administrator lulus. Artikel sintetis dibuat/diterbitkan melalui API CMS pada fixture, dibuka di halaman publik dan dialog Edukasi User, heading/paragraf tampil dan dialog dapat ditutup. Screenshot 1280/390 diperiksa: peta, grafik, sidebar, artikel publik serta dialog User; tanpa overflow horizontal. Tidak mengklaim uji ulang transaksi pembayaran karena cakupan ini presentasi/peta. Bukti JPEG kecil ditimpa dalam maps-reader-qa; fixture, profil browser dan build sementara dibersihkan otomatis. Tidak ada migrasi atau perubahan database utama, restart utama, commit atau push.


### Detail penjemputan User

**PASS.** Halaman Detail penjemputan menggantikan judul/pencarian Pelacakan: input nomor dan tombol Lacak tidak lagi terlihat, termasuk pintasan pencarian di bawah Riwayat. Elemen internal tetap tersembunyi untuk kompatibilitas navigasi Detail existing. Ditambahkan tombol kembali ke Riwayat, ringkasan ID/status/kategori/reward dengan ID panjang membungkus, kartu lokasi dan perkembangan permintaan terpisah; stepper horizontal yang bertumpuk dihapus dari detail. Data status, estimasi/aktual, pembayaran, alamat, peta dan riwayat tetap memakai API existing. File: dashboard.html, dashboard.js dan CSS scoped user-reference.css, versi pickup-detail-10.

Browser fixture DB24573/HTTP25143: User membuat pickup sintetis berkoordinat, membuka Detail melalui openTrackingDetail existing; ID sesuai respons API, form tracking hidden, label header Detail Penjemputan, riwayat serta Leaflet tampil dan kembali ke Riwayat berhasil. Screenshot 1280/390 diperiksa tanpa overflow horizontal. Dua JPEG kecil disimpan pada pickup-detail-qa; fixture/profile/build sementara otomatis dibersihkan. Tidak ada perubahan database utama, restart, commit atau push.


### Role tetap dan satu penjemputan dengan beberapa kategori

**Implementasi/fixture PASS; aktivasi utama belum dilakukan.** Klarifikasi pengguna: Administrator dilarang mengubah role akun lain, bukan memperbaiki error perubahan role. Role di dialog Akun & Role kini readonly; PATCH /api/administrator/accounts/{id} menolak perubahan role dengan HTTP 403 sesudah penguncian dan pengecekan kondisi sebelumnya. Pengaturan aktif/nonaktif akun, alasan wajib, larangan perubahan akun sendiri, pencabutan sesi, audit transaksi dan pengaman tugas Petugas tetap dipertahankan. Tests lama yang mengharapkan eskalasi role disesuaikan dengan kebijakan baru; skenario revokasi memakai Admin fixture existing, bukan membuat Admin lewat API perubahan role.

User dapat memilih beberapa kartu kategori dalam satu permintaan dan mengisi berat kg per kategori. API estimate_reward menghitung total dan rincian dari tarif database. Field items berupa JSON string pada multipart/JSON: [{category,weight_kg},...]; request_pickup/update_pickup juga menerima array items pada JSON. Batas 1–20 kategori unik, berat positif maksimal dua desimal, total <=99999.99 kg; nominal dari client diabaikan. Satu baris pickup/satu nomor tracking, kategori_id pertama untuk kompatibilitas, total berat/reward/biaya pada kolom existing. Migrasi additive **010_pickup_category_items.sql** menambah pickups.category_items LONGTEXT nullable dan dijalankan setelah migrasi idempotency existing. Data lama tetap NULL dan alur satu kategori lama tetap didukung.

Rincian kategori disimpan atomik dalam transaksi pembuatan/edit; komposisi kategori/berat kanonik termasuk fingerprint idempotency baru, fingerprint request lama dipertahankan. Detail/list menampilkan items dan nama kategori gabungan; filter Riwayat dapat mencocokkan masing-masing kategori. Edit pending mempertahankan rincian per kategori. Petugas menimbang setiap kategori di dialog sederhana: jumlah berat aktual wajib sesuai total dan kategori harus tepat sesuai pengajuan. Reward final dijumlahkan berdasarkan berat aktual serta tarif tiap kategori dari database, bukan satu tarif untuk seluruh berat. Update rincian final, status selesai, kewajiban reward dan poin berada dalam transaksi/lock existing; duplicate verification tetap 409. Perhitungan pembayaran/poin/voucher tidak diganti.

Browser fixture **DB24577/HTTP25147**, desktop 1280/mobile390: dua kategori dipilih melalui form User, estimasi dan total 3 kg sesuai API, satu permintaan dibuat melalui UI, detail/rincian benar, edit API lulus, retry key sama mengembalikan pickup sama dan komposisi berbeda 409, kategori ganda/berat negatif ditolak. Petugas mengambil tugas, transit, tiba di hub, pengiriman tanpa berat kategori ditolak; trigger kegagalan insert pickup_rewards menghasilkan 500 dan rollback status/rincian final tetap arrived/belum ditimbang. Trigger dilepas lalu penimbangan lewat browser berhasil, verifikasi ulang 409, User melihat completed dan satu catatan reward. API legacy tanpa items masih menerima pickup. Administrator melihat role readonly; request paksa mengganti role ditolak 403; menonaktifkan akun melalui UI berhasil tanpa mengganti role. Screenshot delapan JPEG ditinjau (363429 byte), termasuk dialog timbang mobile dan role readonly. Fixture/profile/build sementara dibersihkan. Go tests seluruh internal/handlers lulus; package migrations berhasil dikompilasi (tanpa unit test sendiri); targeted fingerprint/input tests ditambahkan. Skrip regresi Phase 9/10 yang disesuaikan hanya diperiksa syntax, tidak mengklaim suite historis tersebut dijalankan ulang.

Persiapan aktivasi: backup baca-saja **10 pickup** utama ke multi-category-activation/pickups-before-010.sql (**6699 byte**). Pemeriksaan kolom utama category_items masih **belum ada**. Build kandidat berada pada satu path tetap multi-category-activation/server-candidate.exe. Belum ada migrasi/perubahan data utama atau restart/commit/push. UI memblokir pengiriman beberapa kategori bila estimate_reward runtime lama tidak mengembalikan items. Penegakan role di Backend dan penyimpanan multi-kategori memerlukan aktivasi build baru serta migrasi 010 dengan persetujuan pengguna. Setelah data multi-kategori nyata dibuat, jangan rollback ke binary lama yang menghitung seluruh berat memakai kategori pertama; gunakan perbaikan maju atau build yang tetap memahami category_items.


#### Aktivasi terkontrol migrasi 010 — disetujui pengguna

Pengguna memilih **Izinkan aktivasi terkontrol**. Kandidat diverifikasi SHA256 **2210FF50252E4E87994682617D90BDE48A728D5424C9BB02D13272F0980AB2EC**. Proses lama **PID1896** beserta executable education-cms-activation/server-candidate.exe/hash **837D5D42...** dicocokkan sebelum dihentikan; binary lama dipertahankan untuk rollback. Hanya proses SAMPIRA terverifikasi diganti, tidak menghentikan database/proses lain. Build baru berjalan hidden dari working tree dengan .env existing, bind127.0.0.1 port8080, **PID30048**, executable **multi-category-activation/server-candidate.exe**. Metadata privat activation.json dan log kecil berada di folder aktivasi yang sama.

Pemeriksaan runtime utama sesudah aktivasi (baca-saja, tanpa login/mutasi akun atau transaksi): /login **HTTP200**; POST estimate_reward untuk Computers2kg + Small Gadgets1kg **HTTP200**, dua rincian, total3kg, gross19000, fee2500, net16500 menurut tarif database utama. Tidak membuat pickup/pembayaran percobaan. Kolom **category_items LONGTEXT nullable** tersedia; pickup utama tetap **10**, seluruh kategori_items lama NULL. CHECKSUM TABLE pickups sebelum/sesudah sama **827643756**, sehingga data pickup existing tetap terjaga. Backup **6699byte** dipertahankan; konfigurasi/kredensial tidak disalin ke repository. Larangan perubahan role serta dukungan multi-kategori kini ada pada Backend aktif yang sama dengan build teruji fixture. Tidak mengklaim pengujian penimbangan/perubahan akun dengan data utama; pengujian mutasi tersebut dilakukan pada fixture.

Status aktivasi menjadi **PASS**. User/Petugas/Administrator perlu reload Ctrl+F5 untuk aset terbaru. Tidak ada commit/push. Tetap perhatikan batas rollback setelah permintaan multi-kategori nyata mulai dibuat.


### Laporan fasilitas bersama dan konfirmasi akun terdampak

**Implementasi dan fixture PASS; aktivasi utama menunggu persetujuan migrasi 011.** Warga dapat membaca daftar Laporan warga di atas form Lapor Fasilitas, mencari berdasarkan judul/alamat/nomor laporan, memfilter kategori, memuat halaman berikutnya dan memilih **Saya juga terdampak**. Tombol Buat laporan baru tetap menuju form existing. Jumlah adalah **akun terdampak**, mencakup pelapor awal satu kali, bukan estimasi jumlah penduduk. Konfirmasi merupakan pernyataan warga dan tidak mengubah/menggantikan verifikasi Admin atau status penanganan. Laporan pending langsung terlihat dengan label menunggu verifikasi, approved tetap terlihat, rejected/revision_required tidak dipublikasikan. Laporan selesai tetap terlihat dengan tombol konfirmasi baru nonaktif.

API baru: GET /api/ecorecycle/facility-reports/community (User aktif saja, q<=100byte, category valid, before_id positif; maksimal20 item/cursor) dan POST /api/ecorecycle/facility-reports/{id}/affected (User aktif saja, menggunakan actor sesi, tidak menerima identitas warga dari body). Proyeksi bersama hanya ID/nomor laporan, judul, kategori, alamat fasilitas, status, waktu, jumlah dan flag milik/konfirmasi akun sendiri. Tidak mengekspos reporter_id, nama/kontak akun, deskripsi privat, koordinat presisi, foto, catatan verifikasi atau daftar pengonfirmasi. Endpoint detail, histori, foto dan bukti existing tetap memakai aturan ownership semula; foto tidak dijadikan publik. Cache respons community private/no-store.

Migrasi additive **011_facility_affected.sql** membuat facility_report_affected dengan PK(report_id,user_id), FK report/user serta confirmed_at UTC. Pelapor dihitung implisit +1 dan tidak diinsert sebagai pengonfirmasi tambahan. Konfirmasi mengunci report/handling dalam transaksi, menolak laporan tidak tersedia/selesai untuk konfirmasi baru, mengecek konfirmasi existing, menyimpan lalu menghitung hasil commit; retry/konkurensi tidak menggandakan hitungan. Retry existing tetap berhasil sesudah penanganan selesai. Support tidak menaikkan version laporan sehingga tidak menggagalkan verifikasi Admin yang sedang dibuka. Saat revisi laporan berhasil, konfirmasi lama dihapus dalam transaksi yang sama dan dicatat dalam histori revisi, agar tidak dianggap menyetujui isi baru; jika revisi gagal, konfirmasi lama tetap utuh.

DTO private FacilityReport dan FacilityHandlingSummary menambah affected_count melalui query count; tampil pada ringkasan/antrean/detail Admin serta daftar/detail tugas Petugas. Tidak melonggarkan akses Petugas ke laporan yang belum ditugaskan dan tidak mengubah workflow verifikasi, penugasan atau hasil pemeriksaan. File terkait: model/repository laporan dan penanganan, facility_community.go, registrasi route/migrasi, facility-community.js/css, facility-reports.js, facility-report-ui.js, facility-handling.js/ui.js, admin-workspace.js dan versi aset view User/Admin/Petugas community-13. Tidak memakai framework/layanan baru.

Uji browser terarah fixture terakhir **DB24581/HTTP25151** (port24579 sempat masih terdaftar terpakai, sehingga diganti tanpa menghentikan proses lain): laporan berfoto dibuat oleh UserA; UserB langsung melihat laporan pending dan mengonfirmasi melalui UI. Pelapor tetap1 saat mengonfirmasi sendiri, UserB menjadi2, UserC menjadi3. Lima retry UserB dan empat request bersamaan UserC tidak menambah duplikat; body user_id palsu diabaikan. Versi/status report tetap pending/version1 sebelum Admin memverifikasi. Detail/foto privat UserA tetap404 bagi UserB; role Admin/Petugas ditolak403 pada API konfirmasi, anonim401, origin asing403. Trigger kegagalan insert affected menghasilkan500 tanpa menaikkan jumlah. Revisi yang gagal karena trigger history mempertahankan2 konfirmasi; revisi berhasil mereset menjadi1 dan flag UserC kembali false. Laporan ditolak hilang dari daftar serta konfirmasi404. Status completed disiapkan secara SQL pada fixture dengan public_result valid untuk pengujian guard: konfirmasi baru409, retry konfirmasi existing tetap sukses. Tidak mengklaim workflow penyelesaian penuh dijalankan ulang. Pagination21 data fixture menghasilkan20+1 tanpa duplikat; kategori/cursor invalid400. Admin melihat3 pada antrean/detail; Petugas setelah penugasan melihat3 pada daftar/detail. Screenshot1280/390 ditinjau, tanpa overflow horizontal; sembilan artefak JPEG/JSON sekitar328KB ditimpa pada folder tetap facility-community-qa. Seluruh fixture/profile/build sementara dibersihkan. Go tests internal/handlers/internal/models lulus; repositories/migrations terkompilasi (tidak mempunyai unit test sendiri).

Persiapan aktivasi: backup baca-saja facility_reports/facility_handling/facility_assignments utama pada facility-community-activation/facility-before-011.sql (**7319byte**); laporan utama **1**, tabel affected **belum ada**. Checksum baseline: facility_reports=2810803515; facility_handling=2423562545; facility_assignments=1289864781. Kandidat teruji pada facility-community-activation/server-candidate.exe, SHA256 **E24392EB5CC00DFB7354ADE43CB425F3E7397BF0E9AC0F1AE7ED54BF9592F1B3**. Tidak ada insert konfirmasi/laporan/pengujian pada database utama, migrasi utama, restart, commit atau push. UI memberi pesan belum aktif jika runtime lama belum mengenali endpoint community. Aktivasi memerlukan persetujuan pengguna sesuai larangan perubahan database utama otomatis; build lama yang memahami multi-kategori tetap dipertahankan untuk rollback.

Penyesuaian assertion histori pada skrip regresi Phase3 mengikuti catatan reset konfirmasi pada revisi; skrip tersebut hanya diperiksa syntax pada pekerjaan ini, tidak mengklaim suite Phase3 dijalankan ulang.


#### Aktivasi terkontrol laporan bersama — migrasi 011

Pengguna memilih **Izinkan aktivasi terkontrol**. Sebelum penggantian, proses **PID30048** dan executable multi-category-activation/server-candidate.exe cocok dengan hash **2210FF50...**, kandidat baru cocok dengan SHA256 **E24392EB5CC00DFB7354ADE43CB425F3E7397BF0E9AC0F1AE7ED54BF9592F1B3**, serta backup7319byte dan checksum baseline diperiksa ulang. Hanya PID SAMPIRA tersebut dihentikan; MariaDB/proses lain tetap berjalan. Build baru dijalankan hidden dari working tree dengan .env existing, bind127.0.0.1 port8080. Proses aktif **PID25616**, executable **facility-community-activation/server-candidate.exe**; binary sebelumnya tetap tersedia sebagai rollback, metadata berada di activation.json privat.

Pemeriksaan utama baca-saja: /login HTTP200; GET community tanpa sesi HTTP401; aset facility-community.js/css community-13 HTTP200. Tabel facility_report_affected tersedia dengan PK gabungan report_id,user_id, jumlah konfirmasi **0**; laporan utama tetap **1**. Checksum sebelum/sesudah identik: facility_reports2810803515, facility_handling2423562545, facility_assignments1289864781, pickups827643756. Tidak membuat laporan/konfirmasi/akun/pembayaran percobaan pada database utama. Pengujian interaksi User/Admin/Petugas tetap mengacu fixture terisolasi, tidak mengklaim klik konfirmasi lewat sesi utama. Status aktivasi **PASS**; reload Ctrl+F5 pada ketiga role. Tanpa commit/push. File fixture sudah dibersihkan, backup dan executable aktif dipertahankan.


### Revisi laporan warga di bawah form dan Detail fasilitas — 9 November 2026

Penempatan akhir mengikuti revisi terbaru: **Laporan fasilitas warga berada di bawah form Lapor Fasilitas**, bukan di Beranda. Tidak menambah form pencarian besar. Kartu mempertahankan jumlah akun terdampak dan konfirmasi idempotent, serta menambah tombol **Detail**. Dialog native menampilkan judul, kategori/status, nomor/waktu, deskripsi kondisi, foto laporan asli, alamat, koordinat/peta Leaflet berwarna, dan hasil penanganan yang telah dipublikasikan bila tersedia. Layout desktop dua kolom dan mobile satu kolom; penutupan mengembalikan fokus ke tombol Detail dan membuang instance peta.

API baca-saja baru, khusus sesi User aktif: `GET /api/ecorecycle/facility-reports/community/detail/{id}` dan `GET /api/ecorecycle/facility-reports/community/photo/{id}`. Sesuai permintaan terbaru, foto laporan fasilitas dan titik fasilitas kini dapat dilihat warga lain melalui route khusus ini. Proyeksi daftar tetap ringkas; identitas/kontak pelapor, catatan verifikasi, daftar pengonfirmasi dan bukti internal petugas tidak dikirim. Route detail/foto privat existing tetap memakai ownership semula. Laporan rejected/revision_required tidak dapat diakses melalui kedua route bersama. Tidak ada migrasi baru. Konflik pola ServeMux yang ditemukan saat startup fixture diperbaiki dengan namespace `community/detail/{id}` dan `community/photo/{id}`.

Alamat otomatis untuk pickup dan fasilitas menggunakan modul bersama `location-address.js`: pemilihan pin/klik peta/GPS melakukan reverse geocoding Photon setelah debounce, memperbarui alamat dan koordinat; alamat tetap boleh dikoreksi. Tidak mencari untuk pin default sebelum dipilih. Guard urutan/abort melindungi dari respons lama dan perubahan manual; lookup gagal tidak mengarang alamat. Navigasi berikutnya menunggu lookup selesai. Cache maksimal20 titik hanya di memori. Tidak menambah dependency/framework. [Dokumentasi Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md). Pemeriksaan langsung titik publik Bandung menghasilkan HTTP200 dan header CORS `*`; hasil alamat bergantung jangkauan/ketersediaan provider.

**Verifikasi PASS:** Go targeted tests `./internal/handlers ./internal/repositories ./internal/models` (repositories tidak memiliki test sendiri). Fixture MariaDB24585/HTTP25155: dua User sintetis; laporan berfoto/titik dibuat; warga kedua mengonfirmasi menjadi2; Detail menampilkan deskripsi/foto dan Leaflet; private detail/photo milik pelapor tetap404; respons bersama tidak memuat field identitas/internal; setelah Admin menolak, detail/photo bersama404, anonim401. Form laporan langsung terbuka dan feed berada setelah form, tidak di Beranda. GPS/klik peta mengisi kedua alamat, next diblokir saat loading, respons lama/manual-edit/error/retry diuji dengan reverse-provider stub deterministik; submit laporan dan pickup benar-benar tersimpan di fixture. Screenshot1280/390 ditinjau untuk feed, dialog dan alamat, tanpa overflow halaman. Foto fixture adalah PNG sintetis, bukan foto fasilitas sungguhan. Pengujian API penyedia langsung terpisah dari stub browser. Fixture/profile/build sementara dibersihkan, gambar/JSON kecil ditimpa di satu folder tetap `home-location-qa`. Tidak membuat akun/laporan/konfirmasi/pembayaran percobaan di database utama; tidak commit/push.


Aktivasi lokal terkontrol selesai: proses lama PID25616/executable/hash dicocokkan sebelum dihentikan. Backend terbaru aktif **PID33632**, `community-detail-activation/server-candidate.exe`, SHA256 **38E881A3D8E2C7154C07E2AB03C48758CDFA16E19C8B3ADF873CB8A7293DBFC6**. Binary sebelumnya dipertahankan untuk rollback. Tidak ada migrasi baru. Checksum enam tabel utama sebelum/sesudah identik: facility_reports1580830696, facility_report_photos2255395583, facility_report_affected0, facility_handling2423562545, facility_assignments1289864781, pickups827643756. Pemeriksaan runtime utama baca-saja: /login200, kedua route detail/photo tanpa sesi401, aset community dan alamat otomatis200. Pengujian interaksi/foto/konfirmasi tetap hanya di fixture. Tidak mengklaim transaksi pengujian pada data utama. Status akhir **PASS**, perlu Ctrl+F5 untuk memuat aset terbaru.


#### Navigasi langsung form dan laporan warga hanya di kategori

Revisi lanjutan: menu Lapor Fasilitas membuka form sejak inisialisasi dan setiap event navigasi portal, sehingga tidak tertinggal pada panel Riwayat & Pelacakan. Riwayat tetap dapat dibuka secara eksplisit dari menu riwayat. Laporan fasilitas warga di bawah form hanya terlihat pada slide1 Kategori & Detail, tersembunyi pada slide2/3, detail privat/riwayat dan mode revisi. Event langkah form menyelaraskan visibilitas juga saat Kembali/reset tanpa observer tambahan. Aset menggunakan versi `facility-category-16`; tidak memerlukan build/restart Backend atau migrasi.

Fixture final MariaDB24585/HTTP25155 PASS: membuka riwayat lalu kembali lewat sidebar benar-benar menampilkan form; slide1 feed tampil, slide2 tersembunyi, Kembali menampilkan lagi, slide3 tersembunyi. Detail/foto/peta/konfirmasi warga serta submit nyata kedua form di fixture tetap lulus, viewport1280/390 tanpa overflow. Skrip uji menunggu event close dialog native sebelum memeriksa pelepasan DOM. Fixture dan artefak sementara dibersihkan; tidak ada transaksi uji pada database utama, commit/push atau perubahan Backend pada revisi ini. Reload Ctrl+F5.

Koreksi tombol Kembali form baru: handler facility-form-back masih memanggil showList meski navigasi menu telah diperbaiki. Kini Kembali dari slide pertama menuju Beranda; tombol previous slide2/3 tetap menuju slide sebelumnya. Mode revisi tetap kembali ke detail laporan. Fixture browser mengklik tombol sebenarnya, memastikan Beranda aktif, lalu membuka Lapor Fasilitas lagi dan memastikan form terlihat/list tersembunyi; regresi slide/detail/konfirmasi/alamat serta1280/390 PASS. Aset facility-back-17 pada localhost:8080 diperiksa HTTP200 dan memuat handler baru. Tanpa restart/migrasi/data uji utama.

Revisi kontrol slide fasilitas: tombol exit Kembali disembunyikan pada seluruh langkah form fasilitas; tombol previous khusus wizard muncul mulai slide2 untuk kembali satu langkah. Slide1 hanya Lanjut ke Lokasi. Footer dirapikan tanpa garis pemisah ganda, tombol aksi kanan konsisten, kontainer retry kosong disembunyikan; versi facility-controls-18. Browser fixture final PASS, screenshot footer1280 dan390 ditinjau: slide1 tanpa Kembali, slide2 Kembali terlihat dan bekerja, feed hanya pada kategori, detail/konfirmasi/alamat/submission tetap lulus. Fixture dibersihkan, tidak ada restart atau perubahan database utama.


### Integrasi dataset eksternal persampahan Bandung — 9 November 2026

Tiga ZIP pengguna diekstrak menjadi CSV+PDF metadata pada `data/datasets/` (sekitar56KB asli, tanpa duplikasi ZIP). `scripts/build-city-datasets.py` memvalidasi wilayah/satuan/nilai nonnegatif/ID, membentuk agregat menggunakan Decimal, dan menghasilkan `assets/data/bandung-waste.json`5490byte. Raw tidak diimpor ke database. JSON hanya berisi agregat dan provenance/checksum, tanpa nama pengelola/alamat unit. README dataset mencatat sumber/cakupan, satuan, pembaruan dan cara regenerasi; URL/tanggal unduh tidak dikarang.

UI baru `city-datasets.js/css`: Admin→Statistik & Sebaran dan Administrator→Statistik sistem menampilkan bagian Data Persampahan Kota Bandung terpisah dari statistik operasional. Grafik produksi perjenis/tahun dan total harian pertahun; penanganan bulanan dan total pertahun; anggota bank sampah perkelurahan/tahun dan tren. Filter tahun, tabel aksesibel dan sumber metadata tersedia. User→Pusat Edukasi mendapat ringkasan2025 serta grafik/sumber yang dapat diperluas. Tidak menambah framework, API transaksi, migrasi, peta/geocoding atau koordinat rekaan.

**Batas data wajib:** produksi72baris2018–2025, CSV TON/HARI tetapi PDF menyebut m3/hari; UI memberi peringatan dan mengikuti satuan CSV tanpa konversi atau rasio capaian. Penanganan108baris2017–2025,12bulan/tahun,satuanTON. Anggota180baris2019–2025 hanya Kecamatan Coblong;2025 mencakup33 catatan unit/6kelurahan. Jumlah anggota adalah penjumlahan antarunit, bukan orang unik atau seluruh Bandung. Total2025: produksi1507.85 satuanCSV/hari; penanganan338667.926ton/tahun; anggota662tercatat. Seluruh total tahunan diverifikasi independen terhadap CSV menggunakan Decimal. Satuan produksi masih memerlukan konfirmasi produsen sebelum dipakai sebagai angka kebijakan tanpa catatan.

Browser fixture MariaDB24585/HTTP25155 **PASS**: User/Admin/Administrator login, pemuatan gagal→retry berhasil, seluruh nilai grafik dibandingkan JSON, filtertahun awal/akhir, tren dan tabel, label cakupan/satuan. Screenshot1280/390 untuk ketiga role ditinjau; overflow CSS tabelAdmin yang ditemukan diperbaiki secara scoped. Tidak ada console error atau exception pada harness. Fixture/profile/build sementara dibersihkan; screenshotJPEG/JSON kecil memakai satu folder tetap `city-datasets-qa`. Pemeriksaan runtime utama baca-saja: dataset/JS/CSSHTTP200 dan jumlahbaris72/108/180 sesuai. Source view disajikan langsung dari workingtree, tidak perlu build/restart. Tidak ada perubahan database utama, data dummy utama, commit/push. Status **PASS WITH NOTES** untuk ketidakselarasan satuan sumber produksi; fungsional integrasiPASS. Reload Ctrl+F5.

Revisi cakupan dataset: atas permintaan pengguna, Coblong dihapus dari JSON publik, grafik Admin/Administrator, dan ringkasan Edukasi User. Builder hanya menerbitkan produksi72baris dan penanganan108baris tingkat Kota Bandung, JSON4310byte. Dua kartu ditata berdampingan pada desktop, bertumpuk di mobile. Arsip CSV/PDF asal tetap lokal tanpa diterbitkan. Cache aset bandung-2; runtime JSONHTTP200 tidak memuat banks/Coblong. Tidak ada perubahan database/restart.
Verifikasi revisi dua dataset: fixture browser User/Admin/Administrator PASS, tidak ada Coblong pada JSON, dua kartu/summary, filter/tren/tabel tetap lulus, tanpa overflow1280/390. Fixture dibersihkan.

Revisi Edukasi dan foto Beranda: banner artikel khusus halaman1 dihapus agar katalog portal halaman1/2 memakai struktur sama. Katalog publik halaman1/2 memakai header Pusat Edukasi yang lebih ringkas, CSS/tautan versi education-unified-19; filter, pagination, foto dan pembaca artikel dipertahankan. Data kota di Edukasi menjadi dua indikator ringkas, grafik/sumber tetap expandable dan perbedaan satuan tetap dijelaskan. Foto Beranda sebelumnya mengarah ke landing-bandung-2280.webp yang tidak tersedia; diperbaiki memakai file existing landing-bandung-1280.webp, dengan overlay gradasi hijau muda horizontaldesktop/vertikalmobile tanpa aset gambar baru. Fixture final PASS:8artikel sintetis dibuat/diterbitkan hanya di fixture, portal/public halaman1/2 diuji, next/previous dan detail bekerja, tema computedstyle konsisten, foto benar-benar termuat naturalWidth>0, gradasi aktif, viewport1280/390 tanpa overflow/console exception. Screenshot final ditinjau; fixture dibersihkan, artefak kecil ditimpa di education-layout-qa. Runtime foto/halaman2/JSHTTP200. Tanpa restart/migrasi/perubahan database utama/commit/push.
