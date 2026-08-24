/**
 * Every economic constant lives here.
 *
 * Shape taken from the idle/tycoon genre rather than picked by hand: production grows
 * ~x6.6 per tier while cost grows ~x13, so the cost-per-income ratio DOUBLES at each
 * step. A flat ratio makes all tiers equivalent and turns every absolute price trivial
 * two tiers later. Prestige uses a cube root of lifetime earnings, so returns diminish
 * by construction.
 */
export const PRODUCTION_PER_RARITY = [1, 7, 44, 287, 1897, 12523, 82654] as const

/** Derived: expected output x target payback, where payback doubles per tier. */
export const CRATE_PRICE = [342, 3539, 46331, 610857] as const

export const CRATE_PAYBACK_S = [60, 120, 240, 480] as const

export const FLOOR_PRICES = [0, 38000, 475000] as const

/**
 * Prestige 1 lands after roughly 25 minutes of real play, not 9.
 *
 * The old 75 000 was calibrated against 42/s, an assumption. Measured against the actual
 * loot table, a starting player runs ~288/s with six items, so the first prestige fell in
 * 9 minutes and in half a minute once Rare crates were affordable. Threshold recomputed
 * from the measured average output of a Basic/Good mix.
 */
export const PRESTIGE_THRESHOLD = 430000

export function prestigeFor(cumul: number): number {
  return cumul <= 0 ? 0 : Math.floor(Math.cbrt(cumul / PRESTIGE_THRESHOLD))
}

export function lifetimeForPrestige(n: number): number {
  return n <= 0 ? 0 : Math.round(n * n * n * PRESTIGE_THRESHOLD)
}

export function prestigeMultiplier(n: number): number {
  return 1 + Math.max(0, n)
}

export const MAX_PRESTIGE = 12

/**
 * Offline earnings are capped in SECONDS OF PRODUCTION, not in hours. An hour-based cap
 * pays an amount that grows with production, so it skips more and more content as the
 * player advances; a production-based cap always grants the same head start.
 */
export const OFFLINE_RATE_V2 = 0.35
export const OFFLINE_CAP_PRODUCTION_S = 900
