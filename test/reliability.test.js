'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { createHealth, health, bindHealthEvents, sendNotice, USER_FAILURE, ADMIN_WARNING } = require('../src/health');
const { saveMessageMedia } = require('../src/media');
process.env.DISCOVERY_MODE = 'false';
const { config } = require('../src/config');
const { handleIncomingMessage } = require('../src/index');
const msg = () => ({ id: { $1: 'full-message-id' }, from: 'reliability@g.us', author: 'test@lid',
  type: 'image', hasMedia: true, timestamp: 1789347600,
  async downloadMedia() { return { data: Buffer.from('test-image-bytes').toString('base64'), mimetype: 'image/jpeg' }; } });

test('health events and streak warning reset; notification failure contained', async () => {
  const h = createHealth(); const client = new EventEmitter(); bindHealthEvents(client, h);
  assert.equal(h.snapshot().whatsappReady, false);
  client.emit('authenticated'); assert.equal(h.snapshot().whatsappReady, false);
  client.emit('ready'); assert.equal(h.snapshot().whatsappReady, true);
  client.emit('disconnected', 'test'); assert.equal(h.snapshot().whatsappReady, false);
  client.emit('ready'); client.emit('auth_failure', 'test'); assert.equal(h.snapshot().whatsappReady, false);
  assert.deepEqual([1,2,3,4].map(() => h.failure('MEDIA_DOWNLOAD_FAILED')), [false,false,true,false]);
  assert.equal(h.snapshot().lastSuccessfulMediaSaveAt, null);
  h.success(); assert.equal(h.snapshot().consecutiveMediaFailures, 0);
  assert.ok(h.snapshot().lastSuccessfulMediaSaveAt);
  assert.deepEqual([1,2,3].map(() => h.failure('MEDIA_WRITE_FAILED')), [false,false,true]);
  assert.equal(await sendNotice({ async sendMessage() { throw new Error('offline'); } }, 'test@g.us', 'test'), false);
});

test('notification timeout is bounded without retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const pending = sendNotice({ sendMessage() { calls++; return new Promise(() => {}); } }, 'test@g.us', 'test');
  await Promise.resolve(); t.mock.timers.tick(10000);
  assert.equal(await pending, false); assert.equal(calls, 1);
});

test('media stage codes and non-zero file validation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-reliability-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const settings = { STORAGE_DIR: root };
  const empty = msg(); empty.downloadMedia = async () => ({ data: '!!!', mimetype: 'image/jpeg' });
  await assert.rejects(saveMessageMedia(empty, settings, 'Test'), { stage: 'MEDIA_DOWNLOAD_FAILED' });
  const missing = msg(); missing.downloadMedia = async () => undefined;
  await assert.rejects(saveMessageMedia(missing, settings, 'Test'), { stage: 'MEDIA_DOWNLOAD_FAILED' });
  for (const [method,stage] of [['mkdir','STORAGE_DIR_CREATE_FAILED'], ['realpath','STORAGE_PATH_UNAVAILABLE'], ['writeFile','MEDIA_WRITE_FAILED']]) {
    const mocked = t.mock.method(fs, method, async () => { throw new Error('simulated '+method); });
    await assert.rejects(saveMessageMedia(msg(), settings, 'Test'), { stage });
    mocked.mock.restore();
  }
  const stat = t.mock.method(fs, 'stat', async () => ({ isFile: () => true, size: 0 }));
  await assert.rejects(saveMessageMedia(msg(), settings, 'Test'), { stage: 'MEDIA_WRITE_FAILED' });
  stat.mock.restore();
  const success = await saveMessageMedia(msg(), settings, 'Test');
  assert.ok(success.bytes > 0); assert.equal((await fs.stat(success.absolutePath)).size, success.bytes);
});

for (const mediaType of ['image', 'video']) test(`handler ${mediaType} failure/success timer and shared reliability`, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-reliability-handler-'));
  const original = { ...config }; t.after(async () => { Object.assign(config, original); await fs.rm(root, { recursive: true, force: true }); });
  Object.assign(config, { GROUP_ID: 'reliability@g.us', STORAGE_DIR: root });
  health.success(); health.ready(true);
  const sent = [];
  const client = { async sendMessage(group, text, options) { assert.equal(group, config.GROUP_ID); assert.equal(options.sendSeen,false); sent.push(text); return {}; } };
  const command = (body, extra = {}) => handleIncomingMessage({ ...msg(), client, type: 'chat', hasMedia: false, body, ...extra });
  const image = (extra = {}) => handleIncomingMessage({ ...msg(), client, type: mediaType,
    async downloadMedia() { return { mimetype: mediaType === 'video' ? 'video/mp4' : 'image/jpeg', data: Buffer.from('raw-media-bytes').toString('base64') }; }, ...extra });
  await image(); assert.equal(health.snapshot().consecutiveMediaFailures,0); assert.equal(sent.length,0);
  await command('MAKEFOLDER Reliability Test'); await command('SAVETOSERVER');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.timers.tick(60000);
  await command('TIMESAVEMODE'); const remaining = sent.at(-1);
  const before = health.snapshot().lastSuccessfulMediaSaveAt;
  for(let i=0;i<4;i++) await image({ async downloadMedia() { throw new Error('r: r'); } });
  assert.equal(sent.filter(x=>x===USER_FAILURE).length,4);
  assert.equal(sent.filter(x=>x===ADMIN_WARNING).length,1);
  assert.equal(health.snapshot().consecutiveMediaFailures,4);
  assert.equal(health.snapshot().lastSuccessfulMediaSaveAt,before);
  await command('BOTSTATUS'); assert.match(sent.at(-1),/WhatsApp: READY/); assert.match(sent.at(-1),/Media failures: 4/);
  await command('TIMESAVEMODE'); assert.equal(sent.at(-1),remaining);
  const n=sent.length;
  await command('BOTSTATUS',{from:'other@g.us'});
  await image({author:'other@lid'}); assert.equal(sent.length,n); assert.equal(health.snapshot().consecutiveMediaFailures,4);
  await image(); assert.equal(health.snapshot().consecutiveMediaFailures,0);
  assert.notEqual(health.snapshot().lastSuccessfulMediaSaveAt,before);
  await command('TIMESAVEMODE'); assert.match(sent.at(-1),/5 menit 0 detik/);
  for(let i=0;i<3;i++) await image({ async downloadMedia() { throw new Error('r: r'); } });
  assert.equal(sent.filter(x=>x===ADMIN_WARNING).length,2);
});
