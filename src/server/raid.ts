import { engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  Raid, Event, RAID_ENABLED, RAID_EVERY_MS, RAID_FIRST_MS, RAID_MS, RAID_POS, RAID_RADIUS, RAID_ORBIT,
  RAID_ORBIT_MS, RAID_HP_BASE, RAID_HP_PER_PLAYER, RAID_SWIPE_MS, RAID_SWIPE_RANGE, RAID_SWIPE_SHARE,
  RAID_SWIPE_CAP_S, RAID_REWARD_CRATE, forceDuTir
} from '../shared/schemas'
import { room } from '../shared/messages'
import { encoder } from '../shared/loot-table'
import { presents, positionOf, displayName, spend, coinsOf, incomePerSecond, addCrate, cratesOf } from './plots'
import { frapperPorteur } from './carry'
import { dropAt } from './coins'
import { noter } from './records'
import { log } from './log'

/**
 * The raid: a boss on the plaza, every so often, for three minutes.
 *
 * The one shared fight the game has. Everyone in the room is invited to the same spot by the
 * same countdown; every weapon already in the game hurts it (the server resolves a shot
 * against the boss before it looks for a player); it swipes at whoever stands close, and a
 * swipe does what a bomb does, opens the hands, plus shakes a share of the purse onto the
 * floor where anybody can pick it up. Whoever dealt the most damage when it falls takes a
 * Legendary crate and a line on the board. In the reference the closest thing is the "Tung
 * Tung Attack" event, a hostile boss whose brood attacks players; the reward for the kill is
 * ours. Behind `RAID_ENABLED`, added last on the tester's call (28 Aug), time-boxed.
 */

type Entity = ReturnType<typeof engine.addEntity>
let boss: Entity | null = null
let degats = new Map<string, number>()
let prochain = 0
let debut = 0
let dernierBalai = 0

function meneur(): { address: string; name: string } | null {
  let top: string | null = null
  let best = 0
  for (const [k, v] of degats) if (v > best) { best = v; top = k }
  return top === null ? null : { address: top, name: displayName(top) }
}

/**
 * A shot or a blow from `from` toward `vise` hits the boss when the boss's disc lies on that
 * line, in the ground plane. Damage is the shot's own force at that range, so a point-blank
 * shot or a slap is a full point and a shot from across the plaza is a fraction, the same
 * rule the players' pockets already obey. Returns true when the boss took the hit.
 */
export function raidHit(a: string, from: Vector3, vise: { x: number; z: number }): boolean {
  if (boss === null) return false
  const r = Raid.getOrNull(boss)
  if (r === null || !r.active) return false
  const ax = from.x, az = from.z
  const dx = vise.x - ax, dz = vise.z - az
  const l2 = dx * dx + dz * dz
  let t = l2 === 0 ? 0 : ((r.x - ax) * dx + (r.z - az) * dz) / l2
  t = Math.max(0, Math.min(1, t))
  const px = ax + t * dx, pz = az + t * dz
  if (Math.hypot(r.x - px, r.z - pz) > RAID_RADIUS) return false
  const degat = Math.max(0.2, forceDuTir(Math.hypot(r.x - ax, r.z - az)))
  const m = Raid.getMutableOrNull(boss)
  if (m === null) return false
  m.hp = Math.max(0, m.hp - degat)
  m.lastHitName = displayName(a)
  m.hitAtMs = Date.now()
  degats.set(a, (degats.get(a) ?? 0) + degat)
  m.topName = meneur()?.name ?? ''
  if (m.hp <= 0) finir(true)
  return true
}

function ouvrir(now: number): void {
  if (boss === null) return
  const m = Raid.getMutableOrNull(boss)
  if (m === null) return
  const ici = presents().size
  degats = new Map()
  debut = now
  dernierBalai = now
  m.active = true
  m.hpMax = RAID_HP_BASE + RAID_HP_PER_PLAYER * Math.max(1, ici)
  m.hp = m.hpMax
  m.untilMs = now + RAID_MS
  m.x = RAID_POS.x + RAID_ORBIT
  m.z = RAID_POS.z
  m.topName = ''
  m.lastHitName = ''
  m.hitAtMs = 0
  m.swipeAtMs = 0
  log(`raid: the boss is up, ${m.hpMax} hp for ${ici} present`)
}

function finir(vaincu: boolean): void {
  if (boss === null) return
  const m = Raid.getMutableOrNull(boss)
  if (m === null || !m.active) return
  const now = Date.now()
  m.active = false
  m.hp = 0
  prochain = now + RAID_EVERY_MS
  m.nextMs = prochain
  if (vaincu) {
    const top = meneur()
    if (top !== null) {
      addCrate(top.address, RAID_REWARD_CRATE)
      void room.send('inventory', { crates: cratesOf(top.address) }, { to: [top.address] })
      void room.send('raidWon', { crate: RAID_REWARD_CRATE }, { to: [top.address] })
      noter('raid', top.name, '', encoder(4, 0))
      void room.send('raidOver', { winner: top.name, slain: true })
      log(`raid: slain, ${top.name} dealt the most and takes the crate`)
      return
    }
  }
  void room.send('raidOver', { winner: '', slain: false })
  log('raid: the boss left')
}

export function startRaid(): void {
  for (const [e] of engine.getEntitiesWith(Raid)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e)
  }
  boss = engine.addEntity()
  prochain = Date.now() + RAID_FIRST_MS
  Raid.create(boss, {
    active: false, hp: 0, hpMax: 0, untilMs: 0, nextMs: prochain,
    x: RAID_POS.x, z: RAID_POS.z, topName: '', lastHitName: '', hitAtMs: 0, swipeAtMs: 0
  })
  syncEntity(boss, [Raid.componentId])
  if (!RAID_ENABLED) { log('raid: disabled'); return }

  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 0.5) return
    acc = 0
    if (boss === null) return
    const now = Date.now()
    const lu = Raid.getOrNull(boss)
    if (lu === null) return

    if (!lu.active) {
      if (now < prochain) return
      if (presents().size === 0) { prochain = now + 30_000; return }
      // Not on top of a rush, and not on the doorstep of the grand one: two countdowns on one
      // screen is one too many.
      for (const [, ev] of engine.getEntitiesWith(Event)) {
        if (ev.theme >= 0 || ev.nextGrandMs - now < RAID_MS + 60_000) { prochain = now + 60_000; return }
      }
      ouvrir(now)
      return
    }

    if (now >= lu.untilMs) { finir(false); return }

    // It walks a slow circle, so standing still is not a strategy and neither is running.
    const m = Raid.getMutableOrNull(boss)
    if (m === null) return
    const theta = ((now - debut) / RAID_ORBIT_MS) * Math.PI * 2
    m.x = RAID_POS.x + Math.cos(theta) * RAID_ORBIT
    m.z = RAID_POS.z + Math.sin(theta) * RAID_ORBIT

    if (now - dernierBalai < RAID_SWIPE_MS) return
    dernierBalai = now
    m.swipeAtMs = now
    for (const addr of presents()) {
      const p = positionOf(addr)
      if (p === null) continue
      if (Math.hypot(p.x - m.x, p.z - m.z) > RAID_SWIPE_RANGE || Math.abs(p.y - 0) > 3) continue
      // Full force: whatever they carried is on the floor, like a bomb.
      frapperPorteur(addr, 5)
      const perte = Math.floor(Math.min(coinsOf(addr) * RAID_SWIPE_SHARE, incomePerSecond(addr) * RAID_SWIPE_CAP_S + 500))
      if (perte > 0 && spend(addr, perte)) {
        dropAt(addr, perte, { x: p.x, y: p.y, z: p.z })
        void room.send('raidSwipe', { lost: perte }, { to: [addr] })
        log(`raid: swiped ${displayName(addr)} for ${perte}`)
      } else {
        void room.send('raidSwipe', { lost: 0 }, { to: [addr] })
      }
    }
  })

  log('raid ready')
}
