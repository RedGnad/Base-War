import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  Belt, beltPosition, TAPIS_DUREE_S, TAPIS_INTERVALLE_S, PORTEE_ACHAT, CHUTE_FIN
} from '../shared/schemas'
import { room } from '../shared/messages'
import { jour } from './journal'
import { rollTypeBoite, rollBoite } from './loot'
import { nomAffiche, depenser, coinsDe, ajouterBoite, retirerBoite, boitesDe, ajouterObjet } from './plots'
import { BOITES } from '../shared/loot-table'

/**
 * LE TAPIS, cote serveur. Les articles defilent, n'importe qui peut en acheter un,
 * et le premier qui paie l'emporte. Toute la validation est ici: le client ne fait
 * qu'envoyer « je veux l'article n », il n'affirme ni prix ni disponibilite.
 */

type Article = {
  id: number
  typeBoite: number
  prix: number
  progres: number
  vendu: boolean
  entity: ReturnType<typeof engine.addEntity>
}

const articles: Article[] = []
let prochainId = 1
let depuisSpawn = 0

function positionDe(address: string): Vector3 | null {
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(e)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

function creerArticle(): void {
  const typeBoite = rollTypeBoite()
  const prix = BOITES[typeBoite].prix
  const e = engine.addEntity()
  const p = beltPosition(0)
  Transform.create(e, { position: Vector3.create(p.x, p.y, p.z) })
  Belt.create(e, { articleId: prochainId, typeBoite, prix, progres: 0, acheteurNom: '' })
  syncEntity(e, [Belt.componentId, Transform.componentId])
  articles.push({ id: prochainId, typeBoite, prix, progres: 0, vendu: false, entity: e })
  prochainId += 1

  // Une boite chere est ANNONCEE a tout le monde: c'est ce qui fait converger les joueurs
  // au meme endroit, et ca cree un evenement social sans rien coder de plus.
  if (typeBoite >= 2) {
    void room.send('beltAlert', { typeBoite })
    jour(`ANNONCE: ${BOITES[typeBoite].nom} sur le tapis`)
  }
}

function retirer(a: Article): void {
  engine.removeEntity(a.entity)
  const i = articles.indexOf(a)
  if (i >= 0) articles.splice(i, 1)
}

export function startBelt(): void {
  engine.addSystem((dt: number) => {
    depuisSpawn += dt
    if (depuisSpawn >= TAPIS_INTERVALLE_S) {
      depuisSpawn = 0
      creerArticle()
    }
    for (const a of [...articles]) {
      a.progres += dt / TAPIS_DUREE_S
      // On ne retire qu'APRES la chute: la boite non prise tombe dans la fosse,
      // et on voit ce qu'on vient de laisser passer.
      if (a.progres >= 1 + CHUTE_FIN) { retirer(a); continue }
      const c = Belt.getMutableOrNull(a.entity)
      if (c !== null) c.progres = a.progres
      const t = Transform.getMutableOrNull(a.entity)
      if (t !== null) {
        const p = beltPosition(a.progres)
        t.position = Vector3.create(p.x, p.y, p.z)
      }
    }
  })

  room.onMessage('buyBelt', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const art = articles.find((x) => x.id === d.articleId)
    if (!art) { void room.send('actionRejected', { action: 'achat', raison: 'article deja parti', antiCheat: false }, { to: [a] }); return }
    if (art.vendu) { void room.send('actionRejected', { action: 'achat', raison: 'quelqu un a paye avant toi', antiCheat: false }, { to: [a] }); return }

    // ANTI-TRICHE: le serveur mesure la distance lui-meme, comme pour la caisse.
    const p = positionDe(a)
    if (p === null) { void room.send('actionRejected', { action: 'achat', raison: 'position inconnue', antiCheat: false }, { to: [a] }); return }
    // Une boite deja tombee n'est plus achetable, meme si le client la voit encore.
    if (art.progres >= 1) {
      void room.send('actionRejected', { action: 'achat', raison: 'elle est tombee', antiCheat: false }, { to: [a] })
      return
    }
    const pos = beltPosition(art.progres)
    const dist = Vector3.distance(p, Vector3.create(pos.x, pos.y, pos.z))
    if (dist > PORTEE_ACHAT) {
      void room.send('actionRejected', { action: 'achat', raison: `trop loin (${dist.toFixed(1)} m)`, antiCheat: true }, { to: [a] })
      return
    }

    if (!depenser(a, art.prix)) {
      void room.send('actionRejected', { action: 'achat', raison: `il te faut ${art.prix - coinsDe(a)} pieces de plus`, antiCheat: false }, { to: [a] })
      return
    }

    // La boite part FERMEE dans le stock: le hasard se revele a l'ouverture, pas a l'achat.
    ajouterBoite(a, art.typeBoite)
    void room.send('inventory', { boites: boitesDe(a) }, { to: [a] })
    art.vendu = true
    const nom = nomAffiche(a)
    const c = Belt.getMutableOrNull(art.entity)
    if (c !== null) c.acheteurNom = nom
    void room.send('bought', { byName: nom, typeBoite: art.typeBoite, prix: art.prix })
    jour(`${nom} achete une ${BOITES[art.typeBoite].nom} pour ${art.prix} pieces`)
    retirer(art)
  })

  /**
   * OUVERTURE D'UNE BOITE. Le SERVEUR tire, immediatement et une seule fois.
   * La roulette du client n'est que du theatre qui atterrit sur ce resultat: c'est
   * ainsi que fonctionne toute loterie honnete, et ca interdit au client de rejouer
   * jusqu'a obtenir ce qui l'arrange.
   */
  room.onMessage('openBox', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (!retirerBoite(a, d.typeBoite)) {
      void room.send('actionRejected', { action: 'ouverture', raison: 'tu n as pas cette boite', antiCheat: true }, { to: [a] })
      return
    }
    const rarity = rollBoite(d.typeBoite)
    const etat = ajouterObjet(a, rarity)
    jour(`${nomAffiche(a)} ouvre une boite ${d.typeBoite} -> rarete ${rarity} (${etat})`)
    void room.send('boxResult', { typeBoite: d.typeBoite, rarity, etat }, { to: [a] })
    void room.send('inventory', { boites: boitesDe(a) }, { to: [a] })
  })

  jour('tapis pret')
}
