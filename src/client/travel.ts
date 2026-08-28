import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { Plot, CENTER, BASE_SIDE, FLOOR_HEIGHT, tourner } from '../shared/schemas'
import { monAdresseClient } from './theft'
import { alerter } from './theft'

function maBase(): Vector3 | null {
  const moi = monAdresseClient()
  if (moi === '') return null
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const t = Transform.getOrNull(e)
    if (t === null) return null
    // In front of the DOOR, which faces the belt: a base north of the belt is turned round,
    // so the door is on the -z side there. `tourner` puts the landing on the right side.
    const o = tourner(t.position.z, 0, BASE_SIDE / 2 + 1.5)
    return Vector3.create(t.position.x + o.dx, 0, t.position.z + o.dz)
  }
  return null
}

export const travelView = {
  peutRentrer: false,
  open: false
}

export function setupTravel(): void {
  engine.addSystem(() => { travelView.peutRentrer = maBase() !== null })
}

export function rentrer(): void {
  const p = maBase()
  if (p === null) { alerter('YOU HAVE NO BASE YET', '#ffd166', 3000); return }
  void movePlayerTo({ newRelativePosition: p, cameraTarget: Vector3.create(p.x, FLOOR_HEIGHT, p.z - 4) })
}

export function goToBelt(): void {
  const p = Vector3.create(CENTER.x, 0, CENTER.z - 4.5)
  void movePlayerTo({ newRelativePosition: p, cameraTarget: Vector3.create(CENTER.x, 2.5, CENTER.z) })
}
