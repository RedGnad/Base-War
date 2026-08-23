import { engine, Transform, PlayerIdentityData, AvatarBase, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { Plot, MAX_BASES, PLOT_MAX_OBJETS, plotPosition } from '../shared/schemas'
import { GAIN_PAR_SECONDE } from './loot'
import { jour, viderJournal } from './journal'

/**
 * ALLOCATION DYNAMIQUE DES BASES.
 *
 * Motif copie des jeux de reference: une base par joueur, creee a l'arrivee, liberee au
 * depart. Aucun nombre fixe de places: le plafond est le rendu mobile (~100 bases), pas
 * une constante arbitraire.
 *
 * Qui appartient a qui:
 *  - le BUTIN d'un joueur vit dans SON stockage joueur -> autoritaire, jamais perdu
 *  - la BASE est une vue: creee tant qu'il est la, conservee un temps quand il part
 *    (c'est elle que les autres peuvent piller en son absence, et c'est ce qui
 *     empeche un visiteur seul de trouver un lieu vide)
 */

const CLE_BASE = (a: string) => `base:${a}`
const CLE_JOUEUR = 'profil'
const SAUVE_MS = 5000

type Base = {
  address: string
  name: string
  items: number[]
  place: number      // index de position sur les anneaux
  entity: ReturnType<typeof engine.addEntity>
  lastSeen: number
}
type Profil = { coins: number; items: number[] }

const bases = new Map<string, Base>()
const profils = new Map<string, Profil>()
const placesLibres: number[] = []
const basesSales = new Set<string>()
const profilsSales = new Set<string>()

for (let i = 0; i < MAX_BASES; i++) placesLibres.push(i)

function nomDe(address: string): string {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() === address) return AvatarBase.getOrNull(e)?.name ?? address.slice(0, 8)
  }
  return address.slice(0, 8)
}

function presents(): Set<string> {
  const s = new Set<string>()
  for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    const a = id.address?.toLowerCase()
    if (a) s.add(a)
  }
  return s
}

function publier(b: Base, ici?: Set<string>): void {
  const c = Plot.getMutableOrNull(b.entity)
  if (c === null) return
  c.index = b.place
  c.ownerId = b.address
  c.ownerName = b.name
  c.items = [...b.items]
  c.ownerPresent = (ici ?? presents()).has(b.address)
}

/** Cree la base d'un joueur. Retourne null si le lieu affiche deja son maximum. */
function creerBase(address: string, name: string, items: number[], lastSeen: number): Base | null {
  const place = placesLibres.shift()
  if (place === undefined) { jour(`creerBase: aucune place libre pour ${address.slice(0, 8)}`); return null }
  try {
  const e = engine.addEntity()
  const p = plotPosition(place)
  Transform.create(e, { position: Vector3.create(p.x, 0, p.z) })
  Plot.create(e, { index: place, ownerId: address, ownerName: name, items: [...items], ownerPresent: false, lockedUntil: 0 })
  syncEntity(e, [Plot.componentId, Transform.componentId])
  const b: Base = { address, name, items: [...items], place, entity: e, lastSeen }
  bases.set(address, b)
  publier(b)
  return b
  } catch (err) {
    jour(`creerBase A JETE pour ${address.slice(0, 8)}: ${err}`)
    placesLibres.unshift(place)
    return null
  }
}

function retirerBase(address: string): void {
  const b = bases.get(address)
  if (!b) return
  engine.removeEntity(b.entity)
  placesLibres.push(b.place)
  placesLibres.sort((x, y) => x - y)
  bases.delete(address)
}

/**
 * Au demarrage: on restitue les bases connues, les plus recentes d'abord.
 * `Storage.getValues({ prefix })` n'est documente nulle part (trouve dans les typages).
 */
async function chargerBases(): Promise<void> {
  try {
    const res = await Storage.getValues({ prefix: 'base:' })
    const lues = res.data
      .map(({ key, value }) => {
        const v = typeof value === 'string' ? JSON.parse(value) : (value as any)
        return { address: key.slice('base:'.length), name: v.name ?? '', items: v.items ?? [], lastSeen: v.lastSeen ?? 0 }
      })
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, MAX_BASES)
    for (const l of lues) creerBase(l.address, l.name, l.items, l.lastSeen)
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
    const ok = await Storage.set(CLE_BASE(a), JSON.stringify({ name: b.name, items: b.items, lastSeen: b.lastSeen }))
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

/** A l'arrivee: on restitue son butin et on lui donne une base. */
export async function accueillir(address: string): Promise<void> {
  const brut = await Storage.player.get<string>(address, CLE_JOUEUR)
  const stocke: Profil | null = brut ? JSON.parse(brut) : null
  // Objet de bienvenue au TOUT PREMIER passage seulement: une base n'est jamais nue.
  const items = stocke?.items && stocke.items.length > 0 ? stocke.items : [0]
  const profil: Profil = { coins: stocke?.coins ?? 0, items: [...items] }
  profils.set(address, profil)
  profilsSales.add(address)

  const name = nomDe(address)
  const dejala = bases.get(address)
  if (dejala) {
    dejala.name = name
    dejala.items = [...items]
    dejala.lastSeen = Date.now()
    basesSales.add(address)
    publier(dejala)
    jour(`${name} retrouve sa base (place ${dejala.place})`)
    return
  }

  // Le lieu est plein: on libere la base de l'ABSENT le plus ancien. Jamais celle d'un present.
  if (placesLibres.length === 0) {
    const ici = presents()
    let plusVieux: Base | null = null
    for (const b of bases.values()) {
      if (ici.has(b.address)) continue
      if (plusVieux === null || b.lastSeen < plusVieux.lastSeen) plusVieux = b
    }
    if (plusVieux !== null) {
      jour(`base de ${plusVieux.name} retiree de l'affichage (absent le plus ancien), son butin reste a lui`)
      retirerBase(plusVieux.address)
    }
  }

  const b = creerBase(address, name, items, Date.now())
  if (b === null) {
    jour(`${name} sans base affichee: ${MAX_BASES} bases deja visibles. Son butin s'accumule.`)
    return
  }
  basesSales.add(address)
  jour(`base creee pour ${name} (place ${b.place}), ${bases.size}/${MAX_BASES} affichees`)
}

/** Au depart: la base RESTE visible, c'est elle que les autres pourront piller. */
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
  const b = bases.get(address)
  if (b && b.items.length >= PLOT_MAX_OBJETS) {
    jour(`base de ${b.name} pleine (${PLOT_MAX_OBJETS})`)
    return false
  }
  profil.items.push(rarity)
  profilsSales.add(address)
  if (b) { b.items = [...profil.items]; basesSales.add(address); publier(b) }
  jour(`rarete ${rarity} posee par ${address.slice(0, 8)} (${profil.items.length} objets)`)
  return true
}

export function coinsDe(address: string): number { return Math.floor(profils.get(address)?.coins ?? 0) }
export function baseDe(address: string): Base | undefined { return bases.get(address) }
export function toutesLesBases(): Base[] { return [...bases.values()] }
export function marquerSale(address: string): void {
  basesSales.add(address)
  const p = profils.get(address); const b = bases.get(address)
  if (p && b) { p.items = [...b.items]; profilsSales.add(address) }
  if (b) publier(b)
}

export function startPlots(): void {
  void chargerBases()

  // Gain passif: accumule EN MEMOIRE, jamais une ecriture par seconde.
  let acc = 0
  engine.addSystem((dt: number) => {
    acc += dt
    if (acc < 1) return
    const secondes = acc
    acc = 0
    for (const [address, profil] of profils) {
      let gain = 0
      for (const r of profil.items) gain += GAIN_PAR_SECONDE[r] ?? 1
      if (gain === 0) continue
      profil.coins += gain * secondes
      profilsSales.add(address)
    }
  })

  // Le tampon de journal se vide plus vite que les sauvegardes: on veut voir vite.
  timers.setInterval(() => { viderJournal() }, 1000)
  timers.setInterval(() => { void sauver() }, SAUVE_MS)
  timers.setInterval(() => {
    const ici = presents()
    for (const b of bases.values()) publier(b, ici)
  }, 3000)
}
