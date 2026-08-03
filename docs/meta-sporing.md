# Meta-sporing på roverk.no

Pixel/dataset: `2847699825597498` (én pixel for hele roverk.no, segmentert med
`content_ids` = `orden` | `ved` | `skjul`).

## Rotårsaken som ble fikset (3. august 2026)

`skjul/index.html` og `ved/index.html` hadde en gammel plassholder-stub fra
NordicStorage-malen liggende igjen i `<head>`:

```js
window.fbq = window.fbq || function(){ (window.fbq.q=window.fbq.q||[]).push(arguments); };
```

Metas offisielle snippet starter med `if (f.fbq) return;`. Stuben gjorde altså at
`lib/meta.js` aldri fikk lastet `fbevents.js`: ingen `init`, ingen `PageView`, og
alle events – ViewContent, Lead, Purchase – havnet i køen `window.fbq.q` som
ingen leser. `/orden` hadde ingen stub og fungerte.

Det forklarer tallene i Ads Manager presist: landingssidevisninger/lenkeklikk var
**85 %** på kampanjene mot `/orden` og **0,6–1,4 %** på salgskampanjene mot
`/skjul` og `/ved`.

Regresjonstesten `tests/meta.test.js` → «bootstraps the real pixel even when a
placeholder fbq stub is present» feiler mot den gamle koden og består mot den nye.

**Ikke gjeninnfør en `window.fbq`-stub i noen HTML-fil.** Bruk `RoverkMeta.*`.

## Hendelsesmodell

Roverk tar ikke betalt på nett – kunden betaler etter montering. Hovedkonverteringen
er derfor `Lead`, ikke `Purchase`.

| Hendelse | Når | Hvor |
|---|---|---|
| `PageView` | Hver sidevisning, alle ruter inkl. blogg | `lib/meta.js` |
| `ViewContent` | Produktside lastet, med `value` + `currency` | `lib/meta.js` (krever `__ROVERK_META_PRODUCT`) |
| `CustomizeProduct` | Konfigurator på `/orden` endret første gang | `orden/index.html` → `cfgTouched()` |
| `InitiateCheckout` | Bestillingsmodal åpnet | `openOrder()` / `requestQuote()` |
| **`Lead`** | **Bestilling sendt – etter 200 fra `/api/order`** | suksess-callback i `submitOrder()` + CAPI |
| `CompleteRegistration` | Myk lead: konfig sendt på e-post | `submitShareEmail()` + CAPI |
| `Contact` | Klikk på `tel:` / `mailto:` | delegert lytter i `lib/meta.js` |
| `Purchase` | **Ikke i bruk.** Se under. | – |

`Lead` fyres i suksess-callbacken, ikke på knappeklikk – ellers telles avbrutte
skjemaer som konverteringer.

### Dedup nettleser ↔ server

`RoverkMeta.orderCtx()` genererer én `event_id` som både sendes med
`fbq('track', …, { eventID })` og legges på API-payloaden, slik at
`api/_lib/meta-capi.js` speiler hendelsen med samme id. Metas dedup-vindu er
48 timer på `event_name` + `event_id`.

Server-side er den pålitelige kanalen: nettleserpixelens kall til
`facebook.com/tr` blokkeres av annonseblokkere og sporingsvern.

### Avansert matching

Både `lib/meta.js` og `api/_lib/meta-capi.js` hasher `em, ph, fn, ln, ct, zp,
country` (+ `external_id` server-side) med SHA-256. **Normaliseringen må holdes
identisk i de to filene**, ellers matcher ikke nettleser- og server-hendelsen
samme person. Tester i `tests/meta.test.js` og `tests/meta-capi.test.js` låser
begge sider mot samme forventede hash.

Aldri PII i klartekst til Meta.

## Samtykke

Ingenting lastes fra Meta før brukeren har trykket «Godta» (localStorage
`roverk_meta_consent`). CAPI sender heller ingenting uten samtykke – server-side
sporing er ikke en omvei rundt kravet. «Endre samtykke» ligger på `/personvern`.

`fbclid` mellomlagres i `sessionStorage` (ingen varig lagring uten samtykke) og
skrives til `_fbc`-cookien først ved samtykke. Uten dette mistes attribusjonen,
fordi pixelen typisk lastes på en senere sidevisning der `fbclid` er borte.

Skjer annonseklikket og samtykket i **ulike økter**, er sessionStorage borte.
Da faller `ensureFbcCookie()` tilbake på `fbclid` som den eksisterende
UTM-fangsten allerede har lagret i localStorage `ns_utm` (kun lesing – ingenting
nytt lagres). En `_fbc` pixelen selv har satt overskrives aldri.

**`fbc` = 0 % dekning i Events Manager er normalt for testhendelser.** `_fbc`
kan bare finnes for besøkende som faktisk kom fra et annonseklikk med `fbclid`
i URL-en. Går du selv rett til `www.roverk.no/skjul` finnes det ingen klikk-ID,
og feltet blir tomt. Det er **ikke** et redirect-problem: `fbclid` er verifisert
å overleve hele kjeden `http://roverk.no/x` → `https://roverk.no/x` →
`https://www.roverk.no/x`, også med trailing slash.

## Miljøguard

Pixelen fyrer bare på `roverk.no` / `www.roverk.no`. På localhost og
Vercel-preview skjer ingenting (i juli 2026 forurenset localhost-events
datasettet).

`?metatest=1` utenfor produksjon gir **tørrkjøring**: hele flyten kjører og
hendelsene kan inspiseres i `window.__ROVERK_META_DRYRUN`, men `fbevents.js`
lastes aldri og ingenting sendes til Meta. Slik testes sporingen uten å kunne
forurense datasettet.

```js
// i konsollen på http://localhost:PORT/skjul/?metatest=1
window.__ROVERK_META_DRYRUN.map(a => Array.from(a))
```

## Miljøvariabler (Vercel, server-side)

| Variabel | Påkrevd | Rolle |
|---|---|---|
| `META_CAPI_TOKEN` | Ja for CAPI | System-user-token. Uten den hopper CAPI over (`skipped: 'no-token'`). |
| `META_PIXEL_ID` | Nei | Overstyrer pixel-ID. Faller tilbake på `2847699825597498`. |
| `META_CAPI_TEST_CODE` | Nei | Ruter CAPI-events til Events Manager → Test-hendelser. **Ikke sett i produksjon.** |

## Purchase – ikke koblet opp

`sendCapiPurchase()` finnes i `api/_lib/meta-capi.js` med
`action_source: 'other'`, men er ikke koblet til noen rute. Det finnes ingen flyt
som setter `orders.status` fra `new` til fullført, så det er ingenting å trigge på.

Når et ordresystem finnes: kall `sendCapiPurchase()` ved statusendring til
montert/fullført, med `external_id` fra samme e-post som den opprinnelige `Lead`.
Alternativt last opp fullførte ordre som offline event set. **Aldri fra
nettleseren** – det finnes ingen betaling der.

## Manuelle steg i Meta/Vercel (utenfor koden)

1. `META_CAPI_TOKEN` i Vercel (Production).
2. Domeneverifisering av roverk.no i Business Manager → Brand safety → Domains.
   `<meta name="facebook-domain-verification">` ligger i `index.html` – **ikke fjern den**.
3. Aggregated Event Measurement: prioriter `Lead` øverst.
4. Kampanjemål: bytt fra `OUTCOME_SALES` / Purchase-optimalisering til
   lead-optimalisering mot `Lead`. Salgskampanjene optimaliserte mot en hendelse
   Meta aldri mottok.
5. `SubscribedButtonClick` er Metas automatisk detekterte knappehendelse – støy.
   Ikke bygg konverteringer på den.
6. Ikke pek annonser mot `http://roverk.no/...`. Bruk `https://www.roverk.no/{orden|skjul|ved}`
   direkte. Redirect-kjeden bevarer `fbclid` (verifisert), men hvert hopp koster.

## Verifisering

```bash
npm test                       # 75 tester, inkl. regresjonstest for stub-buggen
```

Etter deploy, i Events Manager: `PageView` skal vises for alle fire hovedsider
under «Event source URLs» (ikke bare forsiden), `Lead` skal ha volum > 0 innen
24 timer, og CAPI-hendelser skal vises som «Server» og dedupliseres.

Den viktigste testen står i Ads Manager: lenkeklikk → landingssidevisning skal
over 70 % på **alle** aktive annonsesett. Før fiksen: 85 % på to, 0,6–1,4 % på tre.
