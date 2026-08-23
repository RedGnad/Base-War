import {
  engine, Transform, MeshRenderer, MeshCollider, Material,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { PlayerTaps, ServerBeat, BEAT_DEAD_AFTER_MS } from '../shared/schemas'
import { room } from '../shared/messages'
import { spawnTestAvatars } from '../spikes/avatars'
import { setupTouchHud, reportPlatform, applyThiefPenalty } from '../spikes/locomotion'
import { setupCrate } from './crate'
import { setupPlots } from './plots'

/** Etat d'affichage, lu par l'UI. */
export const view = {
  objets: 0,
  serverAlive: false,
  lastBeatValue: 0,
  lastBeatSeenAt: 0,
  malusActif: false
}

/** SPIKE 1.2: avatars de mesure. 0 = mesure de reference. */
export const SPIKE_AVATARS = 8

export function startClient(): void {
  console.log('[CLIENT] demarrage')
  if (SPIKE_AVATARS > 0) spawnTestAvatars(SPIKE_AVATARS)
  setupTouchHud()
  reportPlatform()
  applyThiefPenalty(false)

  setupCrate()
  setupPlots()

  // SPIKE 1.3: caisse rouge qui bascule le malus du voleur, pour le juger a l'oeil.
  const toggle = engine.addEntity()
  Transform.create(toggle, { position: Vector3.create(22, 1, 16), scale: Vector3.create(1, 1, 1) })
  MeshRenderer.setBox(toggle)
  MeshCollider.setBox(toggle)
  Material.setPbrMaterial(toggle, { albedoColor: Color4.fromHexString('#c03030ff') })
  PointerEvents.create(toggle, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Basculer le malus voleur' } }
    ]
  })
  let malus = false
  engine.addSystem(() => {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, toggle)) {
      malus = !malus
      applyThiefPenalty(malus)
      view.malusActif = malus
    }
  })

  // SOURCE DE VERITE: le composant synchronise, publie par le serveur des notre entree.
  let myAddress = ''
  engine.addSystem(() => {
    if (myAddress === '') {
      const me = getPlayer()
      if (me === null) return
      myAddress = me.userId.toLowerCase()
      console.log(`[CLIENT] mon adresse: ${myAddress}`)
    }
    for (const [, taps] of engine.getEntitiesWith(PlayerTaps)) {
      if (taps.playerId.toLowerCase() === myAddress) {
        if (taps.count !== view.objets) {
          console.log(`[CLIENT] total objets restitue: ${taps.count}`)
          view.objets = taps.count
        }
        return
      }
    }
  })

  // Vivacite du serveur: on suit l'instant CLIENT du dernier CHANGEMENT de valeur.
  // Un instantane CRDT laisse par un serveur eteint porte un horodatage credible
  // mais ne change plus, donc il ne peut pas se faire passer pour vivant.
  engine.addSystem(() => {
    let value = 0
    for (const [, b] of engine.getEntitiesWith(ServerBeat)) value = b.at > value ? b.at : value
    const now = Date.now()
    if (value !== 0 && value !== view.lastBeatValue) {
      view.lastBeatValue = value
      view.lastBeatSeenAt = now
    }
    view.serverAlive = view.lastBeatSeenAt !== 0 && now - view.lastBeatSeenAt < BEAT_DEAD_AFTER_MS
  })
}
