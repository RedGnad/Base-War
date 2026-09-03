"""
The BUILD glyph: a wooden mallet, in one mass, with two swing frames.

Drawn after the owner's reference (a line icon of a mallet, 3 Sep): a wide rounded head
with a small cap on its far end and a long handle running down-left, so the head sits
top-right. Nothing is drawn inside the shape; at 56 px on a phone only the silhouette
survives, and this one is the silhouette everybody reads as "build". The earlier glyphs
came from game-icons and carried claws, nails and shading that turned to mud at that size.

Three poses, rotated about the grip end: raised (22 degrees), halfway (9) and struck (0).
The struck pose is the icon at rest; the other two are shown for 80 and 60 ms when the
contextual button offers BUILD, once per period, see `Pouce` in src/client/ui-kit.tsx.

Two families, as for every verb (src/client/icones.ts): `icon-*` white, `encre-*` navy.
Run: python3 tools/ui/build-mallet-icon.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/ui'))
N = 256
SS = 8
WHITE = (255, 255, 255, 255)
NAVY = (16, 26, 43, 255)
TILT = -42          # degrees; the head top-right, the handle down-left
POSES = {'raised': 22, 'mid': 9, 'struck': 0}


def mallet(size, swing_deg, colour, margin=0.10):
    big = size * SS
    inner = big * (1 - 2 * margin)
    k = inner / 100.0
    off = big * margin

    def u(v):
        return off + v * k

    layer = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # Upright first: the head on top, the handle straight down, all in a 100-unit box.
    d.rounded_rectangle([u(13), u(8), u(87), u(42)], radius=u(9) - off, fill=colour)   # head
    d.rounded_rectangle([u(84), u(15), u(96), u(35)], radius=u(3) - off, fill=colour)  # cap
    d.rounded_rectangle([u(41), u(30), u(59), u(98)], radius=u(6) - off, fill=colour)  # handle
    if swing_deg:
        layer = layer.rotate(swing_deg, resample=Image.BICUBIC, center=(u(50), u(94)))
    layer = layer.rotate(TILT, resample=Image.BICUBIC, center=(big / 2, big / 2))
    return layer.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    for family, colour in (('icon', WHITE), ('encre', NAVY)):
        for pose, swing in POSES.items():
            name = f'{family}-build.png' if pose == 'struck' else f'{family}-build-{pose}.png'
            mallet(N, swing, colour).save(os.path.join(OUT, name), optimize=True)
            print(f'wrote {name}')
