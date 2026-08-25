import {
  PRODUCTION_PER_RARITY, floorCost, MAX_PRESTIGE, lifetimeForPrestige, prestigeMultiplier,
  OFFLINE_RATE_V2, OFFLINE_CAP_PRODUCTION_S
} from './economy'
import { Schemas, engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

export const PlayerTaps = engine.defineComponent('basetycoon::player-taps', {
  playerId: Schemas.String,
  count: Schemas.Int
})

export const ServerBeat = engine.defineComponent('basetycoon::server-beat', {
  at: Schemas.Int64
})

export const Crate = engine.defineComponent('basetycoon::crate', {
  hits: Schemas.Int,
  maxHits: Schemas.Int,
  breakSeq: Schemas.Int
})

export const Plot = engine.defineComponent('basetycoon::plot', {
  floors: Schemas.Int,
  rebirths: Schemas.Int,
  index: Schemas.Int,
  ownerId: Schemas.String,
  ownerName: Schemas.String,
  items: Schemas.Array(Schemas.Int),
  ownerPresent: Schemas.Boolean,
  given: Schemas.Int,
  received: Schemas.Int,
  sentries: Schemas.Int,
  lockedUntil: Schemas.Int64
})

export const Loot = engine.defineComponent('basetycoon::loot', {
  rarity: Schemas.Int,
  ownerId: Schemas.String,
  slot: Schemas.Int
})

export const Belt = engine.defineComponent('basetycoon::belt', {
  articleId: Schemas.Int,
  crateTier: Schemas.Int,
  price: Schemas.Int,
  progres: Schemas.Float,
  buyerName: Schemas.String
})

/**
 * The sentry is the only defence that acts while its owner is offline, which is the
 * normal case here. It has charges rather than a duration: a defence that expires
 * punishes disconnecting, one that depletes punishes being robbed often.
 * Triggering it also re-locks the base, otherwise a thief just waits out the freeze and
 * drains all charges in a minute.
 */
/**
 * STEALING TAKES TIME. Source, stealabrainrot.fandom.com:
 *   `Stealing`  distinguishes "when a Brainrot IS BEING STOLEN" (the alert fires then)
 *               from "if they steal your brainrot SUCCESSFULLY" (later).
 *   `Methods_Of_Stealing` names "the base timer" and prices traps against it:
 *               "when the base timer reaches a MINIMUM of (7 multiplied by the number of
 *               traps) seconds", so freezes STACK, 7 s each.
 *
 * An instant transfer leaves no window for any defence to act and nothing to carry, which
 * is why a sentry could only delay. During the timer the thief is slowed, visibly holding
 * the item, and cancelling is as simple as leaving the base.
 *
 * 6 s base + 2 s per rarity tier: taking a Secret is a 18 s commitment, taking a Common
 * is 6. The rarest item is therefore the most exposed, which is what makes placing it
 * high a real decision.
 */
export const STEAL_BASE_MS = 6000
export const STEAL_PER_RARITY_MS = 2000
/** Leaving this radius mid-theft cancels it. Slightly wider than STEAL_RANGE so a step back is not fatal. */
export const STEAL_HOLD_RANGE = 7
/**
 * GIFT_RANGE is deliberately wider than STEAL_RANGE: the walls sit 5.5 m from the base
 * centre, so a 4 m range forced the giver INSIDE the building. You break in to take, you
 * leave a gift at the door.
 */
export const GIFT_RANGE = 9

/**
 * THE PISTOL.
 *
 * The reference arms everyone: Bat by default, then Slap, Taser, Medusa's Head, Bee
 * Launcher, Heatseeker, Paintball Gun. Hitting a carrier is how an owner gets their loot
 * back, so combat is the defensive half of the game, not an addition to it.
 *
 * Here a hit does not kill: it makes the target DROP coins on the spot, and anyone can
 * pick them up. A carrier is therefore worth shooting, and a rich player crossing the
 * venue is taking a risk. Nothing is destroyed, so a bad player cannot grief a good one
 * into ruin: the coins change hands, they do not vanish.
 */
export const SHOT_RANGE = 28
/**
 * The floor between two shots, not the pace of them.
 *
 * At 900 ms the weapon fired like a revolver and the player was waiting on it instead of
 * on their own hand. 180 ms puts the ceiling at five and a half rounds a second, which no
 * thumb reaches, so what limits the burst is how fast the player taps. The rate still has
 * a floor, because it also caps what a client can ask the server to resolve.
 */
export const SHOT_COOLDOWN_MS = 180
/**
 * Half-angle of the aim cone, as the cosine the server compares against. 0.97 is about 14
 * degrees. The client draws its reticle from this same number, so the crosshair states what
 * the server will rule: a target shown as locked is a target the shot will reach.
 */
export const SHOT_CONE_DOT = 0.97
/** Jog speed while aiming, as a fraction of the normal one. Aiming costs mobility. */
export const AIM_SPEED_SHARE = 0.5
/**
 * Fraction of banked coins dropped per hit, and its absolute cap.
 *
 * Rebalanced against the faster weapon rather than left alone: many small hits read far
 * better than one large one, and a burst has to stay survivable. Sustained at the tap
 * ceiling this strips about 15 percent of a bank per second, against 11 before, so the
 * weapon got more dangerous but not by an order. The cap is per shot, so it had to come
 * down the most: at eight seconds of income a full burst tops out near forty-four seconds
 * of the target's production, under the sixty-six the slow weapon allowed.
 */
export const SHOT_DROP_SHARE = 0.03
export const SHOT_DROP_CAP_S = 8
/** A dropped pile is picked up by walking within this radius, and fades if nobody comes. */
export const LOOT_PICKUP_RANGE = 3
export const LOOT_LIFETIME_MS = 45_000

/**
 * How long the player who was shot cannot pick their own coins back up.
 *
 * The pile lands at the victim's feet, which is right: the shooter has to come and take it,
 * and the walk is the risk that makes shooting worth defending against. But pickup credited
 * whoever stood within three metres, and the victim stands at zero, so in practice they
 * reclaimed their own coins on the very next tick and shooting paid exactly nothing. That is
 * the mechanic our own player could not find: it was working, and it was self-cancelling.
 *
 * Six seconds is the width of the opening: long enough to cross the distance a shot is taken
 * from, short enough that standing on your own money is not a lost cause.
 */
export const LOOT_OWNER_LOCK_MS = 6_000

export const DroppedCoins = engine.defineComponent('basetycoon::dropped', {
  amount: Schemas.Int,
  droppedBy: Schemas.String,
  untilMs: Schemas.Int64
})

/**
 * Defence is sold in charges, never in minutes.
 *
 * The obvious ladder is durations: a minute, ten, an hour, eight hours. It is the wrong axis
 * for this game. Our one distinguishing mechanic is players robbing each other, and a
 * protection that outlasts a session does not produce a defence, it produces an absence of
 * game. During the review window a judge would walk into a venue where every base is sealed
 * and see nothing of what the scene is for. The rule this project already wrote down says
 * theft must stay "slow, loud, DEFENDABLE, reversible": defendable, not preventable.
 *
 * A charge is spent by an actual theft attempt, so it turns an attack into an event both
 * players are told about instead of cancelling it silently. Buying more of them is a real
 * commitment, and the per-charge price falls as the tier rises, which is what makes the
 * ladder a decision rather than a multiplication.
 */
export const SENTRY_TIERS = [
  { name: 'GUARD', charges: 3, secondsPerCharge: 40 },
  { name: 'TURRET', charges: 8, secondsPerCharge: 34 },
  { name: 'BATTERY', charges: 20, secondsPerCharge: 28 }
] as const

/** The ceiling a base can hold, whichever tiers were bought to get there. */
export const SENTRY_MAX_CHARGES = SENTRY_TIERS[SENTRY_TIERS.length - 1].charges
export const SENTRY_MIN_PRICE = 240

/**
 * What an absent player always comes back to.
 *
 * Theft never checked whether the owner was in the scene, so anyone who logged off could be
 * stripped bare with no counterplay at all: nothing to defend with, nothing to react to. The
 * long protections above were the wrong answer to this real problem. The right one is a
 * floor: while you are away, your best few items cannot be taken. Come back and there is
 * still a base, and still a reason to.
 */
export const ABSENT_KEEP = 3
export const SENTRY_FREEZE_MS = 7000
export const SENTRY_LOCK_MS = 60_000

export const CROWD_BONUS_EACH = 0.15
export const CROWD_BONUS_CAP = 0.60

export function crowdBonus(nbPresents: number): number {
  return Math.min(CROWD_BONUS_CAP, Math.max(0, nbPresents - 1) * CROWD_BONUS_EACH)
}

/**
 * A bought crate walks to the buyer's base and stays purchasable by anyone at 150% of
 * what the current holder paid. The trip duration IS the bidding window.
 *
 * duration = max(8s, distance / 2.0 m/s). Players run at 11 m/s, so they always catch
 * up: the contest is about attention and money, never footspeed. The only version that
 * works with a thumb on a phone. The 8s floor stops a base built next to the belt from
 * being uncontestable, which would make "build close" strictly dominant.
 */
export const CONVOY_SPEED = 3.4
export const CONVOY_MIN_S = 8
export const CONVOY_OUTBID = 1.5
export const CONVOY_RANGE = 6
/**
 * A player who has just been outbid cannot be outbid again for 30 s.
 * Without it a rich player can take every crate a beginner buys, forever. The victim is
 * always refunded in full, so the cost is time, not money, and time is what a newcomer
 * has least of. 30 s echoes the reference's own anti-grief pattern: `Methods_Of_Stealing`
 * notes "Sammy adding the 30 seconds anti-steal cooldown".
 */
export const OUTBID_IMMUNITY_MS = 30_000

export const Convoy = engine.defineComponent('basetycoon::convoy', {
  convoyId: Schemas.Int,
  crateTier: Schemas.Int,
  pricePaid: Schemas.Int,
  owner: Schemas.String,
  holderName: Schemas.String,
  progres: Schemas.Float,
  departX: Schemas.Float, departZ: Schemas.Float,
  cibleX: Schemas.Float, cibleZ: Schemas.Float
})

export const BELT_LENGTH = 26
export const BELT_DURATION_S = 34          // time to cross: leaves time to decide
export const BELT_INTERVAL_S = 5      // un article toutes les 5 s
export const BUY_RANGE = 5

export const CHUTE_FIN = 0.22        // part de course consacree a la chute
export const FOSSE_PROFONDEUR = 2.4   // from belt height down to the pit floor

export const BELT_HEIGHT = 2.2

export function beltPosition(progres: number): { x: number; y: number; z: number } {
  const onBelt = Math.min(progres, 1)
  const x = CENTER.x - BELT_LENGTH / 2 + onBelt * BELT_LENGTH
  if (progres <= 1) return { x, y: BELT_HEIGHT + 0.45, z: CENTER.z }
  const t = Math.min((progres - 1) / CHUTE_FIN, 1)
  return { x, y: BELT_HEIGHT + 0.45 - t * t * FOSSE_PROFONDEUR, z: CENTER.z }
}

export const RARITY_PRICE = [40, 150, 600, 2600, 11000]

export const SYNC_ID = {
  serverBeat: 1,
  crate: 2
} as const

export const HIT_RANGE = 4

export const LOCK_ON_ARRIVAL_MS = 30_000   // lock automatique a l'arrivee
export const LOCK_FREE_MS = 60_000   // lock activable, duration SOURCEE au wiki
export const LOCK_COOLDOWN_MS = 150_000
export const LOCK_BONUS_MS = 10_000     // +10 s par prestige de progression
export const PENALTY_MS = 12_000      // thief penalty duration
export const RECOVER_WINDOW_MS = 20_000  // window to recover a stolen item
export const STEAL_RANGE = 4
export const RECOVER_RANGE = 6

export const MAX_BASES_AFFICHEES = 60
/**
 * Ceiling height, set for the camera rather than for the avatar.
 *
 * It was 2.8, which is a real room and a bad game interior. A Decentraland avatar stands
 * about 1.8 m, and in third person the camera floats above and behind the head, so under a
 * 2.8 m slab it spends its time inside the ceiling. Interiors meant to be walked through in
 * third person are built at three and a half to four metres for exactly this reason.
 *
 * Twelve floors at four metres is 48 m, against a platform ceiling of 143.6 m for a scene of
 * this many parcels, so height was never the constraint here.
 */
export const FLOOR_HEIGHT = 4.0
export const SLOTS_PER_FLOOR = 6
/**
 * High enough that the cost curve is what stops you, not this number.
 *
 * Twelve floors is seventy-two slots and thirty-four metres, against a platform ceiling of
 * 143 m for this many parcels, and each one costs four times the last.
 *
 * The number is deliberately out of reach rather than a design statement: simulated second
 * by second, the twelfth floor is hundreds of hours away, and a base lives at three or four
 * for a very long time. The scarcity this design rests on is preserved by the price curve,
 * not by a wall. Raising it costs nothing either, because each base now draws a floor only
 * once it has been bought.
 */
export const MAX_FLOORS = 12

/**
 * The footprint, widened so six display slots and a stairwell are not the same square metre.
 *
 * At eleven metres, minus a three metre stairwell, the walkable floor was eight by eleven and
 * had to hold six pedestals and the player moving between them. Fourteen gives the room the
 * building was always drawn as having.
 */
export const BASE_SIDE = 14.0
export const RAMP_ANGLE = 40
/** Derived, so a taller floor cannot leave the ramp reaching a floor it no longer meets. */
export const RAMP_LENGTH = FLOOR_HEIGHT / Math.sin((RAMP_ANGLE * Math.PI) / 180)
export const WALL_THICKNESS = 0.22
export const WALL_HEIGHT = FLOOR_HEIGHT
export const DOOR_WIDTH = 2.0

export const PRESTIGE_TIERS = Array.from({ length: MAX_PRESTIGE }, (_, i) => {
  const n = i + 1
  return {
    cost: lifetimeForPrestige(n),
    minRarity: Math.min(1 + Math.floor(i / 2), PRODUCTION_PER_RARITY.length - 1),
    multiplier: prestigeMultiplier(n),
    guard: i < 2 ? 1 : 2
  }
}) as ReadonlyArray<{ cost: number; minRarity: number; multiplier: number; guard: number }>
export const REBIRTH_MAX = PRESTIGE_TIERS.length

export function prestigeTier(n: number) { return PRESTIGE_TIERS[Math.min(n, PRESTIGE_TIERS.length - 1)] }
export function coutRebirth(prestige: number): number { return prestigeTier(prestige).cost }

export function incomeMultiplier(n: number): number {
  return n <= 0 ? 1 : PRESTIGE_TIERS[Math.min(n, PRESTIGE_TIERS.length) - 1].multiplier
}

export function floorPrice(targetFloor: number): number {
  return floorCost(targetFloor)
}

export function openFloors(floorsBought = 0): number {
  return Math.min(1 + floorsBought, MAX_FLOORS)
}

export function openSlots(floorsBought = 0): number {
  return openFloors(floorsBought) * SLOTS_PER_FLOOR
}

export const MOVE_COOLDOWN_MS = 180_000

export const OFFLINE_RATE = OFFLINE_RATE_V2        // 35 % du income normal
export const OFFLINE_CAP_MS = 4 * 3600_000
export { OFFLINE_CAP_PRODUCTION_S }

export const PENDING_CAP_S = 600      // 10 minutes de production accumulables

export const DAILY_REWARDS = [0, 0, 1, 1, 2, 2, 3] as const   // type de crate offerte

export const RESELL_SECONDS = 30

export const GRILLE = 2                    // snap step, in metres
export const MIN_BASE_GAP = BASE_SIDE + 4   // the footprint, plus a street between neighbours
export const EDGE_MARGIN = BASE_SIDE / 2 + 2   // half a footprint clear of the scene edge
/**
 * How close to your own base you must stand to open a crate.
 *
 * A bought crate is walked to the base by a convoy that other players can outbid along the
 * way, and the whole point of that journey is the destination. Opening it anywhere on the
 * map made the delivery decorative. Opening it at home also keeps players moving between
 * the belt and their plot, which is where theft and gunfire find each other.
 */
export const OPEN_RANGE = 8
/**
 * Measured from the base's CENTRE, so it has to cover the base's own half-width.
 *
 * It was a flat six against a footprint of eleven, which happened to work because half of
 * eleven is five and a half. Widening the base to fourteen would have put the corner of every
 * lane-side building through the conveyor without this being derived.
 */
export const BELT_CLEARANCE = BASE_SIDE / 2 + 2

export function snapToGrid(v: number): number {
  return Math.round(v / GRILLE) * GRILLE
}

export function invalidReason(
  x: number, z: number, cote: number,
  autres: Array<{ x: number; z: number }>
): string | null {
  if (x < EDGE_MARGIN || z < EDGE_MARGIN || x > cote - EDGE_MARGIN || z > cote - EDGE_MARGIN) {
    return 'too close to the edge'
  }
  if (Math.abs(z - CENTER.z) < BELT_CLEARANCE && Math.abs(x - CENTER.x) < BELT_LENGTH / 2 + 4) {
    return 'on the belt lane'
  }
  for (const a of autres) {
    const dx = a.x - x, dz = a.z - z
    if (Math.sqrt(dx * dx + dz * dz) < MIN_BASE_GAP) return 'too close to another base'
  }
  return null
}

export const PLOT_MAX_ITEMS = SLOTS_PER_FLOOR * MAX_FLOORS

/** The width of the hole the ramp climbs through, taken out of the +x side of every floor. */
export const STAIRWELL_WIDTH = 3.6

/**
 * Where the six display slots stand on a floor, spread across the room they are given.
 *
 * The old figures were literals fitted to an eleven metre footprint, and they did not follow
 * when it grew: six pedestals huddled in a 4.8 by 2.4 corner of a 10.4 by 14 slab, with the
 * rest of the building empty. Derived from the footprint instead, so widening the base spaces
 * them out rather than leaving them behind.
 *
 * The walkable slab is the footprint minus the stairwell, which sits on the +x side, so the
 * usable centre is half a stairwell towards -x. The divisors leave air at both ends and keep
 * the near row clear of the doorway, which is on +z.
 */
export function slotPosition(slot: number): { dx: number; dy: number; dz: number } {
  const floor = Math.floor(slot / SLOTS_PER_FLOOR)
  const k = slot % SLOTS_PER_FLOOR
  const col = k % 3
  const rang = Math.floor(k / 3)
  const centreX = -STAIRWELL_WIDTH / 2
  const pasX = (BASE_SIDE - STAIRWELL_WIDTH) / 3.4
  const pasZ = BASE_SIDE / 4.4
  return {
    dx: centreX + (col - 1) * pasX,
    dy: 0.45 + floor * FLOOR_HEIGHT,
    dz: -BASE_SIDE / 5 + rang * pasZ
  }
}

export function rampPosition(floor: number): { dx: number; dy: number; dz: number } {
  return {
    dx: BASE_SIDE / 2 - STAIRWELL_WIDTH / 2,
    dy: floor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2,
    dz: 0
  }
}
/** Scene side in metres. 8x8 parcels of 16 m. Real deployed Worlds run up to 2475
 * parcels, so the platform is not the constraint here: population is. */
export const SCENE_SIDE = 192
export const CENTER = { x: SCENE_SIDE / 2, z: SCENE_SIDE / 2 }

export const BEAT_MS = 2000
export const BEAT_DEAD_AFTER_MS = BEAT_MS * 3

/**
 * Write guards: only the authoritative server may change synced state.
 * Called on both sides; the isServer() guard makes it a no-op on a client, where
 * validateBeforeChange would otherwise error.
 */
export function registerValidators(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }) =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  PlayerTaps.validateBeforeChange(serverOnly)
  ServerBeat.validateBeforeChange(serverOnly)
  Crate.validateBeforeChange(serverOnly)
  Loot.validateBeforeChange(serverOnly)
  Plot.validateBeforeChange(serverOnly)
  Convoy.validateBeforeChange(serverOnly)
  DroppedCoins.validateBeforeChange(serverOnly)
}
