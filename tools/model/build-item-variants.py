"""Bake every rarity x mutation tint of the toy pieces into its own GLB.

Why: the mobile client counts UNIQUE materials against its 400/500 budget, and it
duplicates a material for every piece tinted through a node modifier, so each exposed
piece used to cost one material. Instances of one GLB share their materials, so a piece
drawn from `item-<rarity>-<mutation>.glb` costs nothing on that budget however many stand.

The recipes mirror `src/client/toy.ts` (`plastic`, `metalMaterial`) and the tables in
`src/shared/loot-table.ts`, so a baked piece looks like the tinted one did.

Usage: python3 tools/model/build-item-variants.py   (reads assets/toy/item-<r>.glb, r in 0..5)
"""
import json, struct, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOY = os.path.join(HERE, '..', '..', 'assets', 'toy')

# src/shared/loot-table.ts RARITIES (id, colour, glow), Secret (6) stays a primitive silhouette.
RARITIES = [('#78818e', 0.00), ('#4ec04e', 0.35), ('#3d8ef0', 0.80), ('#a855f7', 1.30), ('#f5a524', 2.00), ('#ff4d6d', 2.80)]
# src/shared/loot-table.ts MUTATIONS (id 0 = plain: the rarity's own colour).
MUTATIONS = ['', '#ffd700', '#b9f2ff', '#6a0d2b', '#ff9ecd', '#ff5722', '#5b2c8d', '#b6b6be', '#7fff00', '#3b0a45', '#ffe9a8', '#ff00ff', '#00e5ff', '#86ffd0']
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

def bake(js, rarity, mutation):
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
    return out

def main():
    made = 0
    for r in range(len(RARITIES)):
        src = os.path.join(TOY, f'item-{r}.glb')
        js, bin_chunk = read_glb(src)
        for m in range(len(MUTATIONS)):
            write_glb(os.path.join(TOY, f'item-{r}-{m}.glb'), bake(js, r, m), bin_chunk)
            made += 1
    print(f'{made} variants written to {os.path.relpath(TOY)}')

if __name__ == '__main__':
    main()
