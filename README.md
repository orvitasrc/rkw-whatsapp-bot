# RKW WhatsApp Bot — Phase 1 PoC

Proof of Concept sistem internal PT Rencana Kita Wisesa (RKW):

```
WhatsApp Group → WhatsApp Automation → Rule Engine → Local Storage
```

**Scope Phase 1 (sengaja dibuat sederhana):**
- Koneksi ke WhatsApp lewat WhatsApp Web automation (`whatsapp-web.js`), tanpa WhatsApp Desktop.
- Login sekali via QR code, session tersimpan lokal (tidak perlu scan ulang selama session valid).
- Memantau **satu** group (via `GROUP_ID`) untuk **semua sender**.
- Kirim **MAKEFOLDER <nama folder>**, lalu teks **SAVETOSERVER** (case-insensitive) untuk mengaktifkan save mode pribadi selama 5 menit. Image tanpa mode aktif diabaikan.
- Setiap image yang berhasil disimpan memperpanjang window 5 menit. Tujuan: `storage/YYYY-MM-DD/<folder aktif>/`. Sender lain harus mengaktifkan mode sendiri. State hanya di memory dan hilang saat restart.
- **Tidak ada AI, tidak ada database, tidak ada dashboard, tidak ada API server, tidak ada Docker.** Semua itu sengaja belum dibuat di tahap ini.
- Caption **belum** diparsing (itu untuk Phase 2).

---

## 1. Arsitektur Singkat

```
src/
├── index.js      Entry point: wiring semua modul + graceful shutdown
├── whatsapp.js   Setup WhatsApp Client (LocalAuth, QR, event status)
├── rules.js      Rule engine murni logika (cek group, cek tipe media)
├── media.js      Download media + simpan ke storage/ dengan nama aman & anti-overwrite
└── config.js     Baca & validasi environment variables (.env)
```

Alur satu pesan masuk:

1. `whatsapp.js` menerima event `message` dari WhatsApp Web.
2. `index.js` memanggil `rules.evaluateMessage()` untuk mengecek: apakah dari `GROUP_ID` yang benar? apakah ada media image?
3. Handler memproses trigger `SAVETOSERVER` per sender (`@lid`/`@c.us`). Image memerlukan save mode aktif. Kalau semua syarat lolos, `media.js` men-download media dan menyimpannya ke `storage/<tanggal message>/<folder aktif>/image-XXX.<ext>`.
4. Semua langkah dicatat ke terminal dengan timestamp.

Session WhatsApp (hasil scan QR) disimpan otomatis oleh library ke folder `.wwebjs_auth/` — **jangan commit folder ini ke git** (sudah masuk `.gitignore`).

---

## 2. Dependency yang Dipakai & Alasannya

| Package | Alasan |
|---|---|
| `whatsapp-web.js` | Library utama untuk automasi WhatsApp Web (tanpa WhatsApp Desktop), dipilih sesuai requirement. Menjalankan Chromium headless via Puppeteer di belakang layar untuk terhubung ke WhatsApp Web. |
| `qrcode-terminal` | Menampilkan QR code langsung di terminal supaya bisa langsung di-scan dari HP, tanpa perlu buka file/browser tambahan. |
| `dotenv` | Memuat konfigurasi sensitif (`GROUP_ID`) dari `.env` supaya tidak hardcode di source code. |

Tidak ada dependency AI/ML, database, atau web framework — sesuai batasan Phase 1.

---

## 3. Step-by-Step Setup (dari kosong sampai jalan)

### 3.1 Pastikan Node.js & npm tersedia (macOS)

```bash
node -v
npm -v
```

Kalau belum ada / error command not found, install Node.js LTS terbaru (disarankan via [nvm](https://github.com/nvm-sh/nvm) atau installer resmi dari nodejs.org), lalu ulangi cek di atas. Minimal Node.js versi 18.

### 3.2 Siapkan folder project

Salin semua file dari PoC ini ke sebuah folder, misalnya `rkw-whatsapp-bot/`, dengan struktur:

```
rkw-whatsapp-bot/
├── src/
│   ├── index.js
│   ├── whatsapp.js
│   ├── rules.js
│   ├── media.js
│   └── config.js
├── storage/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

### 3.3 Install dependency

Dari dalam folder `rkw-whatsapp-bot/`:

```bash
npm ci
```

Ini akan mengunduh `whatsapp-web.js`, `qrcode-terminal`, `dotenv`, dan dependency turunannya (termasuk Puppeteer/Chromium — proses download bisa memakan waktu beberapa menit tergantung koneksi internet).

### 3.4 Isi file `.env`

Salin dulu template-nya:

```bash
cp .env.example .env
```

Untuk **pertama kali menjalankan**, `GROUP_ID` boleh dikosongkan dalam `DISCOVERY_MODE=true`. Mode normal memerlukan `GROUP_ID` (lihat bagian troubleshooting untuk cara ambil `GROUP_ID` menggunakan bot ini sendiri).

Contoh isi setelah diketahui nilainya:

```env
GROUP_ID=120363012345678901@g.us
DISCOVERY_MODE=false
STORAGE_DIR=./storage
```

Semua anggota group boleh mengirim image, termasuk sender `@lid` dan `@c.us`. Kirim `MAKEFOLDER <nama folder>` lalu teks `SAVETOSERVER` sebelum image; caption image tidak mengaktifkan mode. Konfigurasi lama `ALLOWED_SENDERS`/`ALLOWED_LIDS` tidak digunakan oleh workflow ini.

### 3.5 Jalankan bot

```bash
node src/index.js
```

Kalau `GROUP_ID` masih kosong, bot akan berhenti dengan pesan error yang jelas — isi dulu `.env` (lihat 3.4 & Troubleshooting).

### 3.6 Scan QR Code

Saat pertama kali dijalankan (dan belum ada session tersimpan), terminal akan menampilkan:

```
## RKW WhatsApp Bot
Initializing...
Waiting for QR...
[QR code muncul di sini]
```

Di HP dengan **nomor WhatsApp RKW**:
1. Buka WhatsApp → Settings → **Linked Devices**.
2. Tap **Link a Device**.
3. Scan QR code yang tampil di terminal.

Setelah berhasil, terminal akan menampilkan:

```
WhatsApp authenticated
WhatsApp ready
Listening for messages...
```

Session tersimpan otomatis di folder `.wwebjs_auth/`. Selama folder ini tidak dihapus dan session tidak di-unlink dari HP, **restart berikutnya tidak akan minta scan QR lagi**.

---

## 4. Cara Mengetahui `GROUP_ID`

Set `DISCOVERY_MODE=true` di `.env`, jalankan `node src/index.js`, lalu kirim pesan ke group. Salin `GROUP ID` dari log ke `GROUP_ID` dan ubah `DISCOVERY_MODE=false` sebelum restart. Nama group tidak diperlukan.

---

## 6. Testing Skenario End-to-End

1. Pastikan `.env` sudah terisi `GROUP_ID` dan `DISCOVERY_MODE=false`.
2. Jalankan bot: `node src/index.js`, tunggu sampai `Listening for messages...`.
3. Dari anggota group mana pun, kirim **MAKEFOLDER Proses Installasi Guard**, lalu **SAVETOSERVER**, lalu **satu foto** ke group **"RKW DAILY REPORT"**.
4. Perhatikan log di terminal, seharusnya muncul urutan seperti:

   ```
   [21:32:10] Message received
   [21:32:10] Sender: 628xxxxxxxx
   [21:32:10] Media detected: image
   [21:32:11] Downloading media...
   [21:32:12] Saved: storage/2026-09-10/image-001.jpg
   ```

5. Cek folder `storage/` — akan ada subfolder tanggal (sesuai timestamp pesan) berisi file image tersebut.

Kirim foto kedua dari nomor yang sama di hari yang sama untuk memastikan penamaan otomatis lanjut ke `image-002.jpg` dan **tidak menimpa** file pertama.

---

## 7. Menghentikan & Menjalankan Ulang Bot

**Menghentikan dengan aman:** tekan `Ctrl+C` di terminal tempat bot berjalan. Bot akan menangkap sinyal ini, menutup koneksi WhatsApp dengan bersih (`client.destroy()`), baru keluar.

**Menjalankan ulang tanpa scan QR:** selama folder `.wwebjs_auth/` masih ada dan session belum di-unlink dari HP (Settings → Linked Devices), cukup jalankan lagi:

```bash
node src/index.js
```

Bot akan langsung lanjut ke `WhatsApp ready` tanpa menampilkan QR lagi.

---

## 8. Troubleshooting

**QR code tidak muncul / terpotong di terminal**
- Perbesar ukuran jendela terminal (QR butuh ruang cukup lebar).
- Pastikan tidak ada session lama yang corrupt: hapus folder `.wwebjs_auth/` lalu jalankan ulang `node src/index.js` untuk memaksa QR baru.

**QR sudah di-scan tapi tidak lanjut ke "WhatsApp ready"**
- Pastikan HP terhubung internet saat proses linking.
- Cek versi `whatsapp-web.js` — WhatsApp Web kadang berubah struktur dan butuh update versi library (`jangan upgrade langsung di production`).
- Coba hapus `.wwebjs_auth/` dan `.wwebjs_cache/` (jika ada), lalu scan ulang dari awal.

**Event `auth_failure` muncul di log**
- Biasanya session korup atau nomor sudah di-unlink dari HP. Hapus folder `.wwebjs_auth/`, jalankan ulang, scan QR baru.

**Tidak tahu `GROUP_ID` yang benar**
- Ikuti langkah di bagian "4. Cara Mengetahui GROUP_ID" di atas.
- Pastikan tidak ada spasi tambahan saat copy-paste ke `.env`.

**Sudah kirim foto tapi tidak ada log sama sekali**
- Pastikan bot berstatus `Listening for messages...` (bukan masih `Waiting for QR...`).
- Pastikan foto dikirim ke group yang **persis sama** dengan `GROUP_ID` di `.env` (bukan group lain dengan nama mirip).

**Foto gagal di-download (bot tetap berjalan)**
- Library 1.34.7 membaca `message.id._serialized`. Bila WhatsApp Web menyediakan ID sebagai `$1`, `media.js` menormalisasinya sebelum memanggil API asli. Lihat [laporan upstream](https://github.com/wwebjs/whatsapp-web.js/issues/201830).
- Log `Media compatibility` menunjukkan workaround aktif. Error download menyertakan status ID dan cause/stack; ID, media key, dan payload tidak dicetak oleh diagnostik download.
- Error `r: r` sendiri belum membuktikan penyebab. Konfirmasi dengan tes image live; kegagalan sebelum download selesai bukan bukti masalah storage.
- Jalankan `node --test` untuk tes lokal filter, penyimpanan, kompatibilitas ID, dan kelanjutan handler sesudah error. Tes ini memakai pesan mock; hasil download WhatsApp memerlukan pengujian live.

**Setelah pindah ke Windows Server nanti**
- Pastikan Node.js versi yang sama/serupa terinstall di server.
- Copy seluruh folder project (atau clone dari git tanpa `node_modules/`, `.env`, `.wwebjs_auth/`), lalu jalankan `npm ci` dan `node src/index.js` di server tersebut.
- Folder `.wwebjs_auth/` dari macOS **tidak perlu** dipindah — sebaiknya login ulang (scan QR) langsung di server untuk session yang bersih, kecuali kamu sudah tahu proses migrasi session aman untuk versi Puppeteer/Chromium di lingkungan baru.

---

## 9. Batasan yang Disengaja (Phase 1)

Sesuai scope PoC, hal-hal berikut **belum** dibuat dan memang belum perlu untuk Phase 1:
- Tidak ada AI/NLP untuk parsing caption.
- Tidak ada database (semua state hanya berupa file di `storage/`).
- Tidak ada web dashboard atau API server.
- Tidak ada containerization (Docker).
- Caption pesan belum dibaca/diparsing sama sekali.

Phase 2 (nanti, terpisah) akan menambahkan parsing caption seperti `CABIN | SY215-023 | PEMASANGAN AC` menjadi struktur folder `storage/CABIN/SY215-023/YYYY-MM-DD/`.


## Command penyimpanan lokal

Semua command case-insensitive, hanya di GROUP_ID yang dikonfigurasi. Gunakan akun anggota lain (event `message` tidak menerima pesan akun bot sendiri).

| Command | Fungsi |
|---|---|
| `MAKEFOLDER <nama folder>` | Mengatur folder pribadi. Kapitalisasi dipertahankan; karakter path berbahaya diganti. Tidak mengaktifkan atau memperpanjang mode. |
| `SAVETOSERVER` | Mengaktifkan mode 5 menit; wajib memiliki folder. |
| `TIMESAVEMODE` | Menampilkan status, folder dan sisa waktu tanpa refresh. |
| `STOPSAVE` | Mematikan mode pribadi tanpa menghapus folder. |
| `HELP` | Menampilkan panduan command di group. |

Folder dan expiry disimpan per identifier sender dalam memory; restart menghapus keduanya. Image yang diterima saat mode aktif memakai folder saat penerimaan. Antrean menyimpan batch satu per satu. Keberhasilan penyimpanan memperpanjang timer; kegagalan tidak. STOPSAVE tidak membatalkan foto yang sudah diterima dalam antrean, tetapi mencegah foto berikutnya dan mencegah download lama mengaktifkan ulang mode.

Jalankan `node --test` untuk validasi lokal. Balasan WhatsApp dan download nyata perlu dites setelah restart satu instance bot.


## Reliability dan recovery

Production wajib menggunakan `npm ci` dengan package-lock.json. **DO NOT run `npm update`.** Range dotenv/qrcode-terminal di package.json tidak mengubah versi yang dipasang npm ci; lockfile mengunci dependency transitif juga. Jangan hapus/regenerasi lockfile di server. Workaround `$1 -> _serialized` ada di src/media.js, bukan node_modules, dan tetap ada setelah npm ci.

Image dianggap berhasil hanya setelah download, direktori tersedia, write selesai, dan stat file memastikan ukuran non-zero sesuai buffer. Baru kemudian timer di-refresh dan health di-reset. Kegagalan dilog dengan timestamp ISO, sender/group/message ID, stage dan stack: MEDIA_DOWNLOAD_FAILED, STORAGE_DIR_CREATE_FAILED, STORAGE_PATH_UNAVAILABLE, atau MEDIA_WRITE_FAILED.

Setiap image yang seharusnya disimpan tetapi gagal mendapat notifikasi group. Tiga kegagalan media berturut-turut memicu satu percobaan warning admin di group yang sama. Kegagalan berikutnya tidak mengulang warning admin sampai ada save sukses. Kegagalan notifikasi dilog; tidak menambah counter media. Pengiriman notifikasi dibatasi tunggu 10 detik (tidak membatalkan request yang sedang berjalan dan tidak retry otomatis). BOTSTATUS menampilkan readiness, counter, waktu sukses terakhir (ISO UTC), dan hasil operasi storage terakhir; ini bukan jaminan drive masih sehat saat command dikirim. Tidak ada test write dari BOTSTATUS. Semua state health in-memory.

Event auth/ready/disconnect memiliki log timestamp. Tidak ada penghapusan session, auto-relogin atau auto-update library. Counter/notifikasi menangani operasi yang melempar error; download yang menggantung masih memerlukan kebijakan timeout/recovery terpisah. WhatsApp Web internal changes dapat mempengaruhi download dan pengiriman balasan; bila balasan gagal, periksa log server.

Workflow: `rkw-whatsapp-bot-mac` untuk development/testing; `rkw-whatsapp-bot-prod` untuk staging. Test perubahan di Mac, lakukan real test media, review diff, baru commit setelah approval dan deploy versi yang lolos. Jangan eksperimen langsung di production. Simpan paket source dan lockfile versi sebelumnya untuk rollback; jangan menimpa .env/session/storage ketika mengganti versi aplikasi. Kembali ke source lama tidak menjamin kompatibilitas jika WhatsApp Web sendiri berubah.

Setelah working tree clean, real WhatsApp test lulus dan media save terbukti, tag dapat dibuat (belum dijalankan):

```bash
git tag -a v1.0-stable -m "Stable RKW WhatsApp storage bot"
git push origin v1.0-stable
```

Pastikan nama tag belum digunakan; jangan force/memindahkan stable tag lama.
