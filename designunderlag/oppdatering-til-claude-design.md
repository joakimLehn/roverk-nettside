# Oppdatering til Claude Design — ny beregning av rack-dimensjoner

Konfiguratoren er allerede bygget på gammel spec. Denne oppdateringen erstatter beregningslogikken for høyde, bredde og dybde. **Kasseorienteringen er endret:** kassene står nå med langsiden innover i dybden og kortsiden mot fronten. Bytt ut de gamle konstantene og formlene med det som står under.

## Kasser

To standardkasser, samme grunnflate:
- 40L: 58 × 39 × **26** cm
- 60L: 58 × 39 × **34** cm

Orientering i racket: **580 mm (58 cm) går innover i dybden**, **390 mm (39 cm) vender mot fronten**. Høyden (260/340) er det kunden stabler.

## Konstanter (mm)

```
kasse_front    = 390     # 39 cm, mot fronten — styrer bredden
kasse_dybde    = 580     # 58 cm, innover — styrer dybden
kassehoyde     = { "40L": 260, "60L": 340 }
klaring_hoyde  = 10      # klaring per kasse i høyden
ramme_overhead = 110     # topp- + bunnramme + bunnplate
hjul_hoyde     = 125     # legges kun til når hjul er valgt
kolonne_pitch  = 435     # bredde per kasse i bredden (390 + 45 klaring/delevegg)
dybde_utvendig = 600     # konstant (580 kasse + 20 klaring/ramme)
```

## Inndata fra konfiguratoren

- `stabel` = liste med kassehøyder nedenfra og opp, hvert element er 260 eller 340. **Minst 3 elementer.**
- `W` = antall kasser i bredden. **Minst 1.**
- `hjul` = true/false.

## Formler

```
innvendig_hoyde = sum(kassehoyde_i + klaring_hoyde for hver kasse i stabel)
hoyde_uten_hjul = innvendig_hoyde + ramme_overhead
hoyde_totalt    = hoyde_uten_hjul + (hjul ? hjul_hoyde : 0)

utvendig_bredde = kolonne_pitch * W        # 435 * W
utvendig_dybde  = dybde_utvendig           # alltid 600
antall_kasser   = length(stabel) * W
```

Antall hjul (til materialliste/pris): `W ≤ 2 → 4 hjul`, `W = 3–4 → 6 hjul`, `W = 5 → 8 hjul`.

## Beskrivelse (hvordan hjul påvirker høyden)

Rammen står som utgangspunkt rett på gulvet. Velger kunden hjul, løftes hele racket 125 mm — samme rack blir altså nøyaktig 125 mm høyere med hjul enn uten. Alt annet (bredde, dybde, innvendig høyde) er uendret av hjulvalget.

## Kontrolleksempler

| Oppsett | Bredde | Dybde | Høyde uten hjul | Høyde med hjul | Kasser |
|---------|--------|-------|-----------------|----------------|--------|
| 3 × 34 cm, 1 bred | 435 mm | 600 mm | 1160 mm | 1285 mm | 3 |
| 3 × 34 cm, 4 brede | 1740 mm | 600 mm | 1160 mm | 1285 mm | 12 |
| 5 × 34 cm, 3 brede | 1305 mm | 600 mm | 1860 mm | 1985 mm | 15 |
| 3 × 26 cm, 2 brede | 870 mm | 600 mm | 920 mm | 1045 mm | 6 |
| Miks 26+34+34, 2 brede | 870 mm | 600 mm | 1050 mm | 1175 mm | 6 |

## Viktig — må også oppdateres

Standardmodell-tabellen (breddene 780–3100 mm og prisene) ble laget på gammel orientering med 58 cm mot fronten. Disse breddene og prisene stemmer ikke lenger med ny orientering og må reberegnes med `435 * W` før de vises på siden.
