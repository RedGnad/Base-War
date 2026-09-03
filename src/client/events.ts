import { engine, Material, SkyboxTime, TransitionMode, Entity, AudioSource, Transform, Tween, TextureWrapMode, TextureMovementType, PBMaterial_PbrMaterial } from '@dcl/sdk/ecs'
import { Vector2, Vector3, Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { Event, EVENT_THEMES, SCENE_SIDE } from '../shared/schemas'
import { mutation, CRATES, nomDuCode } from '../shared/loot-table'
import { room } from '../shared/messages'
import { raidView } from './raid'
import { alerter, alerterEnFile } from './theft'
import { plastic, TOY } from './toy'
import { TOAST } from './theme'

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
export const eventView = { theme: -1, name: '', color: '#ffffff', leftS: 0, grand: false, nextGrandS: 0 }

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** The band's one line: the rush RUNNING, or nothing. A rush lasts minutes and earns the centre. */
export function bannerLine(): { text: string; color: string } | null {
  if (raidView.active) {
    // The distance is what turns the banner into a direction: the beam says which way, this
    // says how far, and together they answer "where is it" without a minimap.
    const loin = raidView.distance > 0 ? `   ·   ${raidView.distance} m` : ''
    return { text: `RAID BOSS   ${mmss(raidView.leftS)}   ·   ${Math.round((raidView.hp / raidView.hpMax) * 100)}%${loin}${raidView.topName !== '' ? `   ·   top: ${raidView.topName}` : ''}`, color: '#ff6b6b' }
  }
  if (eventView.theme < 0) return null
  return { text: `${eventView.grand ? 'GRAND ' : ''}${eventView.name}   ${mmss(eventView.leftS)}`, color: eventView.color }
}

/**
 * The countdown to the grand rush, for a small chip in the corner. It can stand for an hour,
 * and an hour in the middle of the screen is furniture (tester, 27 Aug): it goes where the
 * other standing facts go, under the money, at caption size.
 */
export function nextBigText(): string | null {
  if (eventView.theme >= 0 || raidView.active) return null
  const grand = eventView.nextGrandS > 0 && eventView.nextGrandS <= 3600 ? eventView.nextGrandS : 0
  const raid = raidView.nextS > 0 && raidView.nextS <= 600 ? raidView.nextS : 0
  // The sooner of the two standing facts; the raid within ten minutes, the grand rush within the hour.
  if (raid > 0 && (grand === 0 || raid <= grand)) return `RAID IN ${mmss(raid)}`
  if (grand > 0) return `GRAND RUSH IN ${mmss(grand)}`
  return null
}

/**
 * What each rush looks like: its mat and its hour of the day.
 *
 * The first version was one cracked-crust texture at full contrast, tinted to saturation and
 * repeated twenty-four times across the plaza: it tiled like a bathroom, and a tester saw a
 * GOLD event with a floor of lava, because glowing cracks read as lava in any colour. The
 * venue is a play mat, so an event is the mat changing: a mid-tone from the palette carries
 * the colour, and a soft pattern with a fifth of contrast breathes underneath at sixteen
 * metres a cell. Gold sparkles under the golden hour, lava has slow blobs under a darker
 * evening, cursed swirls under the night. Sky times are seconds since midnight.
 */
const LOOK: Record<number, { texture: string; teinte: string; sky: number }> = {
  1: { texture: 'mat-gold', teinte: TOY.groundEvent.gold, sky: 64800 },
  5: { texture: 'mat-lava', teinte: TOY.groundEvent.lava, sky: 72000 },
  9: { texture: 'mat-cursed', teinte: TOY.groundEvent.cursed, sky: 79200 }
}
let sol: Entity | null = null
let solCouleur = ''
let dernierTheme = -1
let cloche: Entity | null = null

export function setEventFloor(entity: Entity, base: string): void { sol = entity; solCouleur = base }

/**
 * The floor at rest: a matte play mat. Defined once, for the venue that builds it and the event
 * that hands it back.
 *
 * It names a texture on purpose. A material written without a texture field does not clear
 * the one the client is drawing: after the first Gold rush the floor went back to green and
 * kept its cracks. Naming one is what makes the swap happen, and the one named is the quiet
 * checker: a flat floor gave the eye nothing that moves, so running read as standing still
 * (tester, 28 Aug). Same recipe as the event mats, a fraction of their contrast.
 */
export function groundMaterial(hex: string): PBMaterial_PbrMaterial {
  return {
    ...plastic(hex), roughness: 0.9,
    texture: Material.Texture.Common({
      src: 'assets/textures/mat-grass.png',
      wrapMode: TextureWrapMode.TWM_REPEAT,
      tiling: Vector2.create(SCENE_SIDE / MAILLE_HERBE, SCENE_SIDE / MAILLE_HERBE)
    })
  }
}

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
const MAILLE_SOL = 16
/*
  The venue lives in permanent late morning, like the genre it belongs to: the references
  play in fixed daylight because night desaturates a colourful game into grey (the tester
  judged the grass "too muted" at night, 31 Aug, and he was right about the cause). The
  world config pins the same hour for production; this component covers the local preview
  and gives the rushes something to RESTORE, where they used to hand the sky back to the
  global clock and whatever hour it happened to be.
*/
const JOUR_DE_BASE = 37_800
/** The resting checker: two 2 m tiles per repeat, the genre's stride-sized grain. */
const MAILLE_HERBE = 4

export function setupEvents(): void {
  room.onMessage('rushGift', (d) => {
    const caisse = CRATES[d.crateTier]?.name ?? 'crate'
    const trait = d.code >= 0 ? `  ·  your ${nomDuCode(d.code)} gained a trait` : ''
    alerterEnFile(`${d.grand ? 'GRAND ' : ''}${d.name}  ·  a ${caisse} for being here${trait}`, '#ffd166', TOAST.event)
  })

  // A sound with the announcement: the HUD guidelines want timers to have an audio cue, and a
  // player looking at their base cannot see the belt line change colour.
  cloche = engine.addEntity()
  Transform.create(cloche, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
  AudioSource.create(cloche, { audioClipUrl: 'assets/sounds/reveal.wav', playing: false, loop: false, volume: 0.8 })

  engine.addSystem(() => {
    const now = Date.now()
    let theme = -1, until = 0, grand = false, prochainGrand = 0
    for (const [, e] of engine.getEntitiesWith(Event)) { theme = e.theme; until = e.untilMs; grand = e.grand; prochainGrand = e.nextGrandMs }
    const actif = theme >= 0 && until > now
    eventView.grand = actif && grand
    eventView.nextGrandS = prochainGrand > now ? Math.ceil((prochainGrand - now) / 1000) : 0
    const t = actif ? EVENT_THEMES.find((x) => x.theme === theme) : undefined

    eventView.theme = actif ? theme : -1
    eventView.name = t?.name ?? ''
    eventView.color = actif ? mutation(theme).color : '#ffffff'
    eventView.leftS = actif ? Math.max(0, Math.ceil((until - now) / 1000)) : 0

    if (eventView.theme === dernierTheme) return
    dernierTheme = eventView.theme

    if (actif && t !== undefined) {
      // Announced once where the eye is, then it lives at the top of the screen.
      const minutes = Math.max(1, Math.round((until - now) / 60000))
      alerter(grand
        ? `GRAND ${t.name}  ·  ${mutation(theme).name} x${mutation(theme).mult} drops for ${minutes} minutes, belt at double speed`
        : `${t.name}  ·  ${mutation(theme).name} x${mutation(theme).mult} drops for ${minutes} minutes`, mutation(theme).color, TOAST.event)
      const a = cloche === null ? null : AudioSource.getMutableOrNull(cloche)
      if (a !== null) { a.playing = false; a.playing = true }
      const look = LOOK[theme] ?? LOOK[5]
      SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: look.sky, transitionMode: TransitionMode.TM_FORWARD })
      if (sol !== null) {
        Material.setPbrMaterial(sol, {
          texture: Material.Texture.Common({
            src: `assets/textures/${look.texture}.png`,
            wrapMode: TextureWrapMode.TWM_REPEAT,
            tiling: Vector2.create(SCENE_SIDE / MAILLE_SOL, SCENE_SIDE / MAILLE_SOL)
          }),
          albedoColor: Color4.fromHexString(look.teinte + 'ff'),
          metallic: 0,
          roughness: 0.95
        })
        // Not on the handset: its texture tweens overwrite the material's tiling with (1, 1)
        // (godot-explorer tween.rs, 30 Aug), which would stretch one mat cell over the venue.
        // The phone keeps a still mat at the right scale; the flow is a desktop flourish.
        if (!isMobile()) Tween.setTextureMoveContinuous(sol, Vector2.create(1, 0.6), 0.015, TextureMovementType.TMT_OFFSET)
      }
    } else {
      SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: JOUR_DE_BASE, transitionMode: TransitionMode.TM_FORWARD })
      if (sol !== null && solCouleur !== '') {
        Material.setPbrMaterial(sol, groundMaterial(solCouleur))
        Tween.deleteFrom(sol)
      }
    }
  })
}
