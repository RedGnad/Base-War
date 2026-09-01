import { TOY, plasticDe } from './toy'
import {
  engine, Transform, MeshRenderer, Material, TextShape, Billboard, BillboardMode, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { PLINTH_SIDE, spotLePlusProche } from '../shared/schemas'
import { room } from '../shared/messages'
import { Plot } from '../shared/schemas'
import { monAdresseClient } from './theft'
import { envoyerOuAttendre } from './intent'



export const slotView = { active: false, valid: false, reason: '' }

let fantome: Entity
let label: Entity
let autres: Array<{ x: number; z: number }> = []
/** The spot the marker is on, which is what gets claimed. */
let vise: { x: number; z: number } | null = null
/** Close enough to claim, matching the server's own reach so the marker never lies. */
const PORTEE_POSE = 7

export function basculerPose(): void {
  slotView.active = !slotView.active
  if (!slotView.active) {
    const t = Transform.getMutableOrNull(fantome)
    if (t !== null) t.scale = Vector3.create(0, 0, 0)
    const e = Transform.getMutableOrNull(label)
    if (e !== null) e.scale = Vector3.create(0, 0, 0)
  }
}

function myBasePoint(): { x: number; z: number } | null {
  const moi = monAdresseClient()
  if (moi === '') return null
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const t = Transform.getOrNull(e)
    return t === null ? null : { x: t.position.x, z: t.position.z }
  }
  return null
}

export function setupSlots(): void {
  fantome = engine.addEntity()
  Transform.create(fantome, { position: Vector3.create(0, 0.08, 0), scale: Vector3.create(0, 0, 0) })
  MeshRenderer.setBox(fantome)

  label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(0, 2.2, 0), scale: Vector3.create(0, 0, 0) })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(label, { text: '', fontSize: 3, textColor: Color4.White() })

  room.onMessage('basePositions', (d) => {
    autres = d.xs.map((x, i) => ({ x, z: d.zs[i] ?? 0 }))
  })

  /*
    The marker shows the nearest EMPTY SPOT, not the ground under the player.

    Bases stand on a fixed set of spots now, so "where do I want it" has sixteen answers and
    the player picks one by walking to it. The marker therefore sits on the spot rather than
    following the feet, which is what makes it readable at a distance: you can see from across
    the lane which pitches are free before you walk over.
  */
  engine.addSystem(() => {
    if (!slotView.active) return
    if (!Transform.has(engine.PlayerEntity)) return
    const p = Transform.get(engine.PlayerEntity).position

    const moi = myBasePoint()
    const obstacles = moi === null
      ? autres
      : autres.filter((a) => Math.abs(a.x - moi.x) > 0.01 || Math.abs(a.z - moi.z) > 0.01)
    const spot = spotLePlusProche(p.x, p.z, obstacles)
    if (spot === null) { slotView.valid = false; slotView.reason = 'no spot'; return }
    const x = spot.x
    const z = spot.z
    vise = { x, z }
    const loin = Math.hypot(p.x - x, p.z - z) > PORTEE_POSE
    slotView.valid = spot.libre && !loin
    slotView.reason = !spot.libre ? 'TAKEN' : (loin ? 'WALK OVER' : '')

    const t = Transform.getMutableOrNull(fantome)
    if (t !== null) {
      t.position = Vector3.create(x, 0.08, z)
      t.scale = Vector3.create(PLINTH_SIDE, 0.16, PLINTH_SIDE)
    }
    const c = Color4.fromHexString((slotView.valid ? TOY.markerOk : TOY.markerBad) + 'ff')
    Material.setPbrMaterial(fantome, plasticDe(c, 0.7))

    const te = Transform.getMutableOrNull(label)
    if (te !== null) {
      te.position = Vector3.create(x, 2.4, z)
      te.scale = Vector3.create(0.7, 0.7, 0.7)
    }
    const ts = TextShape.getMutableOrNull(label)
    if (ts !== null) {
      ts.text = slotView.valid ? 'MOVE HERE' : slotView.reason
      ts.textColor = c
    }
  })
}

export function placeHere(): void {
  if (vise === null) return
  const { x, z } = vise
  envoyerOuAttendre(() => { void room.send('claimSlot', { x, z }) })
  basculerPose()
}
