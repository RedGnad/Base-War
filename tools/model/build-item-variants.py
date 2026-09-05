"""Bake every rarity x mutation tint of the toy pieces into its own GLB.

Why: the mobile client counts UNIQUE materials against its 400/500 budget, and it
duplicates a material for every piece tinted through a node modifier, so each exposed
piece used to cost one material. Instances of one GLB share their materials, so a piece
drawn from `item-<rarity>-<mutation>.glb` costs nothing on that budget however many stand.

The recipes mirror `src/client/toy.ts` (`plastic`, `metalMaterial`) and the tables in
`src/shared/loot-table.ts`, so a baked piece looks like the tinted one did.

Usage: python3 tools/model/build-item-variants.py   (reads assets/toy/item-<r>.glb, r in 0..5)
"""
import math
import json, struct, os, sys, io, random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOY = os.path.join(HERE, '..', '..', 'assets', 'toy')

# src/shared/loot-table.ts RARITIES (id, colour, glow), Secret (6) stays a primitive silhouette.
RARITIES = [('#78818e', 0.00), ('#4ec04e', 0.35), ('#3d8ef0', 0.80), ('#a855f7', 1.30), ('#f5a524', 2.00), ('#ff4d6d', 2.80), ('#ffffff', 4.00)]
# src/shared/loot-table.ts MUTATIONS (id 0 = plain: the rarity's own colour).
# Mirrors src/shared/loot-table.ts MUTATIONS: keep both in step.
MUTATIONS = ['', '#ffd700', '#b9f2ff', '#6e0b14', '#ff9ecd', '#ff5722', '#5b2c8d', '#b6b6be', '#7fff00', '#3b0a45', '#ffe9a8', '#ff00ff', '#00e5ff', '#86ffd0']
METAL = {1, 2}  # Gold, Diamond
# The client reads a glTF emissive far hotter than the SDK's emissiveIntensity: at 0.4 every bright piece
# washed to white, at 0 an Epic read as a deep purple (A/B on the owner's base, 5 Sep 02:40). The style
# is the DARK albedo; the glow is a hint on top.
EMISSIVE_SCALE = 0.08

def rgb(hex_colour):
    h = hex_colour.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def recipe(rarity, mutation):
    """(baseColor rgb, metallic, roughness, emissive rgb or None, 1).

    The albedo follows toy.ts to the letter: DARK albedo under a coloured glow is what makes a
    Blood read as burgundy and a Cursed as deep violet (owner, 5 Sep, 02:20: a full albedo
    turned the red flat and cost every mutation its style). Only the glow is bounded, because
    the client reads a glTF emissive far hotter than the SDK's emissiveIntensity and the first
    bake blew every bright colour to white.
    """
    colour = rgb(MUTATIONS[mutation] if mutation > 0 else RARITIES[rarity][0])
    glow = RARITIES[rarity][1]
    eclat = 0 if glow <= 0 else (glow ** 1.5) * 0.9
    lueur = min(1.0, eclat * EMISSIVE_SCALE)
    if rarity == 6 and mutation == 0:  # a plain Secret is blazing white, never a darkened albedo
        return (1.0, 1.0, 1.0), 0.1, 0.3, (0.6, 0.6, 0.6), 1
    if mutation == 1:  # gold: the deep tone itself, full metal, a warm emissive floor under the rarity glow
        return rgb('#f5c518'), 0.9, 0.32, [c * max(0.04, lueur) for c in (0.72, 0.52, 0.10)], 1
    if mutation == 2:  # diamond: very smooth, a little metallic, a base sparkle plus rarity glow
        return [c * 0.85 for c in colour], 0.25, 0.05, [c * max(0.03, lueur) for c in colour], 1
    if glow <= 0:  # plain plastic
        return colour, 0.0, 0.55, None, 0
    sombre = 1 / (1 + glow * 1.2)  # dark albedo, bright emissive: the platform's own glow recipe
    return [c * sombre for c in colour], 0.0, 0.45, [c * lueur for c in colour], 1


# ---- The fancy mutations: a look, not only a colour. Each texture is a small PNG embedded in the
# GLB, so it ships once per file and the phone counts it once (owner, 5 Sep: "rainbow qui n'a
# qu'une couleur, phantom opaque, cyber juste vert, galaxy unie").
TEX = 256


# --- Object-space baking -------------------------------------------------------------------
# The chess set is unwrapped into 10 to 30 UV islands per piece, so any pattern drawn in UV
# space breaks at every island border (owner, 5 Sep: "une coupe abrupte entre les bords, sur
# toutes les pieces"). The documented cure is to evaluate the pattern at each texel's 3D point
# on the piece and write the result back into the piece's own unwrap: the two sides of a seam
# share the same 3D point, so the pattern continues across it. One texture per model and per
# mutation, embedded in the file it dresses, which the runtime already loaded that way.

ACCESSOR_FMT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
ACCESSOR_LEN = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def accessor(js, bin_chunk, i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    fmt, n = ACCESSOR_FMT[a['componentType']], ACCESSOR_LEN[a['type']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    size = struct.calcsize('<' + fmt * n); stride = bv.get('byteStride', size)
    return [struct.unpack_from('<' + fmt * n, bin_chunk, base + k * stride) for k in range(a['count'])]

def hash3(x, y, z, seed):
    """A repeatable number in [0, 1) for an integer lattice cell."""
    h = (x * 374761393 + y * 668265263 + z * 1103515245 + seed * 1013904223) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296.0

class PositionMap:
    """Which object-space point each texel paints, read from the model's own unwrap."""
    def __init__(self, js, bin_chunk):
        self.pos = [None] * (TEX * TEX)
        self.cache = {}
        pts = []
        for mesh in js['meshes']:
            for prim in mesh['primitives']:
                at = prim['attributes']
                P = accessor(js, bin_chunk, at['POSITION'])
                U = accessor(js, bin_chunk, at['TEXCOORD_0'])
                I = [t[0] for t in accessor(js, bin_chunk, prim['indices'])]
                pts += P
                for t in range(0, len(I), 3): self.raster(P, U, I[t], I[t + 1], I[t + 2])
        xs, ys, zs = zip(*pts)
        self.lo = (min(xs), min(ys), min(zs)); self.hi = (max(xs), max(ys), max(zs))
        self.size = max(h - l for h, l in zip(self.hi, self.lo))
        self.centre = tuple((h + l) / 2 for h, l in zip(self.hi, self.lo))
        self.dilate()

    def raster(self, P, U, a, b, c):
        (ua, va), (ub, vb), (uc, vc) = U[a], U[b], U[c]
        du, dv = math.floor(min(ua, ub, uc)), math.floor(min(va, vb, vc))
        xa, ya = (ua - du) * TEX, (va - dv) * TEX
        xb, yb = (ub - du) * TEX, (vb - dv) * TEX
        xc, yc = (uc - du) * TEX, (vc - dv) * TEX
        det = (xb - xa) * (yc - ya) - (xc - xa) * (yb - ya)
        if abs(det) < 1e-9: return
        x0, x1 = math.floor(min(xa, xb, xc)), math.ceil(max(xa, xb, xc))
        y0, y1 = math.floor(min(ya, yb, yc)), math.ceil(max(ya, yb, yc))
        pa, pb, pc = P[a], P[b], P[c]
        for y in range(y0, y1 + 1):
            py = y + 0.5
            for x in range(x0, x1 + 1):
                px = x + 0.5
                w0 = ((xb - px) * (yc - py) - (xc - px) * (yb - py)) / det
                w1 = ((xc - px) * (ya - py) - (xa - px) * (yc - py)) / det
                w2 = 1.0 - w0 - w1
                if w0 >= -0.003 and w1 >= -0.003 and w2 >= -0.003:
                    self.pos[(y % TEX) * TEX + (x % TEX)] = (
                        w0 * pa[0] + w1 * pb[0] + w2 * pc[0],
                        w0 * pa[1] + w1 * pb[1] + w2 * pc[1],
                        w0 * pa[2] + w1 * pb[2] + w2 * pc[2])

    def dilate(self):
        """Every unpainted texel takes the point of its nearest painted one (a breadth-first
        flood from all painted texels), so no texel is void: filtering and mipmaps at an
        island's border only ever blend surface with surface."""
        from collections import deque
        queue = deque(i for i, p in enumerate(self.pos) if p is not None)
        while queue:
            i = queue.popleft(); y, x = divmod(i, TEX); p = self.pos[i]
            for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                j = ((y + dy) % TEX) * TEX + (x + dx) % TEX
                if self.pos[j] is None: self.pos[j] = p; queue.append(j)

def clamp(k): return 0.0 if k < 0 else (1.0 if k > 1 else k)

def png(pm, fn):
    """A texture from a function of (texel index, object-space point)."""
    im = Image.new('RGB', (TEX, TEX))
    im.putdata([fn(i, pm.pos[i]) for i in range(TEX * TEX)])
    out = io.BytesIO(); im.save(out, format='PNG', optimize=True); return out.getvalue()

def voronoi_edge(pm, seed, cell):
    """Per texel: gap between the distances to the two nearest seeds of a jittered 3D lattice,
    in cell units. Near zero on a cell border, so thresholding it draws cracks or veins."""
    key = (seed, cell)
    if key in pm.cache: return pm.cache[key]
    seeds = {}
    def seed_of(cx, cy, cz):
        k = (cx, cy, cz)
        if k not in seeds: seeds[k] = (cx + hash3(cx, cy, cz, seed), cy + hash3(cx, cy, cz, seed + 1), cz + hash3(cx, cy, cz, seed + 2))
        return seeds[k]
    out = [1.0] * (TEX * TEX)
    for i, p in enumerate(pm.pos):
        if p is None: continue
        fx, fy, fz = p[0] / cell, p[1] / cell, p[2] / cell
        ix, iy, iz = math.floor(fx), math.floor(fy), math.floor(fz)
        d1 = d2 = 1e9
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                for oz in (-1, 0, 1):
                    sx, sy, sz = seed_of(ix + ox, iy + oy, iz + oz)
                    d = (fx - sx) ** 2 + (fy - sy) ** 2 + (fz - sz) ** 2
                    if d < d1: d2 = d1; d1 = d
                    elif d < d2: d2 = d
        out[i] = math.sqrt(d2) - math.sqrt(d1)
    pm.cache[key] = out
    return out

def grain(p, cell, seed):
    return hash3(math.floor(p[0] / cell), math.floor(p[1] / cell), math.floor(p[2] / cell), seed)

def noise3(p, cell, seed):
    """Smooth value noise on a 3D lattice, in [0, 1]."""
    fx, fy, fz = p[0] / cell, p[1] / cell, p[2] / cell
    ix, iy, iz = math.floor(fx), math.floor(fy), math.floor(fz)
    tx, ty, tz = [t * t * (3 - 2 * t) for t in (fx - ix, fy - iy, fz - iz)]
    def lerp(a, b, t): return a + (b - a) * t
    c = [[[hash3(ix + dx, iy + dy, iz + dz, seed) for dz in (0, 1)] for dy in (0, 1)] for dx in (0, 1)]
    return lerp(lerp(lerp(c[0][0][0], c[0][0][1], tz), lerp(c[0][1][0], c[0][1][1], tz), ty),
                lerp(lerp(c[1][0][0], c[1][0][1], tz), lerp(c[1][1][0], c[1][1][1], tz), ty), tx)

def hsv(h, s, v):
    i = int(h * 6) % 6; f = h * 6 - int(h * 6); p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return (int(r * 255), int(g * 255), int(b * 255))

def rainbow_albedo(pm):
    # The hue climbs the piece: red at the foot, violet at the crown, the same on every side.
    h0, h1 = pm.lo[1], pm.hi[1]
    return png(pm, lambda i, p: hsv(clamp((p[1] - h0) / (h1 - h0)) * 0.92, 0.95, 0.9))
def galaxy_albedo(pm):
    def f(i, p):
        n = 0.6 * noise3(p, pm.size / 4, 6) + 0.4 * noise3(p, pm.size / 10, 7)
        return (int(20 + 50 * n), int(6 + 18 * n), int(45 + 70 * n))
    return png(pm, f)
def galaxy_stars(pm):
    g = pm.size / 70
    tints = [(255, 255, 255), (255, 210, 240), (200, 225, 255), (180, 180, 220)]
    def f(i, p):
        c = (math.floor(p[0] / g), math.floor(p[1] / g), math.floor(p[2] / g))
        if hash3(*c, 66) > 0.035: return (0, 0, 0)
        return tints[int(hash3(*c, 67) * 4)]
    return png(pm, f)
def cyber_lines(pm):
    # Three families of planes cut the piece into a lattice; a node where two of them meet.
    s = pm.size / 9; w = 0.05
    def f(i, p):
        near = sum(1 for c in p if abs(((c / s) % 1.0) - 0.5) > 0.5 - w)
        return (0, 229, 255) if near >= 2 else ((0, 150, 175) if near == 1 else (0, 0, 0))
    return png(pm, f)
def lava_albedo(pm):
    edge = voronoi_edge(pm, 5, pm.size / 7); fine = pm.size / 220
    def f(i, p):
        k = clamp((0.14 - edge[i]) / 0.14)  # 1 on a crack, 0 on the crust
        g = 1.0 if k > 0.3 else 0.85 + 0.3 * grain(p, fine, 55)
        return (int((34 + 221 * k) * g), int((22 + 70 * k) * g), int(18 + 10 * k))
    return png(pm, f)
def lava_glow(pm):
    edge = voronoi_edge(pm, 5, pm.size / 7)
    def f(i, p):
        k = clamp((0.14 - edge[i]) / 0.14)
        return (int(255 * k), int(120 * k), int(20 * k))
    return png(pm, f)
def cursed_albedo(pm):
    edge = voronoi_edge(pm, 9, pm.size / 9); fine = pm.size / 220
    def f(i, p):
        k = clamp((0.10 - edge[i]) / 0.10)
        g = 0.8 + 0.4 * grain(p, fine, 99)
        return (int((28 + 60 * k) * g), int((5 + 10 * k) * g), int((36 + 70 * k) * g))
    return png(pm, f)
def cursed_veins(pm):
    edge = voronoi_edge(pm, 9, pm.size / 9)
    def f(i, p):
        k = clamp((0.10 - edge[i]) / 0.10)
        return (int(150 * k), int(40 * k), int(220 * k))
    return png(pm, f)
def yinyang_albedo(pm):
    cx, w = pm.centre[0], pm.size * 0.12
    def f(i, p):
        k = clamp((p[0] - cx) / w + 0.5)
        return (int(15 + 218 * k), int(15 + 218 * k), int(22 + 213 * k))
    return png(pm, f)

FANCY = {
    5: {'albedo_tex': lava_albedo, 'emissive_tex': lava_glow, 'emissive': (0.8, 0.8, 0.8), 'base': (1, 1, 1), 'metallic': 0.0, 'roughness': 0.75},  # crust with glowing cracks
    9: {'albedo_tex': cursed_albedo, 'emissive_tex': cursed_veins, 'emissive': (0.35, 0.35, 0.35), 'base': (1, 1, 1), 'metallic': 0.1, 'roughness': 0.5},  # deep violet with faint veins
    6: {'albedo_tex': galaxy_albedo, 'emissive_tex': galaxy_stars, 'emissive': (0.9, 0.8, 1.0), 'base': (1, 1, 1), 'metallic': 0.0, 'roughness': 0.5},
    7: {'albedo_tex': yinyang_albedo, 'base': (1, 1, 1), 'metallic': 0.1, 'roughness': 0.35},
    8: {'base': (0.04, 0.11, 0.03), 'emissive': (0.25, 1.0, 0.15), 'emissive_scale': 0.3, 'metallic': 0.0, 'roughness': 0.45},  # uranium: near-black under acid green
    10: {'base': (1.0, 0.91, 0.66), 'emissive': (1.0, 0.91, 0.66), 'emissive_scale': 0.22, 'metallic': 0.35, 'roughness': 0.15},
    11: {'albedo_tex': rainbow_albedo, 'emissive_tex': rainbow_albedo, 'emissive': (0.12, 0.12, 0.12), 'base': (0.9, 0.9, 0.9), 'metallic': 0.0, 'roughness': 0.4},
    12: {'base': (0.03, 0.10, 0.13), 'emissive_tex': cyber_lines, 'emissive': (0.7, 0.7, 0.7), 'metallic': 0.3, 'roughness': 0.3},
    13: {'base': (0.42, 1.0, 0.72), 'alpha': 0.4, 'emissive': (0.25, 0.9, 0.55), 'emissive_scale': 0.16, 'metallic': 0.0, 'roughness': 0.2}  # ectoplasm, not frost
}
_tex_cache = {}
def texture_bytes(fn, pm):
    key = (fn, id(pm))
    if key not in _tex_cache: _tex_cache[key] = fn(pm)
    return _tex_cache[key]

def embed_texture(js, bin_chunk, data):
    """Append a PNG to the binary chunk and register it; returns (texture index, new chunk)."""
    pad = b'\x00' * ((4 - len(bin_chunk) % 4) % 4)
    chunk = bin_chunk + pad
    js.setdefault('bufferViews', []).append({'buffer': 0, 'byteOffset': len(chunk), 'byteLength': len(data)})
    chunk += data
    js['buffers'][0]['byteLength'] = len(chunk)
    js.setdefault('images', []).append({'bufferView': len(js['bufferViews']) - 1, 'mimeType': 'image/png'})
    if not js.get('samplers'): js['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    js.setdefault('textures', []).append({'sampler': 0, 'source': len(js['images']) - 1})
    return len(js['textures']) - 1, chunk

def read_glb(path):
    b = open(path, 'rb').read()
    magic, version, length = struct.unpack('<III', b[:12])
    assert magic == 0x46546C67, path
    off = 12
    clen, ctype = struct.unpack('<II', b[off:off + 8])
    js = json.loads(b[off + 8:off + 8 + clen]); off += 8 + clen
    blen, btype = struct.unpack('<II', b[off:off + 8])
    return js, b[off + 8:off + 8 + blen]

def write_glb(path, js, bin_chunk):
    j = json.dumps(js, separators=(',', ':')).encode()
    j += b' ' * ((4 - len(j) % 4) % 4)
    bpad = bin_chunk + b'\x00' * ((4 - len(bin_chunk) % 4) % 4)
    total = 12 + 8 + len(j) + 8 + len(bpad)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(j), 0x4E4F534A)); f.write(j)
        f.write(struct.pack('<II', len(bpad), 0x004E4942)); f.write(bpad)

def bake(js, rarity, mutation, bin_chunk, pm):
    if mutation in FANCY:
        return bake_fancy(js, rarity, mutation, bin_chunk, pm)
    base, metallic, roughness, emissive, strength = recipe(rarity, mutation)
    out = json.loads(json.dumps(js))
    # The baked texture was dark and hid the colour; the colour IS the material now.
    for k in ('textures', 'images', 'samplers', 'extensionsUsed'):
        out.pop(k, None)
    mats = []
    for m in out.get('materials', [{}]):
        nm = {'name': f'piece-{rarity}-{mutation}', 'doubleSided': bool(m.get('doubleSided', True)),
              'pbrMetallicRoughness': {'baseColorFactor': [*base, 1.0], 'metallicFactor': metallic, 'roughnessFactor': roughness}}
        if emissive is not None and strength > 0:
            nm['emissiveFactor'] = [min(1.0, max(0.0, c)) for c in emissive]
        mats.append(nm)
    out['materials'] = mats
    return out, bin_chunk

def bake_fancy(js, rarity, mutation, bin_chunk, pm):
    f = FANCY[mutation]
    glow = RARITIES[rarity][1]
    eclat = 0 if glow <= 0 else (glow ** 1.5) * 0.9
    lueur = min(1.0, eclat * EMISSIVE_SCALE)
    out = json.loads(json.dumps(js)); chunk = bin_chunk
    for k in ('textures', 'images', 'samplers', 'extensionsUsed'):
        out.pop(k, None)
    pbr = {'baseColorFactor': [*f['base'], f.get('alpha', 1.0)], 'metallicFactor': f['metallic'], 'roughnessFactor': f['roughness']}
    if 'albedo_tex' in f:
        idx, chunk = embed_texture(out, chunk, texture_bytes(f['albedo_tex'], pm)); pbr['baseColorTexture'] = {'index': idx}
    nm = {'name': f'piece-{rarity}-{mutation}', 'doubleSided': True, 'pbrMetallicRoughness': pbr}
    if 'alpha' in f: nm['alphaMode'] = 'BLEND'
    em = f.get('emissive')
    if em is not None:
        scale = f.get('emissive_scale', 1.0)
        # The mutation's own glow, plus the rarity's hint on top, never above one.
        nm['emissiveFactor'] = [min(1.0, c * scale + c * lueur) for c in em]
        if 'emissive_tex' in f:
            idx, chunk = embed_texture(out, chunk, texture_bytes(f['emissive_tex'], pm)); nm['emissiveTexture'] = {'index': idx}
    out['materials'] = [nm for _ in js.get('materials', [{}])]
    return out, chunk

def main():
    made = 0
    for r in range(len(RARITIES)):
        src = os.path.join(TOY, f'item-{r}.glb')
        js, bin_chunk = read_glb(src)
        pm = PositionMap(js, bin_chunk)
        for m in range(len(MUTATIONS)):
            out, chunk = bake(js, r, m, bin_chunk, pm)
            write_glb(os.path.join(TOY, f'item-{r}-{m}.glb'), out, chunk)
            made += 1
    print(f'{made} variants written to {os.path.relpath(TOY)}')

if __name__ == '__main__':
    main()
