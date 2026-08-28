import { TOY, plasticDe } from './toy'
import { engine, Transform, MeshRenderer, Material, Entity, AvatarModifierArea, AvatarModifierType, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Trap, GEARS, Cloaked, Bomb } from '../shared/schemas'
import { room } from '../shared/messages'
import { formatIncome } from '../shared/loot-table'
import { monAdresseClient, alerter, pushToFeed } from './theft'
import { applyFreeze, setCoil } from './locomotion'
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
  /** Which placeable gear is being set right now, or -1: the marker is up while it is not -1. */
  placing: -1,
  /** True while my own cloak is on, so the HUD can say so. */
  cloaked: false,
  /** The weapon the player chose to wield: 'shoot' (gun), 'slap' or 'taser'. Gun is always owned. */
  armeChoisie: 'shoot' as 'shoot' | 'slap' | 'taser'
}

/** Wield a weapon from the gear menu, or the gun. No HUD button: the held model is the feedback. */
export function wield(type: 'shoot' | 'slap' | 'taser'): void { gearView.armeChoisie = type }

const PLAQUE = Color4.fromHexString(TOY.trapPlate + 'd9')
const MIENNE = Color4.create(0.35, 0.95, 0.45, 0.85)
const vues = new Map<number, Entity>()

let marqueur: Entity

export function peutPoser(gear: number): boolean {
  return estPosable(gear) && gearView.held[gear] > 0 && carryView.code < 0
}
/** Only placeable gear goes to the floor; worn gear is used by being held. */
export function estPosable(gear: number): boolean { return GEARS[gear]?.kind === 'place' }

export function basculerPose(gear = 0): void {
  gearView.placing = gearView.placing === gear ? -1 : gear
}

export function poserPiege(): void {
  const gear = gearView.placing
  gearView.placing = -1
  if (gear < 0) return
  void room.send('placeGear', { gear })
}

export function acheterGear(gear: number): void {
  void room.send('buyGear', { gear })
}
export function acheterLuck(): void {
  void room.send('buyLuck', {})
}

/** F, when nothing is drawn and a cloak is in the pocket. The server decides if it takes. */
export function tirerLaCape(): boolean {
  if (gearView.held[3] <= 0 || carryView.code >= 0) return false
  void room.send('cloak', {})
  return true
}

/*
  Invisibility, built from the one primitive the platform offers for it.

  `AvatarModifierArea` hides every avatar inside its volume except the ids it is told to
  exclude. So a small volume that follows the cloaked player, excluding EVERYONE ELSE present,
  hides exactly one person: them. Verified in the component's own definition, "user IDs that
  can enter and remain unaffected". One area per cloak, rebuilt each frame from who is here,
  because the exclusion list is what makes the trick work and the room changes.
*/
const capes = new Map<number, Entity>()
/** Cloaks this client has already announced seeing through, so the line is said once per cloak. */
const vusParRayons = new Set<number>()

export function setupGear(): void {
  marqueur = engine.addEntity()
  Transform.create(marqueur, { position: Vector3.create(0, -50, 0), scale: Vector3.Zero() })
  MeshRenderer.setCylinder(marqueur, 0.5, 0.5)
  Material.setPbrMaterial(marqueur, plasticDe(Color4.create(0.35, 0.95, 0.45, 0.42), 0.7))

  room.onMessage('gearHeld', (d) => {
    for (let i = 0; i < GEARS.length; i++) gearView.held[i] = d.counts[i] ?? 0
    // Worn gear is passive: holding it is using it.
    setCoil(gearView.held[1] > 0)
  })
  room.onMessage('gearBought', (d) => {
    alerter(`${GEARS[d.gear].name} IN YOUR POCKET  ·  you hold ${d.held}  ·  -${formatIncome(d.cost)}`, '#4dd2ff', 4000)
  })
  room.onMessage('gearPlaced', (d) => {
    alerter(`${GEARS[d.gear].name} SET  ·  ${d.held} left in your pocket`, '#4dd2ff', 3000)
  })
  room.onMessage('trapped', (d) => {
    applyFreeze(d.gelMs)
    alerter(d.mine
      ? `${d.ownerName.toUpperCase()}'S MINE  ·  frozen ${Math.round(d.gelMs / 1000)}s, hands emptied`
      : `${d.ownerName.toUpperCase()}'S TRAP  ·  frozen ${Math.round(d.gelMs / 1000)}s`, '#ff6b6b', 5000)
  })
  room.onMessage('tased', (d) => {
    applyFreeze(d.gelMs)
    alerter(`${d.byName.toUpperCase()}'S TASER  ·  frozen ${Math.round(d.gelMs / 1000)}s, hands emptied`, '#ff6b6b', 4000)
  })
  room.onMessage('luckBought', (d) => {
    alerter(`LUCKY CHARM  ·  x2 on every mutation for ${Math.ceil(d.sec / 60)} min  ·  -${formatIncome(d.cost)}`, '#4dd2ff', 4000)
  })
  room.onMessage('bombed', (d) => {
    alerter(d.dropped
      ? `${d.ownerName.toUpperCase()}'S BOMB  ·  you dropped what you carried`
      : `${d.ownerName.toUpperCase()}'S BOMB went off next to you`, '#ff6b6b', 4000)
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
      const mienne = t.owner.toLowerCase() === moi
      // A mine is drawn for the one player who set it. To everyone else it is floor.
      if (t.mine && !mienne) continue
      vivants.add(id)
      if (vues.has(id)) continue
      const tr = Transform.getOrNull(e)
      if (tr === null) continue
      const plaque = engine.addEntity()
      Transform.create(plaque, {
        position: Vector3.create(tr.position.x, tr.position.y + 0.04, tr.position.z),
        scale: t.mine ? Vector3.create(0.6, 0.05, 0.6) : Vector3.create(1, 0.08, 1)
      })
      MeshRenderer.setCylinder(plaque, 0.55, 0.55)
      const teinte = mienne ? MIENNE : PLAQUE
      Material.setPbrMaterial(plaque, plasticDe(teinte, 0.4))
      vues.set(id, plaque)
    }
    // Bombs: a dark plate with a short life, everyone sees it coming for three seconds.
    for (const [e, b] of engine.getEntitiesWith(Bomb)) {
      const id = e as unknown as number
      vivants.add(id)
      if (vues.has(id)) continue
      const tr = Transform.getOrNull(e)
      if (tr === null) continue
      const plaque = engine.addEntity()
      Transform.create(plaque, { position: Vector3.create(tr.position.x, tr.position.y + 0.15, tr.position.z), scale: Vector3.create(0.5, 0.5, 0.5) })
      MeshRenderer.setSphere(plaque)
      const teinte = b.owner.toLowerCase() === moi ? MIENNE : Color4.fromHexString(TOY.bomb + 'ff')
      Material.setPbrMaterial(plaque, plasticDe(teinte, 1.2))
      vues.set(id, plaque)
    }
    for (const [id, p] of [...vues]) {
      if (vivants.has(id)) continue
      engine.removeEntity(p)
      vues.delete(id)
    }

    // Cloaks: one hiding volume per cloaked player, excluding everyone but them.
    const presentsIci: string[] = []
    for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
      const a = id.address?.toLowerCase()
      if (a) presentsIci.push(a)
    }
    const capesVivantes = new Set<number>()
    gearView.cloaked = false
    // X-ray glasses: somebody else's cloak hides nothing from THIS client. The volume that
    // would hide them is simply never built here, and one already built comes down.
    const rayonsX = gearView.held[6] > 0
    for (const [e, c] of engine.getEntitiesWith(Cloaked)) {
      const id = e as unknown as number
      const qui = c.who.toLowerCase()
      if (qui === moi) gearView.cloaked = true
      if (rayonsX && qui !== moi) {
        if (!vusParRayons.has(id)) {
          vusParRayons.add(id)
          alerter('X-RAY GLASSES  ·  a cloak is out, and you can see who is under it', '#4dd2ff', 3500)
        }
        continue
      }
      capesVivantes.add(id)
      let zone = capes.get(id)
      if (zone === undefined) {
        zone = engine.addEntity()
        Transform.create(zone, { position: Vector3.create(0, -50, 0), scale: Vector3.create(2, 3, 2) })
        AvatarModifierArea.create(zone, { area: Vector3.create(2, 3, 2), modifiers: [AvatarModifierType.AMT_HIDE_AVATARS], excludeIds: [] })
        capes.set(id, zone)
      }
      // Follow the wearer. Their entity is found by address among the identities present.
      for (const [ent, pid] of engine.getEntitiesWith(PlayerIdentityData)) {
        if (pid.address?.toLowerCase() !== qui) continue
        const pt = Transform.getOrNull(ent)
        const zt = Transform.getMutableOrNull(zone)
        if (pt !== null && zt !== null) zt.position = Vector3.create(pt.position.x, pt.position.y + 1, pt.position.z)
        break
      }
      // Rewritten only when the room changed: a mutable write is a serialise-and-compare
      // every frame otherwise, for a list that is identical almost every frame.
      const voulu = presentsIci.filter((a) => a !== qui)
      const actuel = AvatarModifierArea.getOrNull(zone)?.excludeIds ?? []
      if (actuel.length !== voulu.length || actuel.some((a, i) => a !== voulu[i])) {
        const am = AvatarModifierArea.getMutableOrNull(zone)
        if (am !== null) am.excludeIds = voulu
      }
    }
    for (const [id, z] of [...capes]) {
      if (capesVivantes.has(id)) continue
      engine.removeEntity(z)
      capes.delete(id)
    }

    // The marker sits at the player's feet while they are choosing, and nowhere otherwise.
    const m = Transform.getMutableOrNull(marqueur)
    if (m === null) return
    if (gearView.placing < 0 || !peutPoser(gearView.placing)) {
      gearView.placing = -1
      if (m.scale.x !== 0) m.scale = Vector3.Zero()
      return
    }
    const me = Transform.getOrNull(engine.PlayerEntity)
    if (me === null) return
    m.position = Vector3.create(me.position.x, me.position.y + 0.05, me.position.z)
    m.scale = Vector3.create(1, 0.06, 1)
  })
}
