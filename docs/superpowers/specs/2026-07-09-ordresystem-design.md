# Ordresystem for Roverk-nettsidene — designspec

**Dato:** 2026-07-09
**Status:** Godkjent design, klar for implementasjonsplan

## Bakgrunn

Tre (fire) statiske HTML-landingssider ligger i `03-Nettsider/` og deployes på
Vercel uten framework eller byggesteg:

- `orden` / `orden-v2` — oppbevaringsrack
- `skjul` — søppelkasseskur
- `ved` — vedskjul

Hver side har en bestillingsmodal som allerede samler inn alle nødvendige data,
men `submitOrder()` har i dag bare en stubb (`/* TODO: send til backend/e-post */`)
og setter `order.phase='done'` uten å sende noe.

Målet: lagre ordredata i database, og sende e-postvarsel + Slack-melding ved nye
ordre.

## Mål

1. Alle innkommende ordre lagres varig i Postgres (Neon) — ingen tapte ordre.
2. Varsel-e-post til eier (joakiml@aboveit.no) ved hver ordre.
3. Bekreftelses-e-post (kvittering) til kunden.
4. Slack-melding til én kanal (#ordre) ved hver ordre.
5. Feil i e-post/Slack skal fanges opp og synliggjøres — aldri stille feile.

## Ikke-mål (YAGNI)

- Ingen nettbetaling/forskudd. Forretningsmodellen er "betal etter montering".
- Ingen adminside/ordreoversikt i denne omgang (men datamodellen forberedes for det).
- Ingen stor refaktorering av modal-koden på tvers av sidene.

## Arkitektur

Alt ligger i samme Vercel-prosjekt (`03-Nettsider`). Én serverless-funksjon som
alle sidene poster til:

```
Nettleser (modal)  ──POST /api/order──▶  Vercel Function
                                              │
                                    1. Validér + lagre  ──▶  Neon Postgres  (kilden til sannhet)
                                    2. Send e-post       ──▶  Resend  → eier + kunde
                                    3. Post melding      ──▶  Slack incoming webhook
                                    4. Lagre notify-status tilbake på ordre-raden
                                              │
                                    ◀── 200 OK ── modal viser "Bestilling mottatt"
```

Ett felles endepunkt for alle sidene, med et `site`-felt (`orden`/`skjul`/`ved`)
som skiller dem.

### Flyt og feilhåndtering

Rekkefølge i funksjonen:

1. **Lagre ordre i Neon.** Må lykkes. Feiler dette, returneres HTTP 500 og modalen
   viser en "prøv igjen / ring oss"-melding (ikke falsk suksess).
2. **Send e-post via Resend** — varsel til eier + kvittering til kunde. Resultatet
   fanges opp, men et feilet e-postsend stopper *ikke* resten av flyten.
3. **Send Slack-melding** — kjøres **uansett** om e-post feilet. Meldingen
   inkluderer status på e-postene: hvis en e-post feilet, vises en ⚠️-linje.
   Slik fungerer Slack som varslingskanal også for e-postfeil.
4. **Lagre `notify`-status** tilbake på ordre-raden (se datamodell).

Prinsipp: DB-skriving er eneste steg som *må* lykkes for at kunden får OK. E-post-
og Slack-feil logges (Vercel-logger + `notify`-feltet i DB) men gjør ikke at
kunden mister bestillingen. Hvis Slack selv feiler, logges det i Vercel-loggene og
på ordre-raden.

## Datamodell (Neon Postgres)

Én tabell, `orders`:

| felt | type | merknad |
|------|------|---------|
| `id` | uuid PK | default gen_random_uuid() |
| `created_at` | timestamptz | default now() |
| `site` | text | `orden` / `skjul` / `ved` |
| `product` | text | menneskelesbar, f.eks. "3-dunk Standard" |
| `config` | jsonb | rådata fra modalen (antall, serie, størrelse, kledning …) |
| `preferred_date` | date | ønsket monteringsdato (nullable) |
| `name` | text | kunde |
| `phone` | text | kunde |
| `email` | text | kunde (påkrevd) |
| `address` | text | monteringsadresse (nullable) |
| `price_nok` | integer | pris modalen viste (nullable) |
| `utm` | jsonb | kampanjesporing fra localStorage (`ns_utm`) |
| `notify` | jsonb | `{email_owner, email_customer, slack}` = status + evt. feilmelding |
| `status` | text | default `'new'` — forberedelse for fremtidig ordreoversikt |

`config` og `utm` som `jsonb` gjør at vi ikke må endre skjemaet når en side får
nye valg. `notify` logger leveringsstatus. `status` er forberedelsen til en
adminside senere.

## Serverless-funksjon (`/api/order`)

- **Node-runtime** på Vercel (Fluid Compute, standard).
- Minimal `package.json` legges til med avhengighetene `@neondatabase/serverless`
  og `resend`. Slack treffes med vanlig `fetch` (ingen SDK).
- **Validering server-side:** påkrevd = `name`, `phone`, `email` (gyldig format),
  `site` (whitelist orden/skjul/ved). Ugyldig input → HTTP 400.
- **Spam-beskyttelse:** skjult honeypot-felt i modalen (utfylt = avvis stille) +
  grunnleggende lengdesjekk på feltene. Vercel BotID vurderes ikke nødvendig nå.
- Kun `POST`. Andre metoder → 405.

### Miljøvariabler (Vercel-secrets)

| variabel | beskrivelse |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string |
| `RESEND_API_KEY` | Resend API-nøkkel |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook |
| `NOTIFY_EMAIL` | mottaker for eier-varsel (joakiml@aboveit.no) |

## E-post (Resend)

Avsenderdomene: `roverk.no` (verifisert i Resend med SPF/DKIM DNS-oppføringer).
Avsender f.eks. `ordre@roverk.no`.

- **Til eier:** ren varsling med alle ordrefeltene + `mailto:`-lenke til kunden.
- **Til kunde:** pen bekreftelse ("Takk for bestillingen …"). E-post er påkrevd,
  så kvittering sendes alltid.

## Frontend-endring

I hver av de tre sidene (`orden`/`orden-v2`, `skjul`, `ved`):

1. Bytt ut `submitOrder()`-stubben med et `fetch('/api/order', …)`-kall (POST JSON)
   som sender `order`-objektet + UTM-data.
2. Behold eksisterende Facebook-pixel `Lead`-sporing.
3. Gjør e-post påkrevd i skjemaet (`required` + validering i `canProceed()`).
4. Legg til skjult honeypot-felt.
5. Feilhåndtering: ved feilet kall vis "prøv igjen / ring oss"-melding i stedet
   for `order.phase='done'`. Suksess vises kun ved HTTP 200.

Endringen holdes per-fil (ingen felles delt modul nå) — tryggest, og passer at
sidene er selvstendige statiske sider.

## Avklarte valg

- **DB-rolle:** sikkerhetsnett + grunnlag for fremtidig ordreoversikt.
- **E-post:** til både eier og kunde; e-post påkrevd.
- **Domene:** roverk.no finnes med DNS-tilgang.
- **Slack:** én incoming webhook til én kanal (#ordre).
- **Betaling:** ingen nettbetaling.

## Åpne oppsett-oppgaver (utenfor kode)

Disse må gjøres i tjenestene (dekkes av implementasjonsplanen som steg):

1. Opprett Neon-database, hent `DATABASE_URL`.
2. Opprett Resend-konto, verifiser `roverk.no` (SPF/DKIM DNS).
3. Opprett Slack incoming webhook for #ordre.
4. Legg alle secrets inn i Vercel-prosjektet.
