import {
  engine, Transform, SkyboxTime, PointerLock,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'

import { getPlayer } from '@dcl/sdk/players'
import { Plot, ServerBeat, BEAT_DEAD_AFTER_MS, CENTER, occupe } from '../shared/schemas'
import { room } from '../shared/messages'
import { setupTouchHud, reportPlatform, applyThiefPenalty } from './locomotion'
import { setupBox } from './box'
import { setupPlots } from './plots'
import { setupTheft, setAdresseClient, theftView } from './theft'
import { setupBelt } from './belt'
import { setupRecords } from './records'
import { setupFusion } from './fusion'
import { setupSlots } from './slots'
import { setupQuests } from './quests-ui'
import { setupTutorial } from './tutorial'
import { setupTravel } from './travel'
import { setupVenue } from './venue'
import { setupConvoy } from './convoy'
import { setupCombat } from './combat'
import { setupCarry } from './carry'
import { setupGear } from './gear'
import { setupEvents } from './events'
import { setupToy } from './toy'
import { setupLootUi } from './loot-ui'
import { setupIntent } from './intent'

export const view = {
  items: 0,
  serverAlive: false,
  lastBeatValue: 0,
  lastBeatSeenAt: 0,
  penaltyActive: false,
  /**
   * True until the very first heartbeat is seen, false ever after.
   *
   * A server that has never spoken is booting; one that spoke and went quiet has died.
   * They look identical in a boolean and read completely differently to a player: the
   * platform only runs a scene's server while someone is in it, keeps it about two minutes
   * after the last player leaves, then stops it, so the next visitor waits roughly fifteen
   * seconds for a cold start. Telling that visitor the server is OFFLINE says the game is
   * broken when it is merely starting.
   */
  serverBooting: true,
  /**
   * Client-side instant the current wait began, or 0 while the server is answering.
   *
   * The interface draws the wait as a bar rather than a sentence, and a bar needs a start.
   * It is our own clock on purpose: the server's timestamps mean nothing here, and this
   * has to be right on the very first visit, when no server has ever spoken.
   */
  waitingSince: Date.now(),
  floors: 1
}

/*
  On desktop the cursor is captured while the game is on screen: the camera follows the mouse
  without a click-and-drag, the way any third-person game does, and the capture is released
  the moment a panel needs the cursor (welcome, menu, prestige). Edge-triggered on the HUD's
  visibility, so Esc still frees the cursor and nothing fights the player for it until the
  next panel opens or closes. `isPointerLocked` is writable by a scene, verified in the SDK's
  own `31,20-pointer-lock-control` test scene. Nothing on a phone: there is no cursor, and a
  finger on the screen already looks around.
*/
function setupPointerLock(): void {
  PointerLock.createOrReplace(engine.CameraEntity, { isPointerLocked: false })
  let dernier: boolean | null = null
  engine.addSystem(() => {
    const voulu = theftView.hudVisible
    if (voulu === dernier) return
    dernier = voulu
    const pl = PointerLock.getMutableOrNull(engine.CameraEntity)
    if (pl !== null && pl.isPointerLocked !== voulu) pl.isPointerLocked = voulu
  })
}

export function startClient(): void {
  console.log('[CLIENT] start')
  room.onMessage('serverLog', (d) => console.log(`[SERVER] ${d.line}`))
  setupIntent()
  setupTouchHud()
  if (!isMobile()) setupPointerLock()
  reportPlatform()
  applyThiefPenalty(false)

  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 43200 })

  setupVenue()
  setupBox()
  setupPlots()
  setupTheft()
  setupCarry()
  setupGear()
  setupEvents()
  setupToy()
  setupLootUi()
  setupBelt()
  setupRecords()
  setupFusion()
  setupSlots()
  setupConvoy()
  setupCombat()
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
      if (occupe(p.items) !== view.items || p.floors !== view.floors) {
        view.items = occupe(p.items)
        view.floors = p.floors
        console.log(`[CLIENT] my base: ${view.items} items, ${view.floors} floor(s)`)
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
    view.serverBooting = view.lastBeatSeenAt === 0
    const alive = view.lastBeatSeenAt !== 0 && now - view.lastBeatSeenAt < BEAT_DEAD_AFTER_MS
    if (alive) view.waitingSince = 0
    else if (view.waitingSince === 0) view.waitingSince = now
    if (alive !== view.serverAlive) {
      console.log(`[CLIENT] server ${alive ? 'ALIVE' : 'SILENT'} (last beat ${view.lastBeatSeenAt === 0 ? 'jamais' : (now - view.lastBeatSeenAt) + ' ms'})`)
    }
    view.serverAlive = alive
  })
}
