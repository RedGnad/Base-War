import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  DroppedCoins, SHOT_RANGE, SHOT_COOLDOWN_MS, SHOT_CONE_DOT, SHOT_DROP_SHARE, LOOT_OWNER_LOCK_MS, forceDuTir,
  SHOT_DROP_CAP_S, LOOT_PICKUP_RANGE, LOOT_LIFETIME_MS
} from '../shared/schemas'
import { room } from '../shared/messages'
import { log } from './log'
import { frapperPorteur } from './carry'
import { interrompreVol } from './theft'
import { positionOf, displayName, incomePerSecond, crediter, spend, coinsOf, presents } from './plots'

/**
 * Combat, server side.
 *
 * The client says "I fired towards this point"; it never says who it hit. The server
 * resolves the shot against the positions it reads itself from PlayerIdentityData, the
 * same source it uses for theft range. A hit does not kill: it knocks coins loose.
 */

const lastShot = new Map<string, number>()

function dropAt(from: string, amount: number, at: { x: number; y: number; z: number }): void {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(at.x, 0.6, at.z) })
  DroppedCoins.create(e, { amount, droppedBy: from, untilMs: Date.now() + LOOT_LIFETIME_MS })
  syncEntity(e, [DroppedCoins.componentId, Transform.componentId])
}

export function startCombat(): void {
  // Same trail as the belt: coins dropped by a server that no longer exists would sit on
  // the ground for ever, pickable and never expiring, because nothing ticks their timer.
  let vieux = 0
  for (const [e] of engine.getEntitiesWith(DroppedCoins)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e); vieux += 1
  }
  if (vieux > 0) log(`swept ${vieux} pile(s) left by a previous server`)

  // Drawing a weapon is public: relayed so every client shows the same armed players.
  room.onMessage('aim', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    void room.send('aiming', { addr: a, on: d.on })
  })

  room.onMessage('shoot', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const now = Date.now()
    if ((lastShot.get(a) ?? 0) + SHOT_COOLDOWN_MS > now) return
    lastShot.set(a, now)

    const from = positionOf(a)
    if (from === null) return

    // Nearest player along the aim, within range. The server owns every position here.
    const aim = Vector3.normalize(Vector3.create(d.x - from.x, 0, d.z - from.z))
    let best: { addr: string; pos: Vector3; d: number } | null = null
    for (const [ent, id] of engine.getEntitiesWith(PlayerIdentityData)) {
      const other = id.address?.toLowerCase()
      if (!other || other === a) continue
      const t = Transform.getOrNull(ent)
      if (t === null) continue
      const to = Vector3.create(t.position.x - from.x, 0, t.position.z - from.z)
      const dist = Vector3.length(to)
      if (dist > SHOT_RANGE || dist < 0.5) continue
      // Same cone the client draws its reticle from, so both agree on what is a target.
      const dot = (to.x * aim.x + to.z * aim.z) / dist
      if (dot < SHOT_CONE_DOT) continue
      if (best === null || dist < best.d) {
        best = { addr: other, pos: Vector3.create(t.position.x, t.position.y, t.position.z), d: dist }
      }
    }

    if (best === null) {
      void room.send('shotResult', { hitName: '', dropped: 0, reason: 'missed', loot: 0 }, { to: [a] })
      return
    }

    // A share of what the target is CARRYING, capped so a rich player never loses a
    /*
      Hands before pockets.

      Everything below can return early: a target with no coins, or no income to cap against,
      produces "nothing to drop" and the function ends. That put the one player a bullet
      really ought to disarm, a thief who has just spent everything or never had anything, out
      of reach of being disarmed at all. What they are holding is settled first, and the shot
      reports both facts in one message rather than two, the second of which used to erase the
      first on the way to the screen.
    */
    /*
      One shot, one strength, spent on everything it touches.

      How much a hit is worth falls with the square of the distance, so the same number
      loosens a grip, breaks a theft in progress and shakes coins loose, and a player learns
      all three by learning one. It replaced a hard ten-metre cut that did everything on one
      side and nothing on the other, which balanced the chase and asked the player to discover
      an invisible wall.
    */
    const force = forceDuTir(best.d)
    const butin = frapperPorteur(best.addr, force)
    // A shot lands on the prying too, which is the one window a gun used to do nothing about.
    const coupe = interrompreVol(best.addr, force)
    const codeButin = butin === 'lache' ? 2
      : coupe === 'coupe' ? 3
      : (butin === 'ebranle' || coupe === 'ebranle') ? 1
      : 0

    // fortune to one shot, and floored by nothing: shooting a broke player yields nothing.
    const cap = Math.max(0, Math.floor(incomePerSecond(best.addr) * SHOT_DROP_CAP_S))
    // Pockets pay by the same rule: a shot from across the plaza shakes less loose.
    const wanted = Math.floor(coinsOf(best.addr) * SHOT_DROP_SHARE * force)
    const amount = Math.max(0, Math.min(wanted, cap === 0 ? wanted : cap))
    if (amount <= 0 || !spend(best.addr, amount)) {
      void room.send('shotResult', {
        hitName: displayName(best.addr), dropped: 0,
        reason: codeButin > 0 ? 'hit' : 'nothing to drop', loot: codeButin
      }, { to: [a] })
      if (codeButin > 0) void room.send('wasShot', { byName: displayName(a), lost: 0 }, { to: [best.addr] })
      log(`${displayName(a)} hit ${displayName(best.addr)} for nothing, loot ${butin}`)
      return
    }

    dropAt(best.addr, amount, best.pos)
    void room.send('shotResult', {
      hitName: displayName(best.addr), dropped: amount, reason: 'hit', loot: codeButin
    }, { to: [a] })
    void room.send('wasShot', { byName: displayName(a), lost: amount }, { to: [best.addr] })
    log(`${displayName(a)} hit ${displayName(best.addr)} for ${amount} dropped, loot ${butin}`)
  })

  // Pickup and decay.
  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 0.3) return
    acc = 0
    const now = Date.now()
    const ici = [...presents()]
    for (const [ent, c] of engine.getEntitiesWith(DroppedCoins)) {
      const t = Transform.getOrNull(ent)
      if (t === null) continue
      if (c.untilMs < now) { engine.removeEntity(ent); continue }
      /*
        The nearest eligible player takes it, and for the first few seconds the player it
        fell from is not eligible.

        This used to credit the first player found within range, in whatever order the
        roster happened to be in. The pile lands on the victim, so the victim was always
        within range and usually first: they picked their own coins straight back up and a
        hit was worth nothing to anybody. Nearest rather than first also settles the case
        where two people arrive together.
      */
      const ouvert = c.untilMs - LOOT_LIFETIME_MS + LOOT_OWNER_LOCK_MS
      let gagnant: string | null = null
      let plusPres = LOOT_PICKUP_RANGE
      for (const addr of ici) {
        if (addr === c.droppedBy && now < ouvert) continue
        const p = positionOf(addr)
        if (p === null) continue
        const d = Math.sqrt((p.x - t.position.x) ** 2 + (p.z - t.position.z) ** 2)
        if (d > plusPres) continue
        plusPres = d
        gagnant = addr
      }
      if (gagnant !== null) {
        crediter(gagnant, c.amount)
        void room.send('pickedUp', { amount: c.amount }, { to: [gagnant] })
        log(`${displayName(gagnant)} picked up ${c.amount}`)
        engine.removeEntity(ent)
      }
    }
  })

  log('combat ready')
}
