
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

export const QUETE_BOITE = 1
export const QUETE_BONUS_BOITE = 2

export function quetesDuJour(jourCle: number): number[] {
  const k = ((jourCle % QUETES.length) + QUETES.length) % QUETES.length
  return [k, (k + 2) % QUETES.length, (k + 4) % QUETES.length]
}
