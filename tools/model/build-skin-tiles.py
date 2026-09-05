#!/usr/bin/env python3
"""
Periodic tiles for the base skins that carry a pattern, written to tools/model/source/skin-tiles/
and embedded by build-storey.js into the accent, climb and frame files of those skins.

The pieces get their pattern baked in object space (build-item-variants.py); the storey parts
are boxes with box-mapped UVs in metres, so they take a TILE that repeats: every lattice here is
wrapped modulo the tile, which makes the tile seamless with itself. Same recipes, same colours
as the pieces, so a Lava base is ringed and pillared in the crust its Lava pieces wear.
"""
import io, math, os
from PIL import Image

TEX_OUT = 256
SUPER = 2  # baked at 512, box-filtered to 256: soft crack edges
TEX = TEX_OUT * SUPER
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'source', 'skin-tiles')

def hash2(x, y, seed):
    h = (x * 374761393 + y * 668265263 + seed * 1013904223) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296.0

def clamp(k): return 0.0 if k < 0 else (1.0 if k > 1 else k)

def hsv(h, s, v):
    i = int(h * 6) % 6; f = h * 6 - int(h * 6); p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return (int(r * 255), int(g * 255), int(b * 255))

def voronoi2(seed, n):
    """Gap between the two nearest seeds of a jittered n x n lattice wrapped on the tile, in cell units."""
    seeds = {}
    def seed_of(cx, cy):
        k = (cx % n, cy % n)
        if k not in seeds: seeds[k] = (hash2(k[0], k[1], seed), hash2(k[0], k[1], seed + 1))
        return seeds[k]
    def edge(x, y):
        fx, fy = x * n, y * n; ix, iy = math.floor(fx), math.floor(fy)
        d1 = d2 = 1e9
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                jx, jy = seed_of(ix + ox, iy + oy)
                d = (fx - ix - ox - jx) ** 2 + (fy - iy - oy - jy) ** 2
                if d < d1: d2 = d1; d1 = d
                elif d < d2: d2 = d
        return math.sqrt(d2) - math.sqrt(d1)
    return edge

def noise2(x, y, n, seed):
    fx, fy = x * n, y * n; ix, iy = math.floor(fx), math.floor(fy)
    tx, ty = [t * t * (3 - 2 * t) for t in (fx - ix, fy - iy)]
    c = lambda dx, dy: hash2((ix + dx) % n, (iy + dy) % n, seed)
    top = c(0, 0) + (c(1, 0) - c(0, 0)) * tx; bot = c(0, 1) + (c(1, 1) - c(0, 1)) * tx
    return top + (bot - top) * ty

def mottle2(x, y, seed): return 0.75 + 0.5 * (0.6 * noise2(x, y, 3, seed) + 0.4 * noise2(x, y, 12, seed + 1))

def tile(fn):
    im = Image.new('RGB', (TEX, TEX))
    im.putdata([fn((x + 0.5) / TEX, (y + 0.5) / TEX) for y in range(TEX) for x in range(TEX)])
    return im.resize((TEX_OUT, TEX_OUT), Image.BOX)

def lava():
    # Crust, not crackle: thick molten channels between plates of sixty centimetres (three per
    # 1.8 m tile), a hot core fading to orange at the channel's edge, a cooled dark rim on each
    # plate, embers glowing past the rim. The pieces keep their thin cracks; the base is read
    # from the plaza edge (owner, 5 Sep: "vraiment un effet croute de lave").
    edge = voronoi2(5, 3); W = 0.14
    def albedo(x, y):
        e = edge(x, y); m = mottle2(x, y, 55)
        if e < W:
            t = e / W  # 0 at the channel's centre, 1 at its edge
            return tuple(int(c + (r - c) * t) for c, r in zip((255, 214, 96), (225, 64, 14)))
        rim = clamp((0.24 - e) / 0.10)  # the plate's edge, cooled darker
        return tuple(int(c * (1 - 0.45 * rim)) for c in (36 * m, 22 * m, 18 * m))
    def glow(x, y):
        e = edge(x, y)
        if e < W:
            t = e / W
            return (int(255 - 25 * t), int(190 - 120 * t), int(60 - 45 * t))
        g = 0.35 * clamp((0.34 - e) / 0.20) ** 2
        return (int(255 * g), int(110 * g), int(20 * g))
    return albedo, glow

def cursed():
    # Veins of constant width: the distance to the middle level of a three-octave noise (its
    # offset divided by the local slope), not a band in value, which swells where the noise is
    # flat and reads as blobs (5 Sep).
    # Two families: the main veins, and finer, fainter ones threading between them.
    def n1(x, y): return 0.55 * noise2(x, y, 2, 91) + 0.3 * noise2(x, y, 5, 92) + 0.15 * noise2(x, y, 13, 93)
    def n2(x, y): return 0.5 * noise2(x, y, 3, 94) + 0.3 * noise2(x, y, 7, 95) + 0.2 * noise2(x, y, 17, 96)
    h = 1.0 / TEX; W = 0.006  # half-width of a main vein, in tile units: about a centimetre at 1.8 m
    def dist_to(n, x, y):
        v = n(x, y); g = math.hypot((n(x + h, y) - v) / h, (n(x, y + h) - v) / h)
        return abs(v - 0.5) / max(1e-6, g)
    k = [0.0] * (TEX * TEX)
    for j in range(TEX):
        y = (j + 0.5) / TEX
        for i in range(TEX):
            x = (i + 0.5) / TEX
            k[j * TEX + i] = max(clamp((W - dist_to(n1, x, y)) / W), 0.45 * clamp((0.6 * W - dist_to(n2, x, y)) / (0.6 * W)))
    def k_at(x, y): return k[int(y * TEX) * TEX + int(x * TEX)]
    def albedo(x, y):
        k = k_at(x, y); m = mottle2(x, y, 99)
        return tuple(int(c + (t - c) * k) for c, t in zip((30 * m, 6 * m, 40 * m), (120, 40, 170)))
    def glow(x, y):
        k = k_at(x, y)
        return (int(150 * k), int(40 * k), int(220 * k))
    return albedo, glow

def galaxy():
    def albedo(x, y):
        n = 0.6 * noise2(x, y, 3, 6) + 0.4 * noise2(x, y, 8, 7)
        return (int(20 + 50 * n), int(6 + 18 * n), int(45 + 70 * n))
    tints = [(255, 255, 255), (255, 210, 240), (200, 225, 255), (180, 180, 220)]
    def glow(x, y):
        c = (math.floor(x * 60) % 60, math.floor(y * 60) % 60)
        if hash2(c[0], c[1], 66) > 0.035: return (0, 0, 0)
        return tints[int(hash2(c[0], c[1], 67) * 4)]
    return albedo, glow

def cyber_glow(x, y):
    # Six cells per tile, a node at every crossing: the same mesh the Cyber pieces wear.
    w = 0.05
    near = sum(1 for c in (x, y) if abs(((c * 6) % 1.0) - 0.5) > 0.5 - w)
    return (0, 229, 255) if near >= 2 else ((0, 150, 175) if near == 1 else (0, 0, 0))

def rainbow_albedo(x, y):
    # The hue runs down the tile: with the tile mapped on height, red at the foot, violet at the top.
    return hsv(y * 0.92, 0.95, 0.9)

def main():
    os.makedirs(OUT, exist_ok=True)
    lava_a, lava_g = lava(); cursed_a, cursed_g = cursed(); galaxy_a, galaxy_g = galaxy()
    tiles = {
        'skin-5-albedo': lava_a, 'skin-5-glow': lava_g,
        'skin-9-albedo': cursed_a, 'skin-9-glow': cursed_g,
        'skin-6-albedo': galaxy_a, 'skin-6-glow': galaxy_g,
        'skin-12-glow': cyber_glow,
        'skin-11-albedo': rainbow_albedo
    }
    for name, fn in tiles.items():
        tile(fn).save(os.path.join(OUT, name + '.png'), optimize=True)
    print(f'{len(tiles)} tiles written to {os.path.relpath(OUT)}')

if __name__ == '__main__':
    main()
