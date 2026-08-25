import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Convoy, CONVOY_OUTBID } from '../shared/schemas'
import { room } from '../shared/messages'
import { crate, formatIncome } from '../shared/loot-table'
import { alerter, monAdresseClient } from './theft'

type View = { body: Entity; label: Entity; texte: string }
const views = new Map<number, View>()

export function setupConvoy(): void {
  room.onMessage('outbidWon', (d) => {
    alerter(`YOU OUTBID ${d.fromName.toUpperCase()}  ·  ${crate(d.crateTier).name} for ${formatIncome(d.price)}`, '#8fe08f', 5000)
  })
  room.onMessage('outbidLost', (d) => {
    alerter(`${d.byName.toUpperCase()} OUTBID YOU\\nrefunded ${formatIncome(d.rembourse)}`, '#ff6b6b', 6000)
  })
  room.onMessage('convoyArrived', (d) => {
    alerter(`${crate(d.crateTier).name.toUpperCase()} DELIVERED`, '#4dd2ff', 3000)
  })

  engine.addSystem(() => {
    const vivants = new Set<number>()

    for (const [e, c] of engine.getEntitiesWith(Convoy)) {
      vivants.add(c.convoyId)
      let v = views.get(c.convoyId)
      const b = crate(c.crateTier)
      const color = Color4.fromHexString(b.color + 'ff')

      if (v === undefined) {
        const body = engine.addEntity()
        Transform.create(body, { position: Vector3.create(0, -5, 0), scale: Vector3.create(b.size, b.size, b.size) })
        MeshRenderer.setBox(body)
        MeshCollider.setBox(body)
        Material.setPbrMaterial(body, { albedoColor: color, emissiveColor: color, emissiveIntensity: 0.6, metallic: 0.5, roughness: 0.4 })
        const label = engine.addEntity()
        Transform.create(label, { position: Vector3.create(0, -5, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(label, {})
        TextShape.create(label, { text: '', fontSize: 3, textColor: Color4.White() })
        v = { body, label, texte: '' }
        views.set(c.convoyId, v)
      }

      // Position comes from the server's `progres`. Two players must see the convoy in
      // the same place, or a tap that looks well-timed gets rejected.
      const k = Math.max(0, Math.min(1, c.progres))
      const x = c.departX + (c.cibleX - c.departX) * k
      const z = c.departZ + (c.cibleZ - c.departZ) * k
      const tc = Transform.getMutableOrNull(v.body)
      if (tc !== null) tc.position = Vector3.create(x, 1.0, z)
      const te = Transform.getMutableOrNull(v.label)
      if (te !== null) te.position = Vector3.create(x, 2.0, z)

      const mine = c.owner.toLowerCase() === monAdresseClient()
      const price = Math.ceil(c.pricePaid * CONVOY_OUTBID)
      const voulu = mine
        ? `${b.name}\nyours - ${formatIncome(price)} to take it`
        : `${b.name}\n${c.holderName} - OUTBID ${formatIncome(price)}`
      if (voulu !== v.texte) {
        v.texte = voulu
        const ts = TextShape.getMutableOrNull(v.label)
        if (ts !== null) {
          ts.text = voulu
          ts.textColor = mine ? Color4.fromHexString('#8fe08fff') : color
        }
        PointerEvents.createOrReplace(v.body, {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: mine ? 'Yours' : `Outbid  ${price}` } },
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: mine ? 'Yours' : `Outbid  ${price}` } }
          ]
        })
      }

      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.body) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.body)
      ) {
        if (mine) alerter('THIS ONE IS ALREADY YOURS', '#ffd166', 2500)
        else void room.send('outbid', { convoyId: c.convoyId })
      }
    }

    for (const [id, v] of [...views]) {
      if (vivants.has(id)) continue
      engine.removeEntity(v.body)
      engine.removeEntity(v.label)
      views.delete(id)
    }
  })
}
