import { TOY, plastic } from './toy'
import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, BillboardMode, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { Belt, BELT_LENGTH, CENTER, BELT_HEIGHT, beltPosition, BELT_DURATION_S } from '../shared/schemas'
import { room } from '../shared/messages'
import { crate, formatIncome, ligneDeCaisse } from '../shared/loot-table'
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

type View = { racine: Entity; item: Entity; label: Entity; nom: Entity; rendement: Entity; progres: number; vu: number }
const views = new Map<number, View>()

export function setupBelt(): void {
  const bande = engine.addEntity()
  Transform.create(bande, {
    position: Vector3.create(CENTER.x, BELT_HEIGHT, CENTER.z),
    scale: Vector3.create(BELT_LENGTH + 2, 0.35, 2.6)
  })
  MeshRenderer.setBox(bande)
  MeshCollider.setBox(bande)
  Material.setPbrMaterial(bande, plastic(TOY.belt))

  for (let i = -3; i <= 3; i++) {
    const pied = engine.addEntity()
    Transform.create(pied, {
      position: Vector3.create(CENTER.x + i * ((BELT_LENGTH + 2) / 7), BELT_HEIGHT / 2, CENTER.z),
      scale: Vector3.create(0.3, BELT_HEIGHT, 0.3)
    })
    MeshRenderer.setBox(pied)
    MeshCollider.setBox(pied)
    Material.setPbrMaterial(pied, plastic(TOY.beltLeg))
  }
  for (const dz of [-1.42, 1.42]) {
    const r = engine.addEntity()
    Transform.create(r, {
      position: Vector3.create(CENTER.x, BELT_HEIGHT + 0.3, CENTER.z + dz),
      scale: Vector3.create(BELT_LENGTH + 2, 0.24, 0.16)
    })
    MeshRenderer.setBox(r)
    Material.setPbrMaterial(r, plastic(TOY.beltRail))
  }

  const bx = CENTER.x + BELT_LENGTH / 2 + 1.3
  const R = 2.2

  const fond = engine.addEntity()
  Transform.create(fond, { position: Vector3.create(bx, 0.1, CENTER.z), scale: Vector3.create(R * 2, 0.2, R * 2) })
  MeshRenderer.setBox(fond)
  MeshCollider.setBox(fond)
  Material.setPbrMaterial(fond, plastic(TOY.beltPit))

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
    Material.setPbrMaterial(m, plastic(TOY.beltRing))
  }

  /*
    Drawn from `progres`, advanced locally, corrected by the network.

    Each crate is one parent entity that carries the box, the price, the name and the yield as
    children at fixed offsets, so moving a crate is one Transform write a frame instead of
    four. Between two values from the server the client advances `progres` itself at the same
    rate the server does (`dt / BELT_DURATION_S`), and when a fresh value arrives it snaps to
    it only if the drift is large; small drift is folded in over the next frames. The result
    is a crate that glides even when the server is late, and stops where the server says.
  */
  engine.addSystem((dt) => {
    const vivants = new Set<number>()

    for (const [ent, b] of engine.getEntitiesWith(Belt)) {
      vivants.add(b.articleId)
      let v = views.get(b.articleId)
      if (!v) {
        const r = crate(b.crateTier)
        const c = Color4.fromHexString(r.color + 'ff')
        const p0 = beltPosition(b.progres)

        const racine = engine.addEntity()
        Transform.create(racine, { position: Vector3.create(p0.x, p0.y, p0.z) })

        const item = engine.addEntity()
        Transform.create(item, { parent: racine, scale: Vector3.create(r.size, r.size, r.size) })
        MeshRenderer.setBox(item)
        MeshCollider.setBox(item)
        Material.setPbrMaterial(item, { albedoColor: c, emissiveColor: c, emissiveIntensity: 0.6, roughness: 0.45, metallic: 0 })
        PointerEvents.create(item, {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: `Buy ${r.name}  ${formatIncome(b.price)}  ·  ${ligneDeCaisse(b.crateTier)}` } }
          ]
        })

        const label = engine.addEntity()
        Transform.create(label, { parent: racine, position: Vector3.create(0, 1.24, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
        TextShape.create(label, { text: formatIncome(b.price), fontSize: 4.2, textColor: VERT, outlineWidth: 0.22, outlineColor: NOIR })

        const nom = engine.addEntity()
        Transform.create(nom, { parent: racine, position: Vector3.create(0, 0.86, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(nom, { billboardMode: BillboardMode.BM_Y })
        TextShape.create(nom, { text: r.name, fontSize: 3, textColor: c, outlineWidth: 0.22, outlineColor: NOIR })

        const rendement = engine.addEntity()
        Transform.create(rendement, { parent: racine, position: Vector3.create(0, 0.58, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(rendement, { billboardMode: BillboardMode.BM_Y })
        TextShape.create(rendement, { text: ligneDeCaisse(b.crateTier), fontSize: 2.2, textColor: VERT, outlineWidth: 0.22, outlineColor: NOIR })

        v = { racine, item, label, nom, rendement, progres: b.progres, vu: b.progres }
        views.set(b.articleId, v)
      }

      // Advance locally; when the server's value moves, converge on it.
      v.progres += dt / BELT_DURATION_S
      if (b.progres !== v.vu) {
        v.vu = b.progres
        const ecart = b.progres - v.progres
        if (Math.abs(ecart) > 0.05) v.progres = b.progres
        else v.progres += ecart * 0.5
      }
      const tr = Transform.getMutableOrNull(v.racine)
      if (tr !== null) {
        const p = beltPosition(v.progres)
        tr.position = Vector3.create(p.x, p.y, p.z)
      }

      if (
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.item)
      ) {
        void room.send('buyBelt', { articleId: b.articleId })
      }
    }

    for (const [id, v] of views) {
      if (vivants.has(id)) continue
      engine.removeEntityWithChildren(v.racine)
      views.delete(id)
    }

    if (beltView.annonce !== '' && Date.now() > beltView.annonceJusqua) beltView.annonce = ''
  })

  room.onMessage('beltAlert', (d) => {
    const r = crate(d.crateTier)
    beltView.annonce = `${r.name} on the belt!  ${ligneDeCaisse(d.crateTier)}`
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
