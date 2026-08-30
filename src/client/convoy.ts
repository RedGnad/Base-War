import { caisse, demolir } from './toy'
import {
  engine, Transform, MeshCollider, TextShape, Billboard, BillboardMode, Entity,
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
        MeshCollider.setBox(body)
        caisse(body, c.crateTier)
        const label = engine.addEntity()
        Transform.create(label, { position: Vector3.create(0, -5, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
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
      // Carried half a metre off the ground whatever its size, the label riding above it.
      if (tc !== null) tc.position = Vector3.create(x, 0.5 + b.size / 2, z)
      const te = Transform.getMutableOrNull(v.label)
      if (te !== null) te.position = Vector3.create(x, 0.5 + b.size + 0.6, z)

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
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: mine ? 'Yours' : `Outbid  ${price}` } }
          ]
        })
      }

      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.body)
      ) {
        if (mine) alerter('THIS ONE IS ALREADY YOURS', '#ffd166', 2500)
        else void room.send('outbid', { convoyId: c.convoyId })
      }
    }

    for (const [id, v] of [...views]) {
      if (vivants.has(id)) continue
      demolir(v.body)
      engine.removeEntity(v.label)
      views.delete(id)
    }
  })
}

/** The convoy within reach of the player, with the price it would take to outbid it. */
export const CONVOY_REACH = 3
export function convoiAPortee(): { convoyId: number; price: number; mine: boolean } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (t === null) return null
  const moi = monAdresseClient()
  let best: { convoyId: number; price: number; mine: boolean } | null = null
  let dist = CONVOY_REACH
  for (const [, c] of engine.getEntitiesWith(Convoy)) {
    const v = views.get(c.convoyId)
    if (v === undefined) continue
    const bt = Transform.getOrNull(v.body)
    if (bt === null) continue
    const d = Math.hypot(t.position.x - bt.position.x, t.position.z - bt.position.z)
    if (d < dist) { dist = d; best = { convoyId: c.convoyId, price: Math.ceil(c.pricePaid * CONVOY_OUTBID), mine: c.owner.toLowerCase() === moi } }
  }
  return best
}
export function surencherir(convoyId: number): void { void room.send('outbid', { convoyId }) }
