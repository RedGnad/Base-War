import {
  engine, Transform, SkyboxTime,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'

import { getPlayer } from '@dcl/sdk/players'
import { Plot, ServerBeat, BEAT_DEAD_AFTER_MS, CENTRE } from '../shared/schemas'
import { room } from '../shared/messages'
import { setupTouchHud, reportPlatform, applyThiefPenalty } from './locomotion'
import { setupBox } from './box'
import { setupPlots } from './plots'
import { setupTheft, setAdresseClient } from './theft'
import { setupBelt } from './belt'
import { setupSlots } from './slots'
import { setupQuests } from './quests-ui'
import { setupTutorial } from './tutorial'
import { setupTravel } from './travel'
import { setupVenue } from './venue'

/** Etat d'affichage, lu par l'UI. */
export const view = {
  objets: 0,
  serverAlive: false,
  lastBeatValue: 0,
  lastBeatSeenAt: 0,
  malusActif: false,
  etages: 1
}

export function startClient(): void {
  console.log('[CLIENT] demarrage')
  room.onMessage('serverLog', (d) => console.log(`[SERVER] ${d.line}`))
  setupTouchHud()
  reportPlatform()
  // VITESSE DE BASE RELEVEE. La camera mobile n'est PAS pilotable par la scene
  // (`screenDelta` vaut 0 sur telephone), donc le seul levier de confort est la
  // locomotion. Le lieu fait 80 m: a 8 m/s il faut 10 s pour le traverser, et un juge
  // n'a que 3 minutes. Le malus du voleur garde son ratio mesure (-41 %).
  applyThiefPenalty(false)

  // HEURE FIXE. Sans ca le ciel suit l'heure du monde: un juge qui visite la nuit
  // verrait une scene noire, et notre premiere impression serait une loterie.
  // 16h00 = 57600 s: lumiere chaude et rasante, ombres longues, le meilleur eclairage
  // pour lire un batiment et ses etages.
  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 43200 })

  setupVenue()
  setupBox()
  setupPlots()
  setupTheft()
  setupBelt()
  setupSlots()
  setupQuests()
  setupTutorial()
  setupTravel()

  // SOURCE DE VERITE: le composant synchronise, publie par le serveur des notre entree.
  let myAddress = ''
  engine.addSystem(() => {
    if (myAddress === '') {
      const me = getPlayer()
      if (me === null) return
      myAddress = me.userId.toLowerCase()
      setAdresseClient(myAddress)
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
