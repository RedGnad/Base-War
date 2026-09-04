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
# The plate is a 4:3 render laid at full canvas width; PLATE_TOP trims sky and foreground
# equally. The avatar runs slightly left of centre with the base behind him to the right.
PLATE_W = 1440
PLATE_TOP = -40
TITRE_TAILLE = 120
TITRE_INTERLIGNE = 0.84
TITRE_CENTRE_Y = 738


def mix(a, b, t):
    return tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3))


def logotype(texte, taille, arc=8):
    """Le nom, traite en logotype: lettres cintrees, degradé, contour navy epais, ombre.

    Les douze cartes de tete du catalogue en portent un; aucune ne se contente de texte pose.
    """
    ft = ImageFont.truetype(POLICE, taille)
    W2 = int(taille * len(texte) * 0.78) + 200
    H2 = int(taille * 2.2)
    calque = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    x = 100
    milieu = len(texte) / 2 - 0.5
    for i, ch in enumerate(texte):
        dy = int(((i - milieu) ** 2) * arc / max(1, milieu ** 2) - arc)
        d.text((x, H2 // 2 + dy), ch, font=ft, fill=(255, 255, 255, 255),
               stroke_width=int(taille * 0.085), stroke_fill=NAVY + (255,), anchor='lm')
        x += int(d.textlength(ch, font=ft) + taille * 0.02)
    masque = calque.split()[3]
    corps = calque.point(lambda v: 255 if v > 200 else 0).convert('L')
    grad = Image.new('RGBA', (W2, H2))
    gd = ImageDraw.Draw(grad)
    for y in range(H2):
        t = min(1, max(0, (y - H2 * 0.30) / (H2 * 0.42)))
        gd.line([(0, y), (W2, y)], fill=mix(OR_HAUT, OR_BAS, t) + (255,))
    lettres = Image.composite(grad, calque, corps)
    lettres.putalpha(masque)
    ombre = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    ombre.paste((0, 0, 0, 140), (0, 0), masque)
    out = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    out.alpha_composite(ombre.filter(ImageFilter.GaussianBlur(11)), (0, int(taille * 0.12)))
    out.alpha_composite(lettres)
    return out.crop(out.getbbox())


def ligne_promesse(texte, taille, couleur=(255, 255, 255)):
    """Une des trois lignes de promesse. WonderMine, second de la plateforme, en a trois."""
    ft = ImageFont.truetype(POLICE, taille)
    tmp = ImageDraw.Draw(Image.new('RGBA', (8, 8)))
    w = int(tmp.textlength(texte, font=ft)) + int(taille * 1.4)
    im = Image.new('RGBA', (w, int(taille * 2)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((taille * 0.7, taille), texte, font=ft, fill=couleur + (255,),
           stroke_width=int(taille * 0.17), stroke_fill=NAVY + (255,), anchor='lm')
    return im.crop(im.getbbox())




def composer():
    plate = Image.open(PLATE).convert('RGB')
    s = PLATE_W / plate.size[0]
    plate = plate.resize((PLATE_W, int(plate.size[1] * s)), Image.LANCZOS)
    im = Image.new('RGB', (W, H), (0, 0, 0))
    im.paste(plate, (0, PLATE_TOP))
    lignes = [logotype(t, TITRE_TAILLE, arc=8) for t in TITRE]
    pas = int(TITRE_TAILLE * TITRE_INTERLIGNE)
    bloc_h = pas * (len(lignes) - 1) + lignes[-1].size[1]
    y = TITRE_CENTRE_Y - bloc_h // 2
    im = im.convert('RGBA')
    for k, logo in enumerate(lignes):
        im.alpha_composite(logo, ((W - logo.size[0]) // 2, y + k * pas))
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
