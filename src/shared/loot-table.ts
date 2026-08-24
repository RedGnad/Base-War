import { PRIX_BOITE } from './economie'
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

export const MUTATIONS = [
  { id: 0,  nom: '',            mult: 1,    couleur: '',        poids: 1000 },
  { id: 1,  nom: 'Gold',        mult: 1.25, couleur: '#ffd700', poids: 220 },
  { id: 2,  nom: 'Diamond',     mult: 1.5,  couleur: '#b9f2ff', poids: 120 },
  { id: 3,  nom: 'Blood',       mult: 2,    couleur: '#8b0000', poids: 70 },
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

export function nomObjet(rarete: number, mut: number): string {
  const m = mutation(mut)
  return m.nom === '' ? rarity(rarete).nom : `${m.nom} ${rarity(rarete).nom}`
}

export const BOITES = [
  { id: 0, nom: 'Basic Crate', prix: PRIX_BOITE[0], couleur: '#9aa3ad', taille: 0.55 },
  { id: 1, nom: 'Good Crate',  prix: PRIX_BOITE[1], couleur: '#4ec04e', taille: 0.62 },
  { id: 2, nom: 'Rare Crate',  prix: PRIX_BOITE[2], couleur: '#3d8ef0', taille: 0.70 },
  { id: 3, nom: 'Epic Crate',  prix: PRIX_BOITE[3], couleur: '#a855f7', taille: 0.80 }
] as const

export function couleurObjet(rarete: number, mut: number): string {
  const m = mutation(mut)
  return m.couleur === '' ? rarity(rarete).couleur : m.couleur
}

export function boite(id: number) {
  return BOITES[Math.max(0, Math.min(id, BOITES.length - 1))]
}

export function encoder(rarete: number, mut: number): number {
  return rarete * 100 + mut
}
export function rareteDe(code: number): number { return Math.floor(code / 100) }
export function mutationDe(code: number): number { return code % 100 }

export function revenuObjet(code: number, gains: readonly number[]): number {
  return (gains[rareteDe(code)] ?? 1) * mutation(mutationDe(code)).mult
}

export function formatRevenu(v: number): string {
  if (v < 10) return v.toFixed(2).replace(/\.?0+$/, '')
  if (v < 1000) return Math.round(v).toString()
  if (v < 1e6) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
}
