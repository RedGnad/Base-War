"""Bake every rarity x mutation tint of the toy pieces into its own GLB.

Why: the mobile client counts UNIQUE materials against its 400/500 budget, and it
duplicates a material for every piece tinted through a node modifier, so each exposed
piece used to cost one material. Instances of one GLB share their materials, so a piece
drawn from `item-<rarity>-<mutation>.glb` costs nothing on that budget however many stand.

The recipes mirror `src/client/toy.ts` (`plastic`, `metalMaterial`) and the tables in
`src/shared/loot-table.ts`, so a baked piece looks like the tinted one did.

Usage: python3 tools/model/build-item-variants.py   (reads assets/toy/item-<r>.glb, r in 0..5)
"""
import json, struct, os, sys, io, random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOY = os.path.join(HERE, '..', '..', 'assets', 'toy')

# src/shared/loot-table.ts RARITIES (id, colour, glow), Secret (6) stays a primitive silhouette.
RARITIES = [('#78818e', 0.00), ('#4ec04e', 0.35), ('#3d8ef0', 0.80), ('#a855f7', 1.30), ('#f5a524', 2.00), ('#ff4d6d', 2.80)]
# src/shared/loot-table.ts MUTATIONS (id 0 = plain: the rarity's own colour).
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
TEX = 128

def png(fn):
    im = Image.new('RGB', (TEX, TEX)); px = im.load()
    for y in range(TEX):
        for x in range(TEX): px[x, y] = fn(x, y)
    out = io.BytesIO(); im.save(out, format='PNG', optimize=True); return out.getvalue()

def hsv(h, s, v):
    i = int(h * 6) % 6; f = h * 6 - int(h * 6); p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return (int(r * 255), int(g * 255), int(b * 255))

def rainbow_albedo(): return png(lambda x, y: hsv(x / TEX, 0.95, 0.9))
def galaxy_albedo():
    rnd = random.Random(6)
    cloud = [[rnd.random() for _ in range(TEX)] for _ in range(TEX)]
    def f(x, y):
        n = (cloud[y][x] + cloud[y][(x + 1) % TEX] + cloud[(y + 1) % TEX][x] + cloud[(y + 3) % TEX][(x + 5) % TEX]) / 4
        return (int(20 + 50 * n), int(6 + 18 * n), int(45 + 70 * n))
    return png(f)
def galaxy_stars():
    rnd = random.Random(66)
    stars = {}
    for _ in range(520):  # a sky of small stars, a few brighter twins
        x, y = rnd.randrange(TEX), rnd.randrange(TEX)
        col = rnd.choice([(255, 255, 255), (255, 210, 240), (200, 225, 255), (180, 180, 220)])
        stars[(x, y)] = col
        if rnd.random() < 0.12: stars[((x + 1) % TEX, y)] = col
    return png(lambda x, y: stars.get((x, y), (0, 0, 0)))
def cyber_lines():
    # A fine regular mesh with a node at every other crossing: reads as circuitry from any unwrap.
    def f(x, y):
        line = (x % 8 == 0) or (y % 8 == 0)
        node = (x % 16 in (15, 0, 1)) and (y % 16 in (15, 0, 1))
        return (0, 229, 255) if node else ((0, 150, 175) if line else (0, 0, 0))
    return png(f)
def yinyang_albedo():
    def f(x, y):
        k = max(0.0, min(1.0, (x - TEX * 0.44) / (TEX * 0.12)))
        return (int(15 + 218 * k), int(15 + 218 * k), int(22 + 213 * k))
    return png(f)

FANCY = {
    6: {'albedo_tex': galaxy_albedo, 'emissive_tex': galaxy_stars, 'emissive': (0.9, 0.8, 1.0), 'base': (1, 1, 1), 'metallic': 0.0, 'roughness': 0.5},
    7: {'albedo_tex': yinyang_albedo, 'base': (1, 1, 1), 'metallic': 0.1, 'roughness': 0.35},
    8: {'base': (0.04, 0.11, 0.03), 'emissive': (0.25, 1.0, 0.15), 'emissive_scale': 0.3, 'metallic': 0.0, 'roughness': 0.45},  # uranium: near-black under acid green
    10: {'base': (1.0, 0.91, 0.66), 'emissive': (1.0, 0.91, 0.66), 'emissive_scale': 0.22, 'metallic': 0.35, 'roughness': 0.15},
    11: {'albedo_tex': rainbow_albedo, 'emissive_tex': rainbow_albedo, 'emissive': (0.12, 0.12, 0.12), 'base': (0.9, 0.9, 0.9), 'metallic': 0.0, 'roughness': 0.4},
    12: {'base': (0.03, 0.10, 0.13), 'emissive_tex': cyber_lines, 'emissive': (0.7, 0.7, 0.7), 'metallic': 0.3, 'roughness': 0.3},
    13: {'base': (0.42, 1.0, 0.72), 'alpha': 0.4, 'emissive': (0.25, 0.9, 0.55), 'emissive_scale': 0.16, 'metallic': 0.0, 'roughness': 0.2}  # ectoplasm, not frost
}
_tex_cache = {}
def texture_bytes(fn):
    if fn not in _tex_cache: _tex_cache[fn] = fn()
    return _tex_cache[fn]

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

def bake(js, rarity, mutation, bin_chunk):
    if mutation in FANCY:
        return bake_fancy(js, rarity, mutation, bin_chunk)
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

def bake_fancy(js, rarity, mutation, bin_chunk):
    f = FANCY[mutation]
    glow = RARITIES[rarity][1]
    eclat = 0 if glow <= 0 else (glow ** 1.5) * 0.9
    lueur = min(1.0, eclat * EMISSIVE_SCALE)
    out = json.loads(json.dumps(js)); chunk = bin_chunk
    for k in ('textures', 'images', 'samplers', 'extensionsUsed'):
        out.pop(k, None)
    pbr = {'baseColorFactor': [*f['base'], f.get('alpha', 1.0)], 'metallicFactor': f['metallic'], 'roughnessFactor': f['roughness']}
    if 'albedo_tex' in f:
        idx, chunk = embed_texture(out, chunk, texture_bytes(f['albedo_tex'])); pbr['baseColorTexture'] = {'index': idx}
    nm = {'name': f'piece-{rarity}-{mutation}', 'doubleSided': True, 'pbrMetallicRoughness': pbr}
    if 'alpha' in f: nm['alphaMode'] = 'BLEND'
    em = f.get('emissive')
    if em is not None:
        scale = f.get('emissive_scale', 1.0)
        # The mutation's own glow, plus the rarity's hint on top, never above one.
        nm['emissiveFactor'] = [min(1.0, c * scale + c * lueur) for c in em]
        if 'emissive_tex' in f:
            idx, chunk = embed_texture(out, chunk, texture_bytes(f['emissive_tex'])); nm['emissiveTexture'] = {'index': idx}
    out['materials'] = [nm for _ in js.get('materials', [{}])]
    return out, chunk

def main():
    made = 0
    for r in range(len(RARITIES)):
        src = os.path.join(TOY, f'item-{r}.glb')
        js, bin_chunk = read_glb(src)
        for m in range(len(MUTATIONS)):
            out, chunk = bake(js, r, m, bin_chunk)
            write_glb(os.path.join(TOY, f'item-{r}-{m}.glb'), out, chunk)
            made += 1
    print(f'{made} variants written to {os.path.relpath(TOY)}')

if __name__ == '__main__':
    main()
