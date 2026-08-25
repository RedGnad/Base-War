import { TAP } from './theme'

/**
 * Where things are allowed to go, and why.
 *
 * The scene does not own the screen. Decentraland's own client draws over parts of it, and
 * its documentation names them: the left column carries chat, profile, joystick and
 * emotes; the bottom right carries the action buttons and they sit over the scene's area
 * "by design"; the top right carries the profile and camera controls and is described as
 * crowded. The zones it names as safe are the centre for dialogs, the top centre for
 * messages the player cannot act on, and the centre bottom above the interaction button
 * for controls.
 *
 * So the usable screen is three horizontal bands, and nothing here is a number somebody
 * liked the look of. Every position in the interface comes from this file, so moving a
 * band moves everything that belongs to it, and a stray `top: 158` written by hand is a
 * defect rather than a style.
 *
 * Sizes are virtual pixels against the reference resolution the renderer declares, which
 * is 1600x720 on a phone and 1920x1080 elsewhere. The narrow one governs: an interface
 * that fits 720 fits 1080, never the reverse, and authoring against 1080 while a phone
 * renders 720 is what put a 620 tall panel on an 86 percent tall screen.
 */

/** The reference the layout is authored against: the phone, because it is the tighter one. */
export const REF = { w: 1600, h: 720 } as const

/**
 * How much of the right edge the client's own action buttons occupy.
 *
 * Nothing of ours crosses this line. Measured off the mobile client rather than guessed:
 * three round buttons and their padding.
 */
export const CLIENT_RIGHT = 320

/** The three bands, as offsets from the top and the bottom of the reference screen. */
export const BAND = {
  /** Non-actionable messages: the counter, the step line, the belt announcement. */
  top: 10,
  topHeight: 250,
  /** Controls. Rows stack upward from the bottom, each one TAP.height tall. */
  bottom: 26,
  /** Dialogs own the middle and everything else hides while one is up. */
  dialogMaxHeight: 620
} as const

/** The vertical offset of a control row counted from the bottom, row 0 being the lowest. */
export function row(n: number): number {
  return BAND.bottom + n * (TAP.height + 14)
}

/**
 * A centred strip, returned as the width and the left margin that centres it.
 *
 * Everything of ours is centred on the usable area rather than on the screen, because the
 * screen's right edge belongs to the client. `usable` is what remains once that is taken
 * out, and a strip is never allowed to be wider than it.
 */
export function strip(width: number): { width: number; margin: { left: number } } {
  const usable = REF.w - CLIENT_RIGHT
  const w = Math.min(width, usable)
  // Centred on the usable area, expressed against the screen centre that '50%' refers to.
  return { width: w, margin: { left: -w / 2 - CLIENT_RIGHT / 2 } }
}
