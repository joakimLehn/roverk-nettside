# Nettsider – hosting på Vercel

*Sist oppdatert: 2026-07-08*

Mål: flere nettsider (én per produkt) under **ett** Roverk-domene, med felles merkevare.

## Dagens utgangspunkt

Tre ferdige nettsider finnes i den gamle mappen, alle som **statisk HTML** (én `index.html`
med innebygd CSS), fortsatt «Nordic Storage»-brandet:

- `nettside/` → Roverk Orden
- `soppelkasseskur/` → Roverk Skjul
- `vedskjul/` → Roverk Ved

De må rebrandes (tekst, farger til Roverk-profil, ny logo) før publisering.

## Aktuelle måter å strukturere flere sider under ett domene

| Modell | URL-eksempel | Passer når | Kompleksitet |
|--------|-------------|-----------|--------------|
| **A. Én side, sti per produkt** | `roverk.no/orden`, `/skjul`, `/ved` | Enkelt, felles nav, statisk | Lav |
| **B. Subdomene per produkt** | `orden.roverk.no` | Hver side lever sitt eget liv | Middels |
| **C. Monorepo (Turborepo) + delt UI** | valgfritt (sti eller subdomene) | Mange sider, mye delt kode, vil vokse | Høyere |

> Anbefaling avhenger av om sidene forblir enkle statiske sider (da holder modell A i ett
> Vercel-prosjekt) eller skal bygges om til Next.js med delte komponenter (modell C).
> **Dette valget er ikke tatt ennå** – se spørsmål i chatten.

## Viktig: kode vs. Dropbox

Kildekode for nettsider bør ligge i et **Git-repo** (GitHub) koblet til Vercel, ikke synkes
løst i Dropbox — særlig hvis vi går over til Next.js (da lager `node_modules` og bygg mye
støy som ikke skal i Dropbox). Denne mappen brukes til å samle designunderlag og
ferdige eksporter; selve repoet lever i Git.

Statisk HTML kan i prinsippet ligge her, men også de bør inn i Git for versjonshistorikk
og automatisk deploy.

## Valgt modell: sti per produkt

Ett Vercel-prosjekt serverer hele `03-Nettsider/`. Hver produktside ligger i egen mappe og
blir en sti på domenet:

```
03-Nettsider/
├── index.html        → roverk.no         ✅ forside (binder produktene sammen)
├── vercel.json       (cleanUrls + cache-headers for statisk hosting)
├── assets/           (delte forside-assets: logo, favicon, om-oss.jpg)
├── orden/            → roverk.no/orden   ✅ rebrandet
│   ├── index.html
│   └── assets/
├── skjul/            → roverk.no/skjul   ✅ rebrandet
│   ├── index.html
│   └── assets/
└── ved/              → roverk.no/ved     ✅ rebrandet
    ├── index.html
    └── assets/
```

## Status per side

| Side | Sti | Status |
|------|-----|--------|
| **Orden** | `/orden` | ✅ Rebrandet til Roverk-profil (svart/hvit/gull), ny logo-lockup, favicon, «Bygget for orden». |
| **Skjul** | `/skjul` | ✅ Rebrandet (samme profil + logofiler). Produktlabel «Skjul». |
| **Ved** | `/ved` | ✅ Rebrandet (samme profil + logofiler). Produktlabel «Ved». |
| **Forside** | `/` | ✅ Laget. Hero + 3 produktkort (→ /orden, /skjul, /ved) + om oss + slik funker det + kontakt. |

Alle sidene er testet lokalt (launch-config «roverk»): navigasjon forside → produktsider fungerer, logoer/favicon laster, ingen JS-feil.
De gamle Nordic Storage-nettsidene er flyttet til `../99-Arkiv-NordicStorage/` (backup).

## Roverk-profil brukt (Orden)

- Palett (CSS `:root` + JS `C{}`): `--bg:#F4F2ED · --text:#141310 · --amber:#BE8A48 (gull) · --green:#17150F (sort CTA) · --heroBg:#0E0D0B (sort) · --wood:#A9743B`
- Logo: **ekte logofiler** brukt (transparente PNG-er generert fra JPEG-ene):
  - Header (lys): `assets/roverk-wordmark-sort.png` (svart ROVERK + gull «Orden»)
  - Footer (mørk): `assets/roverk-ordmerke-hvit.png` (hvit lockup m/ «BYGGET FOR ORDEN» innebygd)
  - Favicon: `assets/roverk-favicon.png` (R-ikonet tett innzoomet, svart bunn)
- Transparente master-logoer ligger i `00-Merkevare/Logo/` (`.png`, hvit + sort) og `00-Merkevare/Ikon/` (gull, tett).

## ⚠️ Plassholdere som må fylles inn (gjaldt også original)

- Telefonnummer (`tel:+4700000000`)
- E-post (satt til `post@roverk.no` – bekreft at denne finnes)
- Org.nr i footer

## Kjøre lokalt

Serveres statisk via launch-config **«roverk»** (python http.server på port 4180, mappe `03-Nettsider`).
Åpne `http://localhost:4180/orden/`.

## Neste steg

1. Rebrand `skjul/` og `ved/` etter samme mal.
2. Lag forside (`index.html`) som binder produktene sammen.
3. Opprett Git-repo (anbefalt utenfor Dropbox), koble til Vercel, sett opp domenet.
4. Fyll inn ekte kontaktinfo før publisering.
