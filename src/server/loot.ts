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
 * Le bareme de production vit desormais dans `shared/economie.ts`, derive de la courbe
 * mesuree du genre. Il est reexporte ici pour ne pas casser les appelants, mais il n'y
 * a plus qu'UNE definition dans le depot: une table dupliquee finit toujours par
 * diverger, et on en avait TROIS (serveur, ui.tsx, client/plots.ts).
 */
export { PRODUCTION_RARETE as GAIN_PAR_SECONDE } from '../shared/economie'

/**
 * Repartition PAR BOITE, cote serveur uniquement.
 * Chaque ligne donne les poids des 5 raretes. Une boite chere ne garantit rien: elle
 * DEPLACE la distribution. C'est ce qui garde la revelation interessante a tous les prix.
 */
/** Sept raretes desormais. Les deux dernieres sont volontairement tres rares. */
/**
 * BORNEE: une boite de palier t ne sort que les raretes t-1 a t+2, centree sur t.
 * Sans borne, la queue de distribution domine tout: avec une production en x6,6, un
 * tirage a 0,002 % sur la derniere rarete vaut 82 654/s et rend, a lui seul, tout le
 * reste du jeu sans objet pour toujours. Le palier de la boite redevient ainsi une
 * DECISION d'achat et non un billet de loterie.
 * Poids par distance au centre: 55 / 22 / 6 / 1,2.
 */
const POIDS_BOITE = [
  [55, 22,   6,   0,    0,    0,    0   ],  // Basic : raretes 0-2
  [22, 55,  22,   6,    0,    0,    0   ],  // Good  : raretes 0-3
  [ 0,  6,  55,  22,    6,    0,    0   ],  // Rare  : raretes 1-4  (centre 2)
  [ 0,  0,   6,  55,   22,    6,    0   ],  // Epic  : raretes 2-5  (centre 3)
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
