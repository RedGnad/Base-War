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
  { id: 0, nom: 'Common',    couleur: '#9aa3ad', taille: 0.38, glow: 0.00, tours: 0 },
  { id: 1, nom: 'Uncommon',  couleur: '#4ec04e', taille: 0.45, glow: 0.25, tours: 0 },
  { id: 2, nom: 'Rare',      couleur: '#3d8ef0', taille: 0.52, glow: 0.55, tours: 20 },
  { id: 3, nom: 'Epic',      couleur: '#a855f7', taille: 0.60, glow: 0.95, tours: 35 },
  { id: 4, nom: 'Legendary', couleur: '#f5a524', taille: 0.68, glow: 1.50, tours: 55 },
  { id: 5, nom: 'Mythic',    couleur: '#ff4d6d', taille: 0.78, glow: 2.20, tours: 80 },
  { id: 6, nom: 'Secret',    couleur: '#e8e8f0', taille: 0.90, glow: 3.20, tours: 120 }
] as const

export function rarity(id: number) {
  return RARITIES[id] ?? RARITIES[0]
}

/**
 * LES MUTATIONS. C'est ce qui donne au jeu sa profondeur, et ca ne coute presque rien:
 * un objet mute est **le meme maillage avec un autre materiau**.
 *
 * Notre budget mesure est de 47 textures pour 250 000 triangles: la geometrie est
 * abondante, la texture est rare. Les mutations tombent exactement du bon cote.
 *
 * Multiplicateurs et noms releves sur la page `Mutations` du wiki de la reference.
 * Sept raretes x quatorze mutations = **98 valeurs d'objets distinctes**, contre 5 avant.
 * C'est ce qui fait passer la duree de vie du contenu de 19 minutes a plusieurs heures.
 */
export const MUTATIONS = [
  { id: 0,  nom: '',            mult: 1,    couleur: '',        poids: 1000 },
  { id: 1,  nom: 'Gold',        mult: 1.25, couleur: '#ffd700', poids: 220 },
  { id: 2,  nom: 'Diamond',     mult: 1.5,  couleur: '#b9f2ff', poids: 120 },
  { id: 3,  nom: 'Bloodrot',    mult: 2,    couleur: '#8b0000', poids: 70 },
  { id: 4,  nom: 'Candy',       mult: 4,    couleur: '#ff9ecd', poids: 34 },
  { id: 5,  nom: 'Lava',        mult: 6,    couleur: '#ff5722', poids: 20 },
  { id: 6,  nom: 'Galaxy',      mult: 7,    couleur: '#5b2c8d', poids: 14 },
  { id: 7,  nom: 'Yin Yang',    mult: 7.5,  couleur: '#dcdcdc', poids: 11 },
  { id: 8,  nom: 'Radioactive', mult: 8.5,  couleur: '#7fff00', poids: 8 },
  { id: 9,  nom: 'Cursed',      mult: 9,    couleur: '#3b0a45', poids: 6 },
  { id: 10, nom: 'Divine',      mult: 10,   couleur: '#fff8dc', poids: 4 },
  { id: 11, nom: 'Rainbow',     mult: 10,   couleur: '#ff00ff', poids: 3 },
  { id: 12, nom: 'Cyber',       mult: 11,   couleur: '#00e5ff', poids: 2 },
  { id: 13, nom: 'Phantom',     mult: 12,   couleur: '#9e9e9e', poids: 1 }
] as const

export function mutation(id: number) {
  return MUTATIONS[Math.max(0, Math.min(id, MUTATIONS.length - 1))]
}

/** Nom complet: « Gold Epic », ou « Epic » si l'objet n'est pas mute. */
export function nomObjet(rarete: number, mut: number): string {
  const m = mutation(mut)
  return m.nom === '' ? rarity(rarete).nom : `${m.nom} ${rarity(rarete).nom}`
}

/** Couleur affichee: la mutation domine quand il y en a une, sinon la rarete. */
export function couleurObjet(rarete: number, mut: number): string {
  const m = mutation(mut)
  return m.couleur === '' ? rarity(rarete).couleur : m.couleur
}

/**
 * LES BOITES. On achete du HASARD, pas un objet connu: c'est ce qui rend l'achat
 * excitant plutot qu'arithmetique, et c'est la boucle validee par `Unbox ASMR`
 * (10 205 joueurs simultanes, 97 % d'approbation, boucle entiere = ouvrir des boites).
 *
 * Chaque boite a sa propre repartition. Les POIDS ne sont PAS ici: ils vivent cote
 * serveur, comme le tirage. Le client ne connait que le nom, le prix et la couleur.
 */
/**
 * PRIX x4, EXACTEMENT COMME LE REVENU x4.
 *
 * Principe tycoon: le TEMPS DE RETOUR d'un achat doit rester CONSTANT. Si le prix croit
 * plus vite que le revenu, acheter mieux devient de moins en moins rentable, et c'est
 * exactement la sensation de grind.
 *
 * Mes prix precedents croissaient en x8 contre un revenu en x4:
 *   Basic  60 ->   1/s : 60 s de retour
 *   Good  500 ->   4/s : 125 s
 *   Rare 4000 ->  16/s : 250 s
 *   Epic 32000 -> 64/s : 500 s      <- chaque palier DOUBLAIT l'attente
 *
 * Corrige, chaque boite se rembourse en 60 s, quel que soit son palier.
 * La progression vient du CUMUL (emplacements, multiplicateurs), pas de la degradation
 * de chaque achat.
 */
export const BOITES = [
  { id: 0, nom: 'Basic Crate', prix: 60,   couleur: '#9aa3ad', taille: 0.55 },
  { id: 1, nom: 'Good Crate',  prix: 240,  couleur: '#4ec04e', taille: 0.62 },
  { id: 2, nom: 'Rare Crate',  prix: 960,  couleur: '#3d8ef0', taille: 0.70 },
  { id: 3, nom: 'Epic Crate',  prix: 3840, couleur: '#a855f7', taille: 0.80 }
] as const

export function boite(id: number) {
  return BOITES[Math.max(0, Math.min(id, BOITES.length - 1))]
}

/**
 * ENCODAGE D'UN OBJET dans un seul entier: `rarete * 100 + mutation`.
 * Permet de garder `Schemas.Array(Schemas.Int)` pour les objets d'une base, donc aucune
 * migration de schema synchronise, et un seul champ a transporter au lieu de deux.
 */
export function encoder(rarete: number, mut: number): number {
  return rarete * 100 + mut
}
export function rareteDe(code: number): number { return Math.floor(code / 100) }
export function mutationDe(code: number): number { return code % 100 }

/** Revenu par seconde d'un objet encode: rarete x mutation. */
export function revenuObjet(code: number, gains: readonly number[]): number {
  return (gains[rareteDe(code)] ?? 1) * mutation(mutationDe(code)).mult
}

/**
 * Affiche un revenu de facon lisible A TOUTES LES ECHELLES.
 * Arrondir a l'entier rendait les mutations INVISIBLES en bas de table: un Gold Common
 * vaut 1,25/s et s'affichait « 1 », donc identique a un Common nu. Le joueur ne pouvait
 * pas comprendre ce qu'il venait d'obtenir.
 */
export function formatRevenu(v: number): string {
  if (v < 10) return v.toFixed(2).replace(/\.?0+$/, '')
  if (v < 1000) return Math.round(v).toString()
  if (v < 1e6) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
}
