#!/usr/bin/env python3
"""
Le trait au sol qui dessine la place: un anneau, pas un disque.

Le disque plein cachait l'herbe du centre. Ce qu'il faut est un TRAIT d'epaisseur constante
le long de l'ellipse, l'herbe visible dedans. Trois facons de le faire, une seule tient:

  - un tore: le moteur n'a pas cette primitive;
  - un plan avec une texture a trous: l'alpha est cher sur un GPU de telephone, et l'atelier
    est net la-dessus, on l'evite partout ailleurs dans ce jeu;
  - la geometrie: un ruban triangule, un objet rendu, un materiau, aucune transparence.

L'epaisseur est constante en METRES, pas en proportion. Mettre a l'echelle une ellipse plus
petite donnerait un ruban large sur les flancs et mince aux extremites; on decale donc chaque
point le long de la NORMALE a l'ellipse, qui n'est pas la direction du rayon.

Les demi-axes doivent rester ceux de `PLAZA_A` et `PLAZA_B` dans `src/shared/schemas.ts`: le
trait dessine la regle, et un trait qui ment est pire que pas de trait.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from importlib import util as _u
_spec = _u.spec_from_file_location('aplatir', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aplatir-glb.py'))
aplatir = _u.module_from_spec(_spec); _spec.loader.exec_module(aplatir)

RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SORTIE = os.path.join(RACINE, 'assets', 'toy')

A, B = 18.0, 13.0      # doit valoir PLAZA_A et PLAZA_B
TRAIT = 1.5            # epaisseur du ruban, en metres
SEGMENTS = 128
# Le grain de la rue: une tuile de `mat-wall.png` tous les quatre metres. Les UV sont donc
# ecrits en metres divises par quatre, et la scene pose le materiau avec un tiling de 1:
# le trait et la bande centrale portent alors la MEME matiere a la MEME echelle.
TUILE_M = 4.0

def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def anneau():
    """Le ruban, en deux boucles de points: le bord exterieur et le bord interieur."""
    ext, inte = [], []
    for i in range(SEGMENTS):
        t = 2 * math.pi * i / SEGMENTS
        ct, st = math.cos(t), math.sin(t)
        x, z = A * ct, B * st
        # La normale sortante d'une ellipse: (b cos t, a sin t), pas (cos t, sin t).
        nx, nz = B * ct, A * st
        n = math.hypot(nx, nz)
        ext.append((x, z))
        inte.append((x - TRAIT * nx / n, z - TRAIT * nz / n))
    return ext, inte

def main():
    os.makedirs(SORTIE, exist_ok=True)
    ext, inte = anneau()
    # `u` court le long du ruban, `v` le traverse, tous deux en tuiles de quatre metres.
    perim = [0.0]
    for i in range(SEGMENTS):
        j = (i + 1) % SEGMENTS
        perim.append(perim[-1] + math.hypot(ext[j][0] - ext[i][0], ext[j][1] - ext[i][1]))
    pos, nor, uv, idx = [], [], [], []
    for i in range(SEGMENTS):
        j = (i + 1) % SEGMENTS
        ui, uj = perim[i] / TUILE_M, perim[i + 1] / TUILE_M
        v = TRAIT / TUILE_M
        base = len(pos)
        for (x, z), (a, b) in ((ext[i], (ui, 0.0)), (ext[j], (uj, 0.0)), (inte[j], (uj, v)), (inte[i], (ui, v))):
            pos.append((x, 0.0, z)); nor.append((0.0, 1.0, 0.0)); uv.append((a, b))
        idx.extend([base, base + 2, base + 1, base, base + 3, base + 2])
    # Une image d'un pixel blanc: la scene remplace le materiau par celui de la rue, texture
    # comprise, donc celle du fichier ne sert qu'a le rendre valide.
    atlas = Image.new('RGBA', (2, 2), (255, 255, 255, 255))
    chemin = os.path.join(SORTIE, 'plaza-ring.glb')
    taille = aplatir.ecrire_glb(chemin, [(False, [{'pos': pos, 'nor': nor, 'uv_atlas': uv, 'idx': idx}])], atlas)
    xs = [p[0] for p in pos]; zs = [p[2] for p in pos]
    largeurs = [math.hypot(ext[i][0] - inte[i][0], ext[i][1] - inte[i][1]) for i in range(SEGMENTS)]
    print(f"plaza-ring.glb  {taille/1024:.1f} Ko  {len(idx)//3} triangles  1 materiau")
    print(f"  demi-axes exterieurs {A} x {B}, boite x {min(xs):.2f}..{max(xs):.2f}  z {min(zs):.2f}..{max(zs):.2f}")
    print(f"  epaisseur du trait: {min(largeurs):.3f} a {max(largeurs):.3f} m (constante voulue: {TRAIT})")
    print(f"  perimetre {perim[-1]:.1f} m, soit {perim[-1]/TUILE_M:.1f} tuiles de {TUILE_M} m le long du ruban")

if __name__ == '__main__':
    main()
