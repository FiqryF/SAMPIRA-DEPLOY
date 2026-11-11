# SAMPIRA Phase 5A — Kontrak Lokasi untuk Phase 5B

Gunakan API same-origin dengan cookie `sampira_session` dan `credentials: "same-origin"`. Mutasi dengan cookie harus melewati pemeriksaan origin yang sudah berlaku. Klien non-browser dapat memakai `Authorization: Bearer <token>`. Respons JSON tetap memakai `status`, `message`, dan `data` bila ada. Seluruh rute berikut berawalan `/api/ecorecycle`.

## Pickup

| Method dan path | Akses dan hasil |
|---|---|
| POST `/request_pickup` | User. 201, `data` berisi `pickup_id`, `tracking_number`, `eco_reward`, `processing_fee`, dan `status: "pending"`. |
| POST `/update_pickup` | User pemilik, selama pickup `pending`. 200, `data` berisi `tracking_number`, `eco_reward`, `processing_fee`, dan `status: "pending"`. |
| GET `/pickup_status?tracking_number=…` | User pemilik atau Petugas yang memegang tugas. 200, `data.latitude` dan `data.longitude` bersama detail, status, dan histori lama. |
| GET `/list_pickups?type=user` | User. 200, `data` array pickup sendiri. |
| GET `/list_pickups?type=petugas` | Petugas. Alias `type=collector` tetap berlaku. 200, `data` array tugas sendiri dan antrean ringkas. Koordinat antrean selalu null sebelum klaim. |
| POST `/assign_collector` | Petugas. Body `tracking_number`, alur klaim lama. Muat ulang detail/daftar sesudah 200 untuk mendapat lokasi yang diizinkan. |

Create dan update menerima JSON, multipart, atau form URL-encoded. Kirim `item_description`, `pickup_address`, `contact_phone`, `weight_kg`, dan `category` sesuai kontrak pickup lama. Tambahkan `tracking_number` saat update. Foto opsional pada create dikirim sebagai `photo` multipart. `pickup_address` tetap wajib meski titik sudah dikonfirmasi.

| Field lokasi | Input | Output |
|---|---|---|
| `latitude` | Desimal WGS84 −90 hingga 90, inklusif | Angka JSON atau `null` |
| `longitude` | Desimal WGS84 −180 hingga 180, inklusif | Angka JSON atau `null` |

Pada JSON, gunakan angka desimal biasa atau string desimal. Pada form, kirim string. Format berisi 1–3 digit sebelum titik dengan tanda minus opsional dan maksimal tujuh digit pecahan jika titik ada. Nol sah, termasuk `0,0` jika dipilih. Eksponen, koma desimal, tanda tambah, NaN, Infinity, tipe lain, presisi berlebih, pengulangan field lokasi, dan file sebagai koordinat menghasilkan 400. Query string tidak mengisi lokasi. Untuk menghindari serialisasi eksponen pada nilai sangat kecil, Phase 5B dapat memakai `toFixed(7)` pada nilai map yang telah diperiksa valid.

| Body | Create | Update |
|---|---|---|
| Kedua field tidak dikirim | Menyimpan pasangan null | Mempertahankan titik sebelumnya, termasuk saat alamat berubah |
| Kedua field dikirim kosong, whitespace, atau JSON null | Menyimpan pasangan null | Mengosongkan titik |
| Kedua field berisi nilai valid | Menyimpan titik | Mengganti titik |
| Hanya satu field atau satu nilai valid dan satu kosong | 400 | 400 |

Contoh body JSON untuk `POST /request_pickup`.

```json
{
  "item_description": "Dua ponsel rusak",
  "pickup_address": "Jl. Asia Afrika No. 1, Bandung",
  "contact_phone": "08123456789",
  "weight_kg": 2,
  "category": "Small Gadgets",
  "latitude": "-6.9174639",
  "longitude": "107.6191228"
}
```

Contoh respons 201. Ambil `tracking_number` dari respons aktual.

```json
{
  "status": "success",
  "message": "Permohonan penjemputan sampah berhasil dibuat.",
  "data": {
    "pickup_id": 42,
    "tracking_number": "ECR-20261106-K4VTXGN2JCPV4BPGS4HJR45EQP",
    "eco_reward": 10200,
    "processing_fee": 1000,
    "status": "pending"
  }
}
```

Contoh proyeksi field lokasi dari `data` pada GET detail atau dari item GET daftar.

```json
{"pickup_address":"Jl. Asia Afrika No. 1, Bandung","latitude":-6.9174639,"longitude":107.6191228}
```

Pickup historis atau pengajuan tanpa titik mengembalikan `"latitude": null, "longitude": null`. Tampilkan alamat bila tersedia dan status “Titik penjemputan belum tersedia”. Periksa kedua field sebelum membuat marker. Khusus antrean belum diklaim, gunakan tampilan ringkas yang ada karena alamat juga disembunyikan. `GET /pickup_status?type=stats` tetap statistik agregat untuk Administrator, tanpa koordinat.

Pickup mengembalikan 401 untuk sesi invalid dan 403 untuk role atau akses detail yang ditolak. Detail yang tidak ditemukan dan update milik User lain mengembalikan 404. Update pickup yang sudah meninggalkan `pending` mengembalikan 409. Contoh error pasangan koordinat.

```json
{"status":"error","message":"Koordinat harus berupa pasangan latitude dan longitude yang valid, maksimal 7 angka desimal."}
```

## Laporan fasilitas

| Method dan path | Akses dan input |
|---|---|
| POST `/facility-reports` | User. Multipart berisi `category`, `title`, `description`, `address`, koordinat opsional, dan `photo` opsional. Header `Idempotency-Key` UUID v4 huruf kecil. 201 baru atau 200 retry. |
| PUT `/facility-reports/{id}` | User pemilik pada `revision_required`. Multipart yang sama ditambah `version` dari detail laporan. 200, status kembali `pending`, versi naik, dan histori bertambah. |
| GET `/facility-reports` dan `/facility-reports/{id}` | User untuk laporan sendiri dan Admin untuk verifikasi. 200, objek laporan atau halaman dengan `items` dan `next_before_id`. |
| GET `/facility-reports/{id}/handling` | Admin, User pemilik, atau Petugas sesuai assignment Phase 4A. 200, ringkasan lokasi dan status lapangan. |
| POST `/facility-reports/{id}/verification` | Admin. JSON `status`, `version`, dan `note` sesuai transisi Phase 3A. |

Contoh field multipart untuk pengajuan adalah `category=tps`, `title=Pintu TPS rusak`, `description=Pintu TPS tidak bisa ditutup.`, `address=Jalan Sukaraja 10, Bandung`, `latitude=-6.917463`, dan `longitude=107.619122`. Format koordinat sama seperti pickup dengan batas **enam** digit pecahan. Resolusi satu digit pecahan terakhir sekitar 11 cm pada lintang, dengan jarak bujur bergantung pada lintang. Akurasi GPS bergantung pada perangkat dan kondisi. Koordinat bersumber dari input pengguna.

Pada revisi, kirim kembali titik lama untuk mempertahankannya atau kirim pasangan baru untuk mengganti. Menghilangkan keduanya atau mengirim dua field kosong menyimpan null. Versi dan lifecycle tetap wajib. Field tambahan yang tidak diizinkan, koordinat invalid, atau ID yang salah format menghasilkan 400. Detail di luar akses User/Petugas mengembalikan 404. Versi lama dan transisi invalid menghasilkan 409. Bentuk lengkap respons, foto, histori, status, dan pagination tersedia di kontrak masing-masing. [Phase 3A](PHASE_03_API_CONTRACT.md) · [Phase 4A](PHASE_04_API_CONTRACT.md)

Contoh proyeksi `data` dari detail penanganan yang sudah ditugaskan.

```json
{
  "report_id": 41,
  "address": "Jalan Sukaraja 10, Bandung",
  "latitude": -6.917463,
  "longitude": 107.619122,
  "verification_status": "approved",
  "status": "assigned",
  "assignment_status": "active",
  "coordination_status": "not_forwarded",
  "version": 1
}
```

## Matriks lokasi

| Role | Pickup | Laporan dan penanganan fasilitas |
|---|---|---|
| User | Detail dan daftar milik sendiri, edit selama pending | Laporan sendiri, revisi sesuai status, ringkasan penanganan sesuai akses pemilik |
| Petugas | Lokasi tugas yang diklaim. Antrean belum diklaim menyembunyikan lokasi. | Ringkasan assignment aktif atau selesai yang diizinkan. Assignment yang dialihkan kehilangan akses. |
| Admin | Detail dan daftar pickup ditolak | Daftar, detail, dan ringkasan penanganan sesuai API verifikasi |
| Administrator | Statistik agregat | Akses operasional ditolak |

## Navigasi

Titik yang tersimpan menjadi tujuan dan alamat menjadi deskripsi. Phase 5A tidak menambah endpoint routing atau geocoding. Phase 5B memakai marker, asal perangkat dengan izin atau asal manual, lalu meminta rute jalan dari penyedia yang dikonfigurasi operator. Bila layanan tidak tersedia, pertahankan marker/alamat dan tawarkan navigasi eksternal setelah tindakan eksplisit Petugas. [Spesifikasi integrasi peta dan routing](PHASE_05_BE_INTEGRATION_NOTES.md#peta-dan-routing) · [OpenAPI](../openapi.json)
