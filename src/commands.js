'use strict';

const FOLDER_USAGE = 'Gunakan:\nMAKEFOLDER <nama folder>\n\nContoh:\nMAKEFOLDER Proses Installasi Guard';
const HELP = `RKW LOCAL STORAGE BOT — COMMANDS

1. MAKEFOLDER <nama folder>
Menentukan folder tujuan khusus untuk Anda.
Contoh: MAKEFOLDER Proses Installasi Guard

2. SAVETOSERVER
Mengaktifkan Save Mode 5 menit. Wajib MAKEFOLDER terlebih dahulu.
Image Anda disimpan ke folder aktif. Setiap image yang berhasil disimpan memperpanjang timer 5 menit.

3. TIMESAVEMODE
Menampilkan status, folder dan sisa waktu Anda tanpa memperpanjang timer.

4. STOPSAVE
Mematikan Save Mode Anda. Folder tetap tersimpan untuk SAVETOSERVER berikutnya.

5. HELP
Menampilkan panduan ini.

6. BOTSTATUS
Menampilkan koneksi WhatsApp, jumlah kegagalan media, dan waktu penyimpanan terakhir tanpa mengubah Save Mode.

Semua command hanya berlaku di group ini dan tidak membedakan huruf besar/kecil.
State folder dan Save Mode direset saat bot restart.`;

function handleCommand(message, sender, mode, log = () => {}) {
  if (message.type !== 'chat' || message.hasMedia) return null;
  const text = String(message.body || '').trim();
  const folderMatch = /^MAKEFOLDER(?:\s+([\s\S]*))?$/i.exec(text);
  const command = folderMatch ? 'MAKEFOLDER' : text.toUpperCase();
  if (!['MAKEFOLDER', 'SAVETOSERVER', 'TIMESAVEMODE', 'STOPSAVE', 'HELP'].includes(command)) return null;
  log(`Command received: ${command}`);
  if (command === 'HELP') return HELP;
  if (command === 'MAKEFOLDER') {
    try {
      const folder = mode.setFolder(sender, folderMatch[1] || '');
      return `Folder aktif berhasil diatur:\n${folder}\n\nGunakan SAVETOSERVER untuk mulai menyimpan gambar.`;
    } catch (err) { return `Format salah. ${err.message}\n${FOLDER_USAGE}`; }
  }
  if (command === 'SAVETOSERVER') {
    if (!mode.activate(sender)) return `Save Mode tidak dapat diaktifkan.\nTentukan folder tujuan terlebih dahulu.\n${FOLDER_USAGE}`;
    const folder = mode.status(sender).activeFolder;
    log(`Folder: ${folder}`);
    return `Save Mode aktif selama 5 menit.\nFolder: ${folder}\n\nSetiap image yang berhasil disimpan memperpanjang timer 5 menit.`;
  }
  if (command === 'STOPSAVE') {
    const stopped = mode.stop(sender);
    return `${stopped ? 'Save Mode berhasil dihentikan.' : 'Save Mode sudah tidak aktif.'}\nFolder tetap aktif:\n${mode.status(sender).activeFolder || 'belum ditentukan'}`;
  }
  const { activeFolder, remainingMs } = mode.status(sender);
  if (!activeFolder) return `Save Mode: INACTIVE\nFolder: belum ditentukan\n\n${FOLDER_USAGE}`;
  if (!remainingMs) return `Save Mode: INACTIVE\nFolder: ${activeFolder}\n\nGunakan SAVETOSERVER untuk mengaktifkannya kembali.`;
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  log(`Save mode remaining: ${sender} - ${minutes}m ${seconds % 60}s`);
  return `Save Mode: ACTIVE\nSisa waktu: ${minutes} menit ${seconds % 60} detik\nFolder: ${activeFolder}`;
}
module.exports = { handleCommand };
