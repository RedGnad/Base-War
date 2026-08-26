import { engine, Entity, Transform, GltfContainer, GltfContainerLoadingState, LoadingState, MeshRenderer, PBMaterial_PbrMaterial } from '@dcl/sdk/ecs'
import { Color3, Color4 } from '@dcl/sdk/math'
import { HUE } from './theme'

/**
 * The toy palette, and the one place the world gets its colours from.
 *
 * Twenty-five hex strings were scattered across eight files, and none of them agreed with the
 * five the interface uses. A theme is first of all a palette in ONE place: every surface in the
 * world names a role here, and changing the world's look is editing this file. The five HUD
 * hues are reused where the world and the interface mean the same thing (money, danger), so a
 * green plate on the floor and a green number on screen are the same green.
 *
 * "Toy" in material terms is plastic: no metal, a soft sheen, one flat colour per part, nothing
 * textured. `plastic()` is the only material the world uses, with a glow only where the game
 * already glowed (rarity, sentries). The reference family (vinyl-toy figures, candy colours) is
 * the genre's own register; every mobile leader in our census sits in it.
 */
export const TOY = {
  /** The ground: a play-mat green, matte, the table the toys stand on. */
  ground: '#6cc47a',
  groundEvent: { gold: '#b89a3a', lava: '#b4523a', cursed: '#6a4a8f' },
  /** Bases: cream plastic walls, a brighter roof line, primary-colour accents. */
  wallCream: '#f2e9d8',
  slab: '#e6dcc8',
  plinth: '#d9d0bf',
  plinthAway: '#c9c1b2',
  post: '#f6f1e8',
  lintel: '#ff6b6b',
  /** The ramp is the one bold primary on a base: yellow, so a way up reads from across the plaza. */
  ramp: '#ffd23f',
  rail: '#ff9f43',
  elevator: '#4dabf7',
  /** Glass in a toy is tinted acrylic, still see-through. */
  glass: Color4.create(0.75, 0.9, 1.0, 0.22),
  /** The belt: a red plastic conveyor on cream legs, the runway everything arrives on. */
  belt: '#e63946',
  beltLeg: '#f2e9d8',
  beltRail: '#ffd23f',
  beltPit: '#2b2d42',
  beltRing: '#8d99ae',
  /** Defences and traps share the interface's colours so the world and the HUD agree. */
  sentry: '#4dd2ff',
  trapPlate: '#adb5bd',
  bomb: '#ff4d6d',
  mine: HUE.money,
  shield: Color4.create(0.30, 0.85, 1.0, 0.16),
  markerOk: HUE.money,
  markerBad: HUE.danger
} as const

/** One flat plastic. `glow` is the emissive intensity, zero for anything that is not lit. */
export function plastic(hex: string, glow = 0): PBMaterial_PbrMaterial {
  const c = Color4.fromHexString(hex.length === 7 ? hex + 'ff' : hex)
  return glow > 0
    ? { albedoColor: c, emissiveColor: Color3.create(c.r, c.g, c.b), emissiveIntensity: glow, metallic: 0, roughness: 0.45 }
    : { albedoColor: c, metallic: 0, roughness: 0.55 }
}

/** Tinted acrylic: the same plastic, see-through. */
export function acrylic(c: Color4): PBMaterial_PbrMaterial {
  return { albedoColor: c, metallic: 0, roughness: 0.15 }
}

/**
 * Where an artist's model goes, and what stands in until it exists.
 *
 * Every visual that will be replaced by a GLB is created through this, so the swap is a file
 * appearing in `assets/toy/` rather than a code change. The primitive is drawn immediately;
 * when the model reports FINISHED the primitive is hidden, and when it reports NOT_FOUND or
 * an error the primitive simply stays. Positions, scales and colliders never move: the model
 * is authored to the primitive's box, which is what the gameplay was measured against.
 *
 * Both entities share the parent's transform: the model is a child at identity, so whatever
 * the artist exports at the primitive's size lands exactly where the primitive was.
 */
export const TOY_DIR = 'assets/toy/'
const montages = new Map<Entity, { modele: Entity; fichier: string }>()

export function montable(primitive: Entity, fichier: string): void {
  const modele = engine.addEntity()
  // Child at identity: the model inherits the primitive's position, rotation and scale.
  Transform.create(modele, { parent: primitive })
  GltfContainer.create(modele, { src: TOY_DIR + fichier, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  montages.set(primitive, { modele, fichier })
}

/**
 * Swap which model a mount shows. Mutating `src` reloads the GLB on the same entity, which
 * is what a pedestal needs when the item on it changes rarity. A no-op when nothing changed,
 * so calling it from a render loop costs one string compare.
 */
export function remonter(primitive: Entity, fichier: string): void {
  const m = montages.get(primitive)
  if (m === undefined) { montable(primitive, fichier); return }
  if (m.fichier === fichier) return
  m.fichier = fichier
  const g = GltfContainer.getMutableOrNull(m.modele)
  if (g !== null) g.src = TOY_DIR + fichier
  // A new file may not exist: put the stand-in back until the loader says otherwise.
  if (!MeshRenderer.has(primitive)) MeshRenderer.setBox(primitive)
}

/** Take the model off a mount and bring the stand-in back, for a pedestal that emptied. */
export function demonter(primitive: Entity): void {
  const m = montages.get(primitive)
  if (m === undefined) return
  montages.delete(primitive)
  engine.removeEntity(m.modele)
  if (!MeshRenderer.has(primitive)) MeshRenderer.setBox(primitive)
}

export function setupToy(): void {
  engine.addSystem(() => {
    for (const [primitive, m] of montages) {
      const st = GltfContainerLoadingState.getOrNull(m.modele)
      if (st === null) continue
      if (st.currentState === LoadingState.FINISHED) {
        // The model is in: the stand-in stops drawing but keeps its collider and its slot.
        if (MeshRenderer.has(primitive)) MeshRenderer.deleteFrom(primitive)
      }
    }
  })
}
