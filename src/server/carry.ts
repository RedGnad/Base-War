import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Carried, CARRY_TIMEOUT_MS, CARRY_GRIP, PLACE_RANGE } from '../shared/schemas'
import { room } from '../shared/messages'
import { rarityOf, mutationDe } from '../shared/loot-table'
import { log } from './log'
import {
  baseDe, removeItem, addItem, displayName, presents, positionOf, crediterVente
} from './plots'

/**
 * Carrying, which is the one verb the rest of this game turned out to be made of.
 *
 * Taking from a rival, giving to a friend and tidying your own shelves were three mechanics
 * with three messages and three explanations. They are one act performed in three places:
 * lift it, walk, put it down. Where it lands decides what the act was, and nothing has to be
 * explained because the player already watched themselves do it.
 *
 * The server owns every step. A client says "I would like to lift slot four" and "I would
 * like to put this down here"; it never says what it holds, because a client that can assert
 * what it holds can assert anything.
 */

/** One entity per carrier, created here, synced to everyone so the item shows in their hand. */
const portes = new Map<string, ReturnType<typeof engine.addEntity>>()

export function porteQuoi(address: string): number | null {
  const e = portes.get(address)
  if (e === undefined) return null
  return Carried.getOrNull(e)?.code ?? null
}

export function portePour(address: string): boolean {
  return porteQuoi(address) !== null
}

function poser(address: string, code: number, origin: string): void {
  const e = engine.addEntity()
  Carried.create(e, { holder: address, code, origin, sinceMs: Date.now(), grip: CARRY_GRIP })
  syncEntity(e, [Carried.componentId])
  portes.set(address, e)
}

function lacher(address: string): { code: number; origin: string } | null {
  const e = portes.get(address)
  if (e === undefined) return null
  const c = Carried.getOrNull(e)
  portes.delete(address)
  engine.removeEntity(e)
  return c === null ? null : { code: c.code, origin: c.origin }
}

/** Send it back where it came from, or to the carrier if that base is gone or full. */
function rentrer(address: string, quoi: { code: number; origin: string }, pourquoi: string): void {
  if (!addItem(quoi.origin, quoi.code) && !addItem(address, quoi.code)) {
    log(`carry: ${displayName(address)} lost a ${rarityOf(quoi.code)}, nowhere to put it (${pourquoi})`)
    return
  }
  void room.send('carryResult', {
    ok: false, reason: pourquoi, rarity: rarityOf(quoi.code), mutation: mutationDe(quoi.code)
  }, { to: [address] })
  log(`carry: ${displayName(address)} released a ${rarityOf(quoi.code)} (${pourquoi})`)
}

/** A theft that has finished prying does not teleport home: it lands in the thief's hands. */
export function remettreEnMain(thief: string, code: number, origin: string): void {
  poser(thief, code, origin)
  void room.send('carryResult', {
    ok: true, reason: 'carrying', rarity: rarityOf(code), mutation: mutationDe(code)
  }, { to: [thief] })
}

/** Shot, disconnected, or simply done with it: whatever the reason, it goes home. */
export function forcerLacher(address: string, pourquoi: string): boolean {
  const quoi = lacher(address)
  if (quoi === null) return false
  rentrer(address, quoi, pourquoi)
  return true
}

/**
 * A hit on somebody's hands. Returns what it achieved, so the shooter can be told once.
 *
 * Called before anything else a shot does, because the coin logic returns early when the
 * target has nothing to give: a thief who has just spent everything, or who never had
 * anything, was the one player a bullet could not disarm.
 */
export function frapperPorteur(address: string): 'rien' | 'ebranle' | 'lache' {
  const e = portes.get(address)
  if (e === undefined) return 'rien'
  const c = Carried.getMutableOrNull(e)
  if (c === null) return 'rien'
  c.grip -= 1
  if (c.grip > 0) return 'ebranle'
  forcerLacher(address, 'shot, you dropped it')
  return 'lache'
}

export function startCarry(): void {
  room.onMessage('pickUp', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (portePour(a)) { void room.send('carryResult', { ok: false, reason: 'hands full', rarity: 0, mutation: 0 }, { to: [a] }); return }
    const b = baseDe(a)
    if (b === undefined) { void room.send('carryResult', { ok: false, reason: 'you have no base', rarity: 0, mutation: 0 }, { to: [a] }); return }
    const slot = d?.slot
    if (!Number.isInteger(slot) || slot < 0 || slot >= b.items.length) { void room.send('carryResult', { ok: false, reason: 'no such item', rarity: 0, mutation: 0 }, { to: [a] }); return }
    const code = removeItem(a, slot)
    if (code === null) { void room.send('carryResult', { ok: false, reason: 'it is gone', rarity: 0, mutation: 0 }, { to: [a] }); return }
    poser(a, code, a)
    void room.send('carryResult', { ok: true, reason: 'carrying', rarity: rarityOf(code), mutation: mutationDe(code) }, { to: [a] })
    log(`carry: ${displayName(a)} picked up a ${rarityOf(code)} from their own base`)
  })

  room.onMessage('placeDown', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const e = portes.get(a)
    const c = e === undefined ? null : Carried.getOrNull(e)
    if (c === null) { void room.send('carryResult', { ok: false, reason: 'you are not carrying anything', rarity: 0, mutation: 0 }, { to: [a] }); return }

    const p = positionOf(a)
    if (p === null) return
    const vise = (d?.ownerId ?? '').toLowerCase()
    /*
      You put it down in the building you are standing in, and that is the whole interface.
      Giving used to be a click on somebody's plinth from wherever you happened to be; now it
      is walking into their place with the thing in your hands, which needs no wording at all.
    */
    const b = baseDe(vise)
    if (b === undefined) { void room.send('carryResult', { ok: false, reason: 'no base there', rarity: 0, mutation: 0 }, { to: [a] }); return }
    const t = Transform.getOrNull(b.entity)
    if (t === null) return
    const dx = p.x - t.position.x, dz = p.z - t.position.z
    if (Math.sqrt(dx * dx + dz * dz) > PLACE_RANGE) {
      void room.send('carryResult', { ok: false, reason: 'get closer to that base', rarity: 0, mutation: 0 }, { to: [a] })
      return
    }
    if (!addItem(vise, c.code)) {
      void room.send('carryResult', { ok: false, reason: 'that base is full', rarity: 0, mutation: 0 }, { to: [a] })
      return
    }
    lacher(a)
    void room.send('carryResult', { ok: true, reason: vise === a ? 'placed' : 'given', rarity: rarityOf(c.code), mutation: mutationDe(c.code) }, { to: [a] })
    if (vise !== a) {
      void room.send('gifted', { byName: displayName(a), toName: b.name, rarity: rarityOf(c.code) })
    }
    log(`carry: ${displayName(a)} placed a ${rarityOf(c.code)} in ${b.name}'s base`)
  })

  /*
    Selling from the hand, because the shelf is no longer where a decision gets made.

    The resale used to hang off the two-step selection that carrying replaced. It belongs
    here now, and arguably always did: you sell a thing you are holding, having looked at it,
    rather than a thing you had ticked in a list.
  */
  room.onMessage('sellCarried', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const quoi = lacher(a)
    if (quoi === null) { void room.send('carryResult', { ok: false, reason: 'you are not carrying anything', rarity: 0, mutation: 0 }, { to: [a] }); return }
    const gain = crediterVente(a, quoi.code)
    void room.send('sold', { gain, rarity: rarityOf(quoi.code) }, { to: [a] })
    log(`carry: ${displayName(a)} sold a ${rarityOf(quoi.code)} out of hand for ${gain}`)
  })

  room.onMessage('dropCarried', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (a) forcerLacher(a, 'you dropped it')
  })

  /*
    Nobody carries anything for ever.

    A player who closes the tab holding a trophy would otherwise take it out of the game
    entirely: gone from the base it was taken from, gone from every base. Anything held past
    the timeout, or held by somebody who is no longer here, goes back where it came from.
  */
  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 1) return
    acc = 0
    const ici = presents()
    const now = Date.now()
    for (const [a, e] of [...portes]) {
      const c = Carried.getOrNull(e)
      if (c === null) { portes.delete(a); continue }
      if (!ici.has(a)) { forcerLacher(a, 'you left'); continue }
      if (now - c.sinceMs > CARRY_TIMEOUT_MS) forcerLacher(a, 'you held it too long')
    }
  })

  log('carry ready')
}
