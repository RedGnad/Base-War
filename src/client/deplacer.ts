import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

/**
 * Le seul endroit d'ou le jeu deplace un joueur, et le seul qui l'ecrive.
 *
 * Ce n'est pas une regle de plus sur le joueur: il va ou il veut, y compris hors du terrain.
 * C'est un point d'observation. Cinq endroits appelaient `movePlayerTo` directement, chacun
 * calculant sa cible a partir d'une position lue ailleurs, et un deplacement inattendu ne
 * laissait aucune trace: le 28 Aug un socle lu a la place de sa racine (coordonnees locales,
 * donc zero) envoyait au coin de la carte, et il a fallu relire tout le client pour le voir.
 * Chaque deplacement dit maintenant QUI l'a demande et OU, dans le journal du client.
 *
 * Seules les valeurs non finies sont refusees, et rien d'autre. Une marge sur le bord du
 * terrain paraissait prudente et etait fausse: `EDGE_MARGIN` vaut 9, une base posee au plus
 * pres du bord a sa porte a un demi-metre du mur, et ce retour chez soi legitime se serait
 * fait refuser sans un mot. Une garde qui bloque le jeu reel coute plus que ce qu'elle protege.
 */
function fini(n: number): boolean { return typeof n === 'number' && isFinite(n) }

/**
 * Le dernier deplacement, pour que l'ECRAN le dise.
 *
 * Le journal du client n'emporte pas la sortie des scenes: la categorie JAVASCRIPT y est
 * desactivee, et `console.log` d'une scene n'atteint jamais `Player.log` (verifie le 2 Sep,
 * zero ligne a nous dans un fichier de trente-six kilo-octets). Une trace qu'on ne peut pas
 * lire ne prouve rien. Alors le jeu le dit a l'ecran, avec le nom de l'appelant: si un
 * deplacement inattendu se produit, le joueur voit QUI l'a demande au moment ou ca arrive, et
 * s'il ne voit rien, c'est que le jeu n'a pas deplace le joueur du tout.
 */
export const deplacementView = { quoi: '', ou: '', quand: 0 }

export function allerA(quoi: string, cible: Vector3, camera: Vector3): boolean {
  const ou = `${cible.x.toFixed(1)}, ${cible.y.toFixed(1)}, ${cible.z.toFixed(1)}`
  if (!fini(cible.x) || !fini(cible.y) || !fini(cible.z)) {
    console.log(`[CLIENT] deplacement REFUSE (${quoi}), cible non finie: ${ou}`)
    return false
  }
  console.log(`[CLIENT] deplacement (${quoi}) vers ${ou}`)
  deplacementView.quoi = quoi
  deplacementView.ou = ou
  deplacementView.quand = Date.now()
  void movePlayerTo({ newRelativePosition: cible, cameraTarget: camera })
  return true
}
