import {
  PRODUCTION_PER_RARITY, floorCost, MAX_PRESTIGE, coutPrestige, prestigeMultiplier, FLOOR_PRESTIGE_GATE,
  OFFLINE_RATE_V2, OFFLINE_CAP_PRODUCTION_S
} from './economy'
import { Schemas, engine } from '@dcl/sdk/ecs'
import { MUTATIONS, crate } from './loot-table'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

export const ServerBeat = engine.defineComponent('basetycoon::server-beat', {
  at: Schemas.Int64
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
  /** The mutation whose skin the owner chose for the building, 0 for none. */
  skin: Schemas.Int,
  sentries: Schemas.Int,
  /*
    Charges per storey, which is what turns a defence into a decision.

    A base-raid game is about WHERE the defences are; that is the whole strategy layer of the
    genre and it is the part we did not have. Our sentry was one number that protected every
    floor at once, so buying it was arithmetic and attacking it was blind. Per storey, the owner
    has to choose between guarding the trophies upstairs and guarding the door, and the thief
    finally has something to read: find the soft floor.
    
    Which is also the honest answer to "should we add an item that bypasses defences". The
    genre does have one, Clash of Clans' Freeze Spell, temporary and local. But the first
    counterplay a base-raid game gives an attacker is not an item, it is an angle, and the angle
    here is a storey. That costs nothing to build and asks the player to look at the building.
  */
  sentryFloors: Schemas.Array(Schemas.Int),
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
/**
 * How far a thief may drift from the item while taking it, in three dimensions.
 *
 * This used to be a horizontal test that ignored `y` entirely, which is how somebody could
 * start a theft on the third floor and walk down to the street without the attempt noticing.
 * Wider than the reach to start one, so a step back or a shove does not cancel it, and paired
 * with the same storey test, so taking the stairs does.
 */
export const STEAL_HOLD_REACH = 12
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
export const SHOT_COOLDOWN_MS = 110   // ~9 rounds/s; per-shot yield and boss HP scaled to hold DPS (28 Aug)
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
export const SHOT_DROP_SHARE = 0.0183
export const SHOT_DROP_CAP_S = 8

/**
 * The floor under a shot, so a first-day player still sees something come off.
 *
 * Read with the cap below, which is measured against the SHOOTER rather than the target.
 */
export const SHOT_MIN_YIELD = 200
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

/**
 * An item that belongs to no base right now, because somebody is holding it.
 *
 * Three separate actions in this game were the same act wearing different clothes: taking
 * something off a rival's shelf, putting something on a friend's, and rearranging your own.
 * Each had its own message, its own menu and its own explanation, and the gift in particular
 * was a click on a building that nobody guessed. They are all one verb: pick it up, walk, put
 * it down. Where you put it down is what the act turns out to have been.
 *
 * This is the middle of that sentence, and it is a real place rather than a bookkeeping
 * detail. While an item is here it is on somebody's person, visible to every other player,
 * and it is not earning for anyone. That gap is the whole point: a thief who has pried
 * something loose still has to carry it home past the person they took it from.
 *
 * `origin` is where it goes back to if the carry ends badly, which is the base it came from,
 * not the carrier's. Dropping it, being shot, or leaving all send it home.
 */
export const Carried = engine.defineComponent('basetycoon::carried', {
  holder: Schemas.String,
  code: Schemas.Int,
  origin: Schemas.String,
  sinceMs: Schemas.Int64,
  grip: Schemas.Float,
  /** True only when it was lifted off the holder's OWN shelf: putting it back is tidying, not placing. */
  repris: Schemas.Boolean
})

/**
 * How many hits it takes to knock a carried item loose.
 *
 * One was the first answer and it was wrong. Prying something off a shelf costs six to
 * eighteen seconds of standing still in somebody's building; undoing all of it with a single
 * bullet, from a weapon that fires five times a second, turns the walk home into a coin flip
 * on first contact rather than a chase. Three hits is a pursuit: the owner has to stay on
 * their target, and the thief has a reason to run rather than to accept the inevitable.
 */
/**
 * How much hold a thief has, on a shelf they are prying or on something they carry.
 *
 * One number for both, because they are the same situation seen twice: somebody has their
 * hands on a thing that is not theirs, and shots loosen that hold by an amount the distance
 * decides. Five is five point-blank hits, about nine tenths of a second of sustained fire:
 * raised from three when carrying was made heavy, because a slower runner is a much easier
 * target and the chase had to keep the shape it was tuned for.
 */
export const CARRY_GRIP = 5

/**
 * How much a shot is worth at the distance it was taken from.
 *
 * A first attempt gave the loot its own hard range, ten metres, inside which a hit did
 * everything and outside which it did nothing at all. It balanced the chase and it was a bad
 * rule: at 9.9 metres you disarm somebody and at 10.1 you do not, and no player can see that
 * line. It was also a second range bolted next to the first, which is a lot of machinery for
 * a part of this game that is meant to be secondary.
 *
 * One idea instead: a shot's effect falls with the square of the distance, the way anybody
 * expects a gun to behave, full strength within a room's width and fading after. It carries
 * the balance the hard range was there to produce, and it carries it as a gradient the player
 * can feel rather than a wall they discover.
 *
 * Simulated against the chase, at three points of grip: point blank costs the thief their
 * load in three shots, ten metres in six, fifteen in fifteen, and past twenty the owner
 * cannot land enough before the thief is gone. So a burglar caught in your doorway loses it,
 * and one with a head start gets home, which is the shape a theft should have.
 */
export const SHOT_FULL_RANGE = 8

export function forceDuTir(distance: number): number {
  const d = Math.max(distance, 0.5)
  return Math.min(1, (SHOT_FULL_RANGE / d) ** 2)
}

/** How long a knocked-loose item lies on the ground before it takes itself home. */
export const LOOT_ITEM_LIFETIME_MS = 30_000
export const LOOT_ITEM_PICKUP_RANGE = 3

/** The one who just dropped it cannot scoop it straight back up. */
export const LOOT_ITEM_OWNER_LOCK_MS = 2_000

/**
 * An item lying where its carrier was hit, waiting for whoever gets there first.
 *
 * Sending it straight back to the base it came from was the tidy answer and the dull one:
 * it ends the moment instead of opening it. On the ground it is a scramble. The owner runs
 * to reclaim what is theirs, the thief can try again if they survive, and a third party who
 * had no stake at all suddenly has a reason to have been carrying a gun.
 */
export const DroppedItem = engine.defineComponent('basetycoon::dropped-item', {
  code: Schemas.Int,
  origin: Schemas.String,
  droppedBy: Schemas.String,
  untilMs: Schemas.Int64
})

/**
 * How much full hands slow you down, and it depends whose hands the thing was in before.
 *
 * A first pass gave carrying a single share of 0.72 and left the prying penalty running
 * alongside it. The two multiply, and the penalty expires two seconds after the item lands in
 * the hands, so the thief went 6.5 while prying and then **7.92 the instant they walked off
 * with it**: they accelerated at the exact moment the dangerous half of the theft began, which
 * is why a player reported feeling no slowdown at all. They were right, it was a speed-up.
 *
 * Stolen goods now carry their own share and replace the prying penalty rather than stacking
 * with it, so the transition is continuous: 6.5 while prying, 6.82 while running for it. Your
 * own belongings are lighter, because moving a trophy around your own shelves is not the same
 * act as running off with somebody else's.
 *
 * 0.62 is not a taste. Simulated against the chase, it is the share that keeps the shape the
 * balance was tuned for once the grip is raised to match: the owner wins at point blank in
 * about a second, struggles at ten metres, and cannot land enough past fifteen.
 */
export const CARRY_STOLEN_SHARE = 0.45
export const CARRY_OWN_SHARE = 0.85

/** How long a carried item waits for its carrier before taking itself home. */
export const CARRY_TIMEOUT_MS = 90_000

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
/*
  Three tiers that did the same thing, until now.

  GUARD, TURRET and BATTERY differed only by how many charges they granted and what a charge
  cost. Firing one produced an identical outcome whichever you had bought, so the choice was
  arithmetic rather than a decision: buy the cheapest per charge and never think about it.

  `tithe` is what separates them. A sentry that fires now also shakes coins out of the thief,
  as a bullet does, and those coins land ON THE GROUND at the thief's feet rather than in the
  owner's pocket. That matters: it opens the moment instead of closing it. The owner has to
  come and collect, the thief can try to snatch their own money back, and anyone watching has
  a reason to run over. Same rule as everywhere else in this game, the floor is where the
  consequences of a fight land.

  GUARD keeps a tithe of zero on purpose. It stays the pure deterrent, the cheap one that
  simply says no, so the ladder starts at a rung that costs nothing to understand.

  `itemSecondsPerCharge` is seconds of ONE item's output, not of the base's total, and the
  rename is the fix for a measured inversion. The price was `income x charges x seconds`, and
  income tracks how many slots you own while a charge protects the base for a minute, which is
  worth at most a handful of items however big the building is. So a six-slot hut paid 0.3
  times the value of what it saved and a seventy-two-slot tower paid 4.2 times: the more you
  built, the worse defending yourself became. Pricing off one item's output makes the charge
  track the QUALITY of what is on the shelves and stop tracking their number.

  `retour` is the ceiling, and it is expressed in charges rather than in seconds because the
  first version of this borrowed the gun's cap and that was measurably wrong. A shot caps at
  eight seconds of the shooter's income, which is right for a bullet since bullets are free.
  A charge is not free: `prixParCharge` asks `itemSecondsPerCharge` seconds of one item's
  output for each one. Capping its return below its price meant a defence that fired perfectly,
  every single time, still lost its owner money. It could never pay for itself.

  So the ceiling is a multiple of what the charge itself cost. A TURRET that catches a thief
  on every charge returns twice its price, a BATTERY four times, and the number on the shop
  row means something a tycoon player already knows how to read. It also keeps the two tiers
  apart at every level of wealth: under the old cap a rich enough thief handed TURRET and
  BATTERY exactly the same sum, which is precisely where the difference should matter most.
*/
/*
  The shield you EARN by being robbed, which is the genre's actual answer and the piece we
  never had.

  Clash of Clans, wiki pages `Shield` and `Guard`: the main protection is an automatic shield
  granted for BEING RAIDED, eight hours, "regardless of loot taken and overall damage on the
  base". What you can buy with the game's own currency is short, two hours of Village Guard,
  once a day. Whole days cost premium money. That asymmetry is what stops protection from
  killing the game: it cannot be stacked in advance, and it lands on the player who just lost
  something rather than on the one who could already afford not to.

  Which is why the sentry does NOT get a long lock. Selling twenty charges of eight hours would
  be a hundred and sixty hours of stackable immunity bought with ordinary coins, and nothing in
  the genre does that. The sentry stays the ACTIVE defence: it breaks an attempt in progress and
  takes a tithe. The long protection is earned.

  The duration ramps with how long the owner has ACTUALLY been away, and that is not a detail.
  The documented failure of every offline-protection system is players logging off mid-raid to
  trigger it. `lastSeen` is stamped on departure, so somebody who quits while being robbed has
  an absence of nearly zero when the theft lands, and earns the floor rather than the ceiling.
  Present, you get a minute: enough to give chase, short enough that a venue full of people
  stays a venue. Genuinely asleep, you get the genre's eight hours.
*/
export const SHIELD_MIN_MS = 60_000
export const SHIELD_MAX_MS = 8 * 3600_000
export const SHIELD_FULL_ABSENCE_MS = 4 * 3600_000

/*
  Revenge walks through a shield, and without it the wall is one-sided.

  Same wiki, same page: "Revenge attacks and attacks from Ranked Battles can bypass Shields."
  It is the counterweight that makes an eight hour shield acceptable in the first place. Ours
  runs as long as the longest shield can, so being robbed while asleep never leaves you facing
  a wall you cannot answer: whoever took from you is open to you for as long as they could
  possibly be sealed, however sealed they are against everybody else.
*/
export const REVENGE_MS = SHIELD_MAX_MS

export function shieldFor(absenceMs: number): number {
  const t = Math.max(0, Math.min(1, absenceMs / SHIELD_FULL_ABSENCE_MS))
  return Math.round(SHIELD_MIN_MS + (SHIELD_MAX_MS - SHIELD_MIN_MS) * t)
}

/*
  Gear: what prestige unlocks, and the reason to want it beyond the multiplier.

  The leading game of this family ships forty of them, and the structural facts are these
  (wiki `Gears`, read at source): a gear helps you STEAL or DEFEND and never produces; it
  cannot be used while carrying loot, so it never makes a thief untouchable during the one
  walk where they are exposed; and every one of them unlocks at a rebirth. That last rule is
  what turns prestige from a number into a door. Ours opens the same way.

  Each entry has one verb and one number, which is also the genre's rule: freeze 7 seconds, at
  most five out at once, nothing permanent and nothing global.

  PRICES ARE FIXED, AND THEY SIT ON THE PRESTIGE LADDER. That is the reference's own shape,
  read from its shop and its rebirth table (wiki `Gears` and `Rebirth`, 27 Aug 2026): every
  gear has one cash price and one rebirth that unlocks it, and the price is a small share of
  the NEXT rebirth, the one its buyer is saving towards. Slap $500, Speed Coil $750 and Trap
  $1K sit under a first rebirth of $500K; Iron Slap $2.5K under a second of $1.5M; Taser $100K
  under a fourth of $35M; Invisibility Cloak $300K and Boogie Bomb $500K under a fifth of
  $100M. Read as shares those are 0.10 to 0.50 percent, and `ratio` holds each gear's own.
  Above the fifth rebirth the reference's shares collapse (Laser Cape $20M under $125B), an
  artefact of rungs that jump by ten where ours multiply by four; those keep the median of
  the first five tiers, 0.20 percent.

  What was wrong before was not the level, it was the UNIT: a share of one item's output,
  which drifted with the shelves, so the same coil cost 4K to a beginner and 1.7M to a
  veteran, and neither number had been chosen.

  THE COIL IS THE ONE DEPARTURE FROM THE REFERENCE, ON THE TESTER'S CALL. Their Speed Coil is
  the first purchase of the game (0.15 percent of the first rebirth); ours is a permanent
  stat, "among the most precious things in a game like ours", and the tester priced it at
  several prestiges: four times the first, 10M. A goal for the first days, not the first
  minutes. The share is the only number that moved; the rule (fixed price on the ladder) is
  the same for every row, and since the ladder itself multiplies by four a rung, every gear
  above keeps its share of a rung that is now four times the last.

  The last three are the reference's COUNTERS, at the reference's own rungs: the taser at 3
  (a hit that freezes and opens the hands), the glasses at 9 (its Laser Cape, "x-ray vision",
  sees through the cloak sold at 4), the mine at 14 (its Subspace Mine, invisible, "extra
  defense on your best" items). A cloak has an answer, and the answer is five rungs above it.
*/
export const GEARS = [
  { id: 0, name: 'TRAP', prestige: 0, ratio: 0.0020, max: 5, kind: 'place', verb: 'freezes the first thief who steps on it, 7 s' },
  { id: 1, name: 'SPEED COIL', prestige: 0, ratio: 4.0, max: 1, kind: 'wear', verb: 'run 50% faster, always on, off while carrying' },
  { id: 2, name: 'SLAP', prestige: 1, ratio: 0.0017, max: 1, kind: 'wear', verb: 'replaces the gun: short reach, full force every hit' },
  { id: 3, name: 'CLOAK', prestige: 4, ratio: 0.0030, max: 1, kind: 'toggle', verb: 'invisible for 20 s, breaks the moment you touch loot' },
  { id: 4, name: 'BOOGIE BOMB', prestige: 4, ratio: 0.0050, max: 3, kind: 'place', verb: 'everyone nearby drops what they carry, 3 s later' },
  { id: 5, name: 'TASER', prestige: 3, ratio: 0.0029, max: 1, kind: 'wear', verb: "replaces the gun: arm's reach, 3 s frozen, hands emptied" },
  { id: 6, name: 'X-RAY GLASSES', prestige: 9, ratio: 0.0020, max: 1, kind: 'wear', verb: 'you see through every cloak' },
  { id: 7, name: 'SUBSPACE MINE', prestige: 14, ratio: 0.0020, max: 2, kind: 'place', verb: 'invisible to all but you: 3 s frozen, hands emptied' }
] as const
export type GearId = typeof GEARS[number]['id']
/** Under this a price is a rounding error on the screen: the sentry floor, kept for the same reason. */
export const GEAR_MIN_PRICE = 240
/** One price per gear, the same on both sides: a share of the prestige after the one that unlocks it. */
export function prixGear(gear: number): number {
  const g = GEARS[gear]
  if (g === undefined) return 0
  return Math.max(GEAR_MIN_PRICE, Math.round(g.ratio * coutPrestige(g.prestige + 1)))
}

export const TRAP_FREEZE_MS = 7_000
/*
  The coil's share, from the reference: "increases your move speed by 50% (from 34 to 51)".
  It is a passive that is OFF while carrying, the genre's rule that gear never helps the walk
  home, and it multiplies with the aim and thief penalties rather than replacing them.
*/
export const COIL_SHARE = 1.5
/*
  A slap is a gun with the range of an arm. Full force at every hit, so five slaps disarm a
  carrier where five shots from across the plaza would not, and a reach of two and a half
  metres, so getting there is the whole skill. Melee is the genre's FIRST weapon, the one every
  player spawns with; here it is the one a judge understands without being told what a gun does.
*/
export const SLAP_RANGE = 2.5
export const SLAP_COOLDOWN_MS = 420
/*
  The taser is the slap's rung at prestige 3, and what it adds is the reference's own effect:
  "stun enemies with a taser to fling them and return your Brainrots". A hit at arm's reach
  freezes the target three seconds and opens their hands at full force.
*/
export const TASER_FREEZE_MS = 3_000
export const TASER_COOLDOWN_MS = 900

/*
  The cloak is a timed state, and the server owns it.

  Who is invisible is a fact every client has to agree on, so it lives in a synced component
  the server writes. It ends on a timer, and it ends EARLY the moment the wearer takes hold of
  anything: the genre's rule again, gear never covers the walk home. Twenty seconds is enough
  to cross a plaza and reach a doorway unseen; it is not enough to walk a trophy back.
*/
export const Cloaked = engine.defineComponent('basetycoon::cloaked', {
  who: Schemas.String,
  untilMs: Schemas.Int64
})
export const CLOAK_MS = 20_000
export const CLOAK_COOLDOWN_MS = 90_000

/*
  A bomb is a trap with a fuse and a radius. It goes off three seconds after it is set, for
  everyone within four metres who is holding something, and it makes them drop it where they
  stand. Three seconds is long enough that setting it at a carrier's feet is a play and not
  an instant win; four metres is a doorway, not a plaza.
*/
export const Bomb = engine.defineComponent('basetycoon::bomb', {
  owner: Schemas.String,
  atMs: Schemas.Int64
})
export const BOMB_FUSE_MS = 3_000
export const BOMB_RADIUS = 4
/*
  A window in which the belt gives something else, which is the genre's "event".

  Steal a Brainrot, wiki `Events`, read at source: events are "a Core feature" that "have a
  chance to make brainrots get Traits or Mutations", the natural ones have "a chance to spawn
  every 15 minutes", and their column for how they show is titled "Environmental Changes":
  Bloodmoon is "the sky turns a deep red", the concert is "the screen goes dark with neon
  lights and music". So an event is two things: a mutation whose odds are pushed for everyone
  for a few minutes, and a WORLD that looks different while it lasts. Not a boss, not a
  minigame, not a private roll: a shared clock the whole venue reads at once.

  One synced entity carries it, written by the server, so every client agrees on what is on
  and until when. `theme` is a mutation id or -1 for none.
*/
export const Event = engine.defineComponent('basetycoon::event', {
  theme: Schemas.Int,
  untilMs: Schemas.Int64,
  /** The daily one, at its fixed hour: longer, the belt twice as fast, a themed crate to whoever is there. */
  grand: Schemas.Boolean,
  nextGrandMs: Schemas.Int64
})
/*
  The reference runs its rarest events "every day at 3:00 AM EST", a fixed hour the community
  organises around, next to the random ones that "have a chance to spawn every 15 minutes".
  Ours: one GRAND RUSH a day at 20:00 UTC, ten minutes, present or not, because a fixed hour
  that waits for somebody is not a fixed hour. Every rush pays presence the moment it opens:
  a crate, and one placed toy of each player in the room gains a trait. Crates opened during
  a rush carry a chance of a trait too, the reference's "brainrots on the conveyor have a
  chance to get the trait".
*/
export const GRAND_RUSH_UTC_HOUR = 20
export const GRAND_MS = 10 * 60_000
export const GRAND_TEMPO = 2
export const RUSH_TRAIT_CHANCE = 0.2
/**
 * The venue's memory, for the one who arrives alone.
 *
 * A judge enters an empty plaza in a metaverse of ten people. What is social for them is what the
 * others LEFT: full bases, and a board that says who earns most, who steals most and what happened
 * lately. That is the base-raid genre's own answer (the reference game's live-spawns board and its
 * two leaderboards, top earner and top steals). Written by the server only, read by every client.
 */
export const Records = engine.defineComponent('basetycoon::records', {
  earners: Schemas.Array(Schemas.Map({ name: Schemas.String, value: Schemas.Float })),
  thieves: Schemas.Array(Schemas.Map({ name: Schemas.String, value: Schemas.Float })),
  journal: Schemas.Array(Schemas.Map({ t: Schemas.Int64, kind: Schemas.String, a: Schemas.String, b: Schemas.String, code: Schemas.Int }))
})
export const RECORDS_TOP = 8
export const JOURNAL_SHOWN = 10
export const JOURNAL_KEPT = 40

export const EVENT_MS = 5 * 60_000
/** Mean gap between events. The genre rolls every fifteen minutes; ours lands there on average. */
export const EVENT_GAP_MS = 15 * 60_000
/** How hard the event pushes its mutation: the Lava crate's own weight, applied to every crate. */
export const EVENT_WEIGHT = 60
/*
  Luck for sale, in coins. The reference sells 2x and 4x luck for fifteen minutes; ours
  doubles the odds of every mutation for fifteen minutes and is priced like a gear of the
  buyer's own tier, a share of the prestige they are saving towards.
*/
export const LUCK_MS = 15 * 60_000
export const LUCK_MULT = 2
export const LUCK_RATIO = 0.0020
export function prixLuck(prestige: number): number {
  return Math.max(GEAR_MIN_PRICE, Math.round(LUCK_RATIO * coutPrestige(Math.min(prestige, MAX_PRESTIGE - 1) + 1)))
}
/** Which mutations can headline an event, and the world colour each one brings. */
/** Five minutes is a rush, not an hour: the tester read "HOUR" against the countdown and was right. */
export const EVENT_THEMES = [
  { theme: 1, name: 'GOLD RUSH', crate: 4 },
  { theme: 5, name: 'LAVA RUSH', crate: 5 },
  { theme: 9, name: 'CURSED RUSH', crate: 6 }
] as const

/** A trap on the floor, synced so everyone can see the plate and nobody can see who armed it. */
export const Trap = engine.defineComponent('basetycoon::trap', {
  owner: Schemas.String,
  untilMs: Schemas.Int64,
  /** A mine: drawn for its owner only, fires on carriers too, and empties their hands. */
  mine: Schemas.Boolean
})
export const MINE_FREEZE_MS = 3_000

/** Traps expire, because a floor that fills with old plates is a floor nobody can cross. */
export const TRAP_LIFETIME_MS = 30 * 60_000
export const TRAP_TRIGGER_RANGE = 1.1

export const SENTRY_TIERS = [
  { name: 'GUARD', charges: 3, itemSecondsPerCharge: 480, tithe: 0, retour: 0 },
  { name: 'TURRET', charges: 8, itemSecondsPerCharge: 400, tithe: 0.15, retour: 2 },
  { name: 'BATTERY', charges: 20, itemSecondsPerCharge: 330, tithe: 0.30, retour: 4 }
] as const

/** The ceiling a base can hold, whichever tiers were bought to get there. */
/** Per STOREY now, not per base: each floor can hold a full battery of its own. */
export const SENTRY_MAX_CHARGES = SENTRY_TIERS[SENTRY_TIERS.length - 1].charges

/** One charge, priced off what ONE item on the shelf produces. Both sides call this. */
export function prixParCharge(revenuParObjet: number, tier: number): number {
  const t = SENTRY_TIERS[Math.max(0, Math.min(tier, SENTRY_TIERS.length - 1))]
  return Math.max(SENTRY_MIN_PRICE, Math.floor(revenuParObjet * t.itemSecondsPerCharge))
}
export const SENTRY_MIN_PRICE = 240

/**
 * Nothing shelters an absent player except what they left behind.
 *
 * There was a floor here, three items an absent owner could never lose, added because logging
 * off with no counterplay looked harsh. It is the wrong tool: a base that cannot be emptied is
 * a base nobody has to defend, and defending is what the sentries, the shield and the whole
 * back half of this design are for. The answer to being robbed while away is to have armed
 * something before leaving, not to be immune.
 */
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

/*
  A hole in a shelf. Zero is a real item (a Common with no mutation encodes to 0), so the
  sentinel has to be something no `encoder()` can produce. Every loop that sums, counts or
  draws items skips it; every index that names a pedestal keeps meaning that pedestal.
*/
export const VIDE = -1
export function occupe(items: readonly number[]): number {
  let n = 0
  for (const c of items) if (c !== VIDE) n += 1
  return n
}

export const RARITY_PRICE = [40, 150, 600, 2600, 11000]

/*
  Fixed network identities, for singletons only.

  Everything else auto-allocates, which is unique by construction. `crate: 2` was reserved for
  a component that was defined and never once used; a reserved id that names nothing is an
  invitation to reuse it for something else and collide with a room that still remembers it.
*/
export const SYNC_ID = {
  serverBeat: 1
} as const

export const HIT_RANGE = 4

export const LOCK_ON_ARRIVAL_MS = 30_000   // lock automatique a l'arrivee
export const LOCK_FREE_MS = 60_000   // lock activable, duration SOURCEE au wiki
export const LOCK_COOLDOWN_MS = 150_000
export const LOCK_BONUS_MS = 10_000     // +10 s par prestige de progression
export const PENALTY_MS = 12_000      // thief penalty duration
export const RECOVER_WINDOW_MS = 20_000  // window to recover a stolen item
/**
 * The footprint, widened so six display slots and a stairwell are not the same square metre.
 *
 * At eleven metres, minus a three metre stairwell, the walkable floor was eight by eleven and
 * had to hold six pedestals and the player moving between them. Fourteen gives the room the
 * building was always drawn as having.
 */
export const BASE_SIDE = 14.0

/**
 * How close a base has to be before its contents are even candidates, measured flat.
 *
 * Deliberately horizontal and generous: this only asks "am I at this building", and the real
 * test is the reach below. It has to cover the footprint, because a thief on the top floor is
 * directly above the base's origin and metres away from it in a straight line.
 */
export const STEAL_RANGE = BASE_SIDE / 2 + 2

/** How close you have to be to a base to put something down in it. */
export const PLACE_RANGE = BASE_SIDE / 2 + 2

/**
 * How far a thief can be from the ITEM, mirroring what the client already allows.
 *
 * The building itself is what stops a theft from below: floor slabs and walls carry a pointer
 * collider as well as a physical one, so the ray behind a click is blocked by them and an
 * item on the storey above cannot be clicked at all. That is the rule, and it is a good one
 * because a player can see it.
 *
 * This exists so a modified client cannot simply send the message the honest one refuses to.
 * It therefore reproduces the same rule rather than inventing a stricter one: ten metres is
 * the SDK's own default reach for a pointer event, and the storey test below is the slab.
 * A first attempt at this put it at three and a half metres, which quietly cut the honest
 * game's reach by two thirds to enforce something the geometry was already enforcing.
 */
export const STEAL_REACH = 10

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

/**
 * How much height between a thief and an item still counts as the same storey.
 *
 * Three quarters of a floor: it forgives a ramp, a pedestal and the difference between where
 * an avatar's feet are reported and where they look like they are, and it refuses the storey
 * above, whose nearest item is a full floor plus its plinth away.
 */
export const SAME_STOREY = FLOOR_HEIGHT * 0.75
export const RECOVER_RANGE = 6

export const MAX_BASES_AFFICHEES = 60
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
 * Thirty-two degrees, which is a staircase; forty was a ladder.
 *
 * Real stairs are built between thirty and thirty-five, and a slope a player walks up dozens
 * of times a session should sit inside that. At four metres of rise it makes the ramp 7.55 m
 * long for 6.40 m of run, which the fourteen metre footprint takes easily.
 */
export const RAMP_ANGLE = 32
/** Derived, so a taller floor cannot leave the ramp reaching a floor it no longer meets. */
export const RAMP_LENGTH = FLOOR_HEIGHT / Math.sin((RAMP_ANGLE * Math.PI) / 180)
export const WALL_THICKNESS = 0.22
export const WALL_HEIGHT = FLOOR_HEIGHT
export const DOOR_WIDTH = 2.0

export const PRESTIGE_TIERS = Array.from({ length: MAX_PRESTIGE }, (_, i) => {
  const n = i + 1
  return {
    cost: coutPrestige(n),
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
/** The prestige a floor needs before its price is even offered: floor n at prestige n - 2. */
export function floorPrestigeRequired(targetFloor: number): number {
  return Math.max(0, targetFloor - FLOOR_PRESTIGE_GATE)
}

export function openFloors(floorsBought = 0): number {
  return Math.min(1 + floorsBought, MAX_FLOORS)
}

export function openSlots(floorsBought = 0): number {
  return openFloors(floorsBought) * SLOTS_PER_FLOOR
}


export const OFFLINE_RATE = OFFLINE_RATE_V2        // 35 % du income normal
export const OFFLINE_CAP_MS = 4 * 3600_000
export { OFFLINE_CAP_PRODUCTION_S }

export const PENDING_CAP_S = 600      // 10 minutes de production accumulables

/**
 * The seven days, and one of each crate the game has.
 *
 * It ran Basic, Basic, Good, Good, Rare, Rare, Epic: four of the seven kinds, each shown
 * twice, and none of the themed ones. The themed crates are the whole reason the belt is
 * worth watching, so a week of rewards that never shows one is a week that says the game is
 * smaller than it is. Ordered by price, which puts Gold second because it costs less than a
 * Good Crate, and leaves the Cursed Crate, the rarest thing on the belt at one percent, as
 * the reason to come back a seventh time.
 */
export const DAILY_REWARDS = [0, 4, 1, 2, 5, 3, 6] as const

export { RESELL_SECONDS } from './economy'

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

/** How thick a floor slab is. Its top face, floor height plus this, is the surface a toy stands on. */
export const SLAB_THICKNESS = 0.24

/**
 * Where the six display slots stand on a floor, spread across the room they are given.
 *
 * `dy` is the slab's TOP FACE, the surface the toy stands on, not the toy's centre. It used to
 * be the centre of a 0.45 m box, and every later reader guessed a different slab from it: the
 * toys of the big-silhouette pass were seated twelve centimetres inside the floor, and the
 * parts of their silhouettes that hung below their cube came out through the ceiling of the
 * storey underneath.
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
    dy: floor * FLOOR_HEIGHT + SLAB_THICKNESS,
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

/*
  A base faces the belt. Its door, ramp and shelves are laid out for a door on +z; a base
  placed north of the belt is that same base turned half a turn, so its door still opens on
  the lane everybody walks. Until 27 Aug every base opened on +z whichever side it stood, and
  half of them showed the plaza their back wall (tester). Both sides read geometry through
  `tourner`, so a thief's reach and a marker's spot agree with what is drawn.
*/
export function sensDeBase(z: number): 1 | -1 { return z > CENTER.z ? -1 : 1 }
export function tourner(z: number, dx: number, dz: number): { dx: number; dz: number } {
  const s = sensDeBase(z)
  return { dx: dx * s, dz: dz * s }
}

/*
  The fusion machine: three toys of one rarity go in, one of the rarity above comes out, with
  its mutation rolled again. The reference has one (Fuse Machine); ours stands by the belt so
  a base's Commons have somewhere to go besides the sell bin, and so what somebody just made
  is seen being made. One entity, written by the server, showing the last hand that fed it.
*/
export const Fusion = engine.defineComponent('basetycoon::fusion', {
  byName: Schemas.String,
  rarity: Schemas.Int,
  count: Schemas.Int,
  lastName: Schemas.String,
  lastCode: Schemas.Int,
  atMs: Schemas.Int64
})
export const FUSION_NEEDS = 3
/*
  What a mutated toy fed to the fuser does to the roll: its mutation's weight rises by this
  much, on top of the crate weights (plain 1000, Gold 220 ... Phantom 1). One mutated input
  is about a one-in-five chance of passing its mutation on, two the same about one in three,
  three about one in two. It was "the result keeps the best mutation of the three", which the
  tester read at once as a farm: two plain and one Lava made a Lava for certain, one rung up,
  every time. A chance is a bet; a guarantee was a ladder.
*/
export const FUSION_PUSH = 400
/**
 * The weights every mutation roll uses, on BOTH sides: the crate's own theme, the venue's
 * rush, bought luck, and what the fuser was fed. The server draws from them; the fuser's
 * panel prints them as a percentage on the row, so the chance the player reads is the chance
 * the server rolls, by construction.
 */
export function poidsDesMutations(crateId: number, eventTheme: number, luck: number, pousses: readonly number[]): number[] {
  const c = crate(crateId)
  return MUTATIONS.map((m) => {
    let w = m.poids
    if (c.theme === m.id) w *= c.weight
    if (eventTheme === m.id) w *= EVENT_WEIGHT
    if (m.id !== 0) w *= luck
    for (const p of pousses) if (p === m.id && m.id !== 0) w += FUSION_PUSH
    return w
  })
}
export const FUSION_RANGE = 4.5
/** Beside the records board, on the side of the belt away from the pit. */
export const FUSION_POS = { x: CENTER.x - 9, z: CENTER.z - 7 }

/*
  The raid: one boss on the plaza, every so often, for three minutes. The server writes this
  one entity; every client draws the same boss from it. `hp` is fractional because a shot
  from across the plaza is a fraction of a hit, the same force rule the pockets obey.
*/
export const Raid = engine.defineComponent('basetycoon::raid', {
  active: Schemas.Boolean,
  hp: Schemas.Float,
  hpMax: Schemas.Float,
  untilMs: Schemas.Int64,
  nextMs: Schemas.Int64,
  x: Schemas.Float,
  z: Schemas.Float,
  topName: Schemas.String,
  lastHitName: Schemas.String,
  hitAtMs: Schemas.Int64,
  swipeAtMs: Schemas.Int64
})
/** The switch. Off, the entity exists and never activates; the HUD shows nothing. */
export const RAID_ENABLED = true
/*
  On the clock, not on the server's uptime: hh:20 and hh:50 UTC, every day, the practice of
  the genre for the events people organise around (the reference's rarest run "every day at
  3:00 AM EST"). Never on the grand rush's 20:00 slot; a slot with nobody present is skipped.
*/
export const RAID_MINUTES = [20, 50] as const
export const RAID_MS = 3 * 60_000
/** On the plaza side of the belt lane, opposite the board and the fuser. */
export const RAID_POS = { x: CENTER.x, z: CENTER.z + 7 }
export const RAID_RADIUS = 1.6
/** Any weapon aimed at the boss lands within this range, whatever its own anti-player reach. */
export const RAID_HIT_RANGE = 16
export const RAID_ORBIT = 4
export const RAID_ORBIT_MS = 40_000
/** Hits to fell it: forty alone, twenty-five more per person in the room. */
export const RAID_HP_BASE = 65
export const RAID_HP_PER_PLAYER = 41
export const RAID_SWIPE_MS = 5_000
export const RAID_SWIPE_RANGE = 4
/** A swipe shakes a tenth of the purse loose, capped at two minutes of income, onto the floor. */
export const RAID_SWIPE_SHARE = 0.10
export const RAID_SWIPE_CAP_S = 120
/** The Legendary crate, to whoever dealt the most. */
export const RAID_REWARD_CRATE = 7

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

  ServerBeat.validateBeforeChange(serverOnly)
  Trap.validateBeforeChange(serverOnly)
  Event.validateBeforeChange(serverOnly)
  Records.validateBeforeChange(serverOnly)
  Fusion.validateBeforeChange(serverOnly)
  Raid.validateBeforeChange(serverOnly)
  Cloaked.validateBeforeChange(serverOnly)
  Bomb.validateBeforeChange(serverOnly)
  Loot.validateBeforeChange(serverOnly)
  Plot.validateBeforeChange(serverOnly)
  Convoy.validateBeforeChange(serverOnly)
  DroppedCoins.validateBeforeChange(serverOnly)
}
