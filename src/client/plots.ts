import { TOY, plastic, plasticDe, acrylic, montable, remonter, demonter, rarityShape, clearShape, toyPedestal, clearPedestal, PEDESTAL_THICKNESS, toyLight, clearLight, LIGHT_MIN_GLOW, demolir, accentDe, modelesDe, estMetal, metalMaterial, toyRays, clearRays, spawnRays, toyFloat } from './toy'
import { PRODUCTION_PER_RARITY } from '../shared/economy'
import {
  PBMaterial_PbrMaterial, TextureWrapMode, engine, Transform, MeshRenderer, MeshCollider, GltfContainer, Material, TextShape, Billboard, BillboardMode, Entity, PointerEvents, PointerEventType, InputAction, inputSystem, Tween, TweenSequence, TweenLoop, EasingFunction, ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector2, Color3, Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import {
  Plot, SLOTS_PER_FLOOR, MAX_FLOORS, OBJECT_BUDGET, DECOR_COST, BASE_FIXED_COST, STOREY_COST_NEAR, STOREY_COST_FAR, ITEM_COST, FLOOR_HEIGHT, SLAB_THICKNESS, PLACE_RANGE, slotPosition, VIDE, occupe, rampPosition, BASE_SIDE, PLINTH_SIDE, WALL_THICKNESS, WALL_HEIGHT, DOOR_WIDTH, RAMP_ANGLE, RAMP_LENGTH, STAIRWELL_WIDTH, baseFacing, orientToBase, LOCK_COOLDOWN_MS, LOCK_FREE_MS
} from '../shared/schemas'
import { rarity, rarityOf, mutationDe, itemColor, mutation, formatIncome, itemIncome, nomDuCode, traitsDe } from '../shared/loot-table'
import { place3DText, Segment3D } from './texte3d'

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
  const pied = orientToBase(t.position.z, ASC_X - 3.5, ASC_Z + 1.6)
  const el = orientToBase(t.position.z, ASC_X, ASC_Z)
  moveTo(
    'ascenseur',
    Vector3.create(t.position.x + pied.dx, y, t.position.z + pied.dz),
    Vector3.create(t.position.x + el.dx, y + 1.0, t.position.z + el.dz)
  )
}
import { steal, myClientAddress, alerter, lockBase } from './theft'
import { moveTo } from './deplacer'
import { pickUp } from './carry'
import { HUE, TOAST } from './theme'
import { isMobile } from '@dcl/sdk/platform'

type Floor = {
  /** Ce qui est dessine: quatre maillages fusionnes, un materiau chacun. */
  coque: Entity; verre: Entity; accent: Entity; montee: Entity
  /** Ce qui est touche: des boites sans rendu, aux memes places qu'avant. */
  sols: Entity[]; murs: Entity[]; ramp: Entity; rails: Entity[]
  sentry: Entity
}
type View = {
  plinth: Entity; label: Entity; gain: Entity; door: Entity; plaque: Entity; plaqueGlyphes: Entity | null
  /** Niveau de detail: vrai quand la base est au-dela de LOD_LOIN et ne dessine que sa structure. */
  loin: boolean
  /** Les deux valeurs vivantes, mises en cache: une ecriture identique coute autant qu'une vraie. */
  vuLabel: string; vuBouclier: string
  floors: Floor[]; items: Entity[]; ascenseur: Entity; signature: string; ownerId: string
  /** The base's root: at its centre, turned to face the belt; every part is a child in base-local metres. */
  racine: Entity
  /** The skin last painted, and how many storeys it was painted on. */
  skin: number; peints: number
  /** What a skin adds beyond the walls: the disc on the ground and the crown over the roof. */
  halo: Entity | null; couronne: Entity | null
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

/**
 * A storey: four merged models for what is seen, plain boxes for what is touched.
 *
 * It used to be twenty-three separate rendered objects, and the mobile client charges one
 * MATERIAL per rendered object against a budget of four hundred. Sixteen bases came to 1 542
 * measured, three times the hard limit, while triangles sat at 24% and textures at 10%: the
 * count of objects was the whole problem and nothing else was close.
 *
 * Boxes that share a colour and never move relative to one another do not need to be separate
 * objects. Merged into one mesh they are one object, one material, one draw call, and the
 * mobile client hands them an automatic LOD chain on top (50%, 25%, 10% of the indices, by
 * screen error) that SDK primitives never receive. What stays split is only what has to hide
 * on its own: the climb disappears on the top storey, the glass and the accent change colour
 * with a skin.
 *
 * Collision is untouched. Every box that stopped a player still stops them, as an entity with
 * a collider and no renderer, which costs nothing against the material budget and keeps physics
 * on cheap boxes rather than on merged geometry, the exact thing workshop #4 showed tanking a
 * phone.
 */
function collisionneur(x: number, y: number, z: number, sx: number, sy: number, sz: number, rot?: Quaternion): Entity {
  const e = engine.addEntity()
  // `rotation: undefined` n'est pas la meme chose que ne pas mettre la cle: le serialiseur lit
  // `rotation.x` dessus a chaque frame et la scene leve en boucle.
  Transform.create(e, rot === undefined
    ? { parent: parentCourant ?? undefined, position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) }
    : { parent: parentCourant ?? undefined, position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz), rotation: rot })
  taille.set(e, Vector3.create(sx, sy, sz))
  MeshCollider.setBox(e)
  return e
}

/*
  Deux niveaux de detail, par NOMBRE D'OBJETS, parce que c'est ce que le telephone compte.

  Le client mobile reduit deja les triangles de chaque modele avec la distance (50, 25 puis
  10 %). Il ne reduit pas le nombre d'objets rendus, et c'est lui qui plafonne a 500. Une base
  pleine en coute 49, dont 26 pour ses pieces et leurs socles. A quarante-cinq metres, une
  piece de quarante centimetres est un point sur un ecran de telephone et une plaque de nom
  n'est plus lisible; ce qui reste percu d'une base est sa silhouette, sa hauteur, sa couleur,
  et c'est exactement ce que le voleur cherche du bout du terrain. Le niveau LOIN garde donc
  la coque et les montants de chaque etage, dans la couleur du proprietaire, et rien d'autre:
  ni pieces, ni socles, ni plaque, ni vitrage, ni rampe, ni ascenseur, ni colliders, qu'on ne
  peut pas toucher de la. Ce n'est PAS du rognage: on voit toutes les bases de partout
  (proprietaire, 2 Sep: "limiter la vue des bases est un echec"), on cesse seulement de
  dessiner ce que l'oeil ne distingue plus.

  Dix metres d'hysteresis pour ne pas reconstruire une base a chaque pas sur la frontiere. Sa
  propre base est toujours au niveau PRES: l'ascenseur, la pose et le bouton contextuel en
  dependent.
*/
/*
  Le niveau de detail n'est plus un rayon, c'est un BUDGET.

  Un rayon fixe est faux dans les deux sens: a trois bases sur la carte il degrade des
  batiments qu'on pouvait parfaitement s'offrir, et a soixante il ne suffit plus. Ce qui
  compte est le nombre d'objets rendus, et le client en plafonne a 500, en recommande 400.
  Alors on compte: le decor fixe coute ce qu'il coute, chaque base au detail complet en coute
  environ cinquante, chaque base reduite a sa silhouette environ huit. On garde donc au detail
  complet LES N PLUS PROCHES, N etant le plus grand nombre qui tient dans le budget.

  Effet: a deux ou trois joueurs, personne n'est degrade. A seize, les cinq ou six plus proches
  gardent leurs pieces et le reste garde sa silhouette, sa hauteur et sa couleur. La degradation
  arrive quand elle est necessaire, jamais avant, et le plafond dur n'est jamais franchi.

  Les couts viennent de la mesure du 2 Sep sur le client, pas d'une estimation: decor seul 160
  objets, seize bases pleines 530, une base complete ~49, une base lointaine ~8.
*/
/*
  385 et non 400: l'estimation se trompe d'environ un pour cent, le tapis porte un nombre de
  caisses qui bouge, et franchir 400 allume l'avertissement du client. Quinze objets de marge
  achetent la certitude de rester sous le seuil doux, pour a peu pres un demi-etage de detail.
*/
/** Sa propre base et celles a portee de main restent completes, budget ou non. */
const LOD_TOUJOURS_PRES = 24
/** Une base deja complete compte comme un peu plus proche: sans ca elle clignoterait au seuil. */
const LOD_FIDELITE = 0.85

/** Ce que cette base coutera en objets rendus, au detail complet ou reduite. */
function baseCost(p: { floors: number; items: readonly number[] }, pres: boolean): number {
  const etages = Math.max(1, Math.min(p.floors, MAX_FLOORS))
  if (!pres) return BASE_FIXED_COST + etages * STOREY_COST_FAR
  let pieces = 0
  for (const it of p.items) if (it > 0) pieces++
  return BASE_FIXED_COST + etages * STOREY_COST_NEAR + pieces * ITEM_COST
}

function modele(src: string, y: number, rendu = true): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent: parentCourant ?? undefined, position: Vector3.create(0, y, 0) })
  taille.set(e, Vector3.One())
  // Both masks off: the shapes that stop a player are the invisible boxes beside this.
  if (rendu) GltfContainer.create(e, { src: `assets/Models/${src}`, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  return e
}

/** Une entite qui n'est qu'une place: pour les pieces d'une base LOIN qui n'ont rien a dessiner. */
function place(x: number, y: number, z: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent: parentCourant ?? undefined, position: Vector3.create(x, y, z), scale: Vector3.Zero() })
  taille.set(e, Vector3.One())
  return e
}

/**
 * Le corps de la sentinelle existe quand elle est armee, et seulement alors.
 *
 * Un etage sans defense ne montre rien, c'est l'information que le voleur cherche; il n'y a
 * donc aucune raison que le client rende un cylindre et un modele a l'echelle zero sur chaque
 * etage de chaque base. On monte a la premiere charge, on demonte a la derniere.
 */
function armSentry(sentry: Entity, armee: boolean): void {
  const monte = MeshRenderer.has(sentry)
  if (armee && !monte) {
    MeshRenderer.setCylinder(sentry, 0.25, 0.45)
    Material.setPbrMaterial(sentry, plastic(TOY.sentry, 1.6))
    montable(sentry, 'sentry.glb')
  } else if (!armee && monte) {
    demonter(sentry)
    MeshRenderer.deleteFrom(sentry)
    Material.deleteFrom(sentry)
  }
}

function buildFloor(x: number, z: number, floor: number, mods: { accent: string; climb: string; verre: string }, teinte: string, loin = false): Floor {
  const y = floor * FLOOR_HEIGHT
  const c = BASE_SIDE
  const h = WALL_HEIGHT
  const ep = WALL_THICKNESS
  const r = rampPosition(floor)
  const course = RAMP_LENGTH * Math.cos((RAMP_ANGLE * Math.PI) / 180)
  const bande = c / 2 - STAIRWELL_WIDTH / 2
  const finPalier = course / 2 + 2.4
  const finArriere = -1.2
  const rampeX = STAIRWELL_WIDTH - 0.3

  const coque = modele(floor === 0 ? 'storey-ground.glb' : 'storey-upper.glb', y)
  const verre = modele(mods.verre, y, !loin)
  const accent = modele(mods.accent, y)
  /*
    La rampe qu'on VOIT est le collisionneur qu'on GRAVIT. Le meme objet, pas deux.

    Elle etait un modele charge a part, place par son propre calcul, et le collisionneur
    ailleurs par le sien. Trois tentatives n'ont pas suffi a les faire coincider en
    production: le proprietaire a vu la rampe dessinee d'un cote de la piece et la marchable
    de l'autre, devant l'ascenseur, et le jeu devient injouable ainsi (3 Sep). On a verifie
    le fichier, la boite, les noeuds, l'enroulement des faces, le parent, la pente: tout
    concordait, et le rendu restait ailleurs. Sans cause identifiee, on supprime la
    possibilite plutot que de la chercher une quatrieme fois.

    Le prix: les deux rambardes du modele disparaissent, elles n'etaient que decoratives.
    Le gain: la marche et le dessin sont une seule boite, ils ne peuvent plus se separer,
    et le budget ne bouge pas (un objet rendu comme avant).
  */
  const pente = Quaternion.fromEulerDegrees(-RAMP_ANGLE, 0, 0)
  const montee = engine.addEntity()
  Transform.create(montee, {
    parent: parentCourant ?? undefined,
    position: Vector3.create(x + r.dx, y + FLOOR_HEIGHT / 2, z + r.dz),
    rotation: pente
  })
  taille.set(montee, Vector3.One())
  // Le modele revient: il est centre sur l'origine et l'entite porte position et pente, donc
  // il ne peut pas etre ailleurs que la marche. La boite nue qui l'avait remplace le temps du
  // diagnostic n'avait ni rambarde ni epaisseur (proprietaire, 3 Sep, "juste une rampe moche").
  if (!loin) {
    GltfContainer.create(montee, {
      src: `assets/Models/${mods.climb}`, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0
    })
  }
  if (loin) {
    // Rien a toucher de si loin: ni colliders, ni rails, ni rampe. Des places, pour que le
    // reste du code trouve ses entites et n'ait pas a savoir a quel niveau il parle.
    const sentry = place(x + c / 2 - 1.1, y + 1.2, z - c / 2 + 1.1)
    return { coque, verre, accent, montee, sols: [], murs: [], ramp: place(0, 0, 0), rails: [], sentry }
  }

  // The floor a player walks on, in the same three pieces the models are drawn in.
  const sols: Entity[] = [
    collisionneur(x - STAIRWELL_WIDTH / 2, y + SLAB_THICKNESS / 2, z, c - STAIRWELL_WIDTH, SLAB_THICKNESS, c)
  ]
  if (floor === 0) {
    sols.push(collisionneur(x + bande, y + SLAB_THICKNESS / 2, z, STAIRWELL_WIDTH, SLAB_THICKNESS, c))
  } else {
    sols.push(collisionneur(x + bande, y + SLAB_THICKNESS / 2, z + (-c / 2 + finArriere) / 2, STAIRWELL_WIDTH, SLAB_THICKNESS, finArriere + c / 2))
    sols.push(collisionneur(x + bande, y + SLAB_THICKNESS / 2, z + (finPalier + c / 2) / 2, STAIRWELL_WIDTH, SLAB_THICKNESS, c / 2 - finPalier))
    // The landing the ramp from below arrives on, at this storey's own level.
    sols.push(collisionneur(x + r.dx, y + SLAB_THICKNESS / 2, z + course / 2 + 1.2, STAIRWELL_WIDTH, SLAB_THICKNESS, 2.4))
  }
  // The four walls and the two door cheeks.
  const murs: Entity[] = [
    collisionneur(x, y + h / 2, z - c / 2, c, h, ep),
    collisionneur(x - c / 2, y + h / 2, z, ep, h, c),
    collisionneur(x + c / 2, y + h / 2, z, ep, h, c),
    collisionneur(x - (c + DOOR_WIDTH) / 4, y + h / 2, z + c / 2, (c - DOOR_WIDTH) / 2, h, ep),
    collisionneur(x + (c + DOOR_WIDTH) / 4, y + h / 2, z + c / 2, (c - DOOR_WIDTH) / 2, h, ep)
  ]

  // Enfant de `montee`, donc a l'origine: elle porte la position et la pente pour les deux.
  const parentAvant = parentCourant
  parentCourant = montee
  const ramp = collisionneur(0, 0, 0, rampeX, 0.18, RAMP_LENGTH)
  const RAIL_H = 1.1
  const rails: Entity[] = []
  for (const cote of [-1, 1]) {
    rails.push(collisionneur(cote * (rampeX / 2 - 0.03), (RAIL_H + 0.18) / 2, 0, 0.06, RAIL_H, RAMP_LENGTH))
  }
  parentCourant = parentAvant

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
  // Le cylindre et le modele n'arrivent qu'avec la premiere charge: voir `armSentry`.
  // A l'echelle zero ils comptaient deja deux objets rendus par etage, arme ou non.

  return { coque, verre, accent, montee, sols, murs, ramp, rails, sentry }
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
  /*
    A skin is more than a colour on the walls. It was: a Cursed base turned purple and that
    was all (owner, 4 Sep). Now a skinned base stands on a disc of its colour, the idiom the
    rare crates already use on the belt, and wears a slow crown of rays over its roof: two
    rendered objects, on the rare bases that earned a skin, visible on every profile. The
    walls themselves stay unlit, as asked; their surface comes from the model files.
  */
  for (const e of [v.halo, v.couronne]) if (e !== null) engine.removeEntity(e)
  v.halo = null; v.couronne = null
  if (p.skin > 0) {
    const hex = mutation(p.skin).color
    // A solid kerb around the plinth, cut from the skin's own material by the storey
    // generator (`frame-skin-<id>.glb`): the same gold as the pillars, not a painted band
    // (owner, 4 Sep). One rendered object, no collider: it is a rim, not a wall.
    v.halo = engine.addEntity()
    Transform.create(v.halo, { parent: v.racine })
    GltfContainer.create(v.halo, { src: `assets/Models/frame-skin-${p.skin}.glb`, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
    v.couronne = spawnRays(v.racine, Vector3.create(0, v.floors.length * FLOOR_HEIGHT + 0.6, 0), 7, hex, 1.4, 10)
  }
  // The colour lives in the file, so repainting is swapping which file each storey shows.
  const mods = modelesDe(p)
  for (const et of v.floors) {
    for (const [ent, src] of [[et.accent, mods.accent], [et.montee, mods.climb], [et.verre, mods.verre]] as Array<[Entity, string]>) {
      const g = GltfContainer.getMutableOrNull(ent)
      const chemin = `assets/Models/${src}`
      if (g !== null && g.src !== chemin) g.src = chemin
    }
  }
}

function expulser(base: Vector3, floors: number): void {
  const moi = Transform.getOrNull(engine.PlayerEntity)
  if (moi === null) return
  const dx = Math.abs(moi.position.x - base.x), dz = Math.abs(moi.position.z - base.z)
  const dedans = dx <= BASE_SIDE / 2 + 0.6 && dz <= BASE_SIDE / 2 + 0.6 && moi.position.y <= floors * FLOOR_HEIGHT + 1
  if (!dedans) return
  const o = orientToBase(base.z, 0, BASE_SIDE / 2 + 2.5)
  const porte = Vector3.create(base.x + o.dx, 0.3, base.z + o.dz)
  if (moveTo('expulsion', porte, Vector3.create(base.x, 2, base.z))) {
    alerter('SEALED  ·  you were pushed out', '#ffd166', TOAST.warning)
  }
}

/*
  The lock post, in the owner's own base and nowhere else.

  A plain green disc on the floor said "step here" and nothing about a shield (owner, 4 Sep).
  Norman's rule for a control whose effect is not obvious from its shape: give it a
  SIGNIFIER, and label it when the signifier alone is ambiguous. The reference does exactly
  that: its lock is a labelled button standing in the base, with its timer on it. So this is
  a short post with the shield emblem the shop already uses for defence, and one line under
  it that says what a tap does and how long the state lasts: LOCK BASE, LOCKED 0:43, READY IN
  1:50. Text, but on the object and only the necessary word, which is the genre's own choice.

  Owner only: nobody else can press it, so nobody else needs to see it. Three drawn objects
  (post, emblem, line) plus an invisible collider that takes the tap; the emblem and the line
  turn to face whoever looks. Colour carries the state before the word is read: the emblem
  glows when ready, burns brighter while sealed, greys out while recharging.
*/
/** From which rarity a piece wears a crown of rays: Epic (4), Legendary, Mythic. */
const RAYS_MIN_RARITY = 4
/** From which rarity a piece floats above its pad, and by how much (metres). */
const FLOAT_MIN_RARITY = 6
const FLOAT_AMPLITUDE = 0.22
const LOCK_EMBLEM = 'assets/ui/ui-shield.png'
/** How close to the post the contextual button takes the lock over from the tap. */
const LOCK_POST_REACH = 2.2
let lockPost: Entity | null = null
let lockEmblem: Entity | null = null
let lockLine: Entity | null = null
let lockTap: Entity | null = null
let lockParent: Entity | null = null
let lockState = ''
let lockLineText = ''
let lockPostWorld: Vector3 | null = null

/** Standing at the lock post, with the lock ready: the contextual button offers LOCK BASE. */
export function lockPostInReach(): boolean {
  if (lockPostWorld === null || lockState !== 'ready') return false
  const moi = Transform.getOrNull(engine.PlayerEntity)
  if (moi === null) return false
  return Math.hypot(moi.position.x - lockPostWorld.x, moi.position.z - lockPostWorld.z) <= LOCK_POST_REACH
}

function mmss(s: number): string { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

function tenirLePave(racine: Entity, lockedUntil: number): void {
  const now = Date.now()
  if (lockPost === null || lockParent !== racine) {
    for (const e of [lockPost, lockEmblem, lockLine, lockTap]) if (e !== null) engine.removeEntity(e)
    lockPostWorld = null
    lockParent = racine
    lockState = ''
    lockLineText = ''
    /*
      In the front corner away from the stairwell: the stairwell and the elevator take the
      +x side, the pedestals the middle, the doorway the centre of +z. This corner is the
      one square nothing else uses, and it is the first thing met after the door (owner,
      4 Sep: "a corner not used by the elevator").
    */
    const rt = Transform.getOrNull(racine)
    const o = orientToBase(rt?.position.z ?? 0, -BASE_SIDE / 2 + 1.3, BASE_SIDE / 2 - 1.3)
    const y = SLAB_THICKNESS
    lockPostWorld = rt === null ? null : Vector3.create(rt.position.x + o.dx, rt.position.y + y, rt.position.z + o.dz)
    lockPost = engine.addEntity()
    Transform.create(lockPost, { parent: racine, position: Vector3.create(o.dx, y + 0.5, o.dz), scale: Vector3.create(0.3, 1.0, 0.3) })
    MeshRenderer.setBox(lockPost)
    Material.setPbrMaterial(lockPost, plastic('#1a2f55', 0.2))
    lockEmblem = engine.addEntity()
    Transform.create(lockEmblem, { parent: racine, position: Vector3.create(o.dx, y + 1.45, o.dz), scale: Vector3.create(0.8, 0.8, 1) })
    MeshRenderer.setPlane(lockEmblem)
    Billboard.create(lockEmblem, { billboardMode: BillboardMode.BM_Y })
    lockLine = engine.addEntity()
    Transform.create(lockLine, { parent: racine, position: Vector3.create(o.dx, y + 2.05, o.dz), scale: Vector3.create(0.5, 0.5, 0.5) })
    Billboard.create(lockLine, { billboardMode: BillboardMode.BM_Y })
    TextShape.create(lockLine, { text: '', fontSize: 2.6, textColor: Color4.White(), outlineWidth: 0.22, outlineColor: Color3.create(0, 0, 0) })
    // The tap lands on a tall invisible box around the whole post, easier to hit than a plane.
    lockTap = engine.addEntity()
    Transform.create(lockTap, { parent: racine, position: Vector3.create(o.dx, y + 1.2, o.dz), scale: Vector3.create(1.0, 2.4, 1.0) })
    MeshCollider.setBox(lockTap, ColliderLayer.CL_POINTER)
  }
  const locked = lockedUntil > now
  const readyAt = lockedUntil + LOCK_COOLDOWN_MS
  const recharging = !locked && now < readyAt
  const state = locked ? 'locked' : recharging ? 'recharging' : 'ready'
  if (state !== lockState) {
    lockState = state
    const tint = locked ? Color4.create(1, 1, 1, 1) : recharging ? Color4.create(0.42, 0.45, 0.52, 1) : Color4.create(1, 1, 1, 1)
    Material.setPbrMaterial(lockEmblem as Entity, {
      texture: Material.Texture.Common({ src: LOCK_EMBLEM }),
      emissiveTexture: Material.Texture.Common({ src: LOCK_EMBLEM }),
      albedoColor: tint,
      emissiveColor: Color3.White(),
      emissiveIntensity: locked ? 2.4 : recharging ? 0 : 1.1,
      metallic: 0, roughness: 1, specularIntensity: 0,
      transparencyMode: 1, alphaTest: 0.5
    })
    PointerEvents.createOrReplace(lockTap as Entity, {
      pointerEvents: [{
        eventType: PointerEventType.PET_DOWN,
        eventInfo: { button: InputAction.IA_POINTER, hoverText: locked ? 'Base locked' : recharging ? 'Lock recharging' : `Lock base  \u00b7  ${Math.round(LOCK_FREE_MS / 1000)} s` }
      }]
    })
  }
  // The line under the emblem: what a tap does, or how long the current state lasts.
  const ligne = locked ? `LOCKED ${mmss(Math.ceil((lockedUntil - now) / 1000))}`
    : recharging ? `READY IN ${mmss(Math.ceil((readyAt - now) / 1000))}`
    : 'LOCK BASE'
  if (ligne !== lockLineText) {
    lockLineText = ligne
    const tl = TextShape.getMutableOrNull(lockLine as Entity)
    if (tl !== null) {
      tl.text = ligne
      tl.textColor = locked ? Color4.fromHexString('#7cd4ffff') : recharging ? Color4.fromHexString('#9aa3adff') : Color4.fromHexString('#a8e86eff')
    }
  }
  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, lockTap as Entity)) lockBase()
}

/** One pedestal: a small box under the floor until something stands on it, with the steal handle. */
function createPedestal(racine: Entity, k: number): Entity {
  const o = engine.addEntity()
  const d = slotPosition(k)
  Transform.create(o, {
    parent: racine,
    position: Vector3.create(d.dx, -5, d.dz),
    scale: Vector3.create(0.45, 0.45, 0.45)
  })
  /*
    Pas de boite: un socle vide ne dessine rien.

    Il en portait une, cinq metres sous le sol, invisible, et le client la comptait quand meme
    comme un objet rendu, un materiau, un appel de dessin: six par etage, pour rien, sur
    toutes les bases de la carte (mesure du 2 Sep). La piece posee arrive avec son propre
    modele et son socle; la silhouette du Secret se construit en enfants. Rien ici n'a besoin
    d'un maillage sur l'entite elle-meme. Le collider de pointeur, lui, reste: il n'est pas
    rendu.
  */
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

function createView(x: number, z: number, mods: { accent: string; climb: string; verre: string }, teinte: string, loin = false): View {
  // One root at the centre, turned so the door faces the belt; everything below is local to it.
  const racine = engine.addEntity()
  Transform.create(racine, { position: Vector3.create(x, 0, z), rotation: Quaternion.fromEulerDegrees(0, baseFacing(z) === -1 ? 180 : 0, 0) })
  parentCourant = racine
  const plinth = bloc(0, 0.06, 0, PLINTH_SIDE, 0.12, PLINTH_SIDE, TOY.plinth)
  Material.setPbrMaterial(plinth, plastiqueMoule(TOY.plinth, PLINTH_SIDE, PLINTH_SIDE))

  /*
    Only the ground floor is built here; the rest appear when they are bought.

    Every base used to create all of its possible floors at once, hidden by a zero scale.
    That was affordable at three. At eight, with sixty bases on screen, it is several
    thousand entities standing in for buildings nobody has earned, paid for in scene budget
    and in network traffic the moment anyone walks in. Floors are added in the update below
    as the plot reports them, so an unreached floor costs exactly nothing.
  */
  const floors: Floor[] = [buildFloor(0, 0, 0, mods, teinte, loin)]

  const ascenseur = engine.addEntity()
  Transform.create(ascenseur, {
    parent: racine,
    // In the corner, at the foot of the ramp, out of the walking path (tester's placement, 28 Aug).
    position: Vector3.create(ASC_X, FLOOR_HEIGHT / 2, ASC_Z),
    scale: Vector3.create(0.5, FLOOR_HEIGHT, 0.5)
  })
  if (!loin) {
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
  }

  const door = engine.addEntity()
  Transform.create(door, {
    parent: racine,
    position: Vector3.create(0, (MAX_FLOORS * FLOOR_HEIGHT) / 2, 0),
    scale: Vector3.create(0, 0, 0)
  })
  if (!loin) MeshRenderer.setBox(door)
  // A shield you can walk through is a lie. It had a renderer and no collider, so it
  // looked like a wall and stopped nothing.
  if (!loin) MeshCollider.setBox(door)
  if (!loin) Material.setPbrMaterial(door, {
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
  if (!loin) TextShape.create(gain, {
    text: '', fontSize: 4.4, textColor: VERT, outlineWidth: 0.22, outlineColor: NOIR
  })

  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(x, FLOOR_HEIGHT + 1.15, z), scale: Vector3.create(0.75, 0.75, 0.75) })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
  if (!loin) TextShape.create(label, {
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
    position: Vector3.create(0, WALL_HEIGHT + 0.35, BASE_SIDE / 2 + SIGN_OFFSET),
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
  if (!loin) MeshRenderer.setPlane(enseigne)
  /*
    Alpha TEST, not blend. The glazing is alpha blended, and two blended surfaces resolve
    their order per frame by distance: from some angles the wall drew over the sign and
    the plate melted into the glass (owner, 1 Sep, two screenshots). A tested cutout
    writes depth and wins every angle. The texture is the sign's own 4:1 drawing; the
    stretched square panel read as a pill.
  */
  if (!loin) Material.setPbrMaterial(enseigne, {
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
  for (let k = 0; k < SLOTS_PER_FLOOR; k++) items.push(createPedestal(racine, k))
  parentCourant = null
  return { plinth, label, gain, door, plaque, plaqueGlyphes: null, loin, vuLabel: '', vuBouclier: '', ascenseur, floors, items, signature: '', ownerId: '', skin: -1, peints: 0, halo: null, couronne: null, racine }
}

function destroyView(v: View): void {
  engine.removeEntity(v.plinth)
  for (const e of [v.halo, v.couronne]) if (e !== null) engine.removeEntity(e)
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
    for (const ent of [e.coque, e.verre, e.accent, e.montee, e.ramp, ...e.sols, ...e.murs, ...e.rails]) {
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
  const moi = myClientAddress()
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
  const moi = myClientAddress()
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
 * anything: `inReach` gates theft on `|dy| <= SAME_STOREY`, so only the same floor is
 * reachable. Within a floor the six pedestals span 7.2 m against a 10 m reach, so which one
 * you pick changes nothing a thief cares about. It is offered anyway, because arranging your
 * own building is worth doing for its own sake and because the marker makes the choice legible
 * before it is made rather than after.
 *
 * Candidates are the indices of that floor, cut to the length of the shelf: an index beyond
 * the end would be a hole, and the shelf is a dense queue. A floor above what the shelf
 * reaches falls back to the top of it.
 */
export function placeTarget(): { ownerId: string; index: number; pos: Vector3 } | null {
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
    const s = orientToBase(base.z, slotPosition(k).dx, slotPosition(k).dz)
    const dx = t.position.x - (base.x + s.dx), dz = t.position.z - (base.z + s.dz)
    const d = dx * dx + dz * dz
    if (d >= meilleur) continue
    meilleur = d
    choisi = k
  }
  if (choisi < 0) return null
  const s = slotPosition(choisi)
  const o = orientToBase(base.z, s.dx, s.dz)
  return { ownerId: base.p.ownerId, index: choisi, pos: Vector3.create(base.x + o.dx, s.dy, base.z + o.dz) }
}

/**
 * The sign hangs OUTSIDE the shield.
 *
 * The shield box reached 0.6 m past the walls and the sign hung 0.22 m past them, so a
 * locked base showed its owner's name through the tinted glass of its own shield, half
 * legible (mobile tester's screenshot, 3 Sep). The shield now stops 0.2 m past the walls,
 * which changes nothing for a thief (the items are inside), and the sign hangs 0.34 m out,
 * a hand's width in front of the shield's face.
 */
const SHIELD_MARGIN = 0.2
const SIGN_OFFSET = SHIELD_MARGIN + 0.14

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
          if (v.ownerId.toLowerCase() === myClientAddress()) pickUp(k)
          else steal(v.ownerId, k)
          return
        }
      }

      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.ascenseur)
      ) {
        if (v.ownerId.toLowerCase() !== myClientAddress()) {
          alerter('NOT YOUR ELEVATOR  ·  TAKE THE RAMP', '#ffd166', TOAST.warning)
          return
        }
        goUpOneFloor(v)
        return
      }

    }
  })

  engine.addSystem(() => {
    const vivantes = new Set<number>()

    /*
      Une passe prealable: qui est ou, et combien on peut s'en offrir en entier.

      Elle doit precede la boucle, parce que le niveau d'une base ne depend pas d'elle seule
      mais de sa PLACE parmi les autres. La base du lecteur passe devant tout le monde.
    */
    const moiT = Transform.getOrNull(engine.PlayerEntity)
    const moiAdr = myClientAddress()
    const distances = new Map<number, number>()
    const rangs: Array<{ id: number; rang: number; pres: number; loin: number }> = []
    for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
      const id = ent as unknown as number
      const t = Transform.get(ent)
      const d = moiT === null ? 0 : Math.hypot(moiT.position.x - t.position.x, moiT.position.z - t.position.z)
      distances.set(id, d)
      const sienne = p.ownerId.toLowerCase() === moiAdr
      const dejaPres = views.get(id)?.loin === false
      rangs.push({
        id,
        rang: sienne ? -1 : dejaPres ? d * LOD_FIDELITE : d,
        pres: baseCost(p, true),
        loin: baseCost(p, false)
      })
    }
    rangs.sort((a, b) => a.rang - b.rang)

    /*
      Tout le monde commence reduit, puis on rachete le detail complet du plus proche au plus
      loin tant que le budget suit. Une base qu'on ne peut pas s'offrir n'arrete pas la boucle:
      une base basse derriere une tour peut encore rentrer, et la refuser gaspillerait la place.
    */
    let facture = DECOR_COST
    for (const r of rangs) facture += r.loin
    const complets = new Set<number>()
    for (const r of rangs) {
      const surcout = r.pres - r.loin
      if (r.rang < 0 || facture + surcout <= OBJECT_BUDGET) {
        facture += surcout
        complets.add(r.id)
      }
    }

    for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
      const id = ent as unknown as number
      vivantes.add(id)
      const t = Transform.get(ent)
      const monBaseLod = p.ownerId.toLowerCase() === myClientAddress()
      const dist = distances.get(id) ?? 0
      let v = views.get(id)
      /*
        Le rang de cette base dans l'ordre des distances decide de son niveau. Une base deja
        complete garde un rang de tolerance avant d'etre degradee: sans lui, faire un pas en
        avant et un pas en arriere reconstruirait un batiment entier deux fois.
      */
      const veutLoin = !monBaseLod && dist > LOD_TOUJOURS_PRES && !complets.has(id)
      if (v !== undefined && v.loin !== veutLoin) {
        destroyView(v)
        views.delete(id)
        v = undefined
      }
      if (!v) {
        v = createView(t.position.x, t.position.z, modelesDe(p), accentPour(p), veutLoin)
        views.set(id, v)
      }

      const lockSeconds = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
      const monBase = p.ownerId.toLowerCase() === myClientAddress()

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
      /*
        Ne prendre le mutable QUE si la valeur a change.

        `getMutable` marque l'entite sale, la serialise en octets et la compare a l'instantane
        precedent avant de decider de ne rien send: la comparaison, elle, se paie. Ces deux
        blocs s'executaient a CHAQUE IMAGE pour CHAQUE base, donc cent vingt composants salis
        par image sur une place de soixante parcelles. Mesure du 1 Sep sous soixante bases:
        2,3 ticks de scene par seconde contre 40 vises, et le client a affiche sa propre
        alerte de performance. Le texte et le bouclier ne changent qu'une fois par seconde au
        plus; on compare d'abord, on ecrit ensuite.
      */
      const txt = TextShape.getOrNull(v.label) === null ? null : v.label
      if (txt !== null) {
        const lock = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
        const state = lock > 0 ? `\nLOCKED ${lock}s` : (p.ownerPresent ? '' : '\n(away)')
        const ledger = (p.given > 0 || p.received > 0)
          ? `\n${p.received} received  ·  ${p.given} given`
          : ''
        const ta = structurel ? Transform.getMutableOrNull(v.ascenseur) : null
        if (ta !== null) {
          /*
            Pas d'ascenseur tant qu'il n'y a qu'un etage.

            Une cabine qui monte vers rien est une promesse fausse: le joueur la voit, le
            bouton contextuel la propose, il appuie, et il ne se passe rien. A l'echelle zero
            elle ne se dessine plus ET son collisionneur disparait avec, donc ni le clic ni la
            proximite ne peuvent l'atteindre. Elle reapparait avec le deuxieme etage, au
            moment ou elle sert (proprietaire, 3 Sep).
          */
          const h = p.floors * FLOOR_HEIGHT
          const utile = p.floors > 1
          ta.scale = utile ? Vector3.create(0.5, h, 0.5) : Vector3.Zero()
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
            armSentry(v.floors[e].sentry, n > 0 && !v.loin)
            // A guarded storey throws its cyan on the floor: the defence reads before the rule does.
            toyLight(v.floors[e].sentry, n > 0 && !v.loin ? TOY.sentry : null, 1.6)
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
        // Compare d'abord, ecris ensuite: c'est tout le correctif.
        const ligne = `${p.ownerName}${rang}${state}${guard}${ledger}|${p.ownerPresent}`
        if (ligne !== v.vuLabel) {
          v.vuLabel = ligne
          const mt = TextShape.getMutableOrNull(txt)
          if (mt !== null) {
            mt.text = `${p.ownerName}${rang}${state}${guard}${ledger}`
            mt.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')
          }
        }
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
          v.plaqueGlyphes = (p.ownerName === '' || v.loin) ? null : place3DText(v.plaque, segs, !p.ownerPresent)
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
        Material.setPbrMaterial(v.plinth, plastiqueMoule(p.ownerPresent ? TOY.plinth : TOY.plinthAway, PLINTH_SIDE, PLINTH_SIDE))
        repeindre(v, p)
      }

      // Catch up to what this base has actually opened, one floor at a time.
      if (structurel) {
        while (v.floors.length < Math.min(p.floors, MAX_FLOORS)) {
          parentCourant = v.racine
          v.floors.push(buildFloor(0, 0, v.floors.length, modelesDe(p), accentPour(p), v.loin))
          parentCourant = null
          // The storey's six pedestals arrive with it.
          while (v.items.length < v.floors.length * SLOTS_PER_FLOOR) v.items.push(createPedestal(v.racine, v.items.length))
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
          for (const m of [et.coque, et.verre, et.accent, ...et.sols, ...et.murs]) montrer(m, open)
          // No climb off the top storey: it would rise to nothing. The landing it lands on
          // belongs to the storey above, and appears and disappears with it.
          const monte = open && e + 1 < p.floors
          for (const m of [et.montee, et.ramp, ...et.rails]) montrer(m, monte)
        }
      }

      // Meme regle pour le bouclier: sa taille ne change qu'a la seconde ou il se leve.
      const lockedNow = p.lockedUntil > Date.now()
      const shieldState = `${lockedNow}|${p.floors}|${monBase}`
      const ptr = shieldState === v.vuBouclier ? null : Transform.getMutableOrNull(v.door)
      if (ptr !== null) {
        v.vuBouclier = shieldState
        const locked = lockedNow
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
          ? Vector3.create(BASE_SIDE + 2 * SHIELD_MARGIN, h, BASE_SIDE + 2 * SHIELD_MARGIN)
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
        /*
          Whoever is inside when it seals is pushed out to the door.

          The reference traps intruders instead, and that works there because the owner then
          KILLS the trapped thief and the matter ends in a respawn. We have no death: a
          trapped thief would only stand in a sealed room for sixty seconds, out of the game
          (owner, 4 Sep). So the seal is a broom here, and the reference's trap stays theirs.
        */
        const solide = locked && !monBase
        if (solide && !MeshCollider.has(v.door)) {
          MeshCollider.setBox(v.door)
          expulser(t.position, p.floors)
        } else if (!solide && MeshCollider.has(v.door)) MeshCollider.deleteFrom(v.door)
      }

      // The lock pad: the one control of the base that is a thing on its floor.
      if (monBase) tenirLePave(v.racine, p.lockedUntil)

      // The signature only carries STRUCTURAL state. A value that ticks every second
      // (a countdown, a gauge) belongs on its own element: inside a cache key it forces
      // a full rebuild each second, which restarts item rotation tweens from identity.
      if (!structurel) continue
      v.signature = sig
      v.ownerId = p.ownerId

      const mine = monBase
      const verb = mine
        ? 'Pick up'
        : 'Steal'
      for (let k = 0; k < v.items.length; k++) {
        const code = p.items[k]
        const label = code === undefined || code === VIDE
          ? verb
          : `${verb} ${nomDuCode(code)} · ${formatIncome(itemIncome(code, INCOME_UI))}/s`
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
        const occupe = !v.loin && k < p.items.length && p.items[k] !== VIDE

        // 1. Tweens off, whatever the state: nothing below is safe while one is running.
        Tween.deleteFrom(ent)
        TweenSequence.deleteFrom(ent)

        if (!occupe) {
          // 2a. Empty: under the floor, no size, no model. Material is irrelevant unseen.
          tr.position = Vector3.create(0, -5, 0)
          tr.scale = Vector3.Zero()
          toyFloat(ent, null)
          demonter(ent)
          clearShape(ent)
          clearPedestal(ent)
          clearLight(ent)
          clearRays(ent)
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
        tr.position = Vector3.create(d.dx, d.dy + JEU + PEDESTAL_THICKNESS + size / 2, d.dz)
        tr.rotation = Quaternion.Identity()
        tr.scale = Vector3.create(size, size, size)
        const hex = itemColor(rarityOf(code), mutationDe(code))
        const c = Color4.fromHexString(hex + 'ff')
        const mutId = mutationDe(code)
        // Gold and Diamond are metal and gem; every other mutation, and rarity itself, glow.
        const mat = estMetal(mutId) ? metalMaterial(hex, mutId, r.glow) : plasticDe(c, r.glow)
        Material.setPbrMaterial(ent, mat)
        // The toy of this rarity, as children: the same silhouette the hand and the belt show.
        rarityShape(ent, rarityOf(code), mat)
        /*
          Every toy stands on a pad; a mutation colours it, and so does a Rare-or-better even
          without a mutation. The pad is emissive geometry, so unlike the point light and the
          bloom halo (both off on a Low preset, which a phone drops to under heat) it glows on
          every device. It is the one glow we fully control (tester, 28 Aug: no bloom at all).
        */
        // Glow comes from RARITY, not from the mutation: a Common Candy is matte pink, a Rare
        // Candy glows (tester, 28 Aug). The mutation only sets the COLOUR of the glow when
        // there is one. Below the rarity threshold, no pad glow whatever the mutation.
        const padHex = r.glow >= LIGHT_MIN_GLOW ? (m.mult > 1 ? m.color : hex) : null
        toyPedestal(ent, size, padHex)
        // Epic and up wear a crown of rays; a mutation lends it its colour.
        toyRays(ent, size, rarityOf(code) >= RAYS_MIN_RARITY ? (m.mult > 1 ? m.color : hex) : null)
        // Rare and above, or anything mutated, lights the slab it stands on in its own colour.
        // Rarity drives the light; a trait is earned so it adds; a mutation does not (it is colour).
        const eclat = r.glow + 0.8 * traits
        toyLight(ent, eclat >= LIGHT_MIN_GLOW ? hex : null, eclat)
        /*
          One shared model per rarity, and the artist decides the silhouette.

          `assets/toy/item-<rarity>.glb`, authored to a unit cube: the entity keeps being
          scaled by rarity and mutation exactly as the box is, so a model exported at one
          metre lands at the right size on every pedestal. Seven files for seven rarities is
          the whole item budget; sixty bases share them and the engine keeps one copy each.
        */
        remonter(ent, `item-${rarityOf(code)}.glb`)
        // The Secret floats; in the parent's units, since the parent is scaled by `size`.
        toyFloat(ent, rarityOf(code) >= FLOAT_MIN_RARITY ? FLOAT_AMPLITUDE / size : null)

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
    const o = orientToBase(base.z, s.dx, s.dz)
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
    mine: base.p.ownerId.toLowerCase() === myClientAddress(),
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
function myElevator(): View | null {
  const moi = myClientAddress()
  for (const v of views.values()) if (v.ownerId.toLowerCase() === moi) return v
  return null
}
export function elevatorInReach(): boolean {
  const t = Transform.getOrNull(engine.PlayerEntity)
  const v = myElevator()
  if (t === null || v === null) return false
  // Un seul etage: la cabine n'est pas dessinee, le bouton ne doit pas la proposer non plus.
  if (v.floors.length < 2) return false
  const r = Transform.getOrNull(v.racine)
  if (r === null) return false
  const el = orientToBase(r.position.z, ASC_X, ASC_Z)
  return Math.hypot(t.position.x - (r.position.x + el.dx), t.position.z - (r.position.z + el.dz)) <= ELEVATOR_REACH
}
export function monterIci(): void {
  const v = myElevator()
  if (v !== null) goUpOneFloor(v)
}
