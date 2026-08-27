import { engine, Entity, Transform, GltfContainer, GltfContainerLoadingState, LoadingState, MeshRenderer, Material, PBMaterial_PbrMaterial, LightSource, Tween, TweenSequence, TweenLoop, EasingFunction } from '@dcl/sdk/ecs'
import { crate, mutation } from '../shared/loot-table'
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
  /** The pad every displayed toy stands on: darker than the slab, so a toy has a place, not a spot. */
  socle: '#bfb5a4',
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

/*
  Every base gets its own accent, from its owner's address, so five buildings are not five
  copies. A judge's first view is the plaza from its edge, and a tester's screenshot of it
  showed identical glass boxes: nothing said whose was whose, or that any was worth walking to.
  The accent is one of eight toy primaries chosen by hashing the address, painted on the ramp,
  the corner posts and the lintel, which are the parts that read from thirty metres. The name
  plate was the only differentiator, and text is the last thing legible at distance.
*/
const ACCENTS = ['#ff6b6b', '#ffd23f', '#4dabf7', '#51cf66', '#ff9f43', '#cc5de8', '#22b8cf', '#f06595'] as const
export function accentDe(address: string): string {
  let h = 0
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0
  return ACCENTS[h % ACCENTS.length]
}

/*
  One flat plastic. `glow` is the emissive intensity, zero for anything that is not lit.

  A glow nobody could see, explained by one line of the rendering doc: "use emissiveColor with
  a DARK albedoColor for maximum glow visibility". Seventeen sites passed the same bright colour
  as albedo and as emissive, so the surface was already at full brightness under the sky and
  the emissive had nowhere to go; the mobile renderer has no bloom to spill it past the edge.
  The tester saw no glow at any rarity, and that was correct rendering of a wrong material.

  So the albedo darkens as the glow rises: at glow 0 the plastic is its own colour, at glow 2
  it is a quarter of it, and the emissive term is what the eye reads. A lit toy is dark
  plastic with the colour coming out of it, which is also what a lit toy looks like.
*/
export function plastic(hex: string, glow = 0): PBMaterial_PbrMaterial {
  const c = Color4.fromHexString(hex.length === 7 ? hex + 'ff' : hex)
  if (glow <= 0) return { albedoColor: c, metallic: 0, roughness: 0.55 }
  /*
    Barely darkened, strongly emissive. The albedo used to be cut to 0.45 for a Rare with an
    emissive of 0.8 to make up for it, which only works under bloom; on a phone (no bloom, no
    scene lights) and on any toy outside the light budget, a Rare read as a DARK toy (tester,
    28 Aug: "no emission at all any more"). Emission is the workshop's own answer to lights.
  */
  const sombre = 1 / (1 + glow * 0.35)
  return {
    albedoColor: Color4.create(c.r * sombre, c.g * sombre, c.b * sombre, c.a),
    emissiveColor: Color3.create(c.r, c.g, c.b),
    emissiveIntensity: 0.6 + glow * 2.5,
    metallic: 0,
    roughness: 0.45
  }
}

/** The same rule for a colour that already exists as a Color4. */
export function plasticDe(c: Color4, glow = 0): PBMaterial_PbrMaterial {
  const hex = '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')
  const m = plastic(hex, glow)
  if (m.albedoColor !== undefined) m.albedoColor = Color4.create(m.albedoColor.r, m.albedoColor.g, m.albedoColor.b, c.a)
  return m
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
const montages = new Map<Entity, { modele: Entity; fichier: string; charge?: boolean }>()

/*
  The mount owns ONE fact about its primitive: whether the GLB has loaded. It never draws the
  stand-in itself. That is the silhouette's job (`formeDeRarete`), or the caller's, and two
  functions each "guaranteeing" a renderer on the same entity is how a pedestal ended up with
  a cube drawn back over its toy every time the rarity was mounted (invariant 184: one owner
  per fact).
*/
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
}

/** Take the model off a mount and bring the stand-in back, for a pedestal that emptied. */
export function demonter(primitive: Entity): void {
  const m = montages.get(primitive)
  if (m === undefined) return
  montages.delete(primitive)
  engine.removeEntity(m.modele)
}

/**
 * Seven toys from four primitives, until the artist's models arrive.
 *
 * The engine draws boxes, spheres, planes and cylinders, and a cylinder with a zero top radius
 * is a cone, point up. Two children under a unit-cube parent, each a flat plastic, give every
 * rarity its own silhouette readable from across the plaza:
 *
 *   Common     a marble, plain sphere
 *   Uncommon   stacked blocks: a cube with a smaller cube sat on it
 *   Rare       a party hat on a plate: cone on a disc
 *   Epic       a rocket: cylinder with a cone nose
 *   Legendary  a tree: wide cone on a stem
 *   Mythic     a pagoda: two cones stacked
 *   Secret     a star: sphere with a wide flat ring
 *
 * Every part stays INSIDE the unit cube, y from -0.5 to 0.5. The pedestal puts the cube's
 * bottom face on the slab, so anything below -0.5 is inside the floor, and on a storey above
 * it hangs out through the ceiling of the room underneath: the tester saw the stem of a
 * Legendary and the base of an Epic as coloured pucks on his ground-floor ceiling. The same
 * rule is the artist's contract in assets/toy/README.md, so a model and its stand-in agree.
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
    case 1: return [part(parent, V(0, -0.25, 0), V(1, 0.5, 1), 'box'), part(parent, V(0.12, 0.25, 0.08), V(0.5, 0.5, 0.5), 'box')]
    case 2: return [part(parent, V(0, -0.35, 0), V(1, 0.3, 1), 'disc'), part(parent, V(0, 0.15, 0), V(0.8, 0.7, 0.8), 'cone')]
    case 3: return [part(parent, V(0, -0.15, 0), V(0.6, 0.7, 0.6), 'cyl'), part(parent, V(0, 0.35, 0), V(0.6, 0.3, 0.6), 'cone')]
    case 4: return [part(parent, V(0, -0.3, 0), V(0.3, 0.4, 0.3), 'cyl'), part(parent, V(0, 0.2, 0), V(1, 0.6, 1), 'cone')]
    case 5: return [part(parent, V(0, 0.25, 0), V(0.8, 0.5, 0.8), 'cone'), part(parent, V(0, -0.25, 0), V(0.8, 0.5, 0.8), 'cone')]
    default: return [part(parent, V(0, 0, 0), V(0.6, 0.6, 0.6), 'sphere'), part(parent, V(0, 0, 0), V(1.3, 0.08, 1.3), 'disc')]
  }
}

/** Give a pedestal (or a hand, or a belt crate) the toy of a rarity, rebuilt only if it changed. */
export function formeDeRarete(parent: Entity, rarete: number, materiau: PBMaterial_PbrMaterial): void {
  // A loaded model is the body; the silhouette only stands in while there is none.
  if (montages.get(parent)?.charge === true) { effacerForme(parent); return }
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

/*
 * Every displayed toy stands on a pad; a mutation colours the pad.
 *
 * The first version drew a disc only under mutated toys, sized with the toy (1.9 times it),
 * to make a mutation a BODY change readable across the plaza. The tester's word for the
 * result was "messy": a floor where some toys had a plate and others had nothing read as
 * inconsistency, not as information, and a Gold Epic's disc was 3.2 m wide on pedestals
 * 3.06 m apart, so neighbouring discs cut into each other. A pastel mutation (Candy) at
 * emissive 1.6 also clipped to plain white.
 *
 * So the pad is a FIXED 1.4 m stand under every occupied slot, never scaled by the toy: pads
 * are 1.66 m apart on the tightest pitch and never touch. Plain toys stand on a neutral pad,
 * darker than the slab; a mutated toy's pad takes the mutation's colour, with an emissive
 * term below 1 so no hue clips to white. The same fact is written for every occupied slot,
 * which is what makes it read as a rule. The toy stands ON the pad, so the pedestal's height
 * includes the pad's thickness (`SOCLE_EPAISSEUR`) and a hair of air above the slab.
 */
export const SOCLE_DIAMETRE = 1.4
export const SOCLE_EPAISSEUR = 0.08
const socles = new Map<Entity, Entity>()

export function socleDuJouet(parent: Entity, size: number, mutationHex: string | null): void {
  let e = socles.get(parent)
  if (e === undefined) {
    e = engine.addEntity()
    MeshRenderer.setCylinder(e, 0.5, 0.5)
    socles.set(parent, e)
  }
  // Child of a parent scaled by `size`: divide, so the pad keeps its world size whatever the toy.
  // Its top face is the cube's bottom face: the toy stands on it.
  Transform.createOrReplace(e, {
    parent,
    position: Vector3.create(0, -0.5 - SOCLE_EPAISSEUR / 2 / size, 0),
    scale: Vector3.create(SOCLE_DIAMETRE / size, SOCLE_EPAISSEUR / size, SOCLE_DIAMETRE / size)
  })
  Material.setPbrMaterial(e, mutationHex === null ? plastic(TOY.socle) : plastic(mutationHex, 0.9))
}

export function effacerSocle(parent: Entity): void {
  const cur = socles.get(parent)
  if (cur === undefined) return
  engine.removeEntity(cur)
  socles.delete(parent)
}

/*
 * Light, for the toys worth crossing the room for.
 *
 * Emissive is a surface property: a lit toy glows and nothing around it knows. The mobile
 * renderer has no bloom to spill that glow onto the slab, so from the doorway a Legendary was
 * a bright shape standing on the same cream as a Common. A point light in the toy's colour is
 * the platform's own way to make an object light its room, and it renders on mobile: of the
 * whole rendering surface, only particles and audio analysis do not. One entity, a child at
 * the toy's base, so the pool lands on the slab and follows the toy's size.
 *
 * The renderer draws the four to ten lights nearest the player and drops the rest, which is
 * the right rule here: the lights that render are the ones in the base the judge is standing
 * in. Hue comes from the item, at full brightness so a dark mutation (Cursed, Blood) still
 * throws a coloured light; brightness comes from the glow; the range is explicit so a light
 * stays a pool under its own toy rather than a wash over the floor.
 *
 * The scale is the documentation's own anchor, not an example: "the default intensity is
 * 16000, this is the brightness of an average lightbulb", and "a light with the default
 * brightness will be hardly visible with the midday sun, like in the real world". A pool that
 * has to read under the sky therefore starts at one bulb and grows with the glow. The first
 * version took 200 to 700 candela from a sample snippet and was invisible by construction.
 * The light sits at the toy's centre: half a toy above the slab is where a point source makes
 * a pool about one toy wide, rather than a pin-prick at floor level.
 */
export const LUMIERE_MIN_GLOW = 0.8     // Rare and above; a mutation adds 1 and lights anything
const AMPOULE = 16000                    // candela; the documentation's "average lightbulb"
const lumieres = new Map<Entity, Entity>()

/** A hue at full brightness: the colour with its largest channel pushed to 1. */
export function vif(hex: string): Color4 {
  const c = Color4.fromHexString(hex.length === 7 ? hex + 'ff' : hex)
  const k = 1 / Math.max(c.r, c.g, c.b, 0.05)
  return Color4.create(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k), 1)
}

/*
  A light BUDGET, not a light per toy.

  Every Rare-or-better and every mutated toy asks for a point light, and so does every lit
  crate; sixty bases full of them is hundreds of lights, which the workshop names first among
  what a phone cannot carry ("don't overuse lights, use emission"). The wish is recorded here;
  a system every half second lights only the `LUMIERES_MAX` nearest to the player and takes
  the light off the rest. Emission on the toy's own plastic carries the rest of the glow.
*/
const LUMIERES_MAX = 16
const souhaits = new Map<Entity, { hex: string; glow: number }>()

export function lumiereDuJouet(parent: Entity, hex: string | null, glow: number): void {
  if (hex === null) {
    souhaits.delete(parent)
    const cur = lumieres.get(parent)
    if (cur !== undefined) { engine.removeEntity(cur); lumieres.delete(parent) }
    return
  }
  souhaits.set(parent, { hex, glow })
}

/** World position of an entity, up its parent chain; rotation ignored, which is fine for a distance. */
function positionMonde(e: Entity): Vector3 | null {
  let x = 0, y = 0, z = 0
  let cur: Entity | undefined = e
  for (let n = 0; n < 8 && cur !== undefined; n++) {
    const t = Transform.getOrNull(cur)
    if (t === null) return null
    x += t.position.x; y += t.position.y; z += t.position.z
    cur = t.parent
  }
  return Vector3.create(x, y, z)
}

function allumer(parent: Entity, hex: string, glow: number): void {
  let e = lumieres.get(parent)
  if (e === undefined) {
    e = engine.addEntity()
    Transform.create(e, { parent })
    lumieres.set(parent, e)
  }
  const c = vif(hex)
  LightSource.createOrReplace(e, {
    type: LightSource.Type.Point({}),
    color: Color3.create(c.r, c.g, c.b),
    intensity: AMPOULE * (1 + glow),
    range: 1.5 + glow,
    shadow: false
  })
}

function budgetDeLumiere(): void {
  const moi = Transform.getOrNull(engine.PlayerEntity)
  if (moi === null) return
  const classes: Array<{ parent: Entity; d: number }> = []
  for (const [parent] of souhaits) {
    if (!Transform.has(parent)) { souhaits.delete(parent); continue }
    const p = positionMonde(parent)
    if (p === null) continue
    classes.push({ parent, d: Vector3.distanceSquared(p, moi.position) })
  }
  classes.sort((a, b) => a.d - b.d)
  const garder = new Set(classes.slice(0, LUMIERES_MAX).map((c) => c.parent))
  for (const parent of garder) {
    const s = souhaits.get(parent)
    if (s !== undefined) allumer(parent, s.hex, s.glow)
  }
  for (const [parent, e] of [...lumieres]) {
    if (garder.has(parent)) continue
    engine.removeEntity(e)
    lumieres.delete(parent)
  }
}

export function effacerLumiere(parent: Entity): void { lumiereDuJouet(parent, null, 0) }

/**
 * Remove an entity and everything this module hung under it.
 *
 * `removeEntity` does not take children, and the silhouette, the pad, the light and the
 * mounted model are all children, held in maps keyed by the parent. A view torn down with a
 * bare `removeEntity` left them behind twice: as orphans in the world, drawn at their local
 * offsets from a parent that no longer exists, and as map entries nothing would ever clear.
 * The ramp's handrails had the same bug, and the same fix.
 */
export function demolir(parent: Entity): void {
  effacerForme(parent)
  effacerCaisse(parent)
  effacerSocle(parent)
  effacerLumiere(parent)
  demonter(parent)
  engine.removeEntity(parent)
}

export function effacerForme(parent: Entity): void {
  const cur = formes.get(parent)
  if (cur === undefined) return
  for (const e of cur.parts) engine.removeEntity(e)
  formes.delete(parent)
}

/*
 * A crate is a lidded box with straps, and the lid is what glows.
 *
 * Crates were plain cubes in three places (the belt, the convoy, the smash in front of the
 * player), each drawn by its own code, each a cube with one emissive tint. A cube says
 * nothing about being a container, and nothing about what is inside. This is the one crate:
 * a body in the tier's plastic, two straps, a latch, and a lid that glows harder as the tier
 * rises and floats a few centimetres, so a crate on the belt reads as alive from across the
 * plaza. A themed crate (Gold, Lava, Cursed) wears its mutation as glowing straps: the thing
 * it is likely to yield is written on it. Rare and above, and every themed crate, also throw
 * a light on the belt. `chauffe` is how far along a smash it is: the whole crate heats up.
 * The artist's `crate-<id>.glb` replaces all of it through the same mount as the toys.
 */
type Caisse = { parts: Entity[]; crateId: number }
const caisses = new Map<Entity, Caisse>()

export function caisse(racine: Entity, crateId: number, chauffe = 0): void {
  const c = crate(crateId)
  const theme = c.theme >= 0 ? mutation(c.theme).color : null
  let k = caisses.get(racine)
  if (k !== undefined && k.crateId !== crateId) { effacerCaisse(racine); k = undefined }
  if (k === undefined) {
    const V = Vector3.create
    const parts = [
      part(racine, V(0, -0.11, 0), V(1, 0.78, 1), 'box'),          // body
      part(racine, V(0, -0.11, 0), V(1.04, 0.16, 1.04), 'box'),    // strap around
      part(racine, V(0, -0.11, 0), V(0.16, 0.8, 1.04), 'box'),     // strap over
      part(racine, V(0, 0.39, 0), V(1.12, 0.22, 1.12), 'box'),     // lid
      part(racine, V(0, 0.16, 0.53), V(0.2, 0.2, 0.06), 'box'),    // latch
      part(racine, V(0, -0.52, 0), V(0, 0, 0), 'cyl')                // glow disc, Rare and above
    ]
    k = { parts, crateId }
    caisses.set(racine, k)
    // The root is a container now; its own box would sit inside the crate.
    if (MeshRenderer.has(racine)) MeshRenderer.deleteFrom(racine)
    // The lid breathes: six centimetres up and back, for ever. A child's Move tween is local.
    Tween.setMove(parts[3], V(0, 0.39, 0), V(0, 0.45, 0), 900, EasingFunction.EF_EASESINE)
    TweenSequence.create(parts[3], { sequence: [], loop: TweenLoop.TL_YOYO })
  }
  const [corps, sangleH, sangleV, couvercle, loquet, halo] = k.parts
  const base = Color4.fromHexString(c.color + 'ff')
  Material.setPbrMaterial(corps, plastic(c.color, chauffe * 1.2))
  Material.setPbrMaterial(couvercle, plastic(c.color, 0.8 + c.tier * 0.8 + chauffe * 1.6))
  const sangle = theme === null
    ? plasticDe(Color4.create(base.r * 0.55, base.g * 0.55, base.b * 0.55, 1))
    : plastic(theme, 1.2 + chauffe)
  Material.setPbrMaterial(sangleH, sangle)
  Material.setPbrMaterial(sangleV, sangle)
  Material.setPbrMaterial(loquet, plastic(TOY.wallCream))
  remonter(racine, `crate-${crateId}.glb`)
  const eclaire = c.tier >= 2 || theme !== null
  lumiereDuJouet(racine, eclaire ? (theme ?? c.color) : null, 0.8 + c.tier * 0.6)
  /*
    The halo: a breathing, see-through sphere in the crate's colour around anything Rare or
    themed. The point light and the emissive lid depend on the client's quality preset (no
    scene lights on Low, bloom from Medium up) and on the sun, which here is fixed at noon;
    a tester on the belt saw no glow on any crate, high tiers included. A translucent shell
    is drawn on every preset, in any light, and reads as "glow" from the plaza edge, which is
    what the rare drops of the genre look like.
  */
  /*
    The glow is an OPAQUE emissive disc under the crate that breathes, not a translucent
    sphere around it. The workshop's word for alpha on a phone GPU is "brutal", and a halo
    was one alpha mesh per lit crate; a lit disc reads as the same pool of light from the
    plaza edge and costs what any plastic costs.
  */
  const ht = Transform.getMutableOrNull(halo)
  if (eclaire) {
    const hex = theme ?? c.color
    Material.setPbrMaterial(halo, plastic(hex, 2.5 + c.tier))
    const taille = 1.7 + c.tier * 0.15
    if (ht !== null && ht.scale.x === 0) ht.scale = Vector3.create(taille, 0.05, taille)
    if (!Tween.has(halo)) {
      Tween.setScale(halo, Vector3.create(taille, 0.05, taille), Vector3.create(taille * 1.18, 0.05, taille * 1.18), 1100, EasingFunction.EF_EASESINE)
      TweenSequence.create(halo, { sequence: [], loop: TweenLoop.TL_YOYO })
    }
  } else {
    Tween.deleteFrom(halo)
    TweenSequence.deleteFrom(halo)
    if (ht !== null && ht.scale.x !== 0) ht.scale = Vector3.Zero()
  }
}

export function effacerCaisse(racine: Entity): void {
  const k = caisses.get(racine)
  if (k === undefined) return
  for (const e of k.parts) engine.removeEntity(e)
  caisses.delete(racine)
}

export function setupToy(): void {
  let accLumiere = 0
  engine.addSystem((dt) => {
    accLumiere += dt
    if (accLumiere >= 0.5) { accLumiere = 0; budgetDeLumiere() }
  })
  engine.addSystem(() => {
    for (const [primitive, m] of montages) {
      const st = GltfContainerLoadingState.getOrNull(m.modele)
      if (st === null) continue
      if (st.currentState === LoadingState.FINISHED) {
        // The model is in: the stand-in, box or toy, stops drawing but keeps its collider and slot.
        if (MeshRenderer.has(primitive)) MeshRenderer.deleteFrom(primitive)
        effacerForme(primitive)
        montages.set(primitive, { ...m, charge: true })
      }
    }
  })
}
