# Adressevalidering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjøre adresse påkrevd i ordremodalen på alle fire sider og gi autocomplete-validering mot Kartverket/Geonorge, med strukturert adresse (postnr/poststed/kommune/koordinater) lagret i `orders.address_meta` og synlig i eier-varslene.

**Architecture:** En delt, tilstands-agnostisk nettleserwidget (`assets/address-autocomplete.js`) kaller Geonorge direkte (CORS åpent), rendrer en nedtrekksliste og rapporterer valg via callbacks. Hver side kobler callbacken til sin egen state. Server-siden gjør adresse påkrevd og normaliserer `address_meta` (ingen server-side nettverksoppslag). En ny nullable jsonb-kolonne lagrer strukturert adresse.

**Tech Stack:** Statisk HTML + vanilla JS (nettleser, ingen byggesteg), Kartverket/Geonorge REST-API, Neon Postgres, Node `node:test`. Bakenforliggende ordre-API fra forrige leveranse (`api/_lib/*`, `api/order.js`).

---

## Kontekst-fakta (verifisert)

- Modalen re-rendrer IKKE ved skriving i tekstfelt: `[data-f]`/`[data-field]`-handleren
  skriver til state på `input`-event uten `renderModal()`. Widgeten kan derfor feste
  seg én gang per form-render og eie sin egen dropdown.
- Adresse-input: `skjul`/`ved` bruker `data-f="address"` → `order.address`;
  `orden`/`orden-v2` bruker `data-field="o_address"` → `state.o_address`.
- Geonorge: `https://ws.geonorge.no/adresser/v1/sok?sok=<q>&treffPerSide=8&asciiKompatibel=true`
  returnerer `{adresser:[{adressetekst,postnummer,poststed,kommunenummer,kommunenavn,representasjonspunkt:{lat,lon}}]}`.
  Svarer `Access-Control-Allow-Origin: *`.
- Delt asset: rot-`assets/` serveres på `/assets/...` for alle sider (absolutt sti),
  og `vercel.json` cacher `/assets/(.*)`.

## File Structure

**Nye filer:**
- `assets/address-autocomplete.js` — nettleserwidget (DOM + fetch + dropdown + tastatur). Én ansvar: adresse-autocomplete.

**Endrede filer:**
- `db/schema.sql` — legg til `address_meta`-kolonne.
- `api/_lib/validate.js` — adresse påkrevd + normaliser `address_meta`.
- `tests/validate.test.js` — oppdater én eksisterende test + legg til nye.
- `api/_lib/db.js` — insert `address_meta`.
- `api/_lib/templates.js` — postnr/poststed + ⚠️ uverifisert i eier-e-post & Slack.
- `tests/templates.test.js` — nye tester.
- `orden/index.html`, `orden-v2/index.html`, `skjul/index.html`, `ved/index.html` — inkluder widget, init på adressefelt, adresse påkrevd, `address_meta` i payload.

## Payload-utvidelse

Frontends legger til `address_meta` i POST til `/api/order`:
```json
"address": "Auntrøa 5",
"address_meta": { "postnummer":"7560","poststed":"VIKHAMMER","kommunenummer":"5031","kommunenavn":"MALVIK","lat":63.4303,"lon":10.6046,"verified":true }
```

---

## Task 1: Migrering — `address_meta`-kolonne

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Legg til kolonne i `db/schema.sql`**

Etter `notify jsonb ...`-linja i `create table`-blokka, legg til kolonnen i tabellen OG en idempotent `alter` for eksisterende databaser. Endre `db/schema.sql` slik at den fulle filen blir:

```sql
-- Kjøres manuelt mot Neon. Idempotent.
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
  address_meta   jsonb not null default '{}'::jsonb,
  price_nok      integer,
  utm            jsonb not null default '{}'::jsonb,
  notify         jsonb not null default '{}'::jsonb,
  status         text not null default 'new'
);

-- For databaser opprettet før address_meta ble lagt til:
alter table orders add column if not exists address_meta jsonb not null default '{}'::jsonb;

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_site_idx on orders (site);
```

- [ ] **Step 2: Commit**

```bash
git add db/schema.sql
git commit -m "feat: legg til address_meta-kolonne i orders-skjema"
```

(Migreringen kjøres mot Neon i Task 8.)

---

## Task 2: `validate.js` — adresse påkrevd + `address_meta`

**Files:**
- Modify: `api/_lib/validate.js`
- Modify: `tests/validate.test.js`

- [ ] **Step 1: Oppdater eksisterende test og legg til nye (skriv testene først)**

I `tests/validate.test.js`: den eksisterende testen `'manglende valgfrie felt får trygge standardverdier'` sender IKKE adresse og forventer `ok:true`. Adresse blir nå påkrevd, så den må oppdateres. Erstatt HELE den testen med denne oppdaterte + tre nye tester:

```js
test('manglende valgfrie felt får trygge standardverdier', () => {
  const r = validateOrder({ site: 'ved', name: 'Kari', phone: '123', email: 'k@x.no', address: 'Storgata 1' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.config, {});
  assert.deepEqual(r.data.utm, {});
  assert.equal(r.data.price_nok, null);
  assert.deepEqual(r.data.address_meta, { postnummer: null, poststed: null, kommunenummer: null, kommunenavn: null, lat: null, lon: null, verified: false });
});

test('tom adresse avvises', () => {
  const base = { site: 'skjul', name: 'Ola', phone: '1', email: 'o@x.no' };
  assert.equal(validateOrder({ ...base }).ok, false);
  assert.equal(validateOrder({ ...base, address: '   ' }).ok, false);
  assert.equal(validateOrder({ ...base, address: 'Storgata 1' }).ok, true);
});

test('address_meta normaliseres og whitelistes', () => {
  const r = validateOrder({
    site: 'skjul', name: 'Ola', phone: '1', email: 'o@x.no', address: 'Auntrøa 5',
    address_meta: { postnummer: '7560', poststed: 'VIKHAMMER', kommunenummer: '5031', kommunenavn: 'MALVIK', lat: 63.43, lon: 10.6, verified: true, evilExtra: 'x' }
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.address_meta.postnummer, '7560');
  assert.equal(r.data.address_meta.poststed, 'VIKHAMMER');
  assert.equal(r.data.address_meta.verified, true);
  assert.equal(r.data.address_meta.lat, 63.43);
  assert.equal(r.data.address_meta.evilExtra, undefined);
});

test('address_meta.verified tvinges til boolean', () => {
  const r = validateOrder({
    site: 'skjul', name: 'Ola', phone: '1', email: 'o@x.no', address: 'Auntrøa 5',
    address_meta: { verified: 'ja' }
  });
  assert.equal(r.data.address_meta.verified, false);
});
```

Behold `valid`-objektet øverst i fila; merk at det allerede har `address: 'Storgata 1'`, så de øvrige testene som bruker `valid` fortsatt passerer.

- [ ] **Step 2: Kjør testene — verifiser at de feiler**

Run: `node --test tests/validate.test.js`
Expected: FAIL — `address_meta` finnes ikke ennå, og adresse er ikke påkrevd (flere assertions feiler).

- [ ] **Step 3: Implementer i `api/_lib/validate.js`**

Legg til en `normAddressMeta`-hjelper og bruk den. Konkret: rett etter `obj`-hjelperen, legg til:

```js
function normAddressMeta(v) {
  const m = obj(v);
  const lat = Number(m.lat), lon = Number(m.lon);
  return {
    postnummer: str(m.postnummer) || null,
    poststed: str(m.poststed) || null,
    kommunenummer: str(m.kommunenummer) || null,
    kommunenavn: str(m.kommunenavn) || null,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    verified: m.verified === true
  };
}
```

Gjør adresse påkrevd — rett etter e-post-sjekken (`if (!email || !EMAIL_RE.test(email)) ...`) legg til:

```js
  const address = str(b.address);
  if (!address) return { ok: false, error: 'adresse påkrevd' };
```

I retur-objektets `data`, endre `address`-linja og legg til `address_meta`. Bytt ut:
```js
      address: str(b.address),
```
med:
```js
      address,
      address_meta: normAddressMeta(b.address_meta),
```

- [ ] **Step 4: Kjør testene — verifiser at de passerer**

Run: `node --test tests/validate.test.js`
Expected: PASS — alle tester grønne (de gamle + fire nye/oppdaterte).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/validate.js tests/validate.test.js
git commit -m "feat: gjør adresse påkrevd + normaliser address_meta"
```

---

## Task 3: `db.js` — lagre `address_meta`

**Files:**
- Modify: `api/_lib/db.js`

- [ ] **Step 1: Legg `address_meta` inn i insert**

I `insertOrder`, endre INSERT-setningen til å inkludere `address_meta`. Bytt ut hele `insertOrder`-funksjonen med:

```js
export async function insertOrder(o) {
  const rows = await sql`
    insert into orders (site, product, config, preferred_date, name, phone, email, address, address_meta, price_nok, utm)
    values (${o.site}, ${o.product}, ${JSON.stringify(o.config)}, ${o.preferred_date},
            ${o.name}, ${o.phone}, ${o.email}, ${o.address}, ${JSON.stringify(o.address_meta || {})},
            ${o.price_nok}, ${JSON.stringify(o.utm)})
    returning id`;
  return rows[0].id;
}
```

- [ ] **Step 2: Verifiser import uten syntaksfeil**

Run: `node --input-type=module -e "await import('./api/_lib/db.js'); console.log('db ok')"`
Expected: `db ok`.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/db.js
git commit -m "feat: lagre address_meta i insertOrder"
```

---

## Task 4: `templates.js` — vis postnr/poststed + ⚠️ uverifisert

**Files:**
- Modify: `api/_lib/templates.js`
- Modify: `tests/templates.test.js`

- [ ] **Step 1: Skriv de feilende testene (legg til i `tests/templates.test.js`)**

Legg til disse testene (behold de eksisterende):

```js
const orderMeta = {
  ...order,
  address_meta: { postnummer: '7560', poststed: 'VIKHAMMER', kommunenummer: '5031', kommunenavn: 'MALVIK', lat: 63.43, lon: 10.6, verified: true }
};

test('ownerEmail viser postnr og poststed når tilgjengelig', () => {
  const m = ownerEmail(orderMeta);
  assert.match(m.html, /7560/);
  assert.match(m.html, /VIKHAMMER/);
});

test('ownerEmail viser advarsel ved uverifisert adresse', () => {
  const m = ownerEmail({ ...order, address_meta: { verified: false } });
  assert.match(m.html, /uverifisert/i);
});

test('ownerEmail uten advarsel når verifisert', () => {
  const m = ownerEmail(orderMeta);
  assert.doesNotMatch(m.html, /uverifisert/i);
});

test('slackMessage viser postnr/poststed og uverifisert-markør', () => {
  const okMsg = slackMessage(orderMeta, { email_owner: 'ok', email_customer: 'ok' });
  assert.match(okMsg.text, /7560/);
  assert.match(okMsg.text, /VIKHAMMER/);
  assert.doesNotMatch(okMsg.text, /uverifisert/i);
  const unv = slackMessage({ ...order, address_meta: { verified: false } }, { email_owner: 'ok', email_customer: 'ok' });
  assert.match(unv.text, /uverifisert/i);
});
```

- [ ] **Step 2: Kjør testene — verifiser at de feiler**

Run: `node --test tests/templates.test.js`
Expected: FAIL — postnr/poststed og uverifisert-markør finnes ikke ennå.

- [ ] **Step 3: Implementer i `api/_lib/templates.js`**

Legg til en hjelper for adressevisning og bruk den i `rows`, `ownerEmail` og `slackMessage`.

Rett etter `esc`-funksjonen, legg til:
```js
function addrLine(order) {
  const m = order.address_meta || {};
  const post = [m.postnummer, m.poststed].filter(Boolean).join(' ');
  return (order.address || '—') + (post ? ', ' + post : '');
}
function addrUnverified(order) {
  const m = order.address_meta;
  // Uverifisert kun når adresse finnes OG address_meta ble satt (lookup forsøkt)
  // men ikke valgt fra Kartverket. Mangler address_meta helt (eldre ordre) → ikke flagg.
  return !!(order.address && m && m.verified !== true);
}
```

I `rows(order)`, bytt ut adresse-raden:
```js
    ['Adresse', order.address || '—'],
```
med:
```js
    ['Adresse', addrLine(order) + (addrUnverified(order) ? '  ⚠️ uverifisert' : '')],
```

I `slackMessage`, bytt ut adresse-linja:
```js
    `*Adresse:* ${order.address || '—'}`,
```
med:
```js
    `*Adresse:* ${addrLine(order)}${addrUnverified(order) ? '  ⚠️ uverifisert' : ''}`,
```

- [ ] **Step 4: Kjør testene — verifiser at de passerer**

Run: `node --test tests/templates.test.js`
Expected: PASS — alle tester grønne.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/templates.js tests/templates.test.js
git commit -m "feat: vis postnr/poststed + uverifisert-markør i eier-varsler"
```

---

## Task 5: Autocomplete-widget

**Files:**
- Create: `assets/address-autocomplete.js`

Nettleser-only modul (bruker `document`/`fetch`). Testes manuelt i Task 8. Skriv den komplett.

- [ ] **Step 1: Opprett `assets/address-autocomplete.js`**

```js
/* Delt adresse-autocomplete mot Kartverket/Geonorge. Tilstands-agnostisk.
   Bruk: initAddressAutocomplete(inputEl, { onSelect(structured), onInput(text) }) */
(function () {
  var ENDPOINT = 'https://ws.geonorge.no/adresser/v1/sok';

  function mapItem(a) {
    var p = a.representasjonspunkt || {};
    return {
      adressetekst: a.adressetekst || '',
      postnummer: a.postnummer || '',
      poststed: a.poststed || '',
      kommunenummer: a.kommunenummer || '',
      kommunenavn: a.kommunenavn || '',
      lat: typeof p.lat === 'number' ? p.lat : null,
      lon: typeof p.lon === 'number' ? p.lon : null
    };
  }

  window.initAddressAutocomplete = function (input, opts) {
    opts = opts || {};
    if (!input || input.__aaInit) return;   // idempotent per element
    input.__aaInit = true;
    input.setAttribute('autocomplete', 'off');

    // Nedtrekksliste i normal flyt rett etter inputen (unngår overflow-klipping i modal).
    var box = document.createElement('div');
    box.style.cssText = 'display:none;margin-top:4px;border:1px solid #ddd;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.12)';
    input.insertAdjacentElement('afterend', box);

    var items = [], active = -1, timer = null, lastQuery = '';

    function close() { box.style.display = 'none'; box.innerHTML = ''; items = []; active = -1; }

    function render() {
      if (!items.length) { close(); return; }
      box.innerHTML = '';
      items.forEach(function (it, i) {
        var row = document.createElement('div');
        row.textContent = it.adressetekst + (it.poststed ? '  ·  ' + it.postnummer + ' ' + it.poststed : '');
        row.style.cssText = 'padding:10px 12px;cursor:pointer;font-size:14px;' + (i === active ? 'background:#f0f0f0' : '');
        row.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
        box.appendChild(row);
      });
      box.style.display = 'block';
    }

    function choose(i) {
      var it = items[i]; if (!it) return;
      input.value = it.adressetekst;
      close();
      if (opts.onSelect) opts.onSelect(it);
    }

    function search(q) {
      var url = ENDPOINT + '?sok=' + encodeURIComponent(q) + '&treffPerSide=8&asciiKompatibel=true';
      fetch(url).then(function (r) { return r.ok ? r.json() : { adresser: [] }; })
        .then(function (data) {
          if (input.value.trim() !== q) return;         // ignorer utdaterte svar
          items = (data.adresser || []).map(mapItem);
          active = -1; render();
        })
        .catch(function () { /* stille: fritekst-fallback dekker */ });
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (opts.onInput) opts.onInput(input.value);
      if (timer) clearTimeout(timer);
      if (q.length < 3) { close(); return; }
      if (q === lastQuery) return;
      lastQuery = q;
      timer = setTimeout(function () { search(q); }, 250);
    });

    input.addEventListener('keydown', function (e) {
      if (box.style.display === 'none') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); choose(active); } }
      else if (e.key === 'Escape') { close(); }
    });

    input.addEventListener('blur', function () { setTimeout(close, 150); });
  };
})();
```

- [ ] **Step 2: Verifiser syntaks**

Run: `node --check assets/address-autocomplete.js`
Expected: ingen output (0 exit) — syntaktisk gyldig.

- [ ] **Step 3: Commit**

```bash
git add assets/address-autocomplete.js
git commit -m "feat: delt adresse-autocomplete-widget (Kartverket)"
```

---

## Task 6: Frontend — `skjul` + `ved`

**Files:**
- Modify: `skjul/index.html`
- Modify: `ved/index.html`

Begge bruker `order.address` og `data-f="address"`. Modalen re-rendrer ikke ved skriving; `bindModal()` kjører hver gang modalen rendres.

- [ ] **Step 1: Inkluder widget-scriptet (begge filer)**

Rett FØR den avsluttende inline `<script>`-blokka (der `var order=...` bor), legg til:
```html
<script src="/assets/address-autocomplete.js"></script>
```

- [ ] **Step 2: Legg `addressMeta` i order-objektet (begge filer)**

I `var order={...}` legg til feltet `addressMeta:{verified:false}` (ved siden av `address:''`, `hp:''`).

- [ ] **Step 3: Gjør adresse påkrevd i `canProceed()` (begge filer)**

`canProceed()` sjekker i dag dato/navn/telefon/e-post. Legg til `&&!!order.address.trim()`. F.eks. for `skjul` blir den:
```js
function canProceed(){return !!order.date&&!!order.name.trim()&&!!order.phone.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email.trim())&&!!order.address.trim();}
```
Gjør samme tillegg (`&&!!order.address.trim()`) i `ved`.

- [ ] **Step 4: Init widget i `bindModal()` (begge filer)**

I `bindModal()`, rett etter `[data-f]`-bindingen (linja `root.querySelectorAll('[data-f]')...`), legg til:
```js
  var addrEl=root.querySelector('[data-f="address"]');
  if(addrEl&&window.initAddressAutocomplete)initAddressAutocomplete(addrEl,{
    onSelect:function(a){order.address=a.adressetekst;order.addressMeta={postnummer:a.postnummer,poststed:a.poststed,kommunenummer:a.kommunenummer,kommunenavn:a.kommunenavn,lat:a.lat,lon:a.lon,verified:true};var p=document.getElementById('proceed');if(p)p.setAttribute('style',proceedStyle());},
    onInput:function(t){order.address=t;order.addressMeta={verified:false};}
  });
```

- [ ] **Step 5: Send `address_meta` i payloaden (begge filer)**

I `submitOrder()`s `payload`-objekt, legg til `address_meta:order.addressMeta||{verified:false}` (ved siden av `address:...`). Behold `address:(order.address||'').trim()`.

- [ ] **Step 6: Oppdater adresse-placeholder (begge filer, valgfritt men anbefalt)**

Adresse-inputens `placeholder` sier i dag «Adresse for montering (valgfritt)». Endre til «Adresse for montering» (fjern «(valgfritt)») siden feltet nå er påkrevd.

- [ ] **Step 7: Verifiser JS-syntaks + commit**

Verifiser at hver fils `<script>`-blokker parser (f.eks. ekstraher og kjør `node --check` eller `new Function(src)`).
```bash
git add skjul/index.html ved/index.html
git commit -m "feat: adresse-autocomplete + påkrevd adresse i skjul/ved"
```

---

## Task 7: Frontend — `orden` + `orden-v2`

**Files:**
- Modify: `orden/index.html`
- Modify: `orden-v2/index.html`

Begge bruker `state.o_address` og `data-field="o_address"`. Finn bind-steget som fester `[data-field]`-lytterne (samme sted som honeypot ble håndtert i forrige leveranse).

- [ ] **Step 1: Inkluder widget-scriptet (begge filer)**

Rett FØR den avsluttende inline `<script>`-blokka (der `var state = {...}` bor), legg til:
```html
<script src="/assets/address-autocomplete.js"></script>
```

- [ ] **Step 2: Legg `o_addressMeta` i state (begge filer)**

I `state`-objektet legg til `o_addressMeta:{verified:false}` (ved siden av `o_address:''`, `o_hp:''`).

- [ ] **Step 3: Gjør adresse påkrevd i `canProceed()` (begge filer)**

Legg til `&& !!state.o_address.trim()` i `canProceed()`:
```js
function canProceed(){ return !!state.orderDate && !!state.o_name.trim() && !!state.o_phone.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.o_email.trim()) && !!state.o_address.trim(); }
```

- [ ] **Step 4: Init widget der `[data-field]`-lytterne festes (begge filer)**

Finn stedet som binder `[data-field]`-inputene (kjøres hver gang skjemaet rendres). Rett etter den bindingen, legg til:
```js
  var addrEl=document.querySelector('[data-field="o_address"]');
  if(addrEl&&window.initAddressAutocomplete)initAddressAutocomplete(addrEl,{
    onSelect:function(a){state.o_address=a.adressetekst;state.o_addressMeta={postnummer:a.postnummer,poststed:a.poststed,kommunenummer:a.kommunenummer,kommunenavn:a.kommunenavn,lat:a.lat,lon:a.lon,verified:true};},
    onInput:function(t){state.o_address=t;state.o_addressMeta={verified:false};}
  });
```
(Hvis bindingen scoper til et rot-element i stedet for `document`, bruk samme scope som de andre `[data-field]`-spørringene i den funksjonen.)

- [ ] **Step 5: Send `address_meta` i payloaden (begge filer)**

I `buildOrderPayload()`, legg til `address_meta:state.o_addressMeta||{verified:false}` (ved siden av `address:...`).

- [ ] **Step 6: Oppdater adresse-placeholder (begge filer)**

Endre adresse-inputens `placeholder` fra «Adresse for montering (valgfritt)» til «Adresse for montering».

- [ ] **Step 7: Verifiser JS-syntaks + commit**

Verifiser at hver fils `<script>`-blokker parser (`node --check` / `new Function(src)`).
```bash
git add orden/index.html orden-v2/index.html
git commit -m "feat: adresse-autocomplete + påkrevd adresse i orden/orden-v2"
```

---

## Task 8: Migrering av prod-DB, deploy + E2E

Krever nettleser/prod-tilgang. Verifiserer hele flyten live.

- [ ] **Step 1: Kjør migreringen mot Neon**

```bash
cd "/Users/joakimlehn/Library/CloudStorage/Dropbox/Roverk AS/03-Nettsider"
DB_UNPOOLED="$(grep '^DATABASE_URL_UNPOOLED=' .env | cut -d= -f2-)"
psql "$DB_UNPOOLED" -v ON_ERROR_STOP=1 -f db/schema.sql
```
Expected: `ALTER TABLE` (kolonnen legges til; øvrige `create ... if not exists` er no-ops). Verifiser: `psql "$DB_UNPOOLED" -c "\d orders"` viser `address_meta jsonb`.

- [ ] **Step 2: Kjør full testsuite**

Run: `npm test`
Expected: alle tester grønne (validate + templates + order-service).

- [ ] **Step 3: Merge til main + deploy**

```bash
git checkout main && git merge feat/adressevalidering --no-ff -m "Merge adressevalidering (Kartverket)"
git push origin main
vercel --prod
```

- [ ] **Step 4: Live-test autocomplete i nettleser**

På `https://www.roverk.no/skjul` (og de tre andre): åpne modalen, begynn å skrive en adresse, bekreft at nedtrekkslista dukker opp med ekte adresser, velg én. Send en testordre. Verifiser i Neon at raden har `address` + `address_meta` med `verified:true` og korrekt postnr/poststed:
```bash
psql "$DB_UNPOOLED" -x -c "select address, address_meta from orders order by created_at desc limit 1;"
```
Bekreft eier-e-post + Slack viser postnr/poststed uten ⚠️.

- [ ] **Step 5: Live-test fritekst-fallback**

Skriv en adresse UTEN å velge fra lista (f.eks. tull-adresse), send. Bekreft at ordren går gjennom, at `address_meta.verified` er `false`, og at eier-e-post/Slack viser «⚠️ uverifisert». Rydd opp testrader:
```bash
psql "$DB_UNPOOLED" -c "delete from orders where name ilike '%test%';"
```

---

## Self-Review-notat

- **Spec-dekning:** påkrevd adresse (Task 2, 6, 7), autocomplete mot Geonorge (Task 5),
  strukturert lagring (Task 1, 3), fritekst-fallback + verified (Task 2, 5, 6, 7),
  postnr/poststed + ⚠️ i varsler (Task 4), delt widget (Task 5), migrering + E2E (Task 8).
- **Grensesnitt-konsistens:** widget-callback gir `{adressetekst,postnummer,poststed,kommunenummer,kommunenavn,lat,lon}`;
  frontends bygger `addressMeta`/`o_addressMeta` med de samme feltene + `verified`;
  payload sender `address_meta`; `validate.normAddressMeta` leser nøyaktig disse feltene;
  `db.insertOrder` lagrer `o.address_meta`; `templates.addrLine`/`addrUnverified` leser `order.address_meta`.
  Alle bruker feltnavnet `verified` (boolean).
- **Eksisterende test oppdatert:** `validate.test.js`-testen som antok valgfri adresse er
  eksplisitt erstattet i Task 2 Step 1 (ellers ville den feilet).
