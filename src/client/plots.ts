import { PRODUCTION_PER_RARITY } from '../shared/economy'
import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, BillboardMode, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem,
  Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import {
  Plot, PLOT_MAX_ITEMS, SLOTS_PER_FLOOR, MAX_FLOORS, FLOOR_HEIGHT, PLACE_RANGE, slotPosition,
  rampPosition, BASE_SIDE, WALL_THICKNESS, WALL_HEIGHT, DOOR_WIDTH, RAMP_ANGLE, RAMP_LENGTH, STAIRWELL_WIDTH
} from '../shared/schemas'
import {
  rarity, rarityOf, mutationDe, itemColor, mutation, itemName, formatIncome, itemIncome
} from '../shared/loot-table'

const INCOME_UI = PRODUCTION_PER_RARITY


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
import { steal, monAdresseClient, alerter } from './theft'
import { pickUp } from './carry'
import { HUE } from './theme'
import { movePlayerTo } from '~system/RestrictedActions'

type Floor = { floorSlab: Entity; walls: Entity[]; ramp: Entity; landing: Entity; sentry: Entity }
type View = {
  plinth: Entity; label: Entity; gain: Entity; door: Entity
  floors: Floor[]; items: Entity[]; ascenseur: Entity; signature: string; ownerId: string
}

/** World-label colours, built here rather than read from the shared token object: that one
 * is constructed at module load and a system can run before its module was touched. */
const NOIR = Color3.create(0, 0, 0)
const VERT = Color4.fromHexString(HUE.money + 'ff')

const GRIS = '#9aa3b0ff'
const GRIS_CLAIR = '#b6bec9ff'
const FLOOR_COLOR = '#7f8794ff'

/**
 * The size every piece was built at, so showing and hiding never has to restate it.
 *
 * A floor used to be described twice: once here, with its real dimensions, and once again in
 * the update below, where the same numbers were typed out a second time to scale a piece back
 * up after it had been collapsed to zero. Two descriptions of one shape can disagree, and
 * they did: the update handled `walls[0]` through `walls[9]` while the builder appended three
 * more for the stairwell railings, so those three were never scaled at all and stayed hanging
 * in the air over floors nobody had bought.
 *
 * Recording the size at construction removes the second description. Anything built through
 * these helpers is hidden and shown correctly forever after, including pieces added later by
 * somebody who never reads this comment.
 */
const taille = new Map<Entity, Vector3>()

function bloc(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  taille.set(e, Vector3.create(sx, sy, sz))
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: Color4.fromHexString(color), roughness: 0.85 })
  return e
}

function vitre(x: number, y: number, z: number, sx: number, sy: number, sz: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  taille.set(e, Vector3.create(sx, sy, sz))
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
  taille.set(ramp, Vector3.create(STAIRWELL_WIDTH - 0.3, 0.18, RAMP_LENGTH))
  MeshRenderer.setBox(ramp)
  MeshCollider.setBox(ramp)
  Material.setPbrMaterial(ramp, { albedoColor: Color4.fromHexString('#c9a227ff'), roughness: 0.7, metallic: 0.3 })

  /*
    Railings, sized in metres and then divided by the ramp they hang from.

    A child's transform is multiplied by its parent's, and the ramp is a very flat, very long
    box, so a rail written directly in parent space needs numbers like 3.0 and 6.0 that mean
    nothing and quietly break the moment a floor gets taller. These are written as the metres
    they should measure, then converted once.
  */
  const rampeX = STAIRWELL_WIDTH - 0.3
  const RAIL_H = 1.1
  for (const cote of [-1, 1]) {
    const rail = engine.addEntity()
    Transform.create(rail, {
      parent: ramp,
      position: Vector3.create(cote * (rampeX / 2 - 0.03) / rampeX, (RAIL_H + 0.18) / 2 / 0.18, 0),
      scale: Vector3.create(0.06 / rampeX, RAIL_H / 0.18, 1.0)
    })
    MeshRenderer.setBox(rail)
    MeshCollider.setBox(rail)
    Material.setPbrMaterial(rail, { albedoColor: Color4.fromHexString('#7d8698ff'), roughness: 0.6, metallic: 0.4 })
  }

  /*
    Somewhere to put your foot at the top.

    The ramp climbs through the middle of the stairwell, at x = BASE_SIDE/2 - STAIRWELL/2,
    while the floor above stops at the edge of the same hole, a metre and a half short. So the
    last step of the climb arrived over open air: measured, not noticed by eye, because the
    two pieces are defined in different functions and neither knows the other exists. This is
    the landing that joins them, sitting at the upper floor's level just past the top of the
    slope.
  */
  const course = RAMP_LENGTH * Math.cos((RAMP_ANGLE * Math.PI) / 180)
  const landing = bloc(
    x + r.dx, y + FLOOR_HEIGHT + 0.12, z + r.dz + course / 2 + 1.2,
    STAIRWELL_WIDTH, 0.24, 2.4, FLOOR_COLOR
  )

  const RAIL_HEIGHT = 1.1
  const stairwellEdge = c / 2 - STAIRWELL_WIDTH
  walls.push(
    bloc(x + stairwellEdge, y + RAIL_HEIGHT / 2, z, 0.12, RAIL_HEIGHT, c, '#7d8698'),
    bloc(x + c / 2 - STAIRWELL_WIDTH / 2, y + RAIL_HEIGHT / 2, z - c / 2 + 0.06, STAIRWELL_WIDTH, RAIL_HEIGHT, 0.12, '#7d8698'),
    bloc(x + c / 2 - STAIRWELL_WIDTH / 2, y + RAIL_HEIGHT / 2, z + c / 2 - 0.06, STAIRWELL_WIDTH, RAIL_HEIGHT, 0.12, '#7d8698')
  )

  /*
    One turret per storey, born with the storey it defends.

    A defence that is a number tells a visitor nothing. A defence that stands on the third
    floor and not on the first tells them where to go, before anybody explains a rule, and
    that reading IS the counterplay: find the storey nobody guarded. It is created here rather
    than up front so an unbought floor still costs nothing.
  */
  const sentry = engine.addEntity()
  Transform.create(sentry, {
    position: Vector3.create(x + c / 2 - 1.1, y + 1.2, z - c / 2 + 1.1),
    scale: Vector3.create(0, 0, 0)
  })
  MeshRenderer.setCylinder(sentry, 0.25, 0.45)
  Material.setPbrMaterial(sentry, {
    albedoColor: Color4.fromHexString('#4dd2ffff'),
    emissiveColor: Color4.fromHexString('#4dd2ffff'),
    emissiveIntensity: 1.6, metallic: 0.8, roughness: 0.2
  })

  return { floorSlab, walls, ramp, landing, sentry }
}
const views = new Map<number, View>()   // clef = entite synchronisee du Plot

function createView(x: number, z: number): View {
  const plinth = bloc(x, 0.06, z, BASE_SIDE + 1.6, 0.12, BASE_SIDE + 1.6, '#6b6f78ff')

  /*
    Only the ground floor is built here; the rest appear when they are bought.

    Every base used to create all of its possible floors at once, hidden by a zero scale.
    That was affordable at three. At eight, with sixty bases on screen, it is several
    thousand entities standing in for buildings nobody has earned, paid for in scene budget
    and in network traffic the moment anyone walks in. Floors are added in the update below
    as the plot reports them, so an unreached floor costs exactly nothing.
  */
  const floors: Floor[] = [buildFloor(x, z, 0)]

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
  /*
    The plinth answers to nothing, so it offers nothing.

    It carried a pointer event reading "Leave a gift", from the days when giving meant
    clicking somebody's base with an item selected. That mechanic went when carrying arrived,
    the handler with it, and this was left behind: a hover text promising an action nobody can
    take. An affordance that lies is worse than none, because the player who tries it learns
    the interface is not to be trusted.
  */


  // A base reads like a belt crate: what it earns in green above who owns it in white,
  // both outlined so they hold over sky, grass or a wall. One TextShape carries one colour,
  // which is why this is two entities and not two lines of one.
  const gain = engine.addEntity()
  Transform.create(gain, { position: Vector3.create(x, MAX_FLOORS * FLOOR_HEIGHT + 1.62, z), scale: Vector3.create(0.6, 0.6, 0.6) })
  Billboard.create(gain, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(gain, {
    text: '', fontSize: 4.4, textColor: VERT, outlineWidth: 0.22, outlineColor: NOIR
  })

  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(x, MAX_FLOORS * FLOOR_HEIGHT + 1.0, z), scale: Vector3.create(0.6, 0.6, 0.6) })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
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
  return { plinth, label, gain, door, ascenseur, floors, items, signature: '', ownerId: '' }
}

function destroyView(v: View): void {
  engine.removeEntity(v.plinth)
  engine.removeEntity(v.label)
  engine.removeEntity(v.gain)
  engine.removeEntity(v.door)
  engine.removeEntity(v.ascenseur)
  for (const e of v.floors) {
    /*
      The ramp goes with its children, because `removeEntity` does not take them.

      Its two handrails are parented to it and stored nowhere, so nothing could reach them
      afterwards: every base that scrolled out of the field left two colliders behind,
      hanging off a parent that no longer existed. `removeEntityWithChildren` is the function
      that exists for exactly this, and combat.ts already uses it for the weapon.
    */
    taille.delete(e.ramp)
    engine.removeEntityWithChildren(e.ramp)
    for (const ent of [e.floorSlab, e.landing, e.sentry, ...e.walls]) {
      taille.delete(ent)
      engine.removeEntity(ent)
    }
  }
  for (const o of v.items) engine.removeEntity(o)
}

/**
 * Which base the player is standing in, if any, for the client to offer the right verb.
 *
 * The server checks this again before it moves anything; this is only so the button can read
 * PLACE rather than the player pressing it and being told no.
 */
export function baseIci(): { ownerId: string; mienne: boolean } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  const moi = monAdresseClient()
  /*
    The NEAREST base, not the first one the iterator happens to yield.

    Buildings are kept `MIN_BASE_GAP` apart, which is `BASE_SIDE + 4`, and `PLACE_RANGE` is
    `BASE_SIDE / 2 + 2`: twice the reach is exactly the minimum gap. So two neighbours at the
    minimum distance have ranges that meet, and a player standing on the seam was inside both.
    Returning the first match made the verb offered there depend on entity creation order,
    which is to say on nothing the player can see. Whichever one they are actually closer to
    is the only defensible answer.
  */
  let proche: { ownerId: string; mienne: boolean } | null = null
  let distance = PLACE_RANGE
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    const bt = Transform.getOrNull(e)
    if (bt === null) continue
    const dx = t.position.x - bt.position.x, dz = t.position.z - bt.position.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d > distance) continue
    distance = d
    proche = { ownerId: p.ownerId, mienne: p.ownerId.toLowerCase() === moi }
  }
  return proche
}

/**
 * Which storey of MY base I am standing on, and what already defends it.
 *
 * Arming happens where you stand, the same rule as putting an item on a shelf. The shop needs
 * to say which floor that is before the button is pressed, because a purchase whose effect
 * depends on your feet has to name what your feet chose.
 */
export function maDefense(): { etage: number; charges: number } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  const moi = monAdresseClient()
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const bt = Transform.getOrNull(e)
    if (bt === null) return null
    const dx = t.position.x - bt.position.x, dz = t.position.z - bt.position.z
    if (Math.sqrt(dx * dx + dz * dz) > PLACE_RANGE) return null
    const etage = Math.max(0, Math.round(t.position.y / FLOOR_HEIGHT))
    if (etage >= p.floors) return null
    return { etage, charges: p.sentryFloors[etage] ?? 0 }
  }
  return null
}

/**
 * Which pedestal an item would land on, if it were put down right now.
 *
 * The storey comes from where the player is standing, because that is the part that decides
 * anything: `aPortee` gates theft on `|dy| <= SAME_STOREY`, so only the same floor is
 * reachable. Within a floor the six pedestals span 7.2 m against a 10 m reach, so which one
 * you pick changes nothing a thief cares about. It is offered anyway, because arranging your
 * own building is worth doing for its own sake and because the marker makes the choice legible
 * before it is made rather than after.
 *
 * Candidates are the indices of that floor, cut to the length of the shelf: an index beyond
 * the end would be a hole, and the shelf is a dense queue. A floor above what the shelf
 * reaches falls back to the top of it.
 */
export function cibleDePose(): { ownerId: string; index: number; pos: Vector3 } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  let base: { p: ReturnType<typeof Plot.get>; x: number; z: number } | null = null
  let distance = PLACE_RANGE
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    const bt = Transform.getOrNull(e)
    if (bt === null) continue
    const dx = t.position.x - bt.position.x, dz = t.position.z - bt.position.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d > distance) continue
    distance = d
    base = { p, x: bt.position.x, z: bt.position.z }
  }
  if (base === null) return null

  const fin = base.p.items.length
  const etage = Math.max(0, Math.round(t.position.y / FLOOR_HEIGHT))
  const bas = etage * SLOTS_PER_FLOOR
  if (bas > fin) {
    const s = slotPosition(fin)
    return { ownerId: base.p.ownerId, index: fin, pos: Vector3.create(base.x + s.dx, s.dy, base.z + s.dz) }
  }
  let choisi = bas
  let meilleur = Infinity
  for (let k = bas; k <= Math.min(bas + SLOTS_PER_FLOOR - 1, fin); k++) {
    const s = slotPosition(k)
    const dx = t.position.x - (base.x + s.dx), dz = t.position.z - (base.z + s.dz)
    const d = dx * dx + dz * dz
    if (d >= meilleur) continue
    meilleur = d
    choisi = k
  }
  const s = slotPosition(choisi)
  return { ownerId: base.p.ownerId, index: choisi, pos: Vector3.create(base.x + s.dx, s.dy, base.z + s.dz) }
}

export function setupPlots(): void {
  engine.addSystem(() => {
    for (const v of views.values()) {
      for (let k = 0; k < v.items.length; k++) {
        if (
          inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.items[k])
        ) {
          /*
            One click, one meaning: take it.

            Clicking your own shelf used to arm a two-step swap, where the first click chose a
            slot, the second chose another, and a caption explained the pairing. That is a menu
            wearing the clothes of a world object. Now it simply lifts the thing, and where you
            walk with it is the rest of the sentence.
          */
          if (v.ownerId.toLowerCase() === monAdresseClient()) pickUp(k)
          else steal(v.ownerId, k)
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

      /*
        The signature is computed here rather than further down, because it guards twice.

        It already gated the item shelves. Everything between here and the door was running
        unconditionally, once per base per frame: a full material on the plinth, a Transform
        rewritten for the slab, the ten walls, the ramp and the landing of every storey. At
        sixty bases of three storeys that is on the order of two and a half thousand component
        writes a frame, and a write is not free even when the value is identical: the engine
        marks the entity dirty, serialises the component to bytes and compares it against the
        last snapshot before deciding to send nothing. The comparison is what costs, and it
        was being paid sixty times a second for buildings that had not changed since they were
        built. Every input those blocks read is already in this string.

        What stays per-frame is what genuinely ticks: the LOCKED countdown on the nameplate and
        the shield, which is why neither of them is behind this flag.
      */
      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.floors}|${p.items.join(',')}|${p.given}|${p.received}|${p.sentryFloors.join(',')}`
      const structurel = sig !== v.signature
      const txt = TextShape.getMutableOrNull(v.label)
      if (txt !== null) {
        const lock = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
        const state = lock > 0 ? `\nLOCKED ${lock}s` : (p.ownerPresent ? '' : '\n(away)')
        const ledger = (p.given > 0 || p.received > 0)
          ? `\n${p.received} received  ·  ${p.given} given`
          : ''
        const ta = structurel ? Transform.getMutableOrNull(v.ascenseur) : null
        if (ta !== null) {
          const h = p.floors * FLOOR_HEIGHT
          ta.scale = Vector3.create(0.5, h, 0.5)
          ta.position = Vector3.create(
            t.position.x + BASE_SIDE / 2 - STAIRWELL_WIDTH / 2, h / 2, t.position.z + 1.4
          )
        }
        const guard = p.sentries > 0 ? `\nSENTRY x${p.sentries}` : ''
        if (structurel) {
          // One marker per storey, sized by what that storey holds. An empty floor shows
          // nothing at all, which is exactly the information a thief is looking for.
          for (let e = 0; e < v.floors.length; e++) {
            const ts = Transform.getMutableOrNull(v.floors[e].sentry)
            if (ts === null) continue
            const n = p.sentryFloors[e] ?? 0
            const k = n === 0 ? 0 : 0.6 + n * 0.18
            ts.scale = Vector3.create(k, k, k)
          }
        }
        /*
          The rank goes on the nameplate, because that is the only place it does its job.

          `rebirths` is stored, persisted, and synced to every client in the Plot component,
          and it was drawn nowhere. The one thing this mechanic is for, according to the
          practitioner of the same format we studied, is being seen by the other players on
          your server: his own words for why he built it were to be able to flex on them.
          Meanwhile the multiplier it buys, which is private information for the owner, was
          the part we were printing, on the owner's own coin counter. Exactly the wrong way
          round on both counts. It joins the name line rather than taking one of its own,
          since a plate read from a few metres away can carry a rank but not a fourth row.
        */
        const rang = p.rebirths > 0 ? `  ·  PRESTIGE ${p.rebirths}` : ''
        txt.text = `${p.ownerName}${rang}${state}${guard}${ledger}`
        txt.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')

        // What the base earns, read off its own items, so a passer-by can price a target
        // without opening anything.
        const tg = structurel ? TextShape.getMutableOrNull(v.gain) : null
        if (tg !== null) {
          let perSecond = 0
          for (const code of p.items) perSecond += itemIncome(code, PRODUCTION_PER_RARITY)
          tg.text = perSecond > 0 ? `+${formatIncome(perSecond)}/s` : ''
        }
      }
      if (structurel) {
        Material.setPbrMaterial(v.plinth, {
          albedoColor: Color4.fromHexString(p.ownerPresent ? '#4a5568ff' : '#40454fff')
        })
      }

      // Catch up to what this base has actually opened, one floor at a time.
      if (structurel) {
        while (v.floors.length < Math.min(p.floors, MAX_FLOORS)) {
          v.floors.push(buildFloor(t.position.x, t.position.z, v.floors.length))
        }

        for (let e = 0; e < v.floors.length; e++) {
          const open = e < p.floors
          const et = v.floors[e]
          const montrer = (ent: Entity, visible: boolean) => {
            const tr = Transform.getMutableOrNull(ent)
            const t = taille.get(ent)
            if (tr === null || t === undefined) return
            tr.scale = visible ? t : Vector3.create(0, 0, 0)
          }
          montrer(et.floorSlab, open)
          for (const m of et.walls) montrer(m, open)
          // No ramp off the top floor: it would climb to nothing, and neither would its landing.
          const monte = open && e + 1 < p.floors
          montrer(et.ramp, monte)
          montrer(et.landing, monte)
        }
      }

      const ptr = Transform.getMutableOrNull(v.door)
      if (ptr !== null) {
        const locked = p.lockedUntil > Date.now()
        const h = p.floors * FLOOR_HEIGHT + 0.6
        ptr.position = Vector3.create(t.position.x, h / 2, t.position.z)
        ptr.scale = locked
          ? Vector3.create(BASE_SIDE + 1.2, h, BASE_SIDE + 1.2)
          : Vector3.create(0, 0, 0)

        /*
          The shield keeps thieves out. It must not keep the owner out.

          Every player is shielded for thirty seconds the moment they arrive, which is a
          kindness: nobody wants to be robbed while the scene is still loading around them.
          But the shield is a solid box, and it was solid for everyone, so the first thing a
          returning player met was a wall around their own base with no way through and no
          explanation. The protection is against other people by definition, so the collider
          only exists on somebody else's shield. Ours is drawn and walked through.
        */
        const solide = locked && !monBase
        if (solide && !MeshCollider.has(v.door)) MeshCollider.setBox(v.door)
        else if (!solide && MeshCollider.has(v.door)) MeshCollider.deleteFrom(v.door)
      }

      // The signature only carries STRUCTURAL state. A value that ticks every second
      // (a countdown, a gauge) belongs on its own element: inside a cache key it forces
      // a full rebuild each second, which restarts item rotation tweens from identity.
      if (!structurel) continue
      v.signature = sig
      v.ownerId = p.ownerId

      const mine = monBase
      const verbe = mine
        ? 'Pick up'
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
          const selected = false
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
