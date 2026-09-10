'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

/**
 * Bikin instance WhatsApp Client dengan session tersimpan lokal (LocalAuth),
 * supaya tidak perlu scan QR ulang setiap restart selama session masih valid.
 *
 * Session disimpan otomatis oleh LocalAuth di folder .wwebjs_auth/
 */
function createClient() {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'rkw-bot', // biar aman kalau nanti ada multi-session
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('Waiting for QR...');
    qrcode.generate(qr, { small: true });
    console.log('Scan QR code di atas menggunakan HP nomor WhatsApp RKW (Linked Devices).');
  });

  client.on('authenticated', () => {
    console.log('WhatsApp authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error('Authentication FAILED:', msg);
  });

  client.on('ready', () => {
    console.log('WhatsApp ready');
    console.log('Listening for messages...');
  });

  client.on('disconnected', (reason) => {
    console.warn('WhatsApp disconnected:', reason);
  });

  return client;
}

module.exports = { createClient };
