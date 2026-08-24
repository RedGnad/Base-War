import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import {
  Belt, beltPosition, TAPIS_DUREE_S, TAPIS_INTERVALLE_S, PORTEE_ACHAT, CHUTE_FIN
} from '../shared/schemas'
import { room } from '../shared/messages'
import { jour } from './journal'
import { rollTypeBoite, rollBoite, rollMutation } from './loot'
import { nomAffiche, depenser, coinsDe, ajouterBoite, retirerBoite, boitesDe, ajouterObjet, etatPrevisible, avancerQuete } from './plots'
import { pousserQuetes } from './theft'
import { BOITES, encoder, nomObjet } from '../shared/loot-table'

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

/**
 * Duree de la mise en scene cote client (roulette + explosion). La pose sur la base
 * attend ce delai pour que l'objet n'apparaisse pas avant d'avoir ete revele.
 * Doit rester synchronise avec la roulette de `src/client/box.ts`.
 */
const POSE_DIFFEREE_MS = 2700

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
    if (!art) { void room.send('actionRejected', { action: 'purchase', raison: 'that crate is already gone', antiCheat: false }, { to: [a] }); return }
    if (art.vendu) { void room.send('actionRejected', { action: 'purchase', raison: 'someone paid before you', antiCheat: false }, { to: [a] }); return }

    // ANTI-TRICHE: le serveur mesure la distance lui-meme, comme pour la caisse.
    const p = positionDe(a)
    if (p === null) { void room.send('actionRejected', { action: 'purchase', raison: 'position unknown', antiCheat: false }, { to: [a] }); return }
    // Une boite deja tombee n'est plus achetable, meme si le client la voit encore.
    if (art.progres >= 1) {
      void room.send('actionRejected', { action: 'purchase', raison: 'it fell into the pit', antiCheat: false }, { to: [a] })
      return
    }
    const pos = beltPosition(art.progres)
    const dist = Vector3.distance(p, Vector3.create(pos.x, pos.y, pos.z))
    if (dist > PORTEE_ACHAT) {
      void room.send('actionRejected', { action: 'purchase', raison: `too far (${dist.toFixed(1)}m)`, antiCheat: true }, { to: [a] })
      return
    }

    if (!depenser(a, art.prix)) {
      void room.send('actionRejected', { action: 'purchase', raison: `you need ${art.prix - coinsDe(a)} more coins`, antiCheat: false }, { to: [a] })
      return
    }

    // La boite part FERMEE dans le stock: le hasard se revele a l'ouverture, pas a l'achat.
    ajouterBoite(a, art.typeBoite)
    void room.send('inventory', { boites: boitesDe(a) }, { to: [a] })
    avancerQuete(a, 'acheter')
    pousserQuetes(a)
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
  /** objets TIRES mais pas encore POSES (pose differee de 2,7 s), par joueur. */
  const enVol = new Map<string, number>()

  room.onMessage('openBox', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    // BASE PLEINE: ON REFUSE L'OUVERTURE, on ne consomme PAS la boite.
    // Bug corrige le 24 Aug: la boite etait retiree, le tirage avait lieu, puis
    // `ajouterObjet` rendait 'plein' et l'objet etait jete. Le joueur perdait la boite
    // ET l'objet, et vendre ensuite ne rendait rien: il n'y avait plus rien a rendre.
    // Le genre bloque l'acquisition quand la base est pleine, il ne la detruit pas.
    // La boite reste en stock, elle attend qu'on fasse de la place.
    if (etatPrevisible(a) === 'plein' || enVol.get(a) !== undefined) {
      void room.send('actionRejected', { action: 'opening', raison: 'base full: sell an item or buy a floor', antiCheat: false }, { to: [a] })
      return
    }
    if (!retirerBoite(a, d.typeBoite)) {
      void room.send('actionRejected', { action: 'opening', raison: 'you do not have that crate', antiCheat: true }, { to: [a] })
      return
    }
    // LE TIRAGE EST IMMEDIAT ET AUTORITAIRE, la POSE est differee.
    // Sinon l'objet apparait sur la base avant que la roulette ne l'ait revele: le
    // joueur voit le resultat par la fenetre avant l'annonce, et le decalage se voit.
    // Le hasard est fige des maintenant, seule sa mise en scene attend.
    // DEUX TIRAGES SEPARES: la rarete, puis la mutation. C'est ce qui cree la surprise
    // composee (« un Rare... DORE ! ») et multiplie la table par 14 sans un maillage
    // de plus.
    avancerQuete(a, 'ouvrir')
    if (d.typeBoite >= 1) avancerQuete(a, 'ouvrirRare')
    const rarity = rollBoite(d.typeBoite)
    const mut = rollMutation()
    const code = encoder(rarity, mut)
    const prevu = etatPrevisible(a)
    jour(`${nomAffiche(a)} ouvre une boite ${d.typeBoite} -> ${nomObjet(rarity, mut)} (${prevu}, pose differee)`)
    void room.send('boxResult', { typeBoite: d.typeBoite, rarity, mutation: mut, etat: prevu }, { to: [a] })
    void room.send('inventory', { boites: boitesDe(a) }, { to: [a] })

    // L'objet est TIRE mais pas encore POSE pendant 2,7 s. Sans ce marqueur, deux
    // ouvertures rapides passeraient toutes les deux le test de place et la seconde
    // se perdrait exactement comme avant.
    enVol.set(a, code)
    pousserQuetes(a)

    timers.setTimeout(() => {
      enVol.delete(a)
      const reel = ajouterObjet(a, code)
      if (reel === 'expose') { avancerQuete(a, 'poser'); pousserQuetes(a) }
      if (reel !== prevu) jour(`pose differee: prevu ${prevu}, obtenu ${reel} pour ${nomAffiche(a)}`)
    }, POSE_DIFFEREE_MS)
  })

  jour('tapis pret')
}
