import { plasticDe } from './toy'
import {
  engine, Transform, MeshRenderer, Material, Entity, Billboard, BillboardMode, TextShape,
  Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { DroppedItem } from '../shared/schemas'
import {
  itemColor, itemName, rarityOf, mutationDe, nomDuCode
} from '../shared/loot-table'

/**
 * Loot lying on the ground, drawn from what the server publishes and nothing else.
 *
 * This is the moment a knocked-loose theft turns into a scramble, so it has to read from a
 * distance and from any angle: it turns, it glows in its own rarity's colour, and it says
 * what it is above itself. Whoever walks over it first picks it up, which is decided on the
 * server; the client only makes sure everybody can see the race they are in.
 */

const vues = new Map<number, { corps: Entity; etiquette: Entity }>()

export function setupLootUi(): void {
  engine.addSystem(() => {
    const vivants = new Set<number>()
    for (const [e, d] of engine.getEntitiesWith(DroppedItem, Transform)) {
      const id = e as unknown as number
      vivants.add(id)
      if (vues.has(id)) continue

      const t = Transform.get(e)
      const r = rarityOf(d.code)
      const teinte = Color4.fromHexString(itemColor(r, mutationDe(d.code)) + 'ff')

      const corps = engine.addEntity()
      Transform.create(corps, { position: t.position, scale: Vector3.create(0.5, 0.5, 0.5) })
      MeshRenderer.setBox(corps)
      Material.setPbrMaterial(corps, {
        ...plasticDe(teinte, 2.0)
      })
      Tween.setRotate(corps, Quaternion.Identity(), Quaternion.fromEulerDegrees(0, 180, 0), 1400, EasingFunction.EF_LINEAR)
      TweenSequence.createOrReplace(corps, { sequence: [], loop: TweenLoop.TL_RESTART })

      const etiquette = engine.addEntity()
      Transform.create(etiquette, {
        position: Vector3.create(t.position.x, t.position.y + 0.9, t.position.z),
        scale: Vector3.create(0.6, 0.6, 0.6)
      })
      Billboard.create(etiquette, { billboardMode: BillboardMode.BM_Y })
      TextShape.create(etiquette, {
        text: `${nomDuCode(d.code)}\nGRAB IT`,
        fontSize: 3, textColor: teinte,
        outlineWidth: 0.2, outlineColor: Color3.create(0, 0, 0)
      })

      vues.set(id, { corps, etiquette })
    }

    for (const [id, v] of [...vues]) {
      if (vivants.has(id)) continue
      engine.removeEntity(v.corps)
      engine.removeEntity(v.etiquette)
      vues.delete(id)
    }
  })
}
