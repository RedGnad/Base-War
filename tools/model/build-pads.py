#!/usr/bin/env python3
"""
The pads under the pieces, one file per colour, with a painted pool of light around the lit ones.

Two reasons, one file. A pad used to be an SDK cylinder with its own material, which the phone
counts as one material per pad: the tightest budget spent on discs. A file per colour is shared
by every pad of that colour. And the point light that pooled colour on the slab does not render
on the mobile client before its v1.13.0 (docs, missing-features), so the pool is painted: a flat
translucent disc around the pad, radial alpha, emissive, the standard fake of mobile games. Two
primitives per lit pad (pad, pool), one for the plain pad. Writes assets/toy/pad-<key>.glb.
"""
import importlib.util, json, math, os, struct, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'toy')
def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(HERE, name + '.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod
aplatir = load('aplatir-glb'); secret = load('build-secret'); variants = load('build-item-variants')
Mesh = secret.Mesh

PAD_DIAMETER, PAD_THICKNESS = 1.4, 0.08   # client/toy.ts PEDESTAL_DIAMETER, PEDESTAL_THICKNESS
POOL_RADIUS = 1.7
SOCLE = '#bfb5a4'                          # client/toy.ts TOY.socle
LIGHT_MIN_GLOW = 0.8                       # client/toy.ts LIGHT_MIN_GLOW: Rare and above
PAD_GLOW = 1.8                             # client/toy.ts toyPedestal: plastic(hex, 1.8 * lift)
EMISSIVE_SCALE = variants.EMISSIVE_SCALE   # the bake's mapping of SDK intensity to glTF emissive
TEX = 128

def rgb(hex_):
    return tuple(int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
def vif(c):
    k = 1 / max(c[0], c[1], c[2], 0.05)
    return tuple(min(1.0, v * k) for v in c)
def luminance(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def glow_lift(c):
    """client/toy.ts glowLift: dark hues get more emissive so no colour reads as a black disc."""
    return max(1.0, min(2.6, 0.62 / max(luminance(vif(c)), 0.05)))
def sombre_par_nature(c): return luminance(c) < 0.15

def pad_mesh(m):
    r, h = PAD_DIAMETER / 2, PAD_THICKNESS
    segs = 40
    for y, n in ((h / 2, (0, 1, 0)), (-h / 2, (0, -1, 0))):
        centre = m.vertex((0, y, 0), n, (0.25, 0.5))
        rim = [m.vertex((math.cos(2 * math.pi * i / segs) * r, y, math.sin(2 * math.pi * i / segs) * r), n, (0.25, 0.5)) for i in range(segs + 1)]
        for i in range(segs): m.tri(centre, rim[i], rim[i + 1])
    top = [m.vertex((math.cos(2 * math.pi * i / segs) * r, h / 2, math.sin(2 * math.pi * i / segs) * r), (math.cos(2 * math.pi * i / segs), 0, math.sin(2 * math.pi * i / segs)), (0.25, 0.5)) for i in range(segs + 1)]
    bot = [m.vertex((math.cos(2 * math.pi * i / segs) * r, -h / 2, math.sin(2 * math.pi * i / segs) * r), (math.cos(2 * math.pi * i / segs), 0, math.sin(2 * math.pi * i / segs)), (0.25, 0.5)) for i in range(segs + 1)]
    for i in range(segs): m.tri(top[i], bot[i], bot[i + 1]); m.tri(top[i], bot[i + 1], top[i + 1])

def pool_mesh(m):
    # A flat disc three millimetres above the slab (the pad's underside sits on it), UVs on the
    # gradient circle of the atlas; the part under the pad is hidden by the pad itself.
    y = -PAD_THICKNESS / 2 + 0.003; segs = 48; R = POOL_RADIUS
    centre = m.vertex((0, y, 0), (0, 1, 0), (0.75, 0.5))
    rim = [m.vertex((math.cos(2 * math.pi * i / segs) * R, y, math.sin(2 * math.pi * i / segs) * R), (0, 1, 0),
                    (0.75 + math.cos(2 * math.pi * i / segs) * 0.24, 0.5 + math.sin(2 * math.pi * i / segs) * 0.24)) for i in range(segs + 1)]
    for i in range(segs): m.tri(centre, rim[i], rim[i + 1])

def atlas():
    """Left half opaque white (the pad), right half a radial alpha falloff (the pool)."""
    im = Image.new('RGBA', (TEX, TEX), (255, 255, 255, 255)); px = im.load()
    cx, cy, R = 96, 64, 31
    for y in range(TEX):
        for x in range(64, TEX):
            t = math.hypot(x - cx, y - cy) / R
            a = 0 if t >= 1 else int(255 * 0.65 * (1 - t) ** 1.2)
            px[x, y] = (255, 255, 255, a)
    return im

def write(key, colour, lit):
    def prim(m): return {'pos': m.pos, 'nor': m.nor, 'uv': m.uv, 'uv_atlas': m.uv, 'idx': m.idx}
    pad = Mesh(); pad_mesh(pad)
    groupes = [(False, [prim(pad)])]
    if lit:
        pool = Mesh(); pool_mesh(pool); groupes.append((False, [prim(pool)]))
    path = os.path.join(OUT, f'pad-{key}.glb')
    aplatir.ecrire_glb(path, groupes, atlas())
    secret.orient(path)
    # Materials: the pad wears the piece's plastic recipe (dark albedo, emissive of its colour),
    # the pool is the colour at full, blended by the atlas alpha, glowing.
    js, chunk = variants.read_glb(path)
    c = rgb(colour)
    if lit:
        lift = 1.0 if sombre_par_nature(c) else glow_lift(c)
        glow = PAD_GLOW * lift
        sombre = 1 / (1 + glow * 1.2)
        eclat = min(1.0, (glow ** 1.5) * 0.9 * EMISSIVE_SCALE)
        js['materials'][0]['pbrMetallicRoughness'].update({'baseColorFactor': [c[0] * sombre, c[1] * sombre, c[2] * sombre, 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.45})
        js['materials'][0]['emissiveFactor'] = [c[0] * eclat, c[1] * eclat, c[2] * eclat]
        v = vif(c)
        js['materials'][1]['pbrMetallicRoughness'].update({'baseColorFactor': [v[0], v[1], v[2], 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 1.0})
        js['materials'][1]['emissiveFactor'] = [v[0] * 0.45, v[1] * 0.45, v[2] * 0.45]
        js['materials'][1]['alphaMode'] = 'BLEND'
    else:
        js['materials'][0]['pbrMetallicRoughness'].update({'baseColorFactor': [c[0], c[1], c[2], 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.55})
    for i, mat in enumerate(js['materials']): mat['name'] = f'pad-{key}-{"pool" if i else "pad"}'
    variants.write_glb(path, js, chunk)
    return os.path.getsize(path)

def main():
    os.makedirs(OUT, exist_ok=True)
    total = write('socle', SOCLE, False); n = 1
    for r, (colour, glow) in enumerate(variants.RARITIES):
        if glow >= LIGHT_MIN_GLOW: total += write(colour[1:].lower(), colour, True); n += 1
    for colour in variants.MUTATIONS:
        if colour: total += write(colour[1:].lower(), colour, True); n += 1
    print(f'{n} pad files, {total / 1024:.0f} KB')

if __name__ == '__main__':
    main()
