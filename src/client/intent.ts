import { engine } from '@dcl/sdk/ecs'
import { view } from './setup'

/**
 * Actions taken before the server exists.
 *
 * The platform runs a scene's server only while somebody is in the scene, keeps it about
 * two minutes after the last player leaves, then stops it. The next visitor waits roughly
 * fifteen seconds for a cold start, and the documentation is explicit that anything sent
 * during that window is silently lost. A judge arriving at an empty venue is exactly that
 * visitor: they press BUILD BASE, nothing happens, and they conclude the game is broken.
 *
 * So a deliberate action taken too early is held and fired the moment the first heartbeat
 * lands, rather than thrown away.
 *
 * Only deliberate ones. A shot, an aim, a bid on a crate halfway down the belt are all
 * about the instant they were taken; replaying them fifteen seconds later would act on a
 * world that has moved on. Those still fire and still miss, which is correct.
 *
 * One slot, not a queue: holding three taps and firing them together turns a stutter into
 * a burst nobody asked for. The last intent wins, and it expires on its own so a player
 * who wandered off does not come back to an action they no longer want.
 */
const HOLD_MS = 30_000

let deferred: { send: () => void; until: number } | null = null

/** Whether something is waiting on the server, for the interface to say so. */
export function intentEnAttente(): boolean {
  return deferred !== null
}

/**
 * Send now, or hold until the server answers for itself.
 *
 * `view.serverAlive` is only true once two distinct heartbeats have been observed, so it
 * is a statement about a server that is actually running, not about the transport being
 * connected.
 */
export function sendOrHold(send: () => void): void {
  if (view.serverAlive) { send(); return }
  deferred = { send, until: Date.now() + HOLD_MS }
}

export function setupIntent(): void {
  engine.addSystem(() => {
    if (deferred === null) return
    const now = Date.now()
    if (now > deferred.until) {
      console.log('[CLIENT] deferred intent expired')
      deferred = null
      return
    }
    if (!view.serverAlive) return
    const send = deferred.send
    deferred = null
    console.log('[CLIENT] deferred intent sent on the first heartbeat')
    send()
  })
}
