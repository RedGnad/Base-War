import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Belt, TAPIS_LONGUEUR, CENTRE, TAPIS_HAUTEUR } from '../shared/schemas'
import { room } from '../shared/messages'
import { boite } from '../shared/loot-table'

/**
 * Rendu du tapis. Chaque article est cliquable: on achete CE qu'on voit passer.
 * Le client n'affirme rien, il envoie l'identifiant de l'article et le serveur decide.
 */

export const beltView = { annonce: '', annonceJusqua: 0 }

type Vue = { objet: Entity; etiquette: Entity }
const vues = new Map<number, Vue>()

export function setupBelt(): void {
  // LE TAPIS, SURELEVE sur des pieds. Deux raisons: il se lit comme un convoyeur et
  // non comme un tapis peint au sol, et surtout il laisse la place a une VRAIE fosse
  // en dessous (on ne peut pas creuser sous y=0 dans Decentraland).
  const bande = engine.addEntity()
  Transform.create(bande, {
    position: Vector3.create(CENTRE.x, TAPIS_HAUTEUR, CENTRE.z),
    scale: Vector3.create(TAPIS_LONGUEUR + 2, 0.35, 2.6)
  })
  MeshRenderer.setBox(bande)
  MeshCollider.setBox(bande)
  Material.setPbrMaterial(bande, { albedoColor: Color4.fromHexString('#8e2b2bff'), roughness: 0.8 })

  // Pieds et rambardes: sans eux la bande flotte et le regard ne comprend pas la hauteur.
  for (let i = -3; i <= 3; i++) {
    const pied = engine.addEntity()
    Transform.create(pied, {
      position: Vector3.create(CENTRE.x + i * ((TAPIS_LONGUEUR + 2) / 7), TAPIS_HAUTEUR / 2, CENTRE.z),
      scale: Vector3.create(0.3, TAPIS_HAUTEUR, 0.3)
    })
    MeshRenderer.setBox(pied)
    MeshCollider.setBox(pied)
    Material.setPbrMaterial(pied, { albedoColor: Color4.fromHexString('#3f4650ff'), roughness: 0.9 })
  }
  for (const dz of [-1.42, 1.42]) {
    const r = engine.addEntity()
    Transform.create(r, {
      position: Vector3.create(CENTRE.x, TAPIS_HAUTEUR + 0.3, CENTRE.z + dz),
      scale: Vector3.create(TAPIS_LONGUEUR + 2, 0.24, 0.16)
    })
    MeshRenderer.setBox(r)
    Material.setPbrMaterial(r, { albedoColor: Color4.fromHexString('#5a6270ff'), roughness: 0.85 })
  }

  // LA FOSSE, sous le bout du tapis. Maintenant que le tapis est a 2,2 m, la boite
  // tombe de deux metres dans un renfoncement ouvert: ca se lit enfin comme un trou.
  const bx = CENTRE.x + TAPIS_LONGUEUR / 2 + 1.3
  const R = 2.2

  const fond = engine.addEntity()
  Transform.create(fond, { position: Vector3.create(bx, 0.1, CENTRE.z), scale: Vector3.create(R * 2, 0.2, R * 2) })
  MeshRenderer.setBox(fond)
  MeshCollider.setBox(fond)
  Material.setPbrMaterial(fond, { albedoColor: Color4.fromHexString('#0d0c0aff'), roughness: 1 })

  // Parois basses (0,9 m): assez pour cacher le fond de loin et lire un renfoncement,
  // assez basses pour qu'on voie la boite s'y ecraser.
  const H = 0.9
  for (const [dx, dz, sx, sz] of [
    [0, R, R * 2, 0.2], [0, -R, R * 2, 0.2],
    [R, 0, 0.2, R * 2], [-R, 0, 0.2, R * 2]
  ]) {
    const m = engine.addEntity()
    Transform.create(m, {
      position: Vector3.create(bx + dx, H / 2, CENTRE.z + dz),
      scale: Vector3.create(sx, H, sz)
    })
    MeshRenderer.setBox(m)
    MeshCollider.setBox(m)
    Material.setPbrMaterial(m, { albedoColor: Color4.fromHexString('#3a342cff'), roughness: 0.95 })
  }

  engine.addSystem(() => {
    const vivants = new Set<number>()

    for (const [ent, b] of engine.getEntitiesWith(Belt, Transform)) {
      vivants.add(b.articleId)
      const t = Transform.get(ent)
      let v = vues.get(b.articleId)
      if (!v) {
        const r = boite(b.typeBoite)
        const objet = engine.addEntity()
        Transform.create(objet, { position: Vector3.create(t.position.x, t.position.y, t.position.z), scale: Vector3.create(r.taille, r.taille, r.taille) })
        MeshRenderer.setBox(objet)
        MeshCollider.setBox(objet)
        const c = Color4.fromHexString(r.couleur + 'ff')
        Material.setPbrMaterial(objet, { albedoColor: c, emissiveColor: c, emissiveIntensity: 0.45, metallic: 0.6, roughness: 0.35 })
        PointerEvents.create(objet, {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: `${r.nom} — ${b.prix} pieces` } },
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: `${r.nom} — ${b.prix} pieces` } }
          ]
        })

        const etiquette = engine.addEntity()
        Transform.create(etiquette, { position: Vector3.create(t.position.x, t.position.y + 0.9, t.position.z), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(etiquette, {})
        TextShape.create(etiquette, { text: `${r.nom}\n${b.prix}`, fontSize: 3, textColor: c })

        v = { objet, etiquette }
        vues.set(b.articleId, v)
      }

      // On suit la position que le SERVEUR publie: aucune interpolation locale, sinon
      // deux clients viseraient des positions differentes du meme article.
      const to = Transform.getMutableOrNull(v.objet)
      if (to !== null) to.position = Vector3.create(t.position.x, t.position.y, t.position.z)
      const te = Transform.getMutableOrNull(v.etiquette)
      if (te !== null) te.position = Vector3.create(t.position.x, t.position.y + 0.9, t.position.z)

      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.objet) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.objet)
      ) {
        void room.send('buyBelt', { articleId: b.articleId })
      }
    }

    for (const [id, v] of vues) {
      if (vivants.has(id)) continue
      engine.removeEntity(v.objet)
      engine.removeEntity(v.etiquette)
      vues.delete(id)
    }

    if (beltView.annonce !== '' && Date.now() > beltView.annonceJusqua) beltView.annonce = ''
  })

  room.onMessage('beltAlert', (d) => {
    const r = boite(d.typeBoite)
    beltView.annonce = `${r.nom} sur le tapis !`
    beltView.annonceJusqua = Date.now() + 7000
    console.log(`[CLIENT] annonce: ${r.nom}`)
  })

  room.onMessage('bought', (d) => {
    console.log(`[CLIENT] ${d.byName} a rafle une ${boite(d.typeBoite).nom} pour ${d.prix}`)
  })
}
