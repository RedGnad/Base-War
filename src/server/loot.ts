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
