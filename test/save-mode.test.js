'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSaveMode, SAVE_WINDOW_MS, sanitizeFolder } = require('../src/save-mode');
const { handleCommand } = require('../src/commands');

test('commands isolate senders, preserve folders and do not refresh on status/help', () => {
  let time = 1000;
  const mode = createSaveMode({ now: () => time });
  const command = (text, sender = 'a@lid') => handleCommand({ type: 'chat', body: text }, sender, mode);
  assert.match(command('savetolocal'), /tidak dapat/);
  assert.match(command('timesavemode'), /belum ditentukan/);
  assert.match(command('setfolder'), /Format salah/);
  assert.match(command('SETFOLDER .'), /Format salah/);
  assert.match(command('setfolder Proses Installasi Guard'), /Proses Installasi Guard/);
  command('SETFOLDER Handrail', 'b@c.us');
  command('SaveToLocal');
  time += 96000;
  assert.match(command('TimeSaveMode'), /3 menit 24 detik/);
  assert.match(command('help'), /STOPLOCAL/);
  assert.equal(mode.status('a@lid').remainingMs, 204000);
  assert.equal(mode.acceptImage('b@c.us'), null);
  command('SAVETOLOCAL', 'b@c.us');
  const accepted = mode.acceptImage('a@lid');
  assert.equal(mode.status('a@lid').remainingMs, 204000);
  mode.refresh('a@lid', accepted);
  assert.equal(mode.status('a@lid').remainingMs, SAVE_WINDOW_MS);
  command('stoplocal');
  mode.refresh('a@lid', accepted);
  assert.equal(mode.status('a@lid').remainingMs, 0);
  assert.equal(mode.status('a@lid').activeFolder, 'Proses Installasi Guard');
  assert.ok(mode.status('b@c.us').remainingMs);
  assert.match(command('STOPLOCAL'), /sudah tidak aktif/);
  command('SAVETOLOCAL');
  time += 1000;
  mode.refresh('a@lid', accepted); // old download cannot refresh new activation
  assert.equal(mode.status('a@lid').remainingMs, SAVE_WINDOW_MS - 1000);
  time += SAVE_WINDOW_MS - 1000;
  assert.equal(mode.acceptImage('a@lid'), null);
  assert.match(command('TIMESAVEMODE'), /INACTIVE/);
  assert.equal(mode.status('a@lid').activeFolder, 'Proses Installasi Guard');
  assert.equal(createSaveMode().status('a@lid').activeFolder, null);
  assert.equal(command('hello'), null);
  assert.equal(handleCommand({ type: 'image', hasMedia: true, body: 'HELP' }, 'a', mode), null);
});

test('folder sanitization preserves case and blocks path components and unsafe names', () => {
  assert.equal(sanitizeFolder('  Proses Installasi Guard  '), 'Proses Installasi Guard');
  for (const value of ['../../escape', '/absolute', '..\\escape', 'a/b', 'CON', 'x\x00y', 'a'.repeat(500)]) {
    const folder = sanitizeFolder(value);
    assert.ok(!/[\/\\\x00]/.test(folder));
    assert.ok(!folder.includes('..'));
    assert.ok(Buffer.byteLength(folder) <= 200);
  }
  for (const value of ['', '   ', '.']) assert.throws(() => sanitizeFolder(value));
});
