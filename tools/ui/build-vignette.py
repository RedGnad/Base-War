#!/usr/bin/env python3
"""
The screen frame that says a state is on you: a vignette, transparent in the middle.

A corner chip is read once and then forgotten; a state that changes how the world treats you
has to be felt while you play, and the genre's answer for invisibility (and for every buff of
that kind) is a tint at the EDGES of the screen, where it never covers what you are aiming at
(owner, 5 Sep: "il faut un feedback visuel clair"). White, so the interface tints it per state.

    python3 tools/ui/build-vignette.py
"""
import math, os
from PIL import Image

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'ui'))
W, H = 512, 288

def main():
    im = Image.new('RGBA', (W, H)); px = im.load()
    for y in range(H):
        for x in range(W):
            # Distance to the nearest edge, in fractions of the half-size: 0 at the border.
            dx = min(x, W - 1 - x) / (W / 2)
            dy = min(y, H - 1 - y) / (H / 2)
            d = min(dx, dy)
            a = 0.0 if d > 0.42 else (1 - d / 0.42) ** 2.1
            px[x, y] = (255, 255, 255, int(235 * a))
    im.save(os.path.join(OUT, 'vignette.png'), format='PNG', optimize=True)
    print(f"vignette.png  {os.path.getsize(os.path.join(OUT, 'vignette.png')) / 1024:.1f} KB  {W}x{H}")

if __name__ == '__main__':
    main()
