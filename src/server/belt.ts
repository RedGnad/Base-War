import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  Belt, beltPosition, TAPIS_DUREE_S, TAPIS_INTERVALLE_S, PORTEE_ACHAT, PRIX_RARETE
} from '../shared/schemas'
import { room } from '../shared/messages'
import { jour } from './journal'
import { rollRarity } from './loot'
import { ajouterObjet, nomAffiche, depenser, coinsDe } from './plots'

/**
 * LE TAPIS, cote serveur. Les articles defilent, n'importe qui peut en acheter un,
 * et le premier qui paie l'emporte. Toute la validation est ici: le client ne fait
 * qu'envoyer « je veux l'article n », il n'affirme ni prix ni disponibilite.
 */

type Article = {
  id: number
  rarity: number
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
  const rarity = rollRarity()
  const e = engine.addEntity()
  const p = beltPosition(0)
  Transform.create(e, { position: Vector3.create(p.x, p.y, p.z) })
  Belt.create(e, {
    articleId: prochainId,
    rarity,
    prix: PRIX_RARETE[rarity] ?? 40,
    progres: 0,
    acheteurNom: ''
  })
  syncEntity(e, [Belt.componentId, Transform.componentId])
  articles.push({ id: prochainId, rarity, prix: PRIX_RARETE[rarity] ?? 40, progres: 0, vendu: false, entity: e })
  prochainId += 1

  // Une rarete elevee est ANNONCEE a tout le monde: c'est ce qui fait converger les
  // joueurs au meme endroit, et ca cree un evenement social sans rien coder de plus.
  if (rarity >= 3) {
    void room.send('beltAlert', { rarity })
    jour(`ANNONCE: rarete ${rarity} sur le tapis`)
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
      if (a.progres >= 1) { retirer(a); continue }
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
    if (!ajouterObjet(a, art.rarity)) {
      depenser(a, -art.prix)   // remboursement: la base etait pleine
      void room.send('actionRejected', { action: 'achat', raison: 'ta base est pleine', antiCheat: false }, { to: [a] })
      return
    }

    art.vendu = true
    const nom = nomAffiche(a)
    const c = Belt.getMutableOrNull(art.entity)
    if (c !== null) c.acheteurNom = nom
    void room.send('bought', { byName: nom, rarity: art.rarity, prix: art.prix })
    jour(`${nom} achete une rarete ${art.rarity} pour ${art.prix} pieces`)
    retirer(art)
  })

  jour('tapis pret')
}
