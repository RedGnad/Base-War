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
type Profil = {
  coins: number
  items: number[]
  /** boites ACHETEES ET NON OUVERTES, par type. Le hasard attend l'ouverture. */
  boites?: number[]
  collectes?: number
  rebirths?: number
  /** etages ACHETES, au-dela du rez-de-chaussee */
  etagesAchetes?: number
  /** fin du dernier verrou, pour le temps de recharge */
  finVerrou?: number
  /** derniere seconde ou le joueur etait present, pour les gains hors ligne */
  vuA?: number
  /** argent produit mais PAS ENCORE encaisse */
  reserve?: number
  /** jour (AAAAMMJJ) de la derniere recompense quotidienne reclamee */
  dernierJour?: number
  /** jours consecutifs de connexion, 1 a 7 puis retour a 1 */
  serie?: number
  /** charges de sentinelle restantes */
  sentinelles?: number
  /** objets OFFERTS a d'autres joueurs, et objets RECUS. Compteurs de reputation. */
  donnes?: number
  recus?: number
  /** etape du tutoriel atteinte; egale au nombre d'etapes = termine */
  tuto?: number
  /** jour (AAAAMMJJ) du jeu de quetes en cours; un autre jour remet a zero */
  quetesJour?: number
  /** avancement des TROIS quetes du jour, dans l'ordre de `quetesDuJour()` */
  quetesProgres?: number[]
  /** quetes deja encaissees (1 = prise), plus un 4e drapeau pour le bonus des trois */
  quetesPrises?: number[]
  /**
   * INDEX DE DECOUVERTE: codes d'objets deja obtenus au moins une fois.
   * *« ce menu index qui permet de voir quelle machine on a trouve et lesquelles il
   *  nous reste a trouver »*. Avec 98 combinaisons, c'est ce qui leur donne un sens:
   * sans lui, un Gold Epic n'est qu'un cube violet de plus.
   */
  vus?: number[]
  x?: number
  z?: number
  /** horodatage du dernier DEPLACEMENT (pas du premier placement) */
  dernierDeplacement?: number
  alertes?: object[]
}

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

export function presents(): Set<string> {
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
/**
 * On NE TRIE PLUS. Le rangement etait automatique (du plus commun au plus rare), ce qui
 * privait le joueur de la seule decision spatiale du jeu: mettre son objet rare EN HAUT
 * le protege (le voleur doit grimper, ralenti par son malus) mais l'eloigne de lui.
 * L'ordre du tableau EST le placement choisi.
 */
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
  // PAS d'objet gratuit. Le cadeau d'arrivee est LA BOITE, et rien d'autre: donner
  // aussi un objet, c'est un revenu qui coule avant que le joueur ait rien fait, et
  // ca vide de son sens le premier geste du jeu (ouvrir).
  const items = stocke?.items ?? []
  // UNE SEULE BOITE A L'ARRIVEE, et c'est la RECOMPENSE DU JOUR 1 qui la donne.
  // Change le 24 Aug: on cumulait un « starter pack » et la recompense du jour 1, deux
  // boites de type 0, pour le meme role. Le jour 1 se debloque de toute facon des la
  // premiere seconde: le starter separe faisait double emploi et brouillait le
  // demarrage de la serie des sept jours.
  // ON REPART DU PROFIL STOCKE EN ENTIER, puis on surcharge.
  // Bug corrige le 24 Aug: cette construction etait une LISTE BLANCHE de sept champs,
  // alors que le profil en compte quinze et que la sauvegarde les ecrit tous. Tout ce
  // qui n'etait pas nomme ici disparaissait a chaque redemarrage du serveur, en silence:
  //   - `dernierJour` -> la recompense quotidienne se croyait jamais prise et se
  //      redonnait a CHAQUE relance. C'est l'origine des boites accumulees.
  //   - `vuA`         -> les gains hors ligne ne se sont JAMAIS declenches, faute de
  //      date de derniere presence.
  //   - `reserve`     -> l'argent produit et non encaisse etait perdu.
  //   - `vus`         -> l'index de decouverte se vidait.
  //   - `serie`       -> la serie de connexion restait bloquee a 1.
  //   - `finVerrou`   -> un redemarrage annulait la recharge du verrou.
  // Une liste blanche sur un type qui grandit se desynchronise a chaque champ ajoute,
  // et l'echec est muet. On part donc du stocke et on ne nomme que les exceptions.
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
  const p = profils.get(address)
  if (p) { p.finVerrou = jusqua; profilsSales.add(address) }
  basesSales.add(address)
  return true
}

/** Millisecondes restantes avant de pouvoir REVERROUILLER. 0 si c'est possible. */
export function rechargeVerrou(address: string): number {
  const p = profils.get(address)
  if (!p || p.finVerrou === undefined) return 0
  const pret = p.finVerrou + VERROU_RECHARGE_MS
  return Math.max(0, pret - Date.now())
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
/**
 * Range un objet. Renvoie ce qui s'est REELLEMENT passe, pour que le client puisse le
 * dire au joueur au lieu d'annoncer « pose sur ta base » quand il n'y a pas de base.
 */
export type RangementResultat = 'expose' | 'en-stock' | 'plein'

/**
 * Ce qui ARRIVERA a un objet, sans le poser. Sert a annoncer honnetement le resultat
 * pendant que la roulette tourne, avant que la pose reelle n'ait lieu.
 */
export function etatPrevisible(address: string): RangementResultat {
  const prof = profils.get(address)
  if (!prof) return 'plein'
  if (prof.items.length >= placesOuvertes(prof.etagesAchetes ?? 0)) return 'plein'
  return bases.has(address) ? 'expose' : 'en-stock'
}

export function ajouterObjet(address: string, rarity: number): RangementResultat {
  const prof = profils.get(address)
  if (!prof) return 'plein'
  // On note la decouverte AVANT tout refus: avoir vu un objet compte, meme si la base
  // est pleine et qu'on ne peut pas le garder.
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


// ---------------------------------------------------------------------------
// QUETES QUOTIDIENNES
// Elles vivent ici parce que l'avancement EST une donnee de profil: le stocker
// ailleurs demanderait un second magasin a garder synchronise avec celui-ci.
// ---------------------------------------------------------------------------

function cleDuJour(): number {
  const d = new Date()
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

/** Remet le jeu de quetes a zero si la journee a change. Rend le profil, ou null. */
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

/**
 * Fait avancer les quetes du jour d'un joueur.
 * On passe le TYPE d'action, pas un index: l'appelant (ouverture, achat, revente...)
 * n'a pas a savoir quelles quetes sont tirees aujourd'hui.
 */
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

/** Ce que le client doit afficher: les trois quetes, et l'etat du calendrier 7 jours. */
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

/**
 * Encaisse une quete finie. Le SERVEUR verifie l'avancement: le client ne fait
 * qu'exprimer l'intention, comme partout ailleurs.
 * `slot` 0-2 = une quete; `slot` 3 = le bonus des trois.
 */
export function reclamerQuete(address: string, slot: number): { boite: number } | { erreur: string } {
  const p = quetesDuProfil(address)
  if (!p) return { erreur: 'unknown profile' }
  const pris = [...(p.quetesPrises ?? [0, 0, 0, 0])]
  if (slot < 0 || slot > 3) return { erreur: 'no such quest' }
  if (pris[slot] === 1) return { erreur: 'already claimed' }

  const ids = quetesDuJour(p.quetesJour ?? 0)
  const prog = p.quetesProgres ?? [0, 0, 0]

  if (slot === 3) {
    // Le bonus exige les TROIS quetes FINIES, pas les trois encaissees: sinon
    // l'ordre des taps deciderait si le bonus est atteignable.
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


/**
 * Renvoie au joueur l'etat de ses quetes.
 * Appele APRES chaque action comptee, pas seulement a l'entree: une barre de progression
 * qui n'avance qu'au rechargement de la scene ne se lit pas comme une progression.
 */
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
/**
 * LE DON: on laisse un de ses objets sur la base d'un autre joueur.
 *
 * C'est le MIROIR EXACT du vol. Meme portee verifiee par le serveur, meme designation
 * d'une base, meme alerte deposee pour un destinataire absent. Seul le sens change.
 *
 * Pourquoi ce mecanisme et pas un autre: dans `data/mobile-social-formats-2026-08-22.md`,
 * l'echange entre joueurs est le SEUL verbe sur-represente a la fois du cote social
 * (+4,5) et du cote retention (+4,3), et ce par DEUX instruments independants. C'est
 * aussi le seul acte cooperatif realisable quand l'autre joueur est absent, ce qui est
 * le cas normal ici: le lieu le plus frequente de Decentraland comptait onze joueurs le
 * 23 Aug, et les juges testent seuls.
 *
 * Il est UNILATERAL et non un troc. Un troc exige deux joueurs connectes en meme temps,
 * ce qui n'arrivera quasiment jamais. Le don, lui, fonctionne sur quelqu'un qui n'est
 * pas la, exactement comme le vol.
 */
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
  // Le destinataire absent l'apprend a son retour, par le meme canal que le vol.
  deposerAlerte(receveur, { type: 'gift', byName: nomAffiche(donneur), code })
  jour(`${nomAffiche(donneur)} offre un objet a ${nomAffiche(receveur)}`)
  return { ok: true, code }
}

/** Compteurs sociaux d'un joueur, affiches sur sa base. */
export function socialDe(address: string): { donnes: number; recus: number } {
  const p = profils.get(address)
  return { donnes: p?.donnes ?? 0, recus: p?.recus ?? 0 }
}

/** Prix de la sentinelle pour CE joueur: 120 s de sa production, plancher 240. */
export function prixSentinelle(address: string): number {
  return Math.max(SENTINELLE_MINIMUM, Math.floor(revenuParSeconde(address) * SENTINELLE_SECONDES))
}

export function acheterSentinelle(address: string): { ok: boolean; raison?: string; charges?: number; cout?: number } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'unknown profile' }
  if (!bases.has(address)) return { ok: false, raison: 'place your base first' }
  // On RECHARGE a plein plutot que d'empiler: un compteur qui monte sans limite rendrait
  // une base imprenable, et une base imprenable retire le jeu a tout le monde.
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

/** Consomme une charge. Renvoie true si la sentinelle a INTERCEPTE le vol. */
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
/**
 * Franchit un palier: DEPENSE les pieces, en echange d'un deblocage permanent.
 * C'est ce qui donne un but au gain passif. Le serveur seul verifie le solde.
 */
export function tenterRebirth(address: string): { ok: boolean; raison?: string; palier?: number; etages?: number } {
  const p = profils.get(address)
  if (!p) return { ok: false, raison: 'unknown profile' }
  const palier = p.rebirths ?? 0
  if (palier >= REBIRTH_MAX) return { ok: false, raison: 'max prestige reached' }
  const exige = paliers(palier)
  if (p.coins < exige.cout) return { ok: false, raison: `you need ${Math.ceil(exige.cout - p.coins)} more coins` }

  // Le palier exige aussi de POSSEDER un objet assez rare: sans ca on pourrait monter
  // en accumulant du commun, et la rarete perdrait tout son sens.
  const meilleur = p.items.length === 0 ? -1 : Math.max(...p.items.map(rareteDe))
  if (meilleur < exige.rareteMin) {
    return { ok: false, raison: `you need an item of rarity ${exige.rareteMin} or better` }
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
  const et = etagesOuverts(p.etagesAchetes ?? 0)
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
  if (!p) return { ok: false, raison: 'unknown profile' }

  // Le serveur RE-VERIFIE tout. Le fantome cote client est une aide a la visee, jamais
  // une autorisation: un client modifie enverrait n'importe quelles coordonnees.
  const x = accrocher(xb)
  const z = accrocher(zb)
  const mauvais = raisonInvalide(x, z, SCENE_COTE, positionsBases(address))
  if (mauvais !== null) return { ok: false, raison: mauvais }

  const ancienne = bases.get(address)
  if (ancienne) retirerBase(address)

  // Poser sa base ne cree aucun objet: on affiche ce qu'on possede, meme si c'est rien.
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

/** Debite (ou credite si negatif). Le solde n'est jamais touche par le client. */
/** Ajoute une boite FERMEE au stock. */
export function ajouterBoite(address: string, typeBoite: number): void {
  const p = profils.get(address)
  if (!p) return
  p.boites = [...(p.boites ?? []), typeBoite]
  profilsSales.add(address)
}

/** Retire une boite du stock si elle s'y trouve. */
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

/**
 * REVENTE. C'est la seule facon de faire de la place: les emplacements sont la
 * ressource rare, et « progresser, c'est remplacer ». Sans revente, une base pleine de
 * Communs est un cul-de-sac.
 * On rend 30 secondes de production, donc bien moins que le prix d'une boite: revendre
 * est un arbitrage, pas une source de revenu.
 */
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

/**
 * ACHAT D'UN ETAGE. Le vrai puits a pieces: +6 emplacements, et on garde tout.
 * A opposer au palier, qui donne un multiplicateur mais efface presque le butin.
 */
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

/** Prix du prochain etage, 0 si le maximum est atteint. */
export function prixProchainEtage(address: string): number {
  const p = profils.get(address)
  if (!p) return 0
  const actuels = 1 + (p.etagesAchetes ?? 0)
  return actuels >= ETAGES_MAX ? 0 : prixEtage(actuels + 1)
}

/**
 * Calcule et verse les gains accumules pendant l'absence. Retourne de quoi afficher
 * la fenetre de retour, ou null s'il n'y a rien a annoncer.
 */
export function encaisserHorsLigne(address: string): { gain: number; secondes: number } | null {
  const p = profils.get(address)
  if (!p || p.vuA === undefined) return null
  const ecoule = Math.min(Date.now() - p.vuA, HORS_LIGNE_PLAFOND_MS)
  if (ecoule < 60_000) return null          // moins d'une minute: rien a annoncer

  // On calcule sur les objets STOCKES, car la base peut ne pas etre encore rechargee.
  let parSeconde = 0
  for (const code of p.items) parSeconde += revenuObjet(code, GAIN_PAR_SECONDE)
  parSeconde *= multiplicateurRevenu(p.rebirths ?? 0) * HORS_LIGNE_TAUX
  if (parSeconde <= 0) return null

  // LE PLAFOND EST EN SECONDES DE PRODUCTION, pas en heures.
  // Un plafond en heures verse un montant qui croit avec la production, donc qui saute
  // du contenu de plus en plus vite a mesure qu'on progresse: mesure le 24 Aug, une nuit
  // payait 21 etages alors qu'il n'en existe que 3. Un plafond en secondes de production
  // verse toujours la meme AVANCE, quel que soit le stade.
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

/** Encaisse la reserve. Retourne ce qui a ete verse. */
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

/** Position d'un joueur, pour toute verification de portee cote serveur. */
export function positionDe(address: string): Vector3 | null {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(e)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

/** Revenu par seconde d'un joueur, multiplicateur de palier compris. */
export function revenuParSeconde(address: string): number {
  const p = profils.get(address)
  const b = bases.get(address)
  if (!p || !b) return 0
  let gain = 0
  for (const code of b.items) gain += revenuObjet(code, GAIN_PAR_SECONDE)
  return gain * multiplicateurRevenu(p.rebirths ?? 0)
}

/** Verse des pieces directement au solde (entrainement, boss): pas par la reserve. */
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
  // PROFIL D'AVANT LE TUTORIEL: on DEDUIT l'etape de ce qu'il a deja fait.
  // Sans ca, un joueur avec cinq objets et deux etages se voit dire « pose ta base »,
  // ce qui detruit la credibilite du guide au premier coup d'oeil.
  // On ne deduit que ce qui est OBSERVABLE dans l'etat sauvegarde; les etapes qu'on ne
  // peut pas prouver restent a faire, ce qui est le sens honnete du doute.
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

/**
 * Recompense quotidienne. Le JOUR 1 se debloque immediatement a la premiere visite:
 * c'est lui qui annonce la boucle des sept jours.
 */
export function reclamerQuotidienne(address: string): { jour: number; boite: number } | null {
  const p = profils.get(address)
  if (!p) return null
  const d = new Date()
  const jourCle = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
  if (p.dernierJour === jourCle) return null      // deja pris aujourd'hui

  // Serie: +1 si c'etait hier, sinon on repart a 1. Pas de palier long au-dela de 7.
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

/** Deplace un objet d'un emplacement a un autre, ou l'echange si la cible est prise. */
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
    // Echange: deux objets permutent leurs places.
    const t = it[de]; it[de] = it[vers]; it[vers] = t
  } else {
    // Deplacement vers une place vide: on retire puis on ajoute a la fin. Les places
    // vides intermediaires n'existent pas, le tableau reste compact.
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

  // Gain passif: accumule EN MEMOIRE, jamais une ecriture par seconde.
  let acc = 0
  engine.addSystem((dt: number) => {
    acc += dt
    if (acc < 1) return
    const secondes = acc
    acc = 0
    // LE REVENU NE COURT QUE POUR LES JOUEURS PRESENTS.
    // Sans cette garde, un joueur parti cinq minutes revenait avec un million de pieces:
    // la boucle parcourait TOUS les profils charges en memoire. Un revenu hors ligne
    // serait une fonctionnalite a part entiere, avec un plafond, pas un effet de bord.
    const ici = presents()
    for (const [address, profil] of profils) {
      if (!ici.has(address)) continue

      // UN OBJET NE RAPPORTE QUE S'IL EST EXPOSE.
      // Sans cette regle, jouer SANS poser sa base est strictement meilleur: on gagne
      // sans etre visible, donc sans pouvoir etre vole. Le risque zero paierait autant
      // que le risque, et toute la couche sociale s'effondrerait.
      // Le prix du revenu, c'est de s'exposer.
      const base = bases.get(address)
      if (!base) continue

      let gain = 0
      for (const code of base.items) gain += revenuObjet(code, GAIN_PAR_SECONDE)
      if (gain === 0) continue
      // Le multiplicateur des paliers s'applique ici: c'est lui qui fait ACCELERER la
      // boucle. Sans lui, chaque palier ne ferait que reculer le joueur.
      // L'argent va dans la RESERVE, pas directement au solde: c'est le bouton COLLECT
      // qui l'encaisse. La reserve plafonne, donc laisser tourner ne paie pas.
      // LA PRIME DE PRESENCE s'applique ici, sur la production, pas sur un solde: elle
      // recompense le fait de jouer PENDANT que d'autres sont la, pas d'avoir ete la.
      const parSeconde = gain * multiplicateurRevenu(profil.rebirths ?? 0) * (1 + primePresence(ici.size))
      const plafond = parSeconde * RESERVE_PLAFOND_S
      profil.reserve = Math.min((profil.reserve ?? 0) + parSeconde * secondes, plafond)
      profil.vuA = Date.now()
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
        // L'ETAPE DU TUTORIEL VOYAGE ICI, pas seulement dans son propre message.
        // Le tout premier `tutorial` peut partir avant que le client n'ait pose son
        // ecouteur (le serveur detecte l'arrivee par PlayerIdentityData, le client
        // s'abonne dans startClient): un envoi unique n'a aucune garantie d'etre entendu.
        // Le portefeuille, lui, repart en boucle: l'etat converge forcement.
        tutoEtape: etapeTuto(address),
        sentinelles: p.sentinelles ?? 0,
        prixSentinelle: prixSentinelle(address),
        presents: ici.size,
        prime: primePresence(ici.size)
      }, { to: [address] })
      void room.send('inventory', { boites: [...(p.boites ?? [])] }, { to: [address] })
      void room.send('index', { vus: [...(p.vus ?? [])] }, { to: [address] })
      // LES QUETES AUSSI. Elles etaient envoyees UNE FOIS a l'arrivee, et le panneau
      // s'ouvrait vide: le serveur detecte l'arrivee par PlayerIdentityData, le client
      // ne s'abonne que dans startClient, et le premier envoi peut donc partir avant
      // qu'il n'ecoute. Tout etat que le joueur doit pouvoir consulter A TOUT MOMENT
      // appartient a cette boucle, pas a un envoi unique.
      pousserQuetes(address)
    }
  }, 1500)

  timers.setInterval(() => { void sauver() }, SAUVE_MS)
  timers.setInterval(() => {
    const ici = presents()
    for (const b of bases.values()) publier(b, ici)
  }, 3000)
}
