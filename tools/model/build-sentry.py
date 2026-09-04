"""
The sentry: assets/toy/sentry.glb, one mesh, one tiny palette, origin at the foot.

Until now the sentry was its stand-in, a cyan frustum, because this file did not exist and
the load failed quietly; scaled by its charges, a battery of twenty grew into a four-metre
cone through the walls (owner, 4 Sep: "the big ones stick out of the base, and a cone says
nothing"). What every game draws for "this floor is defended" is a turret: a squat drum, a
dome, one barrel, one glowing eye. Abstract enough to sit with the chess pieces, readable
from the door. The mount spins it slowly; the barrel is what makes the spin visible.

Coordinates are the WORLD's (the writer mirrors X once, for every model alike). The foot
is at y = 0 so the fit places it on the slab at any scale.
"""
import importlib.util
import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/toy'))
_spec = importlib.util.spec_from_file_location('aplatir', os.path.join(HERE, 'aplatir-glb.py'))
aplatir = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(aplatir)

# The palette: one tile per colour, UVs aimed at tile centres.
PALETTE = [
    (43, 58, 85),      # 0 steel, dark: drum, neck, barrel
    (96, 114, 148),    # 1 steel, light: dome
    (77, 210, 255),    # 2 cyan: bands and the eye (the sentry's own hue, TOY.sentry)
    (214, 246, 255),   # 3 cyan-white: the eye's core
    (24, 30, 44)       # 4 near-black: the barrel's bore
]
TILE = 16


def uv(tile):
    return ((tile + 0.5) / len(PALETTE), 0.5)


class Mesh:
    def __init__(self):
        self.pos, self.nor, self.uv, self.idx = [], [], [], []

    def tri(self, a, b, c, n, tile):
        """One triangle, wound so its face points along `n` (right-handed, counter-clockwise)."""
        ab = [b[k] - a[k] for k in range(3)]
        ac = [c[k] - a[k] for k in range(3)]
        cross = (ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0])
        if sum(cross[k] * n[k] for k in range(3)) < 0:
            b, c = c, b
        base = len(self.pos)
        for p in (a, b, c):
            self.pos.append(tuple(p)); self.nor.append(tuple(n)); self.uv.append(uv(tile))
        self.idx.extend((base, base + 1, base + 2))

    def quad(self, a, b, c, d, n, tile):
        self.tri(a, b, c, n, tile)
        self.tri(a, c, d, n, tile)


def unit(v):
    l = math.sqrt(sum(x * x for x in v)) or 1
    return tuple(x / l for x in v)


def cylinder_y(m, cx, cz, r0, r1, y0, y1, tile, segs=20, caps=(True, True)):
    """A cylinder or frustum on the Y axis: radius r0 at y0, r1 at y1."""
    ring = lambda r, y: [(cx + r * math.cos(2 * math.pi * k / segs), y, cz + r * math.sin(2 * math.pi * k / segs)) for k in range(segs)]
    lo, hi = ring(r0, y0), ring(r1, y1)
    slope = (r0 - r1) / max(1e-6, (y1 - y0))
    for k in range(segs):
        k2 = (k + 1) % segs
        mid = ((lo[k][0] + lo[k2][0]) / 2 - cx, 0, (lo[k][2] + lo[k2][2]) / 2 - cz)
        n = unit((mid[0], slope * math.hypot(mid[0], mid[2]), mid[2]))
        m.quad(lo[k], lo[k2], hi[k2], hi[k], n, tile)
    if caps[0]:
        for k in range(segs):
            m.tri((cx, y0, cz), lo[k], lo[(k + 1) % segs], (0, -1, 0), tile)
    if caps[1]:
        for k in range(segs):
            m.tri((cx, y1, cz), hi[k], hi[(k + 1) % segs], (0, 1, 0), tile)


def cylinder_z(m, cx, cy, r, z0, z1, tile, segs=16, caps=(True, True), tile_end=None):
    """A cylinder along Z (the barrel), from z0 to z1."""
    ring = lambda z: [(cx + r * math.cos(2 * math.pi * k / segs), cy + r * math.sin(2 * math.pi * k / segs), z) for k in range(segs)]
    lo, hi = ring(z0), ring(z1)
    for k in range(segs):
        k2 = (k + 1) % segs
        n = unit(((lo[k][0] + lo[k2][0]) / 2 - cx, (lo[k][1] + lo[k2][1]) / 2 - cy, 0))
        m.quad(lo[k], lo[k2], hi[k2], hi[k], n, tile)
    if caps[0]:
        for k in range(segs):
            m.tri((cx, cy, z0), lo[k], lo[(k + 1) % segs], (0, 0, -1), tile)
    if caps[1]:
        for k in range(segs):
            m.tri((cx, cy, z1), hi[k], hi[(k + 1) % segs], (0, 0, 1), tile_end if tile_end is not None else tile)


def sphere(m, cx, cy, cz, r, tile, rings=10, segs=20, sy=1.0):
    """A sphere, squashed by `sy` on Y, faceted the way a low-poly dome should be."""
    def p(i, j):
        phi = math.pi * i / rings
        th = 2 * math.pi * j / segs
        return (cx + r * math.sin(phi) * math.cos(th), cy + r * sy * math.cos(phi), cz + r * math.sin(phi) * math.sin(th))
    for i in range(rings):
        for j in range(segs):
            a, b, c, d = p(i, j), p(i, j + 1), p(i + 1, j + 1), p(i + 1, j)
            centre = tuple(sum(q[k] for q in (a, b, c, d)) / 4 for k in range(3))
            n = unit((centre[0] - cx, (centre[1] - cy) / max(1e-6, sy), centre[2] - cz))
            if i == 0:
                m.tri(a, c, d, n, tile)
            elif i == rings - 1:
                m.tri(a, b, c, n, tile)
            else:
                m.quad(a, b, c, d, n, tile)


def sentry():
    m = Mesh()
    # Drum: a squat frustum, then a cyan band on its shoulder.
    cylinder_y(m, 0, 0, 0.44, 0.38, 0.00, 0.50, 0)
    cylinder_y(m, 0, 0, 0.40, 0.40, 0.50, 0.58, 2)
    # Neck.
    cylinder_y(m, 0, 0, 0.16, 0.16, 0.58, 0.76, 0, caps=(False, False))
    # Head: a flattened dome.
    sphere(m, 0, 1.02, 0, 0.36, 1, sy=0.82)
    # Barrel along +Z with a dark bore at the end, and a cyan collar at its root.
    cylinder_z(m, 0, 1.02, 0.10, 0.22, 0.80, 0, tile_end=4)
    cylinder_z(m, 0, 1.02, 0.13, 0.32, 0.42, 2)
    # The eye: a cyan disc on the dome's brow, above the barrel, with a white-cyan core.
    cylinder_z(m, 0, 1.18, 0.09, 0.26, 0.36, 2)
    cylinder_z(m, 0, 1.18, 0.05, 0.36, 0.375, 3)
    return {'pos': m.pos, 'nor': m.nor, 'uv_atlas': m.uv, 'idx': m.idx}


def main():
    os.makedirs(OUT, exist_ok=True)
    atlas = Image.new('RGBA', (TILE * len(PALETTE), TILE), (0, 0, 0, 255))
    for i, col in enumerate(PALETTE):
        atlas.paste(col + (255,), (i * TILE, 0, (i + 1) * TILE, TILE))
    prim = sentry()
    chemin = os.path.join(OUT, 'sentry.glb')
    taille = aplatir.ecrire_glb(chemin, [(False, [prim])], atlas)
    xs = [p[0] for p in prim['pos']]; ys = [p[1] for p in prim['pos']]; zs = [p[2] for p in prim['pos']]
    print(f"sentry.glb  {taille/1024:.1f} Ko  {len(prim['idx'])//3} triangles  "
          f"x {min(xs):.2f}..{max(xs):.2f}  y {min(ys):.2f}..{max(ys):.2f}  z {min(zs):.2f}..{max(zs):.2f}")


if __name__ == '__main__':
    main()
