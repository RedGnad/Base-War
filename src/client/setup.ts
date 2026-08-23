import {
  engine, Transform, MeshRenderer, MeshCollider, Material, SkyboxTime,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { Plot, ServerBeat, BEAT_DEAD_AFTER_MS, CENTRE } from '../shared/schemas'
import { room } from '../shared/messages'
import { spawnTestAvatars } from '../spikes/avatars'
import { setupTouchHud, reportPlatform, applyThiefPenalty } from '../spikes/locomotion'
import { setupBox } from './box'
import { setupPlots } from './plots'
import { setupTheft } from './theft'
import { setupBelt } from './belt'
import { setupSlots } from './slots'

/** Etat d'affichage, lu par l'UI. */
export const view = {
  objets: 0,
  serverAlive: false,
  lastBeatValue: 0,
  lastBeatSeenAt: 0,
  malusActif: false,
  etages: 1
}

/** SPIKE 1.2: avatars de mesure. 0 = mesure de reference. */
export const SPIKE_AVATARS = 8

export function startClient(): void {
  console.log('[CLIENT] demarrage')
  room.onMessage('serverLog', (d) => console.log(`[SERVER] ${d.line}`))
  if (SPIKE_AVATARS > 0) spawnTestAvatars(SPIKE_AVATARS)
  setupTouchHud()
  reportPlatform()
  applyThiefPenalty(false)

  // HEURE FIXE. Sans ca le ciel suit l'heure du monde: un juge qui visite la nuit
  // verrait une scene noire, et notre premiere impression serait une loterie.
  // 16h00 = 57600 s: lumiere chaude et rasante, ombres longues, le meilleur eclairage
  // pour lire un batiment et ses etages.
  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 57600 })

  setupBox()
  setupPlots()
  setupTheft()
  setupBelt()
  setupSlots()

  // SPIKE 1.3: caisse rouge qui bascule le malus du voleur, pour le juger a l'oeil.
  const toggle = engine.addEntity()
  Transform.create(toggle, { position: Vector3.create(CENTRE.x + 6, 1, CENTRE.z), scale: Vector3.create(1, 1, 1) })
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
    // Source de verite: MA base, publiee par le serveur. Le compteur du spike 1.1
    // (PlayerTaps) est retire: il comptait les taps, pas les objets, et il mentait.
    for (const [, p] of engine.getEntitiesWith(Plot)) {
      if (p.ownerId.toLowerCase() !== myAddress) continue
      if (p.items.length !== view.objets || p.etages !== view.etages) {
        view.objets = p.items.length
        view.etages = p.etages
        console.log(`[CLIENT] ma base: ${view.objets} objets, ${view.etages} etage(s)`)
      }
      return
    }
  })

  // Vivacite du serveur: on suit l'instant CLIENT du dernier CHANGEMENT de valeur.
  // Un instantane CRDT laisse par un serveur eteint porte un horodatage credible
  // mais ne change plus, donc il ne peut pas se faire passer pour vivant.
  // UN SEUL changement observe ne prouve RIEN: un instantane CRDT laisse par un serveur
  // mort porte une valeur credible, et la voir pour la premiere fois ressemble a un
  // battement. Il faut DEUX changements distincts pour conclure qu'une horloge tourne.
  let changements = 0
  engine.addSystem(() => {
    let value = 0
    for (const [, b] of engine.getEntitiesWith(ServerBeat)) value = b.at > value ? b.at : value
    const now = Date.now()
    if (value !== 0 && value !== view.lastBeatValue) {
      view.lastBeatValue = value
      changements += 1
      if (changements >= 2) view.lastBeatSeenAt = now
    }
    const vivant = view.lastBeatSeenAt !== 0 && now - view.lastBeatSeenAt < BEAT_DEAD_AFTER_MS
    if (vivant !== view.serverAlive) {
      // Transition journalisee: c'est le seul signal fiable pour savoir si l'isolat
      // serveur a demarre, plante, ou s'est eteint faute de joueur.
      console.log(`[CLIENT] serveur ${vivant ? 'VIVANT' : 'SILENCIEUX'} (dernier battement il y a ${view.lastBeatSeenAt === 0 ? 'jamais' : (now - view.lastBeatSeenAt) + ' ms'})`)
    }
    view.serverAlive = vivant
  })
}
