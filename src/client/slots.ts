import {
  engine, Transform, MeshRenderer, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { BASE_COTE, accrocher, raisonInvalide } from '../shared/schemas'
import { room } from '../shared/messages'
import { Plot } from '../shared/schemas'
import { monAdresseClient } from './theft'

const SCENE_COTE = 80

export const slotView = { actif: false, valide: false, raison: '' }

let fantome: Entity
let etiquette: Entity
let autres: Array<{ x: number; z: number }> = []

export function basculerPose(): void {
  slotView.actif = !slotView.actif
  if (!slotView.actif) {
    const t = Transform.getMutableOrNull(fantome)
    if (t !== null) t.scale = Vector3.create(0, 0, 0)
    const e = Transform.getMutableOrNull(etiquette)
    if (e !== null) e.scale = Vector3.create(0, 0, 0)
  }
}

function maPosition(): { x: number; z: number } | null {
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

  etiquette = engine.addEntity()
  Transform.create(etiquette, { position: Vector3.create(0, 2.2, 0), scale: Vector3.create(0, 0, 0) })
  Billboard.create(etiquette, {})
  TextShape.create(etiquette, { text: '', fontSize: 3, textColor: Color4.White() })

  room.onMessage('basePositions', (d) => {
    autres = d.xs.map((x, i) => ({ x, z: d.zs[i] ?? 0 }))
  })

  engine.addSystem(() => {
    if (!slotView.actif) return
    if (!Transform.has(engine.PlayerEntity)) return
    const p = Transform.get(engine.PlayerEntity).position
    const x = accrocher(p.x)
    const z = accrocher(p.z)

    const moi = maPosition()
    const obstacles = moi === null
      ? autres
      : autres.filter((a) => Math.abs(a.x - moi.x) > 0.01 || Math.abs(a.z - moi.z) > 0.01)
    const raison = raisonInvalide(x, z, SCENE_COTE, obstacles)
    slotView.valide = raison === null
    slotView.raison = raison ?? ''

    const t = Transform.getMutableOrNull(fantome)
    if (t !== null) {
      t.position = Vector3.create(x, 0.08, z)
      t.scale = Vector3.create(BASE_COTE, 0.16, BASE_COTE)
    }
    const c = slotView.valide ? Color4.fromHexString('#3ddc84ff') : Color4.fromHexString('#e04a3aff')
    Material.setPbrMaterial(fantome, { albedoColor: c, emissiveColor: c, emissiveIntensity: 0.7 })

    const te = Transform.getMutableOrNull(etiquette)
    if (te !== null) {
      te.position = Vector3.create(x, 2.4, z)
      te.scale = Vector3.create(0.7, 0.7, 0.7)
    }
    const ts = TextShape.getMutableOrNull(etiquette)
    if (ts !== null) {
      ts.text = slotView.valide ? 'BUILD HERE' : slotView.raison
      ts.textColor = c
    }
  })
}

export function poserIci(): void {
  if (!Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position
  void room.send('claimSlot', { x: accrocher(p.x), z: accrocher(p.z) })
  basculerPose()
}
