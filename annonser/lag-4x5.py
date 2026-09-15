#!/usr/bin/env python3
"""Tegner bunnfeltet på 4:5-annonsebildene for Roverk Skjul på nytt.

Bakgrunn: bildene har prisen brent inn i selve bildet, så de blir feil hver gang
prisen endres. Dette skriptet gjenskaper feltet, slik at det går an å oppdatere
dem uten å bygge malen opp igjen fra bunnen.

Bildeutsnittet gjenbrukes uendret fra en eksisterende variant (identisk
beskjæring), og bare de nederste 410 pikslene tegnes på nytt.

    python3 lag-4x5.py                     # les prisene under og skriv *-normalpris.jpg
    python3 lag-4x5.py --suffiks kampanje  # skriv *-kampanje.jpg i stedet

Målene under er lest ut av intropris-utgaven fra august 2026, så nye bilder
står pikselriktig ved siden av de gamle.
"""
import argparse
import os
import sys
import urllib.request
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- tekstinnhold
PRIS_LEVERT  = "8 990 kr"
PRIS_MONTERT = "10 720 kr"
BUNN         = ("Håndbygd i ", "Trondheim", " · betal først når det står ferdig")
KILDESUFFIKS = ""          # hvilken variant bildeutsnittet hentes fra

# ------------------------------------------------------------------- oppmåling
W, BAND_H, PHOTO_H = 1080, 410, 940
M = 58                      # venstremarg

BG    = (14, 13, 11)        # --heroBg #0E0D0B
AMBER = (190, 138, 72)      # --amber  #BE8A48
WHITE = (255, 255, 255)

Y_MERKE, Y_SKJUL      = 45, 52          # versaltopp
X_STREK_MERKE, X_SKJUL = 285, 304
BREDDE_ROVERK, BREDDE_SKJUL = 202, 85   # med bokstavavstand
Y_PRIS, Y_TEKST, Y_BUNN = 120, 199, 268
GAP_FOR_STREK, GAP_ETTER_STREK = 46, 44

FONTER = {
    "Archivo.ttf": "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf",
    "HankenGrotesk.ttf": "https://github.com/google/fonts/raw/main/ofl/hankengrotesk/HankenGrotesk%5Bwght%5D.ttf",
}
FONTKATALOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fonter")


def hent_fonter():
    """Laster ned de variable fontene ved første kjøring. .fonter er gitignorert."""
    os.makedirs(FONTKATALOG, exist_ok=True)
    for navn, url in FONTER.items():
        sti = os.path.join(FONTKATALOG, navn)
        if not os.path.exists(sti):
            print(f"laster ned {navn} …", file=sys.stderr)
            urllib.request.urlretrieve(url, sti)
    return (os.path.join(FONTKATALOG, "Archivo.ttf"),
            os.path.join(FONTKATALOG, "HankenGrotesk.ttf"))


def blend(farge, andel):
    return tuple(round(farge[i] * andel + BG[i] * (1 - andel)) for i in range(3))


MUTED, DIVIDER = blend(WHITE, 0.60), blend(WHITE, 0.22)


def font(sti, storrelse, vekt, bredde=100):
    ft = ImageFont.truetype(sti, storrelse)
    try:
        ft.set_variation_by_axes([vekt, bredde])
    except Exception:
        ft.set_variation_by_axes([vekt])
    return ft


def versaltopp(ft, tegn="H"):
    """Piksler fra tegne-y ned til toppen av versalen — så y-verdiene over kan
    oppgis som det øyet ser, ikke som Pillows baseline."""
    probe = Image.new("L", (600, 400), 0)
    ImageDraw.Draw(probe).text((50, 100), tegn, font=ft, fill=255)
    return probe.getbbox()[1] - 100


def sperret(d, xy, tekst, ft, farge, sperr):
    x, y = xy
    for tegn in tekst:
        if d:
            d.text((x, y), tegn, font=ft, fill=farge)
        x += ft.getlength(tegn) + sperr
    return x - xy[0] - (sperr if tekst else 0)


def lag_band(archivo, hanken):
    band = Image.new("RGB", (W, BAND_H), BG)
    d = ImageDraw.Draw(band)

    f_roverk, f_skjul = font(archivo, 33, 800), font(archivo, 23, 700)
    sperr_r = (BREDDE_ROVERK - sperret(None, (0, 0), "ROVERK", f_roverk, None, 0)) / 5
    sperret(d, (M + 1, Y_MERKE - versaltopp(f_roverk)), "ROVERK", f_roverk, WHITE, sperr_r)
    d.rectangle([X_STREK_MERKE, 40, X_STREK_MERKE + 1, 70], fill=DIVIDER)
    sperr_s = (BREDDE_SKJUL - sperret(None, (0, 0), "SKJUL", f_skjul, None, 0)) / 4
    sperret(d, (X_SKJUL, Y_SKJUL - versaltopp(f_skjul)), "SKJUL", f_skjul, AMBER, sperr_s)

    f_pris = font(archivo, 68, 800)
    y = Y_PRIS - versaltopp(f_pris, "8")
    d.text((M - 1, y), PRIS_LEVERT, font=f_pris, fill=AMBER)
    x_strek = int(M - 1 + d.textlength(PRIS_LEVERT, font=f_pris) + GAP_FOR_STREK)
    d.rectangle([x_strek, 114, x_strek + 1, 202], fill=DIVIDER)
    x_hoyre = x_strek + GAP_ETTER_STREK
    d.text((x_hoyre, y), PRIS_MONTERT, font=f_pris, fill=WHITE)

    f_tekst = font(hanken, 26, 500)
    y = Y_TEKST - versaltopp(f_tekst, "f")
    d.text((M - 1, y), "fra · levert til døra", font=f_tekst, fill=MUTED)
    d.text((x_hoyre, y), "fra · ferdig montert", font=f_tekst, fill=MUTED)

    f_bunn = font(hanken, 27, 700)
    y, x = Y_BUNN - versaltopp(f_bunn, "I"), M
    for tekst, farge in zip(BUNN, (WHITE, AMBER, WHITE)):
        d.text((x, y), tekst, font=f_bunn, fill=farge)
        x += d.textlength(tekst, font=f_bunn)

    if x > W - M:
        print(f"ADVARSEL: bunnlinjen er {int(x - (W - M))} px for lang", file=sys.stderr)
    return band


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--suffiks", default="normalpris")
    p.add_argument("--kilde", default=KILDESUFFIKS,
                   help="suffikset på bildene utsnittet hentes fra (tomt = originalene)")
    a = p.parse_args()

    her = os.path.dirname(os.path.abspath(__file__))
    band = lag_band(*hent_fonter())

    for n in (1, 2, 3, 4):
        stamme = f"skjul-4x5-{n}" + (f"-{a.kilde}" if a.kilde else "")
        kilde = Image.open(os.path.join(her, f"{stamme}.jpg")).convert("RGB")
        if kilde.size != (W, PHOTO_H + BAND_H):
            sys.exit(f"{stamme}.jpg er {kilde.size}, forventet {(W, PHOTO_H + BAND_H)}")
        ny = Image.new("RGB", kilde.size)
        ny.paste(kilde.crop((0, 0, W, PHOTO_H)), (0, 0))
        ny.paste(band, (0, PHOTO_H))
        ut = os.path.join(her, f"skjul-4x5-{n}-{a.suffiks}.jpg")
        ny.save(ut, "JPEG", quality=90, subsampling=0, optimize=True, progressive=True)
        print(f"skrev {os.path.basename(ut)}")


if __name__ == "__main__":
    main()
