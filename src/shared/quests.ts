/**
 * QUETES QUOTIDIENNES.
 *
 * Source: Aywen les cite comme l'un des quatre leviers de retention jour 7, a cote du
 * tutoriel, du starter pack et des recompenses de connexion. Le memo les portait en
 * `[A FAIRE]` depuis le 23 Aug.
 *
 * DEUX REGLES DE CONCEPTION, tenues:
 *
 * 1. TOUTES SONT REALISABLES AVEC LES AUTRES JOUEURS ABSENTS. Une quete « vole 2 objets »
 *    exigerait une victime CONNECTEE et serait morte pour un juge qui visite seul. Le don,
 *    lui, se fait sur la base d'un absent: il est donc realisable a tout moment, et c'est
 *    le seul acte social qui le soit sans dependre de personne.
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
  | 'offrir'      // objets laisses sur la base d'un autre joueur
  | 'racheter'    // convois rachetes a un autre joueur en cours de route

export type Quete = { type: TypeQuete; cible: number; texte: string }

/** Sept quetes; trois sont tirees chaque jour. */
export const QUETES: readonly Quete[] = [
  { type: 'ouvrir',     cible: 4,    texte: 'Open 4 crates' },
  { type: 'acheter',    cible: 3,    texte: 'Buy 3 crates from the belt' },
  { type: 'collecter',  cible: 5,    texte: 'Collect your income 5 times' },
  { type: 'vendre',     cible: 3,    texte: 'Sell 3 items' },
  { type: 'poser',      cible: 6,    texte: 'Place 6 items on your base' },
  { type: 'banquer',    cible: 2000, texte: 'Bank 2,000 coins' },
  { type: 'ouvrirRare', cible: 2,    texte: 'Open 2 uncommon crates or better' },
  { type: 'offrir',     cible: 1,    texte: 'Leave an item on someone else\'s base' },
  { type: 'racheter',   cible: 1,    texte: 'Outbid a crate on its way to another base' }
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
