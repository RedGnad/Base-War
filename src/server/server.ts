import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { PlayerTaps, ServerBeat, SYNC_ID, BEAT_MS } from '../shared/schemas'
import { room } from '../shared/messages'
import { startPlots, accueillir, auRevoir, placeItem, coinsOf, cashOfflineEarnings, reclamerQuotidienne, pushQuests } from './plots'
import { arrivee, depart, verifierCadeau } from './onboarding'
import { runConvoys } from './convoy'
import { startCombat } from './combat'
import { log, flushLog, replayLog } from './log'
import { startTheft, lockOnArrival, delivrerAlertes, recordPrestige } from './theft'
import { startBelt } from './belt'

const STORAGE_KEY = 'taps'
const SAVE_EVERY_MS = 5000

const counts = new Map<string, number>()
const dirty = new Set<string>()
const entities = new Map<string, ReturnType<typeof engine.addEntity>>()

function entityFor(address: string) {
  const cached = entities.get(address)
  if (cached !== undefined && PlayerTaps.getOrNull(cached) !== null) return cached

  const e = engine.addEntity()
  Transform.create(e, { position: { x: 0, y: -100, z: 0 } }) // hors de vue: porteur de donnees
  PlayerTaps.create(e, { playerId: address, count: counts.get(address) ?? 0 })
  syncEntity(e, [PlayerTaps.componentId])
  entities.set(address, e)
  return e
}

function publish(address: string) {
  const e = entityFor(address)
  const c = PlayerTaps.getMutableOrNull(e)
  if (c === null) return
  c.count = counts.get(address) ?? 0
}

async function load(address: string): Promise<number> {
  if (counts.has(address)) return counts.get(address)!
  const raw = await Storage.player.get<string>(address, STORAGE_KEY)
  const n = raw ? (JSON.parse(raw).count ?? 0) : 0
  counts.set(address, n)
  console.log(`[SERVER] loaded ${address} -> ${n}`)
  return n
}

async function flush(): Promise<void> {
  if (dirty.size === 0) return
  const batch = [...dirty]
  dirty.clear()
  for (const address of batch) {
    const value = JSON.stringify({ count: counts.get(address) ?? 0, at: Date.now() })
    const ok = await Storage.player.set(address, STORAGE_KEY, value)
    if (!ok) {
      console.error(`[SERVER] write failed for ${address}, requeued`)
      dirty.add(address)
    } else {
      console.log(`[SERVER] persiste ${address} = ${counts.get(address)}`)
    }
  }
}

export function startServer(): void {
  console.log('[SERVER] start')

  const beat = engine.addEntity()
  ServerBeat.create(beat, { at: Date.now() })
  syncEntity(beat, [ServerBeat.componentId], SYNC_ID.serverBeat)
  timers.setInterval(() => {
    const b = ServerBeat.getMutableOrNull(beat)
    if (b !== null) b.at = Date.now()
  }, BEAT_MS)

  timers.setInterval(() => { flushLog() }, 1000)

  timers.setInterval(() => {
    void flush()
  }, SAVE_EVERY_MS)

  room.onMessage('tap', (_data, context) => {
    const address = context?.from?.toLowerCase()
    if (!address) return
    void (async () => {
      const current = await load(address)
      const next = current + 1
      counts.set(address, next)
      dirty.add(address)
      publish(address)
      console.log(`[SERVER] tap de ${address} -> ${next}`)
      void room.send('tapAck', { count: next, persisted: false }, { to: [address] })
    })()
  })

  startPlots()
  startTheft()
  startBelt()
  runConvoys()
  startCombat()

  const presents = new Set<string>()
  let sinceCheck = 0
  engine.addSystem((dt: number) => {
    sinceCheck += dt
    if (sinceCheck < 1) return
    sinceCheck = 0

    const ici = new Set<string>()
    for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
      const a = id.address?.toLowerCase()
      if (a) ici.add(a)
    }

    for (const address of ici) {
      if (presents.has(address)) continue
      presents.add(address)
      void (async () => {
        const n = await load(address)
        publish(address)
        await accueillir(address)
        const hl = cashOfflineEarnings(address)
        if (hl !== null) void room.send('offlineEarnings', hl, { to: [address] })
        const dq = reclamerQuotidienne(address)
        if (dq !== null) void room.send('dailyReward', dq, { to: [address] })
        pushQuests(address)
        arrivee(address)
        lockOnArrival(address)    // grace period on arrival
        delivrerAlertes(address)  // what happened while away
        replayLog(address)
        console.log(`[SERVER] ${address} joined, state restored: ${n}`)
      })()
    }

    verifierCadeau(presents)

    for (const address of [...presents]) {
      if (ici.has(address)) continue
      presents.delete(address)
      dirty.add(address)
      auRevoir(address)
      depart(address)
      void flush()
    }
  })
}
