'use strict';

const { config, validateConfig } = require('./config');
const { createClient } = require('./whatsapp');
const { evaluateMessage, isFromConfiguredGroup, extractSenderId } = require('./rules');
const { createSaveMode } = require('./save-mode');
const { handleCommand } = require('./commands');
const { saveMessageMedia } = require('./media');

function timestamp() {
  const d = new Date();

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function logError(message, err) {
  console.error(
    `[${timestamp()}] ERROR: ${message}`,
    err ? `- ${err.message}` : ''
  );
}

const discoveryMode =
  String(process.env.DISCOVERY_MODE || '').trim().toLowerCase() === 'true';

async function handleDiscoveryMessage(message) {
  try {
    console.log('');
    console.log('================ MESSAGE DISCOVERY ================');

    console.log(`Time       : ${new Date().toISOString()}`);

    console.log(`Message ID : ${message.id?._serialized || 'N/A'}`);

    console.log(`From       : ${message.from || 'N/A'}`);

    console.log(`Author     : ${message.author || 'N/A'}`);

    console.log(`Body       : ${message.body || '(tidak ada text)'}`);

    console.log(`Has Media  : ${message.hasMedia ? 'YES' : 'NO'}`);

    console.log(`Type       : ${message.type || 'N/A'}`);

    /*
     * Untuk pesan group:
     *
     * message.from
     * biasanya berisi:
     * 120xxxxxxxxxxxx@g.us
     *
     * Ini adalah GROUP ID yang kita cari.
     */
    if (message.from && message.from.endsWith('@g.us')) {
      console.log('');
      console.log('GROUP TERDETEKSI!');
      console.log(`GROUP ID   : ${message.from}`);

      /*
       * message.author biasanya berisi nomor pengirim:
       * 628xxxxxxxxxx@c.us
       */
      if (message.author) {
        console.log(`SENDER ID   : ${message.author}`);

        const senderNumber = message.author.split('@')[0];

        console.log(`SENDER NO   : ${senderNumber}`);
      }
    } else {
      console.log('');
      console.log('Pesan ini bukan berasal dari group.');
    }

    /*
     * Coba mengambil nama group.
     *
     * Ini hanya untuk informasi.
     * Kalau gagal, GROUP ID tetap bisa kita dapat dari message.from.
     */
    try {
      const chat = await message.getChat();

      if (chat && chat.isGroup) {
        console.log(`GROUP NAME  : ${chat.name || '(tanpa nama)'}`);
      }
    } catch (err) {
      console.log(`GROUP NAME  : tidak dapat diambil (${err.message})`);
    }

    console.log('====================================================');
    console.log('');
  } catch (err) {
    logError('Gagal membaca message dalam discovery mode', err);
  }
}

const saveMode = createSaveMode({ log });
let saveQueue = Promise.resolve();

async function handleIncomingMessage(message) {
  /*
   * Discovery mode:
   * Jangan download atau menyimpan media.
   * Kita hanya membaca informasi pesan.
   */
  if (discoveryMode) {
    await handleDiscoveryMessage(message);
    return;
  }

  /*
   * NORMAL MODE
   * Logic asli untuk proses media.
   */

  log('Message received');

  if (!isFromConfiguredGroup(message, config)) {
    log('Message ignored: group not configured');
    return;
  }

  saveMode.expire();
  const sender = extractSenderId(message);
  // A group ID is not a sender identity: never create a shared group mode.
  if (!sender || sender.endsWith('@g.us')) {
    log('Message ignored: sender identity unavailable');
    return;
  }
  log(`Sender: ${sender}`);

  const response = handleCommand(message, sender, saveMode, log);
  if (response !== null) {
    try {
      // Plain group response avoids quoting IDs and does not send read receipts.
      const sent = await message.client.sendMessage(config.GROUP_ID, response, { sendSeen: false });
      if (!sent) throw new Error('sendMessage tidak mengembalikan pesan');
    } catch (err) {
      logError('Gagal mengirim respons command', err);
    }
    return;
  }

  if (!evaluateMessage(message, config).allowed) {
    log('Message ignored: no image media');
    return;
  }
  const accepted = saveMode.acceptImage(sender);
  if (!accepted) {
    log('Image ignored: save mode inactive');
    return;
  }

  if (!accepted.activeFolder) {
    log('Image ignored: active folder not set');
    return;
  }
  log('Media detected: image');
  log(`Save mode active: ${sender}`);
  log(`Target folder: ${accepted.activeFolder}`);

  // Serialize writes so a batch cannot select the same image-NNN filename.
  saveQueue = saveQueue.then(async () => {
    try {
      log('Downloading media...');
      const result = await saveMessageMedia(message, config, accepted.activeFolder);
      log(`Saved: ${result.relativePath}`);
      saveMode.refresh(sender, accepted);
    } catch (err) {
      console.error(`[${timestamp()}] Gagal memproses media:`, err);
    }
  });
  await saveQueue;
}

async function main() {
  console.log('## RKW WhatsApp Bot');
  console.log('Initializing...');
  console.log(`Mode: ${discoveryMode ? 'DISCOVERY' : 'NORMAL'}`);

  /*
   * Dalam discovery mode:
   * GROUP_ID dan ALLOWED_SENDERS boleh kosong.
   */
  if (!discoveryMode) {
    const problems = validateConfig();

    if (problems.length > 0) {
      console.error(
        'Konfigurasi belum lengkap. Perbaiki file .env terlebih dahulu:'
      );

      problems.forEach((problem) => {
        console.error(`  - ${problem}`);
      });

      process.exit(1);
    }
  } else {
    log(
      'Discovery mode aktif. GROUP_ID dan ALLOWED_SENDERS tidak diperlukan.'
    );

    log(
      'Bot akan menunggu pesan dan menampilkan informasi Group/Sender.'
    );
  }

  const client = createClient();
  // Expiry is checked exactly on receipt, and logged during idle time too.
  const expiryTimer = setInterval(() => saveMode.expire(), 1000);
  expiryTimer.unref();


client.on('ready', async () => {
    try {
      console.log('WWeb version:', await client.getWWebVersion());
    } catch (err) {
      logError('Gagal membaca versi WhatsApp Web', err);
    }
});
  /*
   * Tangkap semua pesan.
   */
  client.on('message', (message) => {
    handleIncomingMessage(message).catch((err) => {
      logError(
        'Unhandled error saat memproses message',
        err
      );
    });
  });

  /*
   * Shutdown dengan aman menggunakan Ctrl+C.
   */
  process.on('SIGINT', async () => {
    console.log('\nMenghentikan bot dengan aman...');
    clearInterval(expiryTimer);

    try {
      await client.destroy();
    } catch (err) {
      logError(
        'Gagal destroy client dengan bersih',
        err
      );
    } finally {
      process.exit(0);
    }
  });

  await client.initialize();
}

if (require.main === module) {
  main().catch((err) => {
    logError('Fatal error saat startup', err);
    process.exit(1);
  });
}

module.exports = { handleIncomingMessage };
