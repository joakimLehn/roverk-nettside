import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleLead } from '../api/_lib/lead-service.js';

const data = { site: 'orden', kind: 'config_share', email: 'k@x.no', config: { bt: '60L' }, product: 'Orden 60L · 4×4', price_nok: 8390, share_url: 'https://www.roverk.no/orden?k=60L.4.4.0.0', consent: true, utm: {} };

function baseDeps(overrides = {}) {
  const calls = { email: 0, insert: 0, slack: 0 };
  return {
    calls,
    deps: {
      sendLeadEmail: async () => { calls.email++; },
      insertLead: async () => { calls.insert++; return 'lead-1'; },
      postLeadSlack: async () => { calls.slack++; },
      ...overrides
    }
  };
}

test('samtykke: sender e-post, lagrer lead og varsler Slack', async () => {
  const { calls, deps } = baseDeps();
  const r = await handleLead(data, deps);
  assert.equal(r.ok, true);
  assert.equal(calls.email, 1);
  assert.equal(calls.insert, 1);
  assert.equal(calls.slack, 1);
  assert.equal(r.notify.email_lead, 'ok');
  assert.equal(r.notify.lead_saved, 'ok');
  assert.equal(r.notify.slack, 'ok');
});

test('uten samtykke: sender kun e-post, lagrer INGEN lead og varsler ikke Slack', async () => {
  const { calls, deps } = baseDeps();
  const r = await handleLead({ ...data, consent: false }, deps);
  assert.equal(r.ok, true);
  assert.equal(calls.email, 1);
  assert.equal(calls.insert, 0);
  assert.equal(calls.slack, 0);
  assert.equal(r.notify.lead_saved, undefined);
});

test('e-postfeil => hele kallet feiler (bruker ba om e-posten)', async () => {
  const { calls, deps } = baseDeps({ sendLeadEmail: async () => { throw new Error('resend nede'); } });
  await assert.rejects(() => handleLead(data, deps));
  assert.equal(calls.insert, 0);
  assert.equal(calls.slack, 0);
});

test('DB-feil ved samtykke velter ikke svaret; Slack kjører fortsatt', async () => {
  const { calls, deps } = baseDeps({ insertLead: async () => { throw new Error('db nede'); } });
  const r = await handleLead(data, deps);
  assert.equal(r.ok, true);
  assert.equal(calls.email, 1);
  assert.equal(calls.slack, 1);
  assert.match(r.notify.lead_saved, /feil:/);
});
