#!/usr/bin/env python3
"""Draws the seven toy icons the reel shows, the burst behind a win, and the strip fades.

One icon per rarity, the same pieces as the models on the shelves, in chess point order:
pawn, knight, bishop, rook, queen, king, and the star that stands for Secret. A player who
has seen the card recognises the piece on the shelf. The glyphs come from the system's
Apple Symbols face, filled in the rarity colour over a dark stroke, with the soft halo that
grows with rarity. The burst is a fan of warm rays the interface scales up behind the
winning card, baked white-gold because runtime tinting never arrives on handsets.

Requires Python with Pillow and the macOS Apple Symbols font. Outputs are committed, so
building the scene needs neither.

    python3 tools/ui/build-toy-icons.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/ui'))
N = 256

# src/shared/loot-table.ts, RARITIES: colour and glow, in order.
RARITIES = [
    ('#9aa3ad', 0.00), ('#4ec04e', 0.35), ('#3d8ef0', 0.80), ('#a855f7', 1.30),
    ('#f5a524', 2.00), ('#ff4d6d', 2.80), ('#e8e8f0', 4.00),
]


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


GLYPHES = '\u265f\u265e\u265d\u265c\u265b\u265a\u2605'
POLICE = '/System/Library/Fonts/Apple Symbols.ttf'


def icone_glyphe(k, hexcol, glow):
    c = rgb(hexcol)
    dark = mix(c, (0, 0, 0), 0.55)
    light = mix(c, (255, 255, 255), 0.35)
    ft = ImageFont.truetype(POLICE, 196)
    body = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    ch = GLYPHES[k]
    # Centre on the ink itself, not the em box, so every piece sits on the same optical line.
    x0, y0, x1, y1 = d.textbbox((0, 0), ch, font=ft, stroke_width=6)
    d.text((128 - (x0 + x1) / 2, 134 - (y0 + y1) / 2), ch, font=ft,
           fill=c + (255,), stroke_width=6, stroke_fill=dark + (255,))
    # One highlight, the vinyl register: a small light pool upper left inside the ink.
    masque = body.split()[3].point(lambda a: 255 if a > 200 else 0)
    pool = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    dp = ImageDraw.Draw(pool)
    dp.ellipse((86, 60, 122, 92), fill=light + (150,))
    body = Image.alpha_composite(body, Image.composite(pool, Image.new('RGBA', (N, N), (0, 0, 0, 0)), masque))
    halo = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    if glow > 0:
        mask = body.split()[3].filter(ImageFilter.GaussianBlur(radius=14 + glow * 5))
        strength = min(1.0, 0.25 + glow * 0.2)
        halo = Image.new('RGBA', (N, N), c + (0,))
        halo.putalpha(mask.point(lambda a: int(a * strength)))
    return Image.alpha_composite(halo, body)


def burst():
    """A fan of sixteen warm rays for the moment the reel lands, alpha dying outward."""
    S = 256
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = cy = S / 2
    for k in range(16):
        a = k * math.pi / 8 + 0.13
        long = 118 if k % 2 == 0 else 86
        demi = 0.075 if k % 2 == 0 else 0.05
        pts = [(cx + math.cos(a - demi) * 26, cy + math.sin(a - demi) * 26),
               (cx + math.cos(a + demi) * 26, cy + math.sin(a + demi) * 26),
               (cx + math.cos(a) * long, cy + math.sin(a) * long)]
        d.polygon(pts, fill=(255, 224, 130, 210))
    im = im.filter(ImageFilter.GaussianBlur(1.4))
    # Radial falloff so the fan melts into the panel instead of ending on a line.
    px = im.load()
    for y in range(S):
        for x in range(S):
            r0, g0, b0, a0 = px[x, y]
            if a0 == 0: continue
            dist = math.hypot(x - cx, y - cy) / (S / 2)
            px[x, y] = (r0, g0, b0, int(a0 * max(0.0, 1 - dist ** 1.6)))
    return im


def shapes(k, c):
    """Polygons and ellipses of one silhouette, centred, as (kind, points, colour)."""
    dark = mix(c, (0, 0, 0), 0.45)
    light = mix(c, (255, 255, 255), 0.35)
    cx, cy = 128, 134
    if k == 0:
        return [('e', (cx - 62, cy - 62, cx + 62, cy + 62), c), ('e', (cx - 40, cy - 46, cx - 6, cy - 18), light)]
    if k == 1:
        return [('p', [(cx - 66, cy + 66), (cx + 66, cy + 66), (cx + 66, cy), (cx - 66, cy)], c),
                ('p', [(cx - 66, cy), (cx + 66, cy), (cx + 40, cy - 22), (cx - 92, cy - 22)], light),
                ('p', [(cx - 20, cy), (cx + 46, cy), (cx + 46, cy - 66), (cx - 20, cy - 66)], c),
                ('p', [(cx - 20, cy - 66), (cx + 46, cy - 66), (cx + 30, cy - 82), (cx - 36, cy - 82)], light)]
    if k == 2:
        return [('e', (cx - 76, cy + 38, cx + 76, cy + 74), dark), ('e', (cx - 76, cy + 30, cx + 76, cy + 66), c),
                ('p', [(cx - 56, cy + 44), (cx + 56, cy + 44), (cx, cy - 78)], c),
                ('p', [(cx - 56, cy + 44), (cx - 14, cy + 44), (cx, cy - 78)], light)]
    if k == 3:
        return [('p', [(cx - 58, cy + 74), (cx - 34, cy + 40), (cx - 34, cy + 74)], dark),
                ('p', [(cx + 58, cy + 74), (cx + 34, cy + 40), (cx + 34, cy + 74)], dark),
                ('p', [(cx - 34, cy + 66), (cx + 34, cy + 66), (cx + 34, cy - 40), (cx - 34, cy - 40)], c),
                ('p', [(cx - 34, cy + 66), (cx - 12, cy + 66), (cx - 12, cy - 40), (cx - 34, cy - 40)], light),
                ('p', [(cx - 34, cy - 40), (cx + 34, cy - 40), (cx, cy - 86)], c),
                ('e', (cx - 12, cy - 2, cx + 12, cy + 22), dark)]
    if k == 4:
        return [('p', [(cx - 16, cy + 78), (cx + 16, cy + 78), (cx + 16, cy + 30), (cx - 16, cy + 30)], dark),
                ('p', [(cx - 76, cy + 34), (cx + 76, cy + 34), (cx, cy - 82)], c),
                ('p', [(cx - 76, cy + 34), (cx - 20, cy + 34), (cx, cy - 82)], light)]
    if k == 5:
        return [('p', [(cx - 60, cy + 76), (cx + 60, cy + 76), (cx, cy + 6)], c),
                ('p', [(cx - 60, cy + 76), (cx - 16, cy + 76), (cx, cy + 6)], light),
                ('p', [(cx - 48, cy + 10), (cx + 48, cy + 10), (cx, cy - 78)], c),
                ('p', [(cx - 48, cy + 10), (cx - 12, cy + 10), (cx, cy - 78)], light)]
    return [('e', (cx - 86, cy - 6, cx + 86, cy + 30), dark), ('e', (cx - 86, cy - 14, cx + 86, cy + 22), c),
            ('e', (cx - 46, cy - 50, cx + 46, cy + 42), c), ('e', (cx - 30, cy - 38, cx - 4, cy - 14), light)]


def icon(k, hexcol, glow):
    c = rgb(hexcol)
    dark = mix(c, (0, 0, 0), 0.55)
    body = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    for kind, pts, col in shapes(k, c):
        if kind == 'e':
            d.ellipse(pts, fill=col + (255,), outline=dark + (255,), width=4)
        else:
            d.polygon(pts, fill=col + (255,), outline=dark + (255,))
            d.line(pts + [pts[0]], fill=dark + (255,), width=4, joint='curve')
    halo = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    if glow > 0:
        mask = body.split()[3].filter(ImageFilter.GaussianBlur(radius=14 + glow * 5))
        strength = min(1.0, 0.25 + glow * 0.2)
        halo = Image.new('RGBA', (N, N), c + (0,))
        halo.putalpha(mask.point(lambda a: int(a * strength)))
    return Image.alpha_composite(halo, body)


def fade(left):
    im = Image.new('RGBA', (120, 8), (0, 0, 0, 0))
    px = im.load()
    for x in range(120):
        t = x / 119
        a = int(round(235 * (1 - t) ** 1.6)) if left else int(round(235 * t ** 1.6))
        for y in range(8):
            px[x, y] = (8, 11, 17, a)
    return im


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, (hexcol, glow) in enumerate(RARITIES):
        icone_glyphe(k, hexcol, glow).save(os.path.join(OUT, f'toy-{k}.png'), optimize=True)
    burst().save(os.path.join(OUT, 'burst.png'), optimize=True)
    fade(True).save(os.path.join(OUT, 'fade-left.png'), optimize=True)
    fade(False).save(os.path.join(OUT, 'fade-right.png'), optimize=True)
    print('wrote', OUT)
