import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  STEAL_RANGE, RECOVER_RANGE, LOCK_ON_ARRIVAL_MS, LOCK_FREE_MS, SENTRY_FREEZE_MS, SENTRY_LOCK_MS,
  LOCK_BONUS_MS, PENALTY_MS, RECOVER_WINDOW_MS
} from '../shared/schemas'

const BUILD_RANGE = 7
import { room } from '../shared/messages'
import { advanceQuest, claimQuestReward, cratesOf, pushQuests, giftItem, baseDe, useSentryCharge, sentriesOf, buySentryFor, presents } from './plots'
import { tutoFait } from './onboarding'
import { rarityOf, mutationDe, itemName } from '../shared/loot-table'
import { log } from './log'
import {
  basesProches, lockOf, setLock, removeItem, addItem,
  displayName, storeAlert, takeAlerts, coinsDe, tenterRebirth, prestigeOf,
  placeBase, basePoints, sellItemFromBase, buyFloorFor, lockCooldown, collectPending, moveItemTo
} from './plots'

type Larcin = { thief: string; victime: string; rarity: number; quand: number }
const larcins: Larcin[] = []

export function recordPrestige(_address: string, _itemsFound: number): void { /* remplace par les prestigeTier */ }
function lockBonus(address: string): number {
  return prestigeOf(address) * LOCK_BONUS_MS
}

function positionOf(address: string): Vector3 | null {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(e)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

function refus(address: string, action: string, reason: string, antiCheat = false): void {
  void room.send('actionRejected', { action, reason, antiCheat }, { to: [address] })
}

export function lockOnArrival(address: string): void {
  const jusqua = Date.now() + LOCK_ON_ARRIVAL_MS + lockBonus(address)
  if (setLock(address, jusqua)) {
    log(`${displayName(address)} protege ${Math.round((jusqua - Date.now()) / 1000)} s a l'arrivee`)
  }
}

export function delivrerAlertes(address: string): void {
  const a = takeAlerts(address)
  if (a.length === 0) return
  for (const alerte of a) {
    const x = alerte as { type?: string; byName: string; rarity?: number; mutation?: number; code?: number }
    if (x.type === 'sentry') {
      void room.send('sentryTriggered', { byName: x.byName, restant: (x as { restant?: number }).restant ?? 0 }, { to: [address] })
      continue
    }
    if (x.type === 'gift') {
      const code = x.code ?? 0
      void room.send('wasGifted', { byName: x.byName, rarity: rarityOf(code), mutation: mutationDe(code) }, { to: [address] })
      continue
    }
    void room.send('youWereRobbed', { byName: x.byName, rarity: x.rarity ?? 0, mutation: x.mutation ?? 0 }, { to: [address] })
  }
  log(`${a.length} alerte(s) differee(s) delivree(s) a ${displayName(address)}`)
}

export function hasSomethingToRecover(address: string): boolean {
  const t = Date.now()
  return larcins.some((l) => l.victime === address && t - l.quand <= RECOVER_WINDOW_MS)
}

export function startTheft(): void {
  room.onMessage('stealItem', (d, ctx) => {
    const thief = ctx?.from?.toLowerCase()
    if (!thief) return
    const vise = (d.ownerId ?? '').toLowerCase()
    if (vise === thief) { refus(thief, 'steal', 'that is your own base'); return }

    const p = positionOf(thief)
    if (p === null) { refus(thief, 'steal', 'position unknown'); return }

    const inRange = basesProches(p, STEAL_RANGE, thief)
    if (inRange.length === 0) { refus(thief, 'steal', 'no base in range'); return }
    const cibles = vise === '' ? inRange : inRange.filter((b) => b.address === vise)
    if (cibles.length === 0) { refus(thief, 'steal', 'that base is out of range'); return }

    const maintenant = Date.now()
    for (const c of cibles) {
      const lock = lockOf(c.address)
      if (lock > maintenant) {
        refus(thief, 'steal', `${c.name} is shielded for ${Math.ceil((lock - maintenant) / 1000)}s`)
        continue
      }
      if (c.items.length === 0) { refus(thief, 'steal', `${c.name} has nothing to take`); continue }

      if (useSentryCharge(c.address)) {
        const restant = sentriesOf(c.address)
        setLock(c.address, maintenant + SENTRY_LOCK_MS)
        void room.send('sentryBlocked', {
          ownerName: c.name, gelMs: SENTRY_FREEZE_MS, restant,
          lockSec: Math.round(SENTRY_LOCK_MS / 1000)
        }, { to: [thief] })
        const info = { type: 'sentry', byName: displayName(thief), restant }
        if (presents().has(c.address)) void room.send('sentryTriggered', info, { to: [c.address] })
        else storeAlert(c.address, info)
        log(`sentry de ${c.name} bloque ${displayName(thief)} (${restant} charge(s) restante(s))`)
        continue
      }

      const slot = d.slot
      if (!Number.isInteger(slot) || slot < 0 || slot >= c.items.length) {
        refus(thief, 'steal', 'that item is gone'); continue
      }
      const r = removeItem(c.address, slot)
      if (r === null) { refus(thief, 'steal', 'item already taken'); continue }

      if (!addItem(thief, r)) {
        addItem(c.address, r)
        refus(thief, 'steal', 'your base is full')
        return
      }

      larcins.push({ thief, victime: c.address, rarity: r, quand: maintenant })

      const thiefName = displayName(thief)
      const rar = rarityOf(r), mut = mutationDe(r)
      storeAlert(c.address, { byName: thiefName, rarity: rar, mutation: mut })
      void room.send('youWereRobbed', { byName: thiefName, rarity: rar, mutation: mut }, { to: [c.address] })

      void room.send('thiefPenalty', { ms: PENALTY_MS }, { to: [thief] })

      void room.send('stolen', { byName: thiefName, fromName: c.name, rarity: rar, mutation: mut })
      log(`${thiefName} a vole un ${itemName(rar, mut)} a ${c.name}`)
      return
    }
  })

  room.onMessage('claimSlot', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const p = positionOf(a)
    if (p === null) { refus(a, 'build', 'position unknown'); return }
    const dist = Vector3.distance(p, Vector3.create(d.x, p.y, d.z))
    if (dist > BUILD_RANGE) {
      refus(a, 'build', 'place it where you stand', true)
      return
    }
    const r = placeBase(a, d.x, d.z)
    if (!r.ok) { refus(a, 'build', r.reason ?? 'refused'); return }
    tutoFait(a, 0)
  })

  timers.setInterval(() => {
    const ps = basePoints()
    void room.send('basePositions', { xs: ps.map((q) => q.x), zs: ps.map((q) => q.z) })
  }, 2500)

  room.onMessage('moveItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (!moveItemTo(a, d.de, d.vers)) refus(a, 'move', 'cannot move there')
  })

  room.onMessage('buySentry', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = buySentryFor(a)
    if (!r.ok) { refus(a, 'sentry', r.reason ?? 'refused'); return }
    void room.send('sentryBought', { charges: r.charges ?? 0, cout: r.cout ?? 0 }, { to: [a] })
  })

  room.onMessage('giveItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const cible = d.ownerId.toLowerCase()

    const p = positionOf(a)
    const bc = baseDe(cible)
    if (p === null || bc === undefined) { refus(a, 'gift', 'position unknown'); return }
    const dist = Vector3.distance(p, Vector3.create(bc.x, p.y, bc.z))
    if (dist > STEAL_RANGE) { refus(a, 'gift', `too far (${dist.toFixed(1)}m)`, true); return }

    const r = giftItem(a, cible, d.slot)
    if (!r.ok) { refus(a, 'gift', r.reason ?? 'refused'); return }

    const code = r.code ?? 0
    const rar = rarityOf(code)
    const mut = mutationDe(code)
    void room.send('gaveItem', { toName: displayName(cible), rarity: rar, mutation: mut }, { to: [a] })
    void room.send('wasGifted', { byName: displayName(a), rarity: rar, mutation: mut }, { to: [cible] })
    void room.send('gifted', { byName: displayName(a), toName: displayName(cible), rarity: rar })
    tutoFait(a, 4)
    advanceQuest(a, 'gift')
    pushQuests(a)
  })

  room.onMessage('claimQuest', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = claimQuestReward(a, d.slot)
    if ('erreur' in r) { refus(a, 'quest', r.erreur); return }
    void room.send('dailyReward', { log: 0, crate: r.crate }, { to: [a] })
    void room.send('inventory', { crates: cratesOf(a) }, { to: [a] })
    pushQuests(a)
  })

  room.onMessage('collect', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const gain = collectPending(a)
    if (gain <= 0) { refus(a, 'collect', 'nothing to collect'); return }
    void room.send('collected', { gain }, { to: [a] })
    tutoFait(a, 2)
    advanceQuest(a, 'collectPending')
    advanceQuest(a, 'bank', gain)
    pushQuests(a)
  })

  room.onMessage('buyFloor', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = buyFloorFor(a)
    if (!r.ok) { refus(a, 'floor', r.reason ?? 'refused'); return }
    void room.send('floorBought', { floors: r.floors ?? 1, cout: r.cout ?? 0 }, { to: [a] })
  })

  room.onMessage('sellItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = sellItemFromBase(a, d.slot)
    if (!r.ok) { refus(a, 'sell', r.reason ?? 'refused'); return }
    void room.send('sold', { gain: r.gain ?? 0, rarity: 0 }, { to: [a] })
    advanceQuest(a, 'vendre')
    pushQuests(a)
  })

  room.onMessage('rebirth', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = tenterRebirth(a)
    if (!r.ok) { refus(a, 'prestige', r.reason ?? 'refused'); return }
    void room.send('rebirthDone', { prestige: r.prestige ?? 0, floors: r.floors ?? 1 }, { to: [a] })
  })

  room.onMessage('activateLock', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const reste = lockCooldown(a)
    if (reste > 0) { refus(a, 'lock', `recharging, ${Math.ceil(reste / 1000)}s`); return }
    const duration = LOCK_FREE_MS + lockBonus(a)
    const jusqua = Date.now() + duration
    if (!setLock(a, jusqua)) { refus(a, 'lock', 'no base placed'); return }
    log(`${displayName(a)} locked sa base ${Math.round(duration / 1000)} s`)
  })

  room.onMessage('reclaim', (_d, ctx) => {
    const victime = ctx?.from?.toLowerCase()
    if (!victime) return
    const p = positionOf(victime)
    if (p === null) { refus(victime, 'recover', 'position unknown'); return }

    const maintenant = Date.now()
    for (let i = larcins.length - 1; i >= 0; i--) {
      const l = larcins[i]
      if (l.victime !== victime) continue
      if (maintenant - l.quand > RECOVER_WINDOW_MS) continue

      const pv = positionOf(l.thief)
      if (pv === null) { refus(victime, 'recover', 'the thief is gone'); continue }
      const d = Vector3.distance(p, pv)
      if (d > RECOVER_RANGE) {
        refus(victime, 'recover', `${displayName(l.thief)} is ${d.toFixed(1)}m away, get closer`)
        continue
      }

      const items = basesProches(pv, 0.1, '').find((b) => b.address === l.thief)
      const idx = items ? items.items.lastIndexOf(l.rarity) : -1
      const r = idx >= 0 ? removeItem(l.thief, idx) : null
      if (r === null) { refus(victime, 'recover', 'they no longer have it'); continue }

      addItem(victime, r)
      larcins.splice(i, 1)
      void room.send('reclaimed', { byName: displayName(victime), fromName: displayName(l.thief), rarity: r })
      log(`${displayName(victime)} a repris sa rarity ${r} a ${displayName(l.thief)}`)
      return
    }
    refus(victime, 'recover', 'nothing to recover')
  })

  timers.setInterval(() => {
    const t = Date.now() - RECOVER_WINDOW_MS * 3
    while (larcins.length > 0 && larcins[0].quand < t) larcins.shift()
  }, 10000)

  log('couche steal prete')
}
