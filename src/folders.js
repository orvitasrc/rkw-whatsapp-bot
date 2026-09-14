'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { sanitizeFolder } = require('./save-mode');
const { formatDateFolder } = require('./media');
const key = name => name.normalize('NFC').toLowerCase();
const usage = '⚠️ *Format RENAMEFOLDER salah.*\n\nGunakan:\n`RENAMEFOLDER <nama lama> | <nama baru>`\n\nContoh:\n`RENAMEFOLDER Kirim Part | Pengiriman Part`';
function fail(code, message) { return Object.assign(new Error(message), { code }); }
function safeName(name) {
  if (!name.trim() || /[\/\\]/.test(name) || name.includes('..')) throw fail('UNSAFE_NAME', 'Nama folder tidak boleh kosong atau mengandung path.');
  return sanitizeFolder(name);
}
async function directory(p) {
  const info = await fs.lstat(p);
  if (info.isSymbolicLink() || !info.isDirectory()) throw fail('UNSAFE_PATH', 'Path bukan direktori biasa.');
}
async function dateDirectory(root, date, create = false) {
  if (create) await fs.mkdir(root, { recursive: true });
  await directory(root);
  const day = path.join(root, date);
  if (create) {
    try { await fs.mkdir(day); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  await directory(day);
  return day;
}
async function entries(day) { return fs.readdir(day, { withFileTypes: true }); }
function lookup(items, name) {
  const matches = items.filter(e => key(e.name) === key(name));
  if (matches.length > 1) throw fail('AMBIGUOUS', 'Ada beberapa nama folder yang hanya berbeda kapitalisasi.');
  return matches[0];
}
function createFolderManager(root, now = () => new Date()) {
  return {
    async list() {
      const date = formatDateFolder(now());
      try {
        const day = await dateDirectory(root, date);
        const names = (await entries(day)).filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => e.name);
        names.sort((a,b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a < b ? -1 : a > b ? 1 : 0);
        return { date, names };
      } catch (e) { if (e.code === 'ENOENT') return { date, names: [] }; throw e; }
    },
    async make(name) {
      const wanted = safeName(name);
      const day = await dateDirectory(root, formatDateFolder(now()), true);
      const existing = lookup(await entries(day), wanted);
      if (existing) { await directory(path.join(day, existing.name)); return existing.name; }
      await fs.mkdir(path.join(day, wanted));
      return wanted;
    },
    async rename(oldName, newName) {
      const old = safeName(oldName), target = safeName(newName);
      const date = formatDateFolder(now());
      let day;
      try { day = await dateDirectory(root, date); } catch (e) { if (e.code === 'ENOENT') throw fail('NOT_FOUND', 'Folder tidak ditemukan.'); throw e; }
      const items = await entries(day);
      const source = lookup(items, old);
      if (!source) throw fail('NOT_FOUND', 'Folder tidak ditemukan.');
      await directory(path.join(day, source.name));
      if (lookup(items, target)) throw fail('TARGET_EXISTS', 'Nama folder tujuan sudah digunakan.');
      await fs.rename(path.join(day, source.name), path.join(day, target));
      return { date, oldName: source.name, newName: target };
    },
  };
}
function isFolderCommand(message) {
  return message.type === 'chat' && !message.hasMedia && /^(MAKEFOLDER|LISTFOLDER|RENAMEFOLDER)(?:\s|$)/i.test(String(message.body || '').trim());
}
async function handleFolderCommand(message, sender, mode, manager, renamed = () => {}, log = () => {}) {
  const text = String(message.body || '').trim();
  const match = /^(MAKEFOLDER|LISTFOLDER|RENAMEFOLDER)(?:\s+([\s\S]*))?$/i.exec(text);
  if (!match) return null;
  const command = match[1].toUpperCase(), args = match[2] || '';
  if (command === 'LISTFOLDER' && args) return null;
  log(`Command received: ${command}`);
  try {
    if (command === 'LISTFOLDER') {
      const { date, names } = await manager.list();
      if (!names.length) return '📁 *Folder hari ini belum ada.*\n\nBuat folder baru dengan:\n`MAKEFOLDER <nama folder>`';
      return `📁 *Folder hari ini — ${date}*\n\n${names.map((n,i) => `${i+1}. ${n}`).join('\n')}\n\nUntuk memilih folder:\n\`MAKEFOLDER <nama folder>\``;
    }
    if (command === 'MAKEFOLDER') {
      if (!args.trim()) return '⚠️ *Format salah.*\nGunakan:\n`MAKEFOLDER <nama folder>`';
      const folder = await manager.make(args);
      mode.setFolder(sender, folder);
      return `✅ *Folder aktif berhasil diatur:*\n\`${folder}\`\n\nGunakan \`SAVETOSERVER\` untuk mulai menyimpan foto/video.`;
    }
    const parts = args.split('|');
    if (parts.length !== 2 || parts.some(p => !p.trim())) return usage;
    const result = await manager.rename(parts[0].trim(), parts[1].trim());
    mode.renameFolderReferences(result.oldName, result.newName);
    renamed(result);
    log(`Folder renamed: ${result.oldName} -> ${result.newName}`);
    return `✅ *Folder berhasil diubah.*\n\n_${result.oldName}_\n→ *${result.newName}*`;
  } catch (e) {
    log(`FOLDER_COMMAND_FAILED: ${e.code || 'ERROR'} - ${e.message}`);
    if (e.code === 'NOT_FOUND') return '❌ *Folder tidak ditemukan.*\nGunakan `LISTFOLDER` untuk melihat folder hari ini.';
    if (e.code === 'TARGET_EXISTS') return '⚠️ *Nama folder tujuan sudah digunakan.*\nPilih nama lain atau gunakan `LISTFOLDER`.';
    if (e.code === 'UNSAFE_NAME' || e.code === 'AMBIGUOUS') return `⚠️ *Nama folder tidak valid atau ambigu.*\n${e.message}`;
    return '❌ *Operasi folder gagal.*\nPeriksa akses storage atau hubungi admin.';
  }
}
module.exports = { createFolderManager, isFolderCommand, handleFolderCommand, key };
