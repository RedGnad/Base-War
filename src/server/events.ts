import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Event, EVENT_MS, EVENT_GAP_MS, EVENT_THEMES } from '../shared/schemas'
import { setEventTheme } from './loot'
import { presents } from './plots'
import { log } from './log'

/**
 * The venue's clock. One entity, written here, read everywhere.
 *
 * An event starts on a random timer whose mean is the genre's fifteen minutes, runs five, and
 * only starts while somebody is in the room: an event nobody sees pushes nothing and spends a
 * theme. The entity is swept at boot like every other synced thing, because a stale one from
 * a dead server would be an event with no end.
 */
export function startEvents(): void {
  for (const [e] of engine.getEntitiesWith(Event)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e)
  }

  const clock = engine.addEntity()
  Event.create(clock, { theme: -1, untilMs: 0 })
  syncEntity(clock, [Event.componentId])

  // Exponential gaps around the mean: the next one is never quite predictable.
  const prochainDelai = (): number => -Math.log(1 - Math.random()) * EVENT_GAP_MS
  let prochain = Date.now() + prochainDelai()

  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 1) return
    acc = 0
    const now = Date.now()
    // Read every second, WRITE only on a transition: a mutable handle is a serialise-and-compare
    // whether or not anything changed, and this changes twice in fifteen minutes.
    const lu = Event.getOrNull(clock)
    if (lu === null) return

    if (lu.theme >= 0) {
      if (lu.untilMs > now) return
      log(`event over: ${EVENT_THEMES.find((t) => t.theme === lu.theme)?.name ?? lu.theme}`)
      const ev = Event.getMutableOrNull(clock)
      if (ev !== null) { ev.theme = -1; ev.untilMs = 0 }
      setEventTheme(-1)
      prochain = now + prochainDelai()
      return
    }

    if (now < prochain) return
    if (presents().size === 0) { prochain = now + 30_000; return }
    const choix = EVENT_THEMES[Math.floor(Math.random() * EVENT_THEMES.length)]
    const ev = Event.getMutableOrNull(clock)
    if (ev === null) return
    ev.theme = choix.theme
    ev.untilMs = now + EVENT_MS
    setEventTheme(choix.theme)
    log(`event: ${choix.name} for ${Math.round(EVENT_MS / 60000)} min`)
  })

  log('events ready')
}
