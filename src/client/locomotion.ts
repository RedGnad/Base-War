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
    The client's own buttons carry the game, and the scene adds none beside them.

    Its documentation names what each one emits and which are reachable: the interaction
    button, E, F and jump are, while 1 to 4 sit behind a secondary menu and are described
    as not easily reachable. So those four are hidden and the rest are left alone. E takes
    the contextual action, F draws the weapon, the interaction button acts on whatever is
    under the reticle, and nothing of ours competes for the same thumb.
  */
  TouchScreenControls.hide([
    InputAction.IA_ACTION_3, InputAction.IA_ACTION_4,
    InputAction.IA_ACTION_5, InputAction.IA_ACTION_6
  ])
  console.log('[CLIENT] HUD tactile: action centrale = IA_PRIMARY, tir sur le bouton de la scene')
}

export function reportPlatform(): void {
  function once(): void {
    if (getPlatform() === null) return
    engine.removeSystem(once)
    console.log(`[CLIENT] plateforme = ${getPlatform()} (mobile: ${isMobile()})`)
  }
  engine.addSystem(once)
}
