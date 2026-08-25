import {
  engine, Transform, MeshRenderer, Material, AvatarAttach, AvatarAnchorPointType,
  Entity, Billboard, TextShape
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { Carried } from '../shared/schemas'
import { itemColor, itemName, rarityOf, mutationDe } from '../shared/loot-table'
import { room } from '../shared/messages'
import { monAdresseClient, alerter } from './theft'
import { setCarrying } from './locomotion'

/**
 * What everyone sees while somebody is holding something.
 *
 * The state itself lives on the server; this only draws it. It matters that it is drawn on
 * every screen and not just the carrier's: a thief walking home with a trophy in their fist,
 * in front of the person they took it from, is the clearest thing this game has to show, and
 * it is worth nothing if only the thief can see it.
 *
 * `AvatarAttach` takes an `avatarId`, so the item rides the right player's hand on every
 * client. The bone is animated, which would be a defect for something you aim with and is
 * exactly right for something you are carrying: it swings as they run.
 */

export const carryView = { code: -1, name: '', vole: false }

const vues = new Map<number, { corps: Entity; etiquette: Entity }>()

export function setupCarry(): void {
  room.onMessage('carryResult', (d) => {
    if (d.ok) return
    // Only the failures need saying: a success is already visible in the player's own hand.
    alerter(d.reason.toUpperCase(), '#ffd166', 2600)
  })

  engine.addSystem(() => {
    const moi = monAdresseClient()
    let porteMoi = -1
    let volee = false
    const vivants = new Set<number>()

    for (const [e, c] of engine.getEntitiesWith(Carried)) {
      const id = e as unknown as number
      vivants.add(id)
      if (c.holder.toLowerCase() === moi) { porteMoi = c.code; volee = c.origin.toLowerCase() !== moi }

      if (!vues.has(id)) {
        const r = rarityOf(c.code)
        const teinte = Color4.fromHexString(itemColor(r, mutationDe(c.code)) + 'ff')

        const corps = engine.addEntity()
        Transform.create(corps, {
          position: Vector3.create(0, 0.12, 0.16),
          scale: Vector3.create(0.34, 0.34, 0.34)
        })
        MeshRenderer.setBox(corps)
        Material.setPbrMaterial(corps, {
          albedoColor: teinte, emissiveColor: teinte, emissiveIntensity: 1.1, roughness: 0.5
        })
        AvatarAttach.create(corps, {
          avatarId: c.holder,
          anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
        })

        // Named above the head, so a witness knows what is being walked off with.
        const etiquette = engine.addEntity()
        Transform.create(etiquette, { position: Vector3.create(0, 0.4, 0), scale: Vector3.create(0.34, 0.34, 0.34) })
        Billboard.create(etiquette, {})
        TextShape.create(etiquette, {
          text: itemName(r, mutationDe(c.code)),
          fontSize: 3, textColor: teinte,
          outlineWidth: 0.22, outlineColor: Color3.create(0, 0, 0)
        })
        AvatarAttach.create(etiquette, {
          avatarId: c.holder,
          anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
        })

        vues.set(id, { corps, etiquette })
      }
    }

    for (const [id, v] of [...vues]) {
      if (vivants.has(id)) continue
      engine.removeEntity(v.corps)
      engine.removeEntity(v.etiquette)
      vues.delete(id)
    }

    if (porteMoi !== carryView.code || volee !== carryView.vole) {
      carryView.code = porteMoi
      carryView.vole = volee
      setCarrying(porteMoi < 0 ? 'non' : volee ? 'vole' : 'sien')
      carryView.name = porteMoi < 0 ? '' : itemName(rarityOf(porteMoi), mutationDe(porteMoi))
    }
  })
}

export function pickUp(slot: number): void { void room.send('pickUp', { slot }) }
export function placeDown(ownerId: string): void { void room.send('placeDown', { ownerId }) }
export function dropCarried(): void { void room.send('dropCarried', {}) }
export function sellCarried(): void { void room.send('sellCarried', {}) }
