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
  hitRejected: Schemas.Map({ raison: Schemas.String, antiCheat: Schemas.Boolean }),
  serverLog: Schemas.Map({ line: Schemas.String }),

  stealItem: Schemas.Map({ ownerId: Schemas.String, slot: Schemas.Int }),
  wallet: Schemas.Map({ coins: Schemas.Float, prochainPalier: Schemas.Int, palier: Schemas.Int, rareteMin: Schemas.Int, multiplicateur: Schemas.Int, revenu: Schemas.Float, basePosee: Schemas.Boolean, verrouSec: Schemas.Int, aReprendre: Schemas.Boolean, prixEtage: Schemas.Int, rechargeSec: Schemas.Int, reserve: Schemas.Int, tutoEtape: Schemas.Int, sentinelles: Schemas.Int, prixSentinelle: Schemas.Int, presents: Schemas.Int, prime: Schemas.Float }),

  claimSlot: Schemas.Map({ x: Schemas.Float, z: Schemas.Float }),
  basePositions: Schemas.Map({ xs: Schemas.Array(Schemas.Float), zs: Schemas.Array(Schemas.Float) }),

  buyBelt: Schemas.Map({ articleId: Schemas.Int }),
  beltAlert: Schemas.Map({ typeBoite: Schemas.Int }),
  bought: Schemas.Map({ byName: Schemas.String, typeBoite: Schemas.Int, prix: Schemas.Int }),

  openBox: Schemas.Map({ typeBoite: Schemas.Int }),
  boxResult: Schemas.Map({ typeBoite: Schemas.Int, rarity: Schemas.Int, mutation: Schemas.Int, etat: Schemas.String }),
  inventory: Schemas.Map({ boites: Schemas.Array(Schemas.Int) }),

  rebirth: Schemas.Map({}),
  rebirthDone: Schemas.Map({ palier: Schemas.Int, etages: Schemas.Int }),

  moveItem: Schemas.Map({ de: Schemas.Int, vers: Schemas.Int }),

  index: Schemas.Map({ vus: Schemas.Array(Schemas.Int) }),

  collect: Schemas.Map({}),
  collected: Schemas.Map({ gain: Schemas.Int }),
  quests: Schemas.Map({
    ids: Schemas.Array(Schemas.Int), progres: Schemas.Array(Schemas.Int),
    cibles: Schemas.Array(Schemas.Int), pris: Schemas.Array(Schemas.Int),
    jour: Schemas.Int, jourPris: Schemas.Boolean
  }),
  tutorial: Schemas.Map({ etape: Schemas.Int, total: Schemas.Int }),
  timeGift: Schemas.Map({ boite: Schemas.Int, minutes: Schemas.Int }),

  outbid: Schemas.Map({ convoiId: Schemas.Int }),
  outbidLost: Schemas.Map({ byName: Schemas.String, rembourse: Schemas.Int, typeBoite: Schemas.Int }),
  outbidWon: Schemas.Map({ fromName: Schemas.String, prix: Schemas.Int, typeBoite: Schemas.Int }),
  outbidFeed: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, prix: Schemas.Int }),
  convoiArrived: Schemas.Map({ typeBoite: Schemas.Int }),

  buySentry: Schemas.Map({}),
  sentryBought: Schemas.Map({ charges: Schemas.Int, cout: Schemas.Int }),
  sentryBlocked: Schemas.Map({ ownerName: Schemas.String, gelMs: Schemas.Int, restant: Schemas.Int, verrouSec: Schemas.Int }),
  sentryTriggered: Schemas.Map({ byName: Schemas.String, restant: Schemas.Int }),

  giveItem: Schemas.Map({ ownerId: Schemas.String, slot: Schemas.Int }),
  gaveItem: Schemas.Map({ toName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  wasGifted: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  gifted: Schemas.Map({ byName: Schemas.String, toName: Schemas.String, rarity: Schemas.Int }),

  claimQuest: Schemas.Map({ slot: Schemas.Int }),

  dailyReward: Schemas.Map({ jour: Schemas.Int, boite: Schemas.Int }),

  offlineEarnings: Schemas.Map({ gain: Schemas.Int, secondes: Schemas.Int }),

  buyFloor: Schemas.Map({}),
  floorBought: Schemas.Map({ etages: Schemas.Int, cout: Schemas.Int }),

  sellItem: Schemas.Map({ slot: Schemas.Int }),
  sold: Schemas.Map({ gain: Schemas.Int, rarity: Schemas.Int }),

  activateLock: Schemas.Map({}),
  reclaim: Schemas.Map({}),
  actionRejected: Schemas.Map({ action: Schemas.String, raison: Schemas.String, antiCheat: Schemas.Boolean }),
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
