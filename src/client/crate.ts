import {
  engine, Transform, MeshRenderer, MeshCollider, Material, PointerEvents,
  PointerEventType, InputAction, inputSystem, Tween, EasingFunction, TextShape, Billboard
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { Crate, CENTRE } from '../shared/schemas'
import { room } from '../shared/messages'
import { rarity } from '../shared/loot-table'

export const crateView = {
  hits: 0,
  maxHits: 3,
  dernierButin: '',
  dernierParQui: '',
  refus: ''
}

/** Trois etats visuels: intacte, fissuree, sur le point de ceder. */
const ETATS = [
  { couleur: '#c89050', echelle: 1.0 },
  { couleur: '#b06840', echelle: 0.94 },
  { couleur: '#8c3020', echelle: 0.88 }
]

export function setupCrate(): void {
  // Le visuel est LOCAL: le serveur possede l'etat, le client ne fait que le peindre.
  const box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(CENTRE.x, 1, CENTRE.z), scale: Vector3.create(1.6, 1.6, 1.6) })
  MeshRenderer.setBox(box)
  MeshCollider.setBox(box)
  Material.setPbrMaterial(box, { albedoColor: Color4.fromHexString(ETATS[0].couleur + 'ff') })
  PointerEvents.create(box, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Frapper' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Frapper' } }
    ]
  })

  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(CENTRE.x, 2.6, CENTRE.z), scale: Vector3.create(0.6, 0.6, 0.6) })
  Billboard.create(label, {})
  TextShape.create(label, { text: '', fontSize: 3, textColor: Color4.White() })

  // IA_PRIMARY est le bouton central sur mobile (setMainAction), IA_POINTER le clic desktop.
  engine.addSystem(() => {
    const frappe =
      inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, box) ||
      inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, box)
    if (frappe) void room.send('hitCrate', {})
  })

  // Peinture de l'etat autoritaire. On ne declenche la secousse que lorsque le compteur
  // du SERVEUR change: pas d'animation sur un coup que le serveur aurait refuse.
  let vusHits = -1
  let vueBreak = -1
  engine.addSystem(() => {
    for (const [, c] of engine.getEntitiesWith(Crate)) {
      crateView.hits = c.hits
      crateView.maxHits = c.maxHits

      if (c.hits !== vusHits) {
        const casse = c.hits === 0 && vusHits > 0
        vusHits = c.hits
        const e = ETATS[Math.min(c.hits, ETATS.length - 1)]
        Material.setPbrMaterial(box, { albedoColor: Color4.fromHexString(e.couleur + 'ff') })
        const base = Vector3.create(1.6, 1.6, 1.6)
        if (!casse && c.hits > 0) {
          // Pulsation d'echelle: pas de Tween de position, donc aucun risque de
          // teleportation a l'origine si `start` etait omis.
          Tween.createOrReplace(box, {
            mode: Tween.Mode.Scale({ start: Vector3.scale(base, e.echelle * 0.82), end: Vector3.scale(base, e.echelle) }),
            duration: 220,
            easingFunction: EasingFunction.EF_EASEOUTELASTIC,
            currentTime: 0
          })
        } else {
          Tween.createOrReplace(box, {
            mode: Tween.Mode.Scale({ start: Vector3.scale(base, 0.2), end: base }),
            duration: 400,
            easingFunction: EasingFunction.EF_EASEOUTBACK,
            currentTime: 0
          })
        }
        const t = TextShape.getMutableOrNull(label)
        if (t !== null) t.text = c.hits === 0 ? '' : `${c.hits} / ${c.maxHits}`
      }

      if (c.breakSeq !== vueBreak) vueBreak = c.breakSeq
    }
  })

  room.onMessage('crateBroken', (d) => {
    const r = rarity(d.rarity)
    crateView.dernierButin = r.nom
    crateView.dernierParQui = d.byName
    const t = TextShape.getMutableOrNull(label)
    if (t !== null) {
      t.text = `${r.nom}\n${d.byName}`
      t.textColor = Color4.fromHexString(r.couleur + 'ff')
    }
    console.log(`[CLIENT] caisse cassee par ${d.byName}: ${r.nom}`)
  })

  room.onMessage('hitRejected', (d) => {
    crateView.refus = d.raison
    console.log(`[CLIENT] coup refuse: ${d.raison}${d.antiCheat ? ' (anti-triche)' : ''}`)
  })
}
