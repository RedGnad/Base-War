/**
 * Raretes: definitions PARTAGEES (le client doit savoir afficher une couleur et un nom).
 * Les POIDS DE TIRAGE ne sont PAS ici: ils vivent dans src/server/, hors du paquet client.
 * Un joueur qui lit le bundle ne doit pas pouvoir deduire ses chances.
 */
export const RARITIES = [
  { id: 0, nom: 'Commun', couleur: '#b0b8c0' },
  { id: 1, nom: 'Peu commun', couleur: '#4ec04e' },
  { id: 2, nom: 'Rare', couleur: '#3d8ef0' },
  { id: 3, nom: 'Epique', couleur: '#a855f7' },
  { id: 4, nom: 'Legendaire', couleur: '#f5a524' }
] as const

export function rarity(id: number) {
  return RARITIES[id] ?? RARITIES[0]
}
