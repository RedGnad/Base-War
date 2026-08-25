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
  console.log(`[CLIENT] malus thief ${active ? 'ACTIF' : 'inactif'}`)
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
  const ctrl = TouchScreenControls.getMutableOrNull(engine.RootEntity)
  if (ctrl !== null) {
    ctrl.touchInputs = [
      ...ctrl.touchInputs.filter((t) => t.inputAction !== InputAction.IA_ACTION_3),
      {
        inputAction: InputAction.IA_ACTION_3,
        hide: false,
        icon: { tex: { $case: 'texture', texture: { src: 'assets/ui/icon-menu.png' } } }
      }
    ]
  }
  console.log('[CLIENT] HUD tactile: 5 boutons directs, menu sur IA_ACTION_3')
}

export function reportPlatform(): void {
  function once(): void {
    if (getPlatform() === null) return
    engine.removeSystem(once)
    console.log(`[CLIENT] plateforme = ${getPlatform()} (mobile: ${isMobile()})`)
  }
  engine.addSystem(once)
}
