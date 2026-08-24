
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

const CRATE_WEIGHTS = [
  [55, 22,   6,   0,    0,    0,    0   ],  // Basic : raretes 0-2
  [22, 55,  22,   6,    0,    0,    0   ],  // Good  : raretes 0-3
  [ 0,  6,  55,  22,    6,    0,    0   ],  // Rare  : raretes 1-4  (center 2)
  [ 0,  0,   6,  55,   22,    6,    0   ],  // Epic  : raretes 2-5  (center 3)
]

export function rollCrate(crateId: number): number {
  const poids = CRATE_WEIGHTS[Math.max(0, Math.min(crateId, CRATE_WEIGHTS.length - 1))]
  const total = poids.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < poids.length; i++) {
    n -= poids[i]
    if (n <= 0) return i
  }
  return 0
}

const POIDS_APPARITION = [55, 28, 13, 4]

export function rollCrateTier(): number {
  const total = POIDS_APPARITION.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < POIDS_APPARITION.length; i++) {
    n -= POIDS_APPARITION[i]
    if (n <= 0) return i
  }
  return 0
}

import { MUTATIONS } from '../shared/loot-table'

export function rollMutation(): number {
  const total = MUTATIONS.reduce((a, m) => a + m.poids, 0)
  let n = Math.random() * total
  for (const m of MUTATIONS) {
    n -= m.poids
    if (n <= 0) return m.id
  }
  return 0
}
