import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
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

/**
 * The reference the interface is currently authored against.
 *
 * Set once the platform is known, because the client swaps a 16:9 request for 1600x720 on
 * a handset. Everything below converts the client's measurements into these units.
 */
export const active = { w: 1920, h: 1080 }
/** Heights are authored against the phone, 720, because what fits 720 fits 1080. */
export function setReference(w: number, h: number): void { active.w = w; active.h = h }

/**
 * What the client's own controls take from the left and right edges, in our units.
 *
 * This used to be one guessed number, 320, for the action buttons on the right. Two things
 * were wrong with it. The client publishes the answer itself, in UiCanvasInformation, and
 * the protocol says the value changes with whatever HUD is currently shown, so a constant
 * cannot be right. And it named only the right edge, while the phone puts a joystick on the
 * left, so the interface was corrected for one obstruction and blind to the other.
 *
 * Returned in the units the layout is written in: the client reports canvas pixels, and the
 * renderer multiplies our numbers by the same scale it derives from the virtual screen, so
 * dividing here cancels it out. Missing or unreported means zero, which is the honest
 * answer for a client that has not told us anything.
 */
function clientEdges(): { left: number; right: number } {
  const info = UiCanvasInformation.getOrNull(engine.RootEntity)
  if (info === null || info.interactableArea === undefined) return { left: 0, right: 0 }
  const scale = Math.min(info.width / active.w, info.height / active.h)
  if (!(scale > 0)) return { left: 0, right: 0 }
  return { left: info.interactableArea.left / scale, right: info.interactableArea.right / scale }
}

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
 * The top band, as a stack.
 *
 * Messages arrive from unrelated parts of the game: the money, the tutorial step, a crowd
 * bonus, the event feed, a crate announced on the belt. Giving each one a fixed address was
 * the first fix, and it was only half right. It stopped two of them sharing a number, but a
 * fixed address is wrong in both directions: a sixth message had nowhere to go and picked a
 * `top:` by hand, landing on top of the money, and when the tutorial finished its address
 * emptied and everything below it stayed put, floating under a hole.
 *
 * A band of messages is a stack. Each block is declared once, here, in priority order with
 * the height it needs and whether it is showing right now; absent blocks take no room and
 * everything below closes up. Collisions and holes both stop being possible, rather than
 * being fixed one screenshot at a time.
 *
 * The band has a floor, because the middle of the screen belongs to dialogs. A block that
 * would cross it is refused a position and does not draw: on a full band the least
 * important message is dropped, which is the honest outcome and beats overlapping the game.
 */
export function topBand(blocks: Array<[string, boolean, number]>): Record<string, number> {
  const out: Record<string, number> = {}
  let y = BAND.top
  for (const [name, present, height] of blocks) {
    const room = y + height <= BAND.top + BAND.topHeight
    out[name] = room ? y : -1
    if (present && room) y += height + 8
  }
  return out
}

/**
 * A centred strip, returned as the width and the left margin that centres it.
 *
 * The rule this file got wrong for a long time, stated plainly: an obstruction in a corner
 * limits how wide we are allowed to be, it does not move where the middle is. The old
 * version shifted every strip half the width of the right-hand buttons, so anything routed
 * through here sat a hundred and sixty pixels left of anything that placed itself by hand.
 * That is why the interface never looked centred, and why straightening one panel knocked
 * another one crooked: two different definitions of the word, in the same screen.
 *
 * The centre is the centre. Only the width answers to the client: a strip is trimmed to
 * whatever survives between the controls it reports on either side, and the trim comes from
 * the larger of the two so the result stays symmetric about the middle.
 */
export function strip(width: number): { width: number; margin: { left: number } } {
  const edge = clientEdges()
  const usable = active.w - 2 * Math.max(edge.left, edge.right)
  const w = Math.min(width, Math.max(usable, active.w * 0.5))
  return { width: w, margin: { left: -w / 2 } }
}

/**
 * Context notices, stacked upward from above the control rows.
 *
 * These say what the game is waiting for right now: place your base first, tap a slot to
 * move it, smash the crate, someone is robbing you. Each one used to carry its own
 * `bottom:`, and three of them picked 150, which lands inside the row of controls that
 * spans 136 to 232. They drew across the buttons.
 *
 * Same rule as the top band, in the other direction: declared once, in priority order, and
 * each one stacks above the last so two can be up at the same time without touching. The
 * first is the most urgent, and sits closest to the controls where the eye already is.
 */
export function noticeBand(blocks: Array<[string, boolean, number]>): Record<string, number> {
  const out: Record<string, number> = {}
  let y = row(2)
  for (const [name, present, height] of blocks) {
    out[name] = y
    if (present) y += height + 10
  }
  return out
}

/**
 * How much of the right edge to leave for the client, at the top of the screen.
 *
 * Written down from a photograph of the running mobile client rather than from this file's
 * own earlier claim, which said the top right carried the profile and camera controls and
 * was crowded. On the phone those four buttons sit at the top LEFT, in a row, and the top
 * right is empty. On the desktop client there are two small icons in that corner, so the
 * margin is sized for those.
 *
 * That corner matters because it is where a running objective belongs: eye-tracking work on
 * game interfaces puts persistent readouts in the periphery and keeps the middle for the
 * action, and an objective tracker is conventionally read top right.
 */
export const COIN_HAUT_DROIT = 96

/**
 * Which button means what, and why the scene adds almost none of its own.
 *
 * The mobile client already draws a set of controls, and its documentation says what each
 * one emits and which ones a thumb can actually reach: the interaction button sends
 * IA_POINTER at whatever sits under the reticle, E sends IA_PRIMARY, F sends IA_SECONDARY,
 * and there is a jump. The numbered buttons hide behind a secondary menu and are described
 * as not easily reachable, so they are hidden rather than used.
 *
 * Building a second row of controls beside those was the mistake: two sets of buttons for
 * one pair of thumbs. The rule instead is one button, one meaning, and the scene borrows
 * rather than adds.
 *
 *   interaction  acts on what the reticle covers, and fires when the weapon is out
 *   E            the one action the game would offer right now: build, open, collect, buy
 *   F            draw and holster
 *   jump         jump
 *
 * That leaves nothing for the main loop to put on screen. What has no native home is the
 * travel menu and the panels, and those get a single opener each, in the bottom band.
 *
 * What the player cannot read off a fixed icon is what E means at this instant, so that
 * goes where the documentation puts context hints: one line, centre bottom, just above the
 * interaction button. A line of text, never a control.
 */
export const NATIVE = {
  interact: 'acts on the reticle target, fires while drawn',
  primary: 'the contextual game action',
  secondary: 'draw and holster',
  jump: 'jump'
} as const
