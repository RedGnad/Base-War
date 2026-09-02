#!/usr/bin/env python3
"""Le cadre qui marque la ligne du lecteur sur le tableau des records.

C'etait une bande PLEINE en or clair derriere le texte, et le nom devenait illisible dessus:
un aplat clair sous un texte clair (proprietaire, 2 Sep, capture a l'appui). Un contour dit
la meme chose, "cette ligne est la tienne", sans rien mettre entre l'oeil et le mot.

Blanc sur transparent, teinte a l'usage par le materiau. Le rapport de la texture suit celui
d'une ligne (environ douze pour un) pour que l'etirement ne rende pas le bord deux fois plus
epais en haut qu'a gauche.

    python3 tools/ui/build-frame-texture.py
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/ui'))
W, H = 512, 43
EP = 4          # l'epaisseur du trait, en pixels de cette texture
R = 9

if __name__ == '__main__':
    im = Image.new('RGBA', (W, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=R, fill=(255, 255, 255, 255))
    d.rounded_rectangle((EP, EP, W - 1 - EP, H - 1 - EP), radius=max(R - EP, 1), fill=(255, 255, 255, 0))
    im.save(os.path.join(OUT, 'cadre-ligne.png'), optimize=True)
    print('wrote cadre-ligne.png', W, 'x', H)
