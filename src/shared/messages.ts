import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * registerMessages() defines a component internally, so this module must be imported
 * statically from index.ts: it has to run before the engine seals.
 */
export const MESSAGES = {
  tap: Schemas.Map({}),
  tapAck: Schemas.Map({ count: Schemas.Int, persisted: Schemas.Boolean }),

  hitCrate: Schemas.Map({}),
  hitRejected: Schemas.Map({ reason: Schemas.String, antiCheat: Schemas.Boolean }),
  serverLog: Schemas.Map({ line: Schemas.String }),

  stealItem: Schemas.Map({ ownerId: Schemas.String, slot: Schemas.Int }),
  wallet: Schemas.Map({ coins: Schemas.Float, nextPrestige: Schemas.Int, prestige: Schemas.Int, minRarity: Schemas.Int, multiplier: Schemas.Int, income: Schemas.Float, basePosee: Schemas.Boolean, lockSec: Schemas.Int, canRecover: Schemas.Boolean, floorPrice: Schemas.Int, rechargeSec: Schemas.Int, pending: Schemas.Int, tutoEtape: Schemas.Int, sentries: Schemas.Int, sentryPrice: Schemas.Int, presents: Schemas.Int, prime: Schemas.Float }),

  claimSlot: Schemas.Map({ x: Schemas.Float, z: Schemas.Float }),
  basePositions: Schemas.Map({ xs: Schemas.Array(Schemas.Float), zs: Schemas.Array(Schemas.Float) }),

  buyBelt: Schemas.Map({ articleId: Schemas.Int }),
  beltAlert: Schemas.Map({ crateTier: Schemas.Int }),
  bought: Schemas.Map({ byName: Schemas.String, crateTier: Schemas.Int, price: Schemas.Int }),

  openBox: Schemas.Map({ crateTier: Schemas.Int }),
  boxResult: Schemas.Map({ crateTier: Schemas.Int, rarity: Schemas.Int, mutation: Schemas.Int, state: Schemas.String }),
  inventory: Schemas.Map({ crates: Schemas.Array(Schemas.Int) }),

  rebirth: Schemas.Map({}),
  rebirthDone: Schemas.Map({ prestige: Schemas.Int, floors: Schemas.Int }),

  moveItem: Schemas.Map({ de: Schemas.Int, to: Schemas.Int }),

  index: Schemas.Map({ vus: Schemas.Array(Schemas.Int) }),

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
  /** server -> shooter: what the shot did. */
  shotResult: Schemas.Map({ hitName: Schemas.String, dropped: Schemas.Int, reason: Schemas.String }),
  /** server -> the target: they were hit and lost coins on the spot. */
  wasShot: Schemas.Map({ byName: Schemas.String, lost: Schemas.Int }),
  /** server -> the picker: they collected a pile. */
  pickedUp: Schemas.Map({ amount: Schemas.Int }),

  outbid: Schemas.Map({ convoyId: Schemas.Int }),
  outbidLost: Schemas.Map({ byName: Schemas.String, rembourse: Schemas.Int, crateTier: Schemas.Int }),
  outbidWon: Schemas.Map({ fromName: Schemas.String, price: Schemas.Int, crateTier: Schemas.Int }),
  outbidFeed: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, price: Schemas.Int }),
  convoyArrived: Schemas.Map({ crateTier: Schemas.Int }),

  buySentry: Schemas.Map({}),
  sentryBought: Schemas.Map({ charges: Schemas.Int, cost: Schemas.Int }),
  sentryBlocked: Schemas.Map({ ownerName: Schemas.String, gelMs: Schemas.Int, left: Schemas.Int, lockSec: Schemas.Int }),
  sentryTriggered: Schemas.Map({ byName: Schemas.String, left: Schemas.Int }),

  giveItem: Schemas.Map({ ownerId: Schemas.String, slot: Schemas.Int }),
  gaveItem: Schemas.Map({ toName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  wasGifted: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  gifted: Schemas.Map({ byName: Schemas.String, toName: Schemas.String, rarity: Schemas.Int }),

  claimQuest: Schemas.Map({ slot: Schemas.Int }),

  dailyReward: Schemas.Map({ log: Schemas.Int, crate: Schemas.Int }),

  offlineEarnings: Schemas.Map({ gain: Schemas.Int, seconds: Schemas.Int }),

  buyFloor: Schemas.Map({}),
  floorBought: Schemas.Map({ floors: Schemas.Int, cost: Schemas.Int }),

  sellItem: Schemas.Map({ slot: Schemas.Int }),
  sold: Schemas.Map({ gain: Schemas.Int, rarity: Schemas.Int }),

  activateLock: Schemas.Map({}),
  reclaim: Schemas.Map({}),
  actionRejected: Schemas.Map({ action: Schemas.String, reason: Schemas.String, antiCheat: Schemas.Boolean }),
  youWereRobbed: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  thiefPenalty: Schemas.Map({ ms: Schemas.Int }),
  stolen: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  reclaimed: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, rarity: Schemas.Int }),

  crateBroken: Schemas.Map({
    rarity: Schemas.Int,
    byId: Schemas.String,
    byName: Schemas.String
  })
} as const

export const room = registerMessages(MESSAGES)
