'use strict';
const { sendText } = require('./outgoing');

const USER_FAILURE = '⚠️ Gambar gagal disimpan ke server.\nSilakan kirim ulang gambar atau hubungi admin jika masalah berlanjut.';
const ADMIN_WARNING = '⚠️ RKW Storage Bot Warning\n\nMedia gagal disimpan 3 kali berturut-turut.\n\nKemungkinan:\n- perubahan WhatsApp Web\n- session/browser issue\n- storage server bermasalah\n\nSilakan cek bot/server.';

function safeText(value) {
  return String(value ?? '').replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[REDACTED]@')
    .replace(/((?:mediaKey|token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}
function eventLog(code, details = {}, error) {
  const entry = { timestamp: new Date().toISOString(), code, ...details };
  if (error) {
    entry.error = safeText(error.message || error);
    entry.stack = safeText(error.stack || '');
    if (error.cause) entry.cause = safeText(error.cause.stack || error.cause.message || error.cause);
  }
  const line = JSON.stringify(entry);
  if (error) console.error(line); else console.log(line);
}
function createHealth() {
  const state = { whatsappReady: false, lastSuccessfulMediaSaveAt: null,
    consecutiveMediaFailures: 0, warningSent: false, lastStorageResult: 'Belum diverifikasi' };
  return {
    snapshot: () => ({ ...state }),
    ready(value) { state.whatsappReady = value; },
    success() {
      state.lastSuccessfulMediaSaveAt = new Date().toISOString();
      state.consecutiveMediaFailures = 0;
      state.warningSent = false;
      state.lastStorageResult = 'Penulisan terakhir berhasil (bukan pemeriksaan saat ini)';
    },
    failure(code) {
      state.consecutiveMediaFailures++;
      if (code !== 'MEDIA_DOWNLOAD_FAILED') state.lastStorageResult = `Operasi terakhir gagal: ${code}`;
      if (state.consecutiveMediaFailures >= 3 && !state.warningSent) {
        state.warningSent = true; // One warning attempt per streak, even if sending fails.
        return true;
      }
      return false;
    },
    statusText() {
      return `RKW Storage Bot Status\n\nWhatsApp: ${state.whatsappReady ? 'READY' : 'NOT READY'}\nMedia failures: ${state.consecutiveMediaFailures}\nLast successful save: ${state.lastSuccessfulMediaSaveAt || 'Belum ada'}\nStorage: ${state.lastStorageResult}`;
    },
  };
}
const health = createHealth();
async function sendNotice(client, group, text) {
  const result = await sendText(client, group, text, eventLog);
  return result.status === 'observed' || result.status === 'returned_message';
}
function bindHealthEvents(client, tracker = health) {
  client.on('authenticated', () => eventLog('WHATSAPP_AUTHENTICATED'));
  client.on('ready', () => { tracker.ready(true); eventLog('WHATSAPP_READY'); });
  client.on('auth_failure', (reason) => { tracker.ready(false); eventLog('WHATSAPP_AUTH_FAILURE', { reason: safeText(reason) }); });
  client.on('disconnected', (reason) => { tracker.ready(false); eventLog('WHATSAPP_DISCONNECTED', { reason: safeText(reason) }); });
}
module.exports = { health, createHealth, eventLog, sendNotice, bindHealthEvents, USER_FAILURE, ADMIN_WARNING };
