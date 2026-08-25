import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  STEAL_RANGE, STEAL_REACH, STEAL_HOLD_REACH, SAME_STOREY, GIFT_RANGE, STEAL_BASE_MS, STEAL_PER_RARITY_MS, RECOVER_RANGE, LOCK_ON_ARRIVAL_MS, LOCK_FREE_MS, SENTRY_FREEZE_MS, SENTRY_LOCK_MS,
  LOCK_BONUS_MS, PENALTY_MS, RECOVER_WINDOW_MS, ABSENT_KEEP, CARRY_GRIP
} from '../shared/schemas'

const BUILD_RANGE = 7

/**
 * Can this player put a hand on that item, as the building would have it?
 *
 * The scene already answers this: slabs and walls carry a pointer collider, so a click aimed
 * through a ceiling never reaches the item behind it. This says the same thing in a place a
 * modified client cannot edit, which is the only reason it exists. Same storey, and no
 * further than the reach a pointer event has by default.
 */
function aPortee(joueur: Vector3, objet: Vector3, rayon: number): boolean {
  if (Math.abs(joueur.y - objet.y) > SAME_STOREY) return false
  return Vector3.distance(joueur, objet) <= rayon
}
import { room } from '../shared/messages'
import { advanceQuest, claimQuestReward, cratesOf, pushQuests, giftItem, baseDe, useSentryCharge, sentriesOf, buySentryFor, presents, positionObjet } from './plots'
import { tutoFait } from './onboarding'
import { remettreEnMain, portePour, forcerLacher } from './carry'
import { rarityOf, mutationDe, itemName } from '../shared/loot-table'
import { log } from './log'
import {
  basesProches, lockOf, setLock, removeItem, addItem,
  displayName, storeAlert, takeAlerts, coinsOf, tenterRebirth, prestigeOf,
  placeBase, basePoints, sellItemFromBase, buyFloorFor, lockCooldown, collectPending, moveItemTo
} from './plots'

type Larcin = { thief: string; victim: string; rarity: number; quand: number }
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

/** Un vol en cours est-il ouvert sur cette base ? Sert a la sentinelle et a la reprise. */
export function volEnCoursSur(address: string): boolean {
  for (const v of enCours.values()) if (v.victim === address) return true
  return false
}

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
      larcins.push({ thief, victim: v.victim, rarity: r, quand: maintenant })
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
      /*
        An absent player keeps a floor, because they have no other answer.
        
        Theft never asked whether the owner was in the scene, so logging off meant being
        stripped bare with nothing to defend with and nothing to react to. Long protections
        were the tempting fix and the wrong one: they would seal every base during the review
        window and hide the one mechanic this scene is built on. A floor instead. The base
        stays worth robbing until it is down to its best few, and its owner comes back to
        something rather than to an empty plot.
      */
      if (c.items.length <= ABSENT_KEEP && !presents().has(c.address)) {
        refus(thief, 'steal', `${c.name} is away, their last ${ABSENT_KEEP} are safe`)
        continue
      }


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

  room.onMessage('moveItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (!moveItemTo(a, d.de, d.to)) refus(a, 'move', 'cannot move there')
  })

  room.onMessage('buySentry', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = buySentryFor(a, Number.isInteger(d?.tier) ? d.tier : 0)
    if (!r.ok) { refus(a, 'sentry', r.reason ?? 'refused'); return }
    void room.send('sentryBought', { charges: r.charges ?? 0, cost: r.cost ?? 0 }, { to: [a] })
  })

  room.onMessage('giveItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const cible = d.ownerId.toLowerCase()

    const p = positionOf(a)
    const bc = baseDe(cible)
    if (p === null || bc === undefined) { refus(a, 'gift', 'position unknown'); return }
    const dist = Vector3.distance(p, Vector3.create(bc.x, p.y, bc.z))
    if (dist > GIFT_RANGE) { refus(a, 'gift', `too far (${dist.toFixed(1)}m)`, true); return }

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
    const until = Date.now() + duration
    if (!setLock(a, until)) { refus(a, 'lock', 'no base placed'); return }
    log(`${displayName(a)} locked their base for ${Math.round(duration / 1000)}s`)
  })

  room.onMessage('reclaim', (_d, ctx) => {
    const victim = ctx?.from?.toLowerCase()
    if (!victim) return
    const p = positionOf(victim)
    if (p === null) { refus(victim, 'recover', 'position unknown'); return }

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

      const items = basesProches(pv, 0.1, '').find((b) => b.address === l.thief)
      const idx = items ? items.items.lastIndexOf(l.rarity) : -1
      const r = idx >= 0 ? removeItem(l.thief, idx) : null
      if (r === null) { refus(victim, 'recover', 'they no longer have it'); continue }

      addItem(victim, r)
      larcins.splice(i, 1)
      void room.send('reclaimed', { byName: displayName(victim), fromName: displayName(l.thief), rarity: r })
      log(`${displayName(victim)} a repris sa rarity ${r} a ${displayName(l.thief)}`)
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
