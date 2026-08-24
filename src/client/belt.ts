import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Belt, BELT_LENGTH, CENTER, BELT_HEIGHT } from '../shared/schemas'
import { room } from '../shared/messages'
import { crate } from '../shared/loot-table'

export const beltView = { annonce: '', annonceJusqua: 0 }

type View = { item: Entity; label: Entity }
const views = new Map<number, View>()

export function setupBelt(): void {
  const bande = engine.addEntity()
  Transform.create(bande, {
    position: Vector3.create(CENTER.x, BELT_HEIGHT, CENTER.z),
    scale: Vector3.create(BELT_LENGTH + 2, 0.35, 2.6)
  })
  MeshRenderer.setBox(bande)
  MeshCollider.setBox(bande)
  Material.setPbrMaterial(bande, { albedoColor: Color4.fromHexString('#8e2b2bff'), roughness: 0.8 })

  for (let i = -3; i <= 3; i++) {
    const pied = engine.addEntity()
    Transform.create(pied, {
      position: Vector3.create(CENTER.x + i * ((BELT_LENGTH + 2) / 7), BELT_HEIGHT / 2, CENTER.z),
      scale: Vector3.create(0.3, BELT_HEIGHT, 0.3)
    })
    MeshRenderer.setBox(pied)
    MeshCollider.setBox(pied)
    Material.setPbrMaterial(pied, { albedoColor: Color4.fromHexString('#3f4650ff'), roughness: 0.9 })
  }
  for (const dz of [-1.42, 1.42]) {
    const r = engine.addEntity()
    Transform.create(r, {
      position: Vector3.create(CENTER.x, BELT_HEIGHT + 0.3, CENTER.z + dz),
      scale: Vector3.create(BELT_LENGTH + 2, 0.24, 0.16)
    })
    MeshRenderer.setBox(r)
    Material.setPbrMaterial(r, { albedoColor: Color4.fromHexString('#5a6270ff'), roughness: 0.85 })
  }

  const bx = CENTER.x + BELT_LENGTH / 2 + 1.3
  const R = 2.2

  const fond = engine.addEntity()
  Transform.create(fond, { position: Vector3.create(bx, 0.1, CENTER.z), scale: Vector3.create(R * 2, 0.2, R * 2) })
  MeshRenderer.setBox(fond)
  MeshCollider.setBox(fond)
  Material.setPbrMaterial(fond, { albedoColor: Color4.fromHexString('#0d0c0aff'), roughness: 1 })

  const H = 0.9
  for (const [dx, dz, sx, sz] of [
    [0, R, R * 2, 0.2], [0, -R, R * 2, 0.2],
    [R, 0, 0.2, R * 2], [-R, 0, 0.2, R * 2]
  ]) {
    const m = engine.addEntity()
    Transform.create(m, {
      position: Vector3.create(bx + dx, H / 2, CENTER.z + dz),
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
      let v = views.get(b.articleId)
      if (!v) {
        const r = crate(b.crateTier)
        const item = engine.addEntity()
        Transform.create(item, { position: Vector3.create(t.position.x, t.position.y, t.position.z), scale: Vector3.create(r.size, r.size, r.size) })
        MeshRenderer.setBox(item)
        MeshCollider.setBox(item)
        const c = Color4.fromHexString(r.color + 'ff')
        Material.setPbrMaterial(item, { albedoColor: c, emissiveColor: c, emissiveIntensity: 0.45, metallic: 0.6, roughness: 0.35 })
        PointerEvents.create(item, {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: `${r.name}: ${b.price} coins` } },
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: `${r.name}: ${b.price} coins` } }
          ]
        })

        const label = engine.addEntity()
        Transform.create(label, { position: Vector3.create(t.position.x, t.position.y + 0.9, t.position.z), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(label, {})
        TextShape.create(label, { text: `${r.name}\n${b.price}`, fontSize: 3, textColor: c })

        v = { item, label }
        views.set(b.articleId, v)
      }

      const to = Transform.getMutableOrNull(v.item)
      if (to !== null) to.position = Vector3.create(t.position.x, t.position.y, t.position.z)
      const te = Transform.getMutableOrNull(v.label)
      if (te !== null) te.position = Vector3.create(t.position.x, t.position.y + 0.9, t.position.z)

      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.item) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.item)
      ) {
        void room.send('buyBelt', { articleId: b.articleId })
      }
    }

    for (const [id, v] of views) {
      if (vivants.has(id)) continue
      engine.removeEntity(v.item)
      engine.removeEntity(v.label)
      views.delete(id)
    }

    if (beltView.annonce !== '' && Date.now() > beltView.annonceJusqua) beltView.annonce = ''
  })

  room.onMessage('beltAlert', (d) => {
    const r = crate(d.crateTier)
    beltView.annonce = `${r.name} on the belt!`
    beltView.annonceJusqua = Date.now() + 7000
    console.log(`[CLIENT] annonce: ${r.name}`)
  })

  room.onMessage('bought', (d) => {
    console.log(`[CLIENT] ${d.byName} grabbed a ${crate(d.crateTier).name} for ${d.price}`)
  })
}
