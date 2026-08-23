import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  PointerEvents,
  PointerEventType,
  InputAction,
  Material,
  inputSystem
} from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { ServerBeat, BEAT_DEAD_AFTER_MS } from '../shared/schemas'
import { room } from '../shared/messages'

/** Etat d'affichage, lu par l'UI. */
export const view = {
  count: 0,
  serverAlive: false,
  /** derniere valeur de battement observee, et l'instant CLIENT ou on l'a vue changer */
  lastBeatValue: 0,
  lastBeatSeenAt: 0,
  taps: 0
}

export function startClient(): void {
  console.log('[CLIENT] demarrage')

  // Entite d'execution: le composite est en mode edition et la scene peut etre ouverte
  // dans le Creator Hub. Ce cube est du code de spike, il sera remplace par une entite
  // du composite quand on passera au vrai contenu.
  const box = engine.addEntity()
  Transform.create(box, { position: { x: 16, y: 1, z: 16 }, scale: { x: 1.5, y: 1.5, z: 1.5 } })
  MeshRenderer.setBox(box)
  MeshCollider.setBox(box)
  Material.setPbrMaterial(box, { albedoColor: Color4.fromHexString('#e0a030ff') })
  PointerEvents.create(box, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Taper' }
      }
    ]
  })

  engine.addSystem(() => {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, box)) {
      view.taps += 1
      console.log(`[CLIENT] tap #${view.taps} envoye`)
      void room.send('tap', {})
    }
  })

  room.onMessage('tapAck', (data) => {
    view.count = data.count
    console.log(`[CLIENT] tapAck: count=${data.count}`)
  })

  // Vivacite du serveur: on suit l'instant CLIENT du dernier CHANGEMENT de valeur.
  // Un instantane CRDT laisse par un serveur eteint porte un horodatage credible
  // mais ne change plus, donc il ne peut pas se faire passer pour vivant.
  engine.addSystem(() => {
    const beat = ServerBeat.getOrNull(engine.RootEntity)
    const all = engine.getEntitiesWith(ServerBeat)
    let value = beat?.at ?? 0
    for (const [, b] of all) value = b.at > value ? b.at : value

    const now = Date.now()
    if (value !== 0 && value !== view.lastBeatValue) {
      view.lastBeatValue = value
      view.lastBeatSeenAt = now
    }
    view.serverAlive = view.lastBeatSeenAt !== 0 && now - view.lastBeatSeenAt < BEAT_DEAD_AFTER_MS
  })
}
