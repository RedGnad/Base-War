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
import { setupConvoi } from './convoi'

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
  applyThiefPenalty(false)

  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 43200 })

  setupVenue()
  setupBox()
  setupPlots()
  setupTheft()
  setupBelt()
  setupSlots()
  setupConvoi()
  setupQuests()
  setupTutorial()
  setupTravel()

  let myAddress = ''
  engine.addSystem(() => {
    if (myAddress === '') {
      const me = getPlayer()
      if (me === null) return
      myAddress = me.userId.toLowerCase()
      setAdresseClient(myAddress)
      console.log(`[CLIENT] mon adresse: ${myAddress}`)
    }
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
      console.log(`[CLIENT] serveur ${vivant ? 'VIVANT' : 'SILENCIEUX'} (dernier battement il y a ${view.lastBeatSeenAt === 0 ? 'jamais' : (now - view.lastBeatSeenAt) + ' ms'})`)
    }
    view.serverAlive = vivant
  })
}
