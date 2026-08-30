import { engine, Transform, MeshRenderer, Material, Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Plot, CENTER, BELT_HEIGHT } from '../shared/schemas'
import { plastic } from './toy'
import { tutoView } from './tutorial'
import { positionCaisse } from './box'
import { monAdresseClient } from './theft'

/**
 * The step beacon: where to go, said without a word.
 *
 * The organisers' recap of the Show & Tell asks for "visual guidance instead of text-heavy
 * tutorials", and their live sessions showed why: a player with a paragraph on screen still
 * says "I don't know what to do". The panel says why, the central button says what to
 * press; this is the missing third voice, WHERE. One gold column of light and a bobbing
 * chevron over the current step's target: the crate to smash, the belt to buy from, the
 * neighbour to rob. Steps whose target is a button (placing the base, collecting) show no
 * beacon, because pointing at the whole world teaches nothing.
 *
 * Two entities, emissive plastic, no light, no collider, no alpha: the phone budget's idea
 * of free. Hidden by scale, parked underground, like every other transient in the scene.
 */
const OR = '#ffd23f'
let colonne: Entity | null = null
let fleche: Entity | null = null

function cible(): Vector3 | null {
  if (tutoView.etape >= tutoView.total) return null
  if (tutoView.etape === 1) {
    // The crate being opened; before it stands, home, where the OPEN button will put it.
    const caisse = positionCaisse()
    if (caisse !== null) return caisse
    const moi = monAdresseClient()
    for (const [e, p] of engine.getEntitiesWith(Plot)) {
      if (p.ownerId.toLowerCase() !== moi) continue
      const t = Transform.getOrNull(e)
      if (t !== null) return Vector3.create(t.position.x, 0, t.position.z)
    }
    return null
  }
  if (tutoView.etape === 3) return Vector3.create(CENTER.x, BELT_HEIGHT, CENTER.z)
  if (tutoView.etape === 4) {
    // The nearest base that is not mine and has something on its shelves worth taking.
    const moi = monAdresseClient()
    const ici = Transform.getOrNull(engine.PlayerEntity)
    if (ici === null) return null
    let best: Vector3 | null = null
    let dist = Infinity
    for (const [e, p] of engine.getEntitiesWith(Plot)) {
      if (p.ownerId.toLowerCase() === moi) continue
      if (!p.items.some((c) => c >= 0)) continue
      const t = Transform.getOrNull(e)
      if (t === null) continue
      const d = Math.hypot(t.position.x - ici.position.x, t.position.z - ici.position.z)
      if (d < dist) { dist = d; best = Vector3.create(t.position.x, 0, t.position.z) }
    }
    return best
  }
  return null
}

export function setupGuidage(): void {
  colonne = engine.addEntity()
  Transform.create(colonne, { position: Vector3.create(0, -50, 0), scale: Vector3.Zero() })
  MeshRenderer.setCylinder(colonne, 0.22, 0.22)
  Material.setPbrMaterial(colonne, plastic(OR, 2.0))
  fleche = engine.addEntity()
  Transform.create(fleche, { position: Vector3.create(0, -50, 0), scale: Vector3.Zero() })
  // A cone with its apex at the bottom: an arrowhead pointing at the spot.
  MeshRenderer.setCylinder(fleche, 0, 0.5)
  Material.setPbrMaterial(fleche, plastic(OR, 2.6))

  let acc = 0
  engine.addSystem((dt) => {
    // Five checks a second: a beacon target moves at walking pace, not at frame pace.
    acc += dt
    if (acc < 0.2) return
    acc = 0
    const c = colonne === null ? null : Transform.getMutableOrNull(colonne)
    const f = fleche === null ? null : Transform.getMutableOrNull(fleche)
    if (c === null || f === null) return
    const ou = cible()
    if (ou === null) {
      if (c.scale.x !== 0) { c.scale = Vector3.Zero(); f.scale = Vector3.Zero() }
      return
    }
    const bob = Math.sin(Date.now() / 320) * 0.3
    c.position = Vector3.create(ou.x, ou.y + 3.4, ou.z)
    c.scale = Vector3.create(1, 4.4, 1)
    f.position = Vector3.create(ou.x, ou.y + 6.2 + bob, ou.z)
    f.scale = Vector3.create(1.1, 0.9, 1.1)
  })
}
