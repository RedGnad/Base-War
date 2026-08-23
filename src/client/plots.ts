import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Plot, PLOT_MAX_OBJETS, SLOTS_PAR_ETAGE, ETAGES_MAX, ETAGE_HAUTEUR, slotPosition } from '../shared/schemas'
import { rarity } from '../shared/loot-table'
import { voler } from './theft'

/**
 * Rendu DYNAMIQUE des bases: une vue apparait quand le serveur cree une base, disparait
 * quand il la retire. Le client ne fait que PEINDRE l'etat autoritaire, il ne cree ni ne
 * supprime aucun objet de jeu de son propre chef.
 *
 * Seules les entites RENDUES comptent dans les limites de scene (doc `scene-limitations`),
 * donc une base retiree ne coute rien.
 */

type Vue = { socle: Entity; etiquette: Entity; planchers: Entity[]; objets: Entity[]; signature: string; ownerId: string }
const vues = new Map<number, Vue>()   // clef = entite synchronisee du Plot

function creerVue(x: number, z: number): Vue {
  const socle = engine.addEntity()
  Transform.create(socle, { position: Vector3.create(x, 0.15, z), scale: Vector3.create(3.2, 0.3, 3.2) })
  MeshRenderer.setBox(socle)
  MeshCollider.setBox(socle)
  Material.setPbrMaterial(socle, { albedoColor: Color4.fromHexString('#4a5568ff') })
  // On vole en tapant LA BASE, pas un bouton flottant: la cible du geste est la chose
  // convoitee. Plus lisible pour un juge, et utilisable au doigt sur mobile.
  PointerEvents.create(socle, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Prendre un objet' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Prendre un objet' } }
    ]
  })

  const etiquette = engine.addEntity()
  Transform.create(etiquette, { position: Vector3.create(x, 2.2, z), scale: Vector3.create(0.5, 0.5, 0.5) })
  Billboard.create(etiquette, {})
  TextShape.create(etiquette, { text: '', fontSize: 3, textColor: Color4.White() })

  // Les planchers des etages superieurs. Ils apparaissent quand le joueur les debloque:
  // un batiment qui pousse est une progression VISIBLE de loin, pour lui et pour les autres.
  const planchers: Entity[] = []
  for (let e = 1; e < ETAGES_MAX; e++) {
    const f = engine.addEntity()
    Transform.create(f, {
      position: Vector3.create(x, 0.15 + e * ETAGE_HAUTEUR, z),
      scale: Vector3.create(0, 0, 0)
    })
    MeshRenderer.setBox(f)
    MeshCollider.setBox(f)
    Material.setPbrMaterial(f, { albedoColor: Color4.fromHexString('#525c6bff') })
    planchers.push(f)
  }

  const objets: Entity[] = []
  for (let k = 0; k < PLOT_MAX_OBJETS; k++) {
    const o = engine.addEntity()
    const d = slotPosition(k)
    Transform.create(o, {
      position: Vector3.create(x + d.dx, -5, z + d.dz),
      scale: Vector3.create(0.45, 0.45, 0.45)
    })
    MeshRenderer.setBox(o)
    MeshCollider.setBox(o)
    // C'est l'OBJET qu'on vise, pas la base: le voleur choisit sa cible, comme chez le #1.
    PointerEvents.create(o, {
      pointerEvents: [
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Prendre' } },
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Prendre' } }
      ]
    })
    objets.push(o)
  }
  return { socle, etiquette, planchers, objets, signature: '', ownerId: '' }
}

function detruireVue(v: Vue): void {
  engine.removeEntity(v.socle)
  engine.removeEntity(v.etiquette)
  for (const f of v.planchers) engine.removeEntity(f)
  for (const o of v.objets) engine.removeEntity(o)
}

export function setupPlots(): void {
  // Une frappe sur n'importe quelle base declenche la demande de vol. Le SERVEUR
  // choisit la cible par proximite et refuse tout ce qui doit l'etre.
  // On vise UN OBJET precis. Taper le socle ne vole rien: il faut designer sa prise.
  engine.addSystem(() => {
    for (const v of vues.values()) {
      for (let k = 0; k < v.objets.length; k++) {
        if (
          inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.objets[k]) ||
          inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.objets[k])
        ) { voler(v.ownerId, k); return }
      }
    }
  })

  engine.addSystem(() => {
    const vivantes = new Set<number>()

    for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
      const id = ent as unknown as number
      vivantes.add(id)
      const t = Transform.get(ent)
      let v = vues.get(id)
      if (!v) {
        v = creerVue(t.position.x, t.position.z)
        vues.set(id, v)
      }

      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.etages}|${p.items.join(',')}`
      if (sig === v.signature) continue
      v.signature = sig
      v.ownerId = p.ownerId

      const txt = TextShape.getMutableOrNull(v.etiquette)
      if (txt !== null) {
        // Le nom reste affiche meme absent: une base occupee n'est jamais vide a l'ecran,
        // et c'est elle que les autres viendront piller.
        txt.text = p.ownerPresent ? p.ownerName : `${p.ownerName}\n(absent)`
        txt.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')
      }
      Material.setPbrMaterial(v.socle, {
        albedoColor: Color4.fromHexString(p.ownerPresent ? '#4a5568ff' : '#40454fff')
      })

      // Les planchers debloques apparaissent, les autres restent a l'echelle zero.
      for (let e = 0; e < v.planchers.length; e++) {
        const ft = Transform.getMutableOrNull(v.planchers[e])
        if (ft !== null) ft.scale = (e + 2) <= p.etages ? Vector3.create(3.0, 0.25, 3.0) : Vector3.create(0, 0, 0)
      }

      for (let k = 0; k < v.objets.length; k++) {
        const tr = Transform.getMutableOrNull(v.objets[k])
        if (tr === null) continue
        const d = slotPosition(k)
        if (k < p.items.length) {
          tr.position = Vector3.create(t.position.x + d.dx, d.dy, t.position.z + d.dz)
          const c = Color4.fromHexString(rarity(p.items[k]).couleur + 'ff')
          Material.setPbrMaterial(v.objets[k], { albedoColor: c, emissiveColor: c, emissiveIntensity: 0.35 })
        } else {
          tr.position = Vector3.create(t.position.x, -5, t.position.z)
        }
      }
    }

    // Une base retiree par le serveur emporte sa vue: aucun socle fantome.
    for (const [id, v] of vues) {
      if (vivantes.has(id)) continue
      detruireVue(v)
      vues.delete(id)
    }
  })
}
