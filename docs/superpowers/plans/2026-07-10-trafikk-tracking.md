# Trafikk-tracking (GDPR-vennlig) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cookieless Vercel Web Analytics (page views + two conversion events) and a privacy policy page across the four static Roverk sites, with no cookie banner and no changes to the dormant Meta Pixel.

**Architecture:** Each static HTML page gets Vercel's page-view snippet in `<head>`. A shared `lib/track.js` exposes `window.Roverk.track(name, data)` — a safe wrapper around `window.va('event', …)` that no-ops if analytics is absent. The three product pages call it at two points: when the order modal opens (`bestilling_start`) and on a successful `POST /api/order` (`bestilling_sendt`). A new `/personvern` page documents the (anonymous, cookieless) analytics and is linked from every footer.

**Tech Stack:** Static HTML + vanilla ES5-style browser JS (matches existing pages), Vercel Web Analytics, `node --test` for the one unit-testable unit (`lib/track.js`).

**Reference spec:** `docs/superpowers/specs/2026-07-10-trafikk-tracking-design.md`

---

### Task 1: Shared event helper `lib/track.js` (TDD)

**Files:**
- Create: `lib/track.js`
- Test: `tests/track.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/track.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// track.js is a browser IIFE that attaches to window; set up a fake window,
// then import it for its side effects.
globalThis.window = {};
await import('../lib/track.js');

test('exposes Roverk.track', () => {
  assert.equal(typeof globalThis.window.Roverk.track, 'function');
});

test('forwards to window.va as an event', () => {
  const calls = [];
  globalThis.window.va = (...args) => calls.push(args);
  globalThis.window.Roverk.track('bestilling_sendt', { produkt: 'Orden', verdi: 4990 });
  assert.deepEqual(calls, [
    ['event', { name: 'bestilling_sendt', data: { produkt: 'Orden', verdi: 4990 } }],
  ]);
});

test('defaults data to empty object', () => {
  const calls = [];
  globalThis.window.va = (...args) => calls.push(args);
  globalThis.window.Roverk.track('bestilling_start');
  assert.deepEqual(calls, [['event', { name: 'bestilling_start', data: {} }]]);
});

test('is a safe no-op when window.va is missing', () => {
  globalThis.window.va = undefined;
  assert.doesNotThrow(() => globalThis.window.Roverk.track('x', { a: 1 }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/track.js'` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/track.js`:

```js
/* Roverk – delt event-hjelper for Vercel Web Analytics.
   Roverk.track(navn, data) sender et custom event via window.va.
   Trygg no-op hvis analytics ikke er lastet (utvikling, ad-blocker, før last). */
(function () {
  "use strict";
  var root = (typeof window !== 'undefined') ? window : globalThis;
  function track(name, data) {
    try {
      if (root.va && typeof root.va === 'function') {
        root.va('event', { name: name, data: data || {} });
      }
    } catch (e) { /* aldri blokker brukerflyt */ }
  }
  root.Roverk = root.Roverk || {};
  root.Roverk.track = track;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all four `track.test.js` assertions green (existing `order-service`/`templates`/`validate` tests still pass too).

- [ ] **Step 5: Commit**

```bash
git add lib/track.js tests/track.test.js
git commit -m "feat: shared Roverk.track helper for Vercel Web Analytics events"
```

---

### Task 2: Page-view snippet in all four `<head>`s

**Files:**
- Modify: `index.html` (before `</head>`)
- Modify: `orden/index.html` (before `</head>`)
- Modify: `skjul/index.html` (before `</head>`)
- Modify: `ved/index.html` (before `</head>`)

- [ ] **Step 1: Insert the snippet before `</head>` in each of the four files**

Insert exactly this block immediately before the `</head>` tag in each file:

```html
  <!-- Vercel Web Analytics (cookieless, ingen PII) -->
  <script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};</script>
  <script defer src="/_vercel/insights/script.js"></script>
```

Do this for all four files. (`</head>` is the unique anchor in each.)

- [ ] **Step 2: Verify insertion**

Run: `grep -rc "_vercel/insights/script.js" index.html orden/index.html skjul/index.html ved/index.html`
Expected: each file reports `1`.

- [ ] **Step 3: Commit**

```bash
git add index.html orden/index.html skjul/index.html ved/index.html
git commit -m "feat: add Vercel Web Analytics page-view snippet to all pages"
```

---

### Task 3: Load `track.js` + wire conversion events on `orden`

**Files:**
- Modify: `orden/index.html`

- [ ] **Step 1: Load the helper after the existing address-autocomplete script**

Find this line in `orden/index.html`:

```html
<script src="/lib/address-autocomplete.js"></script>
```

Add immediately after it:

```html
<script src="/lib/track.js"></script>
```

- [ ] **Step 2: Fire `bestilling_start` when the modal opens**

Find in `requestQuote()`:

```js
  state.orderPhase='date'; state.orderOpen=true;
```

Replace with:

```js
  state.orderPhase='date'; state.orderOpen=true;
  try{if(window.Roverk)Roverk.track('bestilling_start',{produkt:'Orden'});}catch(e){}
```

- [ ] **Step 3: Fire `bestilling_sendt` on successful order**

Find in `submitOrder()`:

```js
    .then(function(){state.orderPhase='done';renderModal();})
```

Replace with:

```js
    .then(function(){try{if(window.Roverk)Roverk.track('bestilling_sendt',{produkt:'Orden',verdi:computeVals().total});}catch(e){}state.orderPhase='done';renderModal();})
```

- [ ] **Step 4: Verify wiring**

Run: `grep -c "Roverk.track" orden/index.html`
Expected: `2`.
Run: `grep -c "/lib/track.js" orden/index.html`
Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add orden/index.html
git commit -m "feat: track bestilling_start/bestilling_sendt on orden"
```

---

### Task 4: Load `track.js` + wire conversion events on `skjul`

**Files:**
- Modify: `skjul/index.html`

- [ ] **Step 1: Load the helper after the existing address-autocomplete script**

Find:

```html
<script src="/lib/address-autocomplete.js"></script>
```

Add immediately after it:

```html
<script src="/lib/track.js"></script>
```

- [ ] **Step 2: Fire `bestilling_start` when the modal opens**

Find the `openOrder` function:

```js
function openOrder(count){if(count)order.count=count;order.phase='form';document.body.style.overflow='hidden';renderModal(true);}
```

Replace with:

```js
function openOrder(count){if(count)order.count=count;try{if(window.Roverk)Roverk.track('bestilling_start',{produkt:order.count+'-dunk '+order.serie});}catch(e){}order.phase='form';document.body.style.overflow='hidden';renderModal(true);}
```

- [ ] **Step 3: Fire `bestilling_sendt` on successful order**

In `submitOrder()` the local `product` and function `curPrice()` are already in scope. Find:

```js
    .then(function(){order.phase='done';renderModal();})
```

Replace with:

```js
    .then(function(){try{if(window.Roverk)Roverk.track('bestilling_sendt',{produkt:product,verdi:curPrice()});}catch(e){}order.phase='done';renderModal();})
```

- [ ] **Step 4: Verify wiring**

Run: `grep -c "Roverk.track" skjul/index.html`
Expected: `2`.
Run: `grep -c "/lib/track.js" skjul/index.html`
Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add skjul/index.html
git commit -m "feat: track bestilling_start/bestilling_sendt on skjul"
```

---

### Task 5: Load `track.js` + wire conversion events on `ved`

**Files:**
- Modify: `ved/index.html`

- [ ] **Step 1: Load the helper after the existing address-autocomplete script**

Find:

```html
<script src="/lib/address-autocomplete.js"></script>
```

Add immediately after it:

```html
<script src="/lib/track.js"></script>
```

- [ ] **Step 2: Fire `bestilling_start` when the modal opens**

Find the `openOrder` function:

```js
function openOrder(sizeId){order.size=sizeId||order.size;order.phase='form';document.body.style.overflow='hidden';renderModal();}
```

Replace with:

```js
function openOrder(sizeId){order.size=sizeId||order.size;try{if(window.Roverk){var _s=sizeObj(order.size);Roverk.track('bestilling_start',{produkt:'Vedskjul '+_s.navn});}}catch(e){}order.phase='form';document.body.style.overflow='hidden';renderModal();}
```

- [ ] **Step 3: Fire `bestilling_sendt` on successful order**

In `submitOrder()` the local `product` and `s` (from `sizeObj(order.size)`) are already in scope. Find:

```js
    .then(function(){order.phase='done';renderModal();})
```

Replace with:

```js
    .then(function(){try{if(window.Roverk)Roverk.track('bestilling_sendt',{produkt:product,verdi:s.fra});}catch(e){}order.phase='done';renderModal();})
```

- [ ] **Step 4: Verify wiring**

Run: `grep -c "Roverk.track" ved/index.html`
Expected: `2`.
Run: `grep -c "/lib/track.js" ved/index.html`
Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add ved/index.html
git commit -m "feat: track bestilling_start/bestilling_sendt on ved"
```

---

### Task 6: Privacy policy page `/personvern`

**Files:**
- Create: `personvern/index.html`

Behandlingsansvarlig data (from existing footers): Roverk (en del av Utler Entreprenør AS),
org.nr 946 511 277, e-post `ordre@roverk.no`, tlf 901 86 693.

- [ ] **Step 1: Create the page**

Create `personvern/index.html`:

```html
<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Personvern – Roverk</title>
  <meta name="robots" content="index,follow">
  <link rel="icon" href="/assets/favicon.png">
  <style>
    :root{--bg:#F4F2ED;--card:#FBFAF7;--text:#141310;--muted:#6E685E;--line:#E4DFD5;--green:#17150F;}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.65}
    .wrap{max-width:760px;margin:0 auto;padding:56px 24px 80px}
    a{color:var(--text)}
    h1{font-size:32px;margin:0 0 6px}
    h2{font-size:19px;margin:34px 0 8px}
    p,li{color:var(--text);font-size:16px}
    .muted{color:var(--muted);font-size:14px}
    .back{display:inline-block;margin-bottom:28px;font-size:14px;text-decoration:none;color:var(--muted)}
    .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-top:16px}
  </style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="/">← Til forsiden</a>
    <h1>Personvernerklæring</h1>
    <p class="muted">Sist oppdatert: 10. juli 2026</p>

    <h2>Behandlingsansvarlig</h2>
    <p>Roverk (en del av Utler Entreprenør AS), org.nr 946 511 277.<br>
       E-post: <a href="mailto:ordre@roverk.no">ordre@roverk.no</a> · Telefon: 901 86 693</p>

    <h2>Trafikkmåling</h2>
    <p>Vi bruker <strong>Vercel Web Analytics</strong> for å forstå hvordan nettsidene våre
       brukes – for eksempel hvor mange som besøker en side, hvilke sider som besøkes, og
       omtrentlig geografi og enhetstype. Målingen er <strong>anonym og aggregert</strong>:
       vi kan ikke identifisere deg som enkeltperson gjennom den.</p>
    <div class="card">
      <p style="margin:0"><strong>Ingen informasjonskapsler (cookies).</strong> Vercel Web
      Analytics setter ingen cookies og lagrer ingen personopplysninger på enheten din.
      Derfor viser vi heller ingen «cookie-banner» – det er ikke nødvendig.</p>
    </div>
    <p>I tillegg registrerer vi anonyme hendelser når noen åpner bestillingsskjemaet eller
       fullfører en bestilling, slik at vi kan se hvor godt sidene fungerer. Disse hendelsene
       inneholder ingen navn, kontaktopplysninger eller annen informasjon som kan spores til deg.</p>
    <p>Vercel Inc. er databehandler for denne målingen. Les mer hos
       <a href="https://vercel.com/docs/analytics/privacy-policy" rel="noopener" target="_blank">Vercel</a>.</p>

    <h2>Når du bestiller</h2>
    <p>Når du sender inn en bestilling eller forespørsel, behandler vi opplysningene du oppgir
       (navn, telefon, e-post, adresse og valgt produkt) for å kunne levere og montere
       produktet og kontakte deg om bestillingen. Behandlingsgrunnlaget er å oppfylle avtalen
       med deg. Vi deler ikke disse opplysningene med andre enn underleverandører som er
       nødvendige for leveransen, og vi oppbevarer dem ikke lenger enn nødvendig.</p>

    <h2>Dine rettigheter</h2>
    <p>Du har rett til innsyn i, retting av og sletting av opplysningene vi har om deg, og til
       å klage til <a href="https://www.datatilsynet.no" rel="noopener" target="_blank">Datatilsynet</a>.
       Ta kontakt på <a href="mailto:ordre@roverk.no">ordre@roverk.no</a> hvis du ønsker å bruke
       rettighetene dine.</p>
  </div>
</body>
</html>
```

- [ ] **Step 2: Verify the page exists**

Run: `test -f personvern/index.html && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add personvern/index.html
git commit -m "feat: add /personvern privacy policy page"
```

---

### Task 7: Link `/personvern` from every footer

**Files:**
- Modify: `index.html`
- Modify: `orden/index.html`
- Modify: `skjul/index.html`
- Modify: `ved/index.html`

Each footer's bottom bar contains the identical text
`© 2026 Roverk – en del av Utler Entreprenør AS · Org.nr 946 511 277`. This exact string
appears once per file (the bottom bar), so it is a safe anchor.

- [ ] **Step 1: Append a Personvern link in each of the four files**

In each file, find:

```
© 2026 Roverk – en del av Utler Entreprenør AS · Org.nr 946 511 277</div>
```

Replace with:

```
© 2026 Roverk – en del av Utler Entreprenør AS · Org.nr 946 511 277 · <a href="/personvern" style="color:inherit">Personvern</a></div>
```

Do this for all four files.

- [ ] **Step 2: Verify insertion**

Run: `grep -rc "href=\"/personvern\"" index.html orden/index.html skjul/index.html ved/index.html`
Expected: each file reports `1`.

- [ ] **Step 3: Commit**

```bash
git add index.html orden/index.html skjul/index.html ved/index.html
git commit -m "feat: link /personvern from all footers"
```

---

### Task 8: End-to-end verification in the browser preview

**Files:** none (verification only)

> Note: `/_vercel/insights/*` routes only exist once Web Analytics is enabled in the Vercel
> dashboard and the project is deployed, so `script.js` will 404 on a purely local static
> server — that is expected. The point of this task is to confirm the wiring runs without
> errors and that `Roverk.track` fires with the right payload; the safe no-op means a 404 on
> `script.js` must not break anything.

- [ ] **Step 1: Serve the site and open a product page**

Ensure a static dev server is running for the repo root (use `preview_start`; if
`.claude/launch.json` has no static-server entry, add one that serves the folder, e.g.
`npx serve` on the project root). Open `/orden`.

- [ ] **Step 2: Confirm no console errors from analytics/track**

Use `preview_console_logs` (level `error`). Expected: no errors mentioning `va`, `Roverk`,
or `track`. A failed request for `/_vercel/insights/script.js` is acceptable (see note).

- [ ] **Step 3: Confirm `Roverk.track` fires on modal open**

In the preview, stub the analytics sink and open the order modal, then read the captured
event via `preview_eval`:

```js
(function(){ window.__ev=[]; window.va=function(){window.__ev.push([].slice.call(arguments));};
  var b=document.querySelector('[data-act="requestQuote"]')||document.querySelector('a[href="#konfigurator"]');
  return b ? 'cta-found' : 'cta-missing'; })()
```

Then trigger the configurator's "be om tilbud"/order action through the UI (`preview_click`)
and evaluate `window.__ev`. Expected: an entry
`['event', {name:'bestilling_start', data:{produkt:'Orden'}}]` appears.

- [ ] **Step 4: Confirm the no-op safety**

Via `preview_eval`, run with analytics absent:

```js
(function(){ delete window.va; try{ window.Roverk.track('x',{a:1}); return 'no-throw'; }catch(e){ return 'THREW: '+e.message; } })()
```

Expected: `"no-throw"`.

- [ ] **Step 5: Confirm the personvern page renders and is linked**

Open `/personvern`; use `preview_snapshot` to confirm the "Personvernerklæring" heading and
the "Ingen informasjonskapsler" text are present. On `/orden`, confirm the footer contains a
"Personvern" link pointing to `/personvern` (`preview_snapshot` or `preview_inspect`).

- [ ] **Step 6: Capture proof and finish**

Take a `preview_screenshot` of `/personvern`. No commit (verification only). Report results.

---

## Post-implementation (manual, by the user — outside this plan)

1. Enable **Web Analytics** for the project in the Vercel dashboard (adds `/_vercel/insights/*`
   routes on next deploy).
2. Confirm the plan is **Pro/Enterprise** so the two custom events are recorded (page views
   work on all plans).
3. Deploy, then verify a `POST /_vercel/insights/view` fires on page load and a
   `/_vercel/insights/event` fires on a real test order.
