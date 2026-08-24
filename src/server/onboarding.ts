import { room } from '../shared/messages'
import { jour } from './journal'
import { ajouterBoite, boitesDe, etapeTuto, avancerTuto } from './plots'

export const ETAPES = [
  'Place your base',
  'Open your crate',
  'Collect your coins',
  'Buy a crate from the belt',
  'Leave a gift on another base'
] as const

export const CADEAU_MS = 15 * 60_000
export const CADEAU_BOITE = 2

const entreA = new Map<string, number>()
const cadeauDonne = new Set<string>()

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
    if (cadeauDonne.has(a)) continue
    const t = entreA.get(a)
    if (t === undefined || maintenant - t < CADEAU_MS) continue
    cadeauDonne.add(a)
    ajouterBoite(a, CADEAU_BOITE)
    void room.send('inventory', { boites: boitesDe(a) }, { to: [a] })
    void room.send('timeGift', { boite: CADEAU_BOITE, minutes: Math.round(CADEAU_MS / 60000) }, { to: [a] })
    jour(`cadeau des 15 minutes pour ${a.slice(0, 8)}`)
  }
}
