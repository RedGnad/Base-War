import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  PORTEE_VOL, PORTEE_REPRISE, VERROU_ARRIVEE_MS, VERROU_GRATUIT_MS, SENTINELLE_GEL_MS, SENTINELLE_VERROU_MS,
  VERROU_BONUS_MS, MALUS_DUREE_MS, REPRISE_FENETRE_MS
} from '../shared/schemas'

const PORTEE_INSTALLATION = 7
import { room } from '../shared/messages'
import { avancerQuete, reclamerQuete, boitesDe, pousserQuetes, offrirObjet, baseDe, consommerSentinelle, sentinellesDe, acheterSentinelle, presents } from './plots'
import { tutoFait } from './onboarding'
import { rareteDe, mutationDe, nomObjet } from '../shared/loot-table'
import { jour } from './journal'
import {
  basesProches, verrouDe, poserVerrou, retirerObjet, ajouterObjet,
  nomAffiche, deposerAlerte, retirerAlertes, coinsDe, tenterRebirth, paliersDe,
  poserBase, positionsBases, revendreObjet, acheterEtage, rechargeVerrou, collecter, deplacerObjet
} from './plots'

type Larcin = { voleur: string; victime: string; rarity: number; quand: number }
const larcins: Larcin[] = []

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

export function verrouArrivee(address: string): void {
  const jusqua = Date.now() + VERROU_ARRIVEE_MS + bonusVerrou(address)
  if (poserVerrou(address, jusqua)) {
    jour(`${nomAffiche(address)} protege ${Math.round((jusqua - Date.now()) / 1000)} s a l'arrivee`)
  }
}

export function delivrerAlertes(address: string): void {
  const a = retirerAlertes(address)
  if (a.length === 0) return
  for (const alerte of a) {
    const x = alerte as { type?: string; byName: string; rarity?: number; mutation?: number; code?: number }
    if (x.type === 'sentry') {
      void room.send('sentryTriggered', { byName: x.byName, restant: (x as { restant?: number }).restant ?? 0 }, { to: [address] })
      continue
    }
    if (x.type === 'gift') {
      const code = x.code ?? 0
      void room.send('wasGifted', { byName: x.byName, rarity: rareteDe(code), mutation: mutationDe(code) }, { to: [address] })
      continue
    }
    void room.send('youWereRobbed', { byName: x.byName, rarity: x.rarity ?? 0, mutation: x.mutation ?? 0 }, { to: [address] })
  }
  jour(`${a.length} alerte(s) differee(s) delivree(s) a ${nomAffiche(address)}`)
}

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

    const p = positionDe(voleur)
    if (p === null) { refus(voleur, 'steal', 'position unknown'); return }

    const aPortee = basesProches(p, PORTEE_VOL, voleur)
    if (aPortee.length === 0) { refus(voleur, 'steal', 'no base in range'); return }
    const cibles = vise === '' ? aPortee : aPortee.filter((b) => b.address === vise)
    if (cibles.length === 0) { refus(voleur, 'steal', 'that base is out of range'); return }

    const maintenant = Date.now()
    for (const c of cibles) {
      const verrou = verrouDe(c.address)
      if (verrou > maintenant) {
        refus(voleur, 'steal', `${c.name} is shielded for ${Math.ceil((verrou - maintenant) / 1000)}s`)
        continue
      }
      if (c.items.length === 0) { refus(voleur, 'steal', `${c.name} has nothing to take`); continue }

      if (consommerSentinelle(c.address)) {
        const restant = sentinellesDe(c.address)
        poserVerrou(c.address, maintenant + SENTINELLE_VERROU_MS)
        void room.send('sentryBlocked', {
          ownerName: c.name, gelMs: SENTINELLE_GEL_MS, restant,
          verrouSec: Math.round(SENTINELLE_VERROU_MS / 1000)
        }, { to: [voleur] })
        const info = { type: 'sentry', byName: nomAffiche(voleur), restant }
        if (presents().has(c.address)) void room.send('sentryTriggered', info, { to: [c.address] })
        else deposerAlerte(c.address, info)
        jour(`sentinelle de ${c.name} bloque ${nomAffiche(voleur)} (${restant} charge(s) restante(s))`)
        continue
      }

      const slot = d.slot
      if (!Number.isInteger(slot) || slot < 0 || slot >= c.items.length) {
        refus(voleur, 'steal', 'that item is gone'); continue
      }
      const r = retirerObjet(c.address, slot)
      if (r === null) { refus(voleur, 'steal', 'item already taken'); continue }

      if (!ajouterObjet(voleur, r)) {
        ajouterObjet(c.address, r)
        refus(voleur, 'steal', 'your base is full')
        return
      }

      larcins.push({ voleur, victime: c.address, rarity: r, quand: maintenant })

      const nomVoleur = nomAffiche(voleur)
      const rar = rareteDe(r), mut = mutationDe(r)
      deposerAlerte(c.address, { byName: nomVoleur, rarity: rar, mutation: mut })
      void room.send('youWereRobbed', { byName: nomVoleur, rarity: rar, mutation: mut }, { to: [c.address] })

      void room.send('thiefPenalty', { ms: MALUS_DUREE_MS }, { to: [voleur] })

      void room.send('stolen', { byName: nomVoleur, fromName: c.name, rarity: rar, mutation: mut })
      jour(`${nomVoleur} a vole un ${nomObjet(rar, mut)} a ${c.name}`)
      return
    }
  })

  room.onMessage('claimSlot', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const p = positionDe(a)
    if (p === null) { refus(a, 'build', 'position unknown'); return }
    const dist = Vector3.distance(p, Vector3.create(d.x, p.y, d.z))
    if (dist > PORTEE_INSTALLATION) {
      refus(a, 'build', 'place it where you stand', true)
      return
    }
    const r = poserBase(a, d.x, d.z)
    if (!r.ok) { refus(a, 'build', r.raison ?? 'refused'); return }
    tutoFait(a, 0)
  })

  timers.setInterval(() => {
    const ps = positionsBases()
    void room.send('basePositions', { xs: ps.map((q) => q.x), zs: ps.map((q) => q.z) })
  }, 2500)

  room.onMessage('moveItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (!deplacerObjet(a, d.de, d.vers)) refus(a, 'move', 'cannot move there')
  })

  room.onMessage('buySentry', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = acheterSentinelle(a)
    if (!r.ok) { refus(a, 'sentry', r.raison ?? 'refused'); return }
    void room.send('sentryBought', { charges: r.charges ?? 0, cout: r.cout ?? 0 }, { to: [a] })
  })

  room.onMessage('giveItem', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const cible = d.ownerId.toLowerCase()

    const p = positionDe(a)
    const bc = baseDe(cible)
    if (p === null || bc === undefined) { refus(a, 'gift', 'position unknown'); return }
    const dist = Vector3.distance(p, Vector3.create(bc.x, p.y, bc.z))
    if (dist > PORTEE_VOL) { refus(a, 'gift', `too far (${dist.toFixed(1)}m)`, true); return }

    const r = offrirObjet(a, cible, d.slot)
    if (!r.ok) { refus(a, 'gift', r.raison ?? 'refused'); return }

    const code = r.code ?? 0
    const rar = rareteDe(code)
    const mut = mutationDe(code)
    void room.send('gaveItem', { toName: nomAffiche(cible), rarity: rar, mutation: mut }, { to: [a] })
    void room.send('wasGifted', { byName: nomAffiche(a), rarity: rar, mutation: mut }, { to: [cible] })
    void room.send('gifted', { byName: nomAffiche(a), toName: nomAffiche(cible), rarity: rar })
    tutoFait(a, 4)
    avancerQuete(a, 'offrir')
    pousserQuetes(a)
  })

  room.onMessage('claimQuest', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = reclamerQuete(a, d.slot)
    if ('erreur' in r) { refus(a, 'quest', r.erreur); return }
    void room.send('dailyReward', { jour: 0, boite: r.boite }, { to: [a] })
    void room.send('inventory', { boites: boitesDe(a) }, { to: [a] })
    pousserQuetes(a)
  })

  room.onMessage('collect', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const gain = collecter(a)
    if (gain <= 0) { refus(a, 'collect', 'nothing to collect'); return }
    void room.send('collected', { gain }, { to: [a] })
    tutoFait(a, 2)
    avancerQuete(a, 'collecter')
    avancerQuete(a, 'banquer', gain)
    pousserQuetes(a)
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
    avancerQuete(a, 'vendre')
    pousserQuetes(a)
  })

  room.onMessage('rebirth', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const r = tenterRebirth(a)
    if (!r.ok) { refus(a, 'prestige', r.raison ?? 'refused'); return }
    void room.send('rebirthDone', { palier: r.palier ?? 0, etages: r.etages ?? 1 }, { to: [a] })
  })

  room.onMessage('activateLock', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const reste = rechargeVerrou(a)
    if (reste > 0) { refus(a, 'lock', `recharging, ${Math.ceil(reste / 1000)}s`); return }
    const duree = VERROU_GRATUIT_MS + bonusVerrou(a)
    const jusqua = Date.now() + duree
    if (!poserVerrou(a, jusqua)) { refus(a, 'lock', 'no base placed'); return }
    jour(`${nomAffiche(a)} verrouille sa base ${Math.round(duree / 1000)} s`)
  })

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

  timers.setInterval(() => {
    const t = Date.now() - REPRISE_FENETRE_MS * 3
    while (larcins.length > 0 && larcins[0].quand < t) larcins.shift()
  }, 10000)

  jour('couche vol prete')
}
