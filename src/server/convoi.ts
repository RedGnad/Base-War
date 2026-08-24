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
 * Starts a convoy. Returns false when the buyer has no base yet: the caller then delivers
 * straight to inventory, rather than blocking a purchase and breaking the tutorial order.
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

    const p = positionDe(a)
    if (p === null) { refus(a, 'position unknown'); return }
    const ici = position(e, (Date.now() - e.debutMs) / e.dureeMs)
    const dist = Math.sqrt((ici.x - p.x) ** 2 + (ici.z - p.z) ** 2)
    if (dist > CONVOI_PORTEE) { refus(a, `too far (${dist.toFixed(1)}m)`, true); return }

    const prix = Math.ceil(e.prixPaye * CONVOI_SURENCHERE)
    if (!depenser(a, prix)) { refus(a, `you need ${prix} coins`); return }

    // The outbid holder is refunded in full. Without it, buying early would be strictly
    // losing and nobody would ever buy before the belt's end.
    crediter(e.proprietaire, e.prixPaye)
    const evince = e.proprietaire
    void room.send('outbidLost', { byName: nomAffiche(a), rembourse: e.prixPaye, typeBoite: e.typeBoite }, { to: [evince] })

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
