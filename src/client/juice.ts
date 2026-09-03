/*
  Damage flash: a brief red pulse over the world when the player is hit.

  Convention, not invention. A coloured full-screen flash on damage dates back to DOOM and is
  still the baseline signal for "you were hurt"; Battlefield later turned the same idea into a
  progressive vignette. The reference guidance is explicit on two points: the flash is BRIEF,
  and the player must always clearly see they took a hit. So it peaks immediately and is gone
  in under a third of a second, long enough to register, too short to hide the game.

  Why this exists at all: until now the scene had no damage channel except a line of text. The
  literature treats juice as a stack (flash, shake, floating text, sound, particles), and a
  sentence carrying an event, a quantity and an attribution at once is the slowest way to say
  any of them.

  Free on the object budget: one UI layer, no mesh, no material, no texture, no collider.
*/

const PEAK = 0.32
const DURATION_MS = 280

let hitAt = -1

/** Call the moment the player takes a hit. */
export function flashDamage(): void {
  hitAt = Date.now()
}

/**
 * Current alpha of the red veil, 0 when there is nothing to draw.
 *
 * Squared falloff rather than linear: the hit should LAND and then release, not fade evenly.
 */
export function damageFlashAlpha(): number {
  if (hitAt < 0) return 0
  const age = Date.now() - hitAt
  if (age < 0 || age > DURATION_MS) return 0
  const left = 1 - age / DURATION_MS
  return PEAK * left * left
}
