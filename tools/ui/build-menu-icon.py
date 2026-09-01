"""
Les deux glyphes du bouton menu natif, et la pastille qui les surmonte.

Pourquoi ce fichier existe: `icon-menu.png` etait entierement vide et `icon-menu-alert.png`
ne portait qu'un point rouge sans les barres. Le bouton menu du client existait donc bien mais
ne dessinait rien, et un testeur a rapporte "le bouton menu n'est plus dans le HUD" (1 Sep).
Un bouton natif ne peut pas porter de pastille exterieure, la seule surface qu'on controle est
sa texture: la pastille est donc peinte DANS l'image, a cheval sur le coin superieur droit du
glyphe, ce qui est la position qui dit "il y a quelque chose a faire ici" sans masquer l'icone.
"""
from PIL import Image, ImageDraw, ImageFilter
import os

N = 256
CREME = (242, 233, 216, 255)
OMBRE = (12, 18, 34, 90)
ROUGE = (255, 77, 109, 255)
BORD = (12, 18, 34, 255)

def barres(pastille):
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Trois barres, epaisses, arrondies, centrees: le hamburger que tout le monde lit.
    largeur = 148
    hauteur = 26
    x0 = (N - largeur) // 2
    for i, y in enumerate((78, 118, 158)):
        # Une ombre portee douce d'abord, pour que le glyphe tienne sur un bouton clair.
        d.rounded_rectangle([x0 + 3, y + 4, x0 + largeur + 3, y + hauteur + 4], radius=hauteur // 2, fill=OMBRE)
    for y in (78, 118, 158):
        d.rounded_rectangle([x0, y, x0 + largeur, y + hauteur], radius=hauteur // 2, fill=CREME)

    if pastille:
        # A cheval sur le coin du glyphe: elle mord sur la barre du haut au lieu de flotter
        # a cote, ce qui est ce qui donne la lecture "a faire".
        r = 40
        cx, cy = x0 + largeur - 6, 78 + 4
        d.ellipse([cx - r - 5, cy - r - 5, cx + r + 5, cy + r + 5], fill=BORD)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ROUGE)
    return im

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'ui')
for nom, pastille in (('icon-menu.png', False), ('icon-menu-alert.png', True)):
    barres(pastille).save(os.path.join(OUT, nom))
    print(f'  {nom} ecrit')
