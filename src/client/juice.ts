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

/*
  Floating numbers: the quantity channel.

  A screen flash says "you were hit"; it cannot say "you lost 1.2K". The reference guidance
  splits those deliberately, and treats floating numbers as the way to turn an invisible
  calculation into feedback the player feels: for the one taking the loss, red, larger than
  normal, rising, gone in a second or two. That is precisely the half a sentence in a toast
  reads slowest.

  Kept as UI, not 3D text: no mesh, no material, nothing on the object budget.
*/
const FLOAT_MS = 1300
const FLOAT_MAX = 4

type FloatingAmount = { amount: number; loss: boolean; born: number }
const floating: FloatingAmount[] = []

/** Show a gained or lost amount rising over the middle of the screen. */
export function floatAmount(amount: number, loss: boolean): void {
  if (amount <= 0) return
  floating.push({ amount, loss, born: Date.now() })
  if (floating.length > FLOAT_MAX) floating.shift()
}

/**
 * The amounts still on screen, each with its progress from 0 to 1.
 *
 * Expiry happens here rather than on a system: the interface reads this once a frame anyway,
 * and a list nobody is drawing does not need a clock of its own.
 */
export function liveAmounts(): Array<{ amount: number; loss: boolean; t: number; rank: number }> {
  const now = Date.now()
  while (floating.length > 0 && now - floating[0].born > FLOAT_MS) floating.shift()
  return floating.map((f, i) => ({ amount: f.amount, loss: f.loss, t: (now - f.born) / FLOAT_MS, rank: i }))
}
