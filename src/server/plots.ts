import { engine, Transform, PlayerIdentityData, AvatarBase, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { Plot, NB_PLOTS, PLOT_MAX_OBJETS, plotPosition } from '../shared/schemas'
import { GAIN_PAR_SECONDE } from './loot'

/**
 * 2.3 a 2.6. Les 8 emplacements sont TOUJOURS publies, occupes ou non, presents ou non.
 * L'etat de chacun est en stockage de SCENE (pas de joueur): c'est ce qui permet de
 * reconstituer l'emplacement d'un joueur ABSENT. Sans ca, un visiteur seul verrait
 * sept socles vides, et « Empty venues are not eligible ».
 */

const CLE_PLOT = (i: number) => `plot:${i}`
const CLE_JOUEUR = 'profil'
const SAUVE_MS = 5000

/**
 * ARCHITECTURE, corrigee le 23 Aug apres une question de l'utilisateur.
 * Decentraland n'a PAS le modele Roblox (des milliers d'instances du meme jeu):
 * un seul serveur autoritaire par scene deployee. Les « iles » sont un mecanisme de
 * communication, pas de duplication de monde.
 * Donc: 8 emplacements possedes a vie plafonneraient le jeu a 8 joueurs. Faux.
 *
 * L'emplacement est une PLACE SUR LA SCENE, pas un titre de propriete:
 *  - le butin appartient au joueur et vit dans SON stockage joueur (autoritaire)
 *  - l'emplacement n'est que la vitrine, plus une trace visible quand il est parti
 *  - un absent cede sa vitrine a un arrivant, SANS jamais perdre son butin
 * Nombre de joueurs: illimite. Nombre de vitrines simultanees: 8.
 */
type EtatPlot = { ownerId: string; ownerName: string; items: number[] }
type Profil = { plotIndex: number; coins: number; items: number[] }

const plots: EtatPlot[] = []
const entites: ReturnType<typeof engine.addEntity>[] = []
const profils = new Map<string, Profil>()
const plotsSales = new Set<number>()
const profilsSales = new Set<string>()

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

function publier(i: number): void {
  const c = Plot.getMutableOrNull(entites[i])
  if (c === null) return
  const p = plots[i]
  c.ownerId = p.ownerId
  c.ownerName = p.ownerName
  c.items = [...p.items]
  c.ownerPresent = p.ownerId !== '' && presents().has(p.ownerId)
}

/**
 * HYDRATATION DE TOUS LES EMPLACEMENTS AU DEMARRAGE.
 * `Storage.getValues({ prefix })` n'est documente NULLE PART: trouve dans les typages livres.
 * C'est lui qui rend visibles les emplacements des joueurs absents, en une seule lecture.
 */
async function chargerTousLesPlots(): Promise<void> {
  try {
    const res = await Storage.getValues({ prefix: 'plot:' })
    for (const { key, value } of res.data) {
      const i = parseInt(key.slice('plot:'.length), 10)
      if (isNaN(i) || i < 0 || i >= NB_PLOTS) continue
      const v = typeof value === 'string' ? JSON.parse(value) : value
      plots[i] = { ownerId: v.ownerId ?? '', ownerName: v.ownerName ?? '', items: v.items ?? [] }
    }
    console.log(`[SERVER] ${res.data.length} emplacements restitues sur ${res.pagination.total}`)
  } catch (e) {
    console.error(`[SERVER] lecture des emplacements impossible: ${e}`)
  }
  for (let i = 0; i < NB_PLOTS; i++) publier(i)
}

async function sauver(): Promise<void> {
  for (const i of [...plotsSales]) {
    plotsSales.delete(i)
    const ok = await Storage.set(CLE_PLOT(i), JSON.stringify(plots[i]))
    if (!ok) { console.error(`[SERVER] ECHEC sauvegarde emplacement ${i}`); plotsSales.add(i) }
  }
  for (const a of [...profilsSales]) {
    profilsSales.delete(a)
    const p = profils.get(a)
    if (!p) continue
    const ok = await Storage.player.set(a, CLE_JOUEUR, JSON.stringify(p))
    if (!ok) { console.error(`[SERVER] ECHEC sauvegarde profil ${a}`); profilsSales.add(a) }
  }
}

/** Rend a un joueur SON emplacement, ou lui en attribue un libre. */
export async function attribuerPlot(address: string): Promise<number> {
  const deja = profils.get(address)
  if (deja) return deja.plotIndex

  const brut = await Storage.player.get<string>(address, CLE_JOUEUR)
  let profil: Profil | null = brut ? JSON.parse(brut) : null

  // Son ancien emplacement lui revient s'il est toujours a son nom.
  if (profil && plots[profil.plotIndex]?.ownerId === address) {
    profils.set(address, profil)
    return profil.plotIndex
  }

  // ORDRE D'ATTRIBUTION, et il ne doit JAMAIS deloger un joueur present.
  // 1) une place vraiment libre
  let libre = plots.findIndex((p) => p.ownerId === '')
  // 2) sinon la place d'un ABSENT (il garde son butin, qui vit dans son stockage)
  if (libre === -1) {
    const ici = presents()
    libre = plots.findIndex((p) => !ici.has(p.ownerId))
  }
  // 3) sinon: toutes les places sont tenues par des joueurs PRESENTS.
  // On ne deloge personne. Le joueur joue quand meme, son butin s'accumule dans son
  // stockage, et il prendra la premiere place liberee. Mesure du 23 Aug: le lieu le plus
  // frequente de toute la plateforme compte 11 joueurs, donc ce cas est rare, mais il
  // doit degrader proprement au lieu de voler la place de quelqu'un.
  if (libre === -1) {
    console.log(`[SERVER] ${address} sans vitrine: les ${NB_PLOTS} sont tenues par des presents`)
    const p: Profil = { plotIndex: -1, coins: profil?.coins ?? 0, items: profil?.items ?? [] }
    profils.set(address, p)
    profilsSales.add(address)
    return -1
  }

  // Le joueur evince garde son butin: il est dans SON stockage, pas sur la vitrine.
  const evince = plots[libre].ownerId
  if (evince !== '' && evince !== address) {
    console.log(`[SERVER] vitrine ${libre} liberee par ${evince} (absent), son butin reste a lui`)
  }

  // On restitue le butin PROPRE au joueur. OBJET DE BIENVENUE au premier passage
  // seulement: une vitrine fraichement prise n'est jamais nue, sinon on donne
  // exactement l'image d'abandon que la regle d'eligibilite punit.
  const sienItems = profil?.items ?? []
  const items = sienItems.length > 0 ? sienItems : [0]
  plots[libre] = { ownerId: address, ownerName: nomDe(address), items: [...items] }
  profil = { plotIndex: libre, coins: profil?.coins ?? 0, items: [...items] }
  profils.set(address, profil)
  plotsSales.add(libre)
  profilsSales.add(address)
  publier(libre)
  console.log(`[SERVER] emplacement ${libre} attribue a ${address}`)
  return libre
}

/** 2.3: l'objet obtenu se pose directement sur l'emplacement du joueur. */
export async function poserObjet(address: string, rarity: number): Promise<boolean> {
  const i = await attribuerPlot(address)
  // Sans vitrine, le butin va quand meme dans le profil: rien n'est perdu, il
  // s'affichera des qu'une place se libere.
  if (i === -1) {
    const prof = profils.get(address)
    if (prof) { prof.items = [...prof.items, rarity]; profilsSales.add(address) }
    console.log(`[SERVER] ${address} recupere une rarete ${rarity} en attente de vitrine`)
    return true
  }
  const p = plots[i]
  if (p.items.length >= PLOT_MAX_OBJETS) {
    console.log(`[SERVER] emplacement ${i} plein (${PLOT_MAX_OBJETS})`)
    return false
  }
  p.items.push(rarity)
  const profil = profils.get(address)
  if (profil) { profil.items = [...p.items]; profilsSales.add(address) }
  plotsSales.add(i)
  publier(i)
  console.log(`[SERVER] rarete ${rarity} posee sur l'emplacement ${i} (${p.items.length} objets)`)
  return true
}

export function coinsDe(address: string): number {
  return Math.floor(profils.get(address)?.coins ?? 0)
}

/** Accesseurs pour la couche vol (phase 3). */
export function etatPlot(i: number): EtatPlot | undefined { return plots[i] }
export function tousLesPlots(): EtatPlot[] { return plots }
export function plotDe(address: string): number | undefined { return profils.get(address)?.plotIndex }

/** Le butin vit dans le profil: toute modification de vitrine doit le suivre. */
export function synchroniserProfil(i: number): void {
  const p = plots[i]
  if (!p || p.ownerId === '') { plotsSales.add(i); publier(i); return }
  const profil = profils.get(p.ownerId)
  if (profil) { profil.items = [...p.items]; profilsSales.add(p.ownerId) }
  plotsSales.add(i)
  publier(i)
}

export function marquerSale(i: number): void { plotsSales.add(i) }

export function startPlots(): void {
  for (let i = 0; i < NB_PLOTS; i++) {
    plots[i] = { ownerId: '', ownerName: '', items: [] }
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(plotPosition(i).x, 0, plotPosition(i).z) })
    Plot.create(e, { index: i, ownerId: '', ownerName: '', items: [], ownerPresent: false })
    syncEntity(e, [Plot.componentId, Transform.componentId])
    entites[i] = e
  }
  void chargerTousLesPlots()

  // 2.4: gain passif. Accumule EN MEMOIRE, jamais une ecriture Storage par seconde.
  let acc = 0
  engine.addSystem((dt: number) => {
    acc += dt
    if (acc < 1) return
    const secondes = acc
    acc = 0
    for (const [address, profil] of profils) {
      const p = plots[profil.plotIndex]
      if (!p || p.ownerId !== address) continue
      let gain = 0
      for (const r of p.items) gain += GAIN_PAR_SECONDE[r] ?? 1
      if (gain === 0) continue
      profil.coins += gain * secondes
      profilsSales.add(address)
    }
  })

  // 2.5: points de controle, jamais par image.
  timers.setInterval(() => { void sauver() }, SAUVE_MS)

  // La presence change l'affichage des emplacements: on republie a intervalle lent.
  timers.setInterval(() => { for (let i = 0; i < NB_PLOTS; i++) publier(i) }, 3000)

  // Les joueurs en attente prennent la premiere place liberee.
  timers.setInterval(() => {
    const attente = [...profils.entries()].filter(([, p]) => p.plotIndex === -1)
    if (attente.length === 0) return
    const ici = presents()
    for (const [address] of attente) {
      if (!ici.has(address)) continue
      const libre = plots.findIndex((p) => p.ownerId === '' || !ici.has(p.ownerId))
      if (libre === -1) return
      const prof = profils.get(address)!
      const items = prof.items.length > 0 ? prof.items : [0]
      plots[libre] = { ownerId: address, ownerName: nomDe(address), items: [...items] }
      prof.plotIndex = libre
      prof.items = [...items]
      plotsSales.add(libre); profilsSales.add(address); publier(libre)
      console.log(`[SERVER] ${address} obtient enfin la vitrine ${libre}`)
    }
  }, 4000)
}
