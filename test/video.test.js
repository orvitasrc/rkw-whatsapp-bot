 'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { evaluateMessage } = require('../src/rules');
const { saveMessageMedia, extensionFromMimetype } = require('../src/media');
const { handleCommand } = require('../src/commands');
const { createSaveMode } = require('../src/save-mode');
const bytes = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]);
const video = (extra = {}) => ({ type: 'video', hasMedia: true, author: 'video@lid', from: 'video@g.us',
  id: { $1: 'false_video@g.us_complete_participant@lid' }, timestamp: 1789347600,
  async downloadMedia() { assert.equal(this.id._serialized, this.id.$1); return { mimetype: 'video/mp4', data: bytes.toString('base64') }; }, ...extra });
test('video requires configured group and media; document/audio/sticker rejected', () => {
  const config = { GROUP_ID: 'video@g.us' };
  assert.equal(evaluateMessage(video(), config).allowed, true);
  for (const extra of [{from:'private@c.us'}, {from:'other@g.us'}, {hasMedia:false},
    {type:'document'}, {type:'audio'}, {type:'ptt'}, {type:'sticker'}]) {
    assert.equal(evaluateMessage(video(extra), config).allowed, false);
  }
  assert.match(handleCommand({type:'chat',body:'HELP'}, 'video@lid', createSaveMode()), /foto\/video/);
});
test('video MIME mapping and safe fallback; image extensions unchanged', () => {
  for (const [mime, ext] of [['video/mp4','.mp4'], ['video/3gpp','.3gp'], ['video/quicktime','.mov'],
    ['video/webm','.webm'], ['VIDEO/MP4; codecs=avc1','.mp4'], ['video/unknown','.bin'], [undefined,'.bin']]) {
    assert.equal(extensionFromMimetype(mime,'video'),ext);
  }
  assert.equal(extensionFromMimetype('image/jpeg'),'.jpg');
  assert.equal(extensionFromMimetype('image/png'),'.png');
  assert.equal(extensionFromMimetype('unknown'),'.jpg');
});
test('video original bytes and alias ID; separate numbering across extensions without overwrite', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'rkw-video-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const settings = { STORAGE_DIR:root };
  const first = await saveMessageMedia(video(),settings,'Video Test');
  const second = await saveMessageMedia(video(),settings,'Video Test');
  const photo = await saveMessageMedia(video({type:'image',async downloadMedia(){return {mimetype:'image/jpeg',data:bytes.toString('base64')};}}),settings,'Video Test');
  const third = await saveMessageMedia(video({async downloadMedia(){return {mimetype:'video/webm',data:bytes.toString('base64')};}}),settings,'Video Test');
  assert.equal(path.basename(first.absolutePath),'video-001.mp4');
  assert.equal(path.basename(second.absolutePath),'video-002.mp4');
  assert.equal(path.basename(photo.absolutePath),'image-001.jpg');
  assert.equal(path.basename(third.absolutePath),'video-003.webm');
  for(const saved of [first,second,photo,third]) {
    assert.deepEqual(await fs.readFile(saved.absolutePath),bytes);
    assert.equal((await fs.stat(saved.absolutePath)).size,bytes.length);
  }
});
test('empty video and write failure have media stage codes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'rkw-video-failure-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  for(const data of [undefined, {data:'!!!',mimetype:'video/mp4'}]) {
    await assert.rejects(saveMessageMedia(video({async downloadMedia(){return data;}}),{STORAGE_DIR:root},'Test'),{stage:'MEDIA_DOWNLOAD_FAILED'});
  }
  const write = t.mock.method(fs,'writeFile',async()=>{throw new Error('simulated write failure');});
  await assert.rejects(saveMessageMedia(video(),{STORAGE_DIR:root},'Test'),{stage:'MEDIA_WRITE_FAILED'});
  write.mock.restore();
});
