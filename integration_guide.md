# Panduan Integrasi (Integration Guide) — Buku Nominatif Jabatan

Aplikasi ini telah dikonversi menjadi server API & Dashboard kepegawaian yang siap dideploy. Aplikasi lain (seperti Super Apps, Web BKPSDM, atau Aplikasi Mobile Android) dapat mengonsumsi data nominatif pejabat secara terintegrasi melalui API endpoints yang disediakan.

---

## 🚀 Base URL & Deployment
Secara default, server berjalan di port `3005` (atau port yang dispesifikasikan di environment variable `PORT`).
- Development: `http://localhost:3005`
- Production (docker / server): `http://<your-server-ip>:3005`

---

## 🔌 API Endpoints

### 1. Dapatkan Daftar Pejabat
Mengambil daftar pejabat yang sudah dikelompokkan dengan opsi pencarian dan pemfilteran lengkap.

- **Endpoint**: `/api/pejabat`
- **Method**: `GET`
- **Query Parameters**:
  - `search` (string): Kata kunci pencarian berdasarkan **Nama Pejabat**, **NIP**, atau **Jabatan**.
  - `opd` (string): Kode unit kerja (misal: `SETDA`, `DPRD`, `BKPSDM`).
  - `eselon` (string): Kode eselon (misal: `2A`, `2B`, `3A`, `3B`, `4A`, `4B`, `JF`, `-` untuk tanpa eselon).
  - `status` (string): Status kepegawaian (`Definitif`, `Pelaksana Tugas`, `Lowong`).
  - `gender` (string): Jenis kelamin (`Laki-Laki`, `Perempuan`).
  - `page` (number): Halaman pagination (default: `1`).
  - `limit` (number): Jumlah data per halaman (default: `1000`).

- **Contoh Response**:
  ```json
  {
    "total": 957,
    "page": 1,
    "limit": 10,
    "pages": 96,
    "data": [
      {
        "no": 1,
        "kd": "SETDA",
        "opd": "1. SEKRETARIAT DAERAH",
        "nama_jabatan_structural": "Sekretaris Daerah",
        "nama_jabatan_fungsional": null,
        "nama_jabatan": "Sekretaris Daerah",
        "nama_pejabat": "Ir. SUAIDI,  M.M.",
        "ket_status": "Definitif",
        "nip": "19671220 199803 1 005",
        "pangkat_gol_tmt": "Pembina Utama Madya (IV/d) / 01-02-2025",
        "pendidikan": "S.2 Magister Manajemen",
        "tmt_jabatan": "22-11-2024",
        "mkj_terakhir": "1 Tahun 7 bulan",
        "kode_eselon": "2A",
        "tmt_eselon": "22-11-2024",
        "mkj_eselon": "1 Tahun 7 bulan",
        "ket": "PIM II",
        "agama": "Islam",
        "jk_gender": "Laki-Laki",
        "nilai_kinerja": "Baik",
        "kompetensi_teknis": 78,
        "kompetensi_manajerial": 79,
        "kompetensi_social_kultural": 80,
        "kategori": null,
        "tahun_kinerja": 2022,
        "rencana_karir": "Mutasi",
        "rencana_kompetensi": null,
        "tanggal_lahir": "20-12-1967",
        "usia": "58 Tahun 6 bulan 18 Hari",
        "tmt_pensiun": "01-01-2028"
      }
    ]
  }
  ```

---

### 2. Dapatkan Detail Pejabat berdasarkan NIP
Mengambil profil lengkap seorang pejabat menggunakan nomor NIP sebagai identifier.

- **Endpoint**: `/api/pejabat/:nip`
- **Method**: `GET`
- **Contoh Request**: `/api/pejabat/19671220 199803 1 005`

---

### 3. Dapatkan Daftar OPD & Jumlah Pejabat
Mengambil daftar seluruh unit kerja (OPD) beserta total pejabat aktif di dalamnya.

- **Endpoint**: `/api/opd`
- **Method**: `GET`
- **Contoh Response**:
  ```json
  [
    {
      "kd": "BAPERIDA",
      "name": "BADAN PERENCANAAN PEMBANGUNAN, RISET DAN INOVASI DAERAH",
      "count": 26
    },
    {
      "kd": "BKPSDM",
      "name": "BADAN KEPEGAWAIAN DAN PENGEMBANGAN SUMBER DAYA MANUSIA",
      "count": 16
    }
  ]
  ```

---

### 4. Dapatkan Statistik Umum Kepegawaian
Mengambil ringkasan/dashboard data statistik untuk chart dan ringkasan.

- **Endpoint**: `/api/stats`
- **Method**: `GET`

---

## 🛠️ Cara Deploy via Docker

1. **Jalankan Container**:
   Di folder proyek Anda, cukup jalankan perintah:
   ```bash
   docker-compose up -d --build
   ```

2. **Sinkronisasi Data Real-Time**:
   File excel `BUKU NOMINATIF JABATAN TAHUN 2026 Terbaru.xlsx` di-mount ke dalam volume container. Jika Anda mengedit file excel di host, server akan secara otomatis mendeteksi perubahan tersebut dan memuat ulang cache memori server tanpa perlu restart container.
