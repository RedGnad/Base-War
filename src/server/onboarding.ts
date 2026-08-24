import { room } from '../shared/messages'
import { jour } from './journal'
import { ajouterBoite, boitesDe, etapeTuto, avancerTuto } from './plots'

/**
 * TUTORIEL ET CADEAU DES 15 MINUTES.
 *
 * Source, les deux dans la meme liste de retention: *« on a ameliore l'onboarding en
 * optimisant chaque etape »* et un cadeau *« pour faire en sorte que les gens se
 * reconnectent le premier jour »*.
 *
 * Le tutoriel n'est PAS un texte a lire: c'est un compteur d'etapes que le SERVEUR
 * avance quand l'action a REELLEMENT eu lieu. Un tutoriel qu'on peut passer sans agir
 * n'enseigne rien, et un tutoriel qui se fie au client peut etre saute.
 */

export const ETAPES = [
  'Place your base',
  'Open your crate',
  'Collect your coins',
  'Buy a crate from the belt',
  'Finish a training set'
] as const

/** 15 minutes de presence CONTINUE, comptees par le serveur. */
export const CADEAU_MS = 15 * 60_000
export const CADEAU_BOITE = 2

const entreA = new Map<string, number>()
const cadeauDonne = new Set<string>()

export function pousserTuto(address: string): void {
  const e = etapeTuto(address)
  void room.send('tutorial', { etape: e, total: ETAPES.length }, { to: [address] })
}

/** Avance le tutoriel SI l'action correspond a l'etape en cours, puis previent. */
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
  // Le compteur repart de zero: le cadeau recompense une SESSION de 15 minutes, pas
  // quinze minutes cumulees sur trois jours. C'est le temps de jeu moyen qui est vise.
  entreA.delete(address)
}

/** Appele une fois par seconde par la boucle de presence. */
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
