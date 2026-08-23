#!/bin/bash
# Remise a zero du stockage local de developpement.
#
# PIEGE: vider le fichier pendant qu'un serveur tourne ne sert a RIEN. Le serveur garde
# l'etat en memoire et le reecrit a sa prochaine sauvegarde. Il faut donc attendre qu'il
# se taise (il s'eteint ~2 min apres le depart du dernier joueur), effacer, puis verifier
# que rien ne revient.
F="node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json"
[ -f "$F" ] || { echo "  pas de stockage a effacer"; exit 0; }

echo "  attente du silence du serveur (sortir de la scene ou fermer l'apercu)..."
last=""
stable=0
for i in $(seq 1 90); do
  cur=$(stat -f %m "$F" 2>/dev/null)
  if [ "$cur" = "$last" ]; then stable=$((stable+1)); else stable=0; fi
  last="$cur"
  [ $stable -ge 8 ] && break        # 8 lectures identiques a 2 s = 16 s sans ecriture
  sleep 2
done

if [ $stable -lt 8 ]; then
  echo "  ECHEC: le stockage est encore ecrit, un serveur tourne. Ferme l'apercu et relance."
  exit 1
fi

echo '{"env":{},"world":{},"players":{}}' > "$F"
sleep 6
if [ "$(cat "$F")" = '{"env":{},"world":{},"players":{}}' ]; then
  echo "  remise a zero confirmee: bases, butin, pieces et paliers effaces"
else
  echo "  ECHEC: un serveur a reecrit le fichier juste apres l'effacement"
  exit 1
fi
