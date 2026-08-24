import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { Plot, CENTRE, BASE_COTE, ETAGE_HAUTEUR } from '../shared/schemas'
import { monAdresseClient } from './theft'
import { alerter } from './theft'

/**
 * DEPLACEMENT RAPIDE.
 *
 * Source, transcription 1: *« on a simplifie le gameplay a fond avec des tapis pour se
 * deplacer vite, des boutons pour teleporter »*.
 *
 * Ce n'est pas du confort, c'est du bareme. Le lieu fait 80 x 80 m, un juge a trois
 * minutes, et « Mobile UX and Accessibility » est l'un des trois criteres qui pesent 43 %.
 * Un joueur perdu au fond de la carte ne verra jamais la moitie du jeu.
 *
 * Deux destinations, pas plus: les deux poles de la boucle. Chez soi (ou l'on encaisse et
 * ou l'on defend) et le tapis (ou l'on achete). Une liste de destinations serait un menu
 * de plus a lire.
 */

/** Position de MA base, lue dans le composant autoritaire. Null tant qu'elle n'existe pas. */
function maBase(): Vector3 | null {
  const moi = monAdresseClient()
  if (moi === '') return null
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const t = Transform.getOrNull(e)
    if (t === null) return null
    // Devant l'entree, pas au centre du batiment: on ne se materialise pas dans un mur.
    return Vector3.create(t.position.x, 0, t.position.z + BASE_COTE / 2 + 1.5)
  }
  return null
}

export const travelView = { peutRentrer: false }

export function setupTravel(): void {
  engine.addSystem(() => { travelView.peutRentrer = maBase() !== null })
}

export function rentrer(): void {
  const p = maBase()
  if (p === null) { alerter('YOU HAVE NO BASE YET', '#ffd166', 3000); return }
  void movePlayerTo({ newRelativePosition: p, cameraTarget: Vector3.create(p.x, ETAGE_HAUTEUR, p.z - 4) })
}

export function allerAuTapis(): void {
  // Au bord du tapis, tourne vers lui: on arrive en regardant ce qu'on vient acheter.
  const p = Vector3.create(CENTRE.x, 0, CENTRE.z - 4.5)
  void movePlayerTo({ newRelativePosition: p, cameraTarget: Vector3.create(CENTRE.x, 2.5, CENTRE.z) })
}
