#!/bin/sh
# Regenere les modeles de decor aplatis depuis tools/model/source/. Voir aplatir-glb.py.
set -e
cd "$(dirname "$0")/../.."
A=tools/model/aplatir-glb.py
S=tools/model/source
O=assets/Models
# L'arbre: sans squelette (la pose de liaison est ce que le client montre clip a l'arret; la
# pose de repos des os est une image de l'animation et effondre la ramure), et sans la
# pancarte oubliee a son pied (trois noeuds, une texture de 426 Ko).
python3 $A $S/tree.glb    $O/tree.glb    --sans-skin --exclure '^(Cone|Cube|Cube\.001)$'
python3 $A $S/bush-02.glb $O/bush-02.glb --sans-collider
python3 $A $S/bush-03.glb $O/bush-03.glb --sans-collider
python3 $A $S/gun.glb     $O/gun.glb
