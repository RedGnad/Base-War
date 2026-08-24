import {
  engine, Transform, MeshRenderer, Material, TextShape, Billboard, Entity,
  InputAction, inputSystem, PointerEventType, AudioSource, Tween, TweenSequence, TweenLoop,
  EasingFunction, AvatarAttach, AvatarAnchorPointType, PlayerIdentityData, CameraMode, CameraType
} from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { DroppedCoins, SHOT_RANGE, SHOT_COOLDOWN_MS, SHOT_CONE_DOT } from '../shared/schemas'
import { room } from '../shared/messages'
import { formatIncome } from '../shared/loot-table'
import { alerter } from './theft'
import { setAiming } from './locomotion'

/**
 * The pistol, client side.
 *
 * Two models, never both at once. The player picks first or third person in their own
 * client, so a weapon can only be right in one of the two places:
 *
 *   third person -> AvatarAttach on the right hand. The character holds it, and so does
 *                   every other player, since the same attachment is built for each
 *                   address in the scene.
 *   first person -> a view model parented to engine.CameraEntity, because from inside the
 *                   avatar there is no visible body to hang anything on.
 *
 * CameraMode on engine.CameraEntity says which one the player is in, and switches them.
 *
 * The hand anchor rides an animated bone, so it drifts with the walk cycle. That is fine
 * here and only here: the model is decoration. The shot itself is a direction, taken from
 * the camera and resolved by the server against positions the server reads itself. The
 * reticle uses the server's own cone constant, so a target it locks is a target that falls.
 */

export const combatView = {
  aiming: false,
  /** Name of the player the shot would reach right now, empty when the cone is clear. */
  targetName: '',
  targetDist: 0,
  /** 0 when ready, 1 right after a shot. */
  cooldown: 0,
  firstPerson: false
}

type Gun = { racine: Entity; poignee: Entity; canon: Entity }

const GRIS = Color4.fromHexString('#2f3542ff')
const ACIER = Color4.fromHexString('#7c8496ff')
const OR = Color4.fromHexString('#ffd166ff')
const FLASH = Color4.fromHexString('#ffe9a8ff')

/** Where the grip sits relative to the hand bone. Tuned by eye against the avatar. */
const MAIN_POS = Vector3.create(0.02, -0.03, 0.04)
const MAIN_ROT = Quaternion.fromEulerDegrees(0, 90, 10)
/** Where the view model sits relative to the camera: right, below, ahead. */
const VUE_POS = Vector3.create(0.22, -0.19, 0.42)
const VUE_ROT = Quaternion.fromEulerDegrees(0, 0, 0)
/** The same, pulled to centre and closer when aiming down the barrel. */
const VISEE_POS = Vector3.create(0.04, -0.11, 0.30)

const armes = new Map<string, Gun>()
let vue: Gun | null = null
let flash = 0 as unknown as Entity
let moi = ''
let dernierTir = 0
let arme = false
let flashScale = 0
let dernierRecensement = 0
let nomCible = ''
let adresseCible = ''

const piles = new Map<number, { body: Entity; label: Entity }>()

/** A pistol out of three boxes: slide, barrel, grip. Cheap, and it reads as a weapon. */
function construireArme(parent: Entity, pos: Vector3, rot: Quaternion): Gun {
  const poignee = engine.addEntity()
  Transform.create(poignee, { parent, position: pos, rotation: rot })

  const corps = engine.addEntity()
  Transform.create(corps, { parent: poignee, position: Vector3.create(0, 0, 0.06), scale: Vector3.create(0.045, 0.055, 0.20) })
  MeshRenderer.setBox(corps)
  Material.setPbrMaterial(corps, { albedoColor: GRIS, metallic: 0.85, roughness: 0.35 })

  const canon = engine.addEntity()
  Transform.create(canon, { parent: poignee, position: Vector3.create(0, 0.004, 0.185), scale: Vector3.create(0.026, 0.026, 0.10) })
  MeshRenderer.setBox(canon)
  Material.setPbrMaterial(canon, { albedoColor: ACIER, metallic: 0.95, roughness: 0.2 })

  const crosse = engine.addEntity()
  Transform.create(crosse, {
    parent: poignee, position: Vector3.create(0, -0.075, -0.025),
    rotation: Quaternion.fromEulerDegrees(-12, 0, 0), scale: Vector3.create(0.04, 0.11, 0.055)
  })
  MeshRenderer.setBox(crosse)
  Material.setPbrMaterial(crosse, { albedoColor: GRIS, metallic: 0.4, roughness: 0.7 })

  return { racine: parent, poignee, canon }
}

function montrer(g: Gun | null, on: boolean): void {
  if (g === null) return
  const t = Transform.getMutableOrNull(g.poignee)
  if (t === null) return
  const v = on ? 1 : 0
  if (t.scale.x === v) return
  t.scale = Vector3.create(v, v, v)
}

export function setupCombat(): void {
  // View model: one entity parented to the camera, shown only in first person.
  const ancre = engine.addEntity()
  Transform.create(ancre, { parent: engine.CameraEntity, position: VUE_POS, rotation: VUE_ROT })
  vue = construireArme(ancre, Vector3.Zero(), Quaternion.Identity())
  montrer(vue, false)

  flash = engine.addEntity()
  Transform.create(flash, { parent: vue.poignee, position: Vector3.create(0, 0.004, 0.25), scale: Vector3.Zero() })
  MeshRenderer.setSphere(flash)
  Material.setPbrMaterial(flash, { albedoColor: FLASH, emissiveColor: FLASH, emissiveIntensity: 5 })

  AudioSource.create(ancre, { audioClipUrl: 'assets/sounds/hit.wav', playing: false, loop: false, volume: 0.5 })

  CameraMode.onChange(engine.CameraEntity, (c) => {
    if (c === undefined) return
    appliquerVue(c.mode === CameraType.CT_FIRST_PERSON)
  })

  room.onMessage('shotResult', (d) => {
    if (d.reason === 'hit') alerter(`HIT ${d.hitName.toUpperCase()}  ·  ${formatIncome(d.dropped)} dropped`, '#ffd166', 3000)
    else if (d.reason === 'nothing to drop') alerter(`${d.hitName.toUpperCase()} HAS NOTHING TO DROP`, '#9aa3ad', 2200)
  })
  room.onMessage('wasShot', (d) => {
    alerter(`${d.byName.toUpperCase()} SHOT YOU  ·  ${formatIncome(d.lost)} on the ground`, '#ff6b6b', 5000)
  })
  room.onMessage('pickedUp', (d) => alerter(`+${formatIncome(d.amount)} picked up`, '#8fe08f', 2500))

  engine.addSystem(gunSystem)
  engine.addSystem(pileSystem)
}

/** Which of the two models is on screen. Called on every camera-mode edge, and once at start. */
function appliquerVue(fp: boolean): void {
  combatView.firstPerson = fp
  montrer(vue, fp)
  if (moi !== '') montrer(armes.get(moi) ?? null, !fp)
}

/** Every player in the scene carries the weapon on their hand, including this one. */
function reconcilierArmes(): void {
  const vus = new Set<string>()
  for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    const a = id.address?.toLowerCase()
    if (a === undefined || a === '') continue
    vus.add(a)
    if (armes.has(a)) continue
    const racine = engine.addEntity()
    Transform.create(racine, {})
    AvatarAttach.create(racine, { avatarId: a, anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND })
    const g = construireArme(racine, MAIN_POS, MAIN_ROT)
    armes.set(a, g)
    if (a === moi && combatView.firstPerson) montrer(g, false)
  }
  for (const [a, g] of [...armes]) {
    if (vus.has(a)) continue
    engine.removeEntityWithChildren(g.racine)
    armes.delete(a)
  }
}

/**
 * Aim, fire, and what the reticle is allowed to claim.
 *
 * Press holds the aim, release fires: one control, two readable moments, and it behaves
 * the same under a tap as under a held key because both edges are read as events.
 */
function gunSystem(dt: number): void {
  if (moi === '') {
    const me = getPlayer()
    if (me === null) return
    moi = me.userId.toLowerCase()
    const c = CameraMode.getOrNull(engine.CameraEntity)
    appliquerVue(c !== null && c.mode === CameraType.CT_FIRST_PERSON)
  }
  const now = Date.now()
  // The roster changes when someone joins or leaves, not every frame.
  if (now - dernierRecensement > 500) { dernierRecensement = now; reconcilierArmes() }

  const reste = dernierTir + SHOT_COOLDOWN_MS - now
  combatView.cooldown = reste > 0 ? reste / SHOT_COOLDOWN_MS : 0

  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    arme = true
    combatView.aiming = true
    setAiming(true)
  }
  // Release fires. PET_UP is the normal path; polling isPressed is the backstop, because
  // a release landing while the button is unmounted would otherwise never arrive and
  // would leave the player stuck at aiming speed for good.
  if (arme && (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_UP)
    || !inputSystem.isPressed(InputAction.IA_SECONDARY))) {
    arme = false
    combatView.aiming = false
    setAiming(false)
    tirer(now)
  }

  // The view model pulls to centre while aiming, and stops being written once it is
  // there: asking for a mutable Transform every frame dirties the component every frame.
  if (vue !== null && combatView.firstPerson) {
    const cible = combatView.aiming ? VISEE_POS : VUE_POS
    const t = Transform.getOrNull(vue.racine)
    if (t !== null && Vector3.distance(t.position, cible) > 0.002) {
      Transform.getMutable(vue.racine).position = Vector3.lerp(t.position, cible, Math.min(1, dt * 12))
    }
  }

  if (flashScale > 0) {
    flashScale = Math.max(0, flashScale - dt * 1.8)
    Transform.getMutable(flash).scale = Vector3.create(flashScale, flashScale, flashScale)
  }

  viser()
}

/** What the shot would reach, computed the way the server computes it. */
function viser(): void {
  combatView.targetName = ''
  combatView.targetDist = 0
  const cam = Transform.getOrNull(engine.CameraEntity)
  const moiT = Transform.getOrNull(engine.PlayerEntity)
  if (cam === null || moiT === null) return

  const f = Vector3.rotate(Vector3.create(0, 0, 1), cam.rotation)
  const plat = Math.sqrt(f.x * f.x + f.z * f.z)
  if (plat < 0.0001) return
  const ax = f.x / plat
  const az = f.z / plat

  let best: { addr: string; d: number } | null = null
  for (const [ent, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    const a = id.address?.toLowerCase()
    if (a === undefined || a === '' || a === moi) continue
    const t = Transform.getOrNull(ent)
    if (t === null) continue
    const dx = t.position.x - moiT.position.x
    const dz = t.position.z - moiT.position.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d > SHOT_RANGE || d < 0.5) continue
    if ((dx * ax + dz * az) / d < SHOT_CONE_DOT) continue
    if (best === null || d < best.d) best = { addr: a, d }
  }
  if (best === null) { adresseCible = ''; return }
  // Resolving a display name is a lookup: do it when the target changes, not every frame.
  if (best.addr !== adresseCible) {
    adresseCible = best.addr
    nomCible = getPlayer({ userId: best.addr })?.name ?? 'PLAYER'
  }
  combatView.targetName = nomCible
  combatView.targetDist = best.d
}

/**
 * Fire. The client reports a point, never a victim.
 *
 * The point is taken from the PLAYER position along the CAMERA facing, so the direction
 * the server rebuilds from it is exactly the camera's, whichever camera the player chose.
 * Reading it from the camera position instead would tilt the shot by the third-person
 * offset, and the reticle would stop telling the truth as soon as the player switched view.
 */
function tirer(now: number): void {
  if (dernierTir + SHOT_COOLDOWN_MS > now) return
  const cam = Transform.getOrNull(engine.CameraEntity)
  const moiT = Transform.getOrNull(engine.PlayerEntity)
  if (cam === null || moiT === null) return
  dernierTir = now

  const f = Vector3.rotate(Vector3.create(0, 0, 1), cam.rotation)
  const plat = Math.sqrt(f.x * f.x + f.z * f.z)
  if (plat < 0.0001) return
  void room.send('shoot', {
    x: moiT.position.x + (f.x / plat) * SHOT_RANGE,
    y: moiT.position.y,
    z: moiT.position.z + (f.z / plat) * SHOT_RANGE
  })

  flashScale = 0.5
  Transform.getMutable(flash).scale = Vector3.create(flashScale, flashScale, flashScale)
  if (vue !== null) {
    const s = AudioSource.getMutableOrNull(vue.racine)
    if (s !== null) { s.playing = false; s.playing = true }
  }
}

/** Dropped piles: the server owns them, the client only draws what it publishes. */
function pileSystem(): void {
  const alive = new Set<number>()
  for (const [ent, c] of engine.getEntitiesWith(DroppedCoins, Transform)) {
    const id = ent as unknown as number
    alive.add(id)
    const t = Transform.get(ent)
    if (piles.has(id)) continue
    const body = engine.addEntity()
    Transform.create(body, { position: t.position, scale: Vector3.create(0.34, 0.12, 0.34) })
    MeshRenderer.setCylinder(body, 0.34, 0.34)
    Material.setPbrMaterial(body, { albedoColor: OR, emissiveColor: OR, emissiveIntensity: 1.6, metallic: 0.8 })
    Tween.setRotate(body, Quaternion.Identity(), Quaternion.fromEulerDegrees(0, 180, 0), 1600, EasingFunction.EF_LINEAR)
    TweenSequence.createOrReplace(body, { sequence: [], loop: TweenLoop.TL_RESTART })
    const label = engine.addEntity()
    Transform.create(label, { position: Vector3.create(t.position.x, t.position.y + 0.7, t.position.z), scale: Vector3.create(0.5, 0.5, 0.5) })
    Billboard.create(label, {})
    TextShape.create(label, { text: formatIncome(c.amount), fontSize: 3, textColor: OR })
    piles.set(id, { body, label })
  }
  for (const [id, v] of [...piles]) {
    if (alive.has(id)) continue
    engine.removeEntity(v.body); engine.removeEntity(v.label); piles.delete(id)
  }
}
