import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  GEARS, Trap, TRAP_LIFETIME_MS, TRAP_TRIGGER_RANGE, TRAP_FREEZE_MS, SENTRY_MIN_PRICE,
  Cloaked, CLOAK_MS, CLOAK_COOLDOWN_MS, Bomb, BOMB_FUSE_MS, BOMB_RADIUS
} from '../shared/schemas'
import { room } from '../shared/messages'
import { log } from './log'
import {
  displayName, presents, positionOf, spend, revenuParObjet, prestigeOf,
  gearsOf, addGear, removeGear, storeAlert, baseDe
} from './plots'
import { portePour, frapperPorteur } from './carry'

/**
 * Gear, server side: bought into a pocket, put down where you stand, and it acts on its own.
 *
 * Three rules from the genre, each enforced here rather than trusted to the client. A gear is
 * gated by prestige, so the door prestige opens is a real door. It cannot be used while
 * carrying loot, so nothing a thief buys makes the walk home safe. And a placed thing has a
 * count and a lifetime, so the floor never fills with old plates.
 */

function prixGear(address: string, gear: number): number {
  const g = GEARS[gear]
  return Math.max(SENTRY_MIN_PRICE, Math.floor(revenuParObjet(address) * g.itemSeconds))
}

function piegesPoses(address: string, gear: number): number {
  let n = 0
  if (gear === 0) for (const [, t] of engine.getEntitiesWith(Trap)) if (t.owner === address) n += 1
  if (gear === 4) for (const [, b] of engine.getEntitiesWith(Bomb)) if (b.owner === address) n += 1
  return n
}

const capes = new Map<string, ReturnType<typeof engine.addEntity>>()
const dernierCloak = new Map<string, number>()

/** Called by carry when a hand closes on something: the cloak ends there, not on its timer. */
export function rompreCape(address: string): void {
  const e = capes.get(address)
  if (e === undefined) return
  capes.delete(address)
  engine.removeEntity(e)
  log(`${displayName(address)}'s cloak broke on touching loot`)
}

export function startGear(): void {
  // Plates left by a previous server would never expire: nothing ticks their timer.
  let vieux = 0
  for (const [e] of engine.getEntitiesWith(Trap)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e); vieux += 1
  }
  for (const [e] of engine.getEntitiesWith(Bomb)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e); vieux += 1
  }
  for (const [e] of engine.getEntitiesWith(Cloaked)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e); vieux += 1
  }
  if (vieux > 0) log(`swept ${vieux} trap(s) left by a previous server`)

  room.onMessage('buyGear', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const gear = Number.isInteger(d?.gear) ? d.gear : -1
    const g = GEARS[gear]
    if (g === undefined) return
    if (prestigeOf(a) < g.prestige) {
      void room.send('actionRejected', { action: 'gear', reason: `${g.name} unlocks at prestige ${g.prestige}`, antiCheat: false }, { to: [a] })
      return
    }
    // The cap counts pocket AND floor together, as the reference does: five, wherever they are.
    if (gearsOf(a)[gear] + piegesPoses(a, gear) >= g.max) {
      void room.send('actionRejected', { action: 'gear', reason: `you already have ${g.max} ${g.name.toLowerCase()}s out or in your pocket`, antiCheat: false }, { to: [a] })
      return
    }
    const cost = prixGear(a, gear)
    if (!spend(a, cost)) {
      void room.send('actionRejected', { action: 'gear', reason: `you need ${cost} coins`, antiCheat: false }, { to: [a] })
      return
    }
    addGear(a, gear)
    void room.send('gearBought', { gear, held: gearsOf(a)[gear], cost }, { to: [a] })
    log(`${displayName(a)} bought a ${g.name} for ${cost}`)
  })

  room.onMessage('placeGear', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const gear = Number.isInteger(d?.gear) ? d.gear : -1
    const g = GEARS[gear]
    if (g === undefined || g.kind !== 'place') return
    if (portePour(a)) {
      void room.send('actionRejected', { action: 'gear', reason: 'not while carrying something', antiCheat: false }, { to: [a] })
      return
    }
    if (gearsOf(a)[gear] <= 0) {
      void room.send('actionRejected', { action: 'gear', reason: `no ${g.name.toLowerCase()} in your pocket`, antiCheat: false }, { to: [a] })
      return
    }
    const p = positionOf(a)
    if (p === null) return
    removeGear(a, gear)
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(p.x, p.y, p.z) })
    if (gear === 4) {
      Bomb.create(e, { owner: a, atMs: Date.now() + BOMB_FUSE_MS })
      syncEntity(e, [Bomb.componentId, Transform.componentId])
    } else {
      Trap.create(e, { owner: a, untilMs: Date.now() + TRAP_LIFETIME_MS })
      syncEntity(e, [Trap.componentId, Transform.componentId])
    }
    void room.send('gearPlaced', { gear, held: gearsOf(a)[gear] }, { to: [a] })
    log(`${displayName(a)} set a ${g.name} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`)
  })

  room.onMessage('cloak', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (gearsOf(a)[3] <= 0) return
    if (portePour(a)) {
      void room.send('actionRejected', { action: 'gear', reason: 'not while carrying something', antiCheat: false }, { to: [a] })
      return
    }
    const now = Date.now()
    const reste = (dernierCloak.get(a) ?? 0) + CLOAK_COOLDOWN_MS - now
    if (reste > 0) {
      void room.send('actionRejected', { action: 'gear', reason: `cloak recharging, ${Math.ceil(reste / 1000)}s`, antiCheat: false }, { to: [a] })
      return
    }
    if (capes.has(a)) return
    dernierCloak.set(a, now)
    const e = engine.addEntity()
    Cloaked.create(e, { who: a, untilMs: now + CLOAK_MS })
    syncEntity(e, [Cloaked.componentId])
    capes.set(a, e)
    log(`${displayName(a)} pulled the cloak on`)
  })

  /*
    The plate fires on its own, on the server, on whoever steps on it first.

    Not on its owner, and not on somebody already holding loot in their hands: the genre
    rule is that gear never touches the carry, and a trap that caught a thief AFTER the
    theft would just be a slower gun. It catches them on the way in.
  */
  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 0.25) return
    acc = 0
    const now = Date.now()
    const ici = presents()

    // Cloaks end on their timer, or when their wearer leaves.
    for (const [a, e] of [...capes]) {
      const c = Cloaked.getOrNull(e)
      if (c === null || c.untilMs < now || !ici.has(a)) { capes.delete(a); engine.removeEntity(e) }
    }

    /*
      A bomb that has burned its fuse hits everyone within reach who is holding something, and
      the owner too if they stayed: a weapon with no friendly fire is a weapon with no decision
      in where you stand. Full grip force, so anything held is dropped where they stand.
    */
    for (const [e, b] of engine.getEntitiesWith(Bomb)) {
      if (b.atMs > now) continue
      const tr = Transform.getOrNull(e)
      engine.removeEntity(e)
      if (tr === null) continue
      const proprio = baseDe(b.owner)?.name ?? displayName(b.owner)
      for (const addr of ici) {
        const p = positionOf(addr)
        if (p === null) continue
        const d = Math.sqrt((p.x - tr.position.x) ** 2 + (p.z - tr.position.z) ** 2)
        if (d > BOMB_RADIUS || Math.abs(p.y - tr.position.y) > 2.5) continue
        const lache = frapperPorteur(addr, 5) === 'lache'
        void room.send('bombed', { ownerName: proprio, dropped: lache }, { to: [addr] })
      }
      log(`${proprio}'s bomb went off`)
    }

    for (const [e, t] of engine.getEntitiesWith(Trap)) {
      if (t.untilMs < now) { engine.removeEntity(e); continue }
      const tr = Transform.getOrNull(e)
      if (tr === null) continue
      for (const addr of ici) {
        if (addr === t.owner) continue
        if (portePour(addr)) continue
        const p = positionOf(addr)
        if (p === null) continue
        const d = Math.sqrt((p.x - tr.position.x) ** 2 + (p.z - tr.position.z) ** 2)
        if (d > TRAP_TRIGGER_RANGE || Math.abs(p.y - tr.position.y) > 2) continue
        const gel = TRAP_FREEZE_MS
        engine.removeEntity(e)
        const proprio = baseDe(t.owner)?.name ?? displayName(t.owner)
        void room.send('trapped', { ownerName: proprio, gelMs: gel }, { to: [addr] })
        const info = { type: 'trap', byName: displayName(addr) }
        if (ici.has(t.owner)) void room.send('trapSprung', { byName: displayName(addr) }, { to: [t.owner] })
        else storeAlert(t.owner, info)
        log(`${displayName(addr)} stepped on ${proprio}'s trap`)
        break
      }
    }
  })

  log('gear ready')
}
