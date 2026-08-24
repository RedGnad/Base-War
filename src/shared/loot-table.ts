import { CRATE_PRICE } from './economy'
export const RARITIES = [
  { id: 0, name: 'Common',    color: '#9aa3ad', size: 0.38, glow: 0.00, tours: 0 },
  { id: 1, name: 'Uncommon',  color: '#4ec04e', size: 0.45, glow: 0.25, tours: 0 },
  { id: 2, name: 'Rare',      color: '#3d8ef0', size: 0.52, glow: 0.55, tours: 20 },
  { id: 3, name: 'Epic',      color: '#a855f7', size: 0.60, glow: 0.95, tours: 35 },
  { id: 4, name: 'Legendary', color: '#f5a524', size: 0.68, glow: 1.50, tours: 55 },
  { id: 5, name: 'Mythic',    color: '#ff4d6d', size: 0.78, glow: 2.20, tours: 80 },
  { id: 6, name: 'Secret',    color: '#e8e8f0', size: 0.90, glow: 3.20, tours: 120 }
] as const

export function rarity(id: number) {
  return RARITIES[id] ?? RARITIES[0]
}

export const MUTATIONS = [
  { id: 0,  name: '',            mult: 1,    color: '',        poids: 1000 },
  { id: 1,  name: 'Gold',        mult: 1.25, color: '#ffd700', poids: 220 },
  { id: 2,  name: 'Diamond',     mult: 1.5,  color: '#b9f2ff', poids: 120 },
  { id: 3,  name: 'Blood',       mult: 2,    color: '#8b0000', poids: 70 },
  { id: 4,  name: 'Candy',       mult: 4,    color: '#ff9ecd', poids: 34 },
  { id: 5,  name: 'Lava',        mult: 6,    color: '#ff5722', poids: 20 },
  { id: 6,  name: 'Galaxy',      mult: 7,    color: '#5b2c8d', poids: 14 },
  { id: 7,  name: 'Yin Yang',    mult: 7.5,  color: '#dcdcdc', poids: 11 },
  { id: 8,  name: 'Radioactive', mult: 8.5,  color: '#7fff00', poids: 8 },
  { id: 9,  name: 'Cursed',      mult: 9,    color: '#3b0a45', poids: 6 },
  { id: 10, name: 'Divine',      mult: 10,   color: '#fff8dc', poids: 4 },
  { id: 11, name: 'Rainbow',     mult: 10,   color: '#ff00ff', poids: 3 },
  { id: 12, name: 'Cyber',       mult: 11,   color: '#00e5ff', poids: 2 },
  { id: 13, name: 'Phantom',     mult: 12,   color: '#9e9e9e', poids: 1 }
] as const

export function mutation(id: number) {
  return MUTATIONS[Math.max(0, Math.min(id, MUTATIONS.length - 1))]
}

export function itemName(rarityId: number, mut: number): string {
  const m = mutation(mut)
  return m.name === '' ? rarity(rarityId).name : `${m.name} ${rarity(rarityId).name}`
}

/**
 * Two families of crate, and they bet on different things.
 *
 * TIER crates shift the RARITY roll: Basic through Epic.
 * THEMED crates keep their tier's rarity odds but load the MUTATION roll instead. A Lava
 * Crate is no likelier to yield a Legendary; it is far likelier to yield a Lava, which
 * multiplies income by 6.
 *
 * `theme` is a mutation id, or -1 for none. `weight` is how hard that mutation's odds are
 * pushed. Prices are DERIVED from the resulting expected multiplier against a plain roll
 * (x1.492), not chosen:
 *
 *   Gold   x12  -> 67% Gold, expectation x1.34  = 0.90x  -> cheaper than its tier
 *   Lava   x60  -> 45% Lava, expectation x3.47  = 2.32x
 *   Cursed x180 -> 42% Cursed, expectation x4.61 = 3.09x
 *
 * Gold LOWERS the expectation, because a x1.25 mutation crowds out the rare ones. That is
 * the point: it is the reliable, cheap product, not a weaker version of the others.
 *
 * Every container is a Crate. The genre does not agree on one word, and games in it ship
 * cases, crates and boxes alike, but none of them uses two words for the same object. The
 * tier names reusing rarity words is deliberate and is what the genre does: a Rare Crate
 * lands on Rare 55% of the time, so the name is a fair description of the odds.
 */
export const CRATES = [
  { id: 0, name: 'Basic Crate',  tier: 0, theme: -1, weight: 0,   price: CRATE_PRICE[0],                     color: '#9aa3ad', size: 0.55 },
  { id: 1, name: 'Good Crate',   tier: 1, theme: -1, weight: 0,   price: CRATE_PRICE[1],                     color: '#4ec04e', size: 0.62 },
  { id: 2, name: 'Rare Crate',   tier: 2, theme: -1, weight: 0,   price: CRATE_PRICE[2],                     color: '#3d8ef0', size: 0.70 },
  { id: 3, name: 'Epic Crate',   tier: 3, theme: -1, weight: 0,   price: CRATE_PRICE[3],                     color: '#a855f7', size: 0.80 },
  { id: 4, name: 'Gold Crate',   tier: 1, theme: 1,  weight: 12,  price: Math.round(CRATE_PRICE[1] * 0.90),  color: '#ffd700', size: 0.66 },
  { id: 5, name: 'Lava Crate',   tier: 2, theme: 5,  weight: 60,  price: Math.round(CRATE_PRICE[2] * 2.32),  color: '#ff5722', size: 0.74 },
  { id: 6, name: 'Cursed Crate', tier: 3, theme: 9,  weight: 180, price: Math.round(CRATE_PRICE[3] * 3.09),  color: '#3b0a45', size: 0.86 }
] as const

export function itemColor(rarityId: number, mut: number): string {
  const m = mutation(mut)
  return m.color === '' ? rarity(rarityId).color : m.color
}

export function crate(id: number) {
  return CRATES[Math.max(0, Math.min(id, CRATES.length - 1))]
}

export function encoder(rarity: number, mut: number): number {
  return rarity * 100 + mut
}
export function rarityOf(code: number): number { return Math.floor(code / 100) }
export function mutationDe(code: number): number { return code % 100 }

export function itemIncome(code: number, incomeTable: readonly number[]): number {
  return (incomeTable[rarityOf(code)] ?? 1) * mutation(mutationDe(code)).mult
}

export function formatIncome(v: number): string {
  if (v < 10) return v.toFixed(2).replace(/\.?0+$/, '')
  if (v < 1000) return Math.round(v).toString()
  if (v < 1e6) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
}
