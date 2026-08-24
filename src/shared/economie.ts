/**
 * Every economic constant lives here.
 *
 * Shape taken from the idle/tycoon genre rather than picked by hand: production grows
 * ~x6.6 per tier while cost grows ~x13, so the cost-per-income ratio DOUBLES at each
 * step. A flat ratio makes all tiers equivalent and turns every absolute price trivial
 * two tiers later. Prestige uses a cube root of lifetime earnings, so returns diminish
 * by construction.
 */
export const PRODUCTION_RARETE = [1, 7, 44, 287, 1897, 12523, 82654] as const

/** Derived: expected output x target payback, where payback doubles per tier. */
export const PRIX_BOITE = [342, 3539, 46331, 610857] as const

export const RETOUR_BOITE_S = [60, 120, 240, 480] as const

export const PRIX_ETAGE_ABS = [0, 38000, 475000] as const

export const PALIER_SEUIL = 75000

export function palierPour(cumul: number): number {
  return cumul <= 0 ? 0 : Math.floor(Math.cbrt(cumul / PALIER_SEUIL))
}

export function cumulPourPalier(n: number): number {
  return n <= 0 ? 0 : Math.round(n * n * n * PALIER_SEUIL)
}

export function multiplicateurPalier(n: number): number {
  return 1 + Math.max(0, n)
}

export const PALIER_MAX = 12

/**
 * Offline earnings are capped in SECONDS OF PRODUCTION, not in hours. An hour-based cap
 * pays an amount that grows with production, so it skips more and more content as the
 * player advances; a production-based cap always grants the same head start.
 */
export const HORS_LIGNE_TAUX_V2 = 0.35
export const HORS_LIGNE_PLAFOND_PRODUCTION_S = 900
