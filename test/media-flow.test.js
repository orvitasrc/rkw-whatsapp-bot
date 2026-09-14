'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.DISCOVERY_MODE = 'false';
const { config, validateConfig } = require('../src/config');
const { evaluateMessage } = require('../src/rules');
const { saveMessageMedia } = require('../src/media');
const { handleIncomingMessage } = require('../src/index');
const group = 'test@g.us';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function message(overrides = {}) {
  return { from: group, author: 'unlisted@lid', hasMedia: true, type: 'image',
    timestamp: Math.floor(Date.now() / 1000), id: { _serialized: 'complete-message-id' },
    client: { async sendMessage() { return {}; } },
    async downloadMedia() { return { mimetype: 'image/png', data: png }; }, ...overrides };
}
test('group/image filters accept every sender and reject text/private/other groups', () => {
  const settings = { GROUP_ID: group, ALLOWED_SENDERS: ['listed'], ALLOWED_LIDS: [] };
  for (const author of ['listed@c.us', 'unlisted@c.us', 'unlisted@lid']) {
    assert.equal(evaluateMessage(message({ author }), settings).allowed, true);
  }
  for (const overrides of [{ type: 'chat', hasMedia: false }, { from: 'private@c.us' },
    { from: 'other@g.us' }, { type: 'document' }, { type: 'audio' }, { type: 'sticker' }, { hasMedia: false }]) {
    assert.equal(evaluateMessage(message(overrides), settings).allowed, false);
  }
  assert.equal(evaluateMessage(message({ from: undefined }), {}).allowed, false);
});
test('normal startup does not require allowed senders', () => {
  const original = { ...config };
  try {
    Object.assign(config, { GROUP_ID: group, ALLOWED_SENDERS: [], ALLOWED_LIDS: [] });
    assert.deepEqual(validateConfig(), []);
  } finally { Object.assign(config, original); }
});
test('full $1 ID is normalized; download bytes saved; existing files preserved', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const msg = message({ id: { $1: 'false_test@g.us_ABC_participant@lid' },
    async downloadMedia() {
      assert.equal(this.id._serialized, this.id.$1);
      return { mimetype: 'image/png', data: png };
    } });
  const first = await saveMessageMedia(msg, { STORAGE_DIR: dir }, "Project");
  const second = await saveMessageMedia(msg, { STORAGE_DIR: dir }, "Project");
  assert.match(first.absolutePath, /image-001.png$/);
  assert.match(second.absolutePath, /image-002.png$/);
  assert.deepEqual(await fs.readFile(first.absolutePath), Buffer.from(png, 'base64'));
});
test('canonical ID takes precedence; missing ID fails before browser lookup', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await saveMessageMedia(message({ id: { _serialized: 'canonical', $1: 'alias' },
    async downloadMedia() {
      assert.equal(this.id._serialized, 'canonical');
      return { mimetype: 'image/png', data: png };
    } }), { STORAGE_DIR: dir }, "Project");
  await assert.rejects(saveMessageMedia(message({ id: {}, downloadMedia() {
    assert.fail('must not call browser');
  } }), { STORAGE_DIR: dir }, "Project"), /Serialized message ID tidak tersedia/);
});
test('handler ignores rejected messages; catches failure and saves subsequent image', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-test-'));
  const original = { ...config };
  t.after(async () => { Object.assign(config, original); await fs.rm(dir, { recursive: true, force: true }); });
  Object.assign(config, { GROUP_ID: group, STORAGE_DIR: dir, ALLOWED_SENDERS: [], ALLOWED_LIDS: [] });
  for (const overrides of [{ type: 'chat', hasMedia: false }, { from: 'private@c.us' }, { from: 'other@g.us' }]) {
    await handleIncomingMessage(message({ ...overrides, downloadMedia() { assert.fail('ignored'); } }));
  }
  await handleIncomingMessage(message({ type: 'chat', hasMedia: false, body: 'MAKEFOLDER Project' }));
  await handleIncomingMessage(message({ type: 'chat', hasMedia: false, body: 'SAVETOSERVER' }));
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await handleIncomingMessage(message({ async downloadMedia() { throw new Error('r: r'); } }));
    await handleIncomingMessage(message({ async downloadMedia() { return undefined; } }));
  } finally { console.error = originalError; }
  assert.equal(errors.length, 2);
  const failureLog = JSON.parse(errors[0][0]);
  assert.equal(failureLog.code, 'MEDIA_DOWNLOAD_FAILED');
  assert.match(failureLog.error, /downloadMedia gagal/);
  assert.match(failureLog.cause, /r: r/);
  const [createdDay] = await fs.readdir(dir);
  assert.deepEqual(await fs.readdir(path.join(dir, createdDay, 'Project')), []);
  await handleIncomingMessage(message());
  const folders = await fs.readdir(dir);
  assert.equal(folders.length, 1);
  assert.deepEqual(await fs.readdir(path.join(dir, folders[0], 'Project')), ['image-001.png']);
});

test('SAVETOSERVER gates each sender, ignores captions/outside triggers, saves concurrent batch', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-test-'));
  const original = { ...config };
  t.after(async () => { Object.assign(config, original); await fs.rm(dir, { recursive: true, force: true }); });
  Object.assign(config, { GROUP_ID: group, STORAGE_DIR: dir });
  const adi = 'adi@lid';
  const agus = 'agus@c.us';
  let downloads = 0;
  function image(author, extras = {}) {
    return message({ author, ...extras, async downloadMedia() {
      downloads++;
      return { mimetype: 'image/png', data: png };
    } });
  }
  function trigger(author, body = 'SAVETOSERVER', extras = {}) {
    return message({ author, type: 'chat', hasMedia: false, body, ...extras,
      downloadMedia() { assert.fail('text must never download'); } });
  }
  await handleIncomingMessage(image(adi));
  await handleIncomingMessage(image(adi, { body: 'SAVETOSERVER' }));
  await handleIncomingMessage(trigger(adi, 'SAVETOSERVER', { from: 'other@g.us' }));
  await handleIncomingMessage(trigger(adi, 'SAVETOSERVER', { from: 'private@c.us' }));
  await handleIncomingMessage(trigger(undefined));
  await handleIncomingMessage(image(undefined));
  await handleIncomingMessage(image(adi));
  assert.equal(downloads, 0);
  await handleIncomingMessage(trigger(adi, 'MAKEFOLDER Project'));
  await handleIncomingMessage(trigger(adi, 'savetoserver'));
  await Promise.all([1, 2, 3].map(() => handleIncomingMessage(image(adi))));
  assert.equal(downloads, 3);
  await handleIncomingMessage(image(agus));
  assert.equal(downloads, 3);
  await handleIncomingMessage(trigger(agus, 'MAKEFOLDER Project'));
  await handleIncomingMessage(trigger(agus, 'SaveToServer'));
  await handleIncomingMessage(image(agus));
  assert.equal(downloads, 4);
  await handleIncomingMessage(trigger(adi));
  await handleIncomingMessage(image(adi, { from: 'other@g.us' }));
  await handleIncomingMessage(image(adi, { from: 'private@c.us' }));
  await handleIncomingMessage(trigger(adi, 'ordinary text'));
  assert.equal(downloads, 4);
  const [folder] = await fs.readdir(dir);
  assert.deepEqual((await fs.readdir(path.join(dir, folder, 'Project'))).sort(),
    ['image-001.png', 'image-002.png', 'image-003.png', 'image-004.png']);
});

test('commands reply only in target group; stopped sender cannot save; reply failures are contained', async (t) => {
  const original = { ...config };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-command-test-'));
  t.after(async () => { Object.assign(config, original); await fs.rm(dir, { recursive: true, force: true }); });
  config.STORAGE_DIR = dir;
  config.GROUP_ID = group;
  const responses = [];
  const client = { async sendMessage(to, body, options) {
    assert.equal(to, group);
    assert.equal(options.sendSeen, false);
    responses.push(body);
    return {};
  } };
  const command = (body, overrides = {}) => handleIncomingMessage(message({
    type: 'chat', hasMedia: false, author: 'commands@lid', body, client, ...overrides,
  }));
  for (const body of ['HELP', 'MAKEFOLDER Task', 'SAVETOSERVER', 'TIMESAVEMODE', 'STOPSAVE']) {
    await command(body, { from: 'other@g.us' });
    await command(body, { from: 'private@c.us' });
  }
  assert.equal(responses.length, 0);
  await command('HELP');
  await command('SAVETOSERVER');
  assert.match(responses.at(-1), /tidak dapat/);
  await command('MAKEFOLDER Task');
  await command('SAVETOSERVER');
  await command('STOPSAVE');
  await handleIncomingMessage(message({ author: 'commands@lid', async downloadMedia() {
    assert.fail('stopped mode must not download');
  } }));
  await command('SAVETOSERVER');
  assert.match(responses.at(-1), /Folder: Task/);
  const errors = [];
  const previous = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await command('HELP', { client: { async sendMessage() { throw new Error('reply failed'); } } });
  } finally { console.error = previous; }
  assert.equal(errors.length, 1);
  await command('TIMESAVEMODE');
  assert.match(responses.at(-1), /ACTIVE/);
});

test('storage rejects project symlinks escaping root and sanitizes traversal', async (t) => {
  const { formatDateFolder, dateFromMessageTimestamp } = require('../src/media');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-path-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'storage');
  const outside = path.join(dir, 'outside');
  const date = formatDateFolder(dateFromMessageTimestamp(message()));
  await fs.mkdir(path.join(root, date), { recursive: true });
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(root, date, 'Escape'));
  await assert.rejects(saveMessageMedia(message(), { STORAGE_DIR: root }, 'Escape'), /di luar STORAGE_DIR/);
  assert.deepEqual(await fs.readdir(outside), []);
  const saved = await saveMessageMedia(message(), { STORAGE_DIR: root }, '../../escape');
  const canonicalRoot = await fs.realpath(root);
  assert.ok(saved.absolutePath.startsWith(canonicalRoot + path.sep));
  assert.ok(!(path.relative(canonicalRoot, saved.absolutePath).startsWith('..')));
});
