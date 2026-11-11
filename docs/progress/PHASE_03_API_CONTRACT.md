# SAMPIRA Phase 3A — Kontrak API Laporan Fasilitas

## Akses dan rute

Base URL `/api/ecorecycle/facility-reports`. Semua rute memakai cookie portal `sampira_session` dari login same-origin atau header `Authorization: Bearer <token>`. Mutasi browser harus same-origin. Gunakan URL foto pada elemen `img` dengan cookie portal. Klien Bearer dapat mengambil blob melalui `fetch` dengan header tersebut.

| Method dan path relatif | Role | Input | Sukses |
|---|---|---|---|
| POST `/` (tanpa trailing slash) | User | `multipart/form-data`, header `Idempotency-Key` | 201 laporan baru atau 200 untuk retry |
| GET `/` (tanpa trailing slash) | User (milik sendiri), Admin (semua) | Filter dan cursor opsional | 200 halaman laporan |
| GET `/{id}` | User (pemilik), Admin | ID numerik | 200 laporan |
| PUT `/{id}` | User (pemilik) | `multipart/form-data` dengan versi | 200 laporan |
| GET `/{id}/history` | User (pemilik), Admin | Cursor opsional | 200 halaman histori |
| GET `/{id}/photo` | User (pemilik), Admin | ID numerik | 200 byte gambar privat |
| POST `/{id}/verification` | Admin | `application/json` dengan versi | 200 laporan |

Petugas dan Administrator mendapat 403 pada semua rute laporan. User yang mengakses ID laporan milik orang lain mendapat 404, sama seperti ID yang tidak ditemukan. Gunakan `id` numerik dari respons untuk URL API dan `tracking_number` sebagai nomor referensi yang ditampilkan.

## Pengajuan dan revisi

Gunakan `FormData` dan biarkan browser memasang boundary. Teks dipangkas di awal dan akhir. Setiap field hanya boleh muncul satu kali. Server menolak field tambahan dan query string pada mutasi.

| Field form | Ketentuan |
|---|---|
| `category` | Wajib. `tps` (TPS), `collection_site` (tempat pengumpulan), `waste_bank` (bank sampah), atau `other` (fasilitas lain). |
| `title` | 5–120 karakter. |
| `description` | 10–3000 karakter. |
| `address` | 5–300 karakter. |
| `latitude`, `longitude` | Opsional sebagai pasangan. Nilai desimal tanpa eksponen, maksimal enam digit pecahan. Latitude −90 hingga 90 dan longitude −180 hingga 180. Abaikan keduanya atau kirim keduanya kosong untuk menyimpan `null`. |
| `photo` | Maksimal satu file JPEG atau PNG, hingga 5 MiB dan 16 megapiksel. Ekstensi dan isi gambar harus cocok. |
| `version` | Khusus PUT, wajib berupa bilangan bulat positif dari detail terbaru. |

POST memerlukan `Idempotency-Key` UUID v4 huruf kecil. Pakai satu key per pengajuan dan gunakan kembali key yang sama untuk retry pengajuan itu. Respons 201 menyertakan header `Location` dengan URL detail. Retry dengan payload valid mengembalikan laporan yang sudah ada dalam keadaan terkininya. Perubahan data yang dikirim pada retry tidak diterapkan.

PUT hanya berlaku saat status `revision_required`. Kirim ulang seluruh field teks dan koordinat yang ingin disimpan. Foto yang sudah ada tetap dipakai jika tidak ada unggahan baru. Foto baru mengganti foto lama. Revisi mengembalikan laporan ke `pending`, menaikkan versi, dan memindahkan alasan lama ke histori yang tetap tersedia.

```javascript
const form = new FormData();
form.set("category", "tps");
form.set("title", "Pintu TPS rusak");
form.set("description", "Pintu TPS tidak bisa ditutup sejak kemarin.");
form.set("address", "Jalan Sukaraja 10, Bandung");
const result = await fetch("/api/ecorecycle/facility-reports", {
  method: "POST",
  headers: {"Idempotency-Key": crypto.randomUUID()},
  body: form
});
```

Simpan key di state pengajuan sebelum melakukan fetch jika aplikasi akan melakukan retry.

## Verifikasi Admin

Admin hanya dapat memverifikasi laporan `pending`. Body JSON berisi `status` tujuan, `version` terbaru, dan `note` opsional untuk persetujuan. Alasan wajib untuk revisi dan penolakan, maksimum 1000 karakter.

```json
{"status":"revision_required","version":1,"note":"Tambahkan alamat lengkap dan foto kondisi pintu."}
```

| Dari | Ke | Aktor |
|---|---|---|
| Belum ada | `pending` | User saat membuat |
| `pending` | `revision_required`, `approved`, atau `rejected` | Admin |
| `revision_required` | `pending` | User pemilik saat revisi |

`approved` dan `rejected` terminal. Permintaan dengan versi lama atau transisi yang tidak sah mendapat 409. Ambil detail terbaru sebelum mencoba lagi. Setiap perubahan yang berhasil menaikkan versi dan membuat satu entri histori.

## Respons JSON

Semua respons JSON yang dihasilkan handler menggunakan `status`, `message`, dan `data` jika tersedia. Foto yang berhasil diambil berupa byte dengan tipe MIME asli. Waktu dikirim dalam UTC RFC 3339. Field opsional bernilai `null`.

```json
{
  "status": "success",
  "message": "Detail laporan fasilitas.",
  "data": {
    "id": 41,
    "tracking_number": "FAC-20A17EBA1186EF3E77661C57",
    "reporter_id": 103,
    "category": "tps",
    "title": "Pintu TPS rusak",
    "description": "Pintu TPS tidak bisa ditutup sejak kemarin.",
    "address": "Jalan Sukaraja 10, Bandung",
    "latitude": null,
    "longitude": null,
    "status": "revision_required",
    "version": 2,
    "photo_url": "/api/ecorecycle/facility-reports/41/photo",
    "reviewed_by": 101,
    "reviewed_at": "2026-11-06T06:32:01Z",
    "verification_note": "Tambahkan alamat lengkap dan foto kondisi pintu.",
    "created_at": "2026-11-06T06:30:00Z",
    "updated_at": "2026-11-06T06:32:01Z"
  }
}
```

Daftar mengembalikan `data: { "items": [laporan...], "next_before_id": null }` dengan urutan ID terbaru. Filter eksak `status` dan `category` dapat digabung. Gunakan `limit` dari 1–100 (default 20) dan cursor `before_id` dari respons sebelumnya. Cursor `null` berarti halaman terakhir. Pertahankan filter yang sama saat memakai cursor.

Histori mengembalikan `data: { "items": [entri...], "next_before_version": null }` dengan versi terbaru terlebih dahulu. Gunakan `limit` dari 1–100 (default 20) dan cursor `before_version`. Contoh entri berikut menunjukkan permintaan revisi. Entri pengajuan versi 1 mempunyai `from_status: null`. `note` bernilai `null` jika kosong.

```json
{"version":2,"actor_id":101,"from_status":"pending","to_status":"revision_required","note":"Tambahkan alamat lengkap dan foto kondisi pintu.","created_at":"2026-11-06T06:32:01Z"}
```

| HTTP | Makna |
|---|---|
| 400 | Field, filter, ID, JSON atau gambar tidak valid. |
| 401 | Sesi tidak ada, kedaluwarsa, atau sudah dicabut. |
| 403 | Role atau origin tidak diizinkan. |
| 404 | Laporan tidak tersedia bagi sesi ini atau foto belum ada. |
| 409 | Versi basi atau transisi tidak sah. Muat ulang detail. |
| 413 | Body melebihi batas (6 MiB form, 16 KiB JSON). File lebih dari 5 MiB dalam form yang masih di bawah batas body mendapat 400. |
| 415 | Media type tidak sesuai. |
| 500 | Penyimpanan atau pembacaan gagal. Retry POST memakai key pengajuan awal. |

Contoh error `{"status":"error","message":"Versi atau status laporan sudah berubah. Muat ulang detail laporan."}`. Gunakan kode HTTP untuk menentukan perilaku UI.
