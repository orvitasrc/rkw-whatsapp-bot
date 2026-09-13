'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { sendText } = require('../src/outgoing');

test('undefined return with matching outgoing event is observed, without retry', async () => {
  const c = new EventEmitter(); let calls = 0;
  c.sendMessage = async (group, body) => { calls++; c.emit('message_create', {fromMe:true,to:group,body,ack:1}); };
  const records=[];
  const result=await sendText(c,'test@g.us','HELP response',(...args)=>records.push(args));
  assert.equal(result.status,'observed'); assert.equal(result.resultType,'undefined'); assert.equal(calls,1);
  assert.equal(c.listenerCount('message_create'),0);
  assert.ok(records.some(([code])=>code==='OUTGOING_RESOLVED'));
});

test('undefined/null results are unconfirmed, rejection is distinct, valid object is recognized', async () => {
  for (const value of [undefined,null,{}]) {
    let calls=0;
    const r=await sendText({async sendMessage(){calls++;return value;}},'g@g.us','text',()=>{});
    assert.equal(r.status,'unconfirmed');assert.equal(calls,1);
  }
  const rejected=await sendText({async sendMessage(){throw new Error('reject');}},'g@g.us','text',()=>{});
  assert.equal(rejected.status,'rejected');
  const returned=await sendText({async sendMessage(){return {id:{$1:'id'}};}},'g@g.us','text',()=>{});
  assert.equal(returned.status,'returned_message');
});

test('unrelated events do not confirm; observation wait is bounded', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const c=new EventEmitter();
  c.sendMessage=async()=>{c.emit('message_create',{fromMe:true,to:'other@g.us',body:'text'});};
  const pending=sendText(c,'g@g.us','text',()=>{});
  for(let i=0;i<8;i++)await Promise.resolve();
  t.mock.timers.tick(1000);
  assert.equal((await pending).status,'unconfirmed');
  assert.equal(c.listenerCount('message_create'),0);
});
