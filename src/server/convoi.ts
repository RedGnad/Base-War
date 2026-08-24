import { engine, Transform, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  Convoi, CONVOI_VITESSE, CONVOI_DUREE_MIN_S, CONVOI_SURENCHERE, CONVOI_PORTEE
} from '../shared/schemas'
import { room } from '../shared/messages'
import { jour } from './journal'
import {
  positionDe, nomAffiche, ajouterBoite, boitesDe, depenser, crediter, baseDe, avancerQuete, pousserQuetes
} from './plots'
import { boite } from '../shared/loot-table'

/**
 * LE CONVOI, cote serveur.
 *
 * Une boite achetee sur le tapis ne rejoint plus l'inventaire d'un coup: elle traverse
 * le lieu a pied jusqu'a la base de son acheteur, et pendant tout le trajet elle peut
 * lui etre RACHETEE a 150 %. La duree du trajet EST la fenetre d'enchere; le detail du
 * calibrage est dans `shared/schemas.ts`.
 *
 * TOUT est decide ici. Le client ne fait qu'envoyer « je rachete celui-la »: il n'ecrit
 * ni le prix, ni le proprietaire, ni la position. Un convoi est de l'argent en mouvement,
 * donc exactement le genre d'etat qu'un client ne doit jamais toucher.
 */

type Etat = {
  id: number
  entity: ReturnType<typeof engine.addEntity>
  typeBoite: number
  prixPaye: number
  proprietaire: string
  depart: { x: number; z: number }
  cible: { x: number; z: number }
  debutMs: number
  dureeMs: number
}

const convois = new Map<number, Etat>()
let prochainId = 1

/** Duree du trajet: plancher, puis distance / vitesse. C'est la fenetre d'enchere. */
function dureeMs(depart: { x: number; z: number }, cible: { x: number; z: number }): number {
  const d = Math.sqrt((cible.x - depart.x) ** 2 + (cible.z - depart.z) ** 2)
  return Math.max(CONVOI_DUREE_MIN_S, d / CONVOI_VITESSE) * 1000
}

function publier(e: Etat): void {
  const c = Convoi.getMutableOrNull(e.entity)
  if (c === null) return
  c.convoiId = e.id
  c.typeBoite = e.typeBoite
  c.prixPaye = e.prixPaye
  c.proprietaire = e.proprietaire
  c.nomProprietaire = nomAffiche(e.proprietaire)
  c.departX = e.depart.x; c.departZ = e.depart.z
  c.cibleX = e.cible.x;   c.cibleZ = e.cible.z
}

function position(e: Etat, t: number): { x: number; z: number } {
  const k = Math.max(0, Math.min(1, t))
  return { x: e.depart.x + (e.cible.x - e.depart.x) * k, z: e.depart.z + (e.cible.z - e.depart.z) * k }
}

/**
 * Lance un convoi. Renvoie false si l'acheteur n'a pas de base: dans ce cas l'appelant
 * livre directement en inventaire (comportement d'avant). Un joueur sans base n'a pas de
 * destination, et le forcer a en poser avant tout achat casserait l'ordre du tutoriel.
 */
export function lancerConvoi(acheteur: string, typeBoite: number, prix: number, depuis: { x: number; z: number }): boolean {
  const b = baseDe(acheteur)
  if (b === undefined) return false

  const e: Etat = {
    id: prochainId++,
    entity: engine.addEntity(),
    typeBoite,
    prixPaye: prix,
    proprietaire: acheteur,
    depart: { x: depuis.x, z: depuis.z },
    cible: { x: b.x, z: b.z },
    debutMs: Date.now(),
    dureeMs: 0
  }
  e.dureeMs = dureeMs(e.depart, e.cible)

  Transform.create(e.entity, { position: Vector3.create(e.depart.x, 1.0, e.depart.z) })
  Convoi.create(e.entity, {
    convoiId: e.id, typeBoite, prixPaye: prix,
    proprietaire: acheteur, nomProprietaire: nomAffiche(acheteur),
    progres: 0,
    departX: e.depart.x, departZ: e.depart.z, cibleX: e.cible.x, cibleZ: e.cible.z
  })
  syncEntity(e.entity, [Convoi.componentId, Transform.componentId])
  convois.set(e.id, e)
  jour(`convoi ${e.id}: ${boite(typeBoite).nom} vers ${nomAffiche(acheteur)}, fenetre ${Math.round(e.dureeMs / 1000)} s`)
  return true
}

export function startConvoi(): void {
  room.onMessage('outbid', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const e = convois.get(d.convoiId)
    if (e === undefined) { refus(a, 'it already arrived'); return }
    if (e.proprietaire === a) { refus(a, 'it is already yours'); return }
    if (baseDe(a) === undefined) { refus(a, 'place your base first'); return }

    // PORTEE: on doit etre DEVANT le convoi. Un rachat par menu, a l'autre bout de la
    // carte, retirerait au lieu tout ce que cette mecanique lui apporte.
    const p = positionDe(a)
    if (p === null) { refus(a, 'position unknown'); return }
    const ici = position(e, (Date.now() - e.debutMs) / e.dureeMs)
    const dist = Math.sqrt((ici.x - p.x) ** 2 + (ici.z - p.z) ** 2)
    if (dist > CONVOI_PORTEE) { refus(a, `too far (${dist.toFixed(1)}m)`, true); return }

    const prix = Math.ceil(e.prixPaye * CONVOI_SURENCHERE)
    if (!depenser(a, prix)) { refus(a, `you need ${prix} coins`); return }

    // REMBOURSEMENT INTEGRAL de l'evince: voir la deduction dans `shared/schemas.ts`.
    // Sans lui, acheter tot serait strictement perdant et le tapis redeviendrait une
    // file d'attente jusqu'a la derniere seconde.
    crediter(e.proprietaire, e.prixPaye)
    const evince = e.proprietaire
    void room.send('outbidLost', { byName: nomAffiche(a), rembourse: e.prixPaye, typeBoite: e.typeBoite }, { to: [evince] })

    // LE CONVOI REPART DE LA OU IL EST, vers la nouvelle base. Le faire repartir du
    // tapis rendrait le rachat gratuit en temps pour le nouvel acheteur.
    const nb = baseDe(a)
    if (nb === undefined) return
    e.depart = { x: ici.x, z: ici.z }
    e.cible = { x: nb.x, z: nb.z }
    e.proprietaire = a
    e.prixPaye = prix
    e.debutMs = Date.now()
    e.dureeMs = dureeMs(e.depart, e.cible)
    publier(e)

    void room.send('outbidWon', { fromName: nomAffiche(evince), prix, typeBoite: e.typeBoite }, { to: [a] })
    void room.send('outbidFeed', { byName: nomAffiche(a), fromName: nomAffiche(evince), prix })
    avancerQuete(a, 'racheter')
    pousserQuetes(a)
    jour(`convoi ${e.id}: ${nomAffiche(a)} rachete a ${nomAffiche(evince)} pour ${prix}`)
  })

  // Avancee et livraison. Un seul systeme pour tous les convois.
  engine.addSystem(() => {
    const maintenant = Date.now()
    for (const [id, e] of [...convois]) {
      const t = (maintenant - e.debutMs) / e.dureeMs
      const c = Convoi.getMutableOrNull(e.entity)
      if (c !== null) c.progres = Math.max(0, Math.min(1, t))
      const pos = position(e, t)
      const tr = Transform.getMutableOrNull(e.entity)
      if (tr !== null) tr.position = Vector3.create(pos.x, 1.0, pos.z)
      if (t < 1) continue

      // ARRIVEE: la boite entre au stock de son detenteur du moment.
      ajouterBoite(e.proprietaire, e.typeBoite)
      void room.send('inventory', { boites: boitesDe(e.proprietaire) }, { to: [e.proprietaire] })
      void room.send('convoiArrived', { typeBoite: e.typeBoite }, { to: [e.proprietaire] })
      jour(`convoi ${id}: livre a ${nomAffiche(e.proprietaire)}`)
      Convoi.deleteFrom(e.entity)
      engine.removeEntity(e.entity)
      convois.delete(id)
    }
  })

  jour('convois prets')
}

function refus(a: string, raison: string, antiCheat = false): void {
  void room.send('actionRejected', { action: 'outbid', raison, antiCheat }, { to: [a] })
}
