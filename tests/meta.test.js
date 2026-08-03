import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// lib/meta.js is a browser IIFE. Build a minimal fake DOM, then import it for
// its side effects. Each scenario needs a fresh module instance, so the import
// is cache-busted with a query string.
let seq = 0;

function setupEnv(opts = {}) {
  const {
    hostname = 'www.roverk.no',
    search = '',
    consent = null,
    preexistingFbq = null,
    hasBody = true,
    utm = null,
  } = opts;

  const inserted = [];
  const store = new Map();
  const session = new Map();
  if (consent !== null) store.set('roverk_meta_consent', consent);
  if (utm) store.set('ns_utm', JSON.stringify(utm));

  const makeEl = () => ({
    style: {}, dataset: {}, children: [],
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {},
    appendChild(c) { this.children.push(c); },
    parentNode: { insertBefore(node) { inserted.push(node); } },
  });

  const body = hasBody ? makeEl() : null;

  const win = {};
  if (preexistingFbq) win.fbq = preexistingFbq;

  const fakeDoc = {
    cookie: '',
    body,
    documentElement: makeEl(),
    createElement: () => makeEl(),
    getElementsByTagName: () => [makeEl()],
    getElementById: () => null,
    addEventListener() {},
  };

  globalThis.window = win;
  globalThis.document = fakeDoc;
  globalThis.location = { hostname, search, href: `https://${hostname}/skjul${search}` };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.sessionStorage = {
    getItem: (k) => (session.has(k) ? session.get(k) : null),
    setItem: (k, v) => session.set(k, String(v)),
    removeItem: (k) => session.delete(k),
  };
  win.crypto = globalThis.crypto;
  win.TextEncoder = globalThis.TextEncoder;
  win.fbq = win.fbq; // keep stub if provided

  return { win, doc: fakeDoc, inserted, store, session };
}

async function loadMeta() {
  return import(`../lib/meta.js?n=${++seq}`);
}

// The pixel bootstrap pushes into fbq.queue until fbevents.js loads (it never
// does in a test), so the queue is a faithful record of what was sent.
function queued(win) {
  return (win.fbq && win.fbq.queue ? win.fbq.queue : []).map((a) => Array.from(a));
}

function insertedPixelScript(inserted) {
  return inserted.some((n) => String(n.src || '').includes('connect.facebook.net'));
}

/* ============================================================
   Regression: the bug that killed tracking on /skjul and /ved.
   A placeholder stub on window.fbq made Meta's own snippet
   (`if (f.fbq) return;`) bail out, so fbevents.js never loaded,
   PageView never fired, and every event vanished into a dead queue.
   ============================================================ */
test('bootstraps the real pixel even when a placeholder fbq stub is present', async () => {
  const stub = function () { (stub.q = stub.q || []).push(arguments); };
  const env = setupEnv({ consent: 'granted', preexistingFbq: stub });
  await loadMeta();

  assert.ok(insertedPixelScript(env.inserted), 'fbevents.js must be injected');
  assert.notEqual(env.win.fbq, stub, 'the dead stub must be replaced');

  const q = queued(env.win);
  assert.deepEqual(q[0], ['init', '2847699825597498']);
  assert.ok(q.some((c) => c[0] === 'track' && c[1] === 'PageView'), 'PageView must fire');
});

test('bootstraps the pixel when no stub is present', async () => {
  const env = setupEnv({ consent: 'granted' });
  await loadMeta();

  assert.ok(insertedPixelScript(env.inserted));
  assert.ok(queued(env.win).some((c) => c[1] === 'PageView'));
});

test('fires PageView exactly once', async () => {
  const env = setupEnv({ consent: 'granted' });
  await loadMeta();
  env.win.RoverkMeta.initiateCheckout({ value: 4490 });
  env.win.RoverkMeta.initiateCheckout({ value: 4490 });

  const pageViews = queued(env.win).filter((c) => c[0] === 'track' && c[1] === 'PageView');
  assert.equal(pageViews.length, 1);
});

/* ============================================================
   Consent
   ============================================================ */
test('loads nothing from Meta before consent is given', async () => {
  const env = setupEnv({ consent: null });
  await loadMeta();
  assert.equal(insertedPixelScript(env.inserted), false);
  assert.equal(env.win.fbq, undefined);
});

test('loads nothing when consent is denied', async () => {
  const env = setupEnv({ consent: 'denied' });
  await loadMeta();
  assert.equal(insertedPixelScript(env.inserted), false);
});

test('events are no-ops without consent', async () => {
  const env = setupEnv({ consent: 'denied' });
  await loadMeta();
  env.win.RoverkMeta.initiateCheckout({ value: 4490 });
  await env.win.RoverkMeta.lead({ value: 4490, eventId: 'e1' });
  assert.equal(insertedPixelScript(env.inserted), false);
});

/* ============================================================
   Environment guard – no events from localhost or preview.
   ============================================================ */
test('does not fire from localhost even with consent granted', async () => {
  const env = setupEnv({ hostname: 'localhost', consent: 'granted' });
  await loadMeta();
  assert.equal(insertedPixelScript(env.inserted), false);
});

test('does not fire from a Vercel preview host', async () => {
  const env = setupEnv({ hostname: 'roverk-git-abc123.vercel.app', consent: 'granted' });
  await loadMeta();
  assert.equal(insertedPixelScript(env.inserted), false);
});

test('exposes a safe no-op API outside production', async () => {
  const env = setupEnv({ hostname: 'localhost', consent: 'granted' });
  await loadMeta();
  assert.equal(typeof env.win.RoverkMeta.lead, 'function');
  assert.doesNotThrow(() => env.win.RoverkMeta.initiateCheckout({ value: 1 }));
  await assert.doesNotReject(() => env.win.RoverkMeta.lead({ value: 1 }));
});

/* ?metatest=1 is a DRY RUN: the whole flow runs and can be inspected, but
   fbevents.js is never loaded and nothing reaches Meta. A URL parameter that
   switched on real tracking off-production was a trap – it is how localhost
   events polluted the dataset. */
test('?metatest=1 off production never contacts Meta', async () => {
  const env = setupEnv({ hostname: 'localhost', search: '?metatest=1', consent: 'granted' });
  await loadMeta();
  assert.equal(insertedPixelScript(env.inserted), false, 'fbevents.js must never load off production');
  assert.equal(env.win.fbq, undefined, 'no pixel function is created');
});

test('?metatest=1 records the events it would have sent', async () => {
  const env = setupEnv({ hostname: 'localhost', search: '?metatest=1', consent: 'granted' });
  globalThis.window.__ROVERK_META_PRODUCT = { id: 'skjul', name: 'Roverk Søppelskjul', value: 4490 };
  await loadMeta();

  const log = env.win.__ROVERK_META_DRYRUN.map((c) => Array.from(c));
  assert.deepEqual(log[0], ['init', '2847699825597498']);
  assert.ok(log.some((c) => c[1] === 'PageView'));
  assert.ok(log.some((c) => c[1] === 'ViewContent'));

  await env.win.RoverkMeta.lead({ value: 6990, eventId: 'dry-1' });
  const lead = env.win.__ROVERK_META_DRYRUN.map((c) => Array.from(c)).find((c) => c[1] === 'Lead');
  assert.equal(lead[2].value, 6990);
  assert.deepEqual(lead[3], { eventID: 'dry-1' });
  delete globalThis.window.__ROVERK_META_PRODUCT;
});

test('production hosts are not dry runs', async () => {
  const env = setupEnv({ hostname: 'www.roverk.no', search: '?metatest=1', consent: 'granted' });
  await loadMeta();
  assert.equal(env.win.__ROVERK_META_DRYRUN, undefined);
  assert.ok(insertedPixelScript(env.inserted), 'production must use the real pixel');
});

/* ============================================================
   Lead – the main conversion
   ============================================================ */
test('lead sends value, currency and the shared eventID', async () => {
  const env = setupEnv({ consent: 'granted' });
  globalThis.window.__ROVERK_META_PRODUCT = { id: 'skjul', name: 'Roverk Søppelskjul', value: 4490 };
  await loadMeta();

  await env.win.RoverkMeta.lead({ value: 5990, content_name: '2-dunk Standard', eventId: 'abc-123' });

  const lead = queued(env.win).find((c) => c[1] === 'Lead');
  assert.ok(lead, 'Lead must be tracked');
  assert.equal(lead[2].value, 5990);
  assert.equal(lead[2].currency, 'NOK');
  assert.deepEqual(lead[2].content_ids, ['skjul']);
  assert.deepEqual(lead[3], { eventID: 'abc-123' });
  delete globalThis.window.__ROVERK_META_PRODUCT;
});

test('lead never sends value: 0 – falls back to the product from-price', async () => {
  const env = setupEnv({ consent: 'granted' });
  globalThis.window.__ROVERK_META_PRODUCT = { id: 'ved', name: 'Roverk Vedskjul', value: 5990 };
  await loadMeta();

  await env.win.RoverkMeta.lead({ value: 0, eventId: 'e2' });

  const lead = queued(env.win).find((c) => c[1] === 'Lead');
  assert.equal(lead[2].value, 5990);
  delete globalThis.window.__ROVERK_META_PRODUCT;
});

test('advanced matching hashes PII with SHA-256 and never sends plaintext', async () => {
  const env = setupEnv({ consent: 'granted' });
  await loadMeta();

  await env.win.RoverkMeta.lead({
    value: 4490,
    eventId: 'e3',
    user: { name: 'Kari Nordmann', email: '  Kari@Example.NO ', phone: '901 86 693', zip: '7010', city: 'Trondheim' },
  });

  const init = queued(env.win).filter((c) => c[0] === 'init' && c[2]).pop();
  assert.ok(init, 'advanced matching must be sent via fbq init');
  const keys = init[2];

  const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
  // Normalisation must match api/_lib/meta-capi.js exactly.
  assert.equal(keys.em, sha('kari@example.no'));
  assert.equal(keys.ph, sha('4790186693'));
  assert.equal(keys.fn, sha('kari'));
  assert.equal(keys.ln, sha('nordmann'));
  assert.equal(keys.zp, sha('7010'));
  assert.equal(keys.ct, sha('trondheim'));
  assert.equal(keys.country, sha('no'));

  const blob = JSON.stringify(keys);
  for (const plain of ['kari@example.no', 'Kari@Example.NO', '90186693', 'Nordmann', 'Trondheim']) {
    assert.equal(blob.includes(plain), false, `plaintext leaked: ${plain}`);
  }
});

/* ============================================================
   ViewContent / fbclid
   ============================================================ */
test('ViewContent fires once with product parameters', async () => {
  const env = setupEnv({ consent: 'granted' });
  globalThis.window.__ROVERK_META_PRODUCT = { id: 'skjul', name: 'Roverk Søppelskjul', category: 'Storage', value: 4490 };
  await loadMeta();

  const vc = queued(env.win).filter((c) => c[1] === 'ViewContent');
  assert.equal(vc.length, 1);
  assert.equal(vc[0][2].value, 4490);
  assert.equal(vc[0][2].currency, 'NOK');
  assert.deepEqual(vc[0][2].content_ids, ['skjul']);
  delete globalThis.window.__ROVERK_META_PRODUCT;
});

test('ViewContent does not fire on pages without a product (blog, front page)', async () => {
  const env = setupEnv({ consent: 'granted' });
  await loadMeta();
  assert.equal(queued(env.win).some((c) => c[1] === 'ViewContent'), false);
});

test('captures fbclid and writes _fbc only after consent', async () => {
  const env = setupEnv({ search: '?fbclid=TEST123', consent: null });
  await loadMeta();
  assert.equal(env.doc.cookie.includes('_fbc'), false, 'no cookie before consent');
  assert.ok(env.session.get('roverk_fbclid'), 'click id is held for the session');
});

test('writes _fbc from a stored fbclid when consent is already granted', async () => {
  const env = setupEnv({ search: '?fbclid=TEST123', consent: 'granted' });
  await loadMeta();
  assert.ok(env.doc.cookie.includes('_fbc=fb.1.'), 'expected _fbc cookie');
  assert.ok(env.doc.cookie.includes('TEST123'));
});

/* The ad click and the consent click can happen in different sessions. When
   sessionStorage is gone, the fbclid already stored in localStorage `ns_utm`
   by the existing UTM capture is the only remaining source. Without this,
   `fbc` coverage stays at 0 % for those visitors and EMQ is capped. */
test('falls back to the fbclid stored in ns_utm when the session is gone', async () => {
  const env = setupEnv({ consent: 'granted', utm: { utm_source: 'facebook', fbclid: 'LATERSESSION42' } });
  await loadMeta();
  assert.ok(env.doc.cookie.includes('_fbc=fb.1.'), 'expected _fbc from the ns_utm fallback');
  assert.ok(env.doc.cookie.includes('LATERSESSION42'));
});

test('prefers this session’s fbclid over the older ns_utm one', async () => {
  const env = setupEnv({
    search: '?fbclid=FRESH1', consent: 'granted',
    utm: { fbclid: 'STALE0' },
  });
  await loadMeta();
  assert.ok(env.doc.cookie.includes('FRESH1'));
  assert.equal(env.doc.cookie.includes('STALE0'), false);
});

test('does not invent an _fbc when no click id exists anywhere', async () => {
  const env = setupEnv({ consent: 'granted', utm: { utm_source: 'google' } });
  await loadMeta();
  assert.equal(env.doc.cookie.includes('_fbc'), false);
});

test('never overwrites an _fbc the pixel already set', async () => {
  const env = setupEnv({ consent: 'granted', utm: { fbclid: 'FALLBACK9' } });
  env.doc.cookie = '_fbc=fb.1.1700000000.REAL_FROM_PIXEL';
  await loadMeta();
  assert.ok(env.doc.cookie.includes('REAL_FROM_PIXEL'));
  assert.equal(env.doc.cookie.includes('FALLBACK9'), false);
});

test('orderCtx returns the shared event_id and consent flag', async () => {
  const env = setupEnv({ consent: 'granted' });
  await loadMeta();
  const ctx = env.win.RoverkMeta.orderCtx();
  assert.equal(typeof ctx.event_id, 'string');
  assert.ok(ctx.event_id.length > 0);
  assert.equal(ctx.consent, true);
  assert.equal(ctx.event_source_url, 'https://www.roverk.no/skjul');
});
