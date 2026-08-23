import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  PORTEE_VOL, PORTEE_REPRISE, VERROU_ARRIVEE_MS, VERROU_GRATUIT_MS,
  VERROU_BONUS_MS, MALUS_DUREE_MS, REPRISE_FENETRE_MS
} from '../shared/schemas'

/** On doit etre PRES d'une place pour la revendiquer. */
const PORTEE_INSTALLATION = 7
import { room } from '../shared/messages'
import { jour } from './journal'
import {
  basesProches, verrouDe, poserVerrou, retirerObjet, ajouterObjet,
  nomAffiche, deposerAlerte, retirerAlertes, coinsDe, tenterRebirth, paliersDe,
  poserBase, positionsBases
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
    const x = alerte as { byName: string; rarity: number }
    void room.send('youWereRobbed', { byName: x.byName, rarity: x.rarity }, { to: [address] })
  }
  jour(`${a.length} alerte(s) differee(s) delivree(s) a ${nomAffiche(address)}`)
}

export function startTheft(): void {
  room.onMessage('stealItem', (d, ctx) => {
    const voleur = ctx?.from?.toLowerCase()
    if (!voleur) return
    const vise = (d.ownerId ?? '').toLowerCase()
    if (vise === voleur) { refus(voleur, 'vol', 'c est ta propre base'); return }

    // ANTI-TRICHE: le serveur lit LUI-MEME la position. Il ne croit rien du client.
    const p = positionDe(voleur)
    if (p === null) { refus(voleur, 'vol', 'position inconnue'); return }

    // Le voleur DESIGNE sa cible; le serveur ne retient que celles qu'il verifie a portee.
    const aPortee = basesProches(p, PORTEE_VOL, voleur)
    if (aPortee.length === 0) { refus(voleur, 'vol', 'aucune base a portee'); return }
    const cibles = vise === '' ? aPortee : aPortee.filter((b) => b.address === vise)
    if (cibles.length === 0) { refus(voleur, 'vol', 'cette base n est pas a portee'); return }

    const maintenant = Date.now()
    for (const c of cibles) {
      const verrou = verrouDe(c.address)
      if (verrou > maintenant) {
        // 3.2/3.6: le verrou court MEME si le proprietaire est absent.
        refus(voleur, 'vol', `${c.name} est protege encore ${Math.ceil((verrou - maintenant) / 1000)} s`)
        continue
      }
      if (c.items.length === 0) { refus(voleur, 'vol', `${c.name} n'a rien a prendre`); continue }

      // L'OBJET DESIGNE. Le serveur verifie que l'emplacement existe; a defaut il
      // refuse plutot que de choisir a la place du joueur.
      const slot = d.slot
      if (!Number.isInteger(slot) || slot < 0 || slot >= c.items.length) {
        refus(voleur, 'vol', 'cet objet n existe plus'); continue
      }
      const r = retirerObjet(c.address, slot)
      if (r === null) { refus(voleur, 'vol', 'objet deja parti'); continue }

      if (!ajouterObjet(voleur, r)) {
        // Base pleine: on repose chez la victime plutot que de faire disparaitre l'objet.
        ajouterObjet(c.address, r)
        refus(voleur, 'vol', 'ta base est pleine')
        return
      }

      larcins.push({ voleur, victime: c.address, rarity: r, quand: maintenant })

      // 3.3 alerte nominative a la victime. Deposee si elle est absente.
      const nomVoleur = nomAffiche(voleur)
      deposerAlerte(c.address, { byName: nomVoleur, rarity: r })
      void room.send('youWereRobbed', { byName: nomVoleur, rarity: r }, { to: [c.address] })

      // 3.4 malus du voleur. La locomotion est cote client: le serveur la DEMANDE.
      // Limite assumee: un client modifie peut l'ignorer. Le TRANSFERT, lui, est
      // autoritaire, et c'est ce qui compte.
      void room.send('thiefPenalty', { ms: MALUS_DUREE_MS }, { to: [voleur] })

      void room.send('stolen', { byName: nomVoleur, fromName: c.name, rarity: r })
      jour(`${nomVoleur} a vole une rarete ${r} a ${c.name}`)
      return
    }
  })

  // Le joueur pose sa base ou il veut. Le serveur verifie la proximite: on ne
  // revendique pas une place depuis l'autre bout du lieu.
  room.onMessage('claimSlot', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const p = positionDe(a)
    if (p === null) { refus(a, 'installation', 'position inconnue'); return }
    // On pose CHEZ SOI: la position demandee doit etre celle ou l'on se tient.
    const dist = Vector3.distance(p, Vector3.create(d.x, p.y, d.z))
    if (dist > PORTEE_INSTALLATION) {
      refus(a, 'installation', 'pose la ou tu te tiens', true)
      return
    }
    const r = poserBase(a, d.x, d.z)
    if (!r.ok) { refus(a, 'installation', r.raison ?? 'refuse'); return }
  })

  // Les positions des bases existantes servent au fantome cote client.
  timers.setInterval(() => {
    const ps = positionsBases()
    void room.send('basePositions', { xs: ps.map((q) => q.x), zs: ps.map((q) => q.z) })
  }, 2500)

  room.onMessage('rebirth', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = tenterRebirth(a)
    if (!r.ok) { refus(a, 'palier', r.raison ?? 'refuse'); return }
    void room.send('rebirthDone', { palier: r.palier ?? 0, etages: r.etages ?? 1 }, { to: [a] })
  })

  /** 3.2 verrou gratuit, activable par le proprietaire. */
  room.onMessage('activateLock', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const duree = VERROU_GRATUIT_MS + bonusVerrou(a)
    const jusqua = Date.now() + duree
    if (!poserVerrou(a, jusqua)) { refus(a, 'verrou', 'pas de base affichee'); return }
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
    if (p === null) { refus(victime, 'reprise', 'position inconnue'); return }

    const maintenant = Date.now()
    for (let i = larcins.length - 1; i >= 0; i--) {
      const l = larcins[i]
      if (l.victime !== victime) continue
      if (maintenant - l.quand > REPRISE_FENETRE_MS) continue

      const pv = positionDe(l.voleur)
      if (pv === null) { refus(victime, 'reprise', 'le voleur n est plus la'); continue }
      const d = Vector3.distance(p, pv)
      if (d > PORTEE_REPRISE) {
        refus(victime, 'reprise', `${nomAffiche(l.voleur)} est a ${d.toFixed(1)} m, approche-toi`)
        continue
      }

      const items = basesProches(pv, 0.1, '').find((b) => b.address === l.voleur)
      const idx = items ? items.items.lastIndexOf(l.rarity) : -1
      const r = idx >= 0 ? retirerObjet(l.voleur, idx) : null
      if (r === null) { refus(victime, 'reprise', 'il ne l a plus'); continue }

      ajouterObjet(victime, r)
      larcins.splice(i, 1)
      void room.send('reclaimed', { byName: nomAffiche(victime), fromName: nomAffiche(l.voleur), rarity: r })
      jour(`${nomAffiche(victime)} a repris sa rarete ${r} a ${nomAffiche(l.voleur)}`)
      return
    }
    refus(victime, 'reprise', 'rien a reprendre')
  })

  // Les larcins expires sortent de la liste: la fenetre de reprise est finie.
  timers.setInterval(() => {
    const t = Date.now() - REPRISE_FENETRE_MS * 3
    while (larcins.length > 0 && larcins[0].quand < t) larcins.shift()
  }, 10000)

  jour('couche vol prete')
}
