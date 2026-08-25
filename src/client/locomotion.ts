import { engine, TouchScreenControls, InputAction, AvatarLocomotionSettings, timers } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import { AIM_SPEED_SHARE } from '../shared/schemas'

export const JOG_NORMAL = 11
export const THIEF_JOG = 6.5   // -41 %
export const SAUT_NORMAL = 1.15
export const THIEF_JUMP = 0.69 // -40 %
const FREEZE_JOG = 0.6
const FREEZE_JUMP = 0.2

/**
 * One place decides how fast the player moves.
 *
 * Three separate things slow the player and they overlap: the thief penalty, a sentry
 * freeze, and aiming. Each writing AvatarLocomotionSettings on its own means whichever
 * one ends last restores full speed and silently cancels the others. The state lives
 * here, and the component is written from the whole state, never from a single cause.
 *
 * Uses AvatarLocomotionSettings rather than InputModifier: the latter is documented as
 * having no effect outside the DCL 2.0 desktop client, and most of the score is mobile.
 */
const etat = { thief: false, aiming: false, frozenUntil: 0 }

function appliquer(): void {
  const frozen = etat.frozenUntil > Date.now()
  const base = etat.thief ? THIEF_JOG : JOG_NORMAL
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
    jogSpeed: frozen ? FREEZE_JOG : base * (etat.aiming ? AIM_SPEED_SHARE : 1),
    jumpHeight: frozen ? FREEZE_JUMP : etat.thief ? THIEF_JUMP : SAUT_NORMAL
  })
}

export function applyFreeze(ms: number): void {
  etat.frozenUntil = Date.now() + ms
  appliquer()
  timers.setTimeout(appliquer, ms + 30)
}

export function applyThiefPenalty(active: boolean): void {
  etat.thief = active
  appliquer()
  console.log(`[CLIENT] thief penalty ${active ? 'ON' : 'off'}`)
}

/** Aiming halves the jog. Stacks with the thief penalty instead of replacing it. */
export function setAiming(active: boolean): void {
  if (etat.aiming === active) return
  etat.aiming = active
  appliquer()
}

export function setupTouchHud(): void {
  TouchScreenControls.setMainAction(InputAction.IA_PRIMARY)
  TouchScreenControls.showAll()

  /*
    Five buttons, which is exactly as many as the client will show without folding any away.

    The eight touch controls are one priority stack, JUMP, the interaction button, E, F,
    then 1 to 4, and the slots on screen are fixed. Visible buttons fill those slots from
    the top of the stack down, and the rule that matters is the count: five or fewer and
    every one is drawn directly, a sixth and the client hands the last slot to a "+" that
    hides the rest behind a second tap.

    The numbered buttons are not badly placed, then. They occupy the same good slots as any
    other, and they only became awkward because we were showing too many things at once.
    Four are needed for the game: jump, the interaction button, E for the contextual action,
    F to draw. That leaves one, and one is what we take, for the menu, which is what removes
    a bar of our own from the bottom of the screen. The other three stay hidden rather than
    being pushed behind a "+".

    The glyph on it is ours. A control that reads "1" says nothing; the client lets a scene
    replace the picture with an image it ships, so the button says menu without a caption.
  */
  TouchScreenControls.hide([
    InputAction.IA_ACTION_4, InputAction.IA_ACTION_5, InputAction.IA_ACTION_6
  ])
  poserIcone(InputAction.IA_ACTION_3, 'icon-menu')
  setArmeIcone(false)
  console.log('[CLIENT] touch HUD: 5 direct buttons, menu on IA_ACTION_3, weapon on IA_SECONDARY')
}

/**
 * Put one of our images on a client button, or take ours back off it.
 *
 * Passing null drops our entry entirely, which restores the button's built-in glyph: there
 * is no "no icon" value to write, only an entry that is or is not there.
 */
function poserIcone(action: InputAction, nom: string | null): void {
  const ctrl = TouchScreenControls.getMutableOrNull(engine.RootEntity)
  if (ctrl === null) return
  const autres = ctrl.touchInputs.filter((t) => t.inputAction !== action)
  ctrl.touchInputs = nom === null
    ? autres
    : [
        ...autres,
        {
          inputAction: action,
          hide: false,
          icon: { tex: { $case: 'texture', texture: { src: `assets/ui/${nom}.png` } } }
        }
      ]
}

let iconePrimaire: string | null = null

/**
 * The picture on the central button, decided in one place.
 *
 * That button is whatever the game currently offers: the trigger while the weapon is out,
 * banking the takings the rest of the time. Two different parts of the scene wanting to
 * write to it is how a button ends up showing the wrong thing after a state it did not know
 * about, so only the interface decides, once a frame, and everything else reads.
 *
 * Passing null puts the built-in "E" back, which is the right answer for the actions that
 * carry a price or a count and are better said in words.
 */
let reticuleClient: boolean | null = null

/**
 * Whether the client draws its own crosshair.
 *
 * Two reasons to take it away. A window is open, and a sight over a menu means nothing. Or
 * the weapon is out, and the scene draws its own sight, which says more: it turns red and
 * names whoever is under it. Two crosshairs on screen at once is also how a small offset
 * between them becomes visible, and there is one to be had, because the scene's coordinates
 * are inset from the device's safe margins while the client's are not.
 */
export function setReticuleClient(visible: boolean): void {
  if (reticuleClient === visible) return
  reticuleClient = visible
  if (visible) TouchScreenControls.showCrosshair()
  else TouchScreenControls.hideCrosshair()
}

export function setIconePrimaire(nom: string | null): void {
  if (iconePrimaire === nom) return
  iconePrimaire = nom
  poserIcone(InputAction.IA_PRIMARY, nom)
}

let armeSortie: boolean | null = null

/**
 * What F means right now, said on F.
 *
 * The scene used to print "F to draw" on a bar across the bottom of the screen, which is
 * furniture spent on a caption for a button that was already there. A control can carry its
 * own meaning: a pistol when the weapon is holstered, the same pistol struck through once it
 * is out. Nothing on screen, and the answer is under the thumb that needs it.
 *
 * Guarded on the value because this is called from the aiming toggle: rewriting the
 * component with an identical value every time would put a network update on every change
 * of mind.
 */
export function setArmeIcone(sortie: boolean): void {
  if (armeSortie === sortie) return
  armeSortie = sortie
  poserIcone(InputAction.IA_SECONDARY, sortie ? 'icon-holster' : 'icon-gun')
}

export function reportPlatform(): void {
  function once(): void {
    if (getPlatform() === null) return
    engine.removeSystem(once)
    console.log(`[CLIENT] platform = ${getPlatform()} (mobile: ${isMobile()})`)
  }
  engine.addSystem(once)
}
