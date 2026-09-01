import {
  TOY, plastic, plasticDe, acrylic, montable, remonter, demonter, formeDeRarete, effacerForme, socleDuJouet, effacerSocle, SOCLE_EPAISSEUR, lumiereDuJouet, effacerLumiere, LUMIERE_MIN_GLOW, demolir, accentDe, estMetal, matiereMetal
} from './toy'
import { PRODUCTION_PER_RARITY } from '../shared/economy'
import { PBMaterial_PbrMaterial, TextureWrapMode,
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, BillboardMode, Entity, PointerEvents, PointerEventType, InputAction, inputSystem, Tween, TweenSequence, TweenLoop, EasingFunction, ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector2, Color3, Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import {
  Plot, SLOTS_PER_FLOOR, MAX_FLOORS, FLOOR_HEIGHT, SLAB_THICKNESS, PLACE_RANGE, slotPosition, VIDE, occupe, rampPosition, BASE_SIDE, WALL_THICKNESS, WALL_HEIGHT, DOOR_WIDTH, RAMP_ANGLE, RAMP_LENGTH, STAIRWELL_WIDTH, sensDeBase, tourner
} from '../shared/schemas'
import { rarity, rarityOf, mutationDe, itemColor, mutation, formatIncome, itemIncome, nomDuCode, traitsDe } from '../shared/loot-table'
import { poserTexte3D, Segment3D } from './texte3d'

const INCOME_UI = PRODUCTION_PER_RARITY
/** The elevator's local spot in a base (its +x, -z corner); shared by the model and the ride. */
const ASC_X = BASE_SIDE / 2 - 1.1
const ASC_Z = -BASE_SIDE / 2 + 1.1


function goUpOneFloor(v: View): void {
  // The base's WORLD position is the racine's; the plinth is its child at local (0,0,0), so
  // reading the plinth teleported the player to the scene origin, the far corner of the map
  // (tester, 28 Aug: "go home sends me to a corner").
  const t = Transform.getOrNull(v.racine)
  if (t === null) return
  let open = 1
  for (const [, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() === v.ownerId.toLowerCase()) { open = p.floors; break }
  }
  const moi = Transform.getOrNull(engine.PlayerEntity)
  const actuel = moi === null ? 0 : Math.max(0, Math.round(moi.position.y / FLOOR_HEIGHT))
  const cible = actuel + 1 >= open ? 0 : actuel + 1
  const y = cible * FLOOR_HEIGHT + 0.3
  // Land on the MAIN slab, camera on the elevator, so it stays on screen and the player can
  // spam the click to keep climbing (tester, 28 Aug). Not merely beside the elevator: the
  // stairwell hole spans x in [c/2-STAIRWELL, c/2] with its guard rail a step further in, so
  // "one step in from the corner" put the player on the narrow strip BEHIND the rail, at the
  // lip of the very hole left for jumping down (tester, 28 Aug, second pass). The slab proper
  // ends at the rail, x = c/2 - STAIRWELL_WIDTH = 3.4; land a stride inside it, facing the
  // elevator across the rail, which a click clears since the pillar is storey-tall.
  const pied = tourner(t.position.z, ASC_X - 3.5, ASC_Z + 1.6)
  const el = tourner(t.position.z, ASC_X, ASC_Z)
  void movePlayerTo({
    newRelativePosition: Vector3.create(t.position.x + pied.dx, y, t.position.z + pied.dz),
    cameraTarget: Vector3.create(t.position.x + el.dx, y + 1.0, t.position.z + el.dz)
  })
}
import { steal, monAdresseClient, alerter } from './theft'
import { pickUp } from './carry'
import { HUE } from './theme'
import { movePlayerTo } from '~system/RestrictedActions'
import { isMobile } from '@dcl/sdk/platform'

type Floor = { floorSlab: Entity; walls: Entity[]; ramp: Entity; landing: Entity; sentry: Entity }
type View = {
  plinth: Entity; label: Entity; gain: Entity; door: Entity; plaque: Entity; plaqueGlyphes: Entity | null
  floors: Floor[]; items: Entity[]; ascenseur: Entity; signature: string; ownerId: string
  /** The base's root: at its centre, turned to face the belt; every part is a child in base-local metres. */
  racine: Entity
  /** The skin last painted, and how many storeys it was painted on. */
  skin: number; peints: number
}

/** World-label colours, built here rather than read from the shared token object: that one
 * is constructed at module load and a system can run before its module was touched. */
const NOIR = Color3.create(0, 0, 0)
const VERT = Color4.fromHexString(HUE.money + 'ff')

// The toy palette lives in toy.ts; these are the roles a base is built from.
const GRIS = TOY.post
const GRIS_CLAIR = TOY.lintel
const FLOOR_COLOR = TOY.slab

/**
 * The moulded-plastic finish for a base's big flat surfaces: the slab texture tiled at one
 * metre, tinted by the same hex the plain plastic wore. Only the slab and the plinth get
 * it: they are the surfaces a player actually looks at, and a texture on every post and
 * lintel would be texture cost for faces nobody sees.
 */
function plastiqueMoule(hex: string, sx: number, sz: number): PBMaterial_PbrMaterial {
  return {
    ...plastic(hex),
    texture: Material.Texture.Common({
      src: 'assets/textures/mat-wall.png',
      wrapMode: TextureWrapMode.TWM_REPEAT,
      tiling: Vector2.create(Math.max(1, Math.round(sx / 4)), Math.max(1, Math.round(sz / 4)))
    })
  }
}
/** Air between a toy's underside and the slab it stands on. */
const JEU = 0.02

/**
 * The size every piece was built at, so showing and hiding never has to restate it.
 *
 * A floor used to be described twice: once here, with its real dimensions, and once again in
 * the update below, where the same numbers were typed out a second time to scale a piece back
 * up after it had been collapsed to zero. Two descriptions of one shape can disagree, and
 * they did: the update handled `walls[0]` through `walls[9]` while the builder appended three
 * more for the stairwell railings, so those three were never scaled at all and stayed hanging
 * in the air over floors nobody had bought.
 *
 * Recording the size at construction removes the second description. Anything built through
 * these helpers is hidden and shown correctly forever after, including pieces added later by
 * somebody who never reads this comment.
 */
const taille = new Map<Entity, Vector3>()

/**
 * The base being built, or null. Parts made while it is set are its children, in local
 * metres, so the one rotation on the root turns the whole building toward the belt.
 */
let parentCourant: Entity | null = null

/**
 * `solide` false for the decorative parts: lintel, corner posts, stairwell rails. A collider on
 * every decorative box was the workshop's own example of what tanks a phone ("decorative props,
 * no collision"); a base had eight of them per storey that nothing ever touched.
 */
function bloc(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, solide = true): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent: parentCourant ?? undefined, position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  taille.set(e, Vector3.create(sx, sy, sz))
  MeshRenderer.setBox(e)
  if (solide) MeshCollider.setBox(e)
  Material.setPbrMaterial(e, plastic(color))
  return e
}

function vitre(x: number, y: number, z: number, sx: number, sy: number, sz: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent: parentCourant ?? undefined, position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  taille.set(e, Vector3.create(sx, sy, sz))
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, acrylic(TOY.glass))
  return e
}

function buildFloor(x: number, z: number, floor: number, accent: string): Floor {
  const y = floor * FLOOR_HEIGHT
  const c = BASE_SIDE
  const h = WALL_HEIGHT
  const ep = WALL_THICKNESS

  const floorSlab = bloc(x - STAIRWELL_WIDTH / 2, y + SLAB_THICKNESS / 2, z, c - STAIRWELL_WIDTH, SLAB_THICKNESS, c, FLOOR_COLOR)
  Material.setPbrMaterial(floorSlab, plastiqueMoule(FLOOR_COLOR, c - STAIRWELL_WIDTH, c))
  const walls: Entity[] = [
    vitre(x, y + h / 2, z - c / 2, c, h, ep),                            // fond
    vitre(x - c / 2, y + h / 2, z, ep, h, c),                            // gauche
    vitre(x + c / 2, y + h / 2, z, ep, h, c),                            // droite
    vitre(x - (c + DOOR_WIDTH) / 4, y + h / 2, z + c / 2, (c - DOOR_WIDTH) / 2, h, ep),
    vitre(x + (c + DOOR_WIDTH) / 4, y + h / 2, z + c / 2, (c - DOOR_WIDTH) / 2, h, ep),
    bloc(x, y + h - 0.15, z + c / 2, DOOR_WIDTH, 0.3, ep, accent, false),  // linteau
    bloc(x - c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, accent, false),
    bloc(x + c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, accent, false),
    bloc(x - c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, accent, false),
    bloc(x + c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, accent, false)
  ]

  const r = rampPosition(floor)
  const ramp = engine.addEntity()
  Transform.create(ramp, {
    parent: parentCourant ?? undefined,
    position: Vector3.create(x + r.dx, y + FLOOR_HEIGHT / 2, z + r.dz),
    scale: Vector3.create(STAIRWELL_WIDTH - 0.3, 0.18, RAMP_LENGTH),
    rotation: Quaternion.fromEulerDegrees(-RAMP_ANGLE, 0, 0)
  })
  taille.set(ramp, Vector3.create(STAIRWELL_WIDTH - 0.3, 0.18, RAMP_LENGTH))
  MeshRenderer.setBox(ramp)
  MeshCollider.setBox(ramp)
  Material.setPbrMaterial(ramp, plastic(accent))

  /*
    Railings, sized in metres and then divided by the ramp they hang from.

    A child's transform is multiplied by its parent's, and the ramp is a very flat, very long
    box, so a rail written directly in parent space needs numbers like 3.0 and 6.0 that mean
    nothing and quietly break the moment a floor gets taller. These are written as the metres
    they should measure, then converted once.
  */
  const rampeX = STAIRWELL_WIDTH - 0.3
  const RAIL_H = 1.1
  for (const cote of [-1, 1]) {
    const rail = engine.addEntity()
    Transform.create(rail, {
      parent: ramp,
      position: Vector3.create(cote * (rampeX / 2 - 0.03) / rampeX, (RAIL_H + 0.18) / 2 / 0.18, 0),
      scale: Vector3.create(0.06 / rampeX, RAIL_H / 0.18, 1.0)
    })
    MeshRenderer.setBox(rail)
    MeshCollider.setBox(rail)
    Material.setPbrMaterial(rail, plastic(TOY.rail))
  }

  /*
    Somewhere to put your foot at the top.

    The ramp climbs through the middle of the stairwell, at x = BASE_SIDE/2 - STAIRWELL/2,
    while the floor above stops at the edge of the same hole, a metre and a half short. So the
    last step of the climb arrived over open air: measured, not noticed by eye, because the
    two pieces are defined in different functions and neither knows the other exists. This is
    the landing that joins them, sitting at the upper floor's level just past the top of the
    slope.
  */
  const course = RAMP_LENGTH * Math.cos((RAMP_ANGLE * Math.PI) / 180)
  const landing = bloc(
    x + r.dx, y + FLOOR_HEIGHT + SLAB_THICKNESS / 2, z + r.dz + course / 2 + 1.2,
    STAIRWELL_WIDTH, SLAB_THICKNESS, 2.4, FLOOR_COLOR
  )

  /*
    The stairwell strip is FLOOR now, not a fenced pit.

    What stood here: a guard rail along the strip's whole fourteen metres, plus the strip
    itself left open wherever the ramp was not. A tester walked up the ramp and was fenced
    off the slab at every storey by a rail built for the full length of a hole that no
    longer needed guarding (31 Aug: "impossible de monter, une rambarde bloque a chaque
    etage"). We never felt it because we click the elevator.

    Now the strip is filled flush with the slab, except the one opening each storey truly
    needs: the shaft where the ramp from below rises through, plus head-room before its
    landing. Two short guards fence exactly that shaft and nothing else. The fillers sit
    past index 9 in `walls`, where `repeindre` never reaches, so skins stay intact.
  */
  const bande = c / 2 - STAIRWELL_WIDTH / 2          // strip centre line, x = 5.2
  const haut = course / 2                            // where the ramp below tops out, z = 3.2
  const finPalier = haut + 2.4                       // the landing covers [haut, finPalier]
  if (floor === 0) {
    const plein = bloc(x + bande, y + SLAB_THICKNESS / 2, z, STAIRWELL_WIDTH, SLAB_THICKNESS, c, FLOOR_COLOR)
    Material.setPbrMaterial(plein, plastiqueMoule(FLOOR_COLOR, STAIRWELL_WIDTH, c))
    walls.push(plein)
  } else {
    /*
      Basic architecture, the owner's words (1 Sep) after the first cut of this hole put a
      metre of ceiling over the climb: a climber's head reaches the slab above at z = 0.16,
      and the opening began at 1.0. So the strip on upper storeys is now three dumb pieces:
      solid floor behind the ramp's own start, the whole middle left OPEN above the climb,
      solid floor between landing and front wall. No rails anywhere: a misstep drops you
      onto the ramp below, which is the genre's answer, not a fence.
    */
    const finArriere = -1.2
    const a = bloc(x + bande, y + SLAB_THICKNESS / 2, z + (-c / 2 + finArriere) / 2, STAIRWELL_WIDTH, SLAB_THICKNESS, finArriere + c / 2, FLOOR_COLOR)
    Material.setPbrMaterial(a, plastiqueMoule(FLOOR_COLOR, STAIRWELL_WIDTH, finArriere + c / 2))
    const b = bloc(x + bande, y + SLAB_THICKNESS / 2, z + (finPalier + c / 2) / 2, STAIRWELL_WIDTH, SLAB_THICKNESS, c / 2 - finPalier, FLOOR_COLOR)
    Material.setPbrMaterial(b, plastiqueMoule(FLOOR_COLOR, STAIRWELL_WIDTH, c / 2 - finPalier))
    walls.push(a, b)
  }

  /*
    One turret per storey, born with the storey it defends.

    A defence that is a number tells a visitor nothing. A defence that stands on the third
    floor and not on the first tells them where to go, before anybody explains a rule, and
    that reading IS the counterplay: find the storey nobody guarded. It is created here rather
    than up front so an unbought floor still costs nothing.
  */
  const sentry = engine.addEntity()
  Transform.create(sentry, {
    parent: parentCourant ?? undefined,
    position: Vector3.create(x + c / 2 - 1.1, y + 1.2, z - c / 2 + 1.1),
    scale: Vector3.create(0, 0, 0)
  })
  MeshRenderer.setCylinder(sentry, 0.25, 0.45)
  Material.setPbrMaterial(sentry, plastic(TOY.sentry, 1.6))
  montable(sentry, 'sentry.glb')

  return { floorSlab, walls, ramp, landing, sentry }
}
const views = new Map<number, View>()   // clef = entite synchronisee du Plot

/** The lintel, posts and ramp: the owner's accent, or the mutation skin their collection unlocked. */
function accentPour(p: { ownerId: string; skin: number }): string {
  return p.skin > 0 ? mutation(p.skin).color : accentDe(p.ownerId)
}

/*
  A skin repaints what the accent paints, plus a wash on the glass, so a Lava base reads as
  Lava from the plaza edge and not only up close. Painted once per skin and once per storey:
  a storey built after the skin was chosen arrives with the accent but plain glass.
*/
function repeindre(v: View, p: { ownerId: string; skin: number }): void {
  if (v.skin === p.skin && v.peints === v.floors.length) return
  v.skin = p.skin
  v.peints = v.floors.length
  const accent = accentPour(p)
  const teinte = Color4.fromHexString(accent + 'ff')
  const verre = p.skin > 0 ? Color4.create(teinte.r, teinte.g, teinte.b, 0.3) : TOY.glass
  for (const et of v.floors) {
    for (let i = 0; i < et.walls.length; i++) {
      if (i < 5) Material.setPbrMaterial(et.walls[i], acrylic(verre))
      else if (i < 10) Material.setPbrMaterial(et.walls[i], plastic(accent))
    }
    Material.setPbrMaterial(et.ramp, plastic(accent))
  }
}

/**
 * A shield that goes up around you puts you out; it does not wall you in.
 *
 * The shield earned by being robbed rises the instant the theft succeeds, which is the instant
 * the thief stands deepest inside the building. It became a solid box with the thief in it,
 * camera against the walls, no way out, loot in hand. The base-raid genre's own rule is that a
 * lock pushes intruders off the property, so anybody who is not the owner and is inside when
 * it seals is set down at the doorstep. The chase starts outside, not in a cell.
 */
function expulser(base: Vector3, floors: number): void {
  const moi = Transform.getOrNull(engine.PlayerEntity)
  if (moi === null) return
  const dx = Math.abs(moi.position.x - base.x), dz = Math.abs(moi.position.z - base.z)
  const dedans = dx <= BASE_SIDE / 2 + 0.6 && dz <= BASE_SIDE / 2 + 0.6 && moi.position.y <= floors * FLOOR_HEIGHT + 1
  if (!dedans) return
  const o = tourner(base.z, 0, BASE_SIDE / 2 + 2.5)
  const porte = Vector3.create(base.x + o.dx, 0.3, base.z + o.dz)
  void movePlayerTo({ newRelativePosition: porte, cameraTarget: Vector3.create(base.x, 2, base.z) })
  alerter('SEALED  ·  you were pushed out', '#ffd166', 3000)
}

/** One pedestal: a small box under the floor until something stands on it, with the steal handle. */
function creerSocle(racine: Entity, k: number): Entity {
  const o = engine.addEntity()
  const d = slotPosition(k)
  Transform.create(o, {
    parent: racine,
    position: Vector3.create(d.dx, -5, d.dz),
    scale: Vector3.create(0.45, 0.45, 0.45)
  })
  MeshRenderer.setBox(o)
  // Pointer only: a toy on a shelf is clicked, never walked into. And on a phone not even
  // that: the contextual button takes the pedestal in front of the player (`padEnFace`),
  // so a handset carries no collider per displayed toy at all (tester's ask, 30 Aug).
  if (!isMobile()) {
    MeshCollider.setBox(o, ColliderLayer.CL_POINTER)
    PointerEvents.create(o, {
      pointerEvents: [
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Steal' } }
      ]
    })
  }
  return o
}

function createView(x: number, z: number, accent: string): View {
  // One root at the centre, turned so the door faces the belt; everything below is local to it.
  const racine = engine.addEntity()
  Transform.create(racine, { position: Vector3.create(x, 0, z), rotation: Quaternion.fromEulerDegrees(0, sensDeBase(z) === -1 ? 180 : 0, 0) })
  parentCourant = racine
  const plinth = bloc(0, 0.06, 0, BASE_SIDE + 1.6, 0.12, BASE_SIDE + 1.6, TOY.plinth)
  Material.setPbrMaterial(plinth, plastiqueMoule(TOY.plinth, BASE_SIDE + 1.6, BASE_SIDE + 1.6))

  /*
    Only the ground floor is built here; the rest appear when they are bought.

    Every base used to create all of its possible floors at once, hidden by a zero scale.
    That was affordable at three. At eight, with sixty bases on screen, it is several
    thousand entities standing in for buildings nobody has earned, paid for in scene budget
    and in network traffic the moment anyone walks in. Floors are added in the update below
    as the plot reports them, so an unreached floor costs exactly nothing.
  */
  const floors: Floor[] = [buildFloor(0, 0, 0, accent)]

  const ascenseur = engine.addEntity()
  Transform.create(ascenseur, {
    parent: racine,
    // In the corner, at the foot of the ramp, out of the walking path (tester's placement, 28 Aug).
    position: Vector3.create(ASC_X, FLOOR_HEIGHT / 2, ASC_Z),
    scale: Vector3.create(0.5, FLOOR_HEIGHT, 0.5)
  })
  MeshRenderer.setBox(ascenseur)
  MeshCollider.setBox(ascenseur)
  Material.setPbrMaterial(ascenseur, {
    ...plastic(TOY.elevator, 0.5),
    metallic: 0.85, roughness: 0.25
  })
  PointerEvents.create(ascenseur, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Go up' } }
    ]
  })

  const door = engine.addEntity()
  Transform.create(door, {
    parent: racine,
    position: Vector3.create(0, (MAX_FLOORS * FLOOR_HEIGHT) / 2, 0),
    scale: Vector3.create(0, 0, 0)
  })
  MeshRenderer.setBox(door)
  // A shield you can walk through is a lie. It had a renderer and no collider, so it
  // looked like a wall and stopped nothing.
  MeshCollider.setBox(door)
  Material.setPbrMaterial(door, {
    albedoColor: TOY.shield,
    emissiveColor: Color3.fromHexString(TOY.sentry),
    emissiveIntensity: 0.55,
    metallic: 0,
    roughness: 0.1
  })
  /*
    The plinth answers to nothing, so it offers nothing.

    It carried a pointer event reading "Leave a gift", from the days when giving meant
    clicking somebody's base with an item selected. That mechanic went when carrying arrived,
    the handler with it, and this was left behind: a hover text promising an action nobody can
    take. An affordance that lies is worse than none, because the player who tries it learns
    the interface is not to be trusted.
  */


  // A base reads like a belt crate: what it earns in green above who owns it in white,
  // both outlined so they hold over sky, grass or a wall. One TextShape carries one colour,
  // which is why this is two entities and not two lines of one.
  const gain = engine.addEntity()
  Transform.create(gain, { position: Vector3.create(x, FLOOR_HEIGHT + 1.82, z), scale: Vector3.create(0.75, 0.75, 0.75) })
  Billboard.create(gain, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(gain, {
    text: '', fontSize: 4.4, textColor: VERT, outlineWidth: 0.22, outlineColor: NOIR
  })

  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(x, FLOOR_HEIGHT + 1.15, z), scale: Vector3.create(0.75, 0.75, 0.75) })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(label, {
    text: '', fontSize: 3, textColor: Color4.White(), outlineWidth: 0.22, outlineColor: NOIR
  })

  /*
    The reference writes the owner on the building itself: a sign over the entrance, facing
    the belt everyone walks, part of the facade rather than a satellite. The floating pair
    used to hang at the FULL possible height, twenty-two metres up on a one-storey base:
    correct for nobody. It now rides just above what is actually built (adjusted with the
    storeys, below), and this plate answers "whose is this" from the street.
  */
  const plaque = engine.addEntity()
  Transform.create(plaque, {
    parent: racine,
    // Well clear of the glass. The anchor sat one centimetre off the pane, and the navy
    // plate hangs at +0.05 LOCAL, which the half-turn below sends TOWARD the wall: the
    // sign was inside the glazing (owner, 1 Sep: "fondu dans la vitre"). A hand's width
    // of air keeps plate and letters in front of the reflections.
    position: Vector3.create(0, WALL_HEIGHT + 0.35, BASE_SIDE / 2 + 0.22),
    // A TextShape reads correctly from its local -z side, so unrotated over the door it
    // greeted the street with MIRRORED letters (owner, 1 Sep). Half a turn faces it out.
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    scale: Vector3.create(0.9, 0.9, 0.9)
  })
  // The sign behind the name: the HUD's own navy plate, so the facade speaks the same UI
  // language as the buttons. A child, so it turns and dies with the text.
  const enseigne = engine.addEntity()
  Transform.create(enseigne, {
    parent: plaque,
    position: Vector3.create(0, 0.02, 0.05),
    scale: Vector3.create(5.1, 1.28, 1)
  })
  MeshRenderer.setPlane(enseigne)
  /*
    Alpha TEST, not blend. The glazing is alpha blended, and two blended surfaces resolve
    their order per frame by distance: from some angles the wall drew over the sign and
    the plate melted into the glass (owner, 1 Sep, two screenshots). A tested cutout
    writes depth and wins every angle. The texture is the sign's own 4:1 drawing; the
    stretched square panel read as a pill.
  */
  Material.setPbrMaterial(enseigne, {
    texture: Material.Texture.Common({ src: 'assets/ui/sign.png' }),
    emissiveTexture: Material.Texture.Common({ src: 'assets/ui/sign.png' }),
    emissiveColor: Color3.White(), emissiveIntensity: 0.3,
    metallic: 0, roughness: 1, specularIntensity: 0,
    transparencyMode: 1, alphaTest: 0.5
  })

  /*
    Pedestals for the ground storey only; the rest are added with the storeys they stand on.
    Every base used to create all seventy-two up front, each with a collider and a pointer
    event, for shelves nobody had bought: sixty bases made four thousand colliders standing in
    for nothing, which is the entity count the workshop said to cut first (28 Aug).
  */
  const items: Entity[] = []
  for (let k = 0; k < SLOTS_PER_FLOOR; k++) items.push(creerSocle(racine, k))
  parentCourant = null
  return { plinth, label, gain, door, plaque, plaqueGlyphes: null, ascenseur, floors, items, signature: '', ownerId: '', skin: -1, peints: 0, racine }
}

function destroyView(v: View): void {
  engine.removeEntity(v.plinth)
  engine.removeEntity(v.label)
  engine.removeEntity(v.gain)
  engine.removeEntityWithChildren(v.plaque)
  engine.removeEntity(v.door)
  engine.removeEntity(v.ascenseur)
  for (const e of v.floors) {
    /*
      The ramp goes with its children, because `removeEntity` does not take them.

      Its two handrails are parented to it and stored nowhere, so nothing could reach them
      afterwards: every base that scrolled out of the field left two colliders behind,
      hanging off a parent that no longer existed. `removeEntityWithChildren` is the function
      that exists for exactly this, and combat.ts already uses it for the weapon.
    */
    taille.delete(e.ramp)
    engine.removeEntityWithChildren(e.ramp)
    for (const ent of [e.floorSlab, e.landing, ...e.walls]) {
      taille.delete(ent)
      engine.removeEntity(ent)
    }
    // The sentry and the pedestals carry children of their own: model, silhouette, halo, light.
    demolir(e.sentry)
  }
  engine.removeEntity(v.racine)
  for (const o of v.items) demolir(o)
}

/**
 * Which base the player is standing in, if any, for the client to offer the right verb.
 *
 * The server checks this again before it moves anything; this is only so the button can read
 * PLACE rather than the player pressing it and being told no.
 */
export function baseIci(): { ownerId: string; mienne: boolean } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  const moi = monAdresseClient()
  /*
    The NEAREST base, not the first one the iterator happens to yield.

    Buildings are kept `MIN_BASE_GAP` apart, which is `BASE_SIDE + 4`, and `PLACE_RANGE` is
    `BASE_SIDE / 2 + 2`: twice the reach is exactly the minimum gap. So two neighbours at the
    minimum distance have ranges that meet, and a player standing on the seam was inside both.
    Returning the first match made the verb offered there depend on entity creation order,
    which is to say on nothing the player can see. Whichever one they are actually closer to
    is the only defensible answer.
  */
  let proche: { ownerId: string; mienne: boolean } | null = null
  let distance = PLACE_RANGE
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    const bt = Transform.getOrNull(e)
    if (bt === null) continue
    const dx = t.position.x - bt.position.x, dz = t.position.z - bt.position.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d > distance) continue
    distance = d
    proche = { ownerId: p.ownerId, mienne: p.ownerId.toLowerCase() === moi }
  }
  return proche
}

/**
 * Which storey of MY base I am standing on, and what already defends it.
 *
 * Arming happens where you stand, the same rule as putting an item on a shelf. The shop needs
 * to say which floor that is before the button is pressed, because a purchase whose effect
 * depends on your feet has to name what your feet chose.
 */
export function maDefense(): { etage: number; charges: number } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  const moi = monAdresseClient()
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const bt = Transform.getOrNull(e)
    if (bt === null) return null
    const dx = t.position.x - bt.position.x, dz = t.position.z - bt.position.z
    if (Math.sqrt(dx * dx + dz * dz) > PLACE_RANGE) return null
    const etage = Math.max(0, Math.round(t.position.y / FLOOR_HEIGHT))
    if (etage >= p.floors) return null
    return { etage, charges: p.sentryFloors[etage] ?? 0 }
  }
  return null
}

/**
 * Which pedestal an item would land on, if it were put down right now.
 *
 * The storey comes from where the player is standing, because that is the part that decides
 * anything: `aPortee` gates theft on `|dy| <= SAME_STOREY`, so only the same floor is
 * reachable. Within a floor the six pedestals span 7.2 m against a 10 m reach, so which one
 * you pick changes nothing a thief cares about. It is offered anyway, because arranging your
 * own building is worth doing for its own sake and because the marker makes the choice legible
 * before it is made rather than after.
 *
 * Candidates are the indices of that floor, cut to the length of the shelf: an index beyond
 * the end would be a hole, and the shelf is a dense queue. A floor above what the shelf
 * reaches falls back to the top of it.
 */
export function cibleDePose(): { ownerId: string; index: number; pos: Vector3 } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  let base: { p: ReturnType<typeof Plot.get>; x: number; z: number } | null = null
  let distance = PLACE_RANGE
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    const bt = Transform.getOrNull(e)
    if (bt === null) continue
    const dx = t.position.x - bt.position.x, dz = t.position.z - bt.position.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d > distance) continue
    distance = d
    base = { p, x: bt.position.x, z: bt.position.z }
  }
  if (base === null) return null

  /*
    The nearest FREE pedestal on this storey. A taken one is not a candidate, and a storey
    with none free returns nothing, so the marker vanishes instead of promising a place that
    the server will then route elsewhere.
  */
  const etage = Math.max(0, Math.round(t.position.y / FLOOR_HEIGHT))
  if (etage >= base.p.floors) return null
  const bas = etage * SLOTS_PER_FLOOR
  let choisi = -1
  let meilleur = Infinity
  for (let k = bas; k < bas + SLOTS_PER_FLOOR; k++) {
    if (k < base.p.items.length && base.p.items[k] !== VIDE) continue
    const s = tourner(base.z, slotPosition(k).dx, slotPosition(k).dz)
    const dx = t.position.x - (base.x + s.dx), dz = t.position.z - (base.z + s.dz)
    const d = dx * dx + dz * dz
    if (d >= meilleur) continue
    meilleur = d
    choisi = k
  }
  if (choisi < 0) return null
  const s = slotPosition(choisi)
  const o = tourner(base.z, s.dx, s.dz)
  return { ownerId: base.p.ownerId, index: choisi, pos: Vector3.create(base.x + o.dx, s.dy, base.z + o.dz) }
}

export function setupPlots(): void {
  engine.addSystem(() => {
    for (const v of views.values()) {
      for (let k = 0; k < v.items.length; k++) {
        if (
          inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.items[k])
        ) {
          /*
            One click, one meaning: take it.

            Clicking your own shelf used to arm a two-step swap, where the first click chose a
            slot, the second chose another, and a caption explained the pairing. That is a menu
            wearing the clothes of a world object. Now it simply lifts the thing, and where you
            walk with it is the rest of the sentence.
          */
          if (v.ownerId.toLowerCase() === monAdresseClient()) pickUp(k)
          else steal(v.ownerId, k)
          return
        }
      }

      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.ascenseur)
      ) {
        if (v.ownerId.toLowerCase() !== monAdresseClient()) {
          alerter('THAT ELEVATOR IS NOT YOURS: TAKE THE RAMP', '#ffd166', 3500)
          return
        }
        goUpOneFloor(v)
        return
      }

    }
  })

  engine.addSystem(() => {
    const vivantes = new Set<number>()

    for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
      const id = ent as unknown as number
      vivantes.add(id)
      const t = Transform.get(ent)
      let v = views.get(id)
      if (!v) {
        v = createView(t.position.x, t.position.z, accentPour(p))
        views.set(id, v)
      }

      const lockSeconds = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
      const monBase = p.ownerId.toLowerCase() === monAdresseClient()

      /*
        The signature is computed here rather than further down, because it guards twice.

        It already gated the item shelves. Everything between here and the door was running
        unconditionally, once per base per frame: a full material on the plinth, a Transform
        rewritten for the slab, the ten walls, the ramp and the landing of every storey. At
        sixty bases of three storeys that is on the order of two and a half thousand component
        writes a frame, and a write is not free even when the value is identical: the engine
        marks the entity dirty, serialises the component to bytes and compares it against the
        last snapshot before deciding to send nothing. The comparison is what costs, and it
        was being paid sixty times a second for buildings that had not changed since they were
        built. Every input those blocks read is already in this string.

        What stays per-frame is what genuinely ticks: the LOCKED countdown on the nameplate and
        the shield, which is why neither of them is behind this flag.
      */
      /*
        `skin` belongs here, and its absence was a bug the owner could see: choosing a base
        skin repainted NOTHING (1 Sep). `repeindre` sits behind this flag, so a change the
        signature does not mention can never reach it, and the skin only appeared later, by
        accident, when a floor or an item happened to move.
      */
      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.floors}|${p.items.join(',')}|${p.given}|${p.received}|${p.sentryFloors.join(',')}|${p.rebirths}|${p.skin}`
      const structurel = sig !== v.signature
      const txt = TextShape.getMutableOrNull(v.label)
      if (txt !== null) {
        const lock = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
        const state = lock > 0 ? `\nLOCKED ${lock}s` : (p.ownerPresent ? '' : '\n(away)')
        const ledger = (p.given > 0 || p.received > 0)
          ? `\n${p.received} received  ·  ${p.given} given`
          : ''
        const ta = structurel ? Transform.getMutableOrNull(v.ascenseur) : null
        if (ta !== null) {
          const h = p.floors * FLOOR_HEIGHT
          ta.scale = Vector3.create(0.5, h, 0.5)
          ta.position = Vector3.create(BASE_SIDE / 2 - 1.1, h / 2, -BASE_SIDE / 2 + 1.1)
        }
        const guard = p.sentries > 0 ? `\nSENTRY x${p.sentries}` : ''
        if (structurel) {
          // One marker per storey, sized by what that storey holds. An empty floor shows
          // nothing at all, which is exactly the information a thief is looking for.
          for (let e = 0; e < v.floors.length; e++) {
            const ts = Transform.getMutableOrNull(v.floors[e].sentry)
            if (ts === null) continue
            const n = p.sentryFloors[e] ?? 0
            const k = n === 0 ? 0 : 0.6 + n * 0.18
            ts.scale = Vector3.create(k, k, k)
            // A guarded storey throws its cyan on the floor: the defence reads before the rule does.
            lumiereDuJouet(v.floors[e].sentry, n > 0 ? TOY.sentry : null, 1.6)
          }
        }
        /*
          The rank goes on the nameplate, because that is the only place it does its job.

          `rebirths` is stored, persisted, and synced to every client in the Plot component,
          and it was drawn nowhere. The one thing this mechanic is for, according to the
          practitioner of the same format we studied, is being seen by the other players on
          your server: his own words for why he built it were to be able to flex on them.
          Meanwhile the multiplier it buys, which is private information for the owner, was
          the part we were printing, on the owner's own coin counter. Exactly the wrong way
          round on both counts. It joins the name line rather than taking one of its own,
          since a plate read from a few metres away can carry a rank but not a fourth row.
        */
        const rang = p.rebirths > 0 ? `  ·  x${p.rebirths + 1} PRESTIGE` : ''
        txt.text = `${p.ownerName}${rang}${state}${guard}${ledger}`
        txt.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')
        if (structurel) {
          /*
            The facade speaks the HUD's numbers and the HUD's typeface. The number is the
            MULTIPLIER, rebirths plus one, because that is what the counter over the score
            says (x3 PRESTIGE) and what a player calls their prestige; the plate said P2 to
            a player the HUD had told x3 (owner, 1 Sep). The letters are glyph quads from
            the Baloo atlas, name in white, rank in the money gold.
          */
          if (v.plaqueGlyphes !== null) engine.removeEntityWithChildren(v.plaqueGlyphes)
          const segs: Segment3D[] = [{ texte: p.ownerName.slice(0, 14), role: 'name', taille: 0.78 }]
          if (p.rebirths > 0) segs.push({ texte: `  x${p.rebirths + 1}`, role: 'money', taille: 0.78 })
          v.plaqueGlyphes = p.ownerName === '' ? null : poserTexte3D(v.plaque, segs, !p.ownerPresent)
          // The floating pair rides just above the storeys that exist, not the theoretical top.
          const rp = Transform.getOrNull(v.racine)
          if (rp !== null) {
            const haut = Math.min(p.floors, MAX_FLOORS) * FLOOR_HEIGHT
            const tl = Transform.getMutableOrNull(v.label)
            if (tl !== null) tl.position = Vector3.create(rp.position.x, haut + 1.15, rp.position.z)
            const tg2 = Transform.getMutableOrNull(v.gain)
            if (tg2 !== null) tg2.position = Vector3.create(rp.position.x, haut + 1.82, rp.position.z)
          }
        }

        // What the base earns, read off its own items, so a passer-by can price a target
        // without opening anything.
        const tg = structurel ? TextShape.getMutableOrNull(v.gain) : null
        if (tg !== null) {
          let perSecond = 0
          for (const code of p.items) if (code !== VIDE) perSecond += itemIncome(code, PRODUCTION_PER_RARITY)
          tg.text = perSecond > 0 ? `+${formatIncome(perSecond)}/s` : ''
        }
      }
      if (structurel) {
        Material.setPbrMaterial(v.plinth, plastiqueMoule(p.ownerPresent ? TOY.plinth : TOY.plinthAway, BASE_SIDE + 1.6, BASE_SIDE + 1.6))
        repeindre(v, p)
      }

      // Catch up to what this base has actually opened, one floor at a time.
      if (structurel) {
        while (v.floors.length < Math.min(p.floors, MAX_FLOORS)) {
          parentCourant = v.racine
          v.floors.push(buildFloor(0, 0, v.floors.length, accentPour(p)))
          parentCourant = null
          // The storey's six pedestals arrive with it.
          while (v.items.length < v.floors.length * SLOTS_PER_FLOOR) v.items.push(creerSocle(v.racine, v.items.length))
        }

        for (let e = 0; e < v.floors.length; e++) {
          const open = e < p.floors
          const et = v.floors[e]
          const montrer = (ent: Entity, visible: boolean) => {
            const tr = Transform.getMutableOrNull(ent)
            const t = taille.get(ent)
            if (tr === null || t === undefined) return
            tr.scale = visible ? t : Vector3.create(0, 0, 0)
          }
          montrer(et.floorSlab, open)
          for (const m of et.walls) montrer(m, open)
          // No ramp off the top floor: it would climb to nothing, and neither would its landing.
          const monte = open && e + 1 < p.floors
          montrer(et.ramp, monte)
          montrer(et.landing, monte)
        }
      }

      const ptr = Transform.getMutableOrNull(v.door)
      if (ptr !== null) {
        const locked = p.lockedUntil > Date.now()
        const h = p.floors * FLOOR_HEIGHT + 0.6
        /*
          LOCAL, because the shield is a child of the base's own root.

          This wrote the base's WORLD coordinates into a child of a root already standing at
          those coordinates, so the shield was drawn at twice them: a base at (60, 70) put its
          dome at (120, 140), a hundred metres away or outside the scene entirely. The theft
          was refused, the countdown ran, the plate said LOCKED, and the wall itself was
          somewhere nobody would ever look (owner, 1 Sep). Only the height is a number here;
          the position is the parent's.
        */
        ptr.position = Vector3.create(0, h / 2, 0)
        ptr.scale = locked
          ? Vector3.create(BASE_SIDE + 1.2, h, BASE_SIDE + 1.2)
          : Vector3.create(0, 0, 0)

        /*
          The shield keeps thieves out. It must not keep the owner out.

          Every player is shielded for thirty seconds the moment they arrive, which is a
          kindness: nobody wants to be robbed while the scene is still loading around them.
          But the shield is a solid box, and it was solid for everyone, so the first thing a
          returning player met was a wall around their own base with no way through and no
          explanation. The protection is against other people by definition, so the collider
          only exists on somebody else's shield. Ours is drawn and walked through.
        */
        const solide = locked && !monBase
        if (solide && !MeshCollider.has(v.door)) {
          MeshCollider.setBox(v.door)
          expulser(t.position, p.floors)
        } else if (!solide && MeshCollider.has(v.door)) MeshCollider.deleteFrom(v.door)
      }

      // The signature only carries STRUCTURAL state. A value that ticks every second
      // (a countdown, a gauge) belongs on its own element: inside a cache key it forces
      // a full rebuild each second, which restarts item rotation tweens from identity.
      if (!structurel) continue
      v.signature = sig
      v.ownerId = p.ownerId

      const mine = monBase
      const verbe = mine
        ? 'Pick up'
        : 'Steal'
      for (let k = 0; k < v.items.length; k++) {
        const code = p.items[k]
        const label = code === undefined || code === VIDE
          ? verbe
          : `${verbe} ${nomDuCode(code)} · ${formatIncome(itemIncome(code, INCOME_UI))}/s`
        PointerEvents.createOrReplace(v.items[k], {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: label } }
          ]
        })
      }

      /*
        A pedestal has exactly two states, and each state sets EVERYTHING that describes it.

        The old block set what it happened to think of in each branch: the occupied branch
        never restored the scale the empty branch had zeroed, so a pedestal that had been empty
        once stayed invisible for ever; the empty branch never removed the tween the occupied
        one had started, so a sold item kept turning on its plinth. Every fix moved the bug to
        the other branch. Position, scale, material, silhouette, pad, light, tween and
        mounted model are the facts of a pedestal; both states write all of them, in the one
        order that survives the engine: tweens off, transform written whole, tweens back on. A tween that is still alive rewrites the
        Transform next frame, so anything set before deleting it is lost.
      */
      for (let k = 0; k < v.items.length; k++) {
        const ent = v.items[k]
        const tr = Transform.getMutableOrNull(ent)
        if (tr === null) continue
        const d = slotPosition(k)
        const occupe = k < p.items.length && p.items[k] !== VIDE

        // 1. Tweens off, whatever the state: nothing below is safe while one is running.
        Tween.deleteFrom(ent)
        TweenSequence.deleteFrom(ent)

        if (!occupe) {
          // 2a. Empty: under the floor, no size, no model. Material is irrelevant unseen.
          tr.position = Vector3.create(0, -5, 0)
          tr.scale = Vector3.Zero()
          demonter(ent)
          effacerForme(ent)
          effacerSocle(ent)
          effacerLumiere(ent)
          continue
        }

        // 2b. Occupied: every fact written, from the code alone.
        const code = p.items[k]
        const r = rarity(rarityOf(code))
        const m = mutation(mutationDe(code))
        // A trait is worth five times the base: it shows as light and a little size, not a new shape.
        const traits = traitsDe(code)
        const size = r.size * (m.mult > 1 ? 1.12 : 1) * (1 + 0.05 * traits)
        // `dy` is the slab's top face. A hair of air, the pad, then the toy standing on the pad
        // with its centre half its size up. Nothing shares a plane with anything.
        tr.position = Vector3.create(d.dx, d.dy + JEU + SOCLE_EPAISSEUR + size / 2, d.dz)
        tr.rotation = Quaternion.Identity()
        tr.scale = Vector3.create(size, size, size)
        const hex = itemColor(rarityOf(code), mutationDe(code))
        const c = Color4.fromHexString(hex + 'ff')
        const mutId = mutationDe(code)
        // Gold and Diamond are metal and gem; every other mutation, and rarity itself, glow.
        const mat = estMetal(mutId) ? matiereMetal(hex, mutId, r.glow) : plasticDe(c, r.glow)
        Material.setPbrMaterial(ent, mat)
        // The toy of this rarity, as children: the same silhouette the hand and the belt show.
        formeDeRarete(ent, rarityOf(code), mat)
        /*
          Every toy stands on a pad; a mutation colours it, and so does a Rare-or-better even
          without a mutation. The pad is emissive geometry, so unlike the point light and the
          bloom halo (both off on a Low preset, which a phone drops to under heat) it glows on
          every device. It is the one glow we fully control (tester, 28 Aug: no bloom at all).
        */
        // Glow comes from RARITY, not from the mutation: a Common Candy is matte pink, a Rare
        // Candy glows (tester, 28 Aug). The mutation only sets the COLOUR of the glow when
        // there is one. Below the rarity threshold, no pad glow whatever the mutation.
        const padHex = r.glow >= LUMIERE_MIN_GLOW ? (m.mult > 1 ? m.color : hex) : null
        socleDuJouet(ent, size, padHex)
        // Rare and above, or anything mutated, lights the slab it stands on in its own colour.
        // Rarity drives the light; a trait is earned so it adds; a mutation does not (it is colour).
        const eclat = r.glow + 0.8 * traits
        lumiereDuJouet(ent, eclat >= LUMIERE_MIN_GLOW ? hex : null, eclat)
        /*
          One shared model per rarity, and the artist decides the silhouette.

          `assets/toy/item-<rarity>.glb`, authored to a unit cube: the entity keeps being
          scaled by rarity and mutation exactly as the box is, so a model exported at one
          metre lands at the right size on every pedestal. Seven files for seven rarities is
          the whole item budget; sixty bases share them and the engine keeps one copy each.
        */
        remonter(ent, `item-${rarityOf(code)}.glb`)

        // 3. Tweens back on, last, for the pieces that turn.
        if (r.tours > 0 || m.mult > 1) {
          Tween.create(ent, {
            mode: Tween.Mode.Rotate({ start: Quaternion.Identity(), end: Quaternion.fromEulerDegrees(0, 180, 0) }),
            duration: Math.round(360000 / Math.max(1, r.tours + (m.mult > 1 ? 30 : 0))),
            easingFunction: EasingFunction.EF_LINEAR
          })
          TweenSequence.create(ent, { sequence: [], loop: TweenLoop.TL_RESTART })
        }
      }
    }

    for (const [id, v] of views) {
      if (vivantes.has(id)) continue
      destroyView(v)
      views.delete(id)
    }
  })
}

/**
 * The pedestal the player is facing, on the nearest base, or null.
 *
 * The contextual button's version of the click on a toy. Two conditions, both about the
 * body: within a stride of the pedestal, and facing it, so a player merely walking down a
 * shelf is not offered the toy at their elbow. Of the pedestals that pass, the nearest.
 */
export const PAD_REACH = 2.4
export function padEnFace(): { ownerId: string; k: number; mine: boolean; nom: string } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  let base: { p: ReturnType<typeof Plot.get>; x: number; z: number } | null = null
  let distance = PLACE_RANGE
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    const bt = Transform.getOrNull(e)
    if (bt === null) continue
    const d = Math.hypot(t.position.x - bt.position.x, t.position.z - bt.position.z)
    if (d > distance) continue
    distance = d
    base = { p, x: bt.position.x, z: bt.position.z }
  }
  if (base === null) return null
  const f = Vector3.rotate(Vector3.create(0, 0, 1), t.rotation)
  const fl = Math.hypot(f.x, f.z)
  let choisi = -1
  let meilleur = PAD_REACH
  for (let k = 0; k < base.p.items.length; k++) {
    if (base.p.items[k] === VIDE) continue
    const s = slotPosition(k)
    if (Math.abs(s.dy - t.position.y) > FLOOR_HEIGHT / 2) continue     // this storey only
    const o = tourner(base.z, s.dx, s.dz)
    const dx = base.x + o.dx - t.position.x, dz = base.z + o.dz - t.position.z
    const d = Math.hypot(dx, dz)
    if (d >= meilleur) continue
    if (fl > 0.001 && d > 0.3 && (dx * f.x + dz * f.z) / (d * fl) < 0.35) continue   // behind or beside
    meilleur = d
    choisi = k
  }
  if (choisi < 0) return null
  return {
    ownerId: base.p.ownerId, k: choisi,
    mine: base.p.ownerId.toLowerCase() === monAdresseClient(),
    nom: nomDuCode(base.p.items[choisi])
  }
}

/** The button's act on that pedestal: lift your own, steal anyone else's. */
export function agirSurPad(pad: { ownerId: string; k: number; mine: boolean }): void {
  if (pad.mine) pickUp(pad.k)
  else steal(pad.ownerId, pad.k)
}

/**
 * Your own elevator within reach. Reach covers the landing spot the elevator itself puts
 * the player on (about four metres, facing it), so the spam-press climb keeps working.
 */
export const ELEVATOR_REACH = 4.4
function monAscenseur(): View | null {
  const moi = monAdresseClient()
  for (const v of views.values()) if (v.ownerId.toLowerCase() === moi) return v
  return null
}
export function ascenseurAPortee(): boolean {
  const t = Transform.getOrNull(engine.PlayerEntity)
  const v = monAscenseur()
  if (t === null || v === null) return false
  const r = Transform.getOrNull(v.racine)
  if (r === null) return false
  const el = tourner(r.position.z, ASC_X, ASC_Z)
  return Math.hypot(t.position.x - (r.position.x + el.dx), t.position.z - (r.position.z + el.dz)) <= ELEVATOR_REACH
}
export function monterIci(): void {
  const v = monAscenseur()
  if (v !== null) goUpOneFloor(v)
}
