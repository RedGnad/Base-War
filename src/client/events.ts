import { engine, Material, SkyboxTime, TransitionMode, Entity, AudioSource, Transform, Tween, TextureWrapMode, TextureMovementType, PBMaterial_PbrMaterial } from '@dcl/sdk/ecs'
import { Vector2, Vector3, Color4 } from '@dcl/sdk/math'
import { Event, EVENT_THEMES, SCENE_SIDE } from '../shared/schemas'
import { mutation } from '../shared/loot-table'
import { alerter } from './theft'
import { plastic, vif } from './toy'

/**
 * What an event looks like, which is the part that makes it one.
 *
 * The genre's own column for this is titled "Environmental Changes", and every example in it
 * is the WORLD changing rather than a panel appearing: a red sky, a dark screen, music. The
 * platform gives one lever on the sky, its time of day, so an event drops the venue to dusk
 * for as long as it lasts and hands the clock back afterwards. The floor takes the theme's
 * colour, because the sky alone reads as evening and the floor is what you look at.
 *
 * The HUD line follows the documented conveyance for timers: announced once in the player's
 * main gaze, then living at the top with the remaining time, in the theme's colour, with the
 * theme's name as its icon.
 */
export const eventView = { theme: -1, name: '', color: '#ffffff', leftS: 0 }

const DUSK = 64800
let sol: Entity | null = null
let solCouleur = ''
let dernierTheme = -1
let cloche: Entity | null = null

export function setEventFloor(entity: Entity, base: string): void { sol = entity; solCouleur = base }

/** The floor at rest: a matte play mat. Defined once, for the venue that builds it and the event that hands it back. */
export function materiauDuSol(hex: string): PBMaterial_PbrMaterial { return { ...plastic(hex), roughness: 0.9 } }

/*
  The floor does not change colour, it starts to flow.

  A tint is a change the eye adapts to in seconds; motion is not. During an event the floor
  takes a cracked-crust texture that slides slowly, tinted by the theme (the albedo colour
  multiplies the image), so one grey image is molten gold in Gold Hour and lava in Lava Hour.
  The tint is the mutation's own hue pushed to full brightness: the first version used dark
  tints meant for a flat floor, and under the dusk sky the whole venue read as black with
  faint veins. Eight-metre cells across the venue. Both states write both facts, material and
  tween, so an event that ended leaves neither behind.
*/
const MAILLE_SOL = 8

export function setupEvents(): void {
  // A sound with the announcement: the HUD guidelines want timers to have an audio cue, and a
  // player looking at their base cannot see the belt line change colour.
  cloche = engine.addEntity()
  Transform.create(cloche, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
  AudioSource.create(cloche, { audioClipUrl: 'assets/sounds/reveal.wav', playing: false, loop: false, volume: 0.8 })

  engine.addSystem(() => {
    const now = Date.now()
    let theme = -1, until = 0
    for (const [, e] of engine.getEntitiesWith(Event)) { theme = e.theme; until = e.untilMs }
    const actif = theme >= 0 && until > now
    const t = actif ? EVENT_THEMES.find((x) => x.theme === theme) : undefined

    eventView.theme = actif ? theme : -1
    eventView.name = t?.name ?? ''
    eventView.color = actif ? mutation(theme).color : '#ffffff'
    eventView.leftS = actif ? Math.max(0, Math.ceil((until - now) / 1000)) : 0

    if (eventView.theme === dernierTheme) return
    dernierTheme = eventView.theme

    if (actif && t !== undefined) {
      // Announced once where the eye is, then it lives at the top of the screen.
      alerter(`${t.name}  ·  ${mutation(theme).name} x${mutation(theme).mult} drops for 5 minutes`, mutation(theme).color, 6000)
      const a = cloche === null ? null : AudioSource.getMutableOrNull(cloche)
      if (a !== null) { a.playing = false; a.playing = true }
      SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: DUSK, transitionMode: TransitionMode.TM_FORWARD })
      if (sol !== null) {
        Material.setPbrMaterial(sol, {
          texture: Material.Texture.Common({
            src: 'assets/textures/flow.png',
            wrapMode: TextureWrapMode.TWM_REPEAT,
            tiling: Vector2.create(SCENE_SIDE / MAILLE_SOL, SCENE_SIDE / MAILLE_SOL)
          }),
          albedoColor: vif(mutation(theme).color),
          metallic: 0,
          roughness: 0.95
        })
        Tween.setTextureMoveContinuous(sol, Vector2.create(1, 0.6), 0.04, TextureMovementType.TMT_OFFSET)
      }
    } else {
      SkyboxTime.deleteFrom(engine.RootEntity)
      if (sol !== null && solCouleur !== '') {
        Material.setPbrMaterial(sol, materiauDuSol(solCouleur))
        Tween.deleteFrom(sol)
      }
    }
  })
}
