/**
 * QUETES QUOTIDIENNES.
 *
 * Source: Aywen les cite comme l'un des quatre leviers de retention jour 7, a cote du
 * tutoriel, du starter pack et des recompenses de connexion. Le memo les portait en
 * `[A FAIRE]` depuis le 23 Aug.
 *
 * DEUX REGLES DE CONCEPTION, tenues:
 *
 * 1. TOUTES SONT REALISABLES SEUL. Aucune quete ne depend d'un autre joueur. Une quete
 *    « vole 2 objets » serait morte pour un juge qui visite seul pendant sa fenetre de
 *    notation, et morte pour le tout premier joueur du monde. Le vol reste recompense
 *    par son butin, il n'a pas besoin d'une quete par-dessus.
 *
 * 2. LA RECOMPENSE EST SUR LA MEME ECHELLE QUE LE CALENDRIER 7 JOURS. Une quete du jour
 *    paie une boite de type 1, exactement ce que paient les jours 3 et 4 du calendrier;
 *    les trois d'affilee paient une boite de type 2, comme les jours 5 et 6. Les deux
 *    systemes de retention versent donc dans la meme monnaie et au meme rythme, au lieu
 *    de deux baremes inventes separement.
 */

export type TypeQuete =
  | 'ouvrir'      // ouvrir une boite, quel que soit son type
  | 'ouvrirRare'  // ouvrir une boite de type 1 ou mieux
  | 'acheter'     // acheter une boite sur le tapis
  | 'collecter'   // encaisser sa reserve
  | 'vendre'      // revendre un objet
  | 'poser'       // poser un objet sur sa base
  | 'banquer'     // total de pieces encaissees dans la journee

export type Quete = { type: TypeQuete; cible: number; texte: string }

/** Sept quetes; trois sont tirees chaque jour. */
export const QUETES: readonly Quete[] = [
  { type: 'ouvrir',     cible: 4,    texte: 'Open 4 crates' },
  { type: 'acheter',    cible: 3,    texte: 'Buy 3 crates from the belt' },
  { type: 'collecter',  cible: 5,    texte: 'Collect your income 5 times' },
  { type: 'vendre',     cible: 3,    texte: 'Sell 3 items' },
  { type: 'poser',      cible: 6,    texte: 'Place 6 items on your base' },
  { type: 'banquer',    cible: 2000, texte: 'Bank 2,000 coins' },
  { type: 'ouvrirRare', cible: 2,    texte: 'Open 2 uncommon crates or better' }
]

/** Boite payee par une quete, et bonus si les trois sont finies. */
export const QUETE_BOITE = 1
export const QUETE_BONUS_BOITE = 2

/**
 * Les trois quetes du jour, IDENTIQUES POUR TOUS.
 * Un tirage par joueur ferait de chaque quete une conversation privee; un tirage commun
 * donne le meme objectif a tout le monde le meme jour, ce qui se compare et se raconte.
 * Le pas de 2 sur 7 entrees garantit trois indices distincts.
 */
export function quetesDuJour(jourCle: number): number[] {
  const k = ((jourCle % QUETES.length) + QUETES.length) % QUETES.length
  return [k, (k + 2) % QUETES.length, (k + 4) % QUETES.length]
}
