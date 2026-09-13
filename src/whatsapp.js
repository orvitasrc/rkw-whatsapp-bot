'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { bindHealthEvents } = require('./health');

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

  bindHealthEvents(client);

  return client;
}

module.exports = { createClient };
