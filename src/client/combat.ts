import { plasticDe } from './toy'
import {
  engine, Transform, MeshRenderer, Material, TextShape, Billboard, BillboardMode, Entity, GltfContainer,
  InputAction, inputSystem, PointerEventType, AudioSource, Tween, TweenSequence, TweenLoop,
  EasingFunction, AvatarAttach, AvatarAnchorPointType, PlayerIdentityData, CameraMode,
  CameraType, CameraModeArea, AvatarMask, timers, PointerLock
} from '@dcl/sdk/ecs'
import { triggerSceneEmote, stopEmote } from '~system/RestrictedActions'
import { getPlayer } from '@dcl/sdk/players'
import { isMobile } from '@dcl/sdk/platform'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { DroppedCoins, SHOT_RANGE, SHOT_COOLDOWN_MS, SHOT_CONE_DOT, LOOT_OWNER_LOCK_MS, SLAP_RANGE, SLAP_COOLDOWN_MS, TASER_COOLDOWN_MS, RAID_HIT_RANGE } from '../shared/schemas'
import { gearView, tirerLaCape } from './gear'
import { raidView } from './raid'
import { room } from '../shared/messages'
import { formatIncome } from '../shared/loot-table'
import { alerter } from './theft'
import { setAiming, setArmeIcone } from './locomotion'

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
 * The avatar's skeleton is only reachable through emotes, and the platform's fixed list
 * holds neither an aim nor a shot. So the scene ships its own two clips, solved against
 * the Decentraland reference rig: the arm raises into a two-handed aim and kicks on the
 * shot. The weapon is holstered until the player aims, which keeps a pistol out of every
 * screenshot of what is, most of the time, a game about running a base.
 */

export const combatView = {
  /** A nudge for a first-timer: on for the first seconds of the first two draws of a session. */
  aideVisee: false,
  aiming: false,
  /** Name of the player the shot would reach right now, empty when the cone is clear. */
  targetName: '',
  targetDist: 0,
  /** 0 when ready, 1 right after a shot. */
  cooldown: 0,
  firstPerson: false
}

type ArmeType = 'shoot' | 'slap' | 'taser'
type Gun = { racine: Entity; poignee: Entity; parts: Entity[]; type: ArmeType }
const ARME_INT: Record<ArmeType, number> = { shoot: 0, slap: 1, taser: 2 }
const INT_ARME: ArmeType[] = ['shoot', 'slap', 'taser']

const OR = Color4.fromHexString('#ffd166ff')
const FLASH = Color4.fromHexString('#ffe9a8ff')

const MODELE = 'assets/Models/gun.glb'
/**
 * The two avatar clips, built against the Decentraland reference rig.
 *
 * AIM is a single held pose, looped, so the arms stay up for as long as the player holds
 * the control. FIRE is a one-shot muzzle rise off that same pose, so the two read as one
 * motion. Both are masked to the upper body: the legs stay on locomotion and the player
 * keeps running while aiming and while firing.
 */
const CLIP_VISEE = 'assets/animations/aim_emote.glb'
const CLIP_TIR = 'assets/animations/fire_emote.glb'
/** The kick on a loop whose cycle is the shot cooldown: one emote per burst, not one per round. */
const CLIP_RAFALE = 'assets/animations/burst_emote.glb'
/** A burst ends this long after its last round; the arm goes back to the held aim then. */
const RAFALE_FIN_MS = 420
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
 * Where the grip sits on the hand bone.
 *
 * Not guessed: the aim pose was solved first, then the right hand's world orientation was
 * read out of it, and this rotation is its inverse. That makes the barrel point along the
 * character's forward axis exactly when the arm is extended, which is the only pose the
 * weapon is ever visible in. The hand bone runs along its own +Y, toward the fingers, so
 * the grip sits a few centimetres up that axis.
 */
const MAIN_POS = Vector3.create(0.045, 0.015, 0)
const MAIN_ROT = Quaternion.fromEulerDegrees(-90, 0, 180)
/** Where the view model sits relative to the camera: right, below, ahead. */
const VUE_POS = Vector3.create(0.13, -0.20, 0.52)
const VUE_ROT = Quaternion.fromEulerDegrees(0, 0, 0)
/** The same, pulled to centre and closer when aiming down the barrel. */
const VISEE_POS = Vector3.create(0.05, -0.16, 0.58)
/** Beyond this many other players, distant ones go unarmed: one renderer per mesh adds up. */
const ARMES_MAX = 10
/** Muzzle rise on the shot, in degrees, decayed back to rest. */
const RECUL_DEG = 20
/** Length of the shot clip, in milliseconds. Matches tools/emotes/build-emotes.js. */
/** Shortest gap between two arm animations, whatever the weapon's own rate. */

/**
 * Whether the avatar is posed at all.
 *
 * Both clips are masked to the upper body so the legs stay on locomotion, and the mobile
 * client lists upper-body masks among the features it does not support. Unmasked, the clip
 * takes the whole body and any step cancels it, so a held aim would flicker on and off with
 * every movement. The pose is therefore skipped there rather than played badly: the weapon
 * still appears in the hand, the reticle still locks, and the weapon still kicks, because
 * none of those go through an emote.
 */
function poseDisponible(): boolean { return !isMobile() }
/**
 * The first-person volume that rides the player while the weapon is out. A camera area is
 * a region and not a per-player flag, so it stays barely wider than one body: anyone
 * standing closer than sixty centimetres would be pulled into it as well.
 */
const ZONE_VISEE = Vector3.create(1.2, 2.6, 1.2)
/** How long the explorer takes to slide from one camera mode to the other. */
const TRANSITION_MS = 350

const armes = new Map<string, Gun>()
let vue: Gun | null = null
let flash = 0 as unknown as Entity
let moi = ''
let dernierTir = 0
let flashScale = 0
let zoneVisee: Entity | null = null
let vueVisibleApres = 0
let dernierClipTir = 0
let degainages = 0
let armeAffichee: ArmeType = 'shoot'
let enRafale = false
let rafaleJusqua = 0
/** Whether first person was the player's own setting when the weapon came out. */
let prefereVuePremiere = false
let dernierRecensement = 0
let nomCible = ''
let adresseCible = ''
let recul = 0
/** Addresses whose weapon is drawn right now, as relayed by the server. */
const enJoue = new Set<string>()
const armeDe = new Map<string, ArmeType>()

const piles = new Map<number, { chute: Entity; body: Entity; label: Entity }>()

/**
 * A holder whose origin is the grip, and the model hung off it by its measured pivot.
 * The weapon carries no collider at all: it rides a moving avatar, and a collider there
 * would push the third-person camera around and swallow pointer clicks.
 */
/*
  Three held models from primitives, plus the gun's own GLB. Small parts hung on the grip:
  the gun stays the authored model; a slap is a flat paddle on a handle; a taser is a rod with
  two prongs and a lit tip. The player sees which weapon they hold, which is the whole point
  of a gear that "replaces the gun" (tester, 28 Aug: "I still see a gun").
*/
function pieceArme(poignee: Entity, pos: Vector3, scale: Vector3, hex: string, glow = 0, cyl = false): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent: poignee, position: pos, scale })
  if (cyl) MeshRenderer.setCylinder(e, 0.5, 0.5); else MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, plasticDe(Color4.fromHexString(hex + 'ff'), glow))
  return e
}
function modeleArme(poignee: Entity, type: ArmeType): Entity[] {
  const V = Vector3.create
  if (type === 'slap') {
    return [
      pieceArme(poignee, V(0, -0.10, 0), V(0.04, 0.24, 0.04), '#7a4a2a'),                 // handle
      pieceArme(poignee, V(0, 0.10, 0), V(0.26, 0.20, 0.03), '#f2e9d8'),                  // paddle
      pieceArme(poignee, V(0, 0.10, 0), V(0.30, 0.04, 0.035), '#e63946')                 // red rim
    ]
  }
  if (type === 'taser') {
    return [
      pieceArme(poignee, V(0, -0.10, 0), V(0.04, 0.24, 0.04), '#2b2d42'),                 // handle
      pieceArme(poignee, V(0, 0.06, 0), V(0.05, 0.12, 0.05), '#4dabf7'),                  // body
      pieceArme(poignee, V(-0.03, 0.20, 0), V(0.015, 0.10, 0.015), '#c9d6ff'),            // prong L
      pieceArme(poignee, V(0.03, 0.20, 0), V(0.015, 0.10, 0.015), '#c9d6ff'),             // prong R
      pieceArme(poignee, V(0, 0.27, 0), V(0.05, 0.05, 0.05), '#7cf0ff', 3, true)          // lit tip
    ]
  }
  const modele = engine.addEntity()
  Transform.create(modele, { parent: poignee, position: PIVOT })
  GltfContainer.create(modele, { src: MODELE, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  return [modele]
}
function construireArme(parent: Entity, pos: Vector3, rot: Quaternion, type: ArmeType = 'shoot'): Gun {
  const poignee = engine.addEntity()
  Transform.create(poignee, { parent, position: pos, rotation: rot })
  return { racine: parent, poignee, parts: modeleArme(poignee, type), type }
}
/** Swap the held model to another weapon, keeping the grip and the flash in place. */
function equiperArme(g: Gun | null, type: ArmeType): void {
  if (g === null || g.type === type) return
  for (const e of g.parts) engine.removeEntity(e)
  g.parts = modeleArme(g.poignee, type)
  g.type = type
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
  // The camera slides between the two modes while CameraMode flips at once, so a view
  // model shown on the flip is briefly drawn at third-person distance and fills the
  // screen. It waits for the move to finish.
  montrer(vue, combatView.aiming && combatView.firstPerson && Date.now() >= vueVisibleApres)

  const porteur = combatView.firstPerson ? vue : (armes.get(moi) ?? null)
  if (porteur !== null) {
    const t = Transform.getOrNull(flash)
    if (t !== null && t.parent !== porteur.poignee) {
      const ft = Transform.getMutableOrNull(flash)
      if (ft !== null) ft.parent = porteur.poignee
    }
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
  Material.setPbrMaterial(flash, plasticDe(FLASH, 5))

  AudioSource.create(ancre, { audioClipUrl: 'assets/sounds/hit.wav', playing: false, loop: false, volume: 0.5 })

  CameraMode.onChange(engine.CameraEntity, (c) => {
    if (c === undefined) return
    appliquerVue(c.mode === CameraType.CT_FIRST_PERSON)
  })

  /*
    Both messages now say what to do about it.

    "840 dropped" is a fact about a number, and it left a player who had just landed a shot
    with no idea that coins were lying on the ground several metres away, waiting to be
    walked over. The shot is only half the move; the run is the other half, and the run is
    where the other player gets to stop you.
  */
  room.onMessage('shotResult', (d) => {
    // The boss flashes when hit; a line per round at five rounds a second would be noise.
    if (d.reason === 'boss') return
    // One shot, one line. What it did to their hands leads, because that is the bigger prize.
    const qui = d.hitName.toUpperCase()
    if (d.loot === 3) {
      alerter(`${qui} LOST THEIR GRIP, THE THEFT IS OFF`, '#8fe08f', 3200)
    } else if (d.loot === 2) {
      alerter(`${qui} DROPPED IT, GRAB IT OFF THE GROUND`, '#ff6b6b', 3500)
    } else if (d.loot === 1) {
      alerter(`${qui} ALMOST LOST IT, KEEP FIRING`, '#ffd166', 2600)
    } else if (d.reason === 'hit') {
      alerter(`HIT ${qui}  ·  ${formatIncome(d.dropped)} ON THE GROUND, GO TAKE IT`, '#ffd166', 3500)
    } else if (d.reason === 'nothing to drop') {
      alerter(`${qui} HAS NOTHING TO DROP`, '#9aa3ad', 2200)
    }
  })
  room.onMessage('wasShot', (d) => {
    const s = Math.round(LOOT_OWNER_LOCK_MS / 1000)
    alerter(`${d.byName.toUpperCase()} SHOT YOU  ·  ${formatIncome(d.lost)} DROPPED, YOURS AGAIN IN ${s}s`, '#ff6b6b', 5000)
  })
  room.onMessage('pickedUp', (d) => alerter(`+${formatIncome(d.amount)} picked up`, '#8fe08f', 2500))
  room.onMessage('aiming', (d) => {
    const a = d.addr.toLowerCase()
    if (d.on) enJoue.add(a); else enJoue.delete(a)
    const t = INT_ARME[d.arme] ?? 'shoot'
    armeDe.set(a, t)
    if (a !== moi) equiperArme(armes.get(a) ?? null, t)
  })

  engine.addSystem(gunSystem)
  engine.addSystem(pileSystem)
}

function appliquerVue(fp: boolean): void {
  if (fp && !combatView.firstPerson) vueVisibleApres = Date.now() + TRANSITION_MS
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
    const g = construireArme(racine, MAIN_POS, MAIN_ROT, armeDe.get(a) ?? 'shoot')
    armes.set(a, g)
    montrer(g, false)
  }
  for (const [a, g] of [...armes]) {
    /*
      My own weapon is never taken down by the roster. `PlayerIdentityData` blinks for a tick
      now and then (invariant on presence, server side), and a blink here removed my weapon
      WITH its children, the muzzle flash among them: every later shot then wrote to a
      deleted Transform and the fire path died mid-raid (tester, 28 Aug: "the gun stayed in
      the air and I could not aim any more").
    */
    if (vus.has(a) || a === moi) continue
    engine.removeEntityWithChildren(g.racine)
    armes.delete(a)
  }
  rafraichirVisibilite()
}

/** The muzzle flash, written through one door that tolerates a missing entity. */
function poserFlash(scale: number): void {
  const t = Transform.getMutableOrNull(flash)
  if (t !== null) t.scale = Vector3.create(scale, scale, scale)
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
  // Keep the held model in step with the chosen weapon, and tell the room when it changes.
  const arme = armeEnMain()
  if (arme !== armeAffichee) {
    armeAffichee = arme
    equiperArme(vue, arme)
    equiperArme(armes.get(moi) ?? null, arme)
    void room.send('aim', { on: combatView.aiming, arme: ARME_INT[arme] })
  }
  // The burst is over: the arm returns to the held aim, once.
  if (enRafale && now > rafaleJusqua) {
    enRafale = false
    if (combatView.aiming && poseDisponible()) void triggerSceneEmote({ src: CLIP_VISEE, loop: true, mask: AvatarMask.AM_UPPER_BODY })
  }

  // One control, and it toggles rather than being held.
  //
  // Holding costs a thumb, and on a phone the other one is already on the joystick, which
  // leaves nothing to look around with. Drawing is a state instead, and while the weapon
  // is out the shot leaves on its own as soon as the reticle locks someone. That is the
  // fire mode Fortnite recommends to players new to mobile, and a judge here has five
  // minutes: a second button for the trigger would buy nothing and cost a thumb.
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    // With a cloak in the pocket and nothing drawn, F pulls the cloak on instead of the gun.
    // Drawing while cloaked is still allowed and still F: the cloak simply does not stop it.
    if (!combatView.aiming && tirerLaCape()) return
    degainer(!combatView.aiming)
  }

  // A tap anywhere fires, and nothing fires on its own.
  //
  // Of the three fire modes Fortnite ships on mobile, the automatic one is the one it
  // recommends to newcomers, and it is the wrong one here. That advice assumes everything
  // on screen is an enemy. This venue is a gathering place built around one belt, so a
  // drawn weapon on automatic would shoot every neutral who crossed the cone, and a shot
  // costs the target real coins. Drawing already carries the intent; the tap carries the
  // shot. The reticle naming its target is the assist, rather than firing for the player.
  /*
    Two ways to fire, and the big one is the point.

    The trigger was the client's interaction button alone, which is the small one off to the
    side and wears a pointing hand: correct for picking things up, silent about being a
    trigger, and the reason the first question asked of this game was how to shoot. E is the
    central button, the largest and the one a thumb finds without looking, and while the
    weapon is out it has nothing else to do. So it fires, and it wears a reticle for as long
    as it does. The interaction button keeps working for anyone who already found it.
  */
  /*
    Hold to fire, not tap-per-shot. A tap is the down edge; holding the button keeps it
    pressed, and `tirer` has the cadence, so holding E sprays at the weapon's rate (the gun
    5.5/s, the taser slower by design). The tester wanted fast fire and got one shot a second
    because a tap is one edge and the taser's cadence is 900 ms (28 Aug). `isPressed` is the
    documented "is the button down right now" (advanced-input).
  */
  const gachette = inputSystem.isPressed(InputAction.IA_POINTER)
    || inputSystem.isPressed(InputAction.IA_PRIMARY)
    || inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)
    || inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  if (combatView.aiming && gachette && tirer(now)) {
    // The arm keeps its own, slower beat.
    //
    // The weapon can leave five and a half rounds a second and the clip lasts three
    // hundred milliseconds, so animating every one of them would restart the emote before
    // it played and turn a burst into a twitch, at one restricted call per round. The
    // muzzle flash and the weapon's own kick carry the cadence; the arm plays about three
    // times a second and that is enough to read as recoil.
    /*
      One looping clip per burst, not one clip per round. The loop's cycle is the shot cooldown,
      so fire at full cadence reads as fire; the avatar takes two emote calls per burst (in,
      then back to the held aim) instead of one per round, which is what froze the arm over a
      sixty-round raid (28 Aug). `CLIP_TIR` stays for a single shot's feel: the burst loop is
      only started on the second round within the window.
    */
    if (poseDisponible()) {
      if (!enRafale) {
        enRafale = true
        dernierClipTir = now
        void triggerSceneEmote({ src: CLIP_RAFALE, loop: true, mask: AvatarMask.AM_UPPER_BODY })
      }
      rafaleJusqua = now + RAFALE_FIN_MS
    }
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
    poserFlash(flashScale)
  }

  // Recoil. The avatar's arm cannot move, so the weapon does: it rises on the shot and
  // settles back. Applied to whichever of the two models is the one on screen.
  if (recul > 0) {
    recul = Math.max(0, recul - dt * 9)
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
 * Weapon out or weapon away. Everything that depends on the state is set from here.
 *
 * Drawing forces first person, and that is not a matter of taste: the shot, the reticle
 * and the aiming pose all have to mean one direction. In third person the body keeps the
 * heading it last walked on while the camera looks elsewhere, measured ninety degrees
 * apart on a live client, so the character would aim at nothing while the round went
 * somewhere else. Turning the body back with movePlayerTo was the alternative, and that
 * call is documented as interruptible by player input, so it cannot be issued every frame
 * and always leaves drift. First person has the body track the camera exactly and for
 * nothing: measured identical to the hundredth of a degree, before and after a 192 degree
 * turn. Holstering drops the area and the explorer restores the camera the player chose.
 */
function degainer(on: boolean): void {
  if (combatView.aiming === on) return
  combatView.aiming = on
  setAiming(on)
  setArmeIcone(on)
  if (on) enJoue.add(moi)
  else enJoue.delete(moi)
  void room.send('aim', { on, arme: ARME_INT[armeEnMain()] })
  if (on) {
    degainages += 1
    combatView.aideVisee = degainages <= 2
    if (combatView.aideVisee) timers.setTimeout(() => { combatView.aideVisee = false }, 6000)
    const c = CameraMode.getOrNull(engine.CameraEntity)
    prefereVuePremiere = c !== null && c.mode === CameraType.CT_FIRST_PERSON
    void triggerSceneEmote({ src: CLIP_VISEE, loop: true, mask: AvatarMask.AM_UPPER_BODY })
    // Parented, not chased. Written to the player's position every frame it trailed by a
    // frame, so a running player reached the leading edge of a box this tight, dropped out
    // of the region, and the camera flipped back and forth. As a child it cannot lag.
    zoneVisee = engine.addEntity()
    Transform.create(zoneVisee, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0), scale: ZONE_VISEE })
    CameraModeArea.create(zoneVisee, { area: ZONE_VISEE, mode: CameraType.CT_FIRST_PERSON })
  } else {
    enRafale = false
    if (poseDisponible()) void stopEmote({})
    if (zoneVisee !== null) { engine.removeEntity(zoneVisee); zoneVisee = null }
    // The cursor is NOT given back here any more. This used to release the capture on the
    // way out of first person, and since 27 Aug the desktop policy is the opposite: captured
    // while the HUD is on screen (setup.ts owns it). Releasing here undid that policy every
    // time the weapon was holstered (tester: "aim and back, the camera follow is gone").
  }
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
    if (d > porteeArme() || d < 0.5) continue
    if ((dx * ax + dz * az) / d < SHOT_CONE_DOT) continue
    if (best === null || d < best.d) best = { addr: a, d }
  }
  // The raid boss is a target like any other, and the nearer one wins the reticle.
  if (raidView.active) {
    const dx = raidView.x - moiT.position.x
    const dz = raidView.z - moiT.position.z
    const d = Math.sqrt(dx * dx + dz * dz)
    // The boss locks out to the raid range whatever the weapon: a taser (2.5 m) still aims at it.
    if (d <= RAID_HIT_RANGE && d >= 0.5 && (dx * ax + dz * az) / d >= SHOT_CONE_DOT && (best === null || d < best.d)) {
      adresseCible = 'raid-boss'
      nomCible = 'RAID BOSS'
      combatView.targetName = nomCible
      combatView.targetDist = d
      return
    }
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
/** Reach and rhythm of whatever is in hand, read in one place so reticle and shot agree. */
/** True when the player actually owns that weapon; the gun is always owned. */
function possedeArme(a: ArmeType): boolean {
  return a === 'shoot' || (a === 'slap' && gearView.held[2] > 0) || (a === 'taser' && gearView.held[5] > 0)
}
/*
  The player's WIELD choice wins as long as they own it; otherwise fall back to the best owned.
  Without this the choice was ignored and buying a slap silently overrode the gun for good
  (tester, 28 Aug: "HOLD GUN and I still hold the slap").
*/
function armeEnMain(): ArmeType {
  if (possedeArme(gearView.armeChoisie)) return gearView.armeChoisie
  return gearView.held[5] > 0 ? 'taser' : gearView.held[2] > 0 ? 'slap' : 'shoot'
}
function porteeArme(): number { return armeEnMain() === 'shoot' ? SHOT_RANGE : SLAP_RANGE }
function cadenceArme(): number {
  const arme = armeEnMain()
  return arme === 'taser' ? TASER_COOLDOWN_MS : arme === 'slap' ? SLAP_COOLDOWN_MS : SHOT_COOLDOWN_MS
}

function tirer(now: number): boolean {
  if (dernierTir + cadenceArme() > now) return false
  const cam = Transform.getOrNull(engine.CameraEntity)
  const moiT = Transform.getOrNull(engine.PlayerEntity)
  if (cam === null || moiT === null) return false
  dernierTir = now

  const f = Vector3.rotate(Vector3.create(0, 0, 1), cam.rotation)
  const plat = Math.sqrt(f.x * f.x + f.z * f.z)
  if (plat < 0.0001) return false
  /*
    The weapon in hand decides which message leaves. A slap is the gun with an arm's reach and
    full force at every hit; the server checks the pocket before honouring it, so the client
    asking is only ever a preference.
  */
  const portee = porteeArme()
  void room.send(armeEnMain(), {
    x: moiT.position.x + (f.x / plat) * portee,
    y: moiT.position.y,
    z: moiT.position.z + (f.z / plat) * portee
  })

  // A gun flashes and cracks; a melee weapon swings. No bullets out of a paddle (tester, 28 Aug).
  const gun = armeEnMain() === 'shoot'
  flashScale = gun ? 0.5 : 0
  poserFlash(flashScale)
  recul = 1
  if (vue !== null) {
    const s = AudioSource.getMutableOrNull(vue.racine)
    if (s !== null) { s.playing = false; s.playing = true }
  }
  return true
}

/** Dropped piles: the server owns them, the client only draws what it publishes. */
function pileSystem(): void {
  const alive = new Set<number>()
  for (const [ent, c] of engine.getEntitiesWith(DroppedCoins, Transform)) {
    const id = ent as unknown as number
    alive.add(id)
    const t = Transform.get(ent)
    if (piles.has(id)) continue
    /*
      Two entities per coin, because one of them can only be doing one thing.

      An entity carries at most one Tween, and this one has to both fall and spin. So the
      outer one falls, once, with a bounce at the end, and the coin itself hangs from it and
      turns for ever. Parenting composes the two transforms, which is the cheapest way to get
      a second animation out of an engine that allows one.
    */
    const chute = engine.addEntity()
    const sol = Vector3.create(t.position.x, t.position.y, t.position.z)
    const haut = Vector3.create(t.position.x, t.position.y + 1.2, t.position.z)
    Transform.create(chute, { position: haut })
    Tween.setMove(chute, haut, sol, 520, EasingFunction.EF_EASEOUTBOUNCE)

    const body = engine.addEntity()
    Transform.create(body, { parent: chute, position: Vector3.create(0, 0, 0), scale: Vector3.create(0.34, 0.12, 0.34) })
    MeshRenderer.setCylinder(body, 0.34, 0.34)
    Material.setPbrMaterial(body, plasticDe(OR, 1.6))
    Tween.setRotate(body, Quaternion.Identity(), Quaternion.fromEulerDegrees(0, 180, 0), 1600, EasingFunction.EF_LINEAR)
    TweenSequence.createOrReplace(body, { sequence: [], loop: TweenLoop.TL_RESTART })
    // Hung from the same faller, so the number arrives with the coin instead of waiting for it.
    const label = engine.addEntity()
    Transform.create(label, { parent: chute, position: Vector3.create(0, 0.7, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
    Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
    TextShape.create(label, { text: formatIncome(c.amount), fontSize: 3, textColor: OR })
    piles.set(id, { chute, body, label })
  }
  for (const [id, v] of [...piles]) {
    if (alive.has(id)) continue
    engine.removeEntity(v.body); engine.removeEntity(v.chute); engine.removeEntity(v.label)
    piles.delete(id)
  }
}
