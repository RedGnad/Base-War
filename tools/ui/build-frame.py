#!/usr/bin/env python3
"""Writes the square frame a skinned base stands in: a band of colour AROUND the walls.

The first pass laid a full disc under the base, which put colour under the pieces (owner,
4 Sep: not under the pieces). This is a hollow square, drawn once as an alpha-tested
texture on a flat plane: the band hugs the plinth's edge and runs outward, nothing inside.
White, so the material tints it with the skin's colour.

    python3 tools/ui/build-frame.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/textures/frame.png'))
N = 256
INNER = 0.78    # the hole, as a share of the width: what lies under the base stays uncoloured

if __name__ == '__main__':
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, N - 1, N - 1], radius=N // 10, fill=(255, 255, 255, 255))
    k = int(N * (1 - INNER) / 2)
    d.rounded_rectangle([k, k, N - 1 - k, N - 1 - k], radius=N // 12, fill=(0, 0, 0, 0))
    im.save(OUT, optimize=True)
    print('wrote', OUT)
