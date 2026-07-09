# Design-spec: Nettside for Nordic Storage AS

**Formål med dette dokumentet:** Fullstendig brief til Claude Design (eller annen AI/designer) for å bygge en konverterende, "kick ass" nettside. Alt av produkt-, pris- og merkevareinfo er samlet her. Fyll inn markerte plassholdere `[…]` når det er avklart.

---

## 1. Kort om bedriften

Nordic Storage AS er en nystartet bedrift i Trondheimsområdet, drevet av to gründere. Vi lager **mobile trebaserte oppbevaringsrack for garasjer** — åpne trerammer på hjul, dimensjonert for standard plastkasser. Alt produseres lokalt i norske materialer, leveres og monteres hos kunden i Trondheimsområdet.

**Posisjonering:** Lokalt håndverk mot masseproduserte importløsninger. Ekte tre, laget for norske garasjer, montert av oss. Inspirert av amerikanske suksesshistorier som The Shelf Dude — enkelt, ekte, custom-fokus, "den lille aktøren mot de store".

**Vi tilbyr IKKE:** tak-/vegghengte løsninger, importerte kasser, eller ferdigpakket flatpakke. Fokus er standardmodeller + skreddersøm på mål, produsert og montert lokalt.

---

## 2. Mål og målgruppe

**Primærmål (konvertering):** Besøkende bruker en **konfigurator** for å sette sammen sitt rack, ser en **pris**, og sender en **tilbudsforespørsel**. Ingen betaling på nett — vi følger opp med tilbud, bygging, levering og montering.

**Sekundære mål:** Bygge tillit (lokalt, håndverk), vise standardmodeller, forklare prosessen.

**Målgruppe:** Huseiere/garasjeeiere i Trondheimsområdet (30–60 år), praktisk anlagte, ønsker orden i garasjen. Verdsetter kvalitet, lokal produksjon og at noen andre gjør jobben (montering inkludert).

**Språk:** Kun norsk (bokmål).

---

## 3. Produktet i detalj (fakta til innhold)

**Konsept:** Åpen trerammekonstruksjon i 48x48 mm C24 konstruksjonsvirke med kryssavstivning, hjul under, og hele hylleplater i **18 mm kryssfinér** på hvert nivå. En lav **frontlist (48x24 mm)** foran hver hylle stopper kassene og gir god trekk-ut-funksjon uten at de tipper.

**Kasser (kunden bruker Jula Hard Head-serien, samme grunnflate 58x39 cm):**
- 40 L — 58 × 39 × 26 cm
- 60 L — 58 × 39 × 34 cm

**Hjul (industrihjul Ø125 mm, 100 kg/hjul, med brems):**
- Smale modeller (1x, 2x bredde): 4 hjul
- Medium (3x, 4x bredde): 6 hjul
- Brede/høye (5x): 8 hjul

**Skalerbarhet:** Modeller navngis `bredde x høyde` i antall kasser, fra 1x3 opp til 5x5. Bredde og høyde bestemmes av antall kasser. I tillegg tilbys **skreddersøm på mål**.

---

## 4. Modelloversikt (data til tabell + konfigurator)

Alle 17 standardmodeller. Pris er inkl. montering og levering i Trondheimsområdet.

| Modell | Bredde | Høyde | Antall kasser | Hjul | Pris (inkl. montering+levering) |
|--------|--------|-------|---------------|------|-------------------------------|
| 1x3 | 780 mm | 1440 mm | 4 (2×40L + 2×60L) | 4 | 7 500 – 8 900 kr |
| 1x4 | 780 mm | 1870 mm | 6 (2×40L + 4×60L) | 4 | 8 900 – 10 500 kr |
| 1x5 | 780 mm | 2300 mm | 8 (2×40L + 6×60L) | 4 | 10 500 – 12 500 kr |
| 2x3 | 1360 mm | 1440 mm | 8 (4×40L + 4×60L) | 4 | 10 500 – 12 900 kr |
| 2x4 | 1360 mm | 1870 mm | 12 (4×40L + 8×60L) | 4 | 12 500 – 15 000 kr |
| 2x5 | 1360 mm | 2300 mm | 15 (5×40L + 10×60L) | 4 | 14 500 – 17 500 kr |
| 3x2 | 1940 mm | 1010 mm | 9 (3×40L + 6×60L) | 4 | 10 500 – 12 900 kr |
| 3x3 | 1940 mm | 1440 mm | 12 (6×40L + 6×60L) | 6 | 13 900 – 16 500 kr |
| 3x4 | 1940 mm | 1870 mm | 18 (6×40L + 12×60L) | 6 | 17 500 – 20 500 kr |
| 3x5 | 1940 mm | 2300 mm | 22 (8×40L + 14×60L) | 6 | 20 500 – 24 000 kr |
| 4x2 | 2520 mm | 1010 mm | 12 (4×40L + 8×60L) | 6 | 13 900 – 16 500 kr |
| 4x3 | 2520 mm | 1440 mm | 16 (8×40L + 8×60L) | 6 | 16 900 – 19 900 kr |
| 4x4 | 2520 mm | 1870 mm | 24 (8×40L + 16×60L) | 6 | 21 500 – 25 500 kr |
| 4x5 | 2520 mm | 2300 mm | 30 (10×40L + 20×60L) | 8 | 26 000 – 30 500 kr |
| 5x3 | 3100 mm | 1440 mm | 20 (10×40L + 10×60L) | 8 | 21 500 – 25 500 kr |
| 5x4 | 3100 mm | 1870 mm | 30 (10×40L + 20×60L) | 8 | 26 500 – 31 000 kr |
| 5x5 | 3100 mm | 2300 mm | 38 (12×40L + 26×60L) | 8 | 31 000 – 36 500 kr |

**"4x3" er referansemodellen** (12 kasser) fra den opprinnelige tegningen — bruk gjerne som hovedeksempel/hero.

---

## 5. Sidestruktur

Én-side (one-page) med ankre i toppmeny, eventuelt egne undersider for Modeller og Om oss. Anbefalt rekkefølge:

1. **Hero** — kraftig bilde/3D-render av et rack i garasje, kort verdiløfte, primær CTA "Sett sammen ditt rack" (til konfigurator) + sekundær "Se modeller".
2. **Verdiløfte / hvorfor oss** — 3–4 punkter: lokalt laget i Trondheim, ekte tre (18 mm kryssfinér + C24), på hjul = fleksibelt, montering inkludert.
3. **Konfigurator** (kjernefunksjon — se §6).
4. **Modelloversikt** — alle 17 modeller som kort eller filtrerbar tabell med mål og pris.
5. **Slik funker det** — 3 steg: (1) Velg eller konfigurer modell → (2) Vi sender tilbud og avtaler → (3) Vi bygger, leverer og monterer hos deg.
6. **Om oss / lokalt** — to karer i Trondheim, norske materialer, den lille aktøren mot store nettbutikker. Ekte historie bygger tillit.
7. **FAQ** — leveringsområde, leveringstid, kasser (kunden kjøper Jula Hard Head selv, eller vi skaffer? `[avklar]`), skreddersøm, garanti.
8. **Kontakt / tilbudsskjema** — navn, telefon, e-post, valgt modell/mål, garasjemål/kommentar. `[Fyll inn: e-post, telefon, evt. org.nr]`
9. **Footer** — kontaktinfo, leveringsområde, sosiale medier `[avklar]`.

---

## 6. Konfigurator (viktigste interaktive element)

Enkel, leken velger som lander på en modell og pris:

- **Steg 1 — Bredde:** minst 1 kasse i bredden (velger bredde-mm automatisk, se §6a).
- **Steg 2 — Høyde:** kunden stabler kasser fritt, minst 3 i høyden, hvert nivå 40L (26 cm) eller 60L (34 cm) — se algoritmen i §6a.
- **Steg 3 — Hjul:** valgbart av/på; hjul legger til 125 mm i høyden (se §6a).
- **Live-oppdatering:** Vis valgt modellnavn (f.eks. "4x3"), antall kasser (40L/60L-miks), ytre mål, antall hjul og **prisintervall** fra tabellen i §4.
- **Visualisering:** Ideelt en enkel dynamisk illustrasjon/SVG av racket som endrer seg (flere kolonner/rader). Alternativt bytt mellom forhåndstegnede bilder per modell.
- **CTA:** "Be om tilbud på denne modellen" → forhåndsutfyller tilbudsskjemaet med valgt modell.
- **Ekstra:** Lenke "Trenger du andre mål? Be om skreddersøm" → skjema med fritekst mål.

Kombinasjoner som ikke finnes i tabellen (f.eks. 5x2) håndteres som "skreddersøm — be om tilbud".

### 6a. Beregningsalgoritme for høyde og bredde (fri konfigurasjon)

Konfiguratoren skal la kunden bygge **egendefinert høyde** ved å stable kasser (min. 3 i høyden) og velge **bredde** i antall kasser (min. 1). Hvert nivå kan fritt være 40L (26 cm) eller 60L (34 cm). Algoritmen er avledet av klaringene i den opprinnelige tegningen (KASSERACK 4x3) og reproduserer den eksakt.

**Kasseorientering:** Kassene står med **langsiden (580 mm / 58 cm) innover i dybden** og **kortsiden (390 mm / 39 cm) mot fronten**. Skapet blir derfor smalt per kolonne og 600 mm dypt.

Konstanter (mm):

```
kasse_front    = 390          # 39 cm, mot fronten (styrer bredde)
kasse_dybde    = 580          # 58 cm, innover (styrer dybde)
kassehøyde     = {40L: 260, 60L: 340}
klaring_høyde  = 10           # per kasse (tegning: 430 rom − 420 kasse)
ramme_overhead = 110          # topp- + bunnramme + bunnplate
hjul_høyde     = 125          # kun hvis hjul valgt
kolonne_pitch  = 435          # per kasse i bredden = 390 + 45 (klaring + delevegg)
dybde_utvendig = 600          # 580 kasse + 20 klaring/ramme
```

Formler:

```
# stabel = liste med kassehøyder, len ≥ 3
innvendig_høyde = Σ (kassehøyde_i + 10)
høyde_uten_hjul = innvendig_høyde + 110
høyde_med_hjul  = høyde_uten_hjul + (hjul ? 125 : 0)

# W = antall kasser i bredden, ≥ 1
utvendig_bredde = 435 × W
utvendig_dybde  = 600            # konstant, 1 kasse dyp
antall_kasser   = len(stabel) × W
```

Hjulantall (fra §3): W≤2 → 4 hjul, W=3–4 → 6 hjul, W=5 → 8 hjul.

Verifisering høyde mot tegningen: 3 × (420+10) = 1290 innvendig → +110 = 1400 uten hjul → +125 = 1525 med hjul. Stemmer. (Bredden er reberegnet for ny kasseorientering og følger ikke lenger tegningens 2500 mm, som gjaldt kasser snudd motsatt vei.)

Eksempler: 3×34 cm uten hjul = 1160 mm høy (med hjul 1285). 5×34 cm med hjul = 1985 mm høy. Bredde 4 kasser = 1740 mm, dybde 600 mm.

Merk: `kolonne_pitch = 435` bruker samme ramme-/klaringstillegg per kolonne (45 mm) som den opprinnelige tegningen; juster hvis faktisk deleveggtykkelse tilsier noe annet. Dette er et estimeringsmål; faktisk bygg kan variere noen mm.

⚠️ **Konsekvens for §4:** Modelltabellens bredder (780–3100 mm) og priser i §4 ble regnet med kassene snudd motsatt vei (58 cm mot fronten). Med ny orientering må bredder og evt. priser i §4 reberegnes før publisering.

---

## 7. Visuell stil

**Retning: Skandinavisk + håndverk.** Rent, lyst, luftig skandinavisk grunnlag med ekte tre-detaljer og garasjebilder. Premium men jordnært — ikke glossy e-handel, ikke rustikk klisjé.

**Fargepalett (forslag — ingen er bestemt ennå):**
- Bakgrunn: varm off-white / lin (#F5F1EA)
- Tekst: nesten-svart kull (#1E1B18)
- Aksent tre/varm: naturlig kryssfinér-amber (#C08A4A)
- Sekundær: dyp skog-/petroleumsgrønn (#2E4034) for tillit/CTA
- Nøytral grå for linjer/kort (#D9D2C7)

**Typografi:** Ren, moderne sans-serif for brødtekst (f.eks. Inter/Söhne-aktig). Overskrifter kan ha litt karakter — en trygg grotesk eller en subtil serif for varme. Store, tydelige overskrifter.

**Bildespråk:** Ekte garasjer, tre-teksturer, nærbilder av finér-kant og hjul, mennesker som drar ut en kasse. Unngå steril studio-look. `[Vi har ingen bilder/logo ennå — bruk 3D-render fra tegningen + illustrasjoner/plassholdere, og legg opp for enkel utskifting med ekte foto senere.]`

**Tone of voice:** Uformell, trygg, konkret, norsk. "Vi bygger det, vi bærer det inn, vi monterer det." Lite fagsjargong, mye "dette løser rotet i garasjen din".

**Følelse å unngå:** generisk AI-template, overlessede gradienter, stockbilder av kontorfolk, engelsk.

---

## 8. Merkevare — status og plassholdere

- **Navn:** Nordic Storage AS
- **Logo:** finnes ikke ennå → be Claude Design lage en enkel, tekstbasert plassholder-logo (ordmerke) som matcher stilen, gjerne med et lite tre/kasse-ikon.
- **Farger:** ikke bestemt → bruk paletten i §7 som utgangspunkt.
- **Bilder:** ingen ennå → 3D-render/illustrasjoner + plassholdere.
- **Domene:** `[ikke avklart]`
- **Kontaktinfo:** `[e-post, telefon, evt. org.nr — fyll inn]`

---

## 9. Tekniske ønsker / referanser

- **Responsivt** — mobil først (mange vil sjekke fra garasjen).
- **Rask og lettdrevet** — statisk/enkel side holder; ingen betalingsintegrasjon i første omgang.
- **Tilbudsskjema** som sender e-post til oss `[e-post]`.
- **SEO:** lokale søkeord — "garasjeoppbevaring Trondheim", "kasserack", "oppbevaringsrack garasje".

**Inspirasjonssider (hva vi liker):**
- The Shelf Dude — theshelfdude.com — enkelt, ekte garasjebilder, custom-fokus, "mot store nettbutikker".
- E-Z Garage Storage — ezgaragestorageusa.com — klar produktvisning, "Made in USA".
- Good Garage — goodgarage.us — profesjonell montering, tillitsbygging.
- Gladiator GarageWorks — gladiatorgarageworks.com — modulært, sterk visuell stil, "shop by solution".
- SafeRacks — saferacks.com — bin-rack-fokus, viral/enkel stil.

Vi vil ha The Shelf Dude sin ekthet og lokale følelse, men med et renere skandinavisk uttrykk.

---

## 10. Åpne punkter å avklare før bygg

1. Selger vi kassene (Jula Hard Head) med, eller kjøper kunden dem selv?
2. Kontaktinfo, domene, org.nr.
3. Sosiale medier (Instagram/Facebook for garasje-før/etter-bilder?).
4. Fast leveringsområde — hvor langt utenfor Trondheim leverer/monterer vi?
5. Garanti / leveringstid å love på siden.
