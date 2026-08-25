import {
  engine, Transform, MeshRenderer, MeshCollider, Material, PointerEvents, PointerEventType,
  InputAction, inputSystem, Tween, TweenSequence, EasingFunction, Entity, AudioSource, timers
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { room } from '../shared/messages'
import { Plot, SLOTS_PER_FLOOR, OPEN_RANGE } from '../shared/schemas'
import { rarity, crate, RARITIES, mutation, itemName, itemColor } from '../shared/loot-table'
import { alerter } from './theft'
import { envoyerOuAttendre } from './intent'

let monAdresse = ''

const COUPS = 3

export const boxView = {
  stock: [] as number[],
  opening: false,
  coups: 0,
  typeEnCours: 0,
  roule: false,
  index: 0,
  /**
   * The reel, and where it has travelled to.
   *
   * `reel` is a strip of candidate rarities with the real result planted at REEL_WIN, and
   * `progres` is how many cards have passed the centre line so far, as a float. One number
   * drives the whole animation, so the interface only has to read it and draw.
   */
  reel: [] as number[],
  progres: 0,
  resultat: -1,
  resultatMutation: 0,
  resultatJusqua: 0,
  state: 'expose',
  message: ''
}

let crateMesh: Entity
let sonCoup: Entity
let sonBurst: Entity
let sonReveal: Entity
const eclats: Entity[] = []
let prochainPas = 0
let pasCourant = 0
let left = 0

/** Length of the strip, and where the winning card sits in it. */
const REEL_LEN = 34
export const REEL_WIN = 28
/** How long the reel runs, in seconds. Matches the deceleration below. */
const REEL_S = 2.6

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

  crateMesh = engine.addEntity()
  Transform.create(crateMesh, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0, 0, 0) })
  MeshRenderer.setBox(crateMesh)
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
    boxView.roule = true
    boxView.resultat = d.rarity
    boxView.resultatMutation = d.mutation
    boxView.state = d.state
    boxView.reel = Array.from({ length: REEL_LEN }, () => rareteDecor())
    boxView.reel[REEL_WIN] = d.rarity
    boxView.progres = 0
    left = REEL_S
    prochainPas = 0.045
    pasCourant = 0

    const depart = lastPosition
    if (depart !== null && d.state === 'expose') {
      timers.setTimeout(() => sendToBase(depart, d.rarity, d.mutation), 2700)
    }
  })

  engine.addSystem((dt: number) => {
    if (boxView.opening) {
      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, crateMesh)
      ) {
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

        const usure = boxView.coups / COUPS
        Material.setPbrMaterial(crateMesh, {
          albedoColor: Color4.fromHexString(b.color + 'ff'),
          emissiveColor: Color4.fromHexString(b.color + 'ff'),
          emissiveIntensity: 0.4 + usure * 1.6,
          metallic: 0.5,
          roughness: 0.4
        })

        if (boxView.coups >= COUPS) {
          boxView.opening = false
          const t = Transform.getOrNull(crateMesh)
          if (t !== null) exploser(Vector3.create(t.position.x, t.position.y, t.position.z), b.color)
          storeCrate()
          const tier = boxView.typeEnCours
          envoyerOuAttendre(() => { void room.send('openBox', { crateTier: tier }) })
        }
      }
    }

    if (boxView.roule) {
      left -= dt
      // Cubic ease-out: the strip leaves fast and crawls onto the winning card, which is
      // the whole tension of the thing. One float, read straight by the interface.
      const t = Math.min(1, Math.max(0, 1 - left / REEL_S))
      boxView.progres = (1 - Math.pow(1 - t, 3)) * REEL_WIN
      pasCourant += dt
      if (pasCourant >= prochainPas) {
        pasCourant = 0
        boxView.index = (boxView.index + 1) % RARITIES.length
        prochainPas = Math.min(0.34, prochainPas * 1.085)
      }
      if (left <= 0) {
        boxView.roule = false
        boxView.progres = REEL_WIN
        boxView.index = boxView.resultat
        jouer(sonReveal)
        boxView.resultatJusqua = Date.now() + 3200
        console.log(`[CLIENT] crate ouverte -> ${itemName(boxView.resultat, boxView.resultatMutation)}`)
      }
    } else if (boxView.resultat >= 0 && Date.now() > boxView.resultatJusqua) {
      boxView.resultat = -1
      boxView.message = ''
    }
  })
}

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
    Material.setPbrMaterial(e, { albedoColor: c, emissiveColor: c, emissiveIntensity: 1.4 })
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

function sendToBase(from: Vector3, rarityId: number, mut = 0): void {
  const target = myBasePosition()
  if (target === null) return

  const e = engine.addEntity()
  const r = rarity(rarityId)
  Transform.create(e, { position: from, scale: Vector3.create(r.size, r.size, r.size) })
  MeshRenderer.setBox(e)
  const c = Color4.fromHexString(itemColor(rarityId, mut) + 'ff')
  Material.setPbrMaterial(e, { albedoColor: c, emissiveColor: c, emissiveIntensity: 1.2 })

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
  timers.setTimeout(() => engine.removeEntity(e), 1100)
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
    return p.items.length >= SLOTS_PER_FLOOR * p.floors
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
export function openCrate(crateTier: number): void {
  if (boxView.opening || boxView.roule) return
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
    alerter('BASE FULL: SELL AN ITEM OR BUY A FLOOR', '#ff6b6b', 4000)
    return
  }

  const p = Transform.get(engine.PlayerEntity)
  const b = crate(crateTier)

  boxView.opening = true
  boxView.coups = 0
  boxView.typeEnCours = crateTier
  boxView.message = ''

  // Two metres out from the base, on the player's side, so it is always in front of them.
  const dx = p.position.x - base.x
  const dz = p.position.z - base.z
  const d = Math.sqrt(dx * dx + dz * dz)
  const ux = d < 0.01 ? 0 : dx / d
  const uz = d < 0.01 ? 1 : dz / d

  const t = Transform.getMutableOrNull(crateMesh)
  if (t !== null) {
    t.position = Vector3.create(base.x + ux * 2, 1.1, base.z + uz * 2)
    t.scale = Vector3.create(b.size, b.size, b.size)
    t.rotation = Quaternion.fromEulerDegrees(0, 25, 0)
  }
  const c = Color4.fromHexString(b.color + 'ff')
  Material.setPbrMaterial(crateMesh, { albedoColor: c, emissiveColor: c, emissiveIntensity: 0.4, metallic: 0.5, roughness: 0.4 })
}

export function openBestCrate(): void {
  if (boxView.stock.length === 0) return
  openCrate(Math.max(...boxView.stock))
}
