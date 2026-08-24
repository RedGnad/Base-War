import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  PORTEE_VOL, PORTEE_REPRISE, VERROU_ARRIVEE_MS, VERROU_GRATUIT_MS,
  VERROU_BONUS_MS, MALUS_DUREE_MS, REPRISE_FENETRE_MS
} from '../shared/schemas'

/** On doit etre PRES d'une place pour la revendiquer. */
const PORTEE_INSTALLATION = 7
import { room } from '../shared/messages'
import { rareteDe, mutationDe, nomObjet } from '../shared/loot-table'
import { jour } from './journal'
import {
  basesProches, verrouDe, poserVerrou, retirerObjet, ajouterObjet,
  nomAffiche, deposerAlerte, retirerAlertes, coinsDe, tenterRebirth, paliersDe,
  poserBase, positionsBases, revendreObjet, acheterEtage, rechargeVerrou, collecter, deplacerObjet
} from './plots'

/**
 * LES SIX MECANIQUES ANTI-FRUSTRATION, valeurs mesurees chez le #1 (memo §3, phase 3).
 * Le vol doit etre lent, bruyant, defendable et reversible: sinon il chasse les joueurs.
 *
 * CONTRAINTE STRUCTURANTE: la victime peut etre ABSENTE au moment du vol. Toutes les
 * mecaniques doivent donc fonctionner en differe:
 *  - le verrou court pendant l'absence
 *  - l'alerte est deposee et delivree au retour
 *  - la fenetre de reprise part du RETOUR de la victime, pas du vol
 */

/** vol -> qui a pris quoi a qui, pour la reprise. */
type Larcin = { voleur: string; victime: string; rarity: number; quand: number }
const larcins: Larcin[] = []

/**
 * 3.6 progression = protection. Source: wiki du #1, page `Base`:
 * *« +10 seconds base lock per rebirth »*. On branche donc le bonus sur les PALIERS,
 * pas sur un compteur d'objets: c'est la meme grandeur que chez la reference.
 */
export function noterPalier(_address: string, _objetsCollectes: number): void { /* remplace par les paliers */ }
function bonusVerrou(address: string): number {
  return paliersDe(address) * VERROU_BONUS_MS
}

function positionDe(address: string): Vector3 | null {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(e)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

function refus(address: string, action: string, raison: string, antiCheat = false): void {
  void room.send('actionRejected', { action, raison, antiCheat }, { to: [address] })
}

/** 3.1 verrou automatique a l'arrivee: on ne se fait pas piller en posant le pied. */
export function verrouArrivee(address: string): void {
  const jusqua = Date.now() + VERROU_ARRIVEE_MS + bonusVerrou(address)
  if (poserVerrou(address, jusqua)) {
    jour(`${nomAffiche(address)} protege ${Math.round((jusqua - Date.now()) / 1000)} s a l'arrivee`)
  }
}

/** Alertes deposees pendant l'absence: delivrees au retour. */
export function delivrerAlertes(address: string): void {
  const a = retirerAlertes(address)
  if (a.length === 0) return
  for (const alerte of a) {
    const x = alerte as { byName: string; rarity: number; mutation?: number }
    void room.send('youWereRobbed', { byName: x.byName, rarity: x.rarity, mutation: x.mutation ?? 0 }, { to: [address] })
  }
  jour(`${a.length} alerte(s) differee(s) delivree(s) a ${nomAffiche(address)}`)
}

/** Y a-t-il un larcin recent que cette victime peut encore reprendre ? */
export function aQuelqueChoseAReprendre(address: string): boolean {
  const t = Date.now()
  return larcins.some((l) => l.victime === address && t - l.quand <= REPRISE_FENETRE_MS)
}

export function startTheft(): void {
  room.onMessage('stealItem', (d, ctx) => {
    const voleur = ctx?.from?.toLowerCase()
    if (!voleur) return
    const vise = (d.ownerId ?? '').toLowerCase()
    if (vise === voleur) { refus(voleur, 'steal', 'that is your own base'); return }

    // ANTI-TRICHE: le serveur lit LUI-MEME la position. Il ne croit rien du client.
    const p = positionDe(voleur)
    if (p === null) { refus(voleur, 'steal', 'position unknown'); return }

    // Le voleur DESIGNE sa cible; le serveur ne retient que celles qu'il verifie a portee.
    const aPortee = basesProches(p, PORTEE_VOL, voleur)
    if (aPortee.length === 0) { refus(voleur, 'steal', 'no base in range'); return }
    const cibles = vise === '' ? aPortee : aPortee.filter((b) => b.address === vise)
    if (cibles.length === 0) { refus(voleur, 'steal', 'that base is out of range'); return }

    const maintenant = Date.now()
    for (const c of cibles) {
      const verrou = verrouDe(c.address)
      if (verrou > maintenant) {
        // 3.2/3.6: le verrou court MEME si le proprietaire est absent.
        refus(voleur, 'steal', `${c.name} is shielded for ${Math.ceil((verrou - maintenant) / 1000)}s`)
        continue
      }
      if (c.items.length === 0) { refus(voleur, 'steal', `${c.name} has nothing to take`); continue }

      // L'OBJET DESIGNE. Le serveur verifie que l'emplacement existe; a defaut il
      // refuse plutot que de choisir a la place du joueur.
      const slot = d.slot
      if (!Number.isInteger(slot) || slot < 0 || slot >= c.items.length) {
        refus(voleur, 'steal', 'that item is gone'); continue
      }
      const r = retirerObjet(c.address, slot)
      if (r === null) { refus(voleur, 'steal', 'item already taken'); continue }

      if (!ajouterObjet(voleur, r)) {
        // Base pleine: on repose chez la victime plutot que de faire disparaitre l'objet.
        ajouterObjet(c.address, r)
        refus(voleur, 'steal', 'your base is full')
        return
      }

      larcins.push({ voleur, victime: c.address, rarity: r, quand: maintenant })

      // 3.3 alerte nominative a la victime. Deposee si elle est absente.
      const nomVoleur = nomAffiche(voleur)
      // L'alerte porte le NOM COMPLET de ce qu'on vient de perdre: se faire prendre un
      // « Gold Epic » ne se vit pas comme perdre un « Epic » nu.
      const rar = rareteDe(r), mut = mutationDe(r)
      deposerAlerte(c.address, { byName: nomVoleur, rarity: rar, mutation: mut })
      void room.send('youWereRobbed', { byName: nomVoleur, rarity: rar, mutation: mut }, { to: [c.address] })

      // 3.4 malus du voleur. La locomotion est cote client: le serveur la DEMANDE.
      // Limite assumee: un client modifie peut l'ignorer. Le TRANSFERT, lui, est
      // autoritaire, et c'est ce qui compte.
      void room.send('thiefPenalty', { ms: MALUS_DUREE_MS }, { to: [voleur] })

      void room.send('stolen', { byName: nomVoleur, fromName: c.name, rarity: rar, mutation: mut })
      jour(`${nomVoleur} a vole un ${nomObjet(rar, mut)} a ${c.name}`)
      return
    }
  })

  // Le joueur pose sa base ou il veut. Le serveur verifie la proximite: on ne
  // revendique pas une place depuis l'autre bout du lieu.
  room.onMessage('claimSlot', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const p = positionDe(a)
    if (p === null) { refus(a, 'build', 'position unknown'); return }
    // On pose CHEZ SOI: la position demandee doit etre celle ou l'on se tient.
    const dist = Vector3.distance(p, Vector3.create(d.x, p.y, d.z))
    if (dist > PORTEE_INSTALLATION) {
      refus(a, 'build', 'place it where you stand', true)
      return
    }
    const r = poserBase(a, d.x, d.z)
    if (!r.ok) { refus(a, 'build', r.raison ?? 'refused'); return }
  })

  // Les positions des bases existantes servent au fantome cote client.
  timers.setInterval(() => {
    const ps = positionsBases()
    void room.send('basePositions', { xs: ps.map((q) => q.x), zs: ps.map((q) => q.z) })
  }, 2500)

  room.onMessage('moveItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (!deplacerObjet(a, d.de, d.vers)) refus(a, 'move', 'cannot move there')
  })

  room.onMessage('collect', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const gain = collecter(a)
    if (gain <= 0) { refus(a, 'collect', 'nothing to collect'); return }
    void room.send('collected', { gain }, { to: [a] })
  })

  room.onMessage('buyFloor', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = acheterEtage(a)
    if (!r.ok) { refus(a, 'floor', r.raison ?? 'refused'); return }
    void room.send('floorBought', { etages: r.etages ?? 1, cout: r.cout ?? 0 }, { to: [a] })
  })

  room.onMessage('sellItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = revendreObjet(a, d.slot)
    if (!r.ok) { refus(a, 'sell', r.raison ?? 'refused'); return }
    void room.send('sold', { gain: r.gain ?? 0, rarity: 0 }, { to: [a] })
  })

  room.onMessage('rebirth', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = tenterRebirth(a)
    if (!r.ok) { refus(a, 'prestige', r.raison ?? 'refused'); return }
    void room.send('rebirthDone', { palier: r.palier ?? 0, etages: r.etages ?? 1 }, { to: [a] })
  })

  /** 3.2 verrou gratuit, activable par le proprietaire. */
  room.onMessage('activateLock', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    // Le verrou a un TEMPS DE RECHARGE: sans lui il serait reactivable a volonte et
    // le vol deviendrait impossible.
    const reste = rechargeVerrou(a)
    if (reste > 0) { refus(a, 'lock', `recharging, ${Math.ceil(reste / 1000)}s`); return }
    const duree = VERROU_GRATUIT_MS + bonusVerrou(a)
    const jusqua = Date.now() + duree
    if (!poserVerrou(a, jusqua)) { refus(a, 'lock', 'no base placed'); return }
    jour(`${nomAffiche(a)} verrouille sa base ${Math.round(duree / 1000)} s`)
  })

  /**
   * 3.5 reprise. La victime recupere son bien si elle approche le voleur.
   * La fenetre part du vol, mais une victime ABSENTE au moment du vol la voit repartir
   * a son retour: sans ca, se faire piller hors ligne serait sans recours.
   */
  room.onMessage('reclaim', (_d, ctx) => {
    const victime = ctx?.from?.toLowerCase()
    if (!victime) return
    const p = positionDe(victime)
    if (p === null) { refus(victime, 'recover', 'position unknown'); return }

    const maintenant = Date.now()
    for (let i = larcins.length - 1; i >= 0; i--) {
      const l = larcins[i]
      if (l.victime !== victime) continue
      if (maintenant - l.quand > REPRISE_FENETRE_MS) continue

      const pv = positionDe(l.voleur)
      if (pv === null) { refus(victime, 'recover', 'the thief is gone'); continue }
      const d = Vector3.distance(p, pv)
      if (d > PORTEE_REPRISE) {
        refus(victime, 'recover', `${nomAffiche(l.voleur)} is ${d.toFixed(1)}m away, get closer`)
        continue
      }

      const items = basesProches(pv, 0.1, '').find((b) => b.address === l.voleur)
      const idx = items ? items.items.lastIndexOf(l.rarity) : -1
      const r = idx >= 0 ? retirerObjet(l.voleur, idx) : null
      if (r === null) { refus(victime, 'recover', 'they no longer have it'); continue }

      ajouterObjet(victime, r)
      larcins.splice(i, 1)
      void room.send('reclaimed', { byName: nomAffiche(victime), fromName: nomAffiche(l.voleur), rarity: r })
      jour(`${nomAffiche(victime)} a repris sa rarete ${r} a ${nomAffiche(l.voleur)}`)
      return
    }
    refus(victime, 'recover', 'nothing to recover')
  })

  // Les larcins expires sortent de la liste: la fenetre de reprise est finie.
  timers.setInterval(() => {
    const t = Date.now() - REPRISE_FENETRE_MS * 3
    while (larcins.length > 0 && larcins[0].quand < t) larcins.shift()
  }, 10000)

  jour('couche vol prete')
}
