import {
  engine, Transform, MeshRenderer, Material, TextShape, Billboard, Entity, GltfContainer,
  InputAction, inputSystem, PointerEventType, AudioSource, Tween, TweenSequence, TweenLoop,
  EasingFunction, AvatarAttach, AvatarAnchorPointType, PlayerIdentityData, CameraMode,
  CameraType
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
 *
 * The avatar's own skeleton is NOT addressable from scene code. The only handle on it is
 * triggerEmote, whose fixed list holds no aiming and no firing animation, and no custom
 * animation ships with this scene. So the arm never moves: what moves is the weapon.
 * It is holstered until the player aims, appears in the hand while they do, and kicks on
 * the shot. That is an honest visual state, not a pose the avatar is pretending to hold.
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

type Gun = { racine: Entity; poignee: Entity }

const OR = Color4.fromHexString('#ffd166ff')
const FLASH = Color4.fromHexString('#ffe9a8ff')

const MODELE = 'assets/Models/gun.glb'
/**
 * The model's own pivot is 87 cm away from the weapon: measured, its bounds run
 * y 0.563..0.778 and z 0.390..0.700, muzzle at +Z, wooden grip at low Y and low Z.
 * This offset brings the grip onto the holder's origin, so every placement below is
 * expressed as "where the hand is", not as an arbitrary correction.
 */
const PIVOT = Vector3.create(-0.010, -0.640, -0.450)
/** Muzzle, relative to the grip, from the same measurement. */
const BOUCHE = Vector3.create(0, 0.138, 0.250)

/**
 * Where the grip sits on the hand bone. The local axes of the avatar's right hand are not
 * documented, so these two are the tuning knobs: everything else is measured.
 */
const MAIN_POS = Vector3.create(0.02, -0.02, 0.03)
const MAIN_ROT = Quaternion.fromEulerDegrees(0, 90, 10)
/** Where the view model sits relative to the camera: right, below, ahead. */
const VUE_POS = Vector3.create(0.20, -0.24, 0.34)
const VUE_ROT = Quaternion.fromEulerDegrees(0, 0, 0)
/** The same, pulled to centre and closer when aiming down the barrel. */
const VISEE_POS = Vector3.create(0.02, -0.14, 0.26)
/** Beyond this many other players, distant ones go unarmed: one renderer per mesh adds up. */
const ARMES_MAX = 10
/** Muzzle rise on the shot, in degrees, decayed back to rest. */
const RECUL_DEG = 20

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
let recul = 0
/** Addresses whose weapon is drawn right now, as relayed by the server. */
const enJoue = new Set<string>()

const piles = new Map<number, { body: Entity; label: Entity }>()

/**
 * A holder whose origin is the grip, and the model hung off it by its measured pivot.
 * The weapon carries no collider at all: it rides a moving avatar, and a collider there
 * would push the third-person camera around and swallow pointer clicks.
 */
function construireArme(parent: Entity, pos: Vector3, rot: Quaternion): Gun {
  const poignee = engine.addEntity()
  Transform.create(poignee, { parent, position: pos, rotation: rot })

  const modele = engine.addEntity()
  Transform.create(modele, { parent: poignee, position: PIVOT })
  GltfContainer.create(modele, {
    src: MODELE, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0
  })

  return { racine: parent, poignee }
}

/** Reads before it writes, so calling it every frame costs nothing when nothing changed. */
function montrer(g: Gun | null, on: boolean): void {
  if (g === null) return
  const t = Transform.getOrNull(g.poignee)
  if (t === null) return
  const v = on ? 1 : 0
  if (t.scale.x === v) return
  Transform.getMutable(g.poignee).scale = Vector3.create(v, v, v)
}

/**
 * Who has a weapon out, and which of the two local models carries it.
 *
 * One rule for everyone: the weapon is drawn only while its owner is aiming. Their aim
 * state comes from the server relay, so a bystander sees exactly what the shooter sees.
 * The local player is the one special case, because first person and third person need
 * two different models and only one of them may be on screen at a time.
 */
function rafraichirVisibilite(): void {
  for (const [a, g] of armes) {
    const arme = enJoue.has(a)
    montrer(g, a === moi ? arme && !combatView.firstPerson : arme)
  }
  montrer(vue, combatView.aiming && combatView.firstPerson)

  const porteur = combatView.firstPerson ? vue : (armes.get(moi) ?? null)
  if (porteur !== null) {
    const t = Transform.getOrNull(flash)
    if (t !== null && t.parent !== porteur.poignee) Transform.getMutable(flash).parent = porteur.poignee
  }
}

export function setupCombat(): void {
  // View model: one entity parented to the camera, shown only in first person.
  const ancre = engine.addEntity()
  Transform.create(ancre, { parent: engine.CameraEntity, position: VUE_POS, rotation: VUE_ROT })
  vue = construireArme(ancre, Vector3.Zero(), Quaternion.Identity())
  montrer(vue, false)

  flash = engine.addEntity()
  Transform.create(flash, { parent: vue.poignee, position: BOUCHE, scale: Vector3.Zero() })
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
  room.onMessage('aiming', (d) => {
    const a = d.addr.toLowerCase()
    if (d.on) enJoue.add(a); else enJoue.delete(a)
  })

  engine.addSystem(gunSystem)
  engine.addSystem(pileSystem)
}

function appliquerVue(fp: boolean): void {
  combatView.firstPerson = fp
  rafraichirVisibilite()
}

/**
 * Every player nearby carries the weapon on their hand, including this one.
 *
 * The model renders as seven objects, and the engine instantiates a material per rendered
 * object, so an unbounded roster spends the scene's material budget on pistols nobody can
 * make out. The nearest ARMES_MAX are armed; past that the weapon is a dot anyway.
 */
function reconcilierArmes(): void {
  const moiT = Transform.getOrNull(engine.PlayerEntity)
  const candidats: { a: string; d: number }[] = []
  for (const [ent, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    const a = id.address?.toLowerCase()
    if (a === undefined || a === '') continue
    if (a === moi) { candidats.push({ a, d: -1 }); continue }
    const t = Transform.getOrNull(ent)
    candidats.push({ a, d: t === null || moiT === null ? 1e9 : Vector3.distance(t.position, moiT.position) })
  }
  candidats.sort((x, y) => x.d - y.d)

  const vus = new Set<string>()
  for (const { a } of candidats.slice(0, ARMES_MAX)) {
    vus.add(a)
    if (armes.has(a)) continue
    const racine = engine.addEntity()
    Transform.create(racine, {})
    AvatarAttach.create(racine, { avatarId: a, anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND })
    const g = construireArme(racine, MAIN_POS, MAIN_ROT)
    armes.set(a, g)
    montrer(g, false)
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
    enJoue.add(moi)
    void room.send('aim', { on: true })
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
    enJoue.delete(moi)
    void room.send('aim', { on: false })
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

  // Recoil. The avatar's arm cannot move, so the weapon does: it rises on the shot and
  // settles back. Applied to whichever of the two models is the one on screen.
  if (recul > 0) {
    recul = Math.max(0, recul - dt * 4)
    const porteur = combatView.firstPerson ? vue : (armes.get(moi) ?? null)
    if (porteur !== null) {
      const base = combatView.firstPerson ? Quaternion.Identity() : MAIN_ROT
      Transform.getMutable(porteur.poignee).rotation =
        Quaternion.multiply(base, Quaternion.fromEulerDegrees(-recul * RECUL_DEG, 0, 0))
    }
  }

  rafraichirVisibilite()
  viser()
}

/**
 * What the shot would reach, computed the way the server computes it.
 *
 * Only while aiming: a reticle that is always on screen is decoration in a game whose
 * usual act is managing a base, and scanning the roster every frame to feed it is waste.
 */
function viser(): void {
  combatView.targetName = ''
  combatView.targetDist = 0
  if (!combatView.aiming) { adresseCible = ''; return }
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
  recul = 1
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
