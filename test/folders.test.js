'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createFolderManager, handleFolderCommand } = require('../src/folders');
const { createSaveMode } = require('../src/save-mode');
const { handleCommand } = require('../src/commands');
const today = () => new Date(2026, 8, 14, 12);
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rkw-folders-'));
  t.after(() => fs.rm(dir, {recursive:true,force:true}));
  const root = path.join(dir,'storage');
  return {root, day:path.join(root,'2026-09-14'), manager:createFolderManager(root,today)};
}
test('LISTFOLDER lists today directories only, sorted, including empty/missing cases', async t => {
  const {root,day,manager}=await setup(t);
  assert.deepEqual((await manager.list()).names,[]);
  await assert.rejects(fs.stat(root),{code:'ENOENT'});
  await fs.mkdir(day,{recursive:true}); assert.deepEqual((await manager.list()).names,[]);
  await manager.make('Zebra');await manager.make('alpha');
  await fs.writeFile(path.join(day,'image.jpg'),'image');
  await fs.mkdir(path.join(root,'2026-09-13','Yesterday'),{recursive:true});
  assert.deepEqual((await manager.list()).names,['alpha','Zebra']);
});
test('rename preserves contents, updates all matching sender pointers without changing mode/timer', async t => {
  const {day,manager}=await setup(t);await manager.make('Kirim Part');
  await fs.mkdir(path.join(day,'Kirim Part','nested'));
  await fs.writeFile(path.join(day,'Kirim Part','nested','image.jpg'),'unchanged');
  const mode=createSaveMode({now:()=>1000});
  for(const sender of ['a@lid','b@c.us']){mode.setFolder(sender,'Kirim Part');mode.activate(sender);}
  mode.setFolder('c@lid','Other');mode.activate('c@lid');
  const a=mode.status('a@lid'),b=mode.status('b@c.us'),c=mode.status('c@lid');
  const run=body=>handleFolderCommand({body},'a@lid',mode,manager);
  assert.match(await run('LISTFOLDER'),/Kirim Part/);assert.deepEqual(mode.status('a@lid'),a);
  assert.match(await run('renamefolder kirim part | Pengiriman Part'),/berhasil/);
  assert.equal(await fs.readFile(path.join(day,'Pengiriman Part','nested','image.jpg'),'utf8'),'unchanged');
  await assert.rejects(fs.stat(path.join(day,'Kirim Part')),{code:'ENOENT'});
  assert.deepEqual(mode.status('a@lid'),{...a,activeFolder:'Pengiriman Part'});
  assert.deepEqual(mode.status('b@c.us'),{...b,activeFolder:'Pengiriman Part'});
  assert.deepEqual(mode.status('c@lid'),c);
});
test('rename rejects invalid format, missing/colliding/case-only targets and unsafe paths', async t => {
  const {manager,day}=await setup(t);const mode=createSaveMode();
  const run=body=>handleFolderCommand({body},'a@lid',mode,manager);
  for(const body of ['RENAMEFOLDER','RENAMEFOLDER Old New','RENAMEFOLDER Old |','RENAMEFOLDER | New','RENAMEFOLDER a|b|c'])assert.match(await run(body),/Format/);
  await manager.make('Old');await manager.make('Existing');await fs.writeFile(path.join(day,'Old','keep'),'keep');
  assert.match(await run('RENAMEFOLDER Missing | New'),/tidak ditemukan/);
  assert.match(await run('RENAMEFOLDER Old | existing'),/sudah digunakan/);
  assert.match(await run('RENAMEFOLDER Old | old'),/sudah digunakan/);
  for(const name of ['../Old','a/b','a\\b'])assert.match(await run(`RENAMEFOLDER ${name} | New`),/tidak valid/);
  assert.match(await run('RENAMEFOLDER Old | ../New'),/tidak valid/);
  assert.equal(await fs.readFile(path.join(day,'Old','keep'),'utf8'),'keep');
  assert.equal(await manager.make('old'),'Old');
});
test('symlinks are not listed or renamed; HELP has all current commands', async t => {
  const {root,day,manager}=await setup(t);await manager.make('Real');
  await fs.symlink(path.join(day,'Real'),path.join(day,'Link'));
  assert.deepEqual((await manager.list()).names,['Real']);
  await assert.rejects(manager.rename('Link','Other'),{code:'UNSAFE_PATH'});
  const help=handleCommand({type:'chat',body:'HELP'},'a',createSaveMode());
  for(const name of ['MAKEFOLDER','LISTFOLDER','RENAMEFOLDER','SAVETOSERVER','TIMESAVEMODE','STOPSAVE','BOTSTATUS','HELP'])assert.ok(help.includes(name));
  assert.ok(help.includes('*'));assert.ok(help.includes('`'));
});


test('queued rename preserves in-flight images and updates later queued images; other groups cannot rename', async t => {
  const {config}=require('../src/config');
  const {handleIncomingMessage}=require('../src/index');
  const {formatDateFolder}=require('../src/media');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rkw-folder-queue-'));
  const original={...config};t.after(async()=>{Object.assign(config,original);await fs.rm(root,{recursive:true,force:true});});
  Object.assign(config,{GROUP_ID:'folder-test@g.us',STORAGE_DIR:root});
  const responses=[];const client={async sendMessage(group,text){responses.push(text);return {id:{id:'reply'}};}};
  const base={from:config.GROUP_ID,author:'queue@lid',client};
  const command=(body,extra={})=>handleIncomingMessage({...base,type:'chat',hasMedia:false,body,...extra});
  await command('MAKEFOLDER Before');await command('SAVETOSERVER');
  let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const image=(downloadMedia)=>handleIncomingMessage({...base,type:'image',hasMedia:true,
    timestamp:Math.floor(Date.now()/1000),id:{_serialized:'image-id'},downloadMedia});
  const data={mimetype:'image/jpeg',data:Buffer.from('image').toString('base64')};
  const first=image(async()=>{started();await new Promise(resolve=>{release=resolve;});return data;});
  await ready;
  const rename=command('RENAMEFOLDER Before | After');
  const second=image(async()=>data);
  release();await Promise.all([first,rename,second]);
  const day=path.join(root,formatDateFolder(new Date()));
  assert.deepEqual(await fs.readdir(day),['After']);
  assert.deepEqual((await fs.readdir(path.join(day,'After'))).sort(),['image-001.jpg','image-002.jpg']);
  await command('TIMESAVEMODE');assert.match(responses.at(-1),/After/);
  const count=responses.length;
  await command('RENAMEFOLDER After | Forbidden',{from:'other@g.us'});
  await command('LISTFOLDER',{from:'private@c.us'});
  assert.equal(responses.length,count);
  assert.deepEqual(await fs.readdir(day),['After']);
});
