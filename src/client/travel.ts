import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { Plot, CENTRE, BASE_COTE, ETAGE_HAUTEUR } from '../shared/schemas'
import { monAdresseClient } from './theft'
import { alerter } from './theft'

function maBase(): Vector3 | null {
  const moi = monAdresseClient()
  if (moi === '') return null
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const t = Transform.getOrNull(e)
    if (t === null) return null
    return Vector3.create(t.position.x, 0, t.position.z + BASE_COTE / 2 + 1.5)
  }
  return null
}

export const travelView = {
  peutRentrer: false,
  ouvert: false
}

export function basculerVoyage(): void { travelView.ouvert = !travelView.ouvert }

export function setupTravel(): void {
  engine.addSystem(() => { travelView.peutRentrer = maBase() !== null })
}

export function rentrer(): void {
  const p = maBase()
  if (p === null) { alerter('YOU HAVE NO BASE YET', '#ffd166', 3000); return }
  void movePlayerTo({ newRelativePosition: p, cameraTarget: Vector3.create(p.x, ETAGE_HAUTEUR, p.z - 4) })
}

export function allerAuTapis(): void {
  const p = Vector3.create(CENTRE.x, 0, CENTRE.z - 4.5)
  void movePlayerTo({ newRelativePosition: p, cameraTarget: Vector3.create(CENTRE.x, 2.5, CENTRE.z) })
}
