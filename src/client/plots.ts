import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Plot, PLOT_MAX_OBJETS } from '../shared/schemas'
import { rarity } from '../shared/loot-table'

/**
 * Rendu DYNAMIQUE des bases: une vue apparait quand le serveur cree une base, disparait
 * quand il la retire. Le client ne fait que PEINDRE l'etat autoritaire, il ne cree ni ne
 * supprime aucun objet de jeu de son propre chef.
 *
 * Seules les entites RENDUES comptent dans les limites de scene (doc `scene-limitations`),
 * donc une base retiree ne coute rien.
 */

type Vue = { socle: Entity; etiquette: Entity; objets: Entity[]; signature: string }
const vues = new Map<number, Vue>()   // clef = entite synchronisee du Plot

function creerVue(x: number, z: number): Vue {
  const socle = engine.addEntity()
  Transform.create(socle, { position: Vector3.create(x, 0.15, z), scale: Vector3.create(3.2, 0.3, 3.2) })
  MeshRenderer.setBox(socle)
  MeshCollider.setBox(socle)
  Material.setPbrMaterial(socle, { albedoColor: Color4.fromHexString('#4a5568ff') })

  const etiquette = engine.addEntity()
  Transform.create(etiquette, { position: Vector3.create(x, 2.2, z), scale: Vector3.create(0.5, 0.5, 0.5) })
  Billboard.create(etiquette, {})
  TextShape.create(etiquette, { text: '', fontSize: 3, textColor: Color4.White() })

  const objets: Entity[] = []
  for (let k = 0; k < PLOT_MAX_OBJETS; k++) {
    const o = engine.addEntity()
    const a = (k / PLOT_MAX_OBJETS) * Math.PI * 2
    Transform.create(o, {
      position: Vector3.create(x + Math.cos(a) * 1.0, -5, z + Math.sin(a) * 1.0),
      scale: Vector3.create(0.45, 0.45, 0.45)
    })
    MeshRenderer.setBox(o)
    objets.push(o)
  }
  return { socle, etiquette, objets, signature: '' }
}

function detruireVue(v: Vue): void {
  engine.removeEntity(v.socle)
  engine.removeEntity(v.etiquette)
  for (const o of v.objets) engine.removeEntity(o)
}

export function setupPlots(): void {
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

      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.items.join(',')}`
      if (sig === v.signature) continue
      v.signature = sig

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

      for (let k = 0; k < v.objets.length; k++) {
        const tr = Transform.getMutableOrNull(v.objets[k])
        if (tr === null) continue
        const a = (k / PLOT_MAX_OBJETS) * Math.PI * 2
        if (k < p.items.length) {
          tr.position = Vector3.create(t.position.x + Math.cos(a) * 1.0, 0.55, t.position.z + Math.sin(a) * 1.0)
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
