
const POIDS = [60, 25, 10, 4, 1]
const TOTAL = POIDS.reduce((a, b) => a + b, 0)

export function rollRarity(): number {
  let n = Math.random() * TOTAL
  for (let i = 0; i < POIDS.length; i++) {
    n -= POIDS[i]
    if (n <= 0) return i
  }
  return 0
}

export { PRODUCTION_PER_RARITY as INCOME_PER_RARITY } from '../shared/economy'

/**
 * Every crate can reach EVERY rarity, top included.
 *
 * The previous table capped each crate two tiers above its own, which left rarity 6
 * unreachable from any crate: a seventh of the index was dead content, and a beginner
 * never even learned the top tiers existed.
 *
 * The reference runs ONE shared table for the whole server (wiki `Red Carpet`, weights
 * "extracted from the game files"): everyone sees Legendary and Secret go by, they simply
 * cannot afford them. Aggregated over its 80 items: Common 44.9%, Rare 24.6%, Epic 10.8%,
 * Legendary 0.99%, and the top tier at 0.011%. So the tail is thin but NEVER zero.
 *
 * Here a crate tier shifts the distribution instead of truncating it. Each row still peaks
 * on its own tier, and the tail keeps a one-in-ten-thousand chance at the top.
 */
const CRATE_WEIGHTS = [
  [55, 22,   6,   1.2,  0.20, 0.030, 0.004],  // Basic, peaks on Common
  [22, 55,  22,   6,    1.20, 0.200, 0.030],  // Good,  peaks on Uncommon
  [ 6, 22,  55,  22,    6.00, 1.200, 0.200],  // Rare,  peaks on Rare
  [ 1,  6,  22,  55,   22.00, 6.000, 1.200],  // Epic,  peaks on Epic
]

export function rollCrate(crateId: number): number {
  // Index by TIER, never by crate id: a themed crate keeps its tier's rarity odds, and
  // its id sits past the end of this table.
  const tier = crate(crateId).tier
  const poids = CRATE_WEIGHTS[Math.max(0, Math.min(tier, CRATE_WEIGHTS.length - 1))]
  const total = poids.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < poids.length; i++) {
    n -= poids[i]
    if (n <= 0) return i
  }
  return 0
}

/**
 * How often each crate shows up on the belt. Themed crates are rarer than their tier:
 * they are the reason to keep watching, and seeing one is meant to feel like an event.
 * Order matches CRATES: Basic, Good, Rare, Epic, Gold, Lava, Cursed.
 */
const POIDS_APPARITION = [50, 24, 10, 3, 8, 4, 1]

export function rollCrateTier(): number {
  const total = POIDS_APPARITION.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < POIDS_APPARITION.length; i++) {
    n -= POIDS_APPARITION[i]
    if (n <= 0) return i
  }
  return 0
}

import { crate, MUTATIONS } from '../shared/loot-table'

/**
 * A themed crate multiplies its own mutation's weight; every other weight is untouched,
 * so the tail stays reachable and a Lava Crate can still yield a Phantom.
 */
export function rollMutation(crateId = 0): number {
  const c = crate(crateId)
  const poids = MUTATIONS.map((m) => (c.theme === m.id ? m.poids * c.weight : m.poids))
  const total = poids.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < MUTATIONS.length; i++) {
    n -= poids[i]
    if (n <= 0) return MUTATIONS[i].id
  }
  return 0
}
