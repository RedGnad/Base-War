import { engine, TouchScreenControls, InputAction, AvatarLocomotionSettings, timers } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'

export const JOG_NORMAL = 11
export const JOG_VOLEUR = 6.5   // -41 %
export const SAUT_NORMAL = 1.15
export const SAUT_VOLEUR = 0.69 // -40 %

/**
 * Uses AvatarLocomotionSettings rather than InputModifier: the latter is documented as
 * having no effect outside the DCL 2.0 desktop client, and most of the score is mobile.
 */
export function applyFreeze(ms: number): void {
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, { jogSpeed: 0.6, jumpHeight: 0.2 })
  timers.setTimeout(() => applyThiefPenalty(false), ms)
}

export function applyThiefPenalty(actif: boolean): void {
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
    jogSpeed: actif ? JOG_VOLEUR : JOG_NORMAL,
    jumpHeight: actif ? SAUT_VOLEUR : SAUT_NORMAL
  })
  console.log(`[CLIENT] malus voleur ${actif ? 'ACTIF' : 'inactif'}: jog=${actif ? JOG_VOLEUR : JOG_NORMAL} saut=${actif ? SAUT_VOLEUR : SAUT_NORMAL}`)
}

export function setupTouchHud(): void {
  TouchScreenControls.setMainAction(InputAction.IA_PRIMARY)

  TouchScreenControls.hide([
    InputAction.IA_ACTION_3, InputAction.IA_ACTION_4,
    InputAction.IA_ACTION_5, InputAction.IA_ACTION_6
  ])
  console.log('[CLIENT] HUD tactile: action centrale = IA_PRIMARY, boutons 1-4 caches, joystick garde')
}

export function reportPlatform(): void {
  function once(): void {
    if (getPlatform() === null) return
    engine.removeSystem(once)
    console.log(`[CLIENT] plateforme = ${getPlatform()} (mobile: ${isMobile()})`)
  }
  engine.addSystem(once)
}
