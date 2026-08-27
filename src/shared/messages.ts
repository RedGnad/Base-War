import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * registerMessages() defines a component internally, so this module must be imported
 * statically from index.ts: it has to run before the engine seals.
 */
export const MESSAGES = {
  serverLog: Schemas.Map({ line: Schemas.String }),

  stealItem: Schemas.Map({ ownerId: Schemas.String, slot: Schemas.Int }),
  wallet: Schemas.Map({ prestigeEats: Schemas.Int, offlineGain: Schemas.Int, offlineSec: Schemas.Int, offlineAt: Schemas.Int64, luckSec: Schemas.Int, luckPrice: Schemas.Int, coins: Schemas.Float, nextPrestige: Schemas.Int, prestige: Schemas.Int, minRarity: Schemas.Int, bestRarity: Schemas.Int, multiplier: Schemas.Int, income: Schemas.Float, basePosee: Schemas.Boolean, lockSec: Schemas.Int, canRecover: Schemas.Boolean, floorPrice: Schemas.Int, rechargeSec: Schemas.Int, pending: Schemas.Int, tutoEtape: Schemas.Int, sentries: Schemas.Int, sentryPrice: Schemas.Int, presents: Schemas.Int, prime: Schemas.Float }),

  claimSlot: Schemas.Map({ x: Schemas.Float, z: Schemas.Float }),
  basePositions: Schemas.Map({ xs: Schemas.Array(Schemas.Float), zs: Schemas.Array(Schemas.Float) }),

  buyBelt: Schemas.Map({ articleId: Schemas.Int }),
  beltAlert: Schemas.Map({ crateTier: Schemas.Int }),
  bought: Schemas.Map({ byName: Schemas.String, crateTier: Schemas.Int, price: Schemas.Int }),

  openBox: Schemas.Map({ crateTier: Schemas.Int }),
  boxResult: Schemas.Map({ traits: Schemas.Int, crateTier: Schemas.Int, rarity: Schemas.Int, mutation: Schemas.Int, state: Schemas.String }),
  inventory: Schemas.Map({ crates: Schemas.Array(Schemas.Int) }),

  rebirth: Schemas.Map({}),
  rebirthDone: Schemas.Map({ prestige: Schemas.Int, multiplier: Schemas.Int }),


  index: Schemas.Map({ vus: Schemas.Array(Schemas.Int), skin: Schemas.Int }),
  setSkin: Schemas.Map({ mutation: Schemas.Int }),

  collect: Schemas.Map({}),
  collected: Schemas.Map({ gain: Schemas.Int }),
  quests: Schemas.Map({
    ids: Schemas.Array(Schemas.Int), progres: Schemas.Array(Schemas.Int),
    cibles: Schemas.Array(Schemas.Int), pris: Schemas.Array(Schemas.Int),
    log: Schemas.Int, dayClaimed: Schemas.Boolean
  }),
  tutorial: Schemas.Map({ etape: Schemas.Int, total: Schemas.Int }),
  timeGift: Schemas.Map({ crate: Schemas.Int, minutes: Schemas.Int }),

  /** client -> server: cancel the steal I started. */
  cancelSteal: Schemas.Map({}),
  /** server -> thief: steal in progress, with its remaining time. */
  stealProgress: Schemas.Map({ ownerName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int, restantMs: Schemas.Int, totalMs: Schemas.Int }),
  /** server -> thief: the attempt ended without the item. */
  stealFailed: Schemas.Map({ reason: Schemas.String }),
  /** server -> the victim, live: someone is taking something right now. */
  beingRobbed: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, restantMs: Schemas.Int }),

  /** client -> server: I raised or lowered my weapon. */
  aim: Schemas.Map({ on: Schemas.Boolean }),
  /** server -> everyone: who is holding their weapon up, so every client draws the same thing. */
  aiming: Schemas.Map({ addr: Schemas.String, on: Schemas.Boolean }),

  /** client -> server: I fired at this point. The server decides who, if anyone, was hit. */
  shoot: Schemas.Map({ x: Schemas.Float, y: Schemas.Float, z: Schemas.Float }),
  /** client -> server: I swung at this point. Same shape as a shot, resolved with an arm's reach. */
  slap: Schemas.Map({ x: Schemas.Float, y: Schemas.Float, z: Schemas.Float }),
  /** server -> shooter: what the shot did. */
  shotResult: Schemas.Map({ hitName: Schemas.String, dropped: Schemas.Int, reason: Schemas.String, loot: Schemas.Int }),
  /** server -> the target: they were hit and lost coins on the spot. */
  wasShot: Schemas.Map({ byName: Schemas.String, lost: Schemas.Int }),
  /** server -> the picker: they collected a pile. */
  pickedUp: Schemas.Map({ amount: Schemas.Int }),

  outbid: Schemas.Map({ convoyId: Schemas.Int }),
  outbidLost: Schemas.Map({ byName: Schemas.String, rembourse: Schemas.Int, crateTier: Schemas.Int }),
  outbidWon: Schemas.Map({ fromName: Schemas.String, price: Schemas.Int, crateTier: Schemas.Int }),
  outbidFeed: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, price: Schemas.Int }),
  convoyArrived: Schemas.Map({ crateTier: Schemas.Int }),

  buySentry: Schemas.Map({ tier: Schemas.Int }),
  sentryBought: Schemas.Map({ charges: Schemas.Int, cost: Schemas.Int, floor: Schemas.Int }),
  sentryBlocked: Schemas.Map({ ownerName: Schemas.String, gelMs: Schemas.Int, left: Schemas.Int, lockSec: Schemas.Int, lost: Schemas.Int, floor: Schemas.Int }),
  sentryTriggered: Schemas.Map({ byName: Schemas.String, left: Schemas.Int, taken: Schemas.Int }),

  /* Carry: lift one out of a base, put the one you hold into a base, or let go of it. */
  pickUp: Schemas.Map({ slot: Schemas.Int }),
  placeDown: Schemas.Map({ ownerId: Schemas.String, slot: Schemas.Int }),
  dropCarried: Schemas.Map({}),
  sellCarried: Schemas.Map({}),
  /** Seconds left before the play-time crate, or -1 once it has been given. */
  giftProgress: Schemas.Map({ leftS: Schemas.Int, totalS: Schemas.Int }),
  carryResult: Schemas.Map({ ok: Schemas.Boolean, reason: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  gaveItem: Schemas.Map({ toName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  wasGifted: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  gifted: Schemas.Map({ byName: Schemas.String, toName: Schemas.String, rarity: Schemas.Int }),

  /* Gear: buy one into your pocket, put one down where you stand. */
  buyGear: Schemas.Map({ gear: Schemas.Int }),
  placeGear: Schemas.Map({ gear: Schemas.Int }),
  gearBought: Schemas.Map({ gear: Schemas.Int, held: Schemas.Int, cost: Schemas.Int }),
  gearPlaced: Schemas.Map({ gear: Schemas.Int, held: Schemas.Int }),
  /** server -> the one who stepped on it. */
  trapped: Schemas.Map({ ownerName: Schemas.String, gelMs: Schemas.Int, mine: Schemas.Boolean }),
  /** server -> the owner, live or deferred. */
  trapSprung: Schemas.Map({ byName: Schemas.String }),
  /** client -> server: pull the cloak on. Server answers by writing the Cloaked component. */
  cloak: Schemas.Map({}),
  taser: Schemas.Map({ x: Schemas.Float, y: Schemas.Float, z: Schemas.Float }),
  tased: Schemas.Map({ byName: Schemas.String, gelMs: Schemas.Int }),
  buyLuck: Schemas.Map({}),
  luckBought: Schemas.Map({ cost: Schemas.Int, sec: Schemas.Int }),
  feedFusion: Schemas.Map({}),
  /** What a rush hands to whoever is present when it opens: a crate, and the toy that gained a trait, or -1. */
  rushGift: Schemas.Map({ crateTier: Schemas.Int, code: Schemas.Int, grand: Schemas.Boolean, name: Schemas.String }),
  /** The caller's own hopper, and the code just made out of it, or -1. */
  fusionState: Schemas.Map({ codes: Schemas.Array(Schemas.Int), made: Schemas.Int }),
  fused: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int, code: Schemas.Int }),
  /** server -> everyone near a bomb that went off, with what it did to them. */
  bombed: Schemas.Map({ ownerName: Schemas.String, dropped: Schemas.Boolean }),
  /** Pockets, sent with the wallet: how many of each gear the player holds. */
  gearHeld: Schemas.Map({ counts: Schemas.Array(Schemas.Int) }),

  claimQuest: Schemas.Map({ slot: Schemas.Int }),

  dailyReward: Schemas.Map({ log: Schemas.Int, crate: Schemas.Int }),
  questReward: Schemas.Map({ crate: Schemas.Int }),

  offlineEarnings: Schemas.Map({ gain: Schemas.Int, seconds: Schemas.Int }),

  buyFloor: Schemas.Map({}),
  floorBought: Schemas.Map({ floors: Schemas.Int, cost: Schemas.Int }),

  sold: Schemas.Map({ gain: Schemas.Int, rarity: Schemas.Int }),

  activateLock: Schemas.Map({}),
  reclaim: Schemas.Map({}),
  actionRejected: Schemas.Map({ action: Schemas.String, reason: Schemas.String, antiCheat: Schemas.Boolean }),
  youWereRobbed: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int, shieldSec: Schemas.Int }),
  thiefPenalty: Schemas.Map({ ms: Schemas.Int }),
  stolen: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  reclaimed: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, rarity: Schemas.Int })
} as const

export const room = registerMessages(MESSAGES)
