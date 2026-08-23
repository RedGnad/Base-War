import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem, Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { plotPosition, MAX_BASES } from '../shared/schemas'
import { room } from '../shared/messages'

/**
 * LES PLACES LIBRES. Le joueur choisit ou il s'installe: pres du tapis pour acheter
 * vite, ou a l'ecart pour se faire oublier. C'est une decision, pas une attribution.
 *
 * Une place libre doit se voir DE LOIN, sinon un arrivant ne sait pas qu'il peut se
 * poser et reste spectateur.
 */

type Marqueur = { socle: Entity; balise: Entity; texte: Entity }
const marqueurs = new Map<number, Marqueur>()
let libres: number[] = []

function creer(place: number): Marqueur {
  const p = plotPosition(place)

  // Une DALLE DISCRETE, pas l'emprise entiere. Afficher les 9,6 m de chaque place
  // libre couvrait le lieu d'un tapis de beton continu: le repere doit etre la balise,
  // pas la surface. On garde juste de quoi viser au doigt.
  const socle = engine.addEntity()
  Transform.create(socle, { position: Vector3.create(p.x, 0.09, p.z), scale: Vector3.create(2.4, 0.18, 2.4) })
  MeshRenderer.setBox(socle)
  MeshCollider.setBox(socle)
  Material.setPbrMaterial(socle, {
    albedoColor: Color4.fromHexString('#6b5f2eff'),
    emissiveColor: Color4.fromHexString('#ffd166ff'),
    emissiveIntensity: 0.5
  })
  PointerEvents.create(socle, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Poser ma base ici' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Poser ma base ici' } }
    ]
  })

  // Une balise verticale qui monte et descend: visible par-dessus les autres batiments.
  const balise = engine.addEntity()
  Transform.create(balise, { position: Vector3.create(p.x, 2.4, p.z), scale: Vector3.create(0.22, 4.4, 0.22) })
  MeshRenderer.setBox(balise)
  Material.setPbrMaterial(balise, {
    albedoColor: Color4.fromHexString('#ffd166ff'),
    emissiveColor: Color4.fromHexString('#ffd166ff'),
    emissiveIntensity: 1.2
  })
  Tween.createOrReplace(balise, {
    mode: Tween.Mode.Move({
      start: Vector3.create(p.x, 2.0, p.z),
      end: Vector3.create(p.x, 2.8, p.z)
    }),
    duration: 1400,
    easingFunction: EasingFunction.EF_EASESINE
  })
  TweenSequence.createOrReplace(balise, { sequence: [], loop: TweenLoop.TL_YOYO })

  const texte = engine.addEntity()
  Transform.create(texte, { position: Vector3.create(p.x, 5.4, p.z), scale: Vector3.create(0.55, 0.55, 0.55) })
  Billboard.create(texte, {})
  TextShape.create(texte, { text: 'LIBRE', fontSize: 3, textColor: Color4.fromHexString('#ffd166ff') })

  return { socle, balise, texte }
}

function detruire(m: Marqueur): void {
  engine.removeEntity(m.socle)
  engine.removeEntity(m.balise)
  engine.removeEntity(m.texte)
}

export function setupSlots(): void {
  room.onMessage('freeSlots', (d) => {
    libres = [...d.places]
    const set = new Set(libres)
    for (const place of libres) if (!marqueurs.has(place)) marqueurs.set(place, creer(place))
    for (const [place, m] of marqueurs) {
      if (set.has(place)) continue
      detruire(m)
      marqueurs.delete(place)
    }
  })

  engine.addSystem(() => {
    for (const [place, m] of marqueurs) {
      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, m.socle) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, m.socle)
      ) {
        void room.send('claimSlot', { place })
        return
      }
    }
  })
}
