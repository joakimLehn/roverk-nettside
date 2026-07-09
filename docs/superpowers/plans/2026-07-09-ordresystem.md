# Ordresystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ta imot bestillinger fra de fire Roverk-landingssidene, lagre dem i Neon Postgres, og sende varsel-e-post + kundekvittering (Resend) og Slack-melding — med robust feilhåndtering der DB er kilden til sannhet og e-post/Slack-feil aldri mister en ordre.

**Architecture:** Én Vercel Node-serverless-funksjon (`/api/order`) som alle sidene poster JSON til. HTTP-handleren er tynn; all logikk ligger i rene, testbare moduler under `api/_lib/` med injiserte avhengigheter (DB/e-post/Slack), slik at kjernen kan enhetstestes uten nettverk. Frontend-endring per side bytter ut `submitOrder`/`confirmOrder`-stubben med et `fetch`-kall.

**Tech Stack:** Vercel Functions (Node 24, ESM), Neon Postgres (`@neondatabase/serverless`), Resend (`resend`), Slack Incoming Webhook (via `fetch`), Node innebygd testløper (`node:test` / `node:assert`). Statiske HTML-sider, ingen byggesteg på frontend.

---

## Payload-kontrakt (delt grensesnitt)

Alle fire frontends sender dette til `POST /api/order`. API-et validerer mot det.

```json
{
  "site": "skjul",                     // "orden" | "orden-v2" | "skjul" | "ved"
  "product": "3-dunk Standard",        // menneskelesbar produktbeskrivelse
  "config": { "count": 3, "serie": "Standard", "kledning": "ubeh" },
  "preferred_date": "2026-08-15",      // ISO-dato eller null
  "name": "Ola Nordmann",
  "phone": "99887766",
  "email": "ola@example.com",          // påkrevd
  "address": "Storgata 1, Trondheim",  // kan være ""
  "price_nok": 12900,                  // heltall eller null
  "utm": { "utm_source": "meta" },     // objekt (kan være {})
  "hp": ""                             // honeypot — MÅ være tom, ellers avvises stille
}
```

API-svar: `200 {"ok":true,"id":"<uuid>"}` ved suksess (også hvis e-post/Slack feilet — de rapporteres via `notify` i DB og i Slack-meldingen). `400` ved valideringsfeil. `405` ved feil metode. `500` kun hvis DB-skriving feiler.

---

## File Structure

**Nye filer:**
- `package.json` — `"type":"module"`, avhengigheter, testskript.
- `db/schema.sql` — DDL for `orders`-tabellen (kjøres manuelt mot Neon).
- `api/order.js` — Vercel HTTP-handler (tynn: parse → kall service → svar).
- `api/_lib/validate.js` — ren validering + normalisering av payload.
- `api/_lib/templates.js` — rene byggere for e-post-HTML og Slack-melding.
- `api/_lib/order-service.js` — orkestrering (lagre → e-post → Slack → notify), deps injiseres.
- `api/_lib/db.js` — Neon: `insertOrder`, `updateNotify`.
- `api/_lib/email.js` — Resend: `sendOwnerEmail`, `sendCustomerEmail`.
- `api/_lib/slack.js` — post til webhook.
- `tests/validate.test.js`, `tests/templates.test.js`, `tests/order-service.test.js`.
- `.env.example` — dokumenterer nødvendige miljøvariabler.

**Endrede filer:**
- `orden/index.html`, `orden-v2/index.html` — `state`-basert modal (`confirmOrder`-handler).
- `skjul/index.html`, `ved/index.html` — `order`-basert modal (`submitOrder`).
- `.gitignore` — legg til `.env`.

**Ansvar:** `validate` og `templates` er rene (ingen I/O) og testes direkte. `order-service` er ren orkestrering med injiserte deps og testes med mock-deps. `db`/`email`/`slack` er tynne I/O-adaptere. `api/order.js` limer sammen ekte deps.

---

## Task 1: Prosjektoppsett (package.json, .gitignore, .env.example)

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Opprett `package.json`**

```json
{
  "name": "roverk-nettside",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "@neondatabase/serverless": "^1.0.2",
    "resend": "^4.0.1"
  }
}
```

- [ ] **Step 2: Installer avhengigheter**

Run: `npm install`
Expected: `node_modules/` opprettes, `package-lock.json` skrives, ingen feil.

- [ ] **Step 3: Opprett `.env.example`**

```
# Neon Postgres connection string
DATABASE_URL=postgres://user:pass@host/db?sslmode=require
# Resend API-nøkkel
RESEND_API_KEY=re_xxxxxxxx
# Slack incoming webhook
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
# Mottaker for eier-varsel
NOTIFY_EMAIL=joakiml@aboveit.no
# Avsender for e-post (verifisert domene i Resend)
ORDER_FROM_EMAIL=ordre@roverk.no
```

- [ ] **Step 4: Legg `.env` til `.gitignore`**

Legg til linjen `.env` under "Logg/temp"-seksjonen i `.gitignore` (`.env.example` skal committes, `.env` skal ikke).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: prosjektoppsett for ordre-API (deps, env, gitignore)"
```

---

## Task 2: Databaseskjema

**Files:**
- Create: `db/schema.sql`

- [ ] **Step 1: Skriv DDL**

```sql
-- Kjøres manuelt mot Neon (Task 9). Idempotent.
create extension if not exists "pgcrypto";

create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  site           text not null,
  product        text,
  config         jsonb not null default '{}'::jsonb,
  preferred_date date,
  name           text not null,
  phone          text not null,
  email          text not null,
  address        text,
  price_nok      integer,
  utm            jsonb not null default '{}'::jsonb,
  notify         jsonb not null default '{}'::jsonb,
  status         text not null default 'new'
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_site_idx on orders (site);
```

- [ ] **Step 2: Commit**

```bash
git add db/schema.sql
git commit -m "feat: orders-tabell DDL for Neon"
```

---

## Task 3: Validering (ren modul, TDD)

**Files:**
- Create: `tests/validate.test.js`
- Create: `api/_lib/validate.js`

- [ ] **Step 1: Skriv den feilende testen**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder } from '../api/_lib/validate.js';

const valid = {
  site: 'skjul', product: '3-dunk Standard', config: { count: 3 },
  preferred_date: '2026-08-15', name: 'Ola', phone: '99887766',
  email: 'ola@example.com', address: 'Storgata 1', price_nok: 12900,
  utm: { utm_source: 'meta' }, hp: ''
};

test('godtar gyldig payload og normaliserer', () => {
  const r = validateOrder(valid);
  assert.equal(r.ok, true);
  assert.equal(r.data.site, 'skjul');
  assert.equal(r.data.email, 'ola@example.com');
  assert.deepEqual(r.data.config, { count: 3 });
});

test('avviser ukjent site', () => {
  const r = validateOrder({ ...valid, site: 'hacker' });
  assert.equal(r.ok, false);
});

test('krever navn, telefon og e-post', () => {
  assert.equal(validateOrder({ ...valid, name: '  ' }).ok, false);
  assert.equal(validateOrder({ ...valid, phone: '' }).ok, false);
  assert.equal(validateOrder({ ...valid, email: '' }).ok, false);
});

test('avviser ugyldig e-postformat', () => {
  assert.equal(validateOrder({ ...valid, email: 'ikke-epost' }).ok, false);
});

test('honeypot utfylt => spam=true', () => {
  const r = validateOrder({ ...valid, hp: 'bot' });
  assert.equal(r.ok, false);
  assert.equal(r.spam, true);
});

test('tomt/ugyldig preferred_date blir null', () => {
  assert.equal(validateOrder({ ...valid, preferred_date: '' }).data.preferred_date, null);
  assert.equal(validateOrder({ ...valid, preferred_date: 'tull' }).data.preferred_date, null);
});

test('manglende valgfrie felt får trygge standardverdier', () => {
  const r = validateOrder({ site: 'ved', name: 'Kari', phone: '123', email: 'k@x.no' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.config, {});
  assert.deepEqual(r.data.utm, {});
  assert.equal(r.data.address, '');
  assert.equal(r.data.price_nok, null);
});
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `node --test tests/validate.test.js`
Expected: FAIL — `Cannot find module '../api/_lib/validate.js'`.

- [ ] **Step 3: Skriv minimal implementasjon**

```js
const SITES = new Set(['orden', 'orden-v2', 'skjul', 'ved']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v) { return typeof v === 'string' ? v.trim() : ''; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

export function validateOrder(input) {
  const b = input && typeof input === 'object' ? input : {};

  // Honeypot: skjult felt skal alltid være tomt. Utfylt => bot.
  if (str(b.hp) !== '') return { ok: false, spam: true, error: 'spam' };

  const site = str(b.site);
  if (!SITES.has(site)) return { ok: false, error: 'ugyldig site' };

  const name = str(b.name);
  const phone = str(b.phone);
  const email = str(b.email);
  if (!name) return { ok: false, error: 'navn påkrevd' };
  if (!phone) return { ok: false, error: 'telefon påkrevd' };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'gyldig e-post påkrevd' };

  const pd = str(b.preferred_date);
  const preferred_date = ISO_DATE_RE.test(pd) ? pd : null;

  const priceRaw = Number(b.price_nok);
  const price_nok = Number.isFinite(priceRaw) && priceRaw >= 0 ? Math.round(priceRaw) : null;

  return {
    ok: true,
    data: {
      site,
      product: str(b.product) || null,
      config: obj(b.config),
      preferred_date,
      name, phone, email,
      address: str(b.address),
      price_nok,
      utm: obj(b.utm)
    }
  };
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `node --test tests/validate.test.js`
Expected: PASS — alle 7 testene grønne.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/validate.js tests/validate.test.js
git commit -m "feat: validering + normalisering av ordre-payload"
```

---

## Task 4: Meldingsmaler (ren modul, TDD)

**Files:**
- Create: `tests/templates.test.js`
- Create: `api/_lib/templates.js`

- [ ] **Step 1: Skriv den feilende testen**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEmail, customerEmail, slackMessage } from '../api/_lib/templates.js';

const order = {
  site: 'skjul', product: '3-dunk Standard', preferred_date: '2026-08-15',
  name: 'Ola Nordmann', phone: '99887766', email: 'ola@example.com',
  address: 'Storgata 1', price_nok: 12900, config: { count: 3 }, utm: {}
};

test('ownerEmail har emne og inneholder kundedata', () => {
  const m = ownerEmail(order);
  assert.match(m.subject, /skjul/i);
  assert.match(m.html, /Ola Nordmann/);
  assert.match(m.html, /99887766/);
  assert.match(m.html, /ola@example.com/);
});

test('ownerEmail escaper HTML i kundeinput', () => {
  const m = ownerEmail({ ...order, name: '<script>x</script>' });
  assert.doesNotMatch(m.html, /<script>x<\/script>/);
  assert.match(m.html, /&lt;script&gt;/);
});

test('customerEmail takker og nevner produkt', () => {
  const m = customerEmail(order);
  assert.match(m.subject, /Roverk/i);
  assert.match(m.html, /3-dunk Standard/);
  assert.match(m.html, /Ola/);
});

test('slackMessage ok-status uten advarsler', () => {
  const s = slackMessage(order, { email_owner: 'ok', email_customer: 'ok' });
  assert.match(s.text, /Ny ordre/);
  assert.match(s.text, /skjul/);
  assert.doesNotMatch(s.text, /⚠️/);
});

test('slackMessage viser advarsel når e-post feilet', () => {
  const s = slackMessage(order, { email_owner: 'ok', email_customer: 'feil: timeout' });
  assert.match(s.text, /⚠️/);
  assert.match(s.text, /kunde/i);
});
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `node --test tests/templates.test.js`
Expected: FAIL — `Cannot find module '../api/_lib/templates.js'`.

- [ ] **Step 3: Skriv minimal implementasjon**

```js
function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const SITE_NAVN = { 'orden': 'Orden', 'orden-v2': 'Orden', 'skjul': 'Skjul', 'ved': 'Ved' };

function rows(order) {
  const r = [
    ['Produkt', order.product],
    ['Navn', order.name],
    ['Telefon', order.phone],
    ['E-post', order.email],
    ['Adresse', order.address || '—'],
    ['Ønsket dato', order.preferred_date || '—'],
    ['Pris', order.price_nok != null ? order.price_nok + ' kr' : '—']
  ];
  return r.map(([k, v]) =>
    `<tr><td style="padding:6px 12px;color:#666">${esc(k)}</td><td style="padding:6px 12px;font-weight:600">${esc(v)}</td></tr>`
  ).join('');
}

export function ownerEmail(order) {
  const navn = SITE_NAVN[order.site] || order.site;
  const config = esc(JSON.stringify(order.config || {}, null, 2));
  const utm = esc(JSON.stringify(order.utm || {}, null, 2));
  return {
    subject: `Ny ordre — Roverk ${navn}: ${order.product || ''}`.trim(),
    html: `<h2>Ny ordre (${esc(navn)})</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows(order)}</table>
<p><a href="mailto:${esc(order.email)}">Svar kunden</a> · <a href="tel:${esc(order.phone)}">Ring</a></p>
<h3>Konfig</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px">${config}</pre>
<h3>UTM</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px">${utm}</pre>`
  };
}

export function customerEmail(order) {
  return {
    subject: 'Takk for bestillingen — Roverk AS',
    html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;max-width:520px">
<h2>Takk for bestillingen, ${esc(order.name.split(' ')[0])}!</h2>
<p>Vi har mottatt bestillingen din${order.product ? ` av <strong>${esc(order.product)}</strong>` : ''}.
Vi tar kontakt for å bekrefte detaljer og monteringsdato.</p>
<p><strong>Du betaler først når alt er levert og ferdig montert.</strong></p>
<p style="color:#666;font-size:13px">Har du spørsmål? Bare svar på denne e-posten.</p>
<p style="color:#666;font-size:13px">— Roverk AS</p></div>`
  };
}

export function slackMessage(order, notify) {
  const navn = SITE_NAVN[order.site] || order.site;
  const lines = [
    `:package: *Ny ordre — Roverk ${navn}* (${order.site})`,
    `*Produkt:* ${order.product || '—'}`,
    `*Kunde:* ${order.name} · ${order.phone} · ${order.email}`,
    `*Adresse:* ${order.address || '—'}`,
    `*Ønsket dato:* ${order.preferred_date || '—'}`,
    `*Pris:* ${order.price_nok != null ? order.price_nok + ' kr' : '—'}`
  ];
  const warns = [];
  if (notify.email_owner && notify.email_owner !== 'ok') warns.push(`eier-e-post (${notify.email_owner})`);
  if (notify.email_customer && notify.email_customer !== 'ok') warns.push(`kunde-e-post (${notify.email_customer})`);
  if (warns.length) lines.push(`⚠️ E-post feilet: ${warns.join(', ')}`);
  return { text: lines.join('\n') };
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `node --test tests/templates.test.js`
Expected: PASS — alle 5 testene grønne.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/templates.js tests/templates.test.js
git commit -m "feat: e-post- og Slack-maler (rene byggere)"
```

---

## Task 5: Orkestrering (order-service, TDD med mock-deps)

**Files:**
- Create: `tests/order-service.test.js`
- Create: `api/_lib/order-service.js`

Kontrakt: `handleOrder(data, deps)` der `deps = { insertOrder, updateNotify, sendOwnerEmail, sendCustomerEmail, postSlack }`. Rekkefølge: `insertOrder` (kaster => hele kallet feiler) → e-post (feil fanges) → Slack (kjøres uansett, får notify-status) → `updateNotify`. Returnerer `{ ok, id, notify }`.

- [ ] **Step 1: Skriv den feilende testen**

```js
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
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `node --test tests/order-service.test.js`
Expected: FAIL — `Cannot find module '../api/_lib/order-service.js'`.

- [ ] **Step 3: Skriv minimal implementasjon**

```js
async function tryStep(fn) {
  try { await fn(); return 'ok'; }
  catch (e) { return 'feil: ' + (e?.message || String(e)); }
}

export async function handleOrder(data, deps) {
  // 1. Lagre — MÅ lykkes. Kaster videre hvis DB feiler.
  const id = await deps.insertOrder(data);

  // 2. E-post — feil fanges, stopper ikke flyten.
  const notify = {};
  notify.email_owner = await tryStep(() => deps.sendOwnerEmail(data));
  notify.email_customer = await tryStep(() => deps.sendCustomerEmail(data));

  // 3. Slack — kjøres UANSETT, får e-poststatus med seg.
  notify.slack = await tryStep(() => deps.postSlack(data, notify));

  // 4. Lagre notify-status tilbake på raden (best effort).
  try { await deps.updateNotify(id, notify); } catch (_) { /* logges av kaller */ }

  return { ok: true, id, notify };
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `node --test tests/order-service.test.js`
Expected: PASS — alle 4 testene grønne.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/order-service.js tests/order-service.test.js
git commit -m "feat: ordre-orkestrering med robust varsel-feilhåndtering"
```

---

## Task 6: I/O-adaptere (db, email, slack)

Tynne moduler som snakker med ekte tjenester. Ingen enhetstest (nettverk/eksterne); verifiseres i Task 10.

**Files:**
- Create: `api/_lib/db.js`
- Create: `api/_lib/email.js`
- Create: `api/_lib/slack.js`

- [ ] **Step 1: `api/_lib/db.js`**

```js
import { neon } from '@neondatabase/serverless';

// Lazy init: neon() kaster hvis DATABASE_URL mangler. Å utsette kallet til
// første bruk gjør at modulen kan importeres (syntaks-/CI-sjekk) uten env satt.
let _sql = null;
function sql(strings, ...values) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...values);
}

export async function insertOrder(o) {
  const rows = await sql`
    insert into orders (site, product, config, preferred_date, name, phone, email, address, price_nok, utm)
    values (${o.site}, ${o.product}, ${JSON.stringify(o.config)}, ${o.preferred_date},
            ${o.name}, ${o.phone}, ${o.email}, ${o.address}, ${o.price_nok}, ${JSON.stringify(o.utm)})
    returning id`;
  return rows[0].id;
}

export async function updateNotify(id, notify) {
  await sql`update orders set notify = ${JSON.stringify(notify)} where id = ${id}`;
}
```

- [ ] **Step 2: `api/_lib/email.js`**

```js
import { Resend } from 'resend';
import { ownerEmail, customerEmail } from './templates.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.ORDER_FROM_EMAIL;         // f.eks. "Roverk <ordre@roverk.no>"
const NOTIFY = process.env.NOTIFY_EMAIL;

export async function sendOwnerEmail(order) {
  const m = ownerEmail(order);
  const { error } = await resend.emails.send({
    from: FROM, to: NOTIFY, replyTo: order.email, subject: m.subject, html: m.html
  });
  if (error) throw new Error(error.message || 'resend-feil (owner)');
}

export async function sendCustomerEmail(order) {
  const m = customerEmail(order);
  const { error } = await resend.emails.send({
    from: FROM, to: order.email, replyTo: NOTIFY, subject: m.subject, html: m.html
  });
  if (error) throw new Error(error.message || 'resend-feil (customer)');
}
```

- [ ] **Step 3: `api/_lib/slack.js`**

```js
import { slackMessage } from './templates.js';

export async function postSlack(order, notify) {
  const url = process.env.SLACK_WEBHOOK_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackMessage(order, notify))
  });
  if (!res.ok) throw new Error('slack ' + res.status);
}
```

- [ ] **Step 4: Verifiser at modulene importeres uten syntaksfeil**

Run: `node --input-type=module -e "await import('./api/_lib/slack.js'); console.log('slack ok')"`
Expected: `slack ok` (db/email krever env og treffer nett ved kall, men import skal ikke kaste).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/db.js api/_lib/email.js api/_lib/slack.js
git commit -m "feat: I/O-adaptere for Neon, Resend og Slack"
```

---

## Task 7: HTTP-handler (`api/order.js`)

**Files:**
- Create: `api/order.js`

- [ ] **Step 1: Skriv handleren**

```js
import { validateOrder } from './_lib/validate.js';
import { handleOrder } from './_lib/order-service.js';
import { insertOrder, updateNotify } from './_lib/db.js';
import { sendOwnerEmail, sendCustomerEmail } from './_lib/email.js';
import { postSlack } from './_lib/slack.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  // Vercel Node-funksjoner parser JSON-body automatisk ved application/json.
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});

  const v = validateOrder(body);
  if (!v.ok) {
    // Honeypot-treff: svar 200 så boten ikke lærer, men lagre ingenting.
    if (v.spam) { res.status(200).json({ ok: true }); return; }
    res.status(400).json({ ok: false, error: v.error });
    return;
  }

  try {
    const result = await handleOrder(v.data, {
      insertOrder, updateNotify, sendOwnerEmail, sendCustomerEmail, postSlack
    });
    res.status(200).json({ ok: true, id: result.id });
  } catch (e) {
    console.error('ordre-feil (DB):', e);
    res.status(500).json({ ok: false, error: 'kunne ikke lagre ordre' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
```

- [ ] **Step 2: Verifiser import uten syntaksfeil**

Run: `node --input-type=module -e "await import('./api/order.js'); console.log('handler ok')"`
Expected: `handler ok`.

- [ ] **Step 3: Commit**

```bash
git add api/order.js
git commit -m "feat: /api/order HTTP-handler"
```

---

## Task 8: Frontend — `skjul` og `ved` (order-basert modal)

Begge har `var order={...}`, en `submitOrder()`-funksjon, `canProceed()`, og en e-post-input (`data-f="email"`). Endringene er analoge men feltene i `config`/`product` er sidespesifikke.

**Files:**
- Modify: `skjul/index.html` (`submitOrder` ~line 403, `canProceed` ~line 332, e-post-input i renderForm)
- Modify: `ved/index.html` (`submitOrder` ~line 435, `canProceed` ~line 364, e-post-input i renderForm)

- [ ] **Step 1: Gjør e-post påkrevd i `canProceed` (begge filer)**

`skjul` — endre linje 332 fra:
```js
function canProceed(){return !!order.date&&!!order.name.trim()&&!!order.phone.trim();}
```
til:
```js
function canProceed(){return !!order.date&&!!order.name.trim()&&!!order.phone.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email.trim());}
```

`ved` — samme endring på linje 364 (identisk funksjonskropp).

- [ ] **Step 2: Legg til honeypot-felt i skjemaet (begge filer)**

I `renderForm`-strengen, rett etter `address`-inputen, legg til et skjult honeypot-felt bundet til `order.hp`:
```html
<input data-f="hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
```
Feltet fanges av samme `[data-f]`-binding som allerede finnes (den skriver til `order[...]`). Sørg for at `order`-objektet har `hp:''` (legg til i `var order={...}` i begge filer).

- [ ] **Step 3: Bytt ut `submitOrder()` i `skjul`**

Erstatt hele `submitOrder`-funksjonen (linje 403) med:
```js
function submitOrder(){
  var utm={};try{utm=JSON.parse(localStorage.getItem('ns_utm')||'{}');}catch(e){}
  var product=order.count+'-dunk '+order.serie;
  try{if(window.fbq)fbq('track','Lead',{content_name:product,value:curPrice(),currency:'NOK'});}catch(e){}
  var payload={site:'skjul',product:product,
    config:{count:order.count,serie:order.serie,kledning:order.kledning,montering:order.montering,forankring:order.forankring},
    preferred_date:order.date||null,name:order.name.trim(),phone:order.phone.trim(),
    email:order.email.trim(),address:(order.address||'').trim(),price_nok:curPrice(),utm:utm,hp:order.hp||''};
  order.phase='sending';renderModal();
  fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json();})
    .then(function(){order.phase='done';renderModal();})
    .catch(function(err){if(window.console)console.error('ordre-feil',err);order.phase='error';renderModal();});
}
```

- [ ] **Step 4: Bytt ut `submitOrder()` i `ved`**

Erstatt hele `submitOrder`-funksjonen (linje 435-441) med:
```js
function submitOrder(){
  var s=sizeObj(order.size);
  var utm={};try{utm=JSON.parse(localStorage.getItem('ns_utm')||'{}');}catch(e){}
  var product='Vedskjul '+s.navn;
  try{if(window.fbq)fbq('track','Lead',{content_name:product,value:s.fra,currency:'NOK'});}catch(e){}
  var payload={site:'ved',product:product,
    config:{size:order.size,navn:s.navn,liter:s.liter},
    preferred_date:order.date||null,name:order.name.trim(),phone:order.phone.trim(),
    email:order.email.trim(),address:(order.address||'').trim(),price_nok:s.fra,utm:utm,hp:order.hp||''};
  order.phase='sending';renderModal();
  fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json();})
    .then(function(){order.phase='done';renderModal();})
    .catch(function(err){if(window.console)console.error('ordre-feil',err);order.phase='error';renderModal();});
}
```

- [ ] **Step 5: Håndter `sending`- og `error`-fasene i `renderModal` (begge filer)**

I `renderModal` finnes en `body`-utvelging basert på `order.phase` (`'form'`/`'confirm'`/`'done'`). Legg til to grener før `done`-grenen brukes, f.eks. der `body` settes:
```js
if(order.phase==='sending')body='<div style="padding:44px 26px;text-align:center"><div style="font-family:\'Archivo\';font-weight:800;font-size:20px">Sender bestilling…</div></div>';
else if(order.phase==='error')body='<div style="padding:36px 26px;text-align:center"><div style="font-family:\'Archivo\';font-weight:900;font-size:24px;margin-bottom:10px">Noe gikk galt 😟</div><p style="font-size:15px;color:'+C.muted+';margin:0 auto 22px;max-width:400px">Vi fikk ikke registrert bestillingen. Prøv igjen, eller ring oss på <a href="tel:+4700000000">telefon</a>.</p><button data-act="confirm" style="background:'+C.green+';color:#fff;border:none;border-radius:999px;padding:13px 28px;font-weight:700;cursor:pointer">Prøv igjen</button></div>';
```
(`data-act="confirm"` gjenbruker den eksisterende bindingen som kaller `submitOrder`.)

- [ ] **Step 6: Manuell verifisering (dekket i Task 10) — commit nå**

```bash
git add skjul/index.html ved/index.html
git commit -m "feat: koble skjul- og ved-modal til /api/order (+ påkrevd e-post, honeypot)"
```

---

## Task 9: Frontend — `orden` og `orden-v2` (state-basert modal)

Begge bruker `var state={...}` med `o_name`/`o_phone`/`o_email`/`o_address`, `orderDate`, `state.bt` (byggetype) og dimensjoner, og en inline `confirmOrder`-handler (`state.orderPhase='done'`). Det finnes ingen `submitOrder`-funksjon — vi lager en og kaller den fra handleren.

**Files:**
- Modify: `orden/index.html` (`confirmOrder`-handler ~line 1071, `canProceed` ~line 885, e-post-input `data-field="o_email"`)
- Modify: `orden-v2/index.html` (`confirmOrder`-handler ~line 1048, `canProceed` ~line 885, e-post-input `data-field="o_email"`)

- [ ] **Step 1: Gjør e-post påkrevd i `canProceed` (begge filer)**

Endre fra:
```js
function canProceed(){ return !!state.orderDate && !!state.o_name.trim() && !!state.o_phone.trim(); }
```
til:
```js
function canProceed(){ return !!state.orderDate && !!state.o_name.trim() && !!state.o_phone.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.o_email.trim()); }
```

- [ ] **Step 2: Legg til honeypot i skjemaet + `state.o_hp` (begge filer)**

Rett etter `o_address`-inputen i modal-HTML-strengen, legg til:
```html
<input data-field="o_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
```
Legg `o_hp:''` til i `state`-objektet (linje ~516). Bekreft at eksisterende `[data-field]`-binding skriver til `state[...]`.

- [ ] **Step 3: Lag en `submitOrder()`-funksjon (begge filer)**

Legg til (f.eks. rett før `canProceed`). Merk: `orden` bruker samme `priceFor`/`state.bt`-modell — bygg produkt og pris fra tilgjengelige `state`-felt. Bruk `lastShownPrice` for pris (settes i `applyPriceAnim`), fall tilbake til `null`:
```js
function buildOrderPayload(){
  var utm={};try{utm=JSON.parse(localStorage.getItem('ns_utm')||'{}');}catch(e){}
  var price=(typeof lastShownPrice==='number')?lastShownPrice:null;
  var product='Orden '+(state.bt||'')+(state.orderKind==='quote'?' (tilbud)':'');
  return {site:SITE_ID,product:product.trim(),
    config:{bt:state.bt,orderKind:state.orderKind},
    preferred_date:state.orderDate||null,name:state.o_name.trim(),phone:state.o_phone.trim(),
    email:state.o_email.trim(),address:(state.o_address||'').trim(),price_nok:price,utm:utm,hp:state.o_hp||''};
}
function submitOrder(){
  try{if(window.fbq)fbq('track','Lead',{content_name:'Orden',currency:'NOK'});}catch(e){}
  state.orderPhase='sending';renderModal();
  fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(buildOrderPayload())})
    .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json();})
    .then(function(){state.orderPhase='done';renderModal();})
    .catch(function(err){if(window.console)console.error('ordre-feil',err);state.orderPhase='error';renderModal();});
}
```
Legg til `var SITE_ID='orden';` i `orden/index.html` og `var SITE_ID='orden-v2';` i `orden-v2/index.html` (nær `state`-definisjonen).

- [ ] **Step 4: Kall `submitOrder()` fra `confirmOrder`-handleren (begge filer)**

Endre handleren fra:
```js
else if(act==='confirmOrder'){ node.addEventListener('click', function(){ state.orderPhase='done'; renderModal(); }); }
```
til:
```js
else if(act==='confirmOrder'){ node.addEventListener('click', submitOrder); }
```

- [ ] **Step 5: Håndter `sending`/`error`-fasene i `renderModal` (begge filer)**

Der `renderModal` velger innhold basert på `state.orderPhase`, legg til grener for `'sending'` og `'error'` (samme mønster som Task 8 Step 5, men med `state.orderPhase` og `C`-fargevariablene i denne filen). `error`-grenen skal ha en knapp med `data-act="confirmOrder"` slik at «Prøv igjen» kaller `submitOrder` på nytt.

- [ ] **Step 6: Commit**

```bash
git add orden/index.html orden-v2/index.html
git commit -m "feat: koble orden + orden-v2 til /api/order (+ påkrevd e-post, honeypot)"
```

---

## Task 10: Tjenesteoppsett + ende-til-ende-verifisering

Dette krever handlinger i nettleseren (Neon, Resend, Slack, Vercel) — utføres av deg/brukeren, ikke automatisk. Verifiserer hele flyten mot ekte tjenester.

- [ ] **Step 1: Opprett Neon-database**

Via Vercel Marketplace (anbefalt, auto-setter `DATABASE_URL`) eller neon.tech. Kjør `db/schema.sql` i Neon SQL Editor. Verifiser: `select * from orders;` returnerer tom tabell uten feil.

- [ ] **Step 2: Sett opp Resend + domene**

Opprett Resend-konto, legg til domenet `roverk.no`, legg SPF/DKIM-DNS-oppføringene Resend oppgir inn hos DNS-leverandøren. Vent til status = "Verified". Lag API-nøkkel → `RESEND_API_KEY`. Sett `ORDER_FROM_EMAIL="Roverk <ordre@roverk.no>"`.

- [ ] **Step 3: Opprett Slack incoming webhook**

Slack → Apps → Incoming Webhooks → lag webhook for kanalen `#ordre`. Kopier URL → `SLACK_WEBHOOK_URL`.

- [ ] **Step 4: Legg secrets i Vercel**

I Vercel-prosjektet (Settings → Environment Variables), legg til `DATABASE_URL`, `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, `NOTIFY_EMAIL`, `ORDER_FROM_EMAIL` for Production + Preview. For lokal test: `vercel env pull .env`.

- [ ] **Step 5: Kjør alle enhetstester**

Run: `npm test`
Expected: alle testene i `tests/` grønne (validate + templates + order-service).

- [ ] **Step 6: Lokal ende-til-ende med `vercel dev`**

Run: `npx vercel dev` (krever `vercel link` mot prosjektet først).
Åpne `http://localhost:3000/skjul/`, fyll ut modalen, send. Verifiser i rekkefølge:
- Modalen viser «Bestilling mottatt».
- Ny rad i Neon (`select * from orders order by created_at desc limit 1;`) med riktig `config`/`utm` og `notify` = `{"email_owner":"ok","email_customer":"ok","slack":"ok"}`.
- E-post mottatt på `NOTIFY_EMAIL` og på kunde-adressen.
- Melding i `#ordre` på Slack.

- [ ] **Step 7: Verifiser feilhåndtering**

Test at Slack fanger e-postfeil: midlertidig sett en ugyldig `ORDER_FROM_EMAIL`, send en testordre, bekreft at ordren fortsatt lagres, at Slack-meldingen viser ⚠️-linjen, og at `notify.email_*` inneholder feilteksten. Tilbakestill etterpå.

- [ ] **Step 8: Verifiser honeypot**

Run:
```bash
curl -s -X POST http://localhost:3000/api/order -H 'Content-Type: application/json' \
  -d '{"site":"skjul","name":"Bot","phone":"1","email":"b@x.no","hp":"fylt"}'
```
Expected: `{"ok":true}` men INGEN ny rad i `orders` (honeypot avviste stille).

- [ ] **Step 9: Deploy til produksjon**

Run: `npx vercel --prod`
Send en ekte testordre fra hver av de fire sidene i produksjon, bekreft DB-rad + e-post + Slack for hver. Slett testradene etterpå ved behov.

---

## Self-Review-notat

- **Spec-dekning:** DB-lagring (Task 2, 6), eier-e-post + kundekvittering (Task 4, 6), Slack (Task 4, 6), feilhåndtering med Slack-som-varsler + `notify`-felt (Task 5), e-post påkrevd (Task 8, 9), honeypot (Task 3, 8, 9), fire sider koblet (Task 8, 9), miljøvariabler/oppsett (Task 1, 10). Alle spec-punkter har en oppgave.
- **Grensesnitt-konsistens:** `validateOrder`→`{ok,data,spam,error}`, `handleOrder(data,deps)`, deps-navn (`insertOrder/updateNotify/sendOwnerEmail/sendCustomerEmail/postSlack`) og `notify`-nøkler (`email_owner/email_customer/slack`) er like i alle tasks (5, 6, 7) og templates (4).
- **Payload-kontrakt** er identisk i alle fire frontends (Task 8, 9) og i valideringen (Task 3).
