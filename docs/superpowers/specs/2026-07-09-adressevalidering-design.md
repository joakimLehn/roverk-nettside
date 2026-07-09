# Adressevalidering med Kartverket — designspec

**Dato:** 2026-07-09
**Status:** Godkjent design, klar for implementasjonsplan

## Bakgrunn

Ordremodalen på de fire sidene (`orden`, `orden-v2`, `skjul`, `ved`) har i dag et
valgfritt fritekst-adressefelt. Vi vil gjøre adresse **påkrevd** og gi ekte
adressevalidering tilpasset Norge, slik at ordredata inneholder korrekt adresse
med postnummer/poststed/kommune for leveranseplanlegging.

## Mål

1. Adresse er påkrevd for å kunne sende en bestilling (alle fire sider).
2. Autocomplete mot Kartverket/Geonorge mens kunden skriver — kunden velger en
   ekte adresse fra lista.
3. Ved valg lagres strukturert adresse (postnr, poststed, kommune, koordinater).
4. Fritekst-fallback: hvis adressen ikke finnes i registeret (nybygg, enkelte
   grender) kan kunden likevel skrive den inn — markeres som uverifisert. Vi
   mister aldri et salg.
5. Eier-varsel (e-post + Slack) viser full adresse + postnr/poststed, med en
   markør når adressen er uverifisert.

## Ikke-mål (YAGNI)

- Ingen server-side re-oppslag mot Kartverket ved innsending (det er ingen
  betaling; adressen er visnings-/leveransedata, ikke transaksjonskritisk).
- Ingen proxy/backend for adressesøket (CORS er åpent, se under).
- Ingen kart-visning eller ruteberegning fra koordinatene nå (koordinatene lagres
  for eventuell fremtidig bruk).

## Datakilde

Kartverket/Geonorge adresse-søk:
`https://ws.geonorge.no/adresser/v1/sok?sok=<query>&treffPerSide=8&asciiKompatibel=true`

- Offisielt norsk adresseregister (matrikkelen). Gratis, ingen API-nøkkel.
- Verifisert live: returnerer strukturert treff med `adressetekst`, `postnummer`,
  `poststed`, `kommunenummer`, `kommunenavn`, `representasjonspunkt` (lat/lon).
- CORS: svarer med `Access-Control-Allow-Origin: *` → nettleseren kan kalle det
  direkte. Ingen proxy nødvendig.

## Arkitektur

Nettleseren kaller Geonorge direkte, debounced (~250 ms) mens kunden skriver.
Ingen ny serverless-funksjon. Degraderer pent: hvis Geonorge er tregt/nede, kan
kunden fortsatt skrive fritekst (fallback).

### Delt autocomplete-widget

Ny fil `assets/address-autocomplete.js` (servert fra rot: `/assets/address-autocomplete.js`),
inkludert via `<script src>` på alle fire sidene. Tilstands-agnostisk og gjenbrukbar:

- **Init:** `initAddressAutocomplete(inputEl, { onSelect, onInput })`.
- Fester en debounced input-lytter, henter fra Geonorge, rendrer en nedtrekksliste
  (adressetekst + poststed), håndterer tastaturnavigasjon (pil opp/ned, Enter,
  Escape) og museklikk.
- `onSelect(structured)` kalles når kunden velger et treff. `structured` =
  `{ adressetekst, postnummer, poststed, kommunenummer, kommunenavn, lat, lon }`.
- `onInput(text)` kalles ved fritekst-endring (uten valg).
- Nøytral styling (inline/injisert) som passer alle fire sidene.

Grunn: debounce/fetch/dropdown/tastaturlogikk er identisk på tvers av sidene —
én velbundet enhet gjenbrukt 4× er bedre enn å duplisere den. Hver side leverer
kun limet mot sin egen state.

### Integrasjon per side

Sidene har ulike tilstandsmodeller:
- `skjul`/`ved`: `order.address` (+ nytt `order.addressMeta`)
- `orden`/`orden-v2`: `state.o_address` (+ nytt `state.o_addressMeta`)

Hver side:
- Kaller `initAddressAutocomplete` på adresse-inputen når modalen rendres.
- `onSelect`: lagrer full `adressetekst` i adressefeltet og hele det strukturerte
  objektet + `verified:true` i addressMeta.
- `onInput`: oppdaterer adressetekst, setter `verified:false` (uverifisert
  fritekst) og nullstiller strukturerte felt.
- Gjør adresse påkrevd i `canProceed()` (ikke-tom).
- Sender med `address_meta` i payloaden til `/api/order`.

## Datamodell (én migrering)

`address`-kolonnen beholder den fulle adressestrengen (uendret).
Ny kolonne:

```sql
alter table orders add column if not exists address_meta jsonb not null default '{}'::jsonb;
```

`address_meta` = `{ postnummer, poststed, kommunenummer, kommunenavn, lat, lon, verified }`.
`verified` (boolean) skiller Kartverket-valgt adresse fra fritekst.

## Payload-kontrakt (utvidelse)

Frontends legger til ett felt i POST til `/api/order`:

```json
"address": "Auntrøa 5",
"address_meta": {
  "postnummer": "7560", "poststed": "VIKHAMMER",
  "kommunenummer": "5031", "kommunenavn": "MALVIK",
  "lat": 63.4303, "lon": 10.6046, "verified": true
}
```

## Server-validering (`api/_lib/validate.js`)

- `address` gjøres **påkrevd** (avvis tom med feilmelding, på linje med
  name/phone/email).
- `address_meta`: tas imot som valgfritt objekt, normaliseres/whitelistes til de
  kjente feltene (ukjente felt forkastes). `verified` tvinges til boolean.
  Manglende `address_meta` → `{ verified: false }`.
- Vi stoler ikke blindt på klientens strukturerte data, men gjør ingen
  nettverksoppslag server-side (visningsdata, ikke transaksjonskritisk).

## Varsler (`api/_lib/templates.js`)

- Eier-e-post: adresserad viser full adresse; ny rad viser `postnr poststed`
  (fra `address_meta`) når tilgjengelig. Hvis `verified:false`, vis
  «⚠️ uverifisert adresse».
- Slack: adresse-linja utvides tilsvarende med postnr/poststed og ⚠️-markør ved
  uverifisert.
- Kunde-e-post: uendret (nevner ikke adressedetaljer).

## Testing

- `validate.test.js`: nye tester — tom adresse avvises; gyldig `address_meta`
  normaliseres; ukjente felt i `address_meta` forkastes; manglende `address_meta`
  gir `verified:false`.
- `templates.test.js`: nye tester — postnr/poststed vises i eier-e-post/Slack når
  tilgjengelig; ⚠️-markør vises ved `verified:false`.
- Autocomplete-widgeten testes manuelt i nettleser (nettverksavhengig UI); logikk
  som kan isoleres (f.eks. parsing av Geonorge-respons til `structured`) legges i
  en ren funksjon og enhetstestes.

## Avklarte valg

- **UX:** autocomplete-nedtrekksliste mot Kartverket.
- **Strenghet:** oppfordre til valg fra lista, men tillat fritekst-fallback
  (uverifisert markeres).
- **Datakilde:** Kartverket/Geonorge direkte fra nettleser (CORS åpent).
- **Lagring:** full adressestreng i `address`, strukturert i nytt `address_meta`
  jsonb.
- **Koordinater:** lagres, men brukes ikke visuelt nå.
