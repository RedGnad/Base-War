import { engine, Transform, PlayerIdentityData, AvatarBase, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import {
  Plot, MAX_BASES_AFFICHEES, PLOT_MAX_OBJETS, etagesOuverts, placesOuvertes,
  coutRebirth, REBIRTH_MAX, paliers, multiplicateurRevenu, accrocher, raisonInvalide
} from '../shared/schemas'
import { GAIN_PAR_SECONDE } from './loot'
import { jour, viderJournal } from './journal'
import { room } from '../shared/messages'

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
  x: number          // position CHOISIE par le joueur
  z: number
  entity: ReturnType<typeof engine.addEntity>
  lastSeen: number
}
type Profil = { coins: number; items: number[]; collectes?: number; rebirths?: number; x?: number; z?: number; alertes?: object[] }

const bases = new Map<string, Base>()
const profils = new Map<string, Profil>()
const basesSales = new Set<string>()
const profilsSales = new Set<string>()

/** Cote de la scene en metres: 25 parcelles = 5 x 16. */
const SCENE_COTE = 80

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

/**
 * Les objets sont ranges du plus COMMUN au plus RARE. Comme la position d'un emplacement
 * monte avec son index, le plus convoite finit a l'etage le plus haut: le voleur doit
 * grimper pour l'avoir, ralenti par son malus. C'est la defense par la geometrie.
 */
function ranger(items: number[]): number[] {
  return [...items].sort((x, y) => x - y)
}

function publier(b: Base, ici?: Set<string>): void {
  const c = Plot.getMutableOrNull(b.entity)
  if (c === null) return
  const pr = profils.get(b.address)
  c.etages = etagesOuverts(pr?.collectes ?? 0, pr?.rebirths ?? 0)
  c.rebirths = pr?.rebirths ?? 0
  c.ownerId = b.address
  c.ownerName = b.name
  c.items = ranger(b.items)
  c.ownerPresent = (ici ?? presents()).has(b.address)
}

/** Cree la base d'un joueur. Retourne null si le lieu affiche deja son maximum. */
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
        return {
          address: key.slice('base:'.length), name: v.name ?? '', items: v.items ?? [],
          lastSeen: v.lastSeen ?? 0, x: v.x, z: v.z
        }
      })
      // Une base sans coordonnees vient d'une version anterieure au placement libre:
      // on ne la restitue pas plutot que de l'inventer quelque part.
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

/** A l'arrivee: on restitue son butin et on lui donne une base. */
export async function accueillir(address: string): Promise<void> {
  const brut = await Storage.player.get<string>(address, CLE_JOUEUR)
  const stocke: Profil | null = brut ? JSON.parse(brut) : null
  // Objet de bienvenue au TOUT PREMIER passage seulement: une base n'est jamais nue.
  const items = stocke?.items && stocke.items.length > 0 ? stocke.items : [0]
  const profil: Profil = {
    coins: stocke?.coins ?? 0,
    items: [...items],
    collectes: stocke?.collectes ?? items.length,
    rebirths: stocke?.rebirths ?? 0,
    alertes: stocke?.alertes ?? []
  }
  profils.set(address, profil)
  profilsSales.add(address)

  const name = nomDe(address)
  // Le joueur retrouve sa base LA OU IL L'AVAIT POSEE.
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

  // On NE POSE PLUS la base d'office: le joueur choisit son emplacement.
  // Son butin l'attend dans son profil en attendant qu'il se decide.
  if (!bases.has(address)) jour(`${name} arrive sans base posee`)
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
  const ouvertes = placesOuvertes(profil.collectes ?? 0, profil.rebirths ?? 0)
  const b = bases.get(address)
  if (profil.items.length >= ouvertes) {
    jour(`base de ${b?.name ?? address.slice(0, 8)} pleine (${ouvertes} places ouvertes)`)
    return false
  }
  profil.items.push(rarity)
  profil.collectes = (profil.collectes ?? 0) + 1
  const avant = etagesOuverts((profil.collectes ?? 1) - 1)
  const apres = etagesOuverts(profil.collectes ?? 1)
  if (apres > avant) jour(`${b?.name ?? address.slice(0, 8)} ouvre l'etage ${apres} (${profil.collectes} objets collectes)`)
  profilsSales.add(address)
  if (b) { b.items = [...profil.items]; basesSales.add(address); publier(b) }
  jour(`rarete ${rarity} posee par ${address.slice(0, 8)} (${profil.items.length} objets)`)
  return true
}

export function coinsDe(address: string): number { return Math.floor(profils.get(address)?.coins ?? 0) }

// --- Acces pour la couche vol -------------------------------------------------------

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
  basesSales.add(address)
  return true
}

/** Retire un objet d'une base et le rend. Le profil du proprietaire suit. */
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

/** Ajoute un objet a une base (ou au seul profil si le joueur n'a pas de base affichee). */
export function ajouterObjet(address: string, rarity: number): boolean {
  const prof = profils.get(address)
  if (!prof) return false
  if (prof.items.length >= placesOuvertes(prof.collectes ?? 0, prof.rebirths ?? 0)) return false
  prof.items.push(rarity)
  profilsSales.add(address)
  const b = bases.get(address)
  if (b) { b.items = [...prof.items]; basesSales.add(address); publier(b) }
  return true
}

export function nomAffiche(address: string): string {
  return bases.get(address)?.name ?? nomDe(address)
}

/** Alerte differee: la victime peut etre absente au moment du vol. */
export function deposerAlerte(victime: string, alerte: object): void {
  const prof = profils.get(victime)
  if (prof) {
    prof.alertes = [...(prof.alertes ?? []), alerte]
    profilsSales.add(victime)
    return
  }
  // Victime jamais chargee en memoire: on ecrit directement dans son stockage.
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
export function baseDe(address: string): Base | undefined { return bases.get(address) }
export function toutesLesBases(): Base[] { return [...bases.values()] }
/**
 * Franchit un palier: DEPENSE les pieces, en echange d'un deblocage permanent.
 * C'est ce qui donne un but au gain passif. Le serveur seul verifie le solde.
 */
export function tenterRebirth(address: string): { ok: boolean; raison?: string; palier?: number; etages?: number } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'profil inconnu' }
  const palier = p.rebirths ?? 0
  if (palier >= REBIRTH_MAX) return { ok: false, raison: 'palier maximum atteint' }
  const exige = paliers(palier)
  if (p.coins < exige.cout) return { ok: false, raison: `il te faut ${Math.ceil(exige.cout - p.coins)} pieces de plus` }

  // Le palier exige aussi de POSSEDER un objet assez rare: sans ca on pourrait monter
  // en accumulant du commun, et la rarete perdrait tout son sens.
  const meilleur = p.items.length === 0 ? -1 : Math.max(...p.items)
  if (meilleur < exige.rareteMin) {
    return { ok: false, raison: `il te faut un objet de rarete ${exige.rareteMin} ou mieux` }
  }

  // SACRIFICE: le palier prend les pieces ET les objets, sauf les meilleurs qu'on garde.
  // C'est ce qui rend le palier signifiant plutot qu'automatique.
  p.coins -= exige.cout
  const tries = [...p.items].sort((a, b) => b - a)
  p.items = tries.slice(0, exige.garde)
  p.rebirths = palier + 1
  profilsSales.add(address)
  const b = bases.get(address)
  if (b) { b.items = [...p.items]; basesSales.add(address); publier(b) }
  const et = etagesOuverts(p.collectes ?? 0, p.rebirths)
  jour(`${b?.name ?? address.slice(0, 8)} franchit le palier ${p.rebirths}: -${exige.cout} pieces, garde ${exige.garde} objet(s), revenu x${exige.multiplicateur}, ${et} etages`)
  return { ok: true, palier: p.rebirths, etages: et }
}

export function paliersDe(address: string): number { return profils.get(address)?.rebirths ?? 0 }
/** Positions des bases existantes, pour la validation d'implantation. */
export function positionsBases(sauf?: string): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = []
  for (const b of bases.values()) if (b.address !== sauf) out.push({ x: b.x, z: b.z })
  return out
}

/**
 * Pose (ou deplace) la base d'un joueur sur la place demandee.
 * Deplacer est GRATUIT: un joueur doit pouvoir reagir a son voisinage, sinon le choix
 * initial devient un piege pour qui ne connait pas encore le lieu.
 */
export function poserBase(address: string, xb: number, zb: number): { ok: boolean; raison?: string } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'profil inconnu' }

  // Le serveur RE-VERIFIE tout. Le fantome cote client est une aide a la visee, jamais
  // une autorisation: un client modifie enverrait n'importe quelles coordonnees.
  const x = accrocher(xb)
  const z = accrocher(zb)
  const mauvais = raisonInvalide(x, z, SCENE_COTE, positionsBases(address))
  if (mauvais !== null) return { ok: false, raison: mauvais }

  const ancienne = bases.get(address)
  if (ancienne) retirerBase(address)

  const items = p.items.length > 0 ? p.items : [0]
  p.items = [...items]
  const b = creerBase(address, nomDe(address), items, Date.now(), x, z)
  if (b === null) return { ok: false, raison: 'pose impossible' }
  p.x = x
  p.z = z
  basesSales.add(address)
  profilsSales.add(address)
  jour(`${b.name} pose sa base en ${x},${z}${ancienne ? ` (deplacee depuis ${ancienne.x},${ancienne.z})` : ''}`)
  return { ok: true }
}

/** Debite (ou credite si negatif). Le solde n'est jamais touche par le client. */
export function depenser(address: string, montant: number): boolean {
  const p = profils.get(address)
  if (!p) return false
  if (montant > 0 && p.coins < montant) return false
  p.coins -= montant
  profilsSales.add(address)
  return true
}

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
      // Le multiplicateur des paliers s'applique ici: c'est lui qui fait ACCELERER la
      // boucle. Sans lui, chaque palier ne ferait que reculer le joueur.
      profil.coins += gain * multiplicateurRevenu(profil.rebirths ?? 0) * secondes
      profilsSales.add(address)
    }
  })

  // Le tampon de journal se vide plus vite que les sauvegardes: on veut voir vite.
  timers.setInterval(() => { viderJournal() }, 1000)
  // Chaque joueur voit son solde et ce que coute le prochain palier: sans ce retour,
  // le gain passif est invisible et le palier ne se comprend pas.
  timers.setInterval(() => {
    const ici = presents()
    for (const [address, p] of profils) {
      if (!ici.has(address)) continue
      const palier = p.rebirths ?? 0
      const suivant = palier >= REBIRTH_MAX ? null : paliers(palier)
      void room.send('wallet', {
        coins: Math.floor(p.coins),
        prochainPalier: suivant ? suivant.cout : 0,
        palier,
        rareteMin: suivant ? suivant.rareteMin : 0,
        multiplicateur: multiplicateurRevenu(palier)
      }, { to: [address] })
    }
  }, 1500)

  timers.setInterval(() => { void sauver() }, SAUVE_MS)
  timers.setInterval(() => {
    const ici = presents()
    for (const b of bases.values()) publier(b, ici)
  }, 3000)
}
