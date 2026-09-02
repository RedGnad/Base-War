#!/usr/bin/env python3
"""Fusionne toute la vegetation de la carte en DEUX modeles: les arbres, les buissons.

Pourquoi. Le client mobile compte un objet rendu par instance, et son plafond est 400 (dur:
500, et un plafond dur bloque le chargement). Quarante-quatre arbres et quarante-trois
buissons faisaient quatre-vingt-sept objets pour de l'ornement pur, sans collider, soit plus
d'un tiers du decor (mesure du 2 Sep). Ils ne bougent jamais les uns par rapport aux autres:
c'est exactement le cas de la fusion des etages. Fondus, ils font DEUX objets.

Ce qu'on echange: la geometrie est dupliquee par instance au lieu d'etre partagee, et un objet
qui couvre toute la carte n'est jamais elimine par le champ de vision. Vingt-cinq mille
triangles en permanence, contre un budget d'un million: sans commune mesure avec quatre-vingt
cinq objets rendus.

Le PLACEMENT vit ici, et nulle part ailleurs. Il etait dans `decor.ts`, tire par un generateur
pseudo-aleatoire partage avec les ballons; le repliquer dans deux fichiers aurait garanti la
derive. Le client se contente maintenant de poser les deux modeles a l'origine.

    python3 tools/model/build-vegetation.py
"""
import importlib.util
import math
import os
import re

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
OUT = os.path.join(ROOT, 'assets/Models')

_spec = importlib.util.spec_from_file_location('aplatir', os.path.join(HERE, 'aplatir-glb.py'))
aplatir = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(aplatir)


def constante(nom, defaut=None):
    src = open(os.path.join(ROOT, 'src/shared/schemas.ts'), encoding='utf-8').read()
    m = re.search(rf'export const {nom}\s*=\s*([0-9.]+)', src)
    if m:
        return float(m.group(1))
    m = re.search(rf'export const {nom}\s*=\s*([^\n]+)', src)
    if m and defaut is None:
        raise SystemExit(f'{nom} non numerique: {m.group(1)}')
    return defaut


SCENE_SIDE = constante('SCENE_SIDE')
BASE_SIDE = constante('BASE_SIDE')
BELT_LENGTH = constante('BELT_LENGTH')
EDGE_MARGIN = BASE_SIDE / 2 + 2
BELT_CLEARANCE = BASE_SIDE / 2 + 2
CX = CZ = SCENE_SIDE / 2

# Le meme generateur que `decor.ts` avait, avec sa propre graine: ce fichier est desormais la
# seule autorite sur ou poussent les arbres.
_graine = 987654321


def alea():
    global _graine
    _graine = (_graine * 1103515245 + 12345) & 0x7fffffff
    return _graine / 0x7fffffff


def sur_spawn(x, z):
    """La bande du point d'apparition, ou rien ne se pose. Doit suivre `surSpawn` de decor.ts."""
    return 88 < x < 104 and 92 < z < 116


def placer_arbres():
    """Une ligne d'arbres le long des quatre bords, dans la bande interdite aux bases."""
    out = []
    bande = EDGE_MARGIN * 0.55
    for cote in (0, 1, 2, 3):
        d = 10.0
        while d < SCENE_SIDE - 10:
            j = (alea() - 0.5) * 6
            x = z = 0.0
            if cote == 0:
                x, z = d + j, bande + (alea() - 0.5) * 3
            elif cote == 1:
                x, z = d + j, SCENE_SIDE - bande + (alea() - 0.5) * 3
            elif cote == 2:
                x, z = bande + (alea() - 0.5) * 3, d + j
            else:
                x, z = SCENE_SIDE - bande + (alea() - 0.5) * 3, d + j
            sc = 1.1 + alea() * 0.9
            ry = alea() * 360
            if not sur_spawn(x, z):
                out.append((x, 0.0, z, sc, ry))
            d += 17
    return out


def placer_buissons():
    """Le long du couloir du tapis, puis au pied de la bordure entre les arbres."""
    out = []
    for cote in (-1, 1):
        dx = -BELT_LENGTH / 2 - 2
        while dx <= BELT_LENGTH / 2 + 2:
            x = CX + dx + (alea() - 0.5) * 2
            z = CZ + cote * (BELT_CLEARANCE - 1.6) + (alea() - 0.5) * 1.4
            k = 0 if alea() < 0.5 else 1
            sc = 0.9 + alea() * 0.7
            ry = alea() * 360
            if not sur_spawn(x, z):
                out.append((k, x, 0.0, z, sc, ry))
            dx += 5
    d = 8.0
    while d < SCENE_SIDE - 8:
        for bx, bz in ((d, 2.6), (SCENE_SIDE - d, SCENE_SIDE - 2.6), (2.6, SCENE_SIDE - d), (SCENE_SIDE - 2.6, d)):
            k = 0 if alea() < 0.5 else 1
            x = bx + (alea() - 0.5) * 2
            z = bz + (alea() - 0.5) * 2
            sc = 0.8 + alea() * 0.6
            ry = alea() * 360
            if not sur_spawn(x, z):
                out.append((k, x, 0.0, z, sc, ry))
        d += 23
    return out


def primitive_de(chemin):
    """Le seul primitive d'un fichier deja aplati, avec ses sommets et son image."""
    j, binaire = aplatir.lire_glb(chemin)
    prims = aplatir.extraire(j, binaire, None, False, True)
    assert len(prims) == 1, f'{chemin}: {len(prims)} primitives, attendu 1 (aplatir d abord)'
    p = prims[0]
    im, facteur = aplatir.image_du_materiau(j, binaire, p['mat'])
    return p, aplatir.cuire(im, facteur)


# La scene fait 192 m de cote. Un modele dont la BOITE ENGLOBANTE sort de ce carre est masque
# par le client en production, entierement, sans erreur; l'apercu local lance en `local-scene`
# ne verifie pas les limites, donc le defaut ne se voit qu'une fois deploye. Les arbres du bord
# debordaient de deux a trois metres et la carte s'est retrouvee sans un seul arbre
# (proprietaire, 2 Sep). Chaque instance est donc ramenee dans le carre, elle et sa ramure.
MARGE_SCENE = 0.5


def instancier(p, x, y, z, sc, ry):
    """Une copie du primitive, tournee autour de Y, mise a l'echelle, posee et RENTREE."""
    a = math.radians(ry)
    ca, sa = math.cos(a), math.sin(a)
    pos, nor = [], []
    for (px, py, pz) in p['pos']:
        pos.append((x + sc * (px * ca + pz * sa), y + sc * py, z + sc * (-px * sa + pz * ca)))
    # Ce que cette instance occupe reellement, ramure comprise, puis le decalage qui la rentre.
    xs = [q[0] for q in pos]
    zs = [q[2] for q in pos]
    dx = max(0.0, MARGE_SCENE - min(xs)) - max(0.0, max(xs) - (SCENE_SIDE - MARGE_SCENE))
    dz = max(0.0, MARGE_SCENE - min(zs)) - max(0.0, max(zs) - (SCENE_SIDE - MARGE_SCENE))
    if dx or dz:
        pos = [(q[0] + dx, q[1], q[2] + dz) for q in pos]
    for n in p['nor']:
        if n is None:
            nor.append(None)
        else:
            nor.append((n[0] * ca + n[2] * sa, n[1], -n[0] * sa + n[2] * ca))
    return {'pos': pos, 'nor': nor, 'uv': p['uv'], 'idx': list(p['idx']), 'mat': p['mat']}


def ecrire(nom, prims, atlas, regions):
    for p in prims:
        u0, v0, w, h = regions[p['tuile']]
        p['uv_atlas'] = [(u0 + (u % 1.0) * w, v0 + (v % 1.0) * h) for (u, v) in p['uv']]
    xs = [q[0] for p in prims for q in p['pos']]
    zs = [q[2] for p in prims for q in p['pos']]
    if min(xs) < 0 or min(zs) < 0 or max(xs) > SCENE_SIDE or max(zs) > SCENE_SIDE:
        raise SystemExit(f'{nom}: boite englobante hors scene, x {min(xs):.2f}..{max(xs):.2f} '
                         f'z {min(zs):.2f}..{max(zs):.2f} pour une scene de 0..{SCENE_SIDE:.0f}')
    taille = aplatir.ecrire_glb(os.path.join(OUT, nom), [(False, prims)], atlas)
    print(f'-> {nom}: {len(prims)} instances fondues, {sum(len(p["pos"]) for p in prims)} sommets, '
          f'atlas {atlas.width}x{atlas.height}, {taille // 1024} Ko')


if __name__ == '__main__':
    arbre, img_arbre = primitive_de(os.path.join(OUT, 'tree.glb'))
    places = placer_arbres()
    prims = []
    for (x, y, z, sc, ry) in places:
        q = instancier(arbre, x, y, z, sc, ry)
        q['tuile'] = 0
        prims.append(q)
    ecrire('vegetation-arbres.glb', prims, img_arbre, {0: (0.0, 0.0, 1.0, 1.0)})

    b0, img0 = primitive_de(os.path.join(OUT, 'bush-02.glb'))
    b1, img1 = primitive_de(os.path.join(OUT, 'bush-03.glb'))
    H = max(img0.height, img1.height)
    W = img0.width + img1.width
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    atlas.paste(img0, (0, 0))
    atlas.paste(img1, (img0.width, 0))
    regions = {0: (0.0, 0.0, img0.width / W, img0.height / H),
               1: (img0.width / W, 0.0, img1.width / W, img1.height / H)}
    prims = []
    for (k, x, y, z, sc, ry) in placer_buissons():
        q = instancier(b0 if k == 0 else b1, x, y, z, sc, ry)
        q['tuile'] = k
        prims.append(q)
    ecrire('vegetation-buissons.glb', prims, atlas, regions)
