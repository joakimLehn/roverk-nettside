import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleOrder } from '../api/_lib/order-service.js';

const data = { site: 'ved', product: 'Vedskjul Medium', name: 'Kari', phone: '1', email: 'k@x.no', config: {}, utm: {} };

function baseDeps(overrides = {}) {
  const calls = { insert: 0, owner: 0, customer: 0, slack: 0, updateNotify: null };
  return {
    calls,
    deps: {
      insertOrder: async () => { calls.insert++; return 'id-123'; },
      sendOwnerEmail: async () => { calls.owner++; },
      sendCustomerEmail: async () => { calls.customer++; },
      postSlack: async () => { calls.slack++; },
      updateNotify: async (id, n) => { calls.updateNotify = { id, n }; },
      ...overrides
    }
  };
}

test('lykkelig sti: lagrer, sender begge e-poster, Slack, oppdaterer notify=ok', async () => {
  const { calls, deps } = baseDeps();
  const r = await handleOrder(data, deps);
  assert.equal(r.ok, true);
  assert.equal(r.id, 'id-123');
  assert.equal(calls.insert, 1);
  assert.equal(calls.owner, 1);
  assert.equal(calls.customer, 1);
  assert.equal(calls.slack, 1);
  assert.equal(calls.updateNotify.n.email_owner, 'ok');
  assert.equal(calls.updateNotify.n.email_customer, 'ok');
  assert.equal(calls.updateNotify.n.slack, 'ok');
});

test('DB-feil => hele kallet feiler, ingen e-post/Slack', async () => {
  const { calls, deps } = baseDeps({ insertOrder: async () => { throw new Error('db nede'); } });
  await assert.rejects(() => handleOrder(data, deps));
  assert.equal(calls.owner, 0);
  assert.equal(calls.slack, 0);
});

test('e-postfeil stopper ikke Slack; Slack får feilstatus', async () => {
  let slackNotify = null;
  const { calls, deps } = baseDeps({
    sendCustomerEmail: async () => { throw new Error('timeout'); },
    postSlack: async (order, notify) => { calls.slack++; slackNotify = notify; }
  });
  const r = await handleOrder(data, deps);
  assert.equal(r.ok, true);
  assert.equal(calls.slack, 1);
  assert.match(slackNotify.email_customer, /timeout/);
  assert.equal(slackNotify.email_owner, 'ok');
});

test('Slack-feil senker ikke kallet; notify lagres med slack-feil', async () => {
  const { calls, deps } = baseDeps({ postSlack: async () => { throw new Error('webhook 500'); } });
  const r = await handleOrder(data, deps);
  assert.equal(r.ok, true);
  assert.match(calls.updateNotify.n.slack, /webhook 500/);
});
