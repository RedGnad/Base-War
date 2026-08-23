/**
 * Raretes: definitions PARTAGEES (le client doit savoir afficher une couleur et un nom).
 * Les POIDS DE TIRAGE ne sont PAS ici: ils vivent dans src/server/, hors du paquet client.
 * Un joueur qui lit le bundle ne doit pas pouvoir deduire ses chances.
 */
/**
 * La rarete doit se lire A DISTANCE et SANS TEXTE, comme chez le #1 ou la couleur suffit.
 * Quatre canaux qui ne coutent aucune ressource et survivent a n'importe quel theme:
 * la TAILLE, la couleur, l'INTENSITE emissive, et la ROTATION. Un legendaire se repere
 * de l'autre bout du lieu, c'est ce qui donne envie de traverser pour aller le prendre.
 */
export const RARITIES = [
  { id: 0, nom: 'Common',     couleur: '#9aa3ad', taille: 0.38, glow: 0.00, tours: 0 },
  { id: 1, nom: 'Uncommon', couleur: '#4ec04e', taille: 0.46, glow: 0.25, tours: 0 },
  { id: 2, nom: 'Rare',       couleur: '#3d8ef0', taille: 0.55, glow: 0.55, tours: 25 },
  { id: 3, nom: 'Epic',     couleur: '#a855f7', taille: 0.66, glow: 0.95, tours: 45 },
  { id: 4, nom: 'Legendary', couleur: '#f5a524', taille: 0.80, glow: 1.60, tours: 80 }
] as const

export function rarity(id: number) {
  return RARITIES[id] ?? RARITIES[0]
}

/**
 * LES BOITES. On achete du HASARD, pas un objet connu: c'est ce qui rend l'achat
 * excitant plutot qu'arithmetique, et c'est la boucle validee par `Unbox ASMR`
 * (10 205 joueurs simultanes, 97 % d'approbation, boucle entiere = ouvrir des boites).
 *
 * Chaque boite a sa propre repartition. Les POIDS ne sont PAS ici: ils vivent cote
 * serveur, comme le tirage. Le client ne connait que le nom, le prix et la couleur.
 */
export const BOITES = [
  { id: 0, nom: 'Basic Crate', prix: 60,    couleur: '#9aa3ad', taille: 0.55 },
  { id: 1, nom: 'Good Crate',  prix: 500,   couleur: '#4ec04e', taille: 0.62 },
  { id: 2, nom: 'Rare Crate',   prix: 4000,  couleur: '#3d8ef0', taille: 0.70 },
  { id: 3, nom: 'Epic Crate', prix: 32000, couleur: '#a855f7', taille: 0.80 }
] as const

export function boite(id: number) {
  return BOITES[Math.max(0, Math.min(id, BOITES.length - 1))]
}
