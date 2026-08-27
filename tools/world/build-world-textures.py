#!/usr/bin/env python3
"""Draws the two textures the world animates.

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


def flow():
    """Bright cracks across a dark crust, periodic in both axes so the tile has no seam."""
    im = Image.new('RGB', (N, N))
    px = im.load()
    tau = 2 * math.pi
    for j in range(N):
        y = j / N
        for i in range(N):
            x = i / N
            f1 = math.sin(tau * 2 * x + 1.2 * math.sin(tau * y) + 0.6 * math.sin(tau * 3 * y))
            f2 = math.sin(tau * 2 * y + 1.2 * math.sin(tau * x) + 0.6 * math.sin(tau * 3 * x))
            g = max(math.exp(-(f1 / 0.16) ** 2), math.exp(-(f2 / 0.16) ** 2))
            v = int(round(255 * (0.40 + 0.60 * g)))
            px[i, j] = (v, v, v)
    return im


def glitter():
    """A bright field with sparse glints, each drawn with its wrap-around copies so the tile has no seam."""
    import random
    random.seed(11)
    im = Image.new('RGB', (N, N), (190, 190, 190))
    px = im.load()
    glints = [(random.random() * N, random.random() * N, 2.5 + random.random() * 3.5) for _ in range(46)]
    for j in range(N):
        for i in range(N):
            v = 0.0
            for (gx, gy, r) in glints:
                dx = min(abs(i - gx), N - abs(i - gx))
                dy = min(abs(j - gy), N - abs(j - gy))
                d2 = dx * dx + dy * dy
                if d2 < r * r * 9:
                    v = max(v, math.exp(-d2 / (r * r)))
            g = int(round(190 + 65 * v))
            px[i, j] = (g, g, g)
    return im


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    belt().save(os.path.join(OUT, 'belt.png'), optimize=True)
    flow().save(os.path.join(OUT, 'flow.png'), optimize=True)
    glitter().save(os.path.join(OUT, 'glitter.png'), optimize=True)
    # A white square: the texture a material names when it wants NO picture. Omitting the
    # texture field leaves the client on whatever it drew last; naming this one replaces it.
    Image.new('RGB', (8, 8), (255, 255, 255)).save(os.path.join(OUT, 'blank.png'), optimize=True)
    print('wrote', OUT)
