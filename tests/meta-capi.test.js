import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sendCapiEvent, sendCapiLead, sendCapiPurchase } from '../api/_lib/meta-capi.js';

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

const ORDER = {
  site: 'skjul',
  product: '2-dunk Standard',
  name: 'Kari Nordmann',
  email: '  Kari@Example.NO ',
  phone: '901 86 693',
  address_meta: { postnummer: '7010', poststed: 'Trondheim' },
  price_nok: 4490,
};

const CTX = {
  event_id: 'abc-123',
  fbp: 'fb.1.1700000000.111',
  fbc: 'fb.1.1700000000.TEST123',
  consent: true,
  event_source_url: 'https://www.roverk.no/skjul',
};

const REQ = { headers: { 'x-forwarded-for': '81.2.3.4, 10.0.0.1', 'user-agent': 'Mozilla/5.0' } };

let calls;
const realFetch = globalThis.fetch;

function mockFetch(responses) {
  calls = [];
  let i = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const r = responses[Math.min(i++, responses.length - 1)];
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} };
  };
}

beforeEach(() => {
  process.env.META_CAPI_TOKEN = 'test-token';
  delete process.env.META_CAPI_TEST_CODE;
  delete process.env.META_PIXEL_ID;
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.META_CAPI_TOKEN;
});

/* ============================================================
   Gates
   ============================================================ */
test('sends nothing without a token', async () => {
  delete process.env.META_CAPI_TOKEN;
  mockFetch([{ status: 200 }]);
  const r = await sendCapiLead(ORDER, CTX, REQ);
  assert.deepEqual(r, { skipped: 'no-token' });
  assert.equal(calls.length, 0);
});

test('sends nothing without tracking consent', async () => {
  mockFetch([{ status: 200 }]);
  const r = await sendCapiLead(ORDER, { ...CTX, consent: false }, REQ);
  assert.deepEqual(r, { skipped: 'no-consent' });
  assert.equal(calls.length, 0);
});

test('treats a missing consent flag as no consent', async () => {
  mockFetch([{ status: 200 }]);
  const r = await sendCapiLead(ORDER, { event_id: 'x' }, REQ);
  assert.deepEqual(r, { skipped: 'no-consent' });
});

/* ============================================================
   Payload
   ============================================================ */
test('sends Lead – not Purchase – for a submitted order', async () => {
  mockFetch([{ status: 200, body: { events_received: 1 } }]);
  const r = await sendCapiLead(ORDER, CTX, REQ);

  assert.deepEqual(r, { ok: true, events_received: 1 });
  const ev = calls[0].body.data[0];
  assert.equal(ev.event_name, 'Lead');
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.event_id, 'abc-123', 'event_id must match the browser for dedup');
  assert.equal(ev.event_source_url, 'https://www.roverk.no/skjul');
  assert.equal(typeof ev.event_time, 'number');
});

test('hashes every match key with SHA-256 and leaks no plaintext', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  const ud = calls[0].body.data[0].user_data;

  // Normalisation must match lib/meta.js exactly.
  assert.deepEqual(ud.em, [sha('kari@example.no')]);
  assert.deepEqual(ud.ph, [sha('4790186693')]);
  assert.deepEqual(ud.fn, [sha('kari')]);
  assert.deepEqual(ud.ln, [sha('nordmann')]);
  assert.deepEqual(ud.zp, [sha('7010')]);
  assert.deepEqual(ud.ct, [sha('trondheim')]);
  assert.deepEqual(ud.country, [sha('no')]);
  assert.deepEqual(ud.external_id, [sha('roverk:kari@example.no')]);

  const raw = JSON.stringify(calls[0].body);
  for (const plain of ['Kari@Example.NO', 'kari@example.no', 'Nordmann', '90186693', 'Trondheim', '7010']) {
    assert.equal(raw.includes(plain), false, `plaintext leaked: ${plain}`);
  }
});

test('forwards fbp, fbc, client IP and user agent', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  const ud = calls[0].body.data[0].user_data;
  assert.equal(ud.fbp, 'fb.1.1700000000.111');
  assert.equal(ud.fbc, 'fb.1.1700000000.TEST123');
  assert.equal(ud.client_ip_address, '81.2.3.4', 'only the first x-forwarded-for hop');
  assert.equal(ud.client_user_agent, 'Mozilla/5.0');
});

test('sends value and NOK currency', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  const cd = calls[0].body.data[0].custom_data;
  assert.equal(cd.value, 4490);
  assert.equal(cd.currency, 'NOK');
  assert.deepEqual(cd.content_ids, ['skjul']);
  assert.equal(cd.content_name, '2-dunk Standard');
});

test('omits value rather than sending 0 – Meta cannot value-optimise on 0', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead({ ...ORDER, price_nok: 0 }, CTX, REQ);
  assert.equal('value' in calls[0].body.data[0].custom_data, false);
});

test('omits value when the price is unknown', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead({ ...ORDER, price_nok: null }, CTX, REQ);
  assert.equal('value' in calls[0].body.data[0].custom_data, false);
});

test('a soft lead with only an email still produces a usable match key', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiEvent('CompleteRegistration', { site: 'orden', email: 'ola@example.no', price_nok: 3190 }, CTX, REQ);
  const ev = calls[0].body.data[0];
  assert.equal(ev.event_name, 'CompleteRegistration');
  assert.deepEqual(ev.user_data.em, [sha('ola@example.no')]);
  assert.equal(ev.user_data.ph, undefined);
});

test('Purchase uses action_source "other" – it happens off the website', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiPurchase(ORDER, CTX, REQ);
  const ev = calls[0].body.data[0];
  assert.equal(ev.event_name, 'Purchase');
  assert.equal(ev.action_source, 'other');
});

test('no test_event_code unless explicitly configured', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  assert.equal('test_event_code' in calls[0].body, false);

  process.env.META_CAPI_TEST_CODE = 'TEST1234';
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  assert.equal(calls[0].body.test_event_code, 'TEST1234');
});

test('phone numbers already carrying a country code are not double-prefixed', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead({ ...ORDER, phone: '+47 901 86 693' }, CTX, REQ);
  assert.deepEqual(calls[0].body.data[0].user_data.ph, [sha('4790186693')]);

  mockFetch([{ status: 200 }]);
  await sendCapiLead({ ...ORDER, phone: '0047 90186693' }, CTX, REQ);
  assert.deepEqual(calls[0].body.data[0].user_data.ph, [sha('4790186693')]);
});

/* ============================================================
   Retry
   ============================================================ */
test('retries once on a 5xx', async () => {
  mockFetch([{ status: 503 }, { status: 200, body: { events_received: 1 } }]);
  const r = await sendCapiLead(ORDER, CTX, REQ);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
});

test('does not retry a 4xx – retrying an invalid payload cannot help', async () => {
  mockFetch([{ status: 400, body: { error: { message: 'bad', fbtrace_id: 'TRACE1' } } }]);
  const r = await sendCapiLead(ORDER, CTX, REQ);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.fbtrace_id, 'TRACE1', 'fbtrace_id must be surfaced for debugging');
  assert.equal(calls.length, 1);
});

test('gives up after the retry budget and reports the failure', async () => {
  mockFetch([{ status: 500 }, { status: 500 }]);
  const r = await sendCapiLead(ORDER, CTX, REQ);
  assert.equal(r.ok, false);
  assert.equal(calls.length, 2);
});

test('a network error never throws – it must not break the order', async () => {
  calls = [];
  globalThis.fetch = async () => { throw new Error('ECONNRESET'); };
  const r = await sendCapiLead(ORDER, CTX, REQ);
  assert.equal(r.ok, false);
});

test('uses META_PIXEL_ID when set, otherwise the public fallback', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  assert.ok(calls[0].url.includes('/2847699825597498/events'));

  process.env.META_PIXEL_ID = '999';
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  assert.ok(calls[0].url.includes('/999/events'));
});

test('the token goes in the query string, never in the logged body', async () => {
  mockFetch([{ status: 200 }]);
  await sendCapiLead(ORDER, CTX, REQ);
  assert.ok(calls[0].url.includes('access_token=test-token'));
  assert.equal(JSON.stringify(calls[0].body).includes('test-token'), false);
});
