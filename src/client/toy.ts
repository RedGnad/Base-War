import { engine, Entity, Transform, GltfContainer, GltfContainerLoadingState, LoadingState, MeshRenderer, Material, PBMaterial_PbrMaterial } from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
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
  // The stand-in is guaranteed drawable on every mount, not only on remount: a pedestal that
  // was emptied and refilled comes back through here, and it must come back visible.
  if (!MeshRenderer.has(primitive)) MeshRenderer.setBox(primitive)
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

/**
 * Seven toys from four primitives, until the artist's models arrive.
 *
 * The engine draws boxes, spheres, planes and cylinders, and a cylinder with different top
 * and bottom radii is a cone or a spinning top. Two children under a unit-cube parent, each a
 * flat plastic, give every rarity its own silhouette readable from across the plaza:
 *
 *   Common     a marble, plain sphere
 *   Uncommon   a die: a cube with a smaller cube sat on it, like stacked blocks
 *   Rare       a spinning top: cone on a disc
 *   Epic       a rocket: cylinder with a cone nose
 *   Legendary  a trophy: cone cup on a stem
 *   Mythic     a crystal: two cones point to point
 *   Secret     a star: sphere with a wide flat ring
 *
 * All parts are children of the pedestal entity at unit scale, so the pedestal's own scale
 * (rarity, mutation) sizes the whole toy, and `montable()` still swaps the lot for a GLB the
 * moment the file exists. The pedestal itself stops drawing: it is the parent, not the toy.
 * Two extra entities per pedestal is 8,640 more on a full field, against a cap of 28,800.
 */
const formes = new Map<Entity, { parts: Entity[]; rarete: number }>()

function part(parent: Entity, pos: Vector3, scale: Vector3, kind: 'box' | 'sphere' | 'cone' | 'cyl' | 'disc'): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: pos, scale })
  if (kind === 'box') MeshRenderer.setBox(e)
  else if (kind === 'sphere') MeshRenderer.setSphere(e)
  else if (kind === 'cone') MeshRenderer.setCylinder(e, 0.5, 0.0)
  else if (kind === 'cyl') MeshRenderer.setCylinder(e, 0.5, 0.5)
  else MeshRenderer.setCylinder(e, 0.5, 0.5)
  return e
}

function silhouette(parent: Entity, rarete: number): Entity[] {
  const V = Vector3.create
  switch (rarete) {
    case 0: return [part(parent, V(0, 0, 0), V(1, 1, 1), 'sphere')]
    case 1: return [part(parent, V(0, -0.2, 0), V(1, 0.6, 1), 'box'), part(parent, V(0.15, 0.35, 0.1), V(0.55, 0.55, 0.55), 'box')]
    case 2: return [part(parent, V(0, -0.35, 0), V(1, 0.3, 1), 'disc'), part(parent, V(0, 0.25, 0), V(0.8, 0.9, 0.8), 'cone')]
    case 3: return [part(parent, V(0, -0.15, 0), V(0.6, 0.9, 0.6), 'cyl'), part(parent, V(0, 0.55, 0), V(0.6, 0.5, 0.6), 'cone')]
    case 4: return [part(parent, V(0, -0.4, 0), V(0.3, 0.5, 0.3), 'cyl'), part(parent, V(0, 0.25, 0), V(1, 0.8, 1), 'cone')]
    case 5: return [part(parent, V(0, 0.3, 0), V(0.8, 0.7, 0.8), 'cone'), part(parent, V(0, -0.3, 0), V(0.8, 0.7, 0.8), 'cone')]
    default: return [part(parent, V(0, 0, 0), V(0.6, 0.6, 0.6), 'sphere'), part(parent, V(0, 0, 0), V(1.3, 0.08, 1.3), 'disc')]
  }
}

/** Give a pedestal (or a hand, or a belt crate) the toy of a rarity, rebuilt only if it changed. */
export function formeDeRarete(parent: Entity, rarete: number, materiau: PBMaterial_PbrMaterial): void {
  const cur = formes.get(parent)
  if (cur !== undefined && cur.rarete === rarete) {
    for (const e of cur.parts) Material.setPbrMaterial(e, materiau)
    return
  }
  if (cur !== undefined) for (const e of cur.parts) engine.removeEntity(e)
  const parts = silhouette(parent, rarete)
  for (const e of parts) Material.setPbrMaterial(e, materiau)
  formes.set(parent, { parts, rarete })
  // The parent is a container now: its own box would sit inside the toy.
  if (MeshRenderer.has(parent)) MeshRenderer.deleteFrom(parent)
}

export function effacerForme(parent: Entity): void {
  const cur = formes.get(parent)
  if (cur === undefined) return
  for (const e of cur.parts) engine.removeEntity(e)
  formes.delete(parent)
}

export function setupToy(): void {
  engine.addSystem(() => {
    for (const [primitive, m] of montages) {
      const st = GltfContainerLoadingState.getOrNull(m.modele)
      if (st === null) continue
      if (st.currentState === LoadingState.FINISHED) {
        // The model is in: the stand-in, box or toy, stops drawing but keeps its collider and slot.
        if (MeshRenderer.has(primitive)) MeshRenderer.deleteFrom(primitive)
        effacerForme(primitive)
      }
    }
  })
}
