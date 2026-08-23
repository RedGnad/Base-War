import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Plot, NB_PLOTS, PLOT_MAX_OBJETS, plotPosition } from '../shared/schemas'
import { rarity } from '../shared/loot-table'

/**
 * Rendu des 8 emplacements. Le client ne fait que PEINDRE l'etat autoritaire:
 * il ne cree, ne deplace et ne supprime aucun objet de jeu de son propre chef.
 */

type Vue = { socle: Entity; etiquette: Entity; balise: Entity; objets: Entity[]; signature: string }
const vues: Vue[] = []

function creerVue(i: number): Vue {
  const pos = plotPosition(i)

  const socle = engine.addEntity()
  Transform.create(socle, {
    position: Vector3.create(pos.x, 0.15, pos.z),
    scale: Vector3.create(3.2, 0.3, 3.2)
  })
  MeshRenderer.setBox(socle)
  MeshCollider.setBox(socle)
  Material.setPbrMaterial(socle, { albedoColor: Color4.fromHexString('#3a3f4bff') })

  const etiquette = engine.addEntity()
  Transform.create(etiquette, { position: Vector3.create(pos.x, 2.2, pos.z), scale: Vector3.create(0.5, 0.5, 0.5) })
  Billboard.create(etiquette, {})
  TextShape.create(etiquette, { text: 'libre', fontSize: 3, textColor: Color4.fromHexString('#8890a0ff') })

  const balise = engine.addEntity()
  Transform.create(balise, { position: Vector3.create(pos.x, 1.2, pos.z), scale: Vector3.create(0, 0, 0) })
  MeshRenderer.setBox(balise)
  Material.setPbrMaterial(balise, {
    albedoColor: Color4.fromHexString('#ffd166ff'),
    emissiveColor: Color4.fromHexString('#ffd166ff'),
    emissiveIntensity: 0.8
  })

  const objets: Entity[] = []
  for (let k = 0; k < PLOT_MAX_OBJETS; k++) {
    const o = engine.addEntity()
    const a = (k / PLOT_MAX_OBJETS) * Math.PI * 2
    Transform.create(o, {
      position: Vector3.create(pos.x + Math.cos(a) * 1.0, -5, pos.z + Math.sin(a) * 1.0),
      scale: Vector3.create(0.45, 0.45, 0.45)
    })
    MeshRenderer.setBox(o)
    objets.push(o)
  }
  return { socle, etiquette, balise, objets, signature: '' }
}

export function setupPlots(): void {
  for (let i = 0; i < NB_PLOTS; i++) vues[i] = creerVue(i)

  // Journal ponctuel: prouve que le client RECOIT bien l'etat des emplacements des
  // joueurs absents. C'est l'exigence « Empty venues are not eligible ».
  let annonce = false
  engine.addSystem(() => {
    if (annonce) return
    const vus: string[] = []
    for (const [, p] of engine.getEntitiesWith(Plot)) {
      if (p.ownerId !== '') vus.push(`${p.index}:${p.ownerName}${p.ownerPresent ? '' : '(absent)'}x${p.items.length}`)
    }
    if (vus.length === 0) return
    annonce = true
    console.log(`[CLIENT] emplacements occupes vus: ${vus.sort().join(' ')}`)
  })

  engine.addSystem(() => {
    for (const [, p] of engine.getEntitiesWith(Plot)) {
      const v = vues[p.index]
      if (!v) continue

      // On ne repeint que si l'etat a change: un TextShape reecrit par image coute cher.
      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.items.join(',')}`
      if (sig === v.signature) continue
      v.signature = sig

      const t = TextShape.getMutableOrNull(v.etiquette)
      if (t !== null) {
        if (p.ownerId === '') {
          // Un emplacement libre est une INVITATION, pas un trou. La difference decide
          // si un visiteur seul voit un lieu concu ou un terrain abandonne.
          t.text = 'LIBRE\ncasse une caisse\npour le prendre'
          t.textColor = Color4.fromHexString('#ffd166ff')
        } else {
          // Le nom reste affiche meme absent: un emplacement occupe n'est jamais vide a l'ecran.
          t.text = p.ownerPresent ? p.ownerName : `${p.ownerName}\n(absent)`
          t.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')
        }
      }
      // Un socle libre s'eclaire faiblement: il se lit comme disponible, pas comme mort.
      const libre = p.ownerId === ''
      Material.setPbrMaterial(v.socle, {
        albedoColor: Color4.fromHexString(libre ? '#4a4326ff' : (p.ownerPresent ? '#4a5568ff' : '#40454fff')),
        emissiveColor: libre ? Color4.fromHexString('#ffd166ff') : undefined,
        emissiveIntensity: libre ? 0.12 : 0
      })
      // Balise verticale sur un emplacement libre: visible de loin, invite a s'approcher.
      const bal = Transform.getMutableOrNull(v.balise)
      if (bal !== null) bal.scale = libre ? Vector3.create(0.18, 2.4, 0.18) : Vector3.create(0, 0, 0)

      const pos = plotPosition(p.index)
      for (let k = 0; k < v.objets.length; k++) {
        const tr = Transform.getMutableOrNull(v.objets[k])
        if (tr === null) continue
        if (k < p.items.length) {
          const a = (k / PLOT_MAX_OBJETS) * Math.PI * 2
          tr.position = Vector3.create(pos.x + Math.cos(a) * 1.0, 0.55, pos.z + Math.sin(a) * 1.0)
          Material.setPbrMaterial(v.objets[k], {
            albedoColor: Color4.fromHexString(rarity(p.items[k]).couleur + 'ff'),
            emissiveColor: Color4.fromHexString(rarity(p.items[k]).couleur + 'ff'),
            emissiveIntensity: 0.35
          })
        } else {
          tr.position = Vector3.create(pos.x, -5, pos.z) // range hors de vue
        }
      }
    }
  })
}
