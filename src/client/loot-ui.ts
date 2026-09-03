import { plasticDe, remonter, rarityShape } from './toy'
import {
  engine, Transform, MeshRenderer, Material, Entity, Billboard, BillboardMode, TextShape,
  Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { DroppedItem } from '../shared/schemas'
import { itemColor, rarityOf, mutationDe, nomDuCode } from '../shared/loot-table'

/**
 * Loot lying on the ground, drawn from what the server publishes and nothing else.
 *
 * This is the moment a knocked-loose theft turns into a scramble, so it has to read from a
 * distance and from any angle: it turns, it glows in its own rarity's colour, and it says
 * what it is above itself. Whoever walks over it first picks it up, which is decided on the
 * server; the client only makes sure everybody can see the race they are in.
 */

const vues = new Map<number, { corps: Entity; etiquette: Entity }>()
/** How long before it goes home a dropped item starts blinking. */
const BLINK_MS = 5000

export function setupLootUi(): void {
  engine.addSystem(() => {
    const vivants = new Set<number>()
    const now = Date.now()
    for (const [e, d] of engine.getEntitiesWith(DroppedItem, Transform)) {
      const id = e as unknown as number
      vivants.add(id)
      const vue = vues.get(id)
      if (vue !== undefined) {
        /*
          Loot that is about to leave the floor blinks, the genre's oldest despawn warning.
          The last five seconds: the piece snaps between its size and two thirds of it, six
          times a second, so a player who was walking away knows to turn around.
        */
        const reste = d.untilMs - now
        const ct = Transform.getMutableOrNull(vue.corps)
        if (ct !== null) {
          const k = reste < BLINK_MS && Math.floor(now / 85) % 2 === 0 ? 0.34 : 0.5
          if (ct.scale.x !== k) ct.scale = Vector3.create(k, k, k)
        }
        continue
      }

      const t = Transform.get(e)
      const r = rarityOf(d.code)
      const teinte = Color4.fromHexString(itemColor(r, mutationDe(d.code)) + 'ff')

      /*
        The real piece, not a box.

        On the ground nothing stops a model from rendering: the box was a stand-in from the
        days the hand could not show a GLB, and it followed the item down to the floor, where
        it read as a plain cube (mobile tester, 3 Sep). Same pair as the carry marker: the
        rarity's model, tinted by its mutation.
      */
      const corps = engine.addEntity()
      Transform.create(corps, { position: t.position, scale: Vector3.create(0.5, 0.5, 0.5) })
      remonter(corps, `item-${r}.glb`)
      rarityShape(corps, r, plasticDe(teinte, 2.0))
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
