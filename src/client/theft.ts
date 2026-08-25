import { engine, AudioSource, Transform, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { rarity } from '../shared/loot-table'
import { indexView } from './index-ui'
import { applyThiefPenalty, applyFreeze } from './locomotion'
import { tutoView } from './tutorial'
import { envoyerOuAttendre } from './intent'

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
  bestRarity: -1,
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
  fil: [] as Array<{ t: string; jusqua: number }>,
  malusJusqua: 0,
}

let sonneur = 0 as unknown as ReturnType<typeof engine.addEntity>

export function alerter(texte: string, color: string, durationMs = 6000): void {
  theftView.alert = texte
  theftView.alertColor = color
  theftView.alerteJusqua = Date.now() + durationMs
}

/*
  Twelve seconds, because a feed that never forgets is a feed that is always in the way.

  Lines used to sit there until four more pushed them out, so a quiet server kept a corner of
  the screen spent on something that happened twenty minutes ago. With an expiry the panel is
  absent most of the time, which is the only real way for it not to cost screen.
*/
const FIL_MS = 12_000

function pushToFeed(ligne: string): void {
  theftView.fil.unshift({ t: ligne, jusqua: Date.now() + FIL_MS })
  if (theftView.fil.length > 4) theftView.fil.pop()
}

/** The lines still worth drawing, newest first, never more than three. */
export function filVisible(): string[] {
  const now = Date.now()
  const out: string[] = []
  for (const f of theftView.fil) {
    if (f.jusqua <= now) continue
    out.push(f.t)
    if (out.length === 3) break
  }
  return out
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
    console.log(`[CLIENT] thief penalty for ${d.ms} ms`)
  })

  room.onMessage('stolen', (d) => {
    theftView.stealing = false
    /*
      No victim's name, because it does not fit and it is the least useful word on the line.

      Measured against the panel: four hundred wide, sixteen of padding, eleven pixels a
      character at this size, so thirty-four characters. `Guest6621 took a Legendary from
      Guest5020` needs forty-one, which is why the three lines were spilling out of their own
      plate and over each other. Of the three things a line carries, WHO, WHAT and FROM WHOM,
      the third is the one a bystander needs least, and the one player who genuinely needs it
      is the victim, who already gets a full alert with a sound of their own.
    */
    pushToFeed(`${d.byName} stole a ${rarity(d.rarity).name}`)
  })
  room.onMessage('reclaimed', (d) => {
    pushToFeed(`${d.byName} took back a ${rarity(d.rarity).name}`)
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
    pushToFeed(`${d.byName} outbid a crate for ${d.price}`)
  })
  room.onMessage('gifted', (d) => {
    pushToFeed(`${d.byName} gifted a ${rarity(d.rarity).name}`)
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
    theftView.bestRarity = d.bestRarity
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
    /*
      Say what changed. It used to report the floor count, which prestige does not touch:
      the player was handed a number about the one thing that had stayed the same, at the
      exact moment they were trying to work out what they had just paid for.
    */
    alerter(`PRESTIGE ${d.prestige}  ·  INCOME x${d.multiplier} FOR GOOD`, '#f5a524', 6000)
    console.log(`[CLIENT] prestige ${d.prestige}, income x${d.multiplier}`)
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
    console.log(`[CLIENT] sold for ${d.gain}`)
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
export function lockBase(): void { envoyerOuAttendre(() => { void room.send('activateLock', {}) }) }
export function recover(): void { void room.send('reclaim', {}) }
export function doPrestige(): void { void room.send('rebirth', {}) }
export function buyFloorFor(): void { envoyerOuAttendre(() => { void room.send('buyFloor', {}) }) }
export function armSentry(tier = 0): void { envoyerOuAttendre(() => { void room.send('buySentry', { tier }) }) }
export function collectPending(): void { envoyerOuAttendre(() => { void room.send('collect', {}) }) }

let _adresse = ''
export function monAdresseClient(): string { return _adresse }
export function setAdresseClient(a: string): void { _adresse = a }
