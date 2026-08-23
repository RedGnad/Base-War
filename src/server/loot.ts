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

/** Valeur en pieces par seconde d'un objet pose, croissante avec la rarete. */
export const GAIN_PAR_SECONDE = [1, 3, 8, 20, 60]

/**
 * Repartition PAR BOITE, cote serveur uniquement.
 * Chaque ligne donne les poids des 5 raretes. Une boite chere ne garantit rien: elle
 * DEPLACE la distribution. C'est ce qui garde la revelation interessante a tous les prix.
 */
const POIDS_BOITE = [
  [78, 18,  3,  0.9, 0.1],   // simple
  [40, 42, 15,  2.7, 0.3],   // bonne
  [10, 34, 43, 12,   1.0],   // rare
  [ 2, 12, 36, 42,   8.0]    // epique
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
