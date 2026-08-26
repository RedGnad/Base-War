import { engine, Transform, MeshRenderer, Material, Entity } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Trap, GEARS } from '../shared/schemas'
import { room } from '../shared/messages'
import { formatIncome } from '../shared/loot-table'
import { monAdresseClient, alerter, pushToFeed } from './theft'
import { applyFreeze } from './locomotion'
import { carryView } from './carry'

/**
 * Gear, client side: what the player holds, and what is lying on the floor.
 *
 * A trap is drawn for everyone, as a plate, because a trap nobody can see is a trap nobody
 * can learn to avoid. What is NOT drawn is who armed it: the component carries the owner for
 * the server's sake, and the plate keeps that to itself. Your own plates are tinted so you do
 * not have to remember where you left them.
 */

export const gearView = {
  /** Pocket counts by gear id, mirrored from the server on every wallet tick. */
  held: new Array<number>(GEARS.length).fill(0),
  /** True while the player is choosing where a trap goes: the marker is up. */
  placing: false
}

const PLAQUE = Color4.create(0.55, 0.55, 0.6, 0.85)
const MIENNE = Color4.create(0.35, 0.95, 0.45, 0.85)
const vues = new Map<number, Entity>()

let marqueur: Entity

export function peutPoserPiege(): boolean {
  return gearView.held[0] > 0 && carryView.code < 0
}

export function basculerPose(): void {
  gearView.placing = !gearView.placing
}

export function poserPiege(): void {
  gearView.placing = false
  void room.send('placeGear', { gear: 0 })
}

export function acheterGear(gear: number): void {
  void room.send('buyGear', { gear })
}

export function setupGear(): void {
  marqueur = engine.addEntity()
  Transform.create(marqueur, { position: Vector3.create(0, -50, 0), scale: Vector3.Zero() })
  MeshRenderer.setCylinder(marqueur, 0.5, 0.5)
  Material.setPbrMaterial(marqueur, { albedoColor: Color4.create(0.35, 0.95, 0.45, 0.42), emissiveColor: MIENNE, emissiveIntensity: 0.7 })

  room.onMessage('gearHeld', (d) => {
    for (let i = 0; i < GEARS.length; i++) gearView.held[i] = d.counts[i] ?? 0
  })
  room.onMessage('gearBought', (d) => {
    alerter(`${GEARS[d.gear].name} IN YOUR POCKET  ·  you hold ${d.held}  ·  -${formatIncome(d.cost)}`, '#4dd2ff', 4000)
  })
  room.onMessage('gearPlaced', (d) => {
    alerter(`${GEARS[d.gear].name} SET  ·  ${d.held} left in your pocket`, '#4dd2ff', 3000)
  })
  room.onMessage('trapped', (d) => {
    applyFreeze(d.gelMs)
    alerter(`${d.ownerName.toUpperCase()}'S TRAP  ·  frozen ${Math.round(d.gelMs / 1000)}s`, '#ff6b6b', 5000)
  })
  room.onMessage('trapSprung', (d) => {
    alerter(`YOUR TRAP CAUGHT ${d.byName.toUpperCase()}`, '#4dd2ff', 6000)
    pushToFeed(`${d.byName} stepped on a trap`)
  })

  engine.addSystem(() => {
    const moi = monAdresseClient()
    const vivants = new Set<number>()
    for (const [e, t] of engine.getEntitiesWith(Trap)) {
      const id = e as unknown as number
      vivants.add(id)
      if (vues.has(id)) continue
      const tr = Transform.getOrNull(e)
      if (tr === null) continue
      const plaque = engine.addEntity()
      Transform.create(plaque, {
        position: Vector3.create(tr.position.x, tr.position.y + 0.04, tr.position.z),
        scale: Vector3.create(1, 0.08, 1)
      })
      MeshRenderer.setCylinder(plaque, 0.55, 0.55)
      const teinte = t.owner.toLowerCase() === moi ? MIENNE : PLAQUE
      Material.setPbrMaterial(plaque, { albedoColor: teinte, emissiveColor: teinte, emissiveIntensity: 0.4, metallic: 0.6, roughness: 0.4 })
      vues.set(id, plaque)
    }
    for (const [id, p] of [...vues]) {
      if (vivants.has(id)) continue
      engine.removeEntity(p)
      vues.delete(id)
    }

    // The marker sits at the player's feet while they are choosing, and nowhere otherwise.
    const m = Transform.getMutableOrNull(marqueur)
    if (m === null) return
    if (!gearView.placing || !peutPoserPiege()) {
      gearView.placing = false
      if (m.scale.x !== 0) m.scale = Vector3.Zero()
      return
    }
    const me = Transform.getOrNull(engine.PlayerEntity)
    if (me === null) return
    m.position = Vector3.create(me.position.x, me.position.y + 0.05, me.position.z)
    m.scale = Vector3.create(1, 0.06, 1)
  })
}
