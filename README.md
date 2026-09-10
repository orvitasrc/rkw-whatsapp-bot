# RKW WhatsApp Bot — Phase 1 PoC

Proof of Concept sistem internal PT Rencana Kita Wisesa (RKW):

```
WhatsApp Group → WhatsApp Automation → Rule Engine → Local Storage
```

**Scope Phase 1 (sengaja dibuat sederhana):**
- Koneksi ke WhatsApp lewat WhatsApp Web automation (`whatsapp-web.js`), tanpa WhatsApp Desktop.
- Login sekali via QR code, session tersimpan lokal (tidak perlu scan ulang selama session valid).
- Memantau **satu** group (via `GROUP_ID`) dan **whitelist sender** (via `ALLOWED_SENDERS`).
- Kalau message dari group+sender yang sesuai dan mengandung **image**, image otomatis di-download dan disimpan ke `storage/YYYY-MM-DD/`.
- **Tidak ada AI, tidak ada database, tidak ada dashboard, tidak ada API server, tidak ada Docker.** Semua itu sengaja belum dibuat di tahap ini.
- Caption **belum** diparsing (itu untuk Phase 2).

---

## 1. Arsitektur Singkat

```
src/
├── index.js      Entry point: wiring semua modul + graceful shutdown
├── whatsapp.js   Setup WhatsApp Client (LocalAuth, QR, event status)
├── rules.js      Rule engine murni logika (cek group, cek sender, cek tipe media)
├── media.js      Download media + simpan ke storage/ dengan nama aman & anti-overwrite
└── config.js     Baca & validasi environment variables (.env)
```

Alur satu pesan masuk:

1. `whatsapp.js` menerima event `message` dari WhatsApp Web.
2. `index.js` memanggil `rules.evaluateMessage()` untuk mengecek: apakah dari `GROUP_ID` yang benar? apakah sender ada di `ALLOWED_SENDERS`? apakah ada media image?
3. Kalau semua syarat lolos, `media.js` men-download media dan menyimpannya ke `storage/<tanggal message>/image-XXX.<ext>`.
4. Semua langkah dicatat ke terminal dengan timestamp.

Session WhatsApp (hasil scan QR) disimpan otomatis oleh library ke folder `.wwebjs_auth/` — **jangan commit folder ini ke git** (sudah masuk `.gitignore`).

---

## 2. Dependency yang Dipakai & Alasannya

| Package | Alasan |
|---|---|
| `whatsapp-web.js` | Library utama untuk automasi WhatsApp Web (tanpa WhatsApp Desktop), dipilih sesuai requirement. Menjalankan Chromium headless via Puppeteer di belakang layar untuk terhubung ke WhatsApp Web. |
| `qrcode-terminal` | Menampilkan QR code langsung di terminal supaya bisa langsung di-scan dari HP, tanpa perlu buka file/browser tambahan. |
| `dotenv` | Memuat konfigurasi sensitif (`GROUP_ID`, `ALLOWED_SENDERS`) dari `.env` supaya tidak hardcode di source code. |

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
npm install
```

Ini akan mengunduh `whatsapp-web.js`, `qrcode-terminal`, `dotenv`, dan dependency turunannya (termasuk Puppeteer/Chromium — proses download bisa memakan waktu beberapa menit tergantung koneksi internet).

### 3.4 Isi file `.env`

Salin dulu template-nya:

```bash
cp .env.example .env
```

Untuk **pertama kali menjalankan**, `GROUP_ID` dan `ALLOWED_SENDERS` boleh dikosongkan dulu **kecuali** kamu sudah tahu nilainya — tapi bot akan menolak start kalau kosong (lihat bagian troubleshooting untuk cara ambil `GROUP_ID` menggunakan bot ini sendiri).

Contoh isi setelah diketahui nilainya:

```env
GROUP_ID=120363012345678901@g.us
ALLOWED_SENDERS=628123456789,628987654321
STORAGE_DIR=./storage
```

Catatan format `ALLOWED_SENDERS`:
- Pisahkan dengan koma, tanpa spasi.
- Gunakan kode negara + nomor, **tanpa** tanda `+` dan **tanpa** `@c.us` (bot akan menormalisasi otomatis).
- Contoh: `628123456789` untuk nomor Indonesia yang diawali `08123456789`.

### 3.5 Jalankan bot

```bash
npm start
```

Kalau `GROUP_ID`/`ALLOWED_SENDERS` masih kosong, bot akan berhenti dengan pesan error yang jelas — isi dulu `.env` (lihat 3.4 & Troubleshooting).

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

Cara termudah pakai bot ini sendiri:

1. Jalankan bot (`npm start`) dan pastikan sudah login (sudah sampai `WhatsApp ready`).
2. Buat/pastikan group **"RKW DAILY REPORT"** sudah ada dan nomor RKW sudah jadi anggotanya.
3. Kirim **pesan teks apa saja** (misalnya "test") ke group tersebut dari nomor manapun.
4. Sementara ini `GROUP_ID` belum diisi sehingga message akan diabaikan secara silent — untuk mengetahui ID-nya, tambahkan sementara baris berikut di `src/index.js`, tepat di baris pertama fungsi `handleIncomingMessage`:

   ```js
   console.log('DEBUG message.from =', message.from);
   ```

5. Jalankan ulang bot, kirim pesan test lagi ke group. ID yang muncul (format `xxxxxxxxxx@g.us`) itulah `GROUP_ID`-nya.
6. Isi `GROUP_ID` di `.env`, lalu **hapus lagi** baris debug tadi dari `src/index.js`.

---

## 5. Cara Mengetahui Format Nomor Sender

Format yang dipakai library untuk sender di dalam group adalah `message.author`, contoh: `628123456789@c.us`. Bot ini sudah otomatis mengekstrak dan menormalisasi jadi angka saja (`628123456789`) — jadi cukup isi `ALLOWED_SENDERS` di `.env` dengan angka tanpa `+` dan tanpa `@c.us`, sesuai contoh di bagian 3.4.

Kalau ingin verifikasi manual, gunakan trik debug yang sama seperti mengambil `GROUP_ID` di atas, tapi log `evaluation.senderNumber` (tersedia di `index.js`, variabel `evaluation`).

---

## 6. Testing Skenario End-to-End

1. Pastikan `.env` sudah terisi `GROUP_ID` dan `ALLOWED_SENDERS` (nomor teknisi yang akan mengirim foto harus masuk whitelist).
2. Jalankan bot: `npm start`, tunggu sampai `Listening for messages...`.
3. Dari nomor teknisi (yang ada di `ALLOWED_SENDERS`), kirim **satu foto** ke group **"RKW DAILY REPORT"**.
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
npm start
```

Bot akan langsung lanjut ke `WhatsApp ready` tanpa menampilkan QR lagi.

---

## 8. Troubleshooting

**QR code tidak muncul / terpotong di terminal**
- Perbesar ukuran jendela terminal (QR butuh ruang cukup lebar).
- Pastikan tidak ada session lama yang corrupt: hapus folder `.wwebjs_auth/` lalu jalankan ulang `npm start` untuk memaksa QR baru.

**QR sudah di-scan tapi tidak lanjut ke "WhatsApp ready"**
- Pastikan HP terhubung internet saat proses linking.
- Cek versi `whatsapp-web.js` — WhatsApp Web kadang berubah struktur dan butuh update versi library (`npm update whatsapp-web.js`).
- Coba hapus `.wwebjs_auth/` dan `.wwebjs_cache/` (jika ada), lalu scan ulang dari awal.

**Event `auth_failure` muncul di log**
- Biasanya session korup atau nomor sudah di-unlink dari HP. Hapus folder `.wwebjs_auth/`, jalankan ulang, scan QR baru.

**Tidak tahu `GROUP_ID` yang benar**
- Ikuti langkah di bagian "4. Cara Mengetahui GROUP_ID" di atas.
- Pastikan tidak ada spasi tambahan saat copy-paste ke `.env`.

**Sudah kirim foto tapi tidak ada log sama sekali**
- Pastikan bot berstatus `Listening for messages...` (bukan masih `Waiting for QR...`).
- Pastikan foto dikirim ke group yang **persis sama** dengan `GROUP_ID` di `.env` (bukan group lain dengan nama mirip).

**Log menunjukkan "Message diabaikan: sender tidak termasuk ALLOWED_SENDERS"**
- Cek kembali nomor di `ALLOWED_SENDERS`, pastikan formatnya angka polos (tanpa `+`, tanpa `@c.us`) dan sesuai kode negara nomor pengirim.

**Foto terkirim tapi gagal di-download (error di log, bot tidak crash)**
- Ini biasanya karena media WhatsApp sudah expired/dihapus sebelum sempat di-download, atau koneksi terputus saat proses download. Bot tetap jalan normal (sesuai desain) — cukup minta pengirim mengirim ulang foto sebagai test berikutnya.
- Cek juga permission folder `storage/` (pastikan proses Node.js punya izin tulis).

**Setelah pindah ke Windows Server nanti**
- Pastikan Node.js versi yang sama/serupa terinstall di server.
- Copy seluruh folder project (atau clone dari git tanpa `node_modules/`, `.env`, `.wwebjs_auth/`), lalu jalankan `npm install` dan `npm start` di server tersebut.
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
