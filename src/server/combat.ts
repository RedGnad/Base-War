import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  DroppedCoins, SHOT_RANGE, SHOT_COOLDOWN_MS, SHOT_DROP_SHARE, SHOT_DROP_CAP_S,
  LOOT_PICKUP_RANGE, LOOT_LIFETIME_MS
} from '../shared/schemas'
import { room } from '../shared/messages'
import { log } from './log'
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
      // within a ~14 degree cone of the aim
      const dot = (to.x * aim.x + to.z * aim.z) / dist
      if (dot < 0.97) continue
      if (best === null || dist < best.d) {
        best = { addr: other, pos: Vector3.create(t.position.x, t.position.y, t.position.z), d: dist }
      }
    }

    if (best === null) {
      void room.send('shotResult', { hitName: '', dropped: 0, reason: 'missed' }, { to: [a] })
      return
    }

    // A share of what the target is CARRYING, capped so a rich player never loses a
    // fortune to one shot, and floored by nothing: shooting a broke player yields nothing.
    const cap = Math.max(0, Math.floor(incomePerSecond(best.addr) * SHOT_DROP_CAP_S))
    const wanted = Math.floor(coinsOf(best.addr) * SHOT_DROP_SHARE)
    const amount = Math.max(0, Math.min(wanted, cap === 0 ? wanted : cap))
    if (amount <= 0 || !spend(best.addr, amount)) {
      void room.send('shotResult', { hitName: displayName(best.addr), dropped: 0, reason: 'nothing to drop' }, { to: [a] })
      return
    }

    dropAt(best.addr, amount, best.pos)
    void room.send('shotResult', { hitName: displayName(best.addr), dropped: amount, reason: 'hit' }, { to: [a] })
    void room.send('wasShot', { byName: displayName(a), lost: amount }, { to: [best.addr] })
    log(`${displayName(a)} hit ${displayName(best.addr)} for ${amount} dropped`)
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
      for (const addr of ici) {
        const p = positionOf(addr)
        if (p === null) continue
        if (Math.sqrt((p.x - t.position.x) ** 2 + (p.z - t.position.z) ** 2) > LOOT_PICKUP_RANGE) continue
        crediter(addr, c.amount)
        void room.send('pickedUp', { amount: c.amount }, { to: [addr] })
        log(`${displayName(addr)} picked up ${c.amount}`)
        engine.removeEntity(ent)
        break
      }
    }
  })

  log('combat ready')
}
