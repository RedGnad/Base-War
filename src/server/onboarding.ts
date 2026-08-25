import { room } from '../shared/messages'
import { log } from './log'
import {
  addCrate, cratesOf, etapeTuto, avancerTuto,
  tempsJoue, ajouterTempsJoue, cadeauPris, marquerCadeauPris
} from './plots'

export const ETAPES = [
  'Place your base',
  'Open your crate',
  'Collect your coins',
  'Buy a crate from the belt',
  'Leave a gift on another base'
] as const

/**
 * Ten minutes, not fifteen.
 *
 * The bar showing it is what changed the calculation: a wait nobody could see had to be long
 * enough to be worth the surprise, and a wait somebody watches fill is doing its work the
 * whole time. Ten puts the payoff inside a first real session rather than just beyond it.
 */
export const CADEAU_MS = 10 * 60_000
export const GIFT_CRATE = 2

/**
 * Seconds accrued this session, not yet folded into the player's profile.
 *
 * The total lives on the profile, because the platform stops the server two minutes after
 * the venue empties and anything held here dies with it. But folding every second would
 * mark the profile dirty every second, and storage writes are capped: the excess fails
 * silently. So the session accrues here and is folded once a minute, and on the way out.
 * A hard shutdown costs at most the last minute.
 */
const sessionS = new Map<string, number>()
const REPLI_S = 60

export function pousserTuto(address: string): void {
  const e = etapeTuto(address)
  void room.send('tutorial', { etape: e, total: ETAPES.length }, { to: [address] })
}

export function tutoFait(address: string, etape: number): void {
  if (etapeTuto(address) !== etape) return
  avancerTuto(address)
  pousserTuto(address)
}

export function arrivee(address: string): void {
  sessionS.set(address, 0)
  pousserTuto(address)
}

export function depart(address: string): void {
  replier(address)
  sessionS.delete(address)
}

/** Move this session's accrual onto the profile, where it survives the server. */
function replier(address: string): void {
  const s = sessionS.get(address) ?? 0
  if (s <= 0) return
  ajouterTempsJoue(address, s)
  sessionS.set(address, 0)
}

/**
 * Called once a second for every player in the scene.
 *
 * The threshold is read against the profile total plus this session, so fifteen minutes
 * means fifteen minutes of playing, not fifteen minutes of one server happening to stay
 * up. The flag is on the profile too, so the crate is given once and once only.
 */
/**
 * Tell them how long is left, because the waiting IS the reward being built.
 *
 * The crate for fifteen minutes of play arrived out of nowhere: nothing on screen said it was
 * coming, so the game spent fifteen minutes of a player's attention and got a surprise out of
 * it instead of an anticipation. Work on progress indicators is blunt about which is worth
 * more: an unfinished bar reads to the brain as something to be finished, and it keeps
 * reading that way every time the player glances at it.
 *
 * Sent every five seconds rather than every one: the number moves slowly enough that nobody
 * can tell, and a per-second broadcast to everybody present is a lot of traffic for a clock.
 */
export function verifierCadeau(presents: Iterable<string>): void {
  for (const a of presents) {
    const s = (sessionS.get(a) ?? 0) + 1
    sessionS.set(a, s)
    if (s >= REPLI_S) replier(a)

    const total = Math.round(CADEAU_MS / 1000)
    if (s % 5 === 0 || s === 1) {
      const reste = cadeauPris(a) ? -1 : Math.max(0, total - (tempsJoue(a) + s))
      void room.send('giftProgress', { leftS: reste, totalS: total }, { to: [a] })
    }

    if (cadeauPris(a)) continue
    if (tempsJoue(a) + (sessionS.get(a) ?? 0) < CADEAU_MS / 1000) continue
    replier(a)
    marquerCadeauPris(a)
    addCrate(a, GIFT_CRATE)
    void room.send('inventory', { crates: cratesOf(a) }, { to: [a] })
    void room.send('timeGift', { crate: GIFT_CRATE, minutes: Math.round(CADEAU_MS / 60000) }, { to: [a] })
    log(`welcome crate for ${a.slice(0, 8)} after ${Math.round(tempsJoue(a) / 60)} min played`)
  }
}
