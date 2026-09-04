"""
The padlock on the lock post: assets/toy/lock-open.glb and lock-shut.glb, one mesh each.

The post carried the button's padlock GLYPH on a floating plane, which matched the button
and clashed with the venue: everything else in the world is a volume, text excepted (owner,
4 Sep). So the padlock is a volume with the glyph's proportions, brass body and steel
shackle, and its STATE is a gesture: the shackle raised when the lock is ready, seated when
the base is sealed. Two files, one object, swapped by `src`.

Coordinates are the WORLD's (the writer mirrors X once, for every model alike). Origin at
the bottom centre of the body.
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

PALETTE = [
    (232, 176, 74),    # 0 brass: the body
    (255, 214, 130),   # 1 brass, lit: the body's top bevel
    (108, 116, 132),   # 2 steel: the shackle
    (40, 30, 18)       # 3 near-black: the keyhole
]
TILE = 16
ATLAS = 'lock-atlas.png'


def uv(tile):
    return ((tile + 0.5) / len(PALETTE), 0.5)


class Mesh:
    def __init__(self):
        self.pos, self.nor, self.uv, self.idx = [], [], [], []

    def tri(self, a, b, c, n, tile):
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


def box(m, cx, cy, cz, sx, sy, sz, tile, tile_top=None):
    x0, x1, y0, y1, z0, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2
    faces = [
        ((0, 0, 1), [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]),
        ((0, 0, -1), [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)]),
        ((1, 0, 0), [(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)]),
        ((-1, 0, 0), [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)]),
        ((0, 1, 0), [(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)]),
        ((0, -1, 0), [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)])
    ]
    for n, pts in faces:
        t = tile_top if (tile_top is not None and n == (0, 1, 0)) else tile
        m.quad(*pts, n, t)


def frame(p0, p1):
    """An orthonormal basis (u, v) around the axis from p0 to p1."""
    a = unit(tuple(p1[k] - p0[k] for k in range(3)))
    helper = (0, 0, 1) if abs(a[2]) < 0.9 else (1, 0, 0)
    u = unit((a[1] * helper[2] - a[2] * helper[1], a[2] * helper[0] - a[0] * helper[2], a[0] * helper[1] - a[1] * helper[0]))
    v = (a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0])
    return a, u, v


def tube(m, p0, p1, r, tile, segs=12, caps=(True, True)):
    """A straight tube from p0 to p1."""
    a, u, v = frame(p0, p1)
    ring = lambda p: [tuple(p[k] + r * (math.cos(2 * math.pi * i / segs) * u[k] + math.sin(2 * math.pi * i / segs) * v[k]) for k in range(3)) for i in range(segs)]
    lo, hi = ring(p0), ring(p1)
    for i in range(segs):
        j = (i + 1) % segs
        n = unit(tuple((lo[i][k] + lo[j][k]) / 2 - p0[k] for k in range(3)))
        m.quad(lo[i], lo[j], hi[j], hi[i], n, tile)
    if caps[0]:
        for i in range(segs):
            m.tri(p0, lo[i], lo[(i + 1) % segs], tuple(-x for x in a), tile)
    if caps[1]:
        for i in range(segs):
            m.tri(p1, hi[i], hi[(i + 1) % segs], a, tile)


def arc(m, cx, cy, cz, radius, r, a0, a1, tile, steps=12, segs=12):
    """A bent tube in the XY plane, from angle a0 to a1 around (cx, cy), tube radius r."""
    def centre(t):
        ang = a0 + (a1 - a0) * t
        return (cx + radius * math.cos(ang), cy + radius * math.sin(ang), cz)
    def ring(t):
        c = centre(t)
        ang = a0 + (a1 - a0) * t
        radial = (math.cos(ang), math.sin(ang), 0)
        out = []
        for i in range(segs):
            th = 2 * math.pi * i / segs
            out.append((c[0] + r * (math.cos(th) * radial[0]), c[1] + r * (math.cos(th) * radial[1]), c[2] + r * math.sin(th)))
        return out
    prev = ring(0)
    for s in range(1, steps + 1):
        cur = ring(s / steps)
        cprev, ccur = centre((s - 1) / steps), centre(s / steps)
        for i in range(segs):
            j = (i + 1) % segs
            mid = tuple((prev[i][k] + prev[j][k] + cur[i][k] + cur[j][k]) / 4 for k in range(3))
            cmid = tuple((cprev[k] + ccur[k]) / 2 for k in range(3))
            n = unit(tuple(mid[k] - cmid[k] for k in range(3)))
            m.quad(prev[i], prev[j], cur[j], cur[i], n, tile)
        prev = cur


BODY_W, BODY_H, BODY_D = 0.34, 0.28, 0.12
SHACKLE_R = 0.026
LEG_X = 0.10


def padlock(open_):
    m = Mesh()
    # Body with a lit top bevel, keyhole on the front (+z) face.
    box(m, 0, BODY_H / 2, 0, BODY_W, BODY_H, BODY_D, 0, tile_top=1)
    tube(m, (0, 0.165, BODY_D / 2 - 0.004), (0, 0.165, BODY_D / 2 + 0.006), 0.030, 3)
    box(m, 0, 0.105, BODY_D / 2 + 0.001, 0.026, 0.07, 0.010, 3)
    # Shackle: a long left leg, a short right leg, a half ring on top. Raised when open.
    lift = 0.10 if open_ else 0.0
    top = 0.36 + lift
    tube(m, (-LEG_X, 0.14 + lift, 0), (-LEG_X, top, 0), SHACKLE_R, 2, caps=(True, False))
    tube(m, (LEG_X, 0.25 + lift, 0), (LEG_X, top, 0), SHACKLE_R, 2, caps=(True, False))
    arc(m, 0, top, 0, LEG_X, SHACKLE_R, 0, math.pi, 2)
    return {'pos': m.pos, 'nor': m.nor, 'uv_atlas': m.uv, 'idx': m.idx}


def main():
    os.makedirs(OUT, exist_ok=True)
    atlas = Image.new('RGBA', (TILE * len(PALETTE), TILE), (0, 0, 0, 255))
    for i, col in enumerate(PALETTE):
        atlas.paste(col + (255,), (i * TILE, 0, (i + 1) * TILE, TILE))
    atlas.save(os.path.join(OUT, ATLAS), format='PNG', optimize=True)
    for name, open_ in (('lock-open.glb', True), ('lock-shut.glb', False)):
        prim = padlock(open_)
        taille = aplatir.ecrire_glb(os.path.join(OUT, name), [(False, [prim])], atlas, image_uri=ATLAS)
        ys = [p[1] for p in prim['pos']]
        print(f"{name}  {taille/1024:.1f} Ko  {len(prim['idx'])//3} triangles  y {min(ys):.2f}..{max(ys):.2f}")


if __name__ == '__main__':
    main()
