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

_spec2 = _u.spec_from_file_location('variants', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-item-variants.py'))
variants = _u.module_from_spec(_spec2); _spec2.loader.exec_module(variants)
MUTATIONS = {i: c for i, c in enumerate(variants.MUTATIONS) if c}
TUILES_SKIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'source', 'skin-tiles')
CRATES = [
    dict(id=0, tier=0, theme=-1, color='#9aa3ad'),
    dict(id=1, tier=1, theme=-1, color='#4ec04e'),
    dict(id=2, tier=2, theme=-1, color='#3d8ef0'),
    dict(id=3, tier=3, theme=-1, color='#a855f7'),
    dict(id=4, tier=1, theme=1,  color='#ffd700'),
    dict(id=5, tier=2, theme=5,  color='#ff5722'),
    dict(id=6, tier=3, theme=9,  color='#3b0a45'),
    dict(id=7, tier=4, theme=-1, color='#f5a524'),
    dict(id=8, tier=5, theme=-1, color='#ff4d6d'),
    # One themed crate per new mutation (shared/loot-table.ts ids 9 to 15), Epic tier.
    dict(id=9,  tier=3, theme=6,  color='#5b2c8d'),
    dict(id=10, tier=3, theme=7,  color='#b6b6be'),
    dict(id=11, tier=3, theme=8,  color='#7fff00'),
    dict(id=12, tier=3, theme=10, color='#ffe9a8'),
    dict(id=13, tier=3, theme=11, color='#ff00ff'),
    dict(id=14, tier=3, theme=12, color='#00e5ff'),
    dict(id=15, tier=3, theme=13, color='#86ffd0')
]

"""
  La MATIERE du theme sur le corps de la caisse, pas seulement sa couleur.

  Les coffres du genre (Clash Royale, Brawl Stars, les caisses de Counter-Strike) gardent une
  seule famille de silhouettes, disent la rarete par la couleur puis la taille, et une caisse
  d'evenement porte la matiere de l'evenement sur la boite elle-meme. Ici le couvercle, les
  sangles et le loquet restent des aplats (la rarete reste lisible), et le corps prend la
  tuile de sa mutation, la meme croute, les memes veines, le meme ciel que les pieces et les
  skins (owner, 5 Sep: "on veut surtout de la lisibilite"). Gold reste un aplat: le metal se
  lit par sa couleur. Une caisse a tuile embarque sa propre image, crate-<id>.png, que le coup
  de masse rechauffe comme l'atlas commun.
"""
TUILE_PX = 256
FENETRE = {5: 1 / 3, 9: 1 / 2}   # the share of the tile one face shows; the rest show it whole

def tuile_de(theme):
    """The 256 x 256 surface of a theme, or None for a flat crate."""
    from PIL import ImageDraw, ImageChops
    def skin(nom): return Image.open(os.path.join(TUILES_SKIN, nom)).convert('RGB').resize((TUILE_PX, TUILE_PX), Image.LANCZOS)
    if theme in (5, 9, 6, 11): return skin(f'skin-{theme}-albedo.png')
    if theme == 12:
        base = Image.new('RGB', (TUILE_PX, TUILE_PX), (8, 26, 33))
        return ImageChops.add(base, skin('skin-12-glow.png'))
    im = Image.new('RGB', (TUILE_PX, TUILE_PX)); d = ImageDraw.Draw(im); px = im.load()
    if theme == 7:   # yin yang: two halves, a soft seam
        for x in range(TUILE_PX):
            k = max(0.0, min(1.0, (x - TUILE_PX * 0.47) / (TUILE_PX * 0.06)))
            col = (int(15 + 218 * k), int(15 + 218 * k), int(22 + 213 * k))
            d.line([(x, 0), (x, TUILE_PX)], fill=col)
    elif theme == 8:  # radioactive: acid green under dark hazard bands
        im.paste((110, 220, 0), (0, 0, TUILE_PX, TUILE_PX))
        for k in range(-2, 5):
            d.polygon([(k * 96, 0), (k * 96 + 40, 0), (k * 96 + 40 - 96, TUILE_PX), (k * 96 - 96, TUILE_PX)], fill=(28, 40, 10))
    elif theme == 10:  # divine: cream, two gold bands
        im.paste((255, 233, 168), (0, 0, TUILE_PX, TUILE_PX))
        for y in (70, 186): d.rectangle([0, y - 6, TUILE_PX, y + 6], fill=(214, 168, 60))
    elif theme == 13:  # phantom: pale mint with soft drifts
        for y in range(TUILE_PX):
            for x in range(TUILE_PX):
                n = 0.5 + 0.5 * math.sin(x / 23.0) * math.cos(y / 31.0 + x / 57.0)
                px[x, y] = (int(120 + 30 * n), int(235 + 20 * n), int(190 + 25 * n))
    else:
        return None
    return im

def image_de(c, couleurs):
    """A themed crate's own image: its tile on the left half, its five swatches on the right."""
    im = Image.new('RGBA', (2 * TUILE_PX, TUILE_PX), (0, 0, 0, 255))
    im.paste(tuile_de(c['theme']).convert('RGBA'), (0, 0))
    for i, col in enumerate(couleurs):
        x = TUILE_PX + i * 51
        im.paste(col + (255,), (x, 0, x + 51, 64))
    return im

def uv_swatch(i): return ((TUILE_PX + i * 51 + 25) / (2 * TUILE_PX), 32 / TUILE_PX)


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def melange(c, f):
    """f<1 assombrit, f>1 eclaircit sans deborder."""
    return tuple(max(0, min(255, int(round(v * f)))) for v in c)

def clarte(c):
    """Luminance percue, 0 a 1."""
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

def detacher(couleur, fond):
    """
    La meme couleur, poussee jusqu'a se voir sur ce fond.

    Une caisse a thème porte la couleur de sa mutation SUR le corps ET sur les sangles: Gold
    est #ffd700 des deux cotes, Lava #ff5722, Cursed #3b0a45. En primitives les sangles etaient
    emissives et se detachaient par la lueur; un atlas n'a pas de lueur, alors elles
    disparaissaient purement et simplement. On les separe donc en clarte: on eclaircit sur un
    fond sombre, on assombrit sur un fond clair, jusqu'a un ecart franc.
    """
    ecart = 0.22
    for f in (0.62, 0.50, 0.40) if clarte(fond) > 0.5 else (1.55, 1.9, 2.4):
        c = melange(couleur, f)
        if abs(clarte(c) - clarte(fond)) >= ecart:
            return c
    return c

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
    sangle = detacher(rgb(theme), base) if theme else melange(base, 0.55)
    return [
        base,                    # CORPS
        melange(base, 1.30),     # COUVERCLE, eclairci: c'est lui qui portait la lueur
        sangle,                  # SANGLE
        rgb(CREME),              # LOQUET
        melange(sangle, 0.78)    # COIN, listel et ferrures
    ]

def a_tuile(c): return c['theme'] >= 0 and tuile_de(c['theme']) is not None

def construire(c):
    """La caisse `c`: les UV visent ses cinq tuiles de l'atlas commun, ou, pour une caisse a
    tuile, les nuanciers de sa propre image et, sur le corps, une fenetre de sa tuile par face."""
    depart = c['id'] * 5
    propre = a_tuile(c)
    fen = FENETRE.get(c['theme'], 1.0)
    pos, nor, uv, idx = [], [], [], []
    for centre, taille, tuile in BOITES:
        u = uv_swatch(tuile) if propre else uv_de(depart + tuile)
        for f, (n, coins) in enumerate(FACES):
            base_i = len(pos)
            # a different window of the tile on each face, so no two faces repeat each other
            ox, oy = (f % 3) * (1 - fen) / 2, ((f // 3) % 2) * (1 - fen)
            for s in coins:
                pos.append(tuple(centre[k] + s[k] * taille[k] / 2 for k in range(3)))
                nor.append(n)
                if propre and tuile == CORPS:
                    a = 0 if s[0] < 0 or (n[0] != 0 and s[2] < 0) else 1
                    b = 0 if s[1] > 0 or (n[1] != 0 and s[2] > 0) else 1
                    uv.append((0.5 * (ox + fen * a), oy + fen * b))
                else:
                    uv.append(u)
            idx.extend([base_i, base_i + 1, base_i + 2, base_i, base_i + 2, base_i + 3])
    return {'pos': pos, 'nor': nor, 'uv_atlas': uv, 'idx': idx}

def main():
    os.makedirs(SORTIE, exist_ok=True)
    atlas = Image.new('RGBA', (TUILE * COLONNES, TUILE * RANGEES), (0, 0, 0, 255))
    for c in CRATES:
        if a_tuile(c): continue
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
        if a_tuile(c):
            image = image_de(c, couleurs_de(c)); nom = f"crate-{c['id']}.png"
            image.save(os.path.join(SORTIE, nom), format='PNG', optimize=True)
            taille = aplatir.ecrire_glb(glb, [(False, [prim])], image, image_uri=nom)
        else:
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
