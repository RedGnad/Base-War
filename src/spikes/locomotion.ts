import { engine, TouchScreenControls, InputAction, AvatarLocomotionSettings } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'

/**
 * SPIKE 1.3 — HUD pouce et malus de locomotion.
 *
 * Le malus du voleur vient de la mesure du #1 (wiki Steal a Brainrot):
 * vitesse -41 % et saut -40 %. Defauts client verifies: jogSpeed 8, jumpHeight 1.
 */
export const JOG_NORMAL = 8
export const JOG_VOLEUR = 4.7 // -41 %
export const SAUT_NORMAL = 1
export const SAUT_VOLEUR = 0.6 // -40 %

export function applyThiefPenalty(actif: boolean): void {
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
    jogSpeed: actif ? JOG_VOLEUR : JOG_NORMAL,
    jumpHeight: actif ? SAUT_VOLEUR : SAUT_NORMAL
  })
  console.log(`[SPIKE] malus voleur ${actif ? 'ACTIF' : 'inactif'}: jog=${actif ? JOG_VOLEUR : JOG_NORMAL} saut=${actif ? SAUT_VOLEUR : SAUT_NORMAL}`)
}

/**
 * Le bouton central mobile declenche notre action principale au lieu du saut.
 * On NE cache PAS le joystick: notre boucle exige de marcher jusqu'aux emplacements
 * des autres. Le cacher priverait le joueur mobile de tout moyen de se deplacer,
 * sauf a reconstruire un joystick en UI de scene. A rouvrir seulement si on mesure
 * un gain reel sur telephone.
 */
export function setupTouchHud(): void {
  TouchScreenControls.setMainAction(InputAction.IA_PRIMARY)
  console.log('[SPIKE] bouton central mobile -> IA_PRIMARY')
}

/** La plateforme n'est connue qu'apres coup: on attend qu'elle soit resolue. */
export function reportPlatform(): void {
  function once(): void {
    if (getPlatform() === null) return
    engine.removeSystem(once)
    console.log(`[SPIKE] plateforme = ${getPlatform()} (mobile: ${isMobile()})`)
  }
  engine.addSystem(once)
}
