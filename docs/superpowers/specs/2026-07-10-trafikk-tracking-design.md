# Trafikk-tracking (GDPR-vennlig) — design

*Dato: 2026-07-10*

## Mål

Få oversikt over trafikken på Roverks nettsider (`roverk.no` + `/orden`, `/skjul`,
`/ved`) og spore de viktigste konverteringene — uten cookie-banner og innenfor GDPR.

Dekker:
- **Mål 1 (oversikt):** besøkende, sidevisninger, referrer, land, enhet.
- **Mål 2 (konvertering):** to custom events — `bestilling_start` og `bestilling_sendt`.

## Valgt løsning

**Vercel Web Analytics** (cookieless) + custom events. Sidene er statisk HTML på ett
Vercel-prosjekt, så dette er nærmest null ekstra infrastruktur og ingen ny databehandler
utover Vercel, som allerede er i bruk.

Alternativer vurdert og forkastet: Plausible/Simple Analytics (ny leverandør + fast
kostnad), egen tracking i Neon (mest å bygge/vedlikeholde, GDPR-ansvar flyttes til oss).
Kan legges til senere som supplement uten å rive dette.

### Hvorfor ingen cookie-banner

Vercel Web Analytics er cookieless og lagrer ingen personopplysninger (aggregert,
besøkende-ID hashes og roteres). Uten lagring på enheten og uten PII utløses verken
ePrivacy/ekomlovens samtykkekrav for cookies eller samtykkekrav under GDPR. Banner er
derfor ikke nødvendig.

## Komponenter

### 1. Sidevisning-script (alle 4 sider)

Vercels offisielle snutt for statisk HTML, lagt i `<head>` på `index.html`,
`orden/index.html`, `skjul/index.html`, `ved/index.html`:

```html
<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};</script>
<script defer src="/_vercel/insights/script.js"></script>
```

Eksakt `script.js`-sti bekreftes mot Vercel-dashboardet etter at Web Analytics er skrudd
på (Vercel kan bruke en unik sti for å unngå ad-blockere; `/_vercel/insights/script.js`
er standard).

### 2. Delt event-hjelper — `lib/track.js`

Én liten fil som eksponerer `window.Roverk.track(navn, data)`:

- Pakker `window.va('event', { name, data })`.
- Trygg no-op hvis `window.va` ikke finnes (f.eks. i utvikling, ad-blocker, eller før
  scriptet er lastet) — skal aldri kaste feil eller blokkere brukerflyt.
- Sentraliserer event-navn så de er like på tvers av alle sider.

Lastes med `<script src="/lib/track.js"></script>` på de sidene som har konverteringer
(orden, skjul, ved). Følger samme mønster som eksisterende `lib/address-autocomplete.js`.

### 3. Konverterings-events

| Event | Utløses når | data |
|-------|-------------|------|
| `bestilling_start` | Bestillingsmodalen åpnes | `{ produkt }` |
| `bestilling_sendt` | Vellykket `POST /api/order` (success-grenen) | `{ produkt, verdi }` (verdi i NOK) |

Innhekting per side:
- **orden:** `bestilling_start` når modalen åpnes (der `state.orderOpen` settes / modal
  rendres første gang); `bestilling_sendt` i `.then()`-suksessgrenen i `submitOrder()`
  (samme sted som dagens `state.orderPhase='done'`).
- **skjul / ved:** tilsvarende punkter (ved siden av dagens dødvekt-`fbq('track','Lead')`).

`verdi` hentes fra den beregnede totalen som allerede finnes i bestillingsflyten
(`computeVals().total` på orden; tilsvarende pris-variabel på skjul/ved).

### 4. Meta Pixel — sovende, urørt

Dagens `fbq`-stub og de tomme `fbq('track',...)`-kallene beholdes uendret. `fbevents.js`
lastes ikke (utkommentert på ved/skjul, fraværende på orden). **Pixelen aktiveres ikke.**
Å skru den på betyr cookies + dataoverføring til Meta i USA og vil kreve samtykkeløsning —
et bevisst, separat prosjekt, ikke en del av dette arbeidet.

UTM/`fbclid`-lagring i `localStorage` på `ved` (`ns_utm`) beholdes som i dag: førstepart,
lav risiko, ingen deling før eventuelt skjema sendes.

### 5. Personvernerklæring — ny side `/personvern`

Statisk `personvern/index.html` i Roverk-profil (samme header/footer-mønster som øvrige
sider). Innhold:

- Roverk AS som behandlingsansvarlig (kontaktinfo; org.nr. fylles inn av bruker).
- At Vercel Web Analytics brukes: aggregert, cookieless, ingen personopplysninger lagres,
  Vercel som databehandler.
- At ingen cookies settes, og at banner derfor ikke brukes.
- De registrertes rettigheter (innsyn, sletting, klage til Datatilsynet).

Lenkes fra footeren på `index`, `orden`, `skjul`, `ved`.

## Manuelt steg (utføres av bruker)

Skru på **Web Analytics** for prosjektet i Vercel-dashbordet — aktiverer
`/_vercel/insights/*`-rutene ved neste deploy. Kan ikke gjøres fra denne økten.
Custom events (`bestilling_*`) krever **Vercel Pro/Enterprise**; sidevisninger fungerer
på alle planer.

## Testing / verifikasjon

- Bekreft at `script.js` lastes uten 404 på hver side (Network-fane / preview-verktøy).
- Bekreft at et `POST` til `/_vercel/insights/view` skjer ved sidelast.
- Bekreft at `Roverk.track()` sender `/_vercel/insights/event` ved modal-åpning og
  vellykket bestilling (kan trigges lokalt ved å stubbe `window.va`).
- Bekreft at manglende `window.va` ikke kaster feil (no-op).
- Verifiser at `/personvern` rendres og er lenket fra alle footere.

## Avgrensning (YAGNI)

- Ingen egen dashboard/rapportering — Vercels innebygde dashboard brukes.
- Ingen Speed Insights, heatmaps eller individuell brukersporing.
- Ingen kobling mot markedsføringssystemet i denne omgang.
- Meta Pixel aktiveres ikke.
