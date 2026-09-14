'use strict';

const FOLDER_USAGE = 'Gunakan:\n`MAKEFOLDER <nama folder>`\n\nContoh:\n`MAKEFOLDER Proses Installasi Guard`';
const HELP = '🤖 *RKW Auto Storage — Commands*\n\n📁 *Folder*\n`MAKEFOLDER <nama folder>`\nMembuat/memilih folder project hari ini.\n\n`LISTFOLDER`\nMenampilkan folder project hari ini.\n\n`RENAMEFOLDER <nama lama> | <nama baru>`\nMengubah nama folder project hari ini.\n\n💾 *Save Mode*\n`SAVETOSERVER`\nMenyimpan foto/video selama 5 menit; wajib punya folder aktif.\n\n`TIMESAVEMODE`\nMelihat sisa waktu tanpa memperpanjang timer.\n\n`STOPSAVE`\nMematikan Save Mode; folder tetap diingat.\n\n🤖 *System*\n`BOTSTATUS`\nMelihat status bot.\n\n`HELP`\nMenampilkan bantuan.\n\n_Setelah media berhasil disimpan, timer diperpanjang 5 menit. Mode berlaku per sender._';

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
      return `✅ *Folder aktif berhasil diatur:*\n${folder}\n\nGunakan SAVETOSERVER untuk mulai menyimpan foto/video.`;
    } catch (err) { return `⚠️ *Format salah.* ${err.message}\n${FOLDER_USAGE}`; }
  }
  if (command === 'SAVETOSERVER') {
    if (!mode.activate(sender)) return `⚠️ *Save Mode tidak dapat diaktifkan.*\nTentukan folder tujuan terlebih dahulu.\n${FOLDER_USAGE}`;
    const folder = mode.status(sender).activeFolder;
    log(`Folder: ${folder}`);
    return `✅ *Save Mode aktif selama 5 menit.*\nFolder: ${folder}\n\nKirim foto/video yang ingin disimpan ke server.\n\nSetiap media yang berhasil disimpan memperpanjang timer 5 menit.`;
  }
  if (command === 'STOPSAVE') {
    const stopped = mode.stop(sender);
    return `${stopped ? '✅ *Save Mode berhasil dihentikan.*' : 'ℹ️ *Save Mode sudah tidak aktif.*'}\nFolder tetap aktif:\n${mode.status(sender).activeFolder || 'belum ditentukan'}`;
  }
  const { activeFolder, remainingMs } = mode.status(sender);
  if (!activeFolder) return `💾 *Save Mode: INACTIVE*\nFolder: belum ditentukan\n\n${FOLDER_USAGE}`;
  if (!remainingMs) return `💾 *Save Mode: INACTIVE*\nFolder: ${activeFolder}\n\nGunakan SAVETOSERVER untuk mengaktifkannya kembali.`;
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  log(`Save mode remaining: ${sender} - ${minutes}m ${seconds % 60}s`);
  return `💾 *Save Mode: ACTIVE*\n⏱️ Sisa waktu: ${minutes} menit ${seconds % 60} detik\nFolder: ${activeFolder}`;
}
module.exports = { handleCommand };
