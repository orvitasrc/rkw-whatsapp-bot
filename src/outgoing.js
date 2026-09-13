'use strict';

// Sending and obtaining a Message return object are separate outcomes.
// Never automatically resend an ambiguous result: the first send may have worked.
async function sendText(client, group, text, log, timeoutMs = 10000) {
  const method = 'client.sendMessage';
  let observed = false;
  let timer;
  let settleObserved;
  const observation = new Promise(resolve => { settleObserved = resolve; });
  const onMessage = message => {
    if (!message.fromMe || (message.to !== group && message.from !== group) || message.body !== text) return;
    observed = true;
    log('OUTGOING_OBSERVED', { method, group, ack: message.ack ?? null });
    settleObserved();
  };
  client.on?.('message_create', onMessage);
  log('OUTGOING_STARTED', { method, group });
  let timedOut = false;
  try {
    const operation = Promise.resolve().then(() => client.sendMessage(group, text, { sendSeen: false }));
    const sent = await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('Outgoing operation exceeded wait limit; delivery unknown'));
      }, timeoutMs); }),
    ]);
    clearTimeout(timer);
    const resultType = sent === null ? 'null' : typeof sent;
    const hasMessageId = Boolean(sent?.id?._serialized || sent?.id?.$1 || sent?.id?.id);
    log('OUTGOING_RESOLVED', { method, group, resultType, hasMessageId });
    if (!observed && !hasMessageId && typeof client.on === 'function') {
      await Promise.race([observation, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]);
    }
    const status = observed ? 'observed' : hasMessageId ? 'returned_message' : 'unconfirmed';
    log(observed ? 'OUTGOING_CONFIRMED_LOCAL' : hasMessageId ? 'OUTGOING_RETURNED_MESSAGE' : 'OUTGOING_UNCONFIRMED',
      { method, group, status });
    return { status, observed, resultType };
  } catch (error) {
    const status = observed ? 'observed' : timedOut ? 'timeout_unknown' : 'rejected';
    log(timedOut ? 'OUTGOING_TIMEOUT_UNKNOWN' : 'OUTGOING_REJECTED', { method, group, observed, status }, error);
    return { status, observed };
  } finally {
    clearTimeout(timer);
    client.removeListener?.('message_create', onMessage);
  }
}
module.exports = { sendText };
