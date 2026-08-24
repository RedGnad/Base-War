import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  Belt, beltPosition, BELT_DURATION_S, BELT_INTERVAL_S, BUY_RANGE, CHUTE_FIN
} from '../shared/schemas'
import { room } from '../shared/messages'
import { log } from './log'
import { rollCrateTier, rollCrate, rollMutation } from './loot'
import { displayName, spend, coinsOf, addCrate, removeCrate, cratesOf, addItem, etatPrevisible, advanceQuest, pushQuests } from './plots'
import { tutoFait } from './onboarding'
import { startConvoy } from './convoy'
import { CRATES, encoder, itemName } from '../shared/loot-table'

type Article = {
  id: number
  crateTier: number
  price: number
  progres: number
  vendu: boolean
  entity: ReturnType<typeof engine.addEntity>
}

const POSE_DIFFEREE_MS = 2700

const articles: Article[] = []
let prochainId = 1
let depuisSpawn = 0

function positionOf(address: string): Vector3 | null {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(e)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

function spawnBeltItem(): void {
  const crateTier = rollCrateTier()
  const price = CRATES[crateTier].price
  const e = engine.addEntity()
  const p = beltPosition(0)
  Transform.create(e, { position: Vector3.create(p.x, p.y, p.z) })
  Belt.create(e, { articleId: prochainId, crateTier, price, progres: 0, buyerName: '' })
  syncEntity(e, [Belt.componentId, Transform.componentId])
  articles.push({ id: prochainId, crateTier, price, progres: 0, vendu: false, entity: e })
  prochainId += 1

  if (crateTier >= 2) {
    void room.send('beltAlert', { crateTier })
    log(`announce: ${CRATES[crateTier].name} on the belt`)
  }
}

function retirer(a: Article): void {
  engine.removeEntity(a.entity)
  const i = articles.indexOf(a)
  if (i >= 0) articles.splice(i, 1)
}

export function startBelt(): void {
  engine.addSystem((dt: number) => {
    depuisSpawn += dt
    if (depuisSpawn >= BELT_INTERVAL_S) {
      depuisSpawn = 0
      spawnBeltItem()
    }
    for (const a of [...articles]) {
      a.progres += dt / BELT_DURATION_S
      if (a.progres >= 1 + CHUTE_FIN) { retirer(a); continue }
      const c = Belt.getMutableOrNull(a.entity)
      if (c !== null) c.progres = a.progres
      const t = Transform.getMutableOrNull(a.entity)
      if (t !== null) {
        const p = beltPosition(a.progres)
        t.position = Vector3.create(p.x, p.y, p.z)
      }
    }
  })

  room.onMessage('buyBelt', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const art = articles.find((x) => x.id === d.articleId)
    if (!art) { void room.send('actionRejected', { action: 'purchase', reason: 'that crate is already gone', antiCheat: false }, { to: [a] }); return }
    if (art.vendu) { void room.send('actionRejected', { action: 'purchase', reason: 'someone paid before you', antiCheat: false }, { to: [a] }); return }

    const p = positionOf(a)
    if (p === null) { void room.send('actionRejected', { action: 'purchase', reason: 'position unknown', antiCheat: false }, { to: [a] }); return }
    if (art.progres >= 1) {
      void room.send('actionRejected', { action: 'purchase', reason: 'it fell into the pit', antiCheat: false }, { to: [a] })
      return
    }
    const pos = beltPosition(art.progres)
    const dist = Vector3.distance(p, Vector3.create(pos.x, pos.y, pos.z))
    if (dist > BUY_RANGE) {
      void room.send('actionRejected', { action: 'purchase', reason: `too far (${dist.toFixed(1)}m)`, antiCheat: true }, { to: [a] })
      return
    }

    if (!spend(a, art.price)) {
      void room.send('actionRejected', { action: 'purchase', reason: `you need ${art.price - coinsOf(a)} more coins`, antiCheat: false }, { to: [a] })
      return
    }

    if (!startConvoy(a, art.crateTier, art.price, { x: pos.x, z: pos.z })) {
      addCrate(a, art.crateTier)
      void room.send('inventory', { crates: cratesOf(a) }, { to: [a] })
    }
    tutoFait(a, 3)
    advanceQuest(a, 'acheter')
    pushQuests(a)
    art.vendu = true
    const name = displayName(a)
    const c = Belt.getMutableOrNull(art.entity)
    if (c !== null) c.buyerName = name
    void room.send('bought', { byName: name, crateTier: art.crateTier, price: art.price })
    log(`${name} bought a ${CRATES[art.crateTier].name} for ${art.price}`)
    retirer(art)
  })

  const inFlight = new Map<string, number>()

  room.onMessage('openBox', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (etatPrevisible(a) === 'plein' || inFlight.get(a) !== undefined) {
      void room.send('actionRejected', { action: 'opening', reason: 'base full: sell an item or buy a floor', antiCheat: false }, { to: [a] })
      return
    }
    if (!removeCrate(a, d.crateTier)) {
      void room.send('actionRejected', { action: 'opening', reason: 'you do not have that crate', antiCheat: true }, { to: [a] })
      return
    }
    tutoFait(a, 1)
    advanceQuest(a, 'ouvrir')
    if (d.crateTier >= 1) advanceQuest(a, 'ouvrirRare')
    const rarity = rollCrate(d.crateTier)
    const mut = rollMutation()
    const code = encoder(rarity, mut)
    const prevu = etatPrevisible(a)
    log(`${displayName(a)} ouvre une crate ${d.crateTier} -> ${itemName(rarity, mut)} (${prevu}, pose differee)`)
    void room.send('boxResult', { crateTier: d.crateTier, rarity, mutation: mut, state: prevu }, { to: [a] })
    void room.send('inventory', { crates: cratesOf(a) }, { to: [a] })

    inFlight.set(a, code)
    pushQuests(a)

    timers.setTimeout(() => {
      inFlight.delete(a)
      const reel = addItem(a, code)
      if (reel === 'expose') { advanceQuest(a, 'poser'); pushQuests(a) }
      if (reel !== prevu) log(`pose differee: prevu ${prevu}, obtenu ${reel} pour ${displayName(a)}`)
    }, POSE_DIFFEREE_MS)
  })

  log('belt ready')
}
