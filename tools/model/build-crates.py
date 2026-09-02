#!/usr/bin/env python3
"""
Une caisse = un modele, un maillage, un materiau.

La caisse etait six primitives: corps, deux sangles, couvercle, loquet, disque. Six objets
rendus par caisse, sept sur le tapis, plus ceux des convois: le poste le plus cher du decor
apres la vegetation, pour un objet de la taille d'une main. Le client compte les objets
RENDUS, pas les ressources distinctes, alors la seule facon de descendre est de fondre les
morceaux dans un seul maillage.

Une seule couleur par materiau serait un cube monochrome. La solution est un ATLAS: une image
de tuiles unies, et chaque face du modele pointe ses UV dans la tuile de sa couleur. Corps,
couvercle, sangles, loquet et coins gardent donc leurs teintes avec un seul materiau.

Les neuf caisses PARTAGENT un seul atlas, cite par son nom au lieu d'etre embarque. Neuf
images embarquees font neuf textures a charger, et la limite bureau de la scene en compte
71: les caisses seules en prenaient douze. Une image citee n'en coute qu'une pour les neuf.

Ce fichier externe sert deux fois. Le coup de masse chauffe la caisse par un GltfNodeModifiers,
et un modificateur remplace le materiau en ENTIER: sans un .png a lui redonner, la caisse
perdrait ses couleurs des le premier coup.

Sortie: assets/toy/crate-<id>.glb pour les neuf caisses, et assets/toy/crate-atlas.png.
"""
import os, sys, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from importlib import util as _u
_spec = _u.spec_from_file_location('aplatir', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aplatir-glb.py'))
aplatir = _u.module_from_spec(_spec); _spec.loader.exec_module(aplatir)

RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SORTIE = os.path.join(RACINE, 'assets', 'toy')
CREME = '#f2e9d8'

MUTATIONS = {1: '#ffd700', 5: '#ff5722', 9: '#3b0a45'}
CRATES = [
    dict(id=0, tier=0, theme=-1, color='#9aa3ad'),
    dict(id=1, tier=1, theme=-1, color='#4ec04e'),
    dict(id=2, tier=2, theme=-1, color='#3d8ef0'),
    dict(id=3, tier=3, theme=-1, color='#a855f7'),
    dict(id=4, tier=1, theme=1,  color='#ffd700'),
    dict(id=5, tier=2, theme=5,  color='#ff5722'),
    dict(id=6, tier=3, theme=9,  color='#3b0a45'),
    dict(id=7, tier=4, theme=-1, color='#f5a524'),
    dict(id=8, tier=5, theme=-1, color='#ff4d6d')
]

def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def melange(c, f):
    """f<1 assombrit, f>1 eclaircit sans deborder."""
    return tuple(max(0, min(255, int(round(v * f)))) for v in c)

"""
  La caisse, en metres et dans le repere du support: elle tient dans [-0.56, 0.56] en x et z,
  et [-0.52, 0.52] en y, exactement la ou les primitives se tenaient. Monter le modele sur le
  support a l'echelle 1 redonne donc la silhouette d'avant, en un seul objet.

  Le couvercle ne pose plus sur le corps: 1 cm les separe et un listel comble le joint. Deux
  faces exactement coplanaires clignotent (le GPU ne sait pas laquelle est devant) et c'etait
  le defaut visible de la version en primitives, sur toute la surface du couvercle.
"""
CORPS, COUVERCLE, SANGLE, LOQUET, COIN = 0, 1, 2, 3, 4
BOITES = [
    ((0, -0.12, 0),   (1.00, 0.80, 1.00), CORPS),      # le corps
    ((0, 0.285, 0),   (1.08, 0.05, 1.08), COIN),       # le listel qui cache le joint
    ((0, 0.41, 0),    (1.12, 0.22, 1.12), COUVERCLE),  # le couvercle, debordant
    ((0, -0.12, 0),   (1.04, 0.16, 1.04), SANGLE),     # la ceinture
    ((0, -0.12, 0),   (0.16, 0.82, 1.04), SANGLE),     # la sangle avant-arriere
    ((0, -0.12, 0),   (1.04, 0.82, 0.16), SANGLE),     # la sangle gauche-droite
    ((0, 0.17, 0.55), (0.20, 0.20, 0.06), LOQUET)      # le loquet
]
for sx in (-1, 1):
    for sz in (-1, 1):
        BOITES.append(((sx * 0.5, -0.12, sz * 0.5), (0.11, 0.82, 0.11), COIN))

FACES = [
    ((0, 0, 1),  [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
    ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
    ((1, 0, 0),  [(1, -1, 1), (1, -1, -1), (1, 1, -1), (1, 1, 1)]),
    ((-1, 0, 0), [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)]),
    ((0, 1, 0),  [(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)]),
    ((0, -1, 0), [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)])
]

# L'atlas: cinq couleurs par caisse, neuf caisses, une tuile de 64 pixels chacune, huit tuiles
# par rangee. Les UV visent le CENTRE d'une tuile, jamais son bord, pour qu'aucun filtrage
# n'aille chercher la couleur de la voisine.
TUILE, COLONNES, RANGEES = 64, 8, 6
ATLAS = 'crate-atlas.png'

def uv_de(tuile):
    return ((tuile % COLONNES + 0.5) / COLONNES, (tuile // COLONNES + 0.5) / RANGEES)

def couleurs_de(c):
    theme = MUTATIONS.get(c['theme']) if c['theme'] >= 0 else None
    base = rgb(c['color'])
    sangle = rgb(theme) if theme else melange(base, 0.55)
    return [
        base,                    # CORPS
        melange(base, 1.30),     # COUVERCLE, eclairci: c'est lui qui portait la lueur
        sangle,                  # SANGLE
        rgb(CREME),              # LOQUET
        melange(sangle, 0.78)    # COIN, listel et ferrures
    ]

def construire(c):
    """La caisse `c`, dont les UV visent son bloc de cinq tuiles dans l'atlas commun."""
    depart = c['id'] * 5
    pos, nor, uv, idx = [], [], [], []
    for centre, taille, tuile in BOITES:
        u = uv_de(depart + tuile)
        for n, coins in FACES:
            base_i = len(pos)
            for s in coins:
                pos.append(tuple(centre[k] + s[k] * taille[k] / 2 for k in range(3)))
                nor.append(n)
                uv.append(u)
            idx.extend([base_i, base_i + 1, base_i + 2, base_i, base_i + 2, base_i + 3])
    return {'pos': pos, 'nor': nor, 'uv_atlas': uv, 'idx': idx}

def main():
    os.makedirs(SORTIE, exist_ok=True)
    atlas = Image.new('RGBA', (TUILE * COLONNES, TUILE * RANGEES), (0, 0, 0, 255))
    for c in CRATES:
        for i, col in enumerate(couleurs_de(c)):
            t = c['id'] * 5 + i
            x, y = (t % COLONNES) * TUILE, (t // COLONNES) * TUILE
            atlas.paste(col + (255,), (x, y, x + TUILE, y + TUILE))
    chemin_atlas = os.path.join(SORTIE, ATLAS)
    atlas.save(chemin_atlas, format='PNG', optimize=True)

    total = 0
    for c in CRATES:
        prim = construire(c)
        glb = os.path.join(SORTIE, f"crate-{c['id']}.glb")
        taille = aplatir.ecrire_glb(glb, [(False, [prim])], atlas, image_uri=ATLAS)
        total += taille
        xs = [p[0] for p in prim['pos']]; ys = [p[1] for p in prim['pos']]; zs = [p[2] for p in prim['pos']]
        print(f"crate-{c['id']}.glb  {taille/1024:5.1f} Ko  {len(prim['idx'])//3:3d} triangles  "
              f"x {min(xs):.2f}..{max(xs):.2f}  y {min(ys):.2f}..{max(ys):.2f}  z {min(zs):.2f}..{max(zs):.2f}")
    ka = os.path.getsize(chemin_atlas) / 1024
    print(f"\n{ATLAS}  {ka:.1f} Ko  {atlas.width}x{atlas.height}  {len(CRATES) * 5} tuiles")
    print(f"{len(CRATES)} caisses: 1 objet rendu chacune au lieu de 6, et 1 texture pour les neuf.")

if __name__ == '__main__':
    main()
