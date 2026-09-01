import { engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  Raid, Event, RAID_ENABLED, RAID_MINUTES, RAID_MS, RAID_POS, RAID_RADIUS,
  RAID_HP_BASE, RAID_HP_PER_PLAYER, RAID_SWIPE_MS, RAID_SWIPE_RANGE, RAID_SWIPE_SHARE, RAID_HIT_RANGE,
  RAID_SWIPE_CAP_S, RAID_REWARD_CRATE, RAID_SPAWN_MARGIN, RAID_AGGRO_RANGE, RAID_SPEED, RAID_TURN,
  SCENE_SIDE, forceDuTir
, RAID_DEAGGRO_RANGE, RAID_BORD, BASE_SIDE} from '../shared/schemas'
import { room } from '../shared/messages'
import { encoder } from '../shared/loot-table'
import { presents, positionOf, displayName, spend, coinsOf, incomePerSecond, addCrate, cratesOf, toutesLesBases } from './plots'
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

/** The next fixed slot strictly after `apres`: the raid runs on the clock, not on uptime. */
function prochainCreneau(apres: number): number {
  const d = new Date(apres)
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0)
  for (const m of RAID_MINUTES) {
    const t = base + m * 60_000
    if (t > apres) return t
  }
  return base + 3_600_000 + RAID_MINUTES[0] * 60_000
}
let cibleAddr: string | null = null
let dernierBalai = 0
let spawnX = 0, spawnZ = 0

/**
 * Keeps the boss OUT of the plots, sliding along a wall instead of walking through it.
 *
 * It moves as two numbers on the server while the buildings are drawn on the client, so
 * nothing stopped it strolling through a wall to stand among somebody's shelves (owner,
 * 1 Sep). Its footprint is pushed out of every plot along whichever axis it has entered the
 * least, which makes it round a corner rather than stop dead against it. That also gives a
 * base the role it should have during a raid: a refuge you duck into, with the thing pacing
 * outside.
 */
function horsDesBases(nx: number, nz: number): { x: number; z: number } {
  const demi = BASE_SIDE / 2 + RAID_RADIUS + 0.4
  for (const b of toutesLesBases()) {
    const dx = nx - b.x, dz = nz - b.z
    if (Math.abs(dx) >= demi || Math.abs(dz) >= demi) continue
    if (demi - Math.abs(dx) < demi - Math.abs(dz)) nx = b.x + (dx < 0 ? -demi : demi)
    else nz = b.z + (dz < 0 ? -demi : demi)
  }
  return { x: nx, z: nz }
}
let faceX = 0, faceZ = 1
let dernierTick = 0
let seed = 12345
/** A pseudo-random in [0,1): the sandbox bans Math.random, so a small LCG seeded from the raid's start. */
function rnd(): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

function meneur(): { address: string; name: string } | null {
  let top: string | null = null
  let best = 0
  for (const [k, v] of degats) if (v > best) { best = v; top = k }
  return top === null ? null : { address: top, name: displayName(top) }
}

/**
 * A shot or a blow from `from` AIMED at `vise` hits the boss when the boss's disc lies on the
 * forward ray, within `RAID_HIT_RANGE` of the player, in the ground plane. The ray is used,
 * not the segment: a taser's aim point is only 2.5 m out, so a segment ending there never
 * reached a boss orbiting at 4 m, and melee weapons dealt no damage at all (tester, 28 Aug).
 * The boss is one big target everyone piles onto, so any weapon aimed at it lands, up to the
 * raid range. Damage is still the shot's force at the real distance. Returns true on a hit.
 */
export function raidHit(a: string, from: Vector3, vise: { x: number; z: number }, mult = 1): boolean {
  if (boss === null) return false
  const r = Raid.getOrNull(boss)
  if (r === null || !r.active) return false
  const ax = from.x, az = from.z
  let dx = vise.x - ax, dz = vise.z - az
  const l = Math.hypot(dx, dz)
  if (l < 0.0001) return false
  dx /= l; dz /= l                                  // unit forward, so the ray is not capped by the aim point
  const bossDist = Math.hypot(r.x - ax, r.z - az)
  if (bossDist > RAID_HIT_RANGE) return false
  const t = Math.max(0, (r.x - ax) * dx + (r.z - az) * dz)  // distance along the ray to the boss's foot
  const px = ax + t * dx, pz = az + t * dz
  if (Math.hypot(r.x - px, r.z - pz) > RAID_RADIUS) return false
  // Le corps a corps frappe plus fort ici aussi, et c'est la ou il se paie: le balai du
  // boss porte a quatre metres, donc frapper a deux metres cinquante, c'est rester dedans.
  const degat = Math.max(0.2, forceDuTir(bossDist)) * mult
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

function ouvrir(now: number, finMs?: number): void {
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
  m.untilMs = finMs ?? now + RAID_MS
  seed = (now & 0x7fffffff) ^ 0x5f3759df
  spawnX = RAID_SPAWN_MARGIN + rnd() * (SCENE_SIDE - 2 * RAID_SPAWN_MARGIN)
  spawnZ = RAID_SPAWN_MARGIN + rnd() * (SCENE_SIDE - 2 * RAID_SPAWN_MARGIN)
  // It must not appear inside a plot either.
  const depart = horsDesBases(spawnX, spawnZ)
  spawnX = depart.x; spawnZ = depart.z
  m.x = spawnX
  m.z = spawnZ
  faceX = 0; faceZ = 1
  m.faceX = faceX; m.faceZ = faceZ
  dernierTick = now
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
  prochain = prochainCreneau(now)
  m.nextMs = prochain
  if (vaincu) {
    /*
      The corpse rains coins, and the rain is for the crowd.

      The crate goes to whoever dealt the most; that is the trophy. The coins on the floor
      are the party: one drop per damage dealer, scaled to THEIR income (forty-five seconds
      of it, so it matters to the rich and to the new alike), scattered in a ring around
      where the boss fell, and anyone may scoop anyone's pile. Same drop machinery as the
      swipe, so the client already knows how to draw and grab them.
    */
    let k = 0
    for (const [addr] of degats) {
      const pluie = Math.floor(incomePerSecond(addr) * 45 + 500)
      const a2 = (k / Math.max(1, degats.size)) * Math.PI * 2 + rnd()
      dropAt(addr, pluie, { x: m.x + Math.cos(a2) * 3, y: 0.6, z: m.z + Math.sin(a2) * 3 })
      k += 1
    }
    const top = meneur()
    if (top !== null) {
      addCrate(top.address, RAID_REWARD_CRATE)
      void room.send('inventory', { crates: cratesOf(top.address) }, { to: [top.address] })
      void room.send('raidWon', { crate: RAID_REWARD_CRATE }, { to: [top.address] })
      noter('raid', top.name, '', encoder(4, 0))
      void room.send('raidOver', { winner: top.name, slain: true })
      log(`raid: slain, ${top.name} takes the crate; ${degats.size} dealers rained on`)
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
  prochain = prochainCreneau(Date.now())
  Raid.create(boss, {
    active: false, hp: 0, hpMax: 0, untilMs: 0, nextMs: prochain,
    x: RAID_POS.x, z: RAID_POS.z, topName: '', lastHitName: '', hitAtMs: 0, swipeAtMs: 0, faceX: 0, faceZ: 1
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
      const finFenetre = prochain + RAID_MS
      const passe = (): void => { prochain = prochainCreneau(now); if (boss !== null) { const m = Raid.getMutableOrNull(boss); if (m !== null) m.nextMs = prochain } }
      // The window has run out with nobody there: move on to the next slot.
      if (now >= finFenetre) { passe(); return }
      // Still inside the window: a player arriving now gets the boss for the time that is left,
      // not a skipped slot (tester, 28 Aug). No player yet, keep waiting this window out.
      if (presents().size === 0) return
      // Not on top of a rush, nor on the doorstep of the grand one: one countdown at a time.
      for (const [, ev] of engine.getEntitiesWith(Event)) {
        if (ev.theme >= 0 || ev.nextGrandMs - now < RAID_MS + 60_000) { passe(); return }
      }
      ouvrir(now, finFenetre)
      return
    }

    if (now >= lu.untilMs) { finir(false); return }

    const m = Raid.getMutableOrNull(boss)
    if (m === null) return
    const ds = Math.min(1, (now - dernierTick) / 1000)
    dernierTick = now

    /*
      Aggro that STICKS to a player, and lets go only when that player has escaped.

      It kept re-choosing the nearest player every tick and was leashed to its spawn, so it
      abandoned a chase because of where it stood rather than where its prey was. Now it
      holds the one it picked until that player leaves, disconnects, or opens the drop
      distance; only then does it look for somebody else within its notice radius. With
      nobody in reach it walks home, which is the only use the spawn point still has.
    */
    let vise = cibleAddr === null ? null : positionOf(cibleAddr)
    if (vise !== null && Math.hypot(vise.x - m.x, vise.z - m.z) > RAID_DEAGGRO_RANGE) vise = null
    if (vise === null) {
      cibleAddr = null
      let best = RAID_AGGRO_RANGE
      for (const addr of presents()) {
        const p = positionOf(addr)
        if (p === null) continue
        const d = Math.hypot(p.x - m.x, p.z - m.z)
        if (d < best) { best = d; cibleAddr = addr; vise = p }
      }
      if (cibleAddr !== null && vise !== null) log(`the raid boss locks onto ${displayName(cibleAddr)}`)
    }
    const vers = vise !== null ? { x: vise.x, z: vise.z } : { x: spawnX, z: spawnZ }
    let vx = vers.x - m.x, vz = vers.z - m.z
    const vl = Math.hypot(vx, vz)
    if (vl > 0.05) {
      vx /= vl; vz /= vl
      // Face the target/heading, turning at a bounded rate so it reads as a body, not a snap.
      const desire = Math.atan2(vx, vz)
      let cur = Math.atan2(faceX, faceZ)
      let diff = desire - cur
      while (diff > Math.PI) diff -= 2 * Math.PI
      while (diff < -Math.PI) diff += 2 * Math.PI
      cur += Math.max(-RAID_TURN * ds, Math.min(RAID_TURN * ds, diff))
      faceX = Math.sin(cur); faceZ = Math.cos(cur)
      m.faceX = faceX; m.faceZ = faceZ
      // It walks to the ends of the map after its target; the map and the plots stop it.
      const pas = Math.min(RAID_SPEED * ds, vl)
      const libre = horsDesBases(m.x + vx * pas, m.z + vz * pas)
      m.x = Math.max(RAID_BORD, Math.min(SCENE_SIDE - RAID_BORD, libre.x))
      m.z = Math.max(RAID_BORD, Math.min(SCENE_SIDE - RAID_BORD, libre.z))
    }

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
