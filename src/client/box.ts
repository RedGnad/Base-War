import { plasticDe, caisse, FIT, TOY_DIR } from './toy'
import {
  engine, Transform, MeshRenderer, MeshCollider, Material, PointerEvents, PointerEventType,
  InputAction, inputSystem, Tween, TweenSequence, TweenLoop, EasingFunction, Entity, AudioSource, timers, GltfContainer
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { room } from '../shared/messages'
import { Plot, SLOTS_PER_FLOOR, OPEN_RANGE, occupe } from '../shared/schemas'
import { rarity, crate, mutation, itemName, itemColor } from '../shared/loot-table'
import { alerter } from './theft'
import { carryView } from './carry'
import { envoyerOuAttendre } from './intent'

let monAdresse = ''

const COUPS = 3

/**
 * One crate at a time, from the floor to your hand.
 *
 * `opening` and `roule` were two booleans, and between them were gaps: after the third blow
 * and before the server answered, and after the reel stopped and before the item landed in
 * the hand, neither was set, so the action button offered OPEN again and a fourth press in a
 * rhythm put a second crate on the floor under the first one's reel. The server refused the
 * second opening, the crate burst into nothing, and the player saw a bug. One phase now, and
 * the interface offers nothing but SMASH while a crate is in flight, whatever the phase.
 */
export type PhaseCaisse = 'idle' | 'smash' | 'wait' | 'roll' | 'land'

export const boxView = {
  stock: [] as number[],
  phase: 'idle' as PhaseCaisse,
  /** When a phase that waits on something gives up and returns to idle. */
  phaseJusqua: 0,
  opening: false,
  coups: 0,
  typeEnCours: 0,
  roule: false,
  /**
   * The reel, and where it has travelled to.
   *
   * `reel` is a strip of candidate rarities with the real result planted at REEL_WIN, and
   * `progres` is how many cards have passed the centre line so far, as a float. One number
   * drives the whole animation, so the interface only has to read it and draw.
   */
  reel: [] as number[],
  progres: 0,
  /** When the strip stopped, for the pop and the flash the interface draws from it. */
  gagneA: 0,
  /** The last card that crossed the line, so the tick plays once per card. */
  dernierPas: 0,
  resultat: -1,
  resultatMutation: 0,
  resultatTraits: 0,
  resultatJusqua: 0,
  state: 'expose',
  message: ''
}

let crateMesh: Entity
let sonCoup: Entity
let sonBurst: Entity
let sonReveal: Entity
const eclats: Entity[] = []
let sonTic: Entity
let left = 0
let reelS = 1

/**
 * Length of the strip, where the winning card sits in it, and how long it runs.
 *
 * The run is the reward's own drumroll, so it grows with the rarity: a Common is over in three
 * seconds, a Secret crawls for more than six. Loot-box openings across the genre put their
 * whole effect in that delay before the reveal, and the reference reels (CS:GO and its clones)
 * run five to eight seconds over a strip far longer than the window. Forty-four cards at two
 * hundred pixels is a strip of nine metres of screen for a window that shows eight of them.
 */
const REEL_LEN = 44
export const REEL_WIN = 38
const REEL_BASE_S = 3.0
const REEL_PER_RARITY_S = 0.55

/**
 * A plausible strip to scroll past.
 *
 * The cards the player does not win still have to look like things they could have won,
 * so the filler is drawn against falling weights rather than uniformly: mostly commons,
 * the occasional legendary, which is what makes the strip read as a gamble.
 */
const POIDS_REEL = [50, 24, 10, 6, 5, 3, 2]
function rareteDecor(): number {
  const total = POIDS_REEL.reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (let i = 0; i < POIDS_REEL.length; i++) {
    n -= POIDS_REEL[i]
    if (n <= 0) return i
  }
  return 0
}

export function setupBox(): void {
  setupFantomeCaisse()

  crateMesh = engine.addEntity()
  Transform.create(crateMesh, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0, 0, 0) })
  MeshCollider.setBox(crateMesh)
  PointerEvents.create(crateMesh, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Smash' } }
    ]
  })

  const emetteur = (clip: string, steal: number): Entity => {
    const e = engine.addEntity()
    Transform.create(e, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
    AudioSource.create(e, { audioClipUrl: clip, playing: false, loop: false, volume: steal })
    return e
  }
  sonCoup = emetteur('assets/sounds/hit.wav', 0.9)
  sonBurst = emetteur('assets/sounds/burst.wav', 1)
  sonReveal = emetteur('assets/sounds/reveal.wav', 0.85)
  sonTic = emetteur('assets/sounds/tick.wav', 0.5)
  // Le refus se dit au son, pas au texte: un etage plein est une chose qu'on entend une fois
  // et qu'on comprend, la ou une plaque "FLOOR FULL" reste a lire a chaque tentative.
  sonRefus = emetteur('assets/sounds/tick.wav', 0.35)

  for (let i = 0; i < 14; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0, 0, 0) })
    MeshRenderer.setBox(e)
    eclats.push(e)
  }

  room.onMessage('inventory', (d) => { boxView.stock = [...d.crates] })

  engine.addSystem(() => {
    if (monAdresse !== '') return
    const me = getPlayer()
    if (me !== null) monAdresse = me.userId.toLowerCase()
  })

  room.onMessage('boxResult', (d) => {
    boxView.phase = 'roll'
    boxView.roule = true
    boxView.resultat = d.rarity
    boxView.resultatMutation = d.mutation
    boxView.resultatTraits = d.traits
    boxView.state = d.state
    boxView.reel = Array.from({ length: REEL_LEN }, () => rareteDecor())
    boxView.reel[REEL_WIN] = d.rarity
    boxView.progres = 0
    boxView.dernierPas = 0
    reelS = REEL_BASE_S + d.rarity * REEL_PER_RARITY_S
    left = reelS

    const depart = lastPosition
    if (depart !== null) {
      timers.setTimeout(() => sendToHand(depart, d.rarity, d.mutation), Math.round(reelS * 1000) + 120)
    }
  })

  engine.addSystem((dt: number) => {
    if (boxView.opening && inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, crateMesh)) {
      frapper()
    }

    if (boxView.roule) {
      left -= dt
      // Quartic ease-out: the strip leaves fast and crawls onto the winning card, which is
      // the whole tension of the thing. One float, read straight by the interface.
      const t = Math.min(1, Math.max(0, 1 - left / reelS))
      boxView.progres = (1 - Math.pow(1 - t, 4)) * REEL_WIN
      // One tick per card crossing the line: the rhythm IS the deceleration.
      const pas = Math.floor(boxView.progres + 0.5)
      if (pas !== boxView.dernierPas) { boxView.dernierPas = pas; jouer(sonTic) }
      if (left <= 0) {
        boxView.roule = false
        boxView.phase = 'land'
        boxView.phaseJusqua = Date.now() + 5000
        boxView.progres = REEL_WIN
        boxView.gagneA = Date.now()
        jouer(sonReveal)
        // Long enough to read the name once, gone before it outstays the win: the
        // genre closes its reveals fast and lets the item in the hand carry the memory.
        boxView.resultatJusqua = Date.now() + 2200
        console.log(`[CLIENT] crate ouverte -> ${itemName(boxView.resultat, boxView.resultatMutation)}`)
      }
    } else if (boxView.resultat >= 0 && Date.now() > boxView.resultatJusqua) {
      boxView.resultat = -1
      boxView.message = ''
    }

    // The two waits end on what they wait for, or on a timeout when it never comes: the
    // server refusing the opening, or the item not reaching the hand.
    const now = Date.now()
    if (boxView.phase === 'wait' && now > boxView.phaseJusqua) boxView.phase = 'idle'
    if (boxView.phase === 'land' && (carryView.code >= 0 || now > boxView.phaseJusqua)) boxView.phase = 'idle'
  })
}

/** One blow on the crate in front of you, from a click on it or from the action button. */
export function frapper(): void {
  if (!boxView.opening) return
  boxView.coups += 1
  const b = crate(boxView.typeEnCours)
  Tween.createOrReplace(crateMesh, {
    mode: Tween.Mode.Scale({
      start: Vector3.create(b.size * 0.72, b.size * 1.25, b.size * 0.72),
      end: Vector3.create(b.size, b.size, b.size)
    }),
    duration: 190,
    easingFunction: EasingFunction.EF_EASEOUTELASTIC,
    currentTime: 0
  })
  jouer(sonCoup)

  // The crate heats up as it is hit: the whole thing, lid, straps and body, glows harder.
  caisse(crateMesh, boxView.typeEnCours, boxView.coups / COUPS)

  if (boxView.coups >= COUPS) {
    boxView.opening = false
    boxView.phase = 'wait'
    boxView.phaseJusqua = Date.now() + 6000
    const t = Transform.getOrNull(crateMesh)
    if (t !== null) exploser(Vector3.create(t.position.x, t.position.y, t.position.z), b.color)
    storeCrate()
    const tier = boxView.typeEnCours
    envoyerOuAttendre(() => { void room.send('openBox', { crateTier: tier }) })
  }
}

let sonRefus: Entity
export function refuserAuSon(): void { jouer(sonRefus) }

let lastPosition: Vector3 | null = null

function jouer(e: Entity): void {
  const a = AudioSource.getMutableOrNull(e)
  if (a !== null) { a.playing = false; a.playing = true }
}

function exploser(center: Vector3, color: string): void {
  lastPosition = center
  jouer(sonBurst)
  const c = Color4.fromHexString(color + 'ff')
  for (let i = 0; i < eclats.length; i++) {
    const e = eclats[i]
    const a = (i / eclats.length) * Math.PI * 2
    const h = 0.6 + (i % 3) * 0.5
    const r = 1.6 + (i % 4) * 0.45
    const t = Transform.getMutableOrNull(e)
    if (t === null) continue
    t.position = center
    t.scale = Vector3.create(0.16, 0.16, 0.16)
    Material.setPbrMaterial(e, plasticDe(c, 1.4))
    Tween.createOrReplace(e, {
      mode: Tween.Mode.Move({
        start: center,
        end: Vector3.create(center.x + Math.cos(a) * r, center.y + h, center.z + Math.sin(a) * r)
      }),
      duration: 260,
      easingFunction: EasingFunction.EF_EASEOUTQUAD
    })
    TweenSequence.createOrReplace(e, {
      sequence: [{
        mode: Tween.Mode.Move({
          start: Vector3.create(center.x + Math.cos(a) * r, center.y + h, center.z + Math.sin(a) * r),
          end: Vector3.create(center.x + Math.cos(a) * r * 1.5, 0.2, center.z + Math.sin(a) * r * 1.5)
        }),
        duration: 520,
        easingFunction: EasingFunction.EF_EASEINQUAD
      }]
    })
  }
  timers.setTimeout(() => {
    for (const e of eclats) {
      const t = Transform.getMutableOrNull(e)
      if (t !== null) { t.scale = Vector3.create(0, 0, 0); t.position = Vector3.create(0, -10, 0) }
      Tween.deleteFrom(e); TweenSequence.deleteFrom(e)
    }
  }, 850)
}

function storeCrate(): void {
  Tween.deleteFrom(crateMesh)
  const t = Transform.getMutableOrNull(crateMesh)
  if (t !== null) { t.scale = Vector3.create(0, 0, 0); t.position = Vector3.create(0, -10, 0) }
}

/**
 * The reveal flies to the player's hand, because that is where the server puts it.
 *
 * Opening used to file the item straight onto a shelf after the reel, and the flight went
 * to the base. Since carrying became the one verb, a fresh item lands in the hand like a
 * stolen one does, and the player walks it to whichever pedestal they choose: the same
 * placement they already have for everything else, with the green marker.
 */
function sendToHand(from: Vector3, rarityId: number, mut = 0): void {
  const me = Transform.getOrNull(engine.PlayerEntity)
  if (me === null) return
  const target = Vector3.create(me.position.x, me.position.y + 1.0, me.position.z)

  const e = engine.addEntity()
  const r = rarity(rarityId)
  Transform.create(e, { position: from })
  // The thing that flies to the hand is the piece that was won, spinning as it goes; a
  // coloured cube stood in here from before the chess set existed. Secret has no file on
  // purpose (the star is a primitive), so it keeps the cube in its own colour.
  const visuel = engine.addEntity()
  const fichier = `item-${rarityId}.glb`
  const f = FIT[fichier]
  if (rarityId <= 5 && f !== undefined) {
    Transform.create(visuel, { parent: e, scale: Vector3.create(f.scale * r.size, f.scale * r.size, f.scale * r.size) })
    GltfContainer.create(visuel, { src: TOY_DIR + fichier, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  } else {
    Transform.create(visuel, { parent: e, scale: Vector3.create(r.size, r.size, r.size) })
    MeshRenderer.setBox(visuel)
    const c = Color4.fromHexString(itemColor(rarityId, mut) + 'ff')
    Material.setPbrMaterial(visuel, plasticDe(c, 1.2))
  }
  Tween.setRotate(visuel, Quaternion.Identity(), Quaternion.fromEulerDegrees(0, 180, 0), 560, EasingFunction.EF_LINEAR)
  TweenSequence.createOrReplace(visuel, { sequence: [], loop: TweenLoop.TL_RESTART })

  const haut = Vector3.create((from.x + target.x) / 2, Math.max(from.y, target.y) + 5, (from.z + target.z) / 2)
  Tween.createOrReplace(e, {
    mode: Tween.Mode.Move({ start: from, end: haut }),
    duration: 420,
    easingFunction: EasingFunction.EF_EASEOUTQUAD
  })
  TweenSequence.createOrReplace(e, {
    sequence: [{
      mode: Tween.Mode.Move({ start: haut, end: target }),
      duration: 520,
      easingFunction: EasingFunction.EF_EASEINQUAD
    }]
  })
  timers.setTimeout(() => engine.removeEntityWithChildren(e), 1100)
}

function myBasePosition(): Vector3 | null {
  if (monAdresse === '') return null
  for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
    if (p.ownerId.toLowerCase() !== monAdresse) continue
    const t = Transform.get(ent)
    return Vector3.create(t.position.x, 1.4, t.position.z)
  }
  return null
}

function maBasePleine(): boolean {
  const me = getPlayer()
  if (me === null) return false
  const a = me.userId.toLowerCase()
  for (const [, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== a) continue
    return occupe(p.items) >= SLOTS_PER_FLOOR * p.floors
  }
  return false
}

/** Whether a crate can be smashed from where the player stands, for the button to say so. */
export function peutOuvrirIci(): boolean {
  const base = myBasePosition()
  if (base === null || !Transform.has(engine.PlayerEntity)) return false
  const p = Transform.get(engine.PlayerEntity).position
  return Math.sqrt((p.x - base.x) ** 2 + (p.z - base.z) ** 2) <= OPEN_RANGE
}

/**
 * Smash a crate, at the base and nowhere else.
 *
 * It used to appear two metres in front of the player wherever they happened to be, which
 * made the delivery pointless: the convoy carried the crate home, and the crate then
 * reappeared somewhere else entirely. It is now put down between the player and their own
 * base, so the thing they walked home is the thing they break open.
 */
/**
 * Le fantome de la caisse: la ou elle tombera si on ouvre maintenant.
 *
 * Ouvrir pose la caisse a deux metres devant soi, sur l'etage ou l'on se tient, et seulement
 * a portee de sa propre base. Rien ne le disait: le joueur appuyait et decouvrait ou la chose
 * atterrissait (testeur, 1 Sep). Le marqueur reprend exactement le calcul de `openCrate`, a la
 * taille et a l'inclinaison de la caisse qui sera ouverte, en vert translucide comme celui de
 * la pose d'objet, avec la ligne du couvercle pour qu'il se lise comme une caisse et pas comme
 * un cube. Il disparait des que l'ouverture commence, la vraie caisse prenant sa place.
 */
let fantomeCaisse: Entity
let fantomeCouvercle: Entity
const VERT_CAISSE = Color4.create(0.35, 0.95, 0.45, 0.34)

function setupFantomeCaisse(): void {
  fantomeCaisse = engine.addEntity()
  Transform.create(fantomeCaisse, { position: Vector3.create(0, -50, 0), scale: Vector3.Zero() })
  MeshRenderer.setBox(fantomeCaisse)
  Material.setPbrMaterial(fantomeCaisse, plasticDe(VERT_CAISSE, 0.5))

  fantomeCouvercle = engine.addEntity()
  Transform.create(fantomeCouvercle, { parent: fantomeCaisse, position: Vector3.create(0, 0.32, 0), scale: Vector3.create(1.04, 0.1, 1.04) })
  MeshRenderer.setBox(fantomeCouvercle)
  Material.setPbrMaterial(fantomeCouvercle, plasticDe(Color4.create(0.35, 0.95, 0.45, 0.6), 0.9))

  engine.addSystem(() => {
    const t = Transform.getMutableOrNull(fantomeCaisse)
    if (t === null) return
    /*
      Un seul fantome a la fois, celui que le bouton propose.

      Les mains pleines, le verbe contextuel est POSER, et c'est le marqueur de socle qui doit
      guider; celui de la caisse n'a plus rien a annoncer et deux marqueurs verts a l'ecran ne
      disent plus lequel obeit au bouton (proprietaire, 1 Sep). Il revient de lui-meme des que
      la piece est posee, s'il reste une caisse a ouvrir.
    */
    const pret = boxView.phase === 'idle' && carryView.code < 0 && boxView.stock.length > 0 && !maBasePleine() && peutOuvrirIci()
    if (!pret || !Transform.has(engine.PlayerEntity)) {
      if (t.scale.x !== 0) t.scale = Vector3.Zero()
      return
    }
    const p = Transform.get(engine.PlayerEntity)
    const b = crate(Math.max(...boxView.stock))
    const f = Vector3.rotate(Vector3.create(0, 0, 1), p.rotation)
    const plat = Math.sqrt(f.x * f.x + f.z * f.z)
    const ux = plat < 0.01 ? 0 : f.x / plat
    const uz = plat < 0.01 ? 1 : f.z / plat
    t.position = Vector3.create(p.position.x + ux * 2, p.position.y + b.size / 2 + 0.02, p.position.z + uz * 2)
    t.scale = Vector3.create(b.size, b.size, b.size)
    t.rotation = Quaternion.fromEulerDegrees(0, 25, 0)
  })
}

export function openCrate(crateTier: number): void {
  if (boxView.phase !== 'idle') return
  if (!boxView.stock.includes(crateTier)) return
  if (!Transform.has(engine.PlayerEntity)) return

  const base = myBasePosition()
  if (base === null) {
    alerter('BUILD YOUR BASE FIRST', '#ff6b6b', 4000)
    return
  }
  if (!peutOuvrirIci()) {
    alerter('GO TO YOUR BASE TO OPEN IT', '#ffd166', 4000)
    return
  }
  if (maBasePleine()) {
    alerter('BASE FULL  ·  SELL OR BUY A FLOOR', '#ff6b6b', 4000)
    return
  }

  const p = Transform.get(engine.PlayerEntity)
  const b = crate(crateTier)

  boxView.phase = 'smash'
  boxView.opening = true
  boxView.coups = 0
  boxView.typeEnCours = crateTier
  boxView.message = ''

  /*
    In front of the player, at the player's height.

    It used to spawn two metres from the CENTRE of the base at ground level, whichever
    storey the player was on: open a crate on the third floor and it appeared downstairs,
    out of reach. It now sits two metres ahead of where they stand, on their storey, so
    smashing it is a thing you do where you are.
  */
  const f = Vector3.rotate(Vector3.create(0, 0, 1), p.rotation)
  const plat = Math.sqrt(f.x * f.x + f.z * f.z)
  const ux = plat < 0.01 ? 0 : f.x / plat
  const uz = plat < 0.01 ? 1 : f.z / plat
  void base

  const t = Transform.getMutableOrNull(crateMesh)
  if (t !== null) {
    // On the floor of the storey the player stands on, two metres ahead, turned a little.
    t.position = Vector3.create(p.position.x + ux * 2, p.position.y + b.size / 2 + 0.02, p.position.z + uz * 2)
    t.scale = Vector3.create(b.size, b.size, b.size)
    t.rotation = Quaternion.fromEulerDegrees(0, 25, 0)
  }
  caisse(crateMesh, crateTier)
}

export function openBestCrate(): void {
  if (boxView.stock.length === 0) return
  openCrate(Math.max(...boxView.stock))
}

/** The crate currently standing at the base, if one is being opened: the beacon's target. */
export function positionCaisse(): Vector3 | null {
  if (!boxView.opening) return null
  const t = Transform.getOrNull(crateMesh)
  if (t === null || t.scale.x <= 0) return null
  return Vector3.create(t.position.x, t.position.y, t.position.z)
}
