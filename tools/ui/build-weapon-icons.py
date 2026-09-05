#!/usr/bin/env python3
"""
The weapon icons, drawn FROM the weapons.

The HUD button wore one hand-drawn pistol whatever the player held, and it did not match the
pistol in the scene: a control whose picture is not the thing it controls costs a beat of
reading every time (owner, 5 Sep). So the gun icon is the gun MODEL's own silhouette, side on,
and the two melee weapons get their own icons, built from the very box tables client/combat.ts
uses to assemble them. White on transparent, like the rest of the `icon-` family, at the size
the client's touch buttons expect.

    python3 tools/ui/build-weapon-icons.py
"""
import json, math, os, struct
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'ui')
SIZE, SS = 256, 4            # drawn at four times the size, then filtered down
MARGIN = 26

def canvas(): return Image.new('L', (SIZE * SS, SIZE * SS), 0)

def finish(mask, name):
    """A white glyph with the mask as its alpha, softened the way the other icons are."""
    m = mask.resize((SIZE, SIZE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    im = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
    im.putalpha(m)
    im.save(os.path.join(OUT, name), format='PNG', optimize=True)
    return os.path.getsize(os.path.join(OUT, name))

def fit(points):
    """Scale a list of (x, y) in model units into the canvas, keeping the aspect ratio. Model
    y points up and image y points down, so the mapping flips it."""
    xs = [p[0] for p in points]; ys = [-p[1] for p in points]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    k = (SIZE * SS - 2 * MARGIN * SS) / max(w, h)
    ox = (SIZE * SS - w * k) / 2 - min(xs) * k
    oy = (SIZE * SS - h * k) / 2 - min(ys) * k
    return lambda p: (p[0] * k + ox, -p[1] * k + oy)

def gun_triangles():
    """The pistol's triangles, projected on its side view (z across, y up)."""
    b = open(os.path.join(ROOT, 'assets', 'Models', 'gun.glb'), 'rb').read()
    L = struct.unpack_from('<I', b, 12)[0]; js = json.loads(b[20:20 + L]); off = 20 + L
    L2 = struct.unpack_from('<I', b, off)[0]; bin_ = b[off + 8:off + 8 + L2]
    def acc(i, fmt, n):
        a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
        base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        size = struct.calcsize('<' + fmt * n); stride = bv.get('byteStride', size)
        return [struct.unpack_from('<' + fmt * n, bin_, base + k * stride) for k in range(a['count'])]
    tris = []
    for mesh in js['meshes']:
        for prim in mesh['primitives']:
            P = acc(prim['attributes']['POSITION'], 'f', 3)
            ia = js['accessors'][prim['indices']]
            fmt = {5121: 'B', 5123: 'H', 5125: 'I'}[ia['componentType']]
            I = [t[0] for t in acc(prim['indices'], fmt, 1)]
            for t in range(0, len(I), 3):
                tris.append([(-P[I[t + k]][2], P[I[t + k]][1]) for k in range(3)])
    return tris

def upright(tris):
    """Turn the pistol so its barrel lies horizontal and points right, and the grip hangs
    below: the model is authored at the angle a held hand wants, which reads as a fallen gun
    in a square icon."""
    pts = [p for tri in tris for p in tri]
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - cx) ** 2 for p in pts); syy = sum((p[1] - cy) ** 2 for p in pts)
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in pts)
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)      # the long axis of the silhouette
    c, s = math.cos(-ang), math.sin(-ang)
    turn = lambda p: ((p[0] - cx) * c - (p[1] - cy) * s, (p[0] - cx) * s + (p[1] - cy) * c)
    out = [[turn(p) for p in tri] for tri in tris]
    pts = [p for tri in out for p in tri]
    # The muzzle points RIGHT, as the icon it replaces did: the barrel end is the THIN one,
    # the grip end carries the height, so compare the two ends and mirror if they are swapped.
    xs = [p[0] for p in pts]
    lo, hi = min(xs), max(xs); tiers = (hi - lo) / 3
    def hauteur(a, b):
        ys = [p[1] for p in pts if a <= p[0] <= b]
        return (max(ys) - min(ys)) if ys else 0.0
    if hauteur(lo, lo + tiers) < hauteur(hi - tiers, hi):
        out = [[(-p[0], p[1]) for p in tri] for tri in out]
    return out

def gun(barre=False, name='icon-gun.png'):
    """The pistol; with `barre`, the same pistol struck through, which is what the button wears
    once the weapon is out. Both come from the model, so the two states are the same object."""
    tris = upright(gun_triangles())
    to = fit([p for tri in tris for p in tri])
    mask = canvas(); d = ImageDraw.Draw(mask)
    for tri in tris: d.polygon([to(p) for p in tri], fill=255)
    if barre:
        w = SIZE * SS; t = int(w * 0.085); gap = int(w * 0.030)
        for demi, fill in ((t / 2 + gap, 0), (t / 2, 255)):
            d.line([(w * 0.14, w * 0.86), (w * 0.86, w * 0.14)], fill=fill, width=int(demi * 2))
    return finish(mask, name)

def boxes_icon(boxes, name, circles=()):
    """Boxes as (cx, cy, w, h) in the weapon's own units, seen from the side."""
    pts = [(cx + sx * w / 2, cy + sy * h / 2) for cx, cy, w, h in boxes for sx in (-1, 1) for sy in (-1, 1)]
    pts += [(cx + sx * r, cy + sy * r) for cx, cy, r in circles for sx in (-1, 1) for sy in (-1, 1)]
    to = fit(pts)
    mask = canvas(); d = ImageDraw.Draw(mask)
    for cx, cy, w, h in boxes:
        a = to((cx - w / 2, cy - h / 2)); b = to((cx + w / 2, cy + h / 2))
        d.rounded_rectangle([min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])],
                            radius=6 * SS, fill=255)
    for cx, cy, r in circles:
        a = to((cx - r, cy - r)); b = to((cx + r, cy + r))
        d.ellipse([min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])], fill=255)
    return finish(mask, name)

def main():
    # The same numbers client/combat.ts builds the held weapons from (y up, x across).
    slap = [(0, -0.10, 0.04, 0.24),   # handle
            (0, 0.10, 0.26, 0.20),    # paddle
            (0, 0.10, 0.30, 0.04)]    # rim
    taser = [(0, -0.10, 0.04, 0.24),        # handle
             (0, 0.06, 0.05, 0.12),         # body
             (-0.03, 0.20, 0.015, 0.10),    # prong left
             (0.03, 0.20, 0.015, 0.10)]     # prong right
    n = [('icon-gun.png', gun()),
         ('icon-holster.png', gun(barre=True, name='icon-holster.png')),
         ('icon-slap.png', boxes_icon(slap, 'icon-slap.png')),
         ('icon-taser.png', boxes_icon(taser, 'icon-taser.png', circles=[(0, 0.27, 0.028)]))]
    for name, size in n: print(f'{name:16s} {size / 1024:5.1f} KB')

if __name__ == '__main__':
    main()
