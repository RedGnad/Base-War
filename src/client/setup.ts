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
import { getPlayer } from '@dcl/sdk/players'
import { PlayerTaps, ServerBeat, BEAT_DEAD_AFTER_MS } from '../shared/schemas'
import { room } from '../shared/messages'
import { spawnTestAvatars } from '../spikes/avatars'
import { setupTouchHud, reportPlatform, applyThiefPenalty } from '../spikes/locomotion'

/** Etat d'affichage, lu par l'UI. */
export const view = {
  count: 0,
  serverAlive: false,
  /** derniere valeur de battement observee, et l'instant CLIENT ou on l'a vue changer */
  lastBeatValue: 0,
  lastBeatSeenAt: 0,
  taps: 0
}

/** SPIKE 1.2: nombre d'avatars de test. 0 = mesure de reference. */
export const SPIKE_AVATARS = 8

export function startClient(): void {
  console.log('[CLIENT] demarrage')
  if (SPIKE_AVATARS > 0) spawnTestAvatars(SPIKE_AVATARS)
  setupTouchHud()
  reportPlatform()
  applyThiefPenalty(false)

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

  // tapAck ne sert qu'au retour immediat. Il ne peut PAS etre la source de verite:
  // au rechargement, le client repart a zero et n'en recevra plus avant d'agir.
  room.onMessage('tapAck', (data) => {
    view.count = data.count
    console.log(`[CLIENT] tapAck: count=${data.count}`)
  })

  // SOURCE DE VERITE: le composant synchronise, publie par le serveur des notre entree.
  // On retrouve la sienne par le champ playerId, jamais par un identifiant de synchronisation.
  let myAddress = ''
  engine.addSystem(() => {
    if (myAddress === '') {
      const me = getPlayer()
      if (me === null) return // pas encore resolu au demarrage
      myAddress = me.userId.toLowerCase()
      console.log(`[CLIENT] mon adresse: ${myAddress}`)
    }
    for (const [, taps] of engine.getEntitiesWith(PlayerTaps)) {
      if (taps.playerId.toLowerCase() === myAddress) {
        if (taps.count !== view.count) {
          console.log(`[CLIENT] etat restitue depuis le serveur: ${taps.count}`)
          view.count = taps.count
        }
        return
      }
    }
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
