#!/usr/bin/env python3
"""Builds the catalogue card: the picture the whole platform judges us by.

The card that shipped was a screenshot from before the art existed: a grey floor and three
primitive placeholder shapes, in a 1.43 aspect the listing crops. Measured against the
best-performing worlds in the same feed (1 Sep), the pattern is unanimous: SIXTEEN BY NINE,
and the game's NAME lettered on the image. Rat Scape, Space Runner and Flag Tag, the three
most-liked worlds in the catalogue, are all key art with a title lockup, not raw captures.

So this draws key art in the game's own language, and takes an optional background image:

    python3 tools/ui/build-card.py                    # composed background
    python3 tools/ui/build-card.py shot.png           # a real in-game capture behind it

Requires Pillow and tools/ui/display.ttf (Baloo 2 ExtraBold, the face the HUD uses).
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(HERE, '../..'))
POLICE = os.path.join(HERE, 'display.ttf')
SORTIE = os.path.join(RACINE, 'images/base-war-thumbnail.png')
W, H = 1280, 720

# The palette is the game's, not a fresh one: theme.ts and toy.ts, read across.
CIEL_HAUT, CIEL_BAS = (0x6f, 0xb4, 0xe8), (0xd6, 0xec, 0xfa)
HERBE = (0x4e, 0xb8, 0x5a)
NAVY, OR = (0x16, 0x23, 0x3f), (0xff, 0xd4, 0x47)
RARETES = ['#78818e', '#4ec04e', '#3d8ef0', '#a855f7', '#f5a524', '#ff4d6d']
PIECES = '♟♞♝♜♛♚'
SYMBOLES = '/System/Library/Fonts/Apple Symbols.ttf'


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def arbre(d, x, sol, h, c):
    """A lollipop tree: a trunk and three canopies, which is what the scene's own trees are."""
    tronc = (0x8a, 0x63, 0x4a)
    d.rectangle((x - h * 0.055, sol - h * 0.42, x + h * 0.055, sol), fill=tronc)
    for dx, dy, r in ((0, -0.62, 0.30), (-0.22, -0.44, 0.24), (0.22, -0.46, 0.25)):
        d.ellipse((x + dx * h - r * h, sol + dy * h - r * h, x + dx * h + r * h, sol + dy * h + r * h),
                  fill=c, outline=mix(c, (0, 0, 0), 0.22), width=3)


def caisse(d, x, y, larg, c):
    """A crate as the game draws it: a body, a lit lid and the strap cross."""
    haut = larg * 0.78
    corps = mix(c, (0, 0, 0), 0.12)
    d.rectangle((x - larg / 2, y - haut, x + larg / 2, y), fill=corps, outline=mix(c, (0, 0, 0), 0.5), width=3)
    d.rectangle((x - larg * 0.56, y - haut - larg * 0.2, x + larg * 0.56, y - haut + larg * 0.04),
                fill=mix(c, (255, 255, 255), 0.3), outline=mix(c, (0, 0, 0), 0.5), width=3)
    sangle = mix(c, (0, 0, 0), 0.42)
    d.rectangle((x - larg * 0.07, y - haut, x + larg * 0.07, y), fill=sangle)
    d.rectangle((x - larg / 2, y - haut * 0.62, x + larg / 2, y - haut * 0.46), fill=sangle)


def base(im, d, x, sol, larg, accent, butin):
    """A plot, with a roof that gives it volume and the loot standing behind its glass.

    A flat front read as a picture frame; the building is a box, so it gets a top face. And
    the glass has to show something: what a base IS, in this game, is loot on display.
    """
    h = larg * 0.78
    creme, verre = (0xf2, 0xe9, 0xd8), (0xcf, 0xe6, 0xf2)
    fuite = larg * 0.30
    # Roof and right flank first, so the front face closes over them.
    d.polygon([(x - larg / 2, sol - h), (x + larg / 2, sol - h),
               (x + larg / 2 + fuite, sol - h - fuite * 0.5), (x - larg / 2 + fuite, sol - h - fuite * 0.5)],
              fill=mix(creme, (255, 255, 255), 0.45), outline=(0xd0, 0xc4, 0xac))
    d.polygon([(x + larg / 2, sol), (x + larg / 2, sol - h),
               (x + larg / 2 + fuite, sol - h - fuite * 0.5), (x + larg / 2 + fuite, sol - fuite * 0.5)],
              fill=mix(creme, (0, 0, 0), 0.14), outline=(0xd0, 0xc4, 0xac))
    d.rectangle((x - larg / 2, sol - h, x + larg / 2, sol), fill=creme, outline=(0xd0, 0xc4, 0xac))
    d.rectangle((x - larg * 0.40, sol - h * 0.86, x + larg * 0.40, sol - h * 0.06), fill=verre,
                outline=(0xb9, 0xd4, 0xe2), width=3)
    # The loot on show, behind the glass, on its lit pad.
    c = rgb(RARETES[butin])
    pad = larg * 0.20
    d.ellipse((x - pad, sol - h * 0.16, x + pad, sol - h * 0.06), fill=(0xbf, 0xb5, 0xa4))
    ft = ImageFont.truetype(SYMBOLES, int(h * 0.52))
    d.text((x, sol - h * 0.12), PIECES[butin], font=ft, fill=c, stroke_width=3,
           stroke_fill=mix(c, (0, 0, 0), 0.6), anchor='ms')
    d.rectangle((x - larg / 2, sol - h - larg * 0.07, x + larg / 2, sol - h + larg * 0.02), fill=accent)
    for dx in (-0.5, 0.5):
        d.rectangle((x + dx * larg - larg * 0.05, sol - h, x + dx * larg + larg * 0.05, sol), fill=accent)


def fond_compose():
    """The plaza as the game lays it out: mat, wall, treeline, a belt of crates and two plots."""
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    horizon = int(H * 0.42)
    for y in range(horizon):
        d.line([(0, y), (W, y)], fill=mix(CIEL_HAUT, CIEL_BAS, (y / horizon) ** 0.8))
    for k in range(9):
        cx, cy, r = 90 + k * 165, 40 + (k * 53) % 90, 34 + (k * 29) % 30
        d.ellipse((cx - r * 1.7, cy - r, cx + r * 1.7, cy + r), fill=(255, 255, 255))
    # Treeline behind the wall, then the wall that closes the plot.
    for k in range(11):
        arbre(d, 40 + k * 128, horizon - 6, 120 + (k * 31) % 46,
              [(0xd8, 0x7a, 0x8e), (0xc9, 0x5f, 0x5f), (0x7f, 0xb0, 0x6a), (0xe0, 0x9a, 0x5a)][k % 4])
    d.rectangle((0, horizon - 22, W, horizon + 6), fill=(0xef, 0xc9, 0xcf))
    d.rectangle((0, horizon - 28, W, horizon - 20), fill=(0xff, 0xd9, 0x7a))
    # The mat, with a perspective grid that opens toward the camera.
    for y in range(horizon + 6, H):
        t = (y - horizon) / (H - horizon)
        d.line([(0, y), (W, y)], fill=mix(mix(HERBE, (255, 255, 255), 0.14), mix(HERBE, (0, 0, 0), 0.12), t))
    for k in range(-16, 34):
        d.line([(W / 2 + (k * 44 - W / 2) * 0.34, horizon + 6),
                (W / 2 + (k * 44 - W / 2) * 2.4, H)], fill=mix(HERBE, (0, 0, 0), 0.07), width=2)
    y, pas = horizon + 20, 12
    while y < H:
        d.line([(0, y), (W, y)], fill=mix(HERBE, (0, 0, 0), 0.07), width=2)
        pas = int(pas * 1.36)
        y += pas
    # Two plots on the left, a belt of crates across the middle: the loop in one picture.
    base(im, d, 372, horizon + 104, 150, (0x3f, 0x86, 0xd6), 2)
    base(im, d, 165, horizon + 132, 214, (0xff, 0xc6, 0x3f), 5)
    by = horizon + 178
    d.polygon([(430, by), (W, by - 26), (W, by + 20), (430, by + 46)], fill=(0xc9, 0x5f, 0x5f))
    d.polygon([(430, by), (W, by - 26), (W, by - 12), (430, by + 14)], fill=(0xe8, 0xa9, 0x5c))
    for i, c in enumerate([(0x9a, 0xa3, 0xad), (0x4e, 0xc0, 0x4e), (0x3d, 0x8e, 0xf0), (0xa8, 0x55, 0xf7)]):
        x = 520 + i * 190
        caisse(d, x, by + 14 - (x - 430) * 0.026, 86 + i * 6, c)
    return im


def piece(im, k, cx, base, haut):
    """One chess piece, in its rarity's colour, with the outline the icons use."""
    c = rgb(RARETES[k])
    sombre = mix(c, (0, 0, 0), 0.62)
    ft = ImageFont.truetype(SYMBOLES, haut)
    calque = Image.new('RGBA', (haut * 2, haut * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    d.text((haut, haut), PIECES[k], font=ft, fill=c + (255,), stroke_width=max(3, haut // 26),
           stroke_fill=sombre + (255,), anchor='ms')
    # A soft contact shadow, so a piece stands on the mat instead of floating over it.
    ombre = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(ombre).ellipse((cx - haut * 0.34, base - haut * 0.07, cx + haut * 0.34, base + haut * 0.07),
                                  fill=(0, 0, 0, 70))
    im.alpha_composite(ombre.filter(ImageFilter.GaussianBlur(9)))
    im.alpha_composite(calque, (int(cx - haut), int(base - haut)))


def titre(im):
    """The name, lettered: every card above us in the catalogue has one."""
    d = ImageDraw.Draw(im)
    ft = ImageFont.truetype(POLICE, 132)
    fs = ImageFont.truetype(POLICE, 40)
    x, y = 70, H - 214
    d.text((x + 6, y + 8), 'BASE WAR', font=ft, fill=(0, 0, 0, 90))
    d.text((x, y), 'BASE WAR', font=ft, fill=OR + (255,), stroke_width=11, stroke_fill=NAVY + (255,))
    d.text((x + 5, y + 148), 'SMASH CRATES  ·  SHOW YOUR LOOT  ·  GUARD IT',
           font=fs, fill=(255, 255, 255, 255), stroke_width=7, stroke_fill=NAVY + (255,))


if __name__ == '__main__':
    if len(sys.argv) > 1:
        src = Image.open(sys.argv[1]).convert('RGB')
        # Cover-crop to sixteen by nine, which is what the listing expects.
        r = max(W / src.width, H / src.height)
        src = src.resize((int(src.width * r), int(src.height * r)), Image.LANCZOS)
        gauche = (src.width - W) // 2
        im = src.crop((gauche, 0, gauche + W, H)).convert('RGBA')
    else:
        im = fond_compose().convert('RGBA')
        socle = H - 96
        for k, (x, ech) in enumerate([(742, 0.72), (838, 0.84), (952, 0.98), (1082, 1.14), (1218, 1.32)]):
            piece(im, k + 1, x, socle + ech * 26, int(132 * ech))
    # A dark wash rising from the bottom, so the lettering never sits on a busy pixel.
    voile = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dv = ImageDraw.Draw(voile)
    for y in range(int(H * 0.52), H):
        t = (y - H * 0.52) / (H * 0.48)
        dv.line([(0, y), (W, y)], fill=NAVY + (int(150 * t * t),))
    im.alpha_composite(voile)
    titre(im)
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    im.convert('RGB').save(SORTIE, optimize=True)
    print('ecrit', SORTIE, im.size)
