import { engine, TouchScreenControls, InputAction, AvatarLocomotionSettings } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'

/**
 * SPIKE 1.3 — HUD pouce et malus de locomotion.
 *
 * Le malus du voleur vient de la mesure du #1 (wiki Steal a Brainrot):
 * vitesse -41 % et saut -40 %. Defauts client verifies: jogSpeed 8, jumpHeight 1.
 */
/**
 * Vitesses. Le defaut client est 8 m/s; on monte a 11 parce que le lieu fait 80 m et
 * qu'un juge dispose de trois minutes. C'est le SEUL levier de confort disponible: la
 * sensibilite camera n'est pas pilotable sur mobile (`screenDelta` = 0), et faire
 * diverger desktop et mobile serait pire que de ne rien faire.
 * Le malus du voleur conserve les RATIOS mesures chez le #1: -41 % et -40 %.
 */
export const JOG_NORMAL = 11
export const JOG_VOLEUR = 6.5   // -41 %
export const SAUT_NORMAL = 1.15
export const SAUT_VOLEUR = 0.69 // -40 %

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
  // Le gros bouton central declenche notre action principale au lieu du saut.
  // Nos entites (caisse, objets) ecoutent IA_PRIMARY *et* IA_POINTER, donc le doigt
  // et le bouton central font la meme chose.
  TouchScreenControls.setMainAction(InputAction.IA_PRIMARY)

  // On cache les boutons de la barre dont le jeu ne se sert pas: chacun encombre un
  // pouce sur un ecran de telephone. On NE CACHE PAS le joystick: notre boucle exige
  // de marcher jusqu'aux bases des autres.
  TouchScreenControls.hide([
    InputAction.IA_ACTION_3, InputAction.IA_ACTION_4,
    InputAction.IA_ACTION_5, InputAction.IA_ACTION_6
  ])
  console.log('[SPIKE] HUD tactile: action centrale = IA_PRIMARY, boutons 1-4 caches, joystick garde')
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
