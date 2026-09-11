'use strict';

/**
 * Rule engine sederhana untuk Phase 1.
 * Tidak pakai AI - murni pengecekan berbasis konfigurasi (group & image).
 *
 * Hasil evaluasi selalu berbentuk:
 *   { allowed: boolean, reason: string, senderNumber: string|null }
 */

/**
 * Ambil nomor pengirim dari sebuah message group.
 * Di whatsapp-web.js, untuk pesan dari GROUP, `message.author` berisi
 * ID pengirim (format "628xxxxxxxxx@c.us"). `message.from` adalah ID group.
 */
function extractSenderId(message) {
  // message.author hanya ada di pesan group. Fallback ke message.from
  // untuk jaga-jaga (mis. jika suatu saat dites di chat pribadi).
  return message.author || message.from || '';
}

function isFromConfiguredGroup(message, config) {
  return Boolean(config.GROUP_ID) && message.from === config.GROUP_ID;
}

function isSenderAllowed(message, config) {
  const senderId = extractSenderId(message);

  if (senderId.endsWith('@lid')) {
    const senderLid = senderId.replace('@lid', '');
    return config.ALLOWED_LIDS.includes(senderLid);
  }

  const senderDigits = config.normalizeNumber(senderId);

  if (!senderDigits) return false;

  return config.ALLOWED_SENDERS.includes(senderDigits);
}

function hasImageMedia(message) {
  return message.hasMedia === true && message.type === 'image';
}

/**
 * Evaluasi utama: apakah message ini boleh diproses (download & save)?
 */
function evaluateMessage(message, config) {
  const senderId = extractSenderId(message);

  if (!isFromConfiguredGroup(message, config)) {
    return { allowed: false, reason: 'group_not_configured', senderNumber: senderId };
  }

  if (!hasImageMedia(message)) {
    return { allowed: false, reason: 'no_image_media', senderNumber: senderId };
  }

  return { allowed: true, reason: 'ok', senderNumber: senderId };
}

module.exports = {
  evaluateMessage,
  extractSenderId,
  isFromConfiguredGroup,
  isSenderAllowed,
  hasImageMedia,
};
