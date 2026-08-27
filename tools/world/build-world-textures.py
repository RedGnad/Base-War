#!/usr/bin/env python3
"""Draws the textures the world animates: the belt tread and the three event mats.

The renderer can slide a texture's UV offset at a constant speed (`Tween.setTextureMoveContinuous`),
and that is how the belt runs and how the floor flows during an event. Both need an image that
tiles: the belt's tread is one square cell, the floor's veins are a sum of sines with whole-number
frequencies, so both wrap without a seam under TWM_REPEAT. The floor image is grey on purpose:
the material's albedo colour multiplies it, so one image serves Gold, Lava and Cursed Hour.

Requires Python with Pillow. The outputs are committed, so building the scene needs neither.

    python3 tools/world/build-world-textures.py
"""
import math
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/textures'))
N = 256

# The palette of src/client/toy.ts, by role.
BELT = (0xE6, 0x39, 0x46)
TREAD = (0xF2, 0xE9, 0xD8)
SEAM = (0x2B, 0x2D, 0x42)


def belt():
    """One cell of tread: two cream bars across the direction of travel (u), each edged dark."""
    im = Image.new('RGB', (N, N), BELT)
    d = ImageDraw.Draw(im)
    for x0 in (40, 168):
        d.rectangle([x0 - 4, 0, x0 + 51, N - 1], fill=SEAM)
        d.rectangle([x0, 0, x0 + 47, N - 1], fill=TREAD)
    return im


def mat(kind):
    """A play mat's pattern: soft, slow, low-contrast, periodic in both axes.

    The first event floor was a cracked crust at full contrast, repeated twenty-four times
    across the plaza and tinted to saturation: it tiled like a bathroom and read as lava in
    every colour. A mat keeps the ground a ground. Values stay between 0.72 and 1.0 so the
    tint (a mid-tone from the palette) carries the colour and the pattern only breathes.
    """
    import random
    im = Image.new('RGB', (N, N))
    px = im.load()
    tau = 2 * math.pi
    random.seed(11)
    glints = [(random.random() * N, random.random() * N, 2.5 + random.random() * 3.0) for _ in range(28)]
    for j in range(N):
        y = j / N
        for i in range(N):
            x = i / N
            if kind == 'gold':
                base = 0.5 + 0.5 * math.sin(tau * (x + 0.5 * math.sin(tau * y))) * math.sin(tau * (y + 0.5 * math.sin(tau * x)))
                v = 0.10 * base
                for (gx, gy, r) in glints:
                    dx = min(abs(i - gx), N - abs(i - gx))
                    dy = min(abs(j - gy), N - abs(j - gy))
                    d2 = dx * dx + dy * dy
                    if d2 < r * r * 9:
                        v = max(v, 0.28 * math.exp(-d2 / (r * r)))
            elif kind == 'lava':
                a = math.sin(tau * (2 * x + 0.45 * math.sin(tau * y)))
                b = math.sin(tau * (2 * y + 0.45 * math.sin(tau * x)))
                v = 0.28 * (0.5 + 0.5 * a * b)
            else:
                a = math.sin(tau * (3 * x + y) + 1.1 * math.sin(tau * (x - 2 * y)))
                b = math.sin(tau * (x - 3 * y) + 1.1 * math.sin(tau * (2 * x + y)))
                v = 0.26 * (0.5 + 0.25 * (a + b))
            g = int(round(255 * (0.72 + v)))
            px[i, j] = (g, g, g)
    return im


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    belt().save(os.path.join(OUT, 'belt.png'), optimize=True)
    for k in ('gold', 'lava', 'cursed'):
        mat(k).save(os.path.join(OUT, f'mat-{k}.png'), optimize=True)
    # A white square: the texture a material names when it wants NO picture. Omitting the
    # texture field leaves the client on whatever it drew last; naming this one replaces it.
    Image.new('RGB', (8, 8), (255, 255, 255)).save(os.path.join(OUT, 'blank.png'), optimize=True)
    print('wrote', OUT)
