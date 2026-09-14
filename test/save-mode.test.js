'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSaveMode, SAVE_WINDOW_MS, sanitizeFolder } = require('../src/save-mode');
const { handleCommand } = require('../src/commands');

test('commands isolate senders, preserve folders and do not refresh on status/help', () => {
  let time = 1000;
  const mode = createSaveMode({ now: () => time });
  const command = (text, sender = 'a@lid') => handleCommand({ type: 'chat', body: text }, sender, mode);
  assert.match(command('savetoserver'), /tidak dapat/);
  assert.match(command('timesavemode'), /belum ditentukan/);
  assert.match(command('makefolder'), /Format salah/);
  assert.match(command('MAKEFOLDER .'), /Format salah/);
  assert.match(command('makefolder Proses Installasi Guard'), /Proses Installasi Guard/);
  command('MAKEFOLDER Handrail', 'b@c.us');
  command('SaveToServer');
  time += 96000;
  assert.match(command('TimeSaveMode'), /3 menit 24 detik/);
  assert.match(command('help'), /STOPSAVE/);
  assert.equal(mode.status('a@lid').remainingMs, 204000);
  assert.equal(mode.acceptImage('b@c.us'), null);
  command('SAVETOSERVER', 'b@c.us');
  const accepted = mode.acceptImage('a@lid');
  assert.equal(mode.status('a@lid').remainingMs, 204000);
  mode.refresh('a@lid', accepted);
  assert.equal(mode.status('a@lid').remainingMs, SAVE_WINDOW_MS);
  command('stopsave');
  mode.refresh('a@lid', accepted);
  assert.equal(mode.status('a@lid').remainingMs, 0);
  assert.equal(mode.status('a@lid').activeFolder, 'Proses Installasi Guard');
  assert.ok(mode.status('b@c.us').remainingMs);
  assert.match(command('STOPSAVE'), /sudah tidak aktif/);
  command('SAVETOSERVER');
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


test('renamed commands are case-insensitive; retired commands never mutate state', () => {
  const mode = createSaveMode({ now: () => 1000 });
  const command = text => handleCommand({ type: 'chat', body: text }, 'rename@lid', mode);
  const retired = ['SETFOLDER Other', 'SAVETOLOCAL', 'STOPLOCAL'];
  const before = mode.status('rename@lid');
  for (const text of retired) {
    assert.equal(command(text), null);
    assert.equal(command(text.toLowerCase()), null);
    assert.deepEqual(mode.status('rename@lid'), before);
  }
  assert.match(command('MaKeFoLdEr Rename Test'), /Rename Test/);
  assert.match(command('SaVeToSeRvEr'), /aktif selama 5 menit/);
  const active = mode.status('rename@lid');
  for (const text of retired) {
    assert.equal(command(text), null);
    assert.deepEqual(mode.status('rename@lid'), active);
  }
  assert.match(command('StOpSaVe'), /berhasil dihentikan/);
  assert.equal(mode.status('rename@lid').remainingMs, 0);
  assert.equal(mode.status('rename@lid').activeFolder, 'Rename Test');
  const help = command('HELP');
  for (const name of ['MAKEFOLDER','SAVETOSERVER','TIMESAVEMODE','STOPSAVE','BOTSTATUS','HELP']) assert.ok(help.includes(name));
  for (const text of retired) assert.ok(!help.includes(text.split(' ')[0]));
});
