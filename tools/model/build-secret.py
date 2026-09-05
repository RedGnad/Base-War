"""The Secret piece as a model: a planet and its ring, one mesh with real UVs.

The Secret was the only rarity drawn from primitives (a sphere and a disc tinted at runtime),
so it had no baked variants: a Cursed Secret glowed pink instead of wearing the cursed veins,
and each one cost the phone two materials (owner, 5 Sep, 04:30). One mesh, authored in the
piece's unit space like the chess set (sphere diameter 0.6, ring diameter 1.3, thickness 0.08,
centred on the origin), so `tools/model/build-item-variants.py` bakes it like the others.
Sphere UVs are longitude and latitude; the ring's run around it and across it, so a gradient
wraps, a star field spreads and a grid tiles.

Usage: python3 tools/model/build-secret.py  ->  assets/toy/item-6.glb
"""
import importlib.util, math, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/toy'))
_spec = importlib.util.spec_from_file_location('aplatir', os.path.join(HERE, 'aplatir-glb.py'))
aplatir = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(aplatir)

class Mesh:
    def __init__(self): self.pos, self.nor, self.uv, self.idx = [], [], [], []
    def vertex(self, p, n, uv):
        self.pos.append(tuple(p)); self.nor.append(tuple(n)); self.uv.append(tuple(uv)); return len(self.pos) - 1
    def tri(self, a, b, c): self.idx.extend((a, b, c))

def sphere(m, r, lon=28, lat=16):
    rows = []
    for j in range(lat + 1):
        phi = math.pi * j / lat
        row = []
        for i in range(lon + 1):
            th = 2 * math.pi * i / lon
            n = (math.sin(phi) * math.cos(th), math.cos(phi), math.sin(phi) * math.sin(th))
            row.append(m.vertex((n[0] * r, n[1] * r, n[2] * r), n, (i / lon, j / lat)))
        rows.append(row)
    for j in range(lat):
        for i in range(lon):
            a, b, c, d = rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]
            if j > 0: m.tri(a, d, b)
            if j < lat - 1: m.tri(b, d, c)

def ring(m, r_in, r_out, h, segs=48):
    for side, n in ((h / 2, (0, 1, 0)), (-h / 2, (0, -1, 0))):
        inner, outer = [], []
        for i in range(segs + 1):
            th = 2 * math.pi * i / segs; c, s = math.cos(th), math.sin(th)
            inner.append(m.vertex((c * r_in, side, s * r_in), n, (i / segs, 0.0)))
            outer.append(m.vertex((c * r_out, side, s * r_out), n, (i / segs, 1.0)))
        for i in range(segs):
            if side > 0: m.tri(inner[i], outer[i], outer[i + 1]); m.tri(inner[i], outer[i + 1], inner[i + 1])
            else: m.tri(inner[i], outer[i + 1], outer[i]); m.tri(inner[i], inner[i + 1], outer[i + 1])
    for rad, out in ((r_out, True), (r_in, False)):
        top, bot = [], []
        for i in range(segs + 1):
            th = 2 * math.pi * i / segs; c, s = math.cos(th), math.sin(th)
            n = (c, 0, s) if out else (-c, 0, -s)
            top.append(m.vertex((c * rad, h / 2, s * rad), n, (i / segs, 1.0 if out else 0.0)))
            bot.append(m.vertex((c * rad, -h / 2, s * rad), n, (i / segs, 1.0 if out else 0.0)))
        for i in range(segs):
            if out: m.tri(top[i], bot[i], bot[i + 1]); m.tri(top[i], bot[i + 1], top[i + 1])
            else: m.tri(top[i], bot[i + 1], bot[i]); m.tri(top[i], top[i + 1], bot[i + 1])

def main():
    m = Mesh()
    sphere(m, 0.30)
    ring(m, 0.42, 0.65, 0.08)
    prim = {'pos': m.pos, 'nor': m.nor, 'uv_atlas': m.uv, 'idx': m.idx}
    atlas = Image.new('RGBA', (4, 4), (255, 255, 255, 255))
    taille = aplatir.ecrire_glb(os.path.join(OUT, 'item-6.glb'), [(False, [prim])], atlas)
    print(f"item-6.glb  {taille/1024:.1f} Ko  {len(m.idx)//3} triangles")

if __name__ == '__main__':
    main()
