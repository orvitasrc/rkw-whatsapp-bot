'use strict';

require('dotenv').config();
const path = require('path');

/**
 * Semua konfigurasi PoC diambil dari environment variables.
 * Jangan hardcode nomor pribadi / group ID di source code lain.
 */

const rawGroupId = (process.env.GROUP_ID || '').trim();

const rawAllowedSenders = (process.env.ALLOWED_SENDERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Normalisasi nomor: hanya ambil digit (buang spasi, +, tanda lain)
// supaya perbandingan dengan nomor dari whatsapp-web.js konsisten.
function normalizeNumber(value) {
  return String(value).replace(/\D/g, '');
}

const rawAllowedLids = (process.env.ALLOWED_LIDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const ALLOWED_SENDERS = rawAllowedSenders.map(normalizeNumber);

const config = {
  GROUP_ID: rawGroupId, // contoh: "1203630xxxxxxxxxx@g.us"
ALLOWED_SENDERS, // array of digit-only strings, contoh: ["628123456789"]
ALLOWED_LIDS: rawAllowedLids,
  STORAGE_DIR: path.resolve(process.cwd(), process.env.STORAGE_DIR || './storage'),
  normalizeNumber,
};

function validateConfig() {
  const problems = [];

  if (!config.GROUP_ID) {
    problems.push('GROUP_ID belum diisi di file .env');
  } else if (!config.GROUP_ID.endsWith('@g.us')) {
    problems.push(
      `GROUP_ID "${config.GROUP_ID}" sepertinya salah format. Format yang benar diakhiri "@g.us".`
    );
  }

  return problems;
}

module.exports = { config, validateConfig };
