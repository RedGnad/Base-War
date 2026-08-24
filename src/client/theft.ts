import { engine, AudioSource, Transform, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { rarity } from '../shared/loot-table'
import { indexView } from './index-ui'
import { applyThiefPenalty, applyFreeze } from './locomotion'
import { tutoView } from './tutorial'

export const theftView = {
  stealing: false,
  stealTarget: '',
  stealLeftMs: 0,
  stealTotalMs: 1,
  presents: 1,
  prime: 0,
  sentries: 0,
  sentryPrice: 0,
  coins: 0,
  prestige: 0,
  nextPrestige: 0,
  minRarity: 0,
  multiplier: 1,
  income: 0,
  basePosee: false,
  lockSec: 0,
  canRecover: false,
  floorPrice: 0,
  rechargeSec: 0,
  pending: 0,
  alert: '',
  alertColor: '#ffffff',
  alerteJusqua: 0,
  fil: [] as string[],
  malusJusqua: 0,
}

let sonneur = 0 as unknown as ReturnType<typeof engine.addEntity>

export function alerter(texte: string, color: string, durationMs = 6000): void {
  theftView.alert = texte
  theftView.alertColor = color
  theftView.alerteJusqua = Date.now() + durationMs
}

function pushToFeed(ligne: string): void {
  theftView.fil.unshift(ligne)
  if (theftView.fil.length > 4) theftView.fil.pop()
}

export function setupTheft(): void {
  sonneur = engine.addEntity()
  Transform.create(sonneur, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
  AudioSource.create(sonneur, { audioClipUrl: 'assets/sounds/alert-steal.wav', playing: false, loop: false, volume: 1 })

  room.onMessage('youWereRobbed', (d) => {
    const r = rarity(d.rarity)
    alerter(`${d.byName} STOLE YOUR ${r.name.toUpperCase()}!`, r.color, 8000)
    const a = AudioSource.getMutableOrNull(sonneur)
    if (a !== null) { a.playing = false; a.playing = true }
    console.log(`[CLIENT] VOL SUBI: ${d.byName} -> ${r.name}`)
  })

  room.onMessage('thiefPenalty', (d) => {
    applyThiefPenalty(true)
    theftView.malusJusqua = Date.now() + d.ms
    timers.setTimeout(() => {
      applyThiefPenalty(false)
      theftView.malusJusqua = 0
    }, d.ms)
    console.log(`[CLIENT] malus thief pour ${d.ms} ms`)
  })

  room.onMessage('stolen', (d) => {
    theftView.stealing = false
    pushToFeed(`${d.byName} a pris un ${rarity(d.rarity).name} a ${d.fromName}`)
  })
  room.onMessage('reclaimed', (d) => {
    pushToFeed(`${d.byName} a repris son ${rarity(d.rarity).name} a ${d.fromName}`)
  })
  room.onMessage('sentryBlocked', (d) => {
    applyFreeze(d.gelMs)
    alerter(`${d.ownerName.toUpperCase()}'S SENTRY CAUGHT YOU\nfrozen ${Math.round(d.gelMs / 1000)}s  ·  base sealed ${d.lockSec}s`, '#ff6b6b', 6500)
  })
  room.onMessage('sentryTriggered', (d) => {
    alerter(`YOUR SENTRY STOPPED ${d.byName.toUpperCase()}  ·  ${d.left} charge${d.left === 1 ? '' : 's'} left`, '#4dd2ff', 7000)
  })
  room.onMessage('sentryBought', (d) => {
    alerter(`SENTRY ARMED  ·  ${d.charges} charges  ·  -${d.cost} coins`, '#4dd2ff', 4000)
  })

  room.onMessage('gaveItem', (d) => {
    const r = rarity(d.rarity)
    alerter(`GIFTED TO ${d.toName.toUpperCase()}: ${r.name.toUpperCase()}`, '#8fe08f', 5000)
  })
  room.onMessage('wasGifted', (d) => {
    const r = rarity(d.rarity)
    alerter(`${d.byName} LEFT YOU A ${r.name.toUpperCase()}!`, r.color, 8000)
  })
  room.onMessage('outbidFeed', (d) => {
    pushToFeed(`${d.byName} outbid ${d.fromName} for ${d.price}`)
  })
  room.onMessage('gifted', (d) => {
    pushToFeed(`${d.byName} gifted ${rarity(d.rarity).name} to ${d.toName}`)
  })

  room.onMessage('stealProgress', (d) => {
    theftView.stealing = true
    theftView.stealTarget = d.ownerName
    theftView.stealLeftMs = d.restantMs
    theftView.stealTotalMs = Math.max(1, d.totalMs)
  })
  room.onMessage('stealFailed', (d) => {
    theftView.stealing = false
    alerter(`STEAL FAILED: ${d.reason.toUpperCase()}`, '#ff6b6b', 4000)
  })
  room.onMessage('beingRobbed', (d) => {
    alerter(`${d.byName.toUpperCase()} IS TAKING YOUR ${rarity(d.rarity).name.toUpperCase()}!`, '#ff6b6b', Math.max(3000, d.restantMs))
  })

  room.onMessage('wallet', (d) => {
    tutoView.etape = d.tutoEtape
    theftView.sentries = d.sentries
    theftView.sentryPrice = d.sentryPrice
    theftView.presents = d.presents
    theftView.prime = d.prime
    theftView.coins = Math.floor(d.coins)
    theftView.prestige = d.prestige
    theftView.nextPrestige = d.nextPrestige
    theftView.minRarity = d.minRarity
    theftView.multiplier = d.multiplier
    theftView.income = d.income
    theftView.basePosee = d.basePosee
    theftView.lockSec = d.lockSec
    theftView.canRecover = d.canRecover
    theftView.floorPrice = d.floorPrice
    theftView.rechargeSec = d.rechargeSec
    theftView.pending = d.pending
  })

  room.onMessage('rebirthDone', (d) => {
    alerter(`PRESTIGE ${d.prestige}  ·  ${d.floors} floors`, '#f5a524', 6000)
    console.log(`[CLIENT] prestige ${d.prestige}, ${d.floors} floors`)
  })

  room.onMessage('index', (d) => { indexView.vus = [...d.vus] })

  room.onMessage('collected', (d) => {
    alerter(`+${d.gain} coins collected`, '#8fe08f', 2200)
  })

  room.onMessage('offlineEarnings', (d) => {
    const min = Math.round(d.seconds / 60)
    alerter(`WELCOME BACK  ·  +${d.gain} coins earned in ${min} min away`, '#ffd166', 9000)
    console.log(`[CLIENT] offline: +${d.gain} over ${min} min`)
  })

  room.onMessage('dailyReward', (d) => {
    alerter(`DAY ${d.log}/7  ·  free crate!`, '#4dd2ff', 7000)
    console.log(`[CLIENT] recompense du log ${d.log}`)
  })

  room.onMessage('floorBought', (d) => {
    alerter(`FLOOR ${d.floors} UNLOCKED  ·  +6 slots`, '#4dd2ff', 5000)
    console.log(`[CLIENT] floor ${d.floors} achete pour ${d.cost}`)
  })

  room.onMessage('sold', (d) => {
    alerter(`+${d.gain} coins`, '#8fe08f', 2500)
    console.log(`[CLIENT] revendu pour ${d.gain}`)
  })

  room.onMessage('actionRejected', (d) => {
    alerter(d.reason.toUpperCase(), '#ff6b6b', 4000)
    console.log(`[CLIENT] refuse (${d.action}): ${d.reason}${d.antiCheat ? ' [anti-triche]' : ''}`)
  })

  engine.addSystem((dt) => {
    if (theftView.stealing) {
      theftView.stealLeftMs = Math.max(0, theftView.stealLeftMs - dt * 1000)
    }
    if (theftView.alert !== '' && Date.now() > theftView.alerteJusqua) theftView.alert = ''
  })
}

export function cancelSteal(): void { theftView.stealing = false; void room.send('cancelSteal', {}) }

export function steal(ownerId = '', slot = -1): void {
  void room.send('stealItem', { ownerId, slot })
}
export function lockBase(): void { void room.send('activateLock', {}) }
export function recover(): void { void room.send('reclaim', {}) }
export function doPrestige(): void { void room.send('rebirth', {}) }
export function sell(slot: number): void { void room.send('sellItem', { slot }) }
export function gift(ownerId: string, slot: number): void { void room.send('giveItem', { ownerId, slot }) }
export function buyFloorFor(): void { void room.send('buyFloor', {}) }
export function armSentry(): void { void room.send('buySentry', {}) }
export function collectPending(): void { void room.send('collect', {}) }
export function moveItemBetweenSlots(de: number, to: number): void { void room.send('moveItem', { de, to }) }

let _adresse = ''
export function monAdresseClient(): string { return _adresse }
export function setAdresseClient(a: string): void { _adresse = a }
