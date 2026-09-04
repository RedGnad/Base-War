"""
The muzzle flash sprite: assets/ui/flash.png.

What a gunshot draws at the barrel's mouth in every mobile shooter that cannot afford
particles: a spiky star with a white-hot core, yellow lobes and an orange fringe, on a
transparent ground, drawn one or two frames at random roll and size. The shape is built
from a fan of uneven spikes so no two rolls read the same, then blurred a touch so the
edges glow instead of cutting.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/ui'))
S = 256


def spikes(draw, cx, cy, count, long, short, half, colour, seed):
    rng = random.Random(seed)
    for k in range(count):
        a = k * 2 * math.pi / count + rng.uniform(-0.12, 0.12)
        reach = long if k % 2 == 0 else short
        reach *= rng.uniform(0.82, 1.0)
        pts = [(cx + math.cos(a - half) * 22, cy + math.sin(a - half) * 22),
               (cx + math.cos(a + half) * 22, cy + math.sin(a + half) * 22),
               (cx + math.cos(a) * reach, cy + math.sin(a) * reach)]
        draw.polygon(pts, fill=colour)


def halo(im, cx, cy, radius, colour, alpha):
    """A radial gradient disc: full at the centre, gone at `radius`."""
    px = im.load()
    for y in range(int(cy - radius), int(cy + radius) + 1):
        for x in range(int(cx - radius), int(cx + radius) + 1):
            dist = math.hypot(x - cx, y - cy) / radius
            if dist >= 1:
                continue
            a = int(alpha * (1 - dist) ** 1.5)
            r0, g0, b0, a0 = px[x, y]
            if a > a0:
                px[x, y] = (colour[0], colour[1], colour[2], a)


def flash():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = cy = S / 2
    # Orange fringe: the widest, softest layer, fat spikes.
    spikes(d, cx, cy, 9, 124, 90, 0.30, (255, 150, 50, 200), 7)
    im = im.filter(ImageFilter.GaussianBlur(3))
    # A warm halo under everything so the star reads as light, not as a drawing.
    halo(im, cx, cy, 78, (255, 200, 90), 210)
    d = ImageDraw.Draw(im)
    # Yellow lobes: sharper, shorter.
    spikes(d, cx, cy, 7, 104, 74, 0.20, (255, 222, 110, 245), 3)
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(im)
    # White-hot core.
    d.ellipse((cx - 34, cy - 34, cx + 34, cy + 34), fill=(255, 246, 210, 255))
    d.ellipse((cx - 21, cy - 21, cx + 21, cy + 21), fill=(255, 255, 255, 255))
    im = im.filter(ImageFilter.GaussianBlur(1.0))
    # Radial falloff so the fringe melts away instead of ending on the sprite's edge.
    px = im.load()
    for y in range(S):
        for x in range(S):
            r0, g0, b0, a0 = px[x, y]
            if a0 == 0:
                continue
            dist = math.hypot(x - cx, y - cy) / (S / 2)
            px[x, y] = (r0, g0, b0, int(a0 * max(0.0, 1 - dist ** 3)))
    return im


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    flash().save(os.path.join(OUT, 'flash.png'), optimize=True)
    print('flash.png written')
