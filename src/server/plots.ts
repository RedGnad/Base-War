import { engine, Transform, PlayerIdentityData, AvatarBase, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import {
  Plot, MAX_BASES_AFFICHEES, PLOT_MAX_OBJETS, etagesOuverts, placesOuvertes,
  coutRebirth, REBIRTH_MAX, paliers, multiplicateurRevenu, accrocher, raisonInvalide, prixEtage, ETAGES_MAX, VERROU_RECHARGE_MS, HORS_LIGNE_TAUX, HORS_LIGNE_PLAFOND_MS, HORS_LIGNE_PLAFOND_PRODUCTION_S, RESERVE_PLAFOND_S, RECOMPENSES_JOUR,
  DELAI_DEPLACEMENT_MS, REVENTE_SECONDES, SENTINELLE_CHARGES, SENTINELLE_SECONDES, SENTINELLE_MINIMUM, primePresence
} from '../shared/schemas'
import { GAIN_PAR_SECONDE } from './loot'
import { revenuObjet, rareteDe } from '../shared/loot-table'
import { jour, viderJournal } from './journal'
import { QUETES, QUETE_BOITE, QUETE_BONUS_BOITE, quetesDuJour, TypeQuete } from '../shared/quests'
import { aQuelqueChoseAReprendre } from './theft'
import { room } from '../shared/messages'

const CLE_BASE = (a: string) => `base:${a}`
const CLE_JOUEUR = 'profil'
const SAUVE_MS = 5000

type Base = {
  address: string
  name: string
  items: number[]
  x: number          // position CHOISIE par le joueur
  z: number
  entity: ReturnType<typeof engine.addEntity>
  lastSeen: number
}
type Profil = {
  coins: number
  items: number[]
  boites?: number[]
  collectes?: number
  rebirths?: number
  etagesAchetes?: number
  finVerrou?: number
  vuA?: number
  reserve?: number
  dernierJour?: number
  serie?: number
  sentinelles?: number
  donnes?: number
  recus?: number
  tuto?: number
  quetesJour?: number
  quetesProgres?: number[]
  quetesPrises?: number[]
  vus?: number[]
  x?: number
  z?: number
  dernierDeplacement?: number
  alertes?: object[]
}

const bases = new Map<string, Base>()
const profils = new Map<string, Profil>()
const basesSales = new Set<string>()
const profilsSales = new Set<string>()

const SCENE_COTE = 80

function nomDe(address: string): string {
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

function ranger(items: number[]): number[] {
  return [...items]
}

function publier(b: Base, ici?: Set<string>): void {
  const c = Plot.getMutableOrNull(b.entity)
  if (c === null) return
  const pr = profils.get(b.address)
  c.etages = etagesOuverts(pr?.etagesAchetes ?? 0)
  c.rebirths = pr?.rebirths ?? 0
  c.ownerId = b.address
  c.ownerName = b.name
  c.items = ranger(b.items)
  c.ownerPresent = (ici ?? presents()).has(b.address)
  c.donnes = pr?.donnes ?? 0
  c.recus = pr?.recus ?? 0
  c.sentinelles = pr?.sentinelles ?? 0
}

function creerBase(address: string, name: string, items: number[], lastSeen: number, x: number, z: number): Base | null {
  try {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, 0, z) })
  Plot.create(e, { etages: 1, rebirths: 0, index: 0, ownerId: address, ownerName: name, items: ranger(items), ownerPresent: false, lockedUntil: 0 })
  syncEntity(e, [Plot.componentId, Transform.componentId])
  const b: Base = { address, name, items: [...items], x, z, entity: e, lastSeen }
  bases.set(address, b)
  publier(b)
  return b
  } catch (err) {
    jour(`creerBase A JETE pour ${address.slice(0, 8)}: ${err}`)
    return null
  }
}

function retirerBase(address: string): void {
  const b = bases.get(address)
  if (!b) return
  engine.removeEntity(b.entity)
  bases.delete(address)
}

async function chargerBases(): Promise<void> {
  try {
    const res = await Storage.getValues({ prefix: 'base:' })
    const lues = res.data
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
    for (const l of lues) creerBase(l.address, l.name, l.items, l.lastSeen, l.x, l.z)
    jour(`${lues.length} bases restituees sur ${res.pagination.total} connues`)
  } catch (e) {
    jour(`ERREUR lecture des bases impossible: ${e}`)
  }
}

async function sauver(): Promise<void> {
  for (const a of [...basesSales]) {
    basesSales.delete(a)
    const b = bases.get(a)
    if (!b) continue
    const ok = await Storage.set(CLE_BASE(a), JSON.stringify({ name: b.name, items: b.items, lastSeen: b.lastSeen, x: b.x, z: b.z }))
    if (!ok) { jour(`ERREUR ECHEC sauvegarde base ${a}`); basesSales.add(a) }
  }
  for (const a of [...profilsSales]) {
    profilsSales.delete(a)
    const p = profils.get(a)
    if (!p) continue
    const ok = await Storage.player.set(a, CLE_JOUEUR, JSON.stringify(p))
    if (!ok) { jour(`ERREUR ECHEC sauvegarde profil ${a}`); profilsSales.add(a) }
  }
}

export async function accueillir(address: string): Promise<void> {
  const brut = await Storage.player.get<string>(address, CLE_JOUEUR)
  const stocke: Profil | null = brut ? JSON.parse(brut) : null
  const items = stocke?.items ?? []
  // Spread the stored profile, then override only the exceptions. A whitelist of fields
  // silently drops everything added to the type later, and the failure is invisible.
  const profil: Profil = {
    ...(stocke ?? {}),
    coins: stocke?.coins ?? 0,
    items: [...items],
    boites: stocke?.boites ?? [],
    collectes: stocke?.collectes ?? items.length,
    etagesAchetes: stocke?.etagesAchetes ?? 0,
    rebirths: stocke?.rebirths ?? 0,
    alertes: stocke?.alertes ?? []
  }
  profils.set(address, profil)
  profilsSales.add(address)

  const name = nomDe(address)
  if (!bases.has(address) && profil.x !== undefined && profil.z !== undefined) {
    const b = creerBase(address, name, items, Date.now(), profil.x, profil.z)
    if (b !== null) { basesSales.add(address); jour(`base de ${name} reposee en ${profil.x},${profil.z}`) }
  }
  const dejala = bases.get(address)
  if (dejala) {
    dejala.name = name
    dejala.items = [...items]
    dejala.lastSeen = Date.now()
    basesSales.add(address)
    publier(dejala)
    jour(`${name} retrouve sa base en ${dejala.x},${dejala.z}`)
    return
  }

  if (!bases.has(address)) jour(`${name} arrive sans base posee`)
}

export function auRevoir(address: string): void {
  const b = bases.get(address)
  if (!b) return
  b.lastSeen = Date.now()
  basesSales.add(address)
  publier(b)
  jour(`${b.name} est parti, sa base reste affichee et pillable`)
}

export async function poserObjet(address: string, rarity: number): Promise<boolean> {
  const profil = profils.get(address)
  if (!profil) return false
  const ouvertes = placesOuvertes(profil.etagesAchetes ?? 0)
  const b = bases.get(address)
  if (profil.items.length >= ouvertes) {
    jour(`base de ${b?.name ?? address.slice(0, 8)} pleine (${ouvertes} places ouvertes)`)
    return false
  }
  profil.items.push(rarity)
  profil.collectes = (profil.collectes ?? 0) + 1
  profilsSales.add(address)
  if (b) { b.items = [...profil.items]; basesSales.add(address); publier(b) }
  jour(`rarete ${rarity} posee par ${address.slice(0, 8)} (${profil.items.length} objets)`)
  return true
}

export function coinsDe(address: string): number { return Math.floor(profils.get(address)?.coins ?? 0) }

export type BaseVue = { address: string; name: string; items: number[]; entity: ReturnType<typeof engine.addEntity> }

export function basesProches(p: Vector3, portee: number, sauf: string): BaseVue[] {
  const out: BaseVue[] = []
  for (const b of bases.values()) {
    if (b.address === sauf) continue
    const t = Transform.getOrNull(b.entity)
    if (t === null) continue
    if (Vector3.distance(p, Vector3.create(t.position.x, t.position.y, t.position.z)) > portee) continue
    out.push({ address: b.address, name: b.name, items: b.items, entity: b.entity })
  }
  return out
}

export function verrouDe(address: string): number {
  const b = bases.get(address)
  if (!b) return 0
  return Plot.getOrNull(b.entity)?.lockedUntil ?? 0
}

export function poserVerrou(address: string, jusqua: number): boolean {
  const b = bases.get(address)
  if (!b) return false
  const c = Plot.getMutableOrNull(b.entity)
  if (c === null) return false
  c.lockedUntil = jusqua
  const p = profils.get(address)
  if (p) { p.finVerrou = jusqua; profilsSales.add(address) }
  basesSales.add(address)
  return true
}

export function rechargeVerrou(address: string): number {
  const p = profils.get(address)
  if (!p || p.finVerrou === undefined) return 0
  const pret = p.finVerrou + VERROU_RECHARGE_MS
  return Math.max(0, pret - Date.now())
}

export function retirerObjet(address: string, index: number): number | null {
  const b = bases.get(address)
  if (!b || index < 0 || index >= b.items.length) return null
  const [r] = b.items.splice(index, 1)
  const prof = profils.get(address)
  if (prof) { prof.items = [...b.items]; profilsSales.add(address) }
  basesSales.add(address)
  publier(b)
  return r
}

export type RangementResultat = 'expose' | 'en-stock' | 'plein'

export function etatPrevisible(address: string): RangementResultat {
  const prof = profils.get(address)
  if (!prof) return 'plein'
  if (prof.items.length >= placesOuvertes(prof.etagesAchetes ?? 0)) return 'plein'
  return bases.has(address) ? 'expose' : 'en-stock'
}

export function ajouterObjet(address: string, rarity: number): RangementResultat {
  const prof = profils.get(address)
  if (!prof) return 'plein'
  if (!(prof.vus ?? []).includes(rarity)) {
    prof.vus = [...(prof.vus ?? []), rarity]
    profilsSales.add(address)
  }
  if (prof.items.length >= placesOuvertes(prof.etagesAchetes ?? 0)) return 'plein'
  prof.items.push(rarity)
  profilsSales.add(address)
  const b = bases.get(address)
  if (!b) return 'en-stock'
  b.items = [...prof.items]
  basesSales.add(address)
  publier(b)
  return 'expose'
}

function cleDuJour(): number {
  const d = new Date()
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

function quetesDuProfil(address: string): Profil | null {
  const p = profils.get(address)
  if (!p) return null
  const k = cleDuJour()
  if (p.quetesJour !== k) {
    p.quetesJour = k
    p.quetesProgres = [0, 0, 0]
    p.quetesPrises = [0, 0, 0, 0]   // le 4e drapeau est le bonus des trois
    profilsSales.add(address)
  }
  return p
}

export function avancerQuete(address: string, type: TypeQuete, n = 1): void {
  const p = quetesDuProfil(address)
  if (!p || n <= 0) return
  const ids = quetesDuJour(p.quetesJour ?? 0)
  const prog = [...(p.quetesProgres ?? [0, 0, 0])]
  let touche = false
  for (let i = 0; i < ids.length; i++) {
    const q = QUETES[ids[i]]
    if (q.type !== type) continue
    if (prog[i] >= q.cible) continue
    prog[i] = Math.min(prog[i] + n, q.cible)
    touche = true
  }
  if (!touche) return
  p.quetesProgres = prog
  profilsSales.add(address)
}

export type EtatQuetes = {
  ids: number[]; progres: number[]; cibles: number[]; pris: number[]
  jour: number; serie: number; jourPris: boolean
}

export function etatQuetes(address: string): EtatQuetes | null {
  const p = quetesDuProfil(address)
  if (!p) return null
  const ids = quetesDuJour(p.quetesJour ?? 0)
  return {
    ids,
    progres: [...(p.quetesProgres ?? [0, 0, 0])],
    cibles: ids.map((i) => QUETES[i].cible),
    pris: [...(p.quetesPrises ?? [0, 0, 0, 0])],
    jour: p.serie ?? 1,
    serie: p.serie ?? 1,
    jourPris: p.dernierJour === cleDuJour()
  }
}

export function reclamerQuete(address: string, slot: number): { boite: number } | { erreur: string } {
  const p = quetesDuProfil(address)
  if (!p) return { erreur: 'unknown profile' }
  const pris = [...(p.quetesPrises ?? [0, 0, 0, 0])]
  if (slot < 0 || slot > 3) return { erreur: 'no such quest' }
  if (pris[slot] === 1) return { erreur: 'already claimed' }

  const ids = quetesDuJour(p.quetesJour ?? 0)
  const prog = p.quetesProgres ?? [0, 0, 0]

  if (slot === 3) {
    for (let i = 0; i < ids.length; i++) if (prog[i] < QUETES[ids[i]].cible) return { erreur: 'finish all three first' }
  } else if (prog[slot] < QUETES[ids[slot]].cible) {
    return { erreur: 'not finished yet' }
  }

  const boite = slot === 3 ? QUETE_BONUS_BOITE : QUETE_BOITE
  pris[slot] = 1
  p.quetesPrises = pris
  p.boites = [...(p.boites ?? []), boite]
  profilsSales.add(address)
  jour(`${nomDe(address)} encaisse la quete ${slot}: boite ${boite}`)
  return { boite }
}

export function pousserQuetes(address: string): void {
  const q = etatQuetes(address)
  if (q === null) return
  void room.send('quests', {
    ids: q.ids, progres: q.progres, cibles: q.cibles, pris: q.pris,
    jour: q.jour, jourPris: q.jourPris
  }, { to: [address] })
}

export function nomAffiche(address: string): string {
  return bases.get(address)?.name ?? nomDe(address)
}

export function deposerAlerte(victime: string, alerte: object): void {
  const prof = profils.get(victime)
  if (prof) {
    prof.alertes = [...(prof.alertes ?? []), alerte]
    profilsSales.add(victime)
    return
  }
  void (async () => {
    const brut = await Storage.player.get<string>(victime, CLE_JOUEUR)
    const p = brut ? JSON.parse(brut) : { coins: 0, items: [] }
    p.alertes = [...(p.alertes ?? []), alerte]
    const ok = await Storage.player.set(victime, CLE_JOUEUR, JSON.stringify(p))
    if (!ok) jour(`ERREUR alerte differee perdue pour ${victime.slice(0, 8)}`)
  })()
}

export function retirerAlertes(address: string): object[] {
  const prof = profils.get(address)
  if (!prof) return []
  const a = prof.alertes ?? []
  prof.alertes = []
  if (a.length > 0) profilsSales.add(address)
  return a
}
export function offrirObjet(donneur: string, receveur: string, slot: number): { ok: boolean; raison?: string; code?: number } {
  if (donneur === receveur) return { ok: false, raison: 'that is your own base' }
  const bd = bases.get(donneur)
  const br = bases.get(receveur)
  if (!bd) return { ok: false, raison: 'you have no base' }
  if (!br) return { ok: false, raison: 'they have no base' }
  if (slot < 0 || slot >= bd.items.length) return { ok: false, raison: 'no such item' }

  const pr = profils.get(receveur)
  const placesR = placesOuvertes(pr?.etagesAchetes ?? 0)
  if (br.items.length >= placesR) return { ok: false, raison: 'their base is full' }

  const code = retirerObjet(donneur, slot)
  if (code === null) return { ok: false, raison: 'no such item' }

  br.items = [...br.items, code]
  if (pr) { pr.items = [...br.items]; profilsSales.add(receveur) }
  basesSales.add(receveur)
  publier(br)

  const pd = profils.get(donneur)
  if (pd) { pd.donnes = (pd.donnes ?? 0) + 1; profilsSales.add(donneur) }
  if (pr) { pr.recus = (pr.recus ?? 0) + 1; profilsSales.add(receveur) }
  deposerAlerte(receveur, { type: 'gift', byName: nomAffiche(donneur), code })
  jour(`${nomAffiche(donneur)} offre un objet a ${nomAffiche(receveur)}`)
  return { ok: true, code }
}

export function socialDe(address: string): { donnes: number; recus: number } {
  const p = profils.get(address)
  return { donnes: p?.donnes ?? 0, recus: p?.recus ?? 0 }
}

export function prixSentinelle(address: string): number {
  return Math.max(SENTINELLE_MINIMUM, Math.floor(revenuParSeconde(address) * SENTINELLE_SECONDES))
}

export function acheterSentinelle(address: string): { ok: boolean; raison?: string; charges?: number; cout?: number } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'unknown profile' }
  if (!bases.has(address)) return { ok: false, raison: 'place your base first' }
  if ((p.sentinelles ?? 0) >= SENTINELLE_CHARGES) return { ok: false, raison: 'sentry already full' }
  const cout = prixSentinelle(address)
  if (p.coins < cout) return { ok: false, raison: `you need ${Math.ceil(cout - p.coins)} more coins` }
  p.coins -= cout
  p.sentinelles = SENTINELLE_CHARGES
  profilsSales.add(address)
  const b = bases.get(address)
  if (b) publier(b)
  jour(`${nomAffiche(address)} arme sa sentinelle (${cout})`)
  return { ok: true, charges: SENTINELLE_CHARGES, cout }
}

export function consommerSentinelle(address: string): boolean {
  const p = profils.get(address)
  if (!p || (p.sentinelles ?? 0) <= 0) return false
  p.sentinelles = (p.sentinelles ?? 0) - 1
  profilsSales.add(address)
  const b = bases.get(address)
  if (b) publier(b)
  return true
}

export function sentinellesDe(address: string): number { return profils.get(address)?.sentinelles ?? 0 }

export function baseDe(address: string): Base | undefined { return bases.get(address) }
export function toutesLesBases(): Base[] { return [...bases.values()] }
export function tenterRebirth(address: string): { ok: boolean; raison?: string; palier?: number; etages?: number } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'unknown profile' }
  const palier = p.rebirths ?? 0
  if (palier >= REBIRTH_MAX) return { ok: false, raison: 'max prestige reached' }
  const exige = paliers(palier)
  if (p.coins < exige.cout) return { ok: false, raison: `you need ${Math.ceil(exige.cout - p.coins)} more coins` }

  const meilleur = p.items.length === 0 ? -1 : Math.max(...p.items.map(rareteDe))
  if (meilleur < exige.rareteMin) {
    return { ok: false, raison: `you need an item of rarity ${exige.rareteMin} or better` }
  }

  p.coins -= exige.cout
  const tries = [...p.items].sort((a, b) => b - a)
  p.items = tries.slice(0, exige.garde)
  p.rebirths = palier + 1
  profilsSales.add(address)
  const b = bases.get(address)
  if (b) { b.items = [...p.items]; basesSales.add(address); publier(b) }
  const et = etagesOuverts(p.etagesAchetes ?? 0)
  jour(`${b?.name ?? address.slice(0, 8)} franchit le palier ${p.rebirths}: -${exige.cout} pieces, garde ${exige.garde} objet(s), revenu x${exige.multiplicateur}, ${et} etages`)
  return { ok: true, palier: p.rebirths, etages: et }
}

export function paliersDe(address: string): number { return profils.get(address)?.rebirths ?? 0 }
export function positionsBases(sauf?: string): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = []
  for (const b of bases.values()) if (b.address !== sauf) out.push({ x: b.x, z: b.z })
  return out
}

export function poserBase(address: string, xb: number, zb: number): { ok: boolean; raison?: string } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'unknown profile' }

  const x = accrocher(xb)
  const z = accrocher(zb)
  const mauvais = raisonInvalide(x, z, SCENE_COTE, positionsBases(address))
  if (mauvais !== null) return { ok: false, raison: mauvais }

  const ancienne = bases.get(address)
  if (ancienne) retirerBase(address)

  const items = [...p.items]
  const b = creerBase(address, nomDe(address), items, Date.now(), x, z)
  if (b === null) return { ok: false, raison: 'cannot build there' }
  p.x = x
  p.z = z
  basesSales.add(address)
  profilsSales.add(address)
  jour(`${b.name} pose sa base en ${x},${z}${ancienne ? ` (deplacee depuis ${ancienne.x},${ancienne.z})` : ''}`)
  return { ok: true }
}

export function ajouterBoite(address: string, typeBoite: number): void {
  const p = profils.get(address)
  if (!p) return
  p.boites = [...(p.boites ?? []), typeBoite]
  profilsSales.add(address)
}

export function retirerBoite(address: string, typeBoite: number): boolean {
  const p = profils.get(address)
  if (!p) return false
  const b = [...(p.boites ?? [])]
  const i = b.indexOf(typeBoite)
  if (i < 0) return false
  b.splice(i, 1)
  p.boites = b
  profilsSales.add(address)
  return true
}

export function boitesDe(address: string): number[] {
  return [...(profils.get(address)?.boites ?? [])]
}

export function depenser(address: string, montant: number): boolean {
  const p = profils.get(address)
  if (!p) return false
  if (montant > 0 && p.coins < montant) return false
  p.coins -= montant
  profilsSales.add(address)
  return true
}

export function revendreObjet(address: string, index: number): { ok: boolean; gain?: number; raison?: string } {
  const p = profils.get(address)
  const b = bases.get(address)
  if (!p || !b) return { ok: false, raison: 'no base' }
  if (index < 0 || index >= b.items.length) return { ok: false, raison: 'no such item' }
  const r = b.items[index]
  const gain = Math.round(revenuObjet(r, GAIN_PAR_SECONDE) * REVENTE_SECONDES * multiplicateurRevenu(p.rebirths ?? 0))
  b.items.splice(index, 1)
  p.items = [...b.items]
  p.coins += gain
  basesSales.add(address); profilsSales.add(address)
  publier(b)
  jour(`${b.name} revend une rarete ${r} pour ${gain}`)
  return { ok: true, gain }
}

export function acheterEtage(address: string): { ok: boolean; raison?: string; etages?: number; cout?: number } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'no profile' }
  const actuels = 1 + (p.etagesAchetes ?? 0)
  if (actuels >= ETAGES_MAX) return { ok: false, raison: 'max floors reached' }
  const cout = prixEtage(actuels + 1)
  if (p.coins < cout) return { ok: false, raison: `need ${Math.ceil(cout - p.coins)} more coins` }

  p.coins -= cout
  p.etagesAchetes = (p.etagesAchetes ?? 0) + 1
  profilsSales.add(address)
  const b = bases.get(address)
  if (b) { basesSales.add(address); publier(b) }
  const et = etagesOuverts(p.etagesAchetes)
  jour(`${b?.name ?? address.slice(0, 8)} achete l'etage ${et} pour ${cout}`)
  return { ok: true, etages: et, cout }
}

export function prixProchainEtage(address: string): number {
  const p = profils.get(address)
  if (!p) return 0
  const actuels = 1 + (p.etagesAchetes ?? 0)
  return actuels >= ETAGES_MAX ? 0 : prixEtage(actuels + 1)
}

export function encaisserHorsLigne(address: string): { gain: number; secondes: number } | null {
  const p = profils.get(address)
  if (!p || p.vuA === undefined) return null
  const ecoule = Math.min(Date.now() - p.vuA, HORS_LIGNE_PLAFOND_MS)
  if (ecoule < 60_000) return null          // moins d'une minute: rien a annoncer

  let parSeconde = 0
  for (const code of p.items) parSeconde += revenuObjet(code, GAIN_PAR_SECONDE)
  parSeconde *= multiplicateurRevenu(p.rebirths ?? 0) * HORS_LIGNE_TAUX
  if (parSeconde <= 0) return null

  const brut = parSeconde * (ecoule / 1000)
  const plafond = (parSeconde / HORS_LIGNE_TAUX) * HORS_LIGNE_PLAFOND_PRODUCTION_S
  const gain = Math.floor(Math.min(brut, plafond))
  if (gain <= 0) return null
  p.coins += gain
  p.vuA = Date.now()
  profilsSales.add(address)
  jour(`${nomDe(address)} encaisse ${gain} hors ligne (${Math.round(ecoule / 60000)} min a ${Math.round(HORS_LIGNE_TAUX * 100)} %)`)
  return { gain, secondes: Math.floor(ecoule / 1000) }
}

export function collecter(address: string): number {
  const p = profils.get(address)
  if (!p) return 0
  const r = Math.floor(p.reserve ?? 0)
  if (r <= 0) return 0
  p.coins += r
  p.reserve = 0
  profilsSales.add(address)
  return r
}

/** Server-verified player position. Never trust a client-reported one. */
export function positionDe(address: string): Vector3 | null {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(e)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

export function revenuParSeconde(address: string): number {
  const p = profils.get(address)
  const b = bases.get(address)
  if (!p || !b) return 0
  let gain = 0
  for (const code of b.items) gain += revenuObjet(code, GAIN_PAR_SECONDE)
  return gain * multiplicateurRevenu(p.rebirths ?? 0)
}

export function crediter(address: string, montant: number): void {
  const p = profils.get(address)
  if (!p || montant <= 0) return
  p.coins += montant
  profilsSales.add(address)
}

export function etapeTuto(address: string): number {
  const p = profils.get(address)
  if (!p) return 0
  if (p.tuto !== undefined) return p.tuto
  let e = 0
  if (bases.has(address)) e = 1
  if (p.items.length > 0 || (p.collectes ?? 0) > 0) e = 2
  if (p.coins > 0) e = 3
  p.tuto = e
  profilsSales.add(address)
  return e
}

export function avancerTuto(address: string): void {
  const p = profils.get(address)
  if (!p) return
  p.tuto = (p.tuto ?? 0) + 1
  profilsSales.add(address)
}

export function reserveDe(address: string): number {
  return Math.floor(profils.get(address)?.reserve ?? 0)
}

export function reclamerQuotidienne(address: string): { jour: number; boite: number } | null {
  const p = profils.get(address)
  if (!p) return null
  const d = new Date()
  const jourCle = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
  if (p.dernierJour === jourCle) return null      // deja pris aujourd'hui

  const hier = new Date(Date.now() - 86400_000)
  const hierCle = hier.getUTCFullYear() * 10000 + (hier.getUTCMonth() + 1) * 100 + hier.getUTCDate()
  p.serie = p.dernierJour === hierCle ? Math.min((p.serie ?? 0) + 1, 7) : 1
  p.dernierJour = jourCle

  const boite = RECOMPENSES_JOUR[p.serie - 1] ?? 0
  p.boites = [...(p.boites ?? []), boite]
  profilsSales.add(address)
  jour(`${nomDe(address)} recoit sa recompense du jour ${p.serie}: boite ${boite}`)
  return { jour: p.serie, boite }
}

export function deplacerObjet(address: string, de: number, vers: number): boolean {
  const p = profils.get(address)
  const b = bases.get(address)
  if (!p || !b) return false
  const max = placesOuvertes(p.etagesAchetes ?? 0)
  if (de < 0 || de >= b.items.length) return false
  if (vers < 0 || vers >= max) return false
  if (de === vers) return false

  const it = [...b.items]
  if (vers < it.length) {
    const t = it[de]; it[de] = it[vers]; it[vers] = t
  } else {
    const [obj] = it.splice(de, 1)
    it.push(obj)
  }
  b.items = it
  p.items = [...it]
  basesSales.add(address); profilsSales.add(address)
  publier(b)
  return true
}

export function vusDe(address: string): number[] {
  return [...(profils.get(address)?.vus ?? [])]
}

export function marquerSale(address: string): void {
  basesSales.add(address)
  const p = profils.get(address); const b = bases.get(address)
  if (p && b) { p.items = [...b.items]; profilsSales.add(address) }
  if (b) publier(b)
}

export function startPlots(): void {
  void chargerBases()

  let acc = 0
  engine.addSystem((dt: number) => {
    acc += dt
    if (acc < 1) return
    const secondes = acc
    acc = 0
    const ici = presents()
    for (const [address, profil] of profils) {
      if (!ici.has(address)) continue

      const base = bases.get(address)
      if (!base) continue

      let gain = 0
      for (const code of base.items) gain += revenuObjet(code, GAIN_PAR_SECONDE)
      if (gain === 0) continue
      const parSeconde = gain * multiplicateurRevenu(profil.rebirths ?? 0) * (1 + primePresence(ici.size))
      const plafond = parSeconde * RESERVE_PLAFOND_S
      profil.reserve = Math.min((profil.reserve ?? 0) + parSeconde * secondes, plafond)
      profil.vuA = Date.now()
      profilsSales.add(address)
    }
  })

  timers.setInterval(() => { viderJournal() }, 1000)
  timers.setInterval(() => {
    const ici = presents()
    for (const [address, p] of profils) {
      if (!ici.has(address)) continue
      const palier = p.rebirths ?? 0
      const suivant = palier >= REBIRTH_MAX ? null : paliers(palier)
      const b = bases.get(address)
      let revenu = 0
      if (b) for (const code of b.items) revenu += revenuObjet(code, GAIN_PAR_SECONDE)
      revenu = revenu * multiplicateurRevenu(palier)
      const lock = b ? (Plot.getOrNull(b.entity)?.lockedUntil ?? 0) : 0
      void room.send('wallet', {
        revenu,
        basePosee: b !== undefined,
        verrouSec: Math.max(0, Math.ceil((lock - Date.now()) / 1000)),
        prixEtage: prixProchainEtage(address),
        reserve: reserveDe(address),
        rechargeSec: Math.ceil(rechargeVerrou(address) / 1000),
        aReprendre: aQuelqueChoseAReprendre(address),
        coins: p.coins,
        prochainPalier: suivant ? suivant.cout : 0,
        palier,
        rareteMin: suivant ? suivant.rareteMin : 0,
        multiplicateur: multiplicateurRevenu(palier),
        tutoEtape: etapeTuto(address),
        sentinelles: p.sentinelles ?? 0,
        prixSentinelle: prixSentinelle(address),
        presents: ici.size,
        prime: primePresence(ici.size)
      }, { to: [address] })
      void room.send('inventory', { boites: [...(p.boites ?? [])] }, { to: [address] })
      void room.send('index', { vus: [...(p.vus ?? [])] }, { to: [address] })
      pousserQuetes(address)
    }
  }, 1500)

  timers.setInterval(() => { void sauver() }, SAUVE_MS)
  timers.setInterval(() => {
    const ici = presents()
    for (const b of bases.values()) publier(b, ici)
  }, 3000)
}
