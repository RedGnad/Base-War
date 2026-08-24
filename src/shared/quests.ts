
export type QuestType =
  | 'ouvrir'      // open any crate
  | 'ouvrirRare'  // ouvrir une crate de type 1 ou mieux
  | 'acheter'     // buy a crate from the belt
  | 'collectPending'   // encaisser sa pending
  | 'vendre'      // sell un item
  | 'poser'       // place an item on your base
  | 'bank'     // total de pieces encaissees dans la journee
  | 'gift'      // items left on another player's base
  | 'outbid'    // convoys rachetes a un autre joueur en cours de route

export type Quest = { type: QuestType; cible: number; texte: string }

export const QUESTS: readonly Quest[] = [
  { type: 'ouvrir',     cible: 4,    texte: 'Open 4 crates' },
  { type: 'acheter',    cible: 3,    texte: 'Buy 3 crates from the belt' },
  { type: 'collectPending',  cible: 5,    texte: 'Collect your income 5 times' },
  { type: 'vendre',     cible: 3,    texte: 'Sell 3 items' },
  { type: 'poser',      cible: 6,    texte: 'Place 6 items on your base' },
  { type: 'bank',    cible: 2000, texte: 'Bank 2,000 coins' },
  { type: 'ouvrirRare', cible: 2,    texte: 'Open 2 uncommon crates or better' },
  { type: 'gift',     cible: 1,    texte: 'Leave an item on someone else\'s base' },
  { type: 'outbid',   cible: 1,    texte: 'Outbid a crate on its way to another base' }
]

export const QUEST_CRATE = 1
export const QUEST_BONUS_CRATE = 2

export function questsOfDay(dayKey: number): number[] {
  const k = ((dayKey % QUESTS.length) + QUESTS.length) % QUESTS.length
  return [k, (k + 2) % QUESTS.length, (k + 4) % QUESTS.length]
}
