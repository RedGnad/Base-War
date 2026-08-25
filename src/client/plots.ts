import { PRODUCTION_PER_RARITY } from '../shared/economy'
import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem,
  Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import {
  Plot, PLOT_MAX_ITEMS, SLOTS_PER_FLOOR, MAX_FLOORS, FLOOR_HEIGHT, slotPosition,
  rampPosition, BASE_SIDE, WALL_THICKNESS, WALL_HEIGHT, DOOR_WIDTH, RAMP_ANGLE, RAMP_LENGTH, STAIRWELL_WIDTH
} from '../shared/schemas'
import {
  rarity, rarityOf, mutationDe, itemColor, mutation, itemName, formatIncome, itemIncome
} from '../shared/loot-table'

const INCOME_UI = PRODUCTION_PER_RARITY

export const placementView = { selection: -1 }

function goUpOneFloor(v: View): void {
  const t = Transform.getOrNull(v.plinth)
  if (t === null) return
  let open = 1
  for (const [, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() === v.ownerId.toLowerCase()) { open = p.floors; break }
  }
  const moi = Transform.getOrNull(engine.PlayerEntity)
  const actuel = moi === null ? 0 : Math.max(0, Math.round(moi.position.y / FLOOR_HEIGHT))
  const cible = actuel + 1 >= open ? 0 : actuel + 1
  const y = cible * FLOOR_HEIGHT + 0.3
  // Land on the solid slab, not in the stairwell: the floor stops at dx = +2.5.
  const SORTIE_DX = 1.96
  void movePlayerTo({
    newRelativePosition: Vector3.create(t.position.x + SORTIE_DX, y, t.position.z + 3.0),
    cameraTarget: Vector3.create(t.position.x - 1.2, y + 0.8, t.position.z - 2.2)
  })
}
import { steal, sell, monAdresseClient, moveItemBetweenSlots, gift, alerter } from './theft'
import { HUE } from './theme'
import { movePlayerTo } from '~system/RestrictedActions'

type Floor = { floorSlab: Entity; walls: Entity[]; ramp: Entity }
type View = {
  plinth: Entity; label: Entity; gain: Entity; door: Entity
  floors: Floor[]; items: Entity[]; sentry: Entity; ascenseur: Entity; signature: string; ownerId: string
}

/** World-label colours, built here rather than read from the shared token object: that one
 * is constructed at module load and a system can run before its module was touched. */
const NOIR = Color3.create(0, 0, 0)
const VERT = Color4.fromHexString(HUE.money + 'ff')

const GRIS = '#9aa3b0ff'
const GRIS_CLAIR = '#b6bec9ff'
const FLOOR_COLOR = '#7f8794ff'

function bloc(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: Color4.fromHexString(color), roughness: 0.85 })
  return e
}

function vitre(x: number, y: number, z: number, sx: number, sy: number, sz: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(0.62, 0.78, 0.88, 0.22),   // alpha bas = transparent
    metallic: 0.1,
    roughness: 0.05
  })
  return e
}

function buildFloor(x: number, z: number, floor: number): Floor {
  const y = floor * FLOOR_HEIGHT
  const c = BASE_SIDE
  const h = WALL_HEIGHT
  const ep = WALL_THICKNESS

  const floorSlab = bloc(x - STAIRWELL_WIDTH / 2, y + 0.12, z, c - STAIRWELL_WIDTH, 0.24, c, FLOOR_COLOR)
  const walls: Entity[] = [
    vitre(x, y + h / 2, z - c / 2, c, h, ep),                            // fond
    vitre(x - c / 2, y + h / 2, z, ep, h, c),                            // gauche
    vitre(x + c / 2, y + h / 2, z, ep, h, c),                            // droite
    vitre(x - (c + DOOR_WIDTH) / 4, y + h / 2, z + c / 2, (c - DOOR_WIDTH) / 2, h, ep),
    vitre(x + (c + DOOR_WIDTH) / 4, y + h / 2, z + c / 2, (c - DOOR_WIDTH) / 2, h, ep),
    bloc(x, y + h - 0.15, z + c / 2, DOOR_WIDTH, 0.3, ep, GRIS_CLAIR),  // linteau
    bloc(x - c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, GRIS),
    bloc(x + c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, GRIS),
    bloc(x - c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, GRIS),
    bloc(x + c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, GRIS)
  ]

  const r = rampPosition(floor)
  const ramp = engine.addEntity()
  Transform.create(ramp, {
    position: Vector3.create(x + r.dx, y + FLOOR_HEIGHT / 2, z + r.dz),
    scale: Vector3.create(STAIRWELL_WIDTH - 0.3, 0.18, RAMP_LENGTH),
    rotation: Quaternion.fromEulerDegrees(-RAMP_ANGLE, 0, 0)
  })
  MeshRenderer.setBox(ramp)
  MeshCollider.setBox(ramp)
  Material.setPbrMaterial(ramp, { albedoColor: Color4.fromHexString('#c9a227ff'), roughness: 0.7, metallic: 0.3 })

  for (const cote of [-1, 1]) {
    const rail = engine.addEntity()
    Transform.create(rail, {
      parent: ramp,
      position: Vector3.create(cote * 0.5, 3.0, 0),
      scale: Vector3.create(0.06, 6.0, 1.0)
    })
    MeshRenderer.setBox(rail)
    MeshCollider.setBox(rail)
    Material.setPbrMaterial(rail, { albedoColor: Color4.fromHexString('#7d8698ff'), roughness: 0.6, metallic: 0.4 })
  }

  const RAIL_HEIGHT = 1.1
  const stairwellEdge = c / 2 - STAIRWELL_WIDTH
  walls.push(
    bloc(x + stairwellEdge, y + RAIL_HEIGHT / 2, z, 0.12, RAIL_HEIGHT, c, '#7d8698'),
    bloc(x + c / 2 - STAIRWELL_WIDTH / 2, y + RAIL_HEIGHT / 2, z - c / 2 + 0.06, STAIRWELL_WIDTH, RAIL_HEIGHT, 0.12, '#7d8698'),
    bloc(x + c / 2 - STAIRWELL_WIDTH / 2, y + RAIL_HEIGHT / 2, z + c / 2 - 0.06, STAIRWELL_WIDTH, RAIL_HEIGHT, 0.12, '#7d8698')
  )

  return { floorSlab, walls, ramp }
}
const views = new Map<number, View>()   // clef = entite synchronisee du Plot

function createView(x: number, z: number): View {
  const plinth = bloc(x, 0.06, z, BASE_SIDE + 1.6, 0.12, BASE_SIDE + 1.6, '#6b6f78ff')

  const floors: Floor[] = []
  for (let e = 0; e < MAX_FLOORS; e++) floors.push(buildFloor(x, z, e))

  const ascenseur = engine.addEntity()
  Transform.create(ascenseur, {
    position: Vector3.create(x + BASE_SIDE / 2 - STAIRWELL_WIDTH / 2, FLOOR_HEIGHT / 2, z + 1.4),
    scale: Vector3.create(0.5, FLOOR_HEIGHT, 0.5)
  })
  MeshRenderer.setBox(ascenseur)
  MeshCollider.setBox(ascenseur)
  Material.setPbrMaterial(ascenseur, {
    albedoColor: Color4.fromHexString('#2f3648ff'),
    emissiveColor: Color4.fromHexString('#4dd2ffff'), emissiveIntensity: 0.7,
    metallic: 0.85, roughness: 0.25
  })
  PointerEvents.create(ascenseur, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Go up' } }
    ]
  })

  const door = engine.addEntity()
  Transform.create(door, {
    position: Vector3.create(x, (MAX_FLOORS * FLOOR_HEIGHT) / 2, z),
    scale: Vector3.create(0, 0, 0)
  })
  MeshRenderer.setBox(door)
  // A shield you can walk through is a lie. It had a renderer and no collider, so it
  // looked like a wall and stopped nothing.
  MeshCollider.setBox(door)
  Material.setPbrMaterial(door, {
    albedoColor: Color4.create(0.30, 0.85, 1.0, 0.16),
    emissiveColor: Color4.fromHexString('#4dd2ffff'),
    emissiveIntensity: 0.55,
    metallic: 0,
    roughness: 0.1
  })
  PointerEvents.create(plinth, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Leave a gift' } }
    ]
  })

  const sentry = engine.addEntity()
  Transform.create(sentry, {
    position: Vector3.create(x, MAX_FLOORS * FLOOR_HEIGHT + 0.35, z),
    scale: Vector3.create(0, 0, 0)
  })
  MeshRenderer.setCylinder(sentry, 0.25, 0.45)
  Material.setPbrMaterial(sentry, {
    albedoColor: Color4.fromHexString('#4dd2ffff'),
    emissiveColor: Color4.fromHexString('#4dd2ffff'),
    emissiveIntensity: 1.6, metallic: 0.8, roughness: 0.2
  })

  // A base reads like a belt crate: what it earns in green above who owns it in white,
  // both outlined so they hold over sky, grass or a wall. One TextShape carries one colour,
  // which is why this is two entities and not two lines of one.
  const gain = engine.addEntity()
  Transform.create(gain, { position: Vector3.create(x, MAX_FLOORS * FLOOR_HEIGHT + 1.62, z), scale: Vector3.create(0.6, 0.6, 0.6) })
  Billboard.create(gain, {})
  TextShape.create(gain, {
    text: '', fontSize: 4.4, textColor: VERT, outlineWidth: 0.22, outlineColor: NOIR
  })

  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(x, MAX_FLOORS * FLOOR_HEIGHT + 1.0, z), scale: Vector3.create(0.6, 0.6, 0.6) })
  Billboard.create(label, {})
  TextShape.create(label, {
    text: '', fontSize: 3, textColor: Color4.White(), outlineWidth: 0.22, outlineColor: NOIR
  })

  const items: Entity[] = []
  for (let k = 0; k < PLOT_MAX_ITEMS; k++) {
    const o = engine.addEntity()
    const d = slotPosition(k)
    Transform.create(o, {
      position: Vector3.create(x + d.dx, -5, z + d.dz),
      scale: Vector3.create(0.45, 0.45, 0.45)
    })
    MeshRenderer.setBox(o)
    MeshCollider.setBox(o)
    PointerEvents.create(o, {
      pointerEvents: [
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Steal' } }
      ]
    })
    items.push(o)
  }
  return { plinth, label, gain, door, sentry, ascenseur, floors, items, signature: '', ownerId: '' }
}

function destroyView(v: View): void {
  engine.removeEntity(v.plinth)
  engine.removeEntity(v.label)
  engine.removeEntity(v.gain)
  engine.removeEntity(v.door)
  engine.removeEntity(v.sentry)
  engine.removeEntity(v.ascenseur)
  for (const e of v.floors) {
    engine.removeEntity(e.floorSlab)
    engine.removeEntity(e.ramp)
    for (const m of e.walls) engine.removeEntity(m)
  }
  for (const o of v.items) engine.removeEntity(o)
}

export function setupPlots(): void {
  engine.addSystem(() => {
    for (const v of views.values()) {
      for (let k = 0; k < v.items.length; k++) {
        if (
          inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.items[k])
        ) {
          if (v.ownerId.toLowerCase() === monAdresseClient()) {
            if (placementView.selection === -1) {
              placementView.selection = k
            } else if (placementView.selection === k) {
              placementView.selection = -1          // same item: on relache
            } else {
              moveItemBetweenSlots(placementView.selection, k)  // echange des deux places
              placementView.selection = -1
            }
          } else {
            steal(v.ownerId, k)
          }
          return
        }
      }

      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.ascenseur)
      ) {
        if (v.ownerId.toLowerCase() !== monAdresseClient()) {
          alerter('THAT ELEVATOR IS NOT YOURS: TAKE THE RAMP', '#ffd166', 3500)
          return
        }
        goUpOneFloor(v)
        return
      }

      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.plinth)
      ) {
        if (v.ownerId === '' || v.ownerId.toLowerCase() === monAdresseClient()) return
        if (placementView.selection === -1) {
          alerter('PICK ONE OF YOUR ITEMS FIRST, THEN TAP THEIR BASE', '#ffd166', 3500)
          return
        }
        gift(v.ownerId, placementView.selection)
        placementView.selection = -1
        return
      }
    }
  })

  engine.addSystem(() => {
    const vivantes = new Set<number>()

    for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
      const id = ent as unknown as number
      vivantes.add(id)
      const t = Transform.get(ent)
      let v = views.get(id)
      if (!v) {
        v = createView(t.position.x, t.position.z)
        views.set(id, v)
      }

      const lockSeconds = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
      const monBase = p.ownerId.toLowerCase() === monAdresseClient()
      const txt = TextShape.getMutableOrNull(v.label)
      if (txt !== null) {
        const lock = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
        const state = lock > 0 ? `\nLOCKED ${lock}s` : (p.ownerPresent ? '' : '\n(away)')
        const ledger = (p.given > 0 || p.received > 0)
          ? `\n${p.received} received  ·  ${p.given} given`
          : ''
        const ta = Transform.getMutableOrNull(v.ascenseur)
        if (ta !== null) {
          const h = p.floors * FLOOR_HEIGHT
          ta.scale = Vector3.create(0.5, h, 0.5)
          ta.position = Vector3.create(
            t.position.x + BASE_SIDE / 2 - STAIRWELL_WIDTH / 2, h / 2, t.position.z + 1.4
          )
        }
        const guard = p.sentries > 0 ? `\nSENTRY x${p.sentries}` : ''
        const ts = Transform.getMutableOrNull(v.sentry)
        if (ts !== null) {
          const k = p.sentries === 0 ? 0 : 0.6 + p.sentries * 0.18
          ts.scale = Vector3.create(k, k, k)
        }
        txt.text = `${p.ownerName}${state}${guard}${ledger}`
        txt.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')

        // What the base earns, read off its own items, so a passer-by can price a target
        // without opening anything.
        const tg = TextShape.getMutableOrNull(v.gain)
        if (tg !== null) {
          let perSecond = 0
          for (const code of p.items) perSecond += itemIncome(code, PRODUCTION_PER_RARITY)
          tg.text = perSecond > 0 ? `+${formatIncome(perSecond)}/s` : ''
        }
      }
      Material.setPbrMaterial(v.plinth, {
        albedoColor: Color4.fromHexString(p.ownerPresent ? '#4a5568ff' : '#40454fff')
      })

      for (let e = 0; e < v.floors.length; e++) {
        const open = e < p.floors
        const et = v.floors[e]
        const mettre = (ent: Entity, sx: number, sy: number, sz: number) => {
          const tr = Transform.getMutableOrNull(ent)
          if (tr !== null) tr.scale = open ? Vector3.create(sx, sy, sz) : Vector3.create(0, 0, 0)
        }
        mettre(et.floorSlab, BASE_SIDE - STAIRWELL_WIDTH, 0.24, BASE_SIDE)
        mettre(et.walls[0], BASE_SIDE, WALL_HEIGHT, WALL_THICKNESS)
        mettre(et.walls[1], WALL_THICKNESS, WALL_HEIGHT, BASE_SIDE)
        mettre(et.walls[2], WALL_THICKNESS, WALL_HEIGHT, BASE_SIDE)
        mettre(et.walls[3], (BASE_SIDE - DOOR_WIDTH) / 2, WALL_HEIGHT, WALL_THICKNESS)
        mettre(et.walls[4], (BASE_SIDE - DOOR_WIDTH) / 2, WALL_HEIGHT, WALL_THICKNESS)
        mettre(et.walls[5], DOOR_WIDTH, 0.3, WALL_THICKNESS)
        for (let m = 6; m <= 9; m++) mettre(et.walls[m], 0.28, WALL_HEIGHT, 0.28)
        mettre(et.ramp, 1.1, 0.18, RAMP_LENGTH)
        const rtr = Transform.getMutableOrNull(et.ramp)
        if (rtr !== null && (e + 1) >= p.floors) rtr.scale = Vector3.create(0, 0, 0)
      }

      const ptr = Transform.getMutableOrNull(v.door)
      if (ptr !== null) {
        const locked = p.lockedUntil > Date.now()
        const h = p.floors * FLOOR_HEIGHT + 0.6
        ptr.position = Vector3.create(t.position.x, h / 2, t.position.z)
        ptr.scale = locked
          ? Vector3.create(BASE_SIDE + 1.2, h, BASE_SIDE + 1.2)
          : Vector3.create(0, 0, 0)
      }

      // The signature only carries STRUCTURAL state. A value that ticks every second
      // (a countdown, a gauge) belongs on its own element: inside a cache key it forces
      // a full rebuild each second, which restarts item rotation tweens from identity.
      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.floors}|${p.items.join(',')}|${p.given}|${p.received}|${p.sentries}|${monBase ? placementView.selection : -1}`
      if (sig === v.signature) continue
      v.signature = sig
      v.ownerId = p.ownerId

      const mine = monBase
      const verbe = mine
        ? (placementView.selection === -1 ? 'Move' : 'Swap here')
        : 'Steal'
      for (let k = 0; k < v.items.length; k++) {
        const code = p.items[k]
        const label = code === undefined
          ? verbe
          : `${verbe} ${itemName(rarityOf(code), mutationDe(code))} · ${formatIncome(itemIncome(code, INCOME_UI))}/s`
        PointerEvents.createOrReplace(v.items[k], {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: label } }
          ]
        })
      }

      for (let k = 0; k < v.items.length; k++) {
        const tr = Transform.getMutableOrNull(v.items[k])
        if (tr === null) continue
        const d = slotPosition(k)
        if (k < p.items.length) {
          const code = p.items[k]
          const r = rarity(rarityOf(code))
          const m = mutation(mutationDe(code))
          const selected = mine && placementView.selection === k
          tr.position = Vector3.create(t.position.x + d.dx, d.dy + (selected ? 0.55 : 0), t.position.z + d.dz)
          const size = r.size * (m.mult > 1 ? 1.12 : 1) * (selected ? 1.25 : 1)
          tr.scale = Vector3.create(size, size, size)
          const c = Color4.fromHexString(itemColor(rarityOf(code), mutationDe(code)) + 'ff')
          Material.setPbrMaterial(v.items[k], {
            albedoColor: c, emissiveColor: c, emissiveIntensity: r.glow, roughness: 0.35, metallic: 0.6
          })
          if (r.tours > 0 || m.mult > 1) {
            Tween.createOrReplace(v.items[k], {
              mode: Tween.Mode.Rotate({ start: Quaternion.Identity(), end: Quaternion.fromEulerDegrees(0, 180, 0) }),
              duration: Math.round(360000 / Math.max(1, r.tours + (m.mult > 1 ? 30 : 0))),
              easingFunction: EasingFunction.EF_LINEAR
            })
            TweenSequence.createOrReplace(v.items[k], { sequence: [], loop: TweenLoop.TL_RESTART })
          } else {
            Tween.deleteFrom(v.items[k])
            TweenSequence.deleteFrom(v.items[k])
          }
        } else {
          tr.position = Vector3.create(t.position.x, -5, t.position.z)
        }
      }
    }

    for (const [id, v] of views) {
      if (vivantes.has(id)) continue
      destroyView(v)
      views.delete(id)
    }
  })
}
