# Pemeriksaan UI

Jalankan pemeriksaan lokal tanpa dependensi tambahan:

```powershell
node scripts/check-ui-quality.cjs
node scripts/check-admin-ui.cjs
```

Pemeriksaan mencakup delapan view yang dilaporkan (termasuk `auth.html` legacy): integritas dan versi CDN, kontrol klik native, label formulir, native `output`/`section`, zoom, selector CSS duplikat pada konteks yang sama, `!important`, properti transisi, dan dukungan reduced motion pada profil. CSS admin, kolektor, dan portal bersama ikut diperiksa. Ini pemeriksaan regresi lokal, bukan pengganti analisis SonarQube for IDE.

`check-admin-ui.cjs` menjalankan logika admin dengan DOM dan respons API tiruan. Pemeriksaan mencakup tabel, pencarian, filter tanggal, penugasan (batal/berhasil/gagal), payout tarif nol, dan pembatalan setelah verifikasi berat. Skrip tidak terhubung ke server atau mengubah database. Animasi admin hanya aktif pada `prefers-reduced-motion: no-preference`.

## Struktur CSS user

- `user-layout.css`: struktur dasar portal user.
- `user-inline.css`: nilai default yang diekstrak dari view ke layer `userDefaults` dengan prioritas rendah. Atribut `data-inline-style` mempertahankan penanda struktur yang sebelumnya bergantung pada atribut `style`.
- `user-flat.css`: tema dan breakpoint. Tema tidak lagi perlu melawan stylesheet portal lama dengan `!important`.

Admin dan kolektor memakai wrapper `admin-base.css`/`collector-base.css` untuk menempatkan CSS lama di layer `portalLegacy`. Nilai default dari view berada di `admin-inline.css`/`collector-inline.css`, pada layer `portalDefaults`. Tema `portal-system.css` berada di luar layer sehingga mengatur tampilan tanpa `!important`. Atribut `data-portal-style` mempertahankan penanda struktur untuk breakpoint. `portal-controls.css` menyesuaikan tombol native dengan navigasi dan kartu tugas.

## Pemeriksaan backend dan kategori

```powershell
go test ./...
node scripts/check-api-regressions.mjs
node scripts/check-waste-categories.mjs
```

Dua skrip API membutuhkan server lokal dan akun demo bawaan. Keduanya tidak mengubah data. Tes Go mencakup urutan status, kepemilikan tugas, kelayakan payout (termasuk tarif nol), ekstensi foto, dan penolakan metode HTTP. Jangan menjalankan initializer database untuk pengujian karena initializer membuat ulang database.

Refaktor JavaScript juga diperiksa dengan ESLint dan aturan SonarJS untuk cognitive complexity (batas 15), nested conditional/template literal, cabang duplikat, tipe return, alternasi karakter, serta dynamic evaluation; `no-await-in-loop` dan `no-useless-escape` ikut diperiksa. Paket pemeriksaan dipasang sementara di luar project, bukan dependensi runtime.

## Dependensi eksternal

Font Awesome 6.4.0, Leaflet 1.9.4, Chart.js 4.6.1, dan SweetAlert2 11.26.25 memakai URL versi tetap, SHA-384 dari byte berkas yang diunduh, dan `crossorigin="anonymous"`. Jika versi diganti, hitung ulang hash berkas yang persis sama dengan URL baru.

Google Fonts menyediakan CSS dinamis dan tidak dipasangi hash statis yang tidak valid.

## Batas verifikasi

Navigasi, render, dan kontras teks diperiksa melalui browser lokal pada portal user, admin, dan kolektor. Rincian misi kolektor juga diperiksa pada lebar 320 px. Pengaturan finansial, klaim tugas, serta penerbitan pengumuman tidak diubah untuk pengujian. `profile.html` dan `auth.html` adalah view legacy yang diperiksa secara statis; route `/profile` dan `/auth` saat ini tidak disediakan oleh server Go. Hasil akhir SonarQube for IDE perlu diperbarui di editor untuk memastikan diagnosis versi extension yang terpasang; pemeriksaan lokal tidak menjalankan extension SonarQube.
