import { room } from '../shared/messages'
import { log } from './log'
import { addCrate, cratesOf, etapeTuto, avancerTuto } from './plots'

export const ETAPES = [
  'Place your base',
  'Open your crate',
  'Collect your coins',
  'Buy a crate from the belt',
  'Leave a gift on another base'
] as const

export const CADEAU_MS = 15 * 60_000
export const GIFT_CRATE = 2

const entreA = new Map<string, number>()
const giftGiven = new Set<string>()

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
  entreA.set(address, Date.now())
  pousserTuto(address)
}

export function depart(address: string): void {
  entreA.delete(address)
}

export function verifierCadeau(presents: Iterable<string>): void {
  const maintenant = Date.now()
  for (const a of presents) {
    if (giftGiven.has(a)) continue
    const t = entreA.get(a)
    if (t === undefined || maintenant - t < CADEAU_MS) continue
    giftGiven.add(a)
    addCrate(a, GIFT_CRATE)
    void room.send('inventory', { crates: cratesOf(a) }, { to: [a] })
    void room.send('timeGift', { crate: GIFT_CRATE, minutes: Math.round(CADEAU_MS / 60000) }, { to: [a] })
    log(`15-minute gift for ${a.slice(0, 8)}`)
  }
}
