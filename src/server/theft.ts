import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  STEAL_RANGE, STEAL_REACH, STEAL_HOLD_REACH, GIFT_RANGE, STEAL_BASE_MS, STEAL_PER_RARITY_MS, RECOVER_RANGE, LOCK_ON_ARRIVAL_MS, LOCK_FREE_MS, SENTRY_FREEZE_MS, SENTRY_LOCK_MS,
  LOCK_BONUS_MS, PENALTY_MS, RECOVER_WINDOW_MS, CARRY_GRIP
} from '../shared/schemas'

const BUILD_RANGE = 7
import { room } from '../shared/messages'
import { advanceQuest, claimQuestReward, cratesOf, pushQuests, baseDe, useSentryCharge, sentriesOf, buySentryFor, presents, positionObjet, aPortee, etatPrevisible } from './plots'
import { tutoFait } from './onboarding'
import { remettreEnMain, portePour, forcerLacher, arracherDesMains } from './carry'
import { rarityOf, mutationDe, itemName } from '../shared/loot-table'
import { log } from './log'
import {
  basesProches, lockOf, setLock, removeItem, addItem,
  displayName, storeAlert, takeAlerts, coinsOf, tenterRebirth, prestigeOf,
  placeBase, basePoints, buyFloorFor, lockCooldown, collectPending
} from './plots'

/*
  `code`, not `rarity`. An item is `rarity * 100 + mutation`, and this field has always held
  the whole code; calling it a rarity is how it ended up sent as one to the client, which read
  a 402 as rarity 402, fell back to entry zero, and told the room that a Legendary recovered in
  front of witnesses was a Common.
*/
type Larcin = { thief: string; victim: string; code: number; quand: number }
const larcins: Larcin[] = []

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
  const until = Date.now() + LOCK_ON_ARRIVAL_MS + lockBonus(address)
  if (setLock(address, until)) {
    log(`${displayName(address)} shielded ${Math.round((until - Date.now()) / 1000)}s on arrival`)
  }
}

export function delivrerAlertes(address: string): void {
  const a = takeAlerts(address)
  if (a.length === 0) return
  for (const alert of a) {
    const x = alert as { type?: string; byName: string; rarity?: number; mutation?: number; code?: number }
    if (x.type === 'sentry') {
      void room.send('sentryTriggered', { byName: x.byName, left: (x as { left?: number }).left ?? 0 }, { to: [address] })
      continue
    }
    if (x.type === 'gift') {
      const code = x.code ?? 0
      void room.send('wasGifted', { byName: x.byName, rarity: rarityOf(code), mutation: mutationDe(code) }, { to: [address] })
      continue
    }
    void room.send('youWereRobbed', { byName: x.byName, rarity: x.rarity ?? 0, mutation: x.mutation ?? 0 }, { to: [address] })
  }
  log(`${a.length} alert(s) differee(s) delivree(s) a ${displayName(address)}`)
}

export function hasSomethingToRecover(address: string): boolean {
  const t = Date.now()
  return larcins.some((l) => l.victim === address && t - l.quand <= RECOVER_WINDOW_MS)
}

type EnCours = { victim: string; slot: number; code: number; fin: number; total: number; grip: number }
const enCours = new Map<string, EnCours>()

/**
 * A shot lands on somebody who is prying: the attempt ends there.
 *
 * This was the hole the whole defence had. Prying costs six to eighteen seconds standing
 * still inside somebody else's building, which is the only stretch where a thief is properly
 * exposed, and a gun did nothing to them during it: nothing outside this file ever touched
 * the in-progress map. Every counterplay the owner had arrived afterwards, once the item was
 * already in the thief's hands. The vulnerable window and the punishable window were
 * different windows.
 */
export function interrompreVol(thief: string, force: number): 'rien' | 'ebranle' | 'coupe' {
  const v = enCours.get(thief)
  if (v === undefined) return 'rien'
  v.grip -= force
  if (v.grip > 0) return 'ebranle'
  enCours.delete(thief)
  void room.send('stealFailed', { reason: 'shot, you lost your grip' }, { to: [thief] })
  return 'coupe'
}

/*
  Three handlers were deleted here on 25 Aug: giveItem, sellItem and moveItem.

  Carrying replaced all three, and their client senders had already stopped being called.
  Leaving them behind is what made two quests unwinnable: the hooks that credit them sat in
  code nothing could reach, so the game asked for something it could not notice being done.
  A handler with no caller is not harmless, it is a place for logic to hide.
*/
export function startTheft(): void {
  // RESOLUTION DES VOLS EN COURS. Un seul systeme, cadence a la seconde.
  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 0.5) return
    acc = 0
    const maintenant = Date.now()
    for (const [thief, v] of [...enCours]) {
      const b = baseDe(v.victim)
      if (b === undefined) { enCours.delete(thief); continue }

      /*
        Walking away cancels it, and going downstairs counts as walking away.

        This measured a flat distance to the base and ignored height entirely, so a theft
        begun on the top floor survived a trip to the street. It follows the item now, in
        three dimensions, which is what gives the thief's slowdown its meaning: the climb
        back down is the part where the owner can catch you.
      */
      const p = positionOf(thief)
      const cible = positionObjet(v.victim, v.slot)
      if (p === null || cible === null || !aPortee(p, cible, STEAL_HOLD_REACH)) {
        enCours.delete(thief)
        void room.send('stealFailed', { reason: 'you left the item' }, { to: [thief] })
        continue
      }

      // LA SENTINELLE AGIT PENDANT L'ACTION, pas a la place de l'action.
      if (useSentryCharge(v.victim)) {
        const left = sentriesOf(v.victim)
        setLock(v.victim, maintenant + SENTRY_LOCK_MS)
        enCours.delete(thief)
        void room.send('sentryBlocked', {
          ownerName: b.name, gelMs: SENTRY_FREEZE_MS, left, lockSec: Math.round(SENTRY_LOCK_MS / 1000)
        }, { to: [thief] })
        void room.send('stealFailed', { reason: 'the sentry stopped you' }, { to: [thief] })
        const info = { type: 'sentry', byName: displayName(thief), left }
        if (presents().has(v.victim)) void room.send('sentryTriggered', info, { to: [v.victim] })
        else storeAlert(v.victim, info)
        log(`${b.name} sentry blocked ${displayName(thief)} (${left} charge(s) left)`)
        continue
      }

      const restant = v.fin - maintenant
      if (restant > 0) {
        void room.send('stealProgress', {
          ownerName: b.name, rarity: rarityOf(v.code), mutation: mutationDe(v.code),
          restantMs: restant, totalMs: v.total
        }, { to: [thief] })
        continue
      }

      // ABOUTI: l'objet change enfin de main.
      enCours.delete(thief)
      const idx = b.items.indexOf(v.code)
      if (idx < 0) { void room.send('stealFailed', { reason: 'it is gone' }, { to: [thief] }); continue }
      const r = removeItem(v.victim, idx)
      if (r === null) { void room.send('stealFailed', { reason: 'it is gone' }, { to: [thief] }); continue }
      /*
        It lands in their hands, not in their base.

        Prying it loose used to be the whole theft: the item vanished from one building and
        appeared in another, and the two players never shared a moment. Now the thief has to
        walk it home holding it, in the open, in front of the person they took it from. That
        walk is where being shot means something, where the owner's recovery window means
        something, and where anybody watching can see what this game is about.
      */
      remettreEnMain(thief, r, v.victim)
      larcins.push({ thief, victim: v.victim, code: r, quand: maintenant })
      const nomV = displayName(thief)
      const rar = rarityOf(r), mut = mutationDe(r)
      storeAlert(v.victim, { byName: nomV, rarity: rar, mutation: mut })
      void room.send('youWereRobbed', { byName: nomV, rarity: rar, mutation: mut }, { to: [v.victim] })
      void room.send('stolen', { byName: nomV, fromName: b.name, rarity: rar, mutation: mut })
      log(`${nomV} took a ${itemName(rar, mut)} from ${b.name}`)
    }
  })

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


      const slot = d.slot
      if (!Number.isInteger(slot) || slot < 0 || slot >= c.items.length) {
        refus(thief, 'steal', 'that item is gone'); continue
      }
      // Say server-side what the building already says: that item is on another storey.
      const objet = positionObjet(c.address, slot)
      if (objet === null || !aPortee(p, objet, STEAL_REACH)) {
        refus(thief, 'steal', 'not on this floor, or too far')
        continue
      }
      if (enCours.has(thief)) { refus(thief, 'steal', 'you are already taking something'); return }
      if (portePour(thief)) { refus(thief, 'steal', 'your hands are full, put it down first'); return }

      // ON NE TRANSFERE RIEN ICI. On ouvre une tentative minutee: c'est pendant celle-ci
      // que la defense agit et que le voleur est vulnerable.
      const code = c.items[slot]
      const duree = STEAL_BASE_MS + rarityOf(code) * STEAL_PER_RARITY_MS
      enCours.set(thief, { victim: c.address, slot, code, fin: maintenant + duree, total: duree, grip: CARRY_GRIP })
      void room.send('thiefPenalty', { ms: duree + 2000 }, { to: [thief] })
      void room.send('stealProgress', {
        ownerName: c.name, rarity: rarityOf(code), mutation: mutationDe(code),
        restantMs: duree, totalMs: duree
      }, { to: [thief] })
      const nomV = displayName(thief)
      if (presents().has(c.address)) {
        void room.send('beingRobbed', { byName: nomV, rarity: rarityOf(code), restantMs: duree }, { to: [c.address] })
      }
      log(`${nomV} starts taking a ${itemName(rarityOf(code), mutationDe(code))} from ${c.name} (${Math.round(duree / 1000)}s)`)
      return
    }
  })

  room.onMessage('cancelSteal', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (a && enCours.delete(a)) void room.send('stealFailed', { reason: 'cancelled' }, { to: [a] })
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


  room.onMessage('buySentry', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = buySentryFor(a, Number.isInteger(d?.tier) ? d.tier : 0)
    if (!r.ok) { refus(a, 'sentry', r.reason ?? 'refused'); return }
    void room.send('sentryBought', { charges: r.charges ?? 0, cost: r.cost ?? 0 }, { to: [a] })
  })


  room.onMessage('claimQuest', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = claimQuestReward(a, d.slot)
    if ('error' in r) { refus(a, 'quest', r.error); return }
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
    void room.send('floorBought', { floors: r.floors ?? 1, cost: r.cost ?? 0 }, { to: [a] })
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
    const until = Date.now() + duration
    if (!setLock(a, until)) { refus(a, 'lock', 'no base placed'); return }
    log(`${displayName(a)} locked their base for ${Math.round(duration / 1000)}s`)
  })

  room.onMessage('reclaim', (_d, ctx) => {
    const victim = ctx?.from?.toLowerCase()
    if (!victim) return
    const p = positionOf(victim)
    if (p === null) { refus(victim, 'recover', 'position unknown'); return }
    /*
      Ask whether it can land before taking it off anybody.

      `addItem` answers with a word and its answer was thrown away here, so a victim whose own
      shelves were full took the item back out of the thief's possession and straight out of
      the game. Settled first, once, for every candidate below.
    */
    if (etatPrevisible(victim) === 'plein') { refus(victim, 'recover', 'your own base is full'); return }

    const maintenant = Date.now()
    for (let i = larcins.length - 1; i >= 0; i--) {
      const l = larcins[i]
      if (l.victim !== victim) continue
      if (maintenant - l.quand > RECOVER_WINDOW_MS) continue

      const pv = positionOf(l.thief)
      if (pv === null) { refus(victim, 'recover', 'the thief is gone'); continue }
      const d = Vector3.distance(p, pv)
      if (d > RECOVER_RANGE) {
        refus(victim, 'recover', `${displayName(l.thief)} is ${d.toFixed(1)}m away, get closer`)
        continue
      }

      /*
        Their hands first, then their shelves. It used to be neither.

        This looked the stolen item up with `basesProches(pv, 0.1, '')`, a proximity query with
        a ten-centimetre radius, so it only ever found anything if the thief happened to be
        standing on the exact centre point of their own building. And even standing there it
        would have found nothing, because the whole point of the rework is that a fresh theft
        is in the thief's FIST for the length of the walk home, which is longer than this
        window. Recovery reached for a shelf during the one stretch when the item is never on
        one. Take it out of their hands, and fall back to the shelf for the rare case where
        they got home inside the twenty seconds.
      */
      let repris = arracherDesMains(l.thief, l.code)
      if (!repris) {
        const bv = baseDe(l.thief)
        const idx = bv === undefined ? -1 : bv.items.lastIndexOf(l.code)
        repris = idx >= 0 && removeItem(l.thief, idx) !== null
      }
      if (!repris) { refus(victim, 'recover', 'they no longer have it'); continue }

      if (addItem(victim, l.code) === 'plein') {
        // Unreachable: capacity was settled above and nothing runs in between. Written down
        // rather than assumed, because the line that assumed it is what deleted the item.
        log(`ERROR recover: ${displayName(victim)} could not receive their own ${rarityOf(l.code)}`)
      }
      larcins.splice(i, 1)
      void room.send('reclaimed', {
        byName: displayName(victim), fromName: displayName(l.thief), rarity: rarityOf(l.code)
      })
      log(`${displayName(victim)} took back a ${itemName(rarityOf(l.code), mutationDe(l.code))} from ${displayName(l.thief)}`)
      return
    }
    refus(victim, 'recover', 'nothing to recover')
  })

  timers.setInterval(() => {
    const t = Date.now() - RECOVER_WINDOW_MS * 3
    while (larcins.length > 0 && larcins[0].quand < t) larcins.shift()
  }, 10000)

  log('steal layer ready')
}
