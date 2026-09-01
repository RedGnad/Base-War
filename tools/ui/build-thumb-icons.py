"""
Les glyphes des commandes de pouce que la scene dessine elle-meme.

Le client ne laisse pas choisir la position de ses boutons, seulement les cacher ou changer
leur image; la seule facon documentee de decider de la disposition est de les remplacer par
notre propre interface. On perd alors l'icone dynamique du saut, qui passe en parapette chez
le client apres le double saut: elle est donc redessinee ici, et pilotee par la scene.
"""
from PIL import Image, ImageDraw
import os

N = 256
CREME = (242, 233, 216, 255)
OMBRE = (12, 18, 34, 80)

def fond():
    return Image.new('RGBA', (N, N), (0, 0, 0, 0))

def saut():
    im = fond(); d = ImageDraw.Draw(im)
    # Une fleche epaisse vers le haut, avec un sol dessous: monter, depuis quelque part.
    d.polygon([(128, 44), (206, 132), (162, 132), (162, 186), (94, 186), (94, 132), (50, 132)], fill=OMBRE)
    d.polygon([(128, 38), (200, 126), (156, 126), (156, 180), (100, 180), (100, 126), (56, 126)], fill=CREME)
    d.rounded_rectangle([64, 200, 192, 222], radius=11, fill=CREME)
    return im

def parapente():
    im = fond(); d = ImageDraw.Draw(im)
    # Une voile bombee et deux suspentes: la silhouette que tout le monde lit comme un vol plane.
    d.pieslice([34, 46, 222, 214], start=185, end=355, fill=OMBRE)
    d.pieslice([30, 40, 218, 208], start=185, end=355, fill=CREME)
    # Le creux entre les caissons, pour que la voile ne soit pas un simple demi-disque.
    d.pieslice([74, 34, 174, 150], start=185, end=355, fill=(0, 0, 0, 0))
    for x0, x1 in ((60, 116), (188, 140)):
        d.line([(x0, 124), (x1, 196)], fill=CREME, width=11)
    d.ellipse([112, 190, 148, 226], fill=CREME)
    return im

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'ui')
for nom, f in (('icon-jump.png', saut), ('icon-glide.png', parapente)):
    f().save(os.path.join(OUT, nom))
    print(f'  {nom} ecrit')
