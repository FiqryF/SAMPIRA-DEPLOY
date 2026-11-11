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
