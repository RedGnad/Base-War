import {
  engine, Transform, MeshRenderer, MeshCollider, Material, PointerEvents, PointerEventType,
  InputAction, inputSystem, TextShape, Billboard, BillboardMode, Entity, LightSource
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { Fusion, FUSION_POS, FUSION_NEEDS } from '../shared/schemas'
import { room } from '../shared/messages'
import { RARITIES, rarityOf, mutationDe, itemName, itemColor } from '../shared/loot-table'
import { plasticDe, plastic, vif, TOY } from './toy'
import { carryView } from './carry'
import { alerter, pushToFeed } from './theft'
import { openFusion } from './fusion-ui'

/**
 * The fusion machine, client side: a drum on a plinth beside the records board, three
 * sockets on its face and a dome on top.
 *
 * What it shows is decided by two sources. The sockets are YOURS: they light with what you
 * have fed so far, read from the per-player state the server sends. The dome is EVERYONE'S:
 * it takes the colour of the last thing that came out of the machine, for a while, so a
 * player crossing the plaza sees that somebody just made a Rare, which is the point of
 * putting the machine where people walk.
 */
export const fusionView = { codes: [] as number[] }

const NOIR = Color3.create(0, 0, 0)
const DOME_BRILLE_MS = 45_000
const AMPOULE = 16000

function couleur(rarete: number, mut = 0): Color4 {
  return vif(itemColor(Math.max(0, Math.min(rarete, RARITIES.length - 1)), mut))
}

export function setupFusion(): void {
  const racine = engine.addEntity()
  Transform.create(racine, { position: Vector3.create(FUSION_POS.x, 0, FUSION_POS.z) })

  const socle = engine.addEntity()
  Transform.create(socle, { parent: racine, position: Vector3.create(0, 0.15, 0), scale: Vector3.create(2.6, 0.3, 2.6) })
  MeshRenderer.setBox(socle)
  MeshCollider.setBox(socle)
  Material.setPbrMaterial(socle, plastic(TOY.plinth))

  const tambour = engine.addEntity()
  Transform.create(tambour, { parent: racine, position: Vector3.create(0, 1.1, 0), scale: Vector3.create(1.8, 1.6, 1.8) })
  MeshRenderer.setCylinder(tambour, 0.5, 0.5)
  MeshCollider.setCylinder(tambour, 0.5, 0.5)
  Material.setPbrMaterial(tambour, plastic(TOY.belt))
  PointerEvents.create(tambour, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: `Fuser  ·  ${FUSION_NEEDS} of a kind become one better` } }
    ]
  })

  const dome = engine.addEntity()
  Transform.create(dome, { parent: racine, position: Vector3.create(0, 2.35, 0), scale: Vector3.create(1.3, 1.3, 1.3) })
  MeshRenderer.setSphere(dome)
  Material.setPbrMaterial(dome, plasticDe(TOY.glass, 0))
  const lampe = engine.addEntity()
  Transform.create(lampe, { parent: dome })

  const prises: Entity[] = []
  for (let i = 0; i < FUSION_NEEDS; i++) {
    const p = engine.addEntity()
    Transform.create(p, { parent: racine, position: Vector3.create((i - 1) * 0.5, 1.15, -0.92), scale: Vector3.create(0.3, 0.3, 0.3) })
    MeshRenderer.setSphere(p)
    Material.setPbrMaterial(p, plastic(TOY.beltRing))
    prises.push(p)
  }

  const titre = engine.addEntity()
  Transform.create(titre, { parent: racine, position: Vector3.create(0, 3.5, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
  Billboard.create(titre, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(titre, { text: 'FUSER', fontSize: 5, textColor: Color4.fromHexString(TOY.beltRail + 'ff'), outlineWidth: 0.22, outlineColor: NOIR })
  const ligne = engine.addEntity()
  Transform.create(ligne, { parent: racine, position: Vector3.create(0, 3.1, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
  Billboard.create(ligne, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(ligne, { text: `${FUSION_NEEDS} of a kind become one better  ·  tap it to fuse from your base`, fontSize: 2.4, textColor: Color4.White(), outlineWidth: 0.22, outlineColor: NOIR })

  room.onMessage('fusionState', (d) => {
    fusionView.codes = [...d.codes]
    if (d.made >= 0) {
      alerter(`FUSED  ·  a ${itemName(rarityOf(d.made), mutationDe(d.made)).toUpperCase()} is in your hand`, '#4dd2ff', 5000)
    }
  })
  room.onMessage('fused', (d) => {
    pushToFeed(`${d.byName} fused a ${itemName(d.rarity, d.mutation)}`)
  })

  let dessine = ''
  engine.addSystem(() => {
    // A toy in hand feeds the machine; empty hands open the panel that fuses from the shelves.
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, tambour)) {
      if (carryView.code < 0) openFusion()
      else void room.send('feedFusion', {})
    }

    let f: { byName: string; rarity: number; count: number; lastName: string; lastCode: number; atMs: number } | null = null
    for (const [, v] of engine.getEntitiesWith(Fusion)) { f = v; break }
    const now = Date.now()
    const brille = f !== null && f.lastCode >= 0 && now - f.atMs < DOME_BRILLE_MS
    const mienne = fusionView.codes.length
    const rareteMienne = mienne > 0 ? rarityOf(fusionView.codes[0]) : -1
    // One string for everything drawn, rewritten only when it changes: a material or a light
    // written every frame is a network update every frame.
    const cle = `${mienne}|${rareteMienne}|${brille ? f!.lastCode : -1}|${f?.count ?? 0}|${f?.rarity ?? -1}|${f?.byName ?? ''}`
    if (cle === dessine) return
    dessine = cle

    for (let i = 0; i < prises.length; i++) {
      const plein = i < mienne
      Material.setPbrMaterial(prises[i], plein ? plasticDe(couleur(rareteMienne), 1.4) : plastic(TOY.beltRing))
    }
    if (brille && f !== null) {
      const c = couleur(rarityOf(f.lastCode), mutationDe(f.lastCode))
      Material.setPbrMaterial(dome, plasticDe(Color4.create(c.r, c.g, c.b, 0.55), 1.6))
      LightSource.createOrReplace(lampe, { type: LightSource.Type.Point({}), color: Color3.create(c.r, c.g, c.b), intensity: AMPOULE * 3, range: 6, shadow: false })
    } else {
      Material.setPbrMaterial(dome, plasticDe(TOY.glass, 0))
      if (LightSource.has(lampe)) LightSource.deleteFrom(lampe)
    }
    const t = TextShape.getMutableOrNull(ligne)
    if (t !== null) {
      t.text = brille && f !== null
        ? `${f.lastName} made a ${itemName(rarityOf(f.lastCode), mutationDe(f.lastCode))}`
        : mienne > 0
          ? `yours: ${mienne}/${FUSION_NEEDS} ${RARITIES[rareteMienne]?.name ?? ''}`
          : `${FUSION_NEEDS} of a kind become one better  ·  tap it to fuse from your base`
    }
  })
}
