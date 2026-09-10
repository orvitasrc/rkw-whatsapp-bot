'use strict';

const fs = require('fs/promises');
const path = require('path');

/**
 * Format Date -> "YYYY-MM-DD" berdasarkan waktu lokal mesin yang menjalankan bot.
 */
function formatDateFolder(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * message.timestamp dari whatsapp-web.js adalah unix time dalam DETIK.
 */
function dateFromMessageTimestamp(message) {
  if (typeof message.timestamp === 'number') {
    return new Date(message.timestamp * 1000);
  }
  return new Date();
}

/**
 * Tentukan ekstensi file yang aman dari mimetype media.
 * Default ke .jpg kalau mimetype tidak dikenali (jarang terjadi untuk image).
 */
function extensionFromMimetype(mimetype) {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[mimetype] || '.jpg';
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Cari nama file yang belum dipakai di dalam folder, dengan pola:
 *   image-001.jpg, image-002.jpg, ...
 * Tidak akan pernah overwrite file yang sudah ada.
 */
async function nextAvailableFilename(dirPath, extension) {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    entries = [];
  }

  const usedNumbers = new Set(
    entries
      .map((name) => {
        const match = name.match(/^image-(\d{3,})\..+$/i);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n) => n !== null)
  );

  let counter = 1;
  while (usedNumbers.has(counter)) {
    counter += 1;
  }

  const number = String(counter).padStart(3, '0');
  return `image-${number}${extension}`;
}

/**
 * Download media dari message dan simpan ke storage/<YYYY-MM-DD>/image-NNN.ext
 * Return path relatif file yang tersimpan (untuk logging), atau throw error
 * yang harus ditangkap oleh pemanggil (index.js) supaya tidak crash.
 */
async function saveMessageMedia(message, config) {
  const media = await message.downloadMedia();

  if (!media || !media.data) {
    throw new Error('downloadMedia() tidak mengembalikan data (media kosong/expired).');
  }

  const dateFolder = formatDateFolder(dateFromMessageTimestamp(message));
  const targetDir = path.join(config.STORAGE_DIR, dateFolder);
  await ensureDir(targetDir);

  const extension = extensionFromMimetype(media.mimetype);
  const filename = await nextAvailableFilename(targetDir, extension);
  const targetPath = path.join(targetDir, filename);

  const buffer = Buffer.from(media.data, 'base64');
  // wx = write, fail if file already exists -> extra safety net vs overwrite
  await fs.writeFile(targetPath, buffer, { flag: 'wx' });

  return {
    relativePath: path.join('storage', dateFolder, filename),
    absolutePath: targetPath,
    bytes: buffer.length,
  };
}

module.exports = {
  saveMessageMedia,
  formatDateFolder,
  dateFromMessageTimestamp,
  extensionFromMimetype,
  nextAvailableFilename,
};
