#!/usr/bin/env python3
"""Draws the seven toy icons the reel shows, and the two edge fades of the strip.

One icon per rarity, the same silhouettes as the stand-ins in the world (a marble, stacked
blocks, a hat on a plate, a rocket, a tree, a pagoda, a star): a player who has seen the card
recognises the toy on the shelf. Flat colour, dark outline, one highlight, which is the
vinyl-toy register of the theme, plus a soft glow behind it that grows with the rarity.

Requires Python with Pillow. The outputs are committed, so building the scene needs neither.

    python3 tools/ui/build-toy-icons.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter

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
        icon(k, hexcol, glow).save(os.path.join(OUT, f'toy-{k}.png'), optimize=True)
    fade(True).save(os.path.join(OUT, 'fade-left.png'), optimize=True)
    fade(False).save(os.path.join(OUT, 'fade-right.png'), optimize=True)
    print('wrote', OUT)
