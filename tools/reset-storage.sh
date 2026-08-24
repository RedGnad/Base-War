#!/bin/bash
# Remise a zero du stockage local de developpement.
#
# PIEGE: vider le fichier pendant qu'un serveur tourne ne sert a RIEN. Le serveur garde
# l'etat en memoire et le reecrit a sa prochaine sauvegarde. On attend donc le silence,
# on efface, puis on VERIFIE que rien n'est revenu.
#
# A lancer APERCU FERME (ou apres etre sorti de la scene depuis 2 min).
F="node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json"
VIDE='{"env":{},"world":{},"players":{}}'

[ -f "$F" ] || { echo "$VIDE" > "$F"; echo "  stockage cree vide"; exit 0; }

echo "  attente du silence du serveur (max 40 s)..."
last=""; stable=0
for i in $(seq 1 20); do
  cur=$(stat -f %m "$F" 2>/dev/null)
  [ "$cur" = "$last" ] && stable=$((stable+1)) || stable=0
  last="$cur"
  [ $stable -ge 5 ] && break     # 5 lectures identiques a 2 s = 10 s sans ecriture
  sleep 2
done

if [ $stable -lt 5 ]; then
  echo "  ECHEC: le stockage est encore ecrit, un serveur tourne."
  echo "         Ferme l'apercu dans le Creator Hub, puis relance."
  exit 1
fi

echo "$VIDE" > "$F"
sleep 5
if [ "$(cat "$F")" = "$VIDE" ]; then
  echo "  REMISE A ZERO CONFIRMEE"
  echo "    bases, butin, pieces, etages et paliers effaces"
else
  echo "  ECHEC: un serveur a reecrit le fichier juste apres l'effacement"
  exit 1
fi
