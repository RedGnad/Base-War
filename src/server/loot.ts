/**
 * TIRAGE COTE SERVEUR UNIQUEMENT.
 * Ce fichier n'est importe que depuis la branche serveur: les poids ne partent jamais
 * au client. Le client envoie "j'ai tape", jamais "j'ai obtenu". Toute autre repartition
 * du travail rend le tirage triche-able.
 */

/** Poids relatifs. Somme = 100 pour se lire comme des pourcentages. */
const POIDS = [60, 25, 10, 4, 1]
const TOTAL = POIDS.reduce((a, b) => a + b, 0)

/**
 * Math.random() est disponible dans le runtime de scene (contrairement aux scripts de
 * workflow). Le serveur est la seule autorite: aucun client ne peut rejouer le tirage.
 */
export function rollRarity(): number {
  let n = Math.random() * TOTAL
  for (let i = 0; i < POIDS.length; i++) {
    n -= POIDS[i]
    if (n <= 0) return i
  }
  return 0
}

/**
 * Revenu par objet et par seconde. Progression x4 par palier de rarete.
 *
 * Les PRIX des boites progressent x8, donc PLUS VITE que le revenu: le temps pour
 * s'offrir la boite du palier suivant AUGMENTE (10 s, puis 21, puis 42). Sans cet ecart,
 * la progression se trivialise. Mesure du 24 Aug qui a impose la refonte: avec des
 * valeurs lineaires, une base pleine produisait 2 400 pieces/s contre une boite a 2 600,
 * soit une boite epique par seconde sans rien faire.
 */
export const GAIN_PAR_SECONDE = [1, 4, 16, 64, 256, 1024, 4096]

/**
 * Repartition PAR BOITE, cote serveur uniquement.
 * Chaque ligne donne les poids des 5 raretes. Une boite chere ne garantit rien: elle
 * DEPLACE la distribution. C'est ce qui garde la revelation interessante a tous les prix.
 */
/** Sept raretes desormais. Les deux dernieres sont volontairement tres rares. */
const POIDS_BOITE = [
  [78, 18,   3,   0.9,  0.1,  0.02, 0.002],  // Basic
  [40, 42,  15,   2.7,  0.3,  0.06, 0.006],  // Good
  [10, 34,  43,  12,    1.0,  0.20, 0.020],  // Rare
  [ 2, 12,  36,  42,    8.0,  0.90, 0.090],  // Epic
]

export function rollBoite(idBoite: number): number {
  const poids = POIDS_BOITE[Math.max(0, Math.min(idBoite, POIDS_BOITE.length - 1))]
  const total = poids.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < poids.length; i++) {
    n -= poids[i]
    if (n <= 0) return i
  }
  return 0
}

/** Poids d'apparition des boites sur le tapis: les cheres sont plus rares. */
const POIDS_APPARITION = [55, 28, 13, 4]

export function rollTypeBoite(): number {
  const total = POIDS_APPARITION.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < POIDS_APPARITION.length; i++) {
    n -= POIDS_APPARITION[i]
    if (n <= 0) return i
  }
  return 0
}

/**
 * TIRAGE DE LA MUTATION, independant de la rarete.
 * Deux tirages separes: c'est ce qui cree la surprise composee (« un Rare... DORE ! »)
 * et qui multiplie la table d'objets par 14 sans un seul maillage de plus.
 * Poids releves sur la page `Mutations`: Gold est la plus commune, Phantom la plus rare.
 */
import { MUTATIONS } from '../shared/loot-table'

export function rollMutation(): number {
  const total = MUTATIONS.reduce((a, m) => a + m.poids, 0)
  let n = Math.random() * total
  for (const m of MUTATIONS) {
    n -= m.poids
    if (n <= 0) return m.id
  }
  return 0
}
