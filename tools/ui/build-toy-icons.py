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


def enseigne():
    """The facade sign plate, 4:1, in the HUD panel's navy.

    The first sign stretched the square 128 px panel texture six times wider than tall,
    which turned its corner radius into a great dark pill hanging on the building. A sign
    is its own drawing at its own aspect: small corners, the dark outline every control
    shares, the two-stop body, a gloss band, all baked, fully opaque so the renderer can
    alpha-test it and never fight the glazing over draw order.
    """
    W, H, R, OW = 768, 192, 30, 7
    out, top, mid, bot = rgb('#0a1428'), rgb('#26406e'), rgb('#1b3054'), rgb('#152743')
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=R, fill=out + (255,))
    for y in range(OW, H - OW):
        t = (y - OW) / (H - 2 * OW)
        col = mix(top, mid, min(1.0, t / 0.42)) if t < 0.42 else mix(mid, bot, (t - 0.42) / 0.58)
        d.line([(OW, y), (W - OW - 1, y)], fill=col + (255,))
    corps = Image.new('L', (W, H), 0)
    ImageDraw.Draw(corps).rounded_rectangle((OW, OW, W - OW - 1, H - OW - 1), radius=R - OW // 2, fill=255)
    fond = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d2 = ImageDraw.Draw(fond)
    d2.rounded_rectangle((0, 0, W - 1, H - 1), radius=R, fill=out + (255,))
    im = Image.composite(im, fond, corps)
    gloss = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).rounded_rectangle((OW + 4, OW + 4, W - OW - 5, int(H * 0.30)), radius=R - OW, fill=(255, 255, 255, 26))
    return Image.alpha_composite(im, Image.composite(gloss, Image.new('RGBA', (W, H), (0, 0, 0, 0)), corps))


def ui_icone(nom, hexcol):
    """One interface icon: flat fill, heavy dark outline, one highlight.

    A second family, and it has to be. The white-on-transparent glyphs in build-hud-icon.js
    are drawn for the CLIENT's own dark touch button; reused on our navy cards they came out
    as a white smudge (owner, 1 Sep: "l'icone de box est vraiment mauvais"). These are drawn
    for our plates: a saturated body, a near-black outline that survives a phone's downscale,
    one light pool. Same register as the toy icons, so the whole interface looks like one set.
    """
    c = rgb(hexcol)
    dark = mix(c, (0, 0, 0), 0.62)
    light = mix(c, (255, 255, 255), 0.42)
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    W = 12                      # outline, in pixels of a 256 canvas
    cx, cy = 128, 128

    def poly(pts, col=None):
        d.polygon(pts, fill=(col or c) + (255,), outline=dark + (255,))
        d.line(pts + [pts[0]], fill=dark + (255,), width=W, joint='curve')

    def ell(box, col=None):
        d.ellipse(box, fill=(col or c) + (255,), outline=dark + (255,), width=W)

    def trait(a, b, col=None, w=W):
        d.line([a, b], fill=(col or dark) + (255,), width=w)

    if nom == 'crate':
        # A lid, a body, and the strap cross that stops a square being a square.
        poly([(38, 96), (218, 96), (218, 218), (38, 218)])
        poly([(28, 52), (228, 52), (228, 100), (28, 100)], light)
        trait((128, 100), (128, 218))
        trait((38, 158), (218, 158))
    elif nom == 'floor':
        # Three slabs, the new one lit on top.
        poly([(30, 178), (128, 214), (226, 178), (128, 142)], mix(c, (0, 0, 0), 0.25))
        poly([(30, 130), (128, 166), (226, 130), (128, 94)], c)
        poly([(30, 82), (128, 118), (226, 82), (128, 46)], light)
    elif nom == 'shield':
        poly([(128, 30), (216, 68), (216, 140), (128, 226), (40, 140), (40, 68)])
        poly([(128, 30), (216, 68), (216, 140), (128, 226)], mix(c, (0, 0, 0), 0.22))
    elif nom == 'prestige':
        pts = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5
            r = 104 if k % 2 == 0 else 44
            pts.append((cx + math.cos(a) * r, cy - math.sin(a) * r))
        poly(pts)
        ell((cx - 26, cy - 26, cx + 26, cy + 26), light)
    elif nom == 'luck':
        for dx, dy in ((0, -46), (46, 0), (0, 46), (-46, 0)):
            ell((cx + dx - 48, cy + dy - 48, cx + dx + 48, cy + dy + 48))
        ell((cx - 22, cy - 22, cx + 22, cy + 22), light)
    elif nom == 'gear-0':          # TRAP: two jaws about to shut
        # Drawn as one zigzag per jaw rather than six outlined triangles: at this size the
        # outlines merged into a blob. Thin strokes, wide teeth, a clear gap between them.
        d.ellipse((30, 62, 226, 194), outline=dark + (255,), width=W)
        haut = [(44, 84)] + [pt for k in range(4) for pt in ((58 + k * 40, 128), (78 + k * 40, 84))]
        d.polygon(haut + [(212, 62), (44, 62)], fill=c + (255,), outline=dark + (255,))
        d.line(haut, fill=dark + (255,), width=W // 2, joint='curve')
        bas = [(44, 172)] + [pt for k in range(4) for pt in ((58 + k * 40, 128), (78 + k * 40, 172))]
        d.polygon(bas + [(212, 194), (44, 194)], fill=light + (255,), outline=dark + (255,))
        d.line(bas, fill=dark + (255,), width=W // 2, joint='curve')
    elif nom == 'gear-1':          # SPEED COIL: two chevrons
        poly([(52, 44), (128, 128), (52, 212), (86, 212), (162, 128), (86, 44)])
        poly([(126, 44), (202, 128), (126, 212), (160, 212), (236, 128), (160, 44)], light)
    elif nom == 'gear-2':          # SLAP: an open hand
        # Fingers as wide rounded bars over a palm, thumb out to the side. The first pass
        # made them thin and dark and the whole thing read as a cake with candles.
        for k in range(4):
            x = 84 + k * 30
            d.rounded_rectangle((x, 52 + abs(k - 1) * 12, x + 24, 150), radius=12,
                                fill=light + (255,), outline=dark + (255,), width=W - 2)
        d.rounded_rectangle((44, 116, 96, 168), radius=22, fill=light + (255,), outline=dark + (255,), width=W - 2)
        d.rounded_rectangle((72, 122, 210, 216), radius=26, fill=c + (255,), outline=dark + (255,), width=W)
    elif nom == 'gear-3':          # CLOAK: a ghost
        poly([(52, 210), (52, 118), (128, 40), (204, 118), (204, 210),
              (178, 184), (152, 210), (128, 184), (104, 210), (78, 184)])
        ell((94, 106, 118, 136), light); ell((140, 106, 164, 136), light)
    elif nom == 'gear-4':          # BOOGIE BOMB: a bomb with a fuse
        ell((44, 82, 196, 234))
        poly([(148, 70), (188, 70), (188, 96), (148, 96)], mix(c, (0, 0, 0), 0.3))
        trait((188, 82), (222, 40), light, 16)
    elif nom == 'gear-5':          # TASER: a bolt
        poly([(140, 26), (72, 140), (118, 140), (96, 230), (188, 106), (138, 106)])
    elif nom == 'gear-6':          # X-RAY GLASSES
        ell((26, 92, 118, 176)); ell((138, 92, 230, 176))
        d.rectangle((112, 118, 144, 142), fill=c + (255,), outline=dark + (255,), width=W)
    else:                          # SUBSPACE MINE: a spiked ball
        for k in range(8):
            a = k * math.pi / 4
            poly([(cx + math.cos(a) * 118, cy + math.sin(a) * 118),
                  (cx + math.cos(a + 0.42) * 52, cy + math.sin(a + 0.42) * 52),
                  (cx + math.cos(a - 0.42) * 52, cy + math.sin(a - 0.42) * 52)])
        ell((cx - 56, cy - 56, cx + 56, cy + 56), light)
    return im


UI_ICONES = [
    ('crate', '#e0a24a'), ('floor', '#7cc4ff'), ('shield', '#6fb1f2'),
    ('prestige', '#f5a524'), ('luck', '#6cc72e'),
    ('gear-0', '#e06a4a'), ('gear-1', '#4dd2ff'), ('gear-2', '#f2b45a'),
    ('gear-3', '#b48cf0'), ('gear-4', '#ff7a9c'), ('gear-5', '#ffd24a'),
    ('gear-6', '#7de8c8'), ('gear-7', '#9aa9c4'),
]


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
    enseigne().save(os.path.join(OUT, 'sign.png'), optimize=True)
    for nom, col in UI_ICONES:
        ui_icone(nom, col).save(os.path.join(OUT, f'ui-{nom}.png'), optimize=True)
    fade(True).save(os.path.join(OUT, 'fade-left.png'), optimize=True)
    fade(False).save(os.path.join(OUT, 'fade-right.png'), optimize=True)
    print('wrote', OUT)
