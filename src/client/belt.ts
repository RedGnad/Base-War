import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { Belt, BELT_LENGTH, CENTER, BELT_HEIGHT } from '../shared/schemas'
import { room } from '../shared/messages'
import { crate, formatIncome } from '../shared/loot-table'
import { HUE } from './theme'

export const beltView = {
  annonce: '',
  annonceJusqua: 0,
  /**
   * The announcement carries the crate's OWN colour. A single yellow for every tier makes
   * a Basic and an Epic read the same, so the alert stops meaning anything: the point of
   * announcing a rare spawn is that it looks rare.
   */
  annonceColor: '#f5a524',
  annonceTier: 0
}

/**
 * World-label colours, built where they are used.
 *
 * The shared token object is constructed at module load, and the bundler emits these
 * modules with lazy initialisers whose order is its own business: reading it from a
 * function that runs before its module was touched threw every frame. Anything read
 * outside the interface tree therefore builds its own colour from the same hex.
 */
const NOIR = Color3.create(0, 0, 0)
const VERT = Color4.fromHexString(HUE.money + 'ff')

type View = { item: Entity; label: Entity; nom: Entity }
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
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: `Buy ${r.name}  ${formatIncome(b.price)}` } }
          ]
        })

        // The label rides the crate rather than the interface.
        //
        // Two lines and two colours, because one TextShape carries one colour: the price
        // in the money green above the name in white, both outlined in black so they hold
        // over sky, ground or another player. 3D text is the only place Decentraland
        // offers an outline at all, which is the second reason the reading lives here.
        const label = engine.addEntity()
        Transform.create(label, { position: Vector3.create(t.position.x, t.position.y + 1.24, t.position.z), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(label, {})
        TextShape.create(label, {
          text: formatIncome(b.price), fontSize: 4.2, textColor: VERT,
          outlineWidth: 0.22, outlineColor: NOIR
        })

        const nom = engine.addEntity()
        Transform.create(nom, { position: Vector3.create(t.position.x, t.position.y + 0.86, t.position.z), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(nom, {})
        TextShape.create(nom, {
          text: r.name, fontSize: 3, textColor: c,
          outlineWidth: 0.22, outlineColor: NOIR
        })

        v = { item, label, nom }
        views.set(b.articleId, v)
      }

      const to = Transform.getMutableOrNull(v.item)
      if (to !== null) to.position = Vector3.create(t.position.x, t.position.y, t.position.z)
      const te = Transform.getMutableOrNull(v.label)
      if (te !== null) te.position = Vector3.create(t.position.x, t.position.y + 1.24, t.position.z)
      const tn = Transform.getMutableOrNull(v.nom)
      if (tn !== null) tn.position = Vector3.create(t.position.x, t.position.y + 0.86, t.position.z)

      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.item)
      ) {
        void room.send('buyBelt', { articleId: b.articleId })
      }
    }

    for (const [id, v] of views) {
      if (vivants.has(id)) continue
      engine.removeEntity(v.item)
      engine.removeEntity(v.label)
      engine.removeEntity(v.nom)
      views.delete(id)
    }

    if (beltView.annonce !== '' && Date.now() > beltView.annonceJusqua) beltView.annonce = ''
  })

  room.onMessage('beltAlert', (d) => {
    const r = crate(d.crateTier)
    beltView.annonce = `${r.name} on the belt!`
    beltView.annonceColor = r.color
    beltView.annonceTier = d.crateTier
    // A rarer crate stays on screen longer: it deserves more attention, and it is also
    // the one worth crossing the venue for.
    beltView.annonceJusqua = Date.now() + 5000 + d.crateTier * 2000
    console.log(`[CLIENT] announced: ${r.name}`)
  })

  room.onMessage('bought', (d) => {
    console.log(`[CLIENT] ${d.byName} grabbed a ${crate(d.crateTier).name} for ${d.price}`)
  })
}
