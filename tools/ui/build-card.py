"""
The world's card: images/base-war-thumbnail.png, 1440 x 960.

Built from the KEY ART PLATE (images/keyart-plate.jpg, a generated render chosen by the owner
on 4 Sep: the masked thief leaping out of a glass case with the golden king) and the game's
own logotype. Read the branding notes in Master/data/branding-research-2026-09-04.md before
changing anything here; the numbers below come from them:

- Every surface that shows the card crops it "cover" and landscape: the Places list 1.96:1,
  the mobile app card 1.86:1, the world page 1.88:1, the featured banner 1.25:1. The SAFE box
  is the intersection, 1200 x 735 centred on the 1440 x 960 canvas. Subject and logotype
  live inside it.
- The field's featured cards bake a big centred logotype over an illustrated scene: so does
  this one. Gold gradient, navy outline, the HUD's own face (Baloo 2 ExtraBold).
- No tagline: none of the featured cards carries one.

Requires Pillow and tools/ui/display.ttf.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(HERE, '..', '..'))
POLICE = os.path.join(HERE, 'display.ttf')
PLATE = os.path.join(RACINE, 'images/keyart-plate.jpg')
SORTIE = os.path.join(RACINE, 'images/base-war-thumbnail.png')

W, H = 1440, 960
SAFE_W, SAFE_H = 1200, 735
NAVY = (0x1b, 0x30, 0x54)
OR_HAUT, OR_BAS = (0xff, 0xef, 0xa8), (0xf5, 0xa5, 0x24)

# Two lines, not one: the live world page crops the card PORTRAIT (about 0.77:1, centred),
# and a single 140 px line lost its first and last letters there (owner, 4 Sep). Stacked,
# each line stays inside the 760 px column that every crop keeps.
TITRE = ('ROB A', 'BASE')
# The plate: the masked thief leaping out of a small glass case, hugging the golden king,
# the owner's first and final choice ("keep the character we had at the start", 4 Sep).
# Scaled to PLATE_H, laid so the thief's centre (SUBJECT_X of the plate's width) sits on the
# canvas's middle, its top at PLATE_TOP; gaps are filled by stretching the plate's own edges
# (plain sky and grass there). The title block covers the case entirely: a small object half
# hidden behind letters read as clutter, and casual cards let the hero burst out of the
# logotype rather than share the frame with a footnote.
SUBJECT_X = 0.5
PLATE_H = 1080
PLATE_TOP = 63
SEAM = 24
TITRE_TAILLE = 140
TITRE_INTERLIGNE = 0.82
TITRE_CENTRE_Y = 700


def mix(a, b, t):
    return tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3))


def logotype(texte, taille, arc=0):
    """The name as a logotype: gold gradient, thick navy outline, soft shadow.

    Drawn as ONE string so the face's own kerning holds; the first version placed the letters
    one by one on a parabola, and the stacked title read as letters jostling at odd heights
    (owner, 4 Sep). A straight baseline, the way the field's logotypes are set. `arc` is kept
    in the signature for callers and ignored.
    """
    ft = ImageFont.truetype(POLICE, taille)
    contour = int(taille * 0.085)
    tmp = ImageDraw.Draw(Image.new('RGBA', (8, 8)))
    l, t, r, btm = tmp.textbbox((0, 0), texte, font=ft, stroke_width=contour)
    marge = int(taille * 0.4)
    W2, H2 = r - l + marge * 2, btm - t + marge * 2
    calque = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    d.text((marge - l, marge - t), texte, font=ft, fill=(255, 255, 255, 255), stroke_width=contour, stroke_fill=NAVY + (255,))
    masque = calque.split()[3]
    corps = calque.point(lambda v: 255 if v > 200 else 0).convert('L')
    grad = Image.new('RGBA', (W2, H2))
    gd = ImageDraw.Draw(grad)
    for y in range(H2):
        k = min(1, max(0, (y - H2 * 0.30) / (H2 * 0.45)))
        gd.line([(0, y), (W2, y)], fill=mix(OR_HAUT, OR_BAS, k) + (255,))
    lettres = Image.composite(grad, calque, corps)
    lettres.putalpha(masque)
    ombre = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    ombre.paste((0, 0, 0, 140), (0, 0), masque)
    out = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    out.alpha_composite(ombre.filter(ImageFilter.GaussianBlur(9)), (0, int(taille * 0.10)))
    out.alpha_composite(lettres)
    return out.crop(out.getbbox())


def extend(im, box, size, at, blur):
    """Stretch a thin edge strip of `im` over the gap, then blur it so the stretched texture
    turns into a plain gradient instead of streaks."""
    strip = im.crop(box).resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur))
    im.paste(strip, at)


def composer():
    plate = Image.open(PLATE).convert('RGB')
    k = PLATE_H / plate.size[1]
    plate = plate.resize((int(plate.size[0] * k), PLATE_H), Image.LANCZOS)
    pw = plate.size[0]
    x0 = int(W / 2 - SUBJECT_X * pw)
    im = Image.new('RGB', (W, H), (0, 0, 0))
    im.paste(plate, (x0, PLATE_TOP))
    bottom = PLATE_TOP + PLATE_H
    if bottom < H:
        extend(im, (x0, bottom - 4, x0 + pw, bottom), (pw, H - bottom), (x0, bottom), 6)
    if PLATE_TOP > 0:
        extend(im, (x0, PLATE_TOP, x0 + pw, PLATE_TOP + 4), (pw, PLATE_TOP), (x0, 0), 6)
    if x0 > 0:
        extend(im, (x0, 0, x0 + 4, H), (x0, H), (0, 0), 6)
    right = x0 + pw
    if right < W:
        extend(im, (right - 4, 0, right, H), (W - right, H), (right, 0), 6)
    # Soften every seam between the plate and its extensions; the subject never sits there.
    for box in ((x0 - SEAM, 0, x0 + SEAM, H), (right - SEAM, 0, right + SEAM, H),
                (0, PLATE_TOP - SEAM, W, PLATE_TOP + SEAM), (0, bottom - SEAM, W, bottom + SEAM)):
        box = (max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))
        if box[2] > box[0] and box[3] > box[1]:
            im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(4)), box[:2])
    lignes = [logotype(t, TITRE_TAILLE) for t in TITRE]
    pas = int(TITRE_TAILLE * TITRE_INTERLIGNE)
    bloc_h = pas * (len(lignes) - 1) + lignes[-1].size[1]
    y = TITRE_CENTRE_Y - bloc_h // 2
    im = im.convert('RGBA')
    for n, logo in enumerate(lignes):
        im.alpha_composite(logo, ((W - logo.size[0]) // 2, y + n * pas))
    return im.convert('RGB')


def apercu(im):
    """The card with the crops drawn on it, for the eye: safe box, and the 1.96 and 1.25 crops."""
    d = ImageDraw.Draw(im)
    d.rectangle(((W - SAFE_W) // 2, (H - SAFE_H) // 2, (W + SAFE_W) // 2, (H + SAFE_H) // 2), outline=(255, 255, 255), width=3)
    h196 = int(W / 1.96); d.rectangle((0, (H - h196) // 2, W - 1, (H + h196) // 2), outline=(0, 255, 255), width=2)
    w125 = int(H * 1.25); d.rectangle(((W - w125) // 2, 0, (W + w125) // 2, H - 1), outline=(255, 120, 0), width=2)
    return im


if __name__ == '__main__':
    im = composer()
    # The Worlds server caps a thumbnail at 1 MB: a 256-colour PNG with dithering keeps the
    # render clean and lands well under it; the previous vector card was 314 KB.
    im.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(SORTIE, optimize=True)
    print(f'{SORTIE}: {im.size}, {os.path.getsize(SORTIE) // 1024} KB')
    if len(os.sys.argv) > 1:
        apercu(im.copy()).save(os.sys.argv[1]); print('preview', os.sys.argv[1])
