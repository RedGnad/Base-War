import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { SCENE_SIDE, FLOOR_HEIGHT, MAX_FLOORS } from '../shared/schemas'

/**
 * La seule porte par laquelle le jeu deplace un joueur.
 *
 * Cinq endroits appelaient `movePlayerTo` directement, chacun calculant sa cible a partir
 * d'une position lue ailleurs. Une seule de ces lectures qui tombe sur un enfant (coordonnees
 * locales, donc zero) et le joueur part au coin de la carte sans que rien ne le signale: c'est
 * arrive une premiere fois le 28 Aug avec le socle lu a la place de la racine, et rien
 * n'empechait que ca recommence ailleurs.
 *
 * Alors: une cible hors du terrain n'est plus jouee, elle est refusee et ecrite dans le
 * journal avec le nom de son appelant. La prochaine occurrence se nomme elle-meme au lieu de
 * demander une enquete.
 */
const BORD = 1.5
const PLAFOND = MAX_FLOORS * FLOOR_HEIGHT + 30

function fini(n: number): boolean { return typeof n === 'number' && isFinite(n) }

export function dansLeTerrain(x: number, y: number, z: number): boolean {
  if (!fini(x) || !fini(y) || !fini(z)) return false
  return x >= BORD && x <= SCENE_SIDE - BORD && z >= BORD && z <= SCENE_SIDE - BORD && y >= -1 && y <= PLAFOND
}

export function allerA(quoi: string, cible: Vector3, camera: Vector3): boolean {
  const ou = `${cible.x.toFixed(1)}, ${cible.y.toFixed(1)}, ${cible.z.toFixed(1)}`
  if (!dansLeTerrain(cible.x, cible.y, cible.z)) {
    console.log(`[CLIENT] deplacement REFUSE (${quoi}) vers ${ou}`)
    return false
  }
  console.log(`[CLIENT] deplacement (${quoi}) vers ${ou}`)
  void movePlayerTo({ newRelativePosition: cible, cameraTarget: camera })
  return true
}
