# Annonse-assets

Filer som må ligge på en offentlig URL for at Meta skal kunne hente dem inn i
annonsekontoen. De er **ikke lenket fra noen side** — de ligger her bare fordi
Metas opplastings-API henter fra URL, ikke fra opplastet fil.

| Fil | Brukes til |
|---|---|
| `skjul-4x5-*-normalpris.jpg` | **Gjeldende** 4:5-bildeannonser, 1080×1350 |
| `skjul-4x5-*.jpg` | Utgått — intropris 7 190 / 8 920 og frist 13. september |
| `skjul-reklame-vertikal.mp4` | Reklamefilm 1080×1920 (Reels/Stories), kilde: `02-Marked/Roverk Skjul/Video/` |
| `skjul-reklame-vertikal-poster.jpg` | Miniatyrbilde for videoannonsen |

Bildene til bildeannonsene hentes fra `/skjul/assets/referanse-*.jpg`, som
allerede ligger på nettsiden.

## Prisen er brent inn i bildet

4:5-bildene har prisen i selve bildefilen, så de blir feil hver gang prisen på
`/skjul` endres — og i motsetning til nettsiden sier ingenting fra. Da
introduksjonsprisen gikk ut 13. september 2026, ble de hengende igjen.

`lag-4x5.py` tegner de nederste 410 pikslene på nytt. Bildeutsnittet gjenbrukes
uendret, så nye varianter står pikselriktig ved siden av de gamle:

```sh
python3 annonser/lag-4x5.py
```

Endre `PRIS_LEVERT`, `PRIS_MONTERT` og `BUNN` øverst i skriptet først. Skriptet
laster ned Archivo og Hanken Grotesk til `annonser/.fonter/` ved første kjøring.
`--suffiks` styrer filnavnet, `--kilde` hvilken variant utsnittet hentes fra.

Gamle varianter slettes ikke — de skrives aldri over.
