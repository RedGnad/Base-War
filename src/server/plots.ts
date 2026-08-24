import { engine, Transform, PlayerIdentityData, AvatarBase, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import {
  Plot, MAX_BASES_AFFICHEES, PLOT_MAX_ITEMS, openFloors, openSlots,
  coutRebirth, REBIRTH_MAX, prestigeTier, incomeMultiplier, snapToGrid, invalidReason, SCENE_SIDE, floorPrice, MAX_FLOORS, LOCK_COOLDOWN_MS, OFFLINE_RATE, OFFLINE_CAP_MS, OFFLINE_CAP_PRODUCTION_S, PENDING_CAP_S, DAILY_REWARDS,
  MOVE_COOLDOWN_MS, RESELL_SECONDS, SENTRY_CHARGES, SENTRY_SECONDS, SENTRY_MIN_PRICE, crowdBonus
} from '../shared/schemas'
import { INCOME_PER_RARITY } from './loot'
import { itemIncome, rarityOf } from '../shared/loot-table'
import { log, flushLog } from './log'
import { QUESTS, QUEST_CRATE, QUEST_BONUS_CRATE, questsOfDay, QuestType } from '../shared/quests'
import { hasSomethingToRecover } from './theft'
import { room } from '../shared/messages'

const BASE_KEY = (a: string) => `base:${a}`
const PLAYER_KEY = 'profile'
const SAUVE_MS = 5000

type Base = {
  address: string
  name: string
  items: number[]
  x: number          // player-chosen position
  z: number
  entity: ReturnType<typeof engine.addEntity>
  lastSeen: number
}
type Profil = {
  coins: number
  items: number[]
  crates?: number[]
  itemsFound?: number
  rebirths?: number
  floorsBought?: number
  lockEnds?: number
  vuA?: number
  pending?: number
  lastDay?: number
  streak?: number
  sentries?: number
  given?: number
  received?: number
  tuto?: number
  questDay?: number
  questProgress?: number[]
  questsClaimed?: number[]
  vus?: number[]
  x?: number
  z?: number
  lastMove?: number
  alerts?: object[]
}

const bases = new Map<string, Base>()
const profiles = new Map<string, Profil>()
const dirtyBases = new Set<string>()
const dirtyProfiles = new Set<string>()


function nameOf(address: string): string {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() === address) return AvatarBase.getOrNull(e)?.name ?? address.slice(0, 8)
  }
  return address.slice(0, 8)
}

export function presents(): Set<string> {
  const s = new Set<string>()
  for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    const a = id.address?.toLowerCase()
    if (a) s.add(a)
  }
  return s
}

function arrange(items: number[]): number[] {
  return [...items]
}

function publish(b: Base, ici?: Set<string>): void {
  const c = Plot.getMutableOrNull(b.entity)
  if (c === null) return
  const pr = profiles.get(b.address)
  c.floors = openFloors(pr?.floorsBought ?? 0)
  c.rebirths = pr?.rebirths ?? 0
  c.ownerId = b.address
  c.ownerName = b.name
  c.items = arrange(b.items)
  c.ownerPresent = (ici ?? presents()).has(b.address)
  c.given = pr?.given ?? 0
  c.received = pr?.received ?? 0
  c.sentries = pr?.sentries ?? 0
}

function createBase(address: string, name: string, items: number[], lastSeen: number, x: number, z: number): Base | null {
  try {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, 0, z) })
  Plot.create(e, { floors: 1, rebirths: 0, index: 0, ownerId: address, ownerName: name, items: arrange(items), ownerPresent: false, lockedUntil: 0 })
  syncEntity(e, [Plot.componentId, Transform.componentId])
  const b: Base = { address, name, items: [...items], x, z, entity: e, lastSeen }
  bases.set(address, b)
  publish(b)
  return b
  } catch (err) {
    log(`createBase A JETE pour ${address.slice(0, 8)}: ${err}`)
    return null
  }
}

function removeBase(address: string): void {
  const b = bases.get(address)
  if (!b) return
  engine.removeEntity(b.entity)
  bases.delete(address)
}

async function loadBases(): Promise<void> {
  try {
    const res = await Storage.getValues({ prefix: 'base:' })
    const loaded = res.data
      .map(({ key, value }) => {
        const v = typeof value === 'string' ? JSON.parse(value) : (value as any)
        return {
          address: key.slice('base:'.length), name: v.name ?? '', items: v.items ?? [],
          lastSeen: v.lastSeen ?? 0, x: v.x, z: v.z
        }
      })
      .filter((l) => typeof l.x === 'number' && typeof l.z === 'number')
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, MAX_BASES_AFFICHEES)
    for (const l of loaded) createBase(l.address, l.name, l.items, l.lastSeen, l.x, l.z)
    log(`${loaded.length} of ${res.pagination.total} bases restored`)
  } catch (e) {
    log(`ERROR could not read bases: ${e}`)
  }
}

async function save(): Promise<void> {
  for (const a of [...dirtyBases]) {
    dirtyBases.delete(a)
    const b = bases.get(a)
    if (!b) continue
    const ok = await Storage.set(BASE_KEY(a), JSON.stringify({ name: b.name, items: b.items, lastSeen: b.lastSeen, x: b.x, z: b.z }))
    if (!ok) { log(`ERROR base save failed ${a}`); dirtyBases.add(a) }
  }
  for (const a of [...dirtyProfiles]) {
    dirtyProfiles.delete(a)
    const p = profiles.get(a)
    if (!p) continue
    const ok = await Storage.player.set(a, PLAYER_KEY, JSON.stringify(p))
    if (!ok) { log(`ERROR profile save failed ${a}`); dirtyProfiles.add(a) }
  }
}

export async function accueillir(address: string): Promise<void> {
  const raw = await Storage.player.get<string>(address, PLAYER_KEY)
  const stocke: Profil | null = raw ? JSON.parse(raw) : null
  const items = stocke?.items ?? []
  // Spread the stored profile, then override only the exceptions. A whitelist of fields
  // silently drops everything added to the type later, and the failure is invisible.
  const profile: Profil = {
    ...(stocke ?? {}),
    coins: stocke?.coins ?? 0,
    items: [...items],
    crates: stocke?.crates ?? [],
    itemsFound: stocke?.itemsFound ?? items.length,
    floorsBought: stocke?.floorsBought ?? 0,
    rebirths: stocke?.rebirths ?? 0,
    alerts: stocke?.alerts ?? []
  }
  profiles.set(address, profile)
  dirtyProfiles.add(address)

  const name = nameOf(address)
  if (!bases.has(address) && profile.x !== undefined && profile.z !== undefined) {
    const b = createBase(address, name, items, Date.now(), profile.x, profile.z)
    if (b !== null) { dirtyBases.add(address); log(`base de ${name} reposee en ${profile.x},${profile.z}`) }
  }
  const existing = bases.get(address)
  if (existing) {
    existing.name = name
    existing.items = [...items]
    existing.lastSeen = Date.now()
    dirtyBases.add(address)
    publish(existing)
    log(`${name} found their base at ${existing.x},${existing.z}`)
    return
  }

  if (!bases.has(address)) log(`${name} arrive sans base posee`)
}

export function auRevoir(address: string): void {
  const b = bases.get(address)
  if (!b) return
  b.lastSeen = Date.now()
  dirtyBases.add(address)
  publish(b)
  log(`${b.name} left; base stays visible and raidable`)
}

export async function placeItem(address: string, rarity: number): Promise<boolean> {
  const profile = profiles.get(address)
  if (!profile) return false
  const open = openSlots(profile.floorsBought ?? 0)
  const b = bases.get(address)
  if (profile.items.length >= open) {
    log(`base de ${b?.name ?? address.slice(0, 8)} pleine (${open} places open)`)
    return false
  }
  profile.items.push(rarity)
  profile.itemsFound = (profile.itemsFound ?? 0) + 1
  dirtyProfiles.add(address)
  if (b) { b.items = [...profile.items]; dirtyBases.add(address); publish(b) }
  log(`rarity ${rarity} posee par ${address.slice(0, 8)} (${profile.items.length} items)`)
  return true
}

export function coinsOf(address: string): number { return Math.floor(profiles.get(address)?.coins ?? 0) }

export type BaseView = { address: string; name: string; items: number[]; entity: ReturnType<typeof engine.addEntity> }

export function basesProches(p: Vector3, range: number, sauf: string): BaseView[] {
  const out: BaseView[] = []
  for (const b of bases.values()) {
    if (b.address === sauf) continue
    const t = Transform.getOrNull(b.entity)
    if (t === null) continue
    if (Vector3.distance(p, Vector3.create(t.position.x, t.position.y, t.position.z)) > range) continue
    out.push({ address: b.address, name: b.name, items: b.items, entity: b.entity })
  }
  return out
}

export function lockOf(address: string): number {
  const b = bases.get(address)
  if (!b) return 0
  return Plot.getOrNull(b.entity)?.lockedUntil ?? 0
}

export function setLock(address: string, until: number): boolean {
  const b = bases.get(address)
  if (!b) return false
  const c = Plot.getMutableOrNull(b.entity)
  if (c === null) return false
  c.lockedUntil = until
  const p = profiles.get(address)
  if (p) { p.lockEnds = until; dirtyProfiles.add(address) }
  dirtyBases.add(address)
  return true
}

export function lockCooldown(address: string): number {
  const p = profiles.get(address)
  if (!p || p.lockEnds === undefined) return 0
  const ready = p.lockEnds + LOCK_COOLDOWN_MS
  return Math.max(0, ready - Date.now())
}

export function removeItem(address: string, index: number): number | null {
  const b = bases.get(address)
  if (!b || index < 0 || index >= b.items.length) return null
  const [r] = b.items.splice(index, 1)
  const prof = profiles.get(address)
  if (prof) { prof.items = [...b.items]; dirtyProfiles.add(address) }
  dirtyBases.add(address)
  publish(b)
  return r
}

export type RangementResultat = 'expose' | 'en-stock' | 'plein'

export function etatPrevisible(address: string): RangementResultat {
  const prof = profiles.get(address)
  if (!prof) return 'plein'
  if (prof.items.length >= openSlots(prof.floorsBought ?? 0)) return 'plein'
  return bases.has(address) ? 'expose' : 'en-stock'
}

export function addItem(address: string, rarity: number): RangementResultat {
  const prof = profiles.get(address)
  if (!prof) return 'plein'
  if (!(prof.vus ?? []).includes(rarity)) {
    prof.vus = [...(prof.vus ?? []), rarity]
    dirtyProfiles.add(address)
  }
  if (prof.items.length >= openSlots(prof.floorsBought ?? 0)) return 'plein'
  prof.items.push(rarity)
  dirtyProfiles.add(address)
  const b = bases.get(address)
  if (!b) return 'en-stock'
  b.items = [...prof.items]
  dirtyBases.add(address)
  publish(b)
  return 'expose'
}

function todayKey(): number {
  const d = new Date()
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

function questState(address: string): Profil | null {
  const p = profiles.get(address)
  if (!p) return null
  const k = todayKey()
  if (p.questDay !== k) {
    p.questDay = k
    p.questProgress = [0, 0, 0]
    p.questsClaimed = [0, 0, 0, 0]   // 4th flag is the all-three bonus
    dirtyProfiles.add(address)
  }
  return p
}

export function advanceQuest(address: string, type: QuestType, n = 1): void {
  const p = questState(address)
  if (!p || n <= 0) return
  const ids = questsOfDay(p.questDay ?? 0)
  const prog = [...(p.questProgress ?? [0, 0, 0])]
  let touche = false
  for (let i = 0; i < ids.length; i++) {
    const q = QUESTS[ids[i]]
    if (q.type !== type) continue
    if (prog[i] >= q.cible) continue
    prog[i] = Math.min(prog[i] + n, q.cible)
    touche = true
  }
  if (!touche) return
  p.questProgress = prog
  dirtyProfiles.add(address)
}

export type QuestState = {
  ids: number[]; progres: number[]; cibles: number[]; pris: number[]
  log: number; streak: number; dayClaimed: boolean
}

export function questStateOf(address: string): QuestState | null {
  const p = questState(address)
  if (!p) return null
  const ids = questsOfDay(p.questDay ?? 0)
  return {
    ids,
    progres: [...(p.questProgress ?? [0, 0, 0])],
    cibles: ids.map((i) => QUESTS[i].cible),
    pris: [...(p.questsClaimed ?? [0, 0, 0, 0])],
    log: p.streak ?? 1,
    streak: p.streak ?? 1,
    dayClaimed: p.lastDay === todayKey()
  }
}

export function claimQuestReward(address: string, slot: number): { crate: number } | { error: string } {
  const p = questState(address)
  if (!p) return { error: 'unknown profile' }
  const pris = [...(p.questsClaimed ?? [0, 0, 0, 0])]
  if (slot < 0 || slot > 3) return { error: 'no such quest' }
  if (pris[slot] === 1) return { error: 'already claimed' }

  const ids = questsOfDay(p.questDay ?? 0)
  const prog = p.questProgress ?? [0, 0, 0]

  if (slot === 3) {
    for (let i = 0; i < ids.length; i++) if (prog[i] < QUESTS[ids[i]].cible) return { error: 'finish all three first' }
  } else if (prog[slot] < QUESTS[ids[slot]].cible) {
    return { error: 'not finished yet' }
  }

  const crate = slot === 3 ? QUEST_BONUS_CRATE : QUEST_CRATE
  pris[slot] = 1
  p.questsClaimed = pris
  p.crates = [...(p.crates ?? []), crate]
  dirtyProfiles.add(address)
  log(`${nameOf(address)} claimed quest ${slot}: crate ${crate}`)
  return { crate }
}

export function pushQuests(address: string): void {
  const q = questStateOf(address)
  if (q === null) return
  void room.send('quests', {
    ids: q.ids, progres: q.progres, cibles: q.cibles, pris: q.pris,
    log: q.log, dayClaimed: q.dayClaimed
  }, { to: [address] })
}

export function displayName(address: string): string {
  return bases.get(address)?.name ?? nameOf(address)
}

export function storeAlert(victim: string, alert: object): void {
  const prof = profiles.get(victim)
  if (prof) {
    prof.alerts = [...(prof.alerts ?? []), alert]
    dirtyProfiles.add(victim)
    return
  }
  void (async () => {
    const raw = await Storage.player.get<string>(victim, PLAYER_KEY)
    const p = raw ? JSON.parse(raw) : { coins: 0, items: [] }
    p.alerts = [...(p.alerts ?? []), alert]
    const ok = await Storage.player.set(victim, PLAYER_KEY, JSON.stringify(p))
    if (!ok) log(`ERROR deferred alert lost for ${victim.slice(0, 8)}`)
  })()
}

export function takeAlerts(address: string): object[] {
  const prof = profiles.get(address)
  if (!prof) return []
  const a = prof.alerts ?? []
  prof.alerts = []
  if (a.length > 0) dirtyProfiles.add(address)
  return a
}
export function giftItem(giver: string, receiver: string, slot: number): { ok: boolean; reason?: string; code?: number } {
  if (giver === receiver) return { ok: false, reason: 'that is your own base' }
  const bd = bases.get(giver)
  const br = bases.get(receiver)
  if (!bd) return { ok: false, reason: 'you have no base' }
  if (!br) return { ok: false, reason: 'they have no base' }
  if (slot < 0 || slot >= bd.items.length) return { ok: false, reason: 'no such item' }

  const pr = profiles.get(receiver)
  const placesR = openSlots(pr?.floorsBought ?? 0)
  if (br.items.length >= placesR) return { ok: false, reason: 'their base is full' }

  const code = removeItem(giver, slot)
  if (code === null) return { ok: false, reason: 'no such item' }

  br.items = [...br.items, code]
  if (pr) { pr.items = [...br.items]; dirtyProfiles.add(receiver) }
  dirtyBases.add(receiver)
  publish(br)

  const pd = profiles.get(giver)
  if (pd) { pd.given = (pd.given ?? 0) + 1; dirtyProfiles.add(giver) }
  if (pr) { pr.received = (pr.received ?? 0) + 1; dirtyProfiles.add(receiver) }
  storeAlert(receiver, { type: 'gift', byName: displayName(giver), code })
  log(`${displayName(giver)} gifted an item to ${displayName(receiver)}`)
  return { ok: true, code }
}

export function socialDe(address: string): { given: number; received: number } {
  const p = profiles.get(address)
  return { given: p?.given ?? 0, received: p?.received ?? 0 }
}

export function sentryPrice(address: string): number {
  return Math.max(SENTRY_MIN_PRICE, Math.floor(incomePerSecond(address) * SENTRY_SECONDS))
}

export function buySentryFor(address: string): { ok: boolean; reason?: string; charges?: number; cost?: number } {
  const p = profiles.get(address)
  if (!p) return { ok: false, reason: 'unknown profile' }
  if (!bases.has(address)) return { ok: false, reason: 'place your base first' }
  if ((p.sentries ?? 0) >= SENTRY_CHARGES) return { ok: false, reason: 'sentry already full' }
  const cost = sentryPrice(address)
  if (p.coins < cost) return { ok: false, reason: `you need ${Math.ceil(cost - p.coins)} more coins` }
  p.coins -= cost
  p.sentries = SENTRY_CHARGES
  dirtyProfiles.add(address)
  const b = bases.get(address)
  if (b) publish(b)
  log(`${displayName(address)} armed a sentry (${cost})`)
  return { ok: true, charges: SENTRY_CHARGES, cost }
}

export function useSentryCharge(address: string): boolean {
  const p = profiles.get(address)
  if (!p || (p.sentries ?? 0) <= 0) return false
  p.sentries = (p.sentries ?? 0) - 1
  dirtyProfiles.add(address)
  const b = bases.get(address)
  if (b) publish(b)
  return true
}

export function sentriesOf(address: string): number { return profiles.get(address)?.sentries ?? 0 }

export function baseDe(address: string): Base | undefined { return bases.get(address) }
export function toutesLesBases(): Base[] { return [...bases.values()] }
export function tenterRebirth(address: string): { ok: boolean; reason?: string; prestige?: number; floors?: number } {
  const p = profiles.get(address)
  if (!p) return { ok: false, reason: 'unknown profile' }
  const prestige = p.rebirths ?? 0
  if (prestige >= REBIRTH_MAX) return { ok: false, reason: 'max prestige reached' }
  const exige = prestigeTier(prestige)
  if (p.coins < exige.cost) return { ok: false, reason: `you need ${Math.ceil(exige.cost - p.coins)} more coins` }

  const meilleur = p.items.length === 0 ? -1 : Math.max(...p.items.map(rarityOf))
  if (meilleur < exige.minRarity) {
    return { ok: false, reason: `you need an item of rarity ${exige.minRarity} or better` }
  }

  p.coins -= exige.cost
  const tries = [...p.items].sort((a, b) => b - a)
  p.items = tries.slice(0, exige.guard)
  p.rebirths = prestige + 1
  dirtyProfiles.add(address)
  const b = bases.get(address)
  if (b) { b.items = [...p.items]; dirtyBases.add(address); publish(b) }
  const et = openFloors(p.floorsBought ?? 0)
  log(`${b?.name ?? address.slice(0, 8)} franchit le prestige ${p.rebirths}: -${exige.cost} pieces, guard ${exige.guard} item(s), income x${exige.multiplier}, ${et} floors`)
  return { ok: true, prestige: p.rebirths, floors: et }
}

export function prestigeOf(address: string): number { return profiles.get(address)?.rebirths ?? 0 }
export function basePoints(sauf?: string): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = []
  for (const b of bases.values()) if (b.address !== sauf) out.push({ x: b.x, z: b.z })
  return out
}

export function placeBase(address: string, xb: number, zb: number): { ok: boolean; reason?: string } {
  const p = profiles.get(address)
  if (!p) return { ok: false, reason: 'unknown profile' }

  const x = snapToGrid(xb)
  const z = snapToGrid(zb)
  const mauvais = invalidReason(x, z, SCENE_SIDE, basePoints(address))
  if (mauvais !== null) return { ok: false, reason: mauvais }

  const previous = bases.get(address)
  if (previous) removeBase(address)

  const items = [...p.items]
  const b = createBase(address, nameOf(address), items, Date.now(), x, z)
  if (b === null) return { ok: false, reason: 'cannot build there' }
  p.x = x
  p.z = z
  dirtyBases.add(address)
  dirtyProfiles.add(address)
  log(`${b.name} placed a base at ${x},${z}${previous ? ` (deplacee from ${previous.x},${previous.z})` : ''}`)
  return { ok: true }
}

export function addCrate(address: string, crateTier: number): void {
  const p = profiles.get(address)
  if (!p) return
  p.crates = [...(p.crates ?? []), crateTier]
  dirtyProfiles.add(address)
}

export function removeCrate(address: string, crateTier: number): boolean {
  const p = profiles.get(address)
  if (!p) return false
  const b = [...(p.crates ?? [])]
  const i = b.indexOf(crateTier)
  if (i < 0) return false
  b.splice(i, 1)
  p.crates = b
  dirtyProfiles.add(address)
  return true
}

export function cratesOf(address: string): number[] {
  return [...(profiles.get(address)?.crates ?? [])]
}

export function spend(address: string, montant: number): boolean {
  const p = profiles.get(address)
  if (!p) return false
  if (montant > 0 && p.coins < montant) return false
  p.coins -= montant
  dirtyProfiles.add(address)
  return true
}

export function sellItemFromBase(address: string, index: number): { ok: boolean; gain?: number; reason?: string } {
  const p = profiles.get(address)
  const b = bases.get(address)
  if (!p || !b) return { ok: false, reason: 'no base' }
  if (index < 0 || index >= b.items.length) return { ok: false, reason: 'no such item' }
  const r = b.items[index]
  const gain = Math.round(itemIncome(r, INCOME_PER_RARITY) * RESELL_SECONDS * incomeMultiplier(p.rebirths ?? 0))
  b.items.splice(index, 1)
  p.items = [...b.items]
  p.coins += gain
  dirtyBases.add(address); dirtyProfiles.add(address)
  publish(b)
  log(`${b.name} sold a rarity ${r} for ${gain}`)
  return { ok: true, gain }
}

export function buyFloorFor(address: string): { ok: boolean; reason?: string; floors?: number; cost?: number } {
  const p = profiles.get(address)
  if (!p) return { ok: false, reason: 'no profile' }
  const actuels = 1 + (p.floorsBought ?? 0)
  if (actuels >= MAX_FLOORS) return { ok: false, reason: 'max floors reached' }
  const cost = floorPrice(actuels + 1)
  if (p.coins < cost) return { ok: false, reason: `need ${Math.ceil(cost - p.coins)} more coins` }

  p.coins -= cost
  p.floorsBought = (p.floorsBought ?? 0) + 1
  dirtyProfiles.add(address)
  const b = bases.get(address)
  if (b) { dirtyBases.add(address); publish(b) }
  const et = openFloors(p.floorsBought)
  log(`${b?.name ?? address.slice(0, 8)} achete l'floor ${et} pour ${cost}`)
  return { ok: true, floors: et, cost }
}

export function nextFloorPrice(address: string): number {
  const p = profiles.get(address)
  if (!p) return 0
  const actuels = 1 + (p.floorsBought ?? 0)
  return actuels >= MAX_FLOORS ? 0 : floorPrice(actuels + 1)
}

export function cashOfflineEarnings(address: string): { gain: number; seconds: number } | null {
  const p = profiles.get(address)
  if (!p || p.vuA === undefined) return null
  const elapsed = Math.min(Date.now() - p.vuA, OFFLINE_CAP_MS)
  if (elapsed < 60_000) return null          // least d'une minute: rien a annoncer

  let perSecond = 0
  for (const code of p.items) perSecond += itemIncome(code, INCOME_PER_RARITY)
  perSecond *= incomeMultiplier(p.rebirths ?? 0) * OFFLINE_RATE
  if (perSecond <= 0) return null

  const raw = perSecond * (elapsed / 1000)
  const cap = (perSecond / OFFLINE_RATE) * OFFLINE_CAP_PRODUCTION_S
  const gain = Math.floor(Math.min(raw, cap))
  if (gain <= 0) return null
  p.coins += gain
  p.vuA = Date.now()
  dirtyProfiles.add(address)
  log(`${nameOf(address)} cashed ${gain} offline (${Math.round(elapsed / 60000)} min at ${Math.round(OFFLINE_RATE * 100)}%)`)
  return { gain, seconds: Math.floor(elapsed / 1000) }
}

export function collectPending(address: string): number {
  const p = profiles.get(address)
  if (!p) return 0
  const r = Math.floor(p.pending ?? 0)
  if (r <= 0) return 0
  p.coins += r
  p.pending = 0
  dirtyProfiles.add(address)
  return r
}

/** Server-verified player position. Never trust a client-reported one. */
export function positionOf(address: string): Vector3 | null {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(e)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

export function incomePerSecond(address: string): number {
  const p = profiles.get(address)
  const b = bases.get(address)
  if (!p || !b) return 0
  let gain = 0
  for (const code of b.items) gain += itemIncome(code, INCOME_PER_RARITY)
  return gain * incomeMultiplier(p.rebirths ?? 0)
}

export function crediter(address: string, montant: number): void {
  const p = profiles.get(address)
  if (!p || montant <= 0) return
  p.coins += montant
  dirtyProfiles.add(address)
}

export function etapeTuto(address: string): number {
  const p = profiles.get(address)
  if (!p) return 0
  if (p.tuto !== undefined) return p.tuto
  let e = 0
  if (bases.has(address)) e = 1
  if (p.items.length > 0 || (p.itemsFound ?? 0) > 0) e = 2
  if (p.coins > 0) e = 3
  p.tuto = e
  dirtyProfiles.add(address)
  return e
}

export function avancerTuto(address: string): void {
  const p = profiles.get(address)
  if (!p) return
  p.tuto = (p.tuto ?? 0) + 1
  dirtyProfiles.add(address)
}

export function pendingOf(address: string): number {
  return Math.floor(profiles.get(address)?.pending ?? 0)
}

export function reclamerQuotidienne(address: string): { log: number; crate: number } | null {
  const p = profiles.get(address)
  if (!p) return null
  const d = new Date()
  const dayKey = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
  if (p.lastDay === dayKey) return null      // deja pris aujourd'hui

  const hier = new Date(Date.now() - 86400_000)
  const hierCle = hier.getUTCFullYear() * 10000 + (hier.getUTCMonth() + 1) * 100 + hier.getUTCDate()
  p.streak = p.lastDay === hierCle ? Math.min((p.streak ?? 0) + 1, 7) : 1
  p.lastDay = dayKey

  const crate = DAILY_REWARDS[p.streak - 1] ?? 0
  p.crates = [...(p.crates ?? []), crate]
  dirtyProfiles.add(address)
  log(`${nameOf(address)} claimed day ${p.streak} reward: crate ${crate}`)
  return { log: p.streak, crate }
}

export function moveItemTo(address: string, de: number, to: number): boolean {
  const p = profiles.get(address)
  const b = bases.get(address)
  if (!p || !b) return false
  const max = openSlots(p.floorsBought ?? 0)
  if (de < 0 || de >= b.items.length) return false
  if (to < 0 || to >= max) return false
  if (de === to) return false

  const it = [...b.items]
  if (to < it.length) {
    const t = it[de]; it[de] = it[to]; it[to] = t
  } else {
    const [obj] = it.splice(de, 1)
    it.push(obj)
  }
  b.items = it
  p.items = [...it]
  dirtyBases.add(address); dirtyProfiles.add(address)
  publish(b)
  return true
}

export function vusDe(address: string): number[] {
  return [...(profiles.get(address)?.vus ?? [])]
}

export function marquerSale(address: string): void {
  dirtyBases.add(address)
  const p = profiles.get(address); const b = bases.get(address)
  if (p && b) { p.items = [...b.items]; dirtyProfiles.add(address) }
  if (b) publish(b)
}

export function startPlots(): void {
  void loadBases()

  let acc = 0
  engine.addSystem((dt: number) => {
    acc += dt
    if (acc < 1) return
    const seconds = acc
    acc = 0
    const ici = presents()
    for (const [address, profile] of profiles) {
      if (!ici.has(address)) continue

      const base = bases.get(address)
      if (!base) continue

      let gain = 0
      for (const code of base.items) gain += itemIncome(code, INCOME_PER_RARITY)
      if (gain === 0) continue
      const perSecond = gain * incomeMultiplier(profile.rebirths ?? 0) * (1 + crowdBonus(ici.size))
      const cap = perSecond * PENDING_CAP_S
      profile.pending = Math.min((profile.pending ?? 0) + perSecond * seconds, cap)
      profile.vuA = Date.now()
      dirtyProfiles.add(address)
    }
  })

  timers.setInterval(() => { flushLog() }, 1000)
  timers.setInterval(() => {
    const ici = presents()
    for (const [address, p] of profiles) {
      if (!ici.has(address)) continue
      const prestige = p.rebirths ?? 0
      const next = prestige >= REBIRTH_MAX ? null : prestigeTier(prestige)
      const b = bases.get(address)
      let income = 0
      if (b) for (const code of b.items) income += itemIncome(code, INCOME_PER_RARITY)
      income = income * incomeMultiplier(prestige)
      const lock = b ? (Plot.getOrNull(b.entity)?.lockedUntil ?? 0) : 0
      void room.send('wallet', {
        income,
        basePosee: b !== undefined,
        lockSec: Math.max(0, Math.ceil((lock - Date.now()) / 1000)),
        floorPrice: nextFloorPrice(address),
        pending: pendingOf(address),
        rechargeSec: Math.ceil(lockCooldown(address) / 1000),
        canRecover: hasSomethingToRecover(address),
        coins: p.coins,
        nextPrestige: next ? next.cost : 0,
        prestige,
        minRarity: next ? next.minRarity : 0,
        multiplier: incomeMultiplier(prestige),
        tutoEtape: etapeTuto(address),
        sentries: p.sentries ?? 0,
        sentryPrice: sentryPrice(address),
        presents: ici.size,
        prime: crowdBonus(ici.size)
      }, { to: [address] })
      void room.send('inventory', { crates: [...(p.crates ?? [])] }, { to: [address] })
      void room.send('index', { vus: [...(p.vus ?? [])] }, { to: [address] })
      pushQuests(address)
    }
  }, 1500)

  timers.setInterval(() => { void save() }, SAUVE_MS)
  timers.setInterval(() => {
    const ici = presents()
    for (const b of bases.values()) publish(b, ici)
  }, 3000)
}
