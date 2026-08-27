import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import {
  Event, Raid, EVENT_MS, EVENT_GAP_MS, EVENT_THEMES, GRAND_RUSH_UTC_HOUR, GRAND_MS, GRAND_TEMPO
} from '../shared/schemas'
import { room } from '../shared/messages'
import { setEventTheme } from './loot'
import { presents, displayName, addCrate, cratesOf, marquerTrait } from './plots'
import { noter } from './records'
import { log } from './log'

/**
 * The venue's clock. One entity, written here, read everywhere.
 *
 * Two kinds of rush. The random one starts on a timer whose mean is the genre's fifteen
 * minutes, runs five, and only while somebody is in the room: an event nobody sees pushes
 * nothing and spends a theme. The GRAND one is the reference's fixed-hour event: 20:00 UTC
 * every day, ten minutes, present or not, the belt at double speed. A fixed hour is what a
 * community organises around, and it cannot depend on who happened to be there.
 *
 * Both pay presence the moment they open (invariant 216): a crate, and one placed toy of
 * each player in the room gains a trait. The entity is swept at boot like every other synced
 * thing, because a stale one from a dead server would be an event with no end.
 */

let grandEnCours = false
/** How many crates the belt should be putting out, relative to normal. */
export function tempoDuTapis(): number { return grandEnCours ? GRAND_TEMPO : 1 }

function prochainGrand(apres: number): number {
  const d = new Date(apres)
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), GRAND_RUSH_UTC_HOUR, 0, 0, 0)
  return t > apres ? t : t + 86_400_000
}

type Clock = ReturnType<typeof engine.addEntity>
type Theme = typeof EVENT_THEMES[number]

function ouvrir(clock: Clock, choix: Theme, dureeMs: number, grand: boolean, now: number): void {
  const ev = Event.getMutableOrNull(clock)
  if (ev === null) return
  ev.theme = choix.theme
  ev.untilMs = now + dureeMs
  ev.grand = grand
  setEventTheme(choix.theme)
  grandEnCours = grand
  const ici = presents()
  for (const a of ici) {
    // A Basic crate for the ordinary rush, the rush's own themed crate for the grand one.
    const crate = grand ? choix.crate : 0
    addCrate(a, crate)
    void room.send('inventory', { crates: cratesOf(a) }, { to: [a] })
    const code = marquerTrait(a)
    void room.send('rushGift', { crateTier: crate, code: code ?? -1, grand, name: choix.name }, { to: [a] })
    if (code !== null) noter('trait', displayName(a), choix.name, code)
  }
  log(`${grand ? 'GRAND ' : ''}event: ${choix.name} for ${Math.round(dureeMs / 60000)} min, ${ici.size} present and paid`)
}

export function startEvents(): void {
  for (const [e] of engine.getEntitiesWith(Event)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e)
  }

  const clock = engine.addEntity()
  Event.create(clock, { theme: -1, untilMs: 0, grand: false, nextGrandMs: prochainGrand(Date.now()) })
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
    // whether or not anything changed, and this changes a few times an hour.
    const lu = Event.getOrNull(clock)
    if (lu === null) return

    if (lu.theme >= 0) {
      if (lu.untilMs > now) return
      log(`event over: ${EVENT_THEMES.find((t) => t.theme === lu.theme)?.name ?? lu.theme}`)
      const ev = Event.getMutableOrNull(clock)
      if (ev !== null) {
        ev.theme = -1; ev.untilMs = 0
        if (ev.grand) { ev.grand = false; ev.nextGrandMs = prochainGrand(now) }
      }
      setEventTheme(-1)
      grandEnCours = false
      prochain = now + prochainDelai()
      return
    }

    // One thing at a time on the plaza: while the boss is up, neither rush opens; the grand
    // one keeps its window and starts the moment the boss is gone.
    let raidEnCours = false
    for (const [, r] of engine.getEntitiesWith(Raid)) if (r.active) raidEnCours = true
    if (raidEnCours) return

    if (now >= lu.nextGrandMs) {
      if (now < lu.nextGrandMs + GRAND_MS) {
        // The theme walks the list a day at a time, so a regular knows what tonight brings.
        const jour = Math.floor(now / 86_400_000)
        ouvrir(clock, EVENT_THEMES[jour % EVENT_THEMES.length], lu.nextGrandMs + GRAND_MS - now, true, now)
        return
      }
      // The whole window passed with no server up (nobody was here): tomorrow, then.
      const ev = Event.getMutableOrNull(clock)
      if (ev !== null) ev.nextGrandMs = prochainGrand(now)
      return
    }

    if (now < prochain) return
    if (presents().size === 0) { prochain = now + 30_000; return }
    // Not on the doorstep of the grand one: two rushes back to back is one rush with a longer name.
    if (lu.nextGrandMs - now < EVENT_MS) { prochain = now + 30_000; return }
    ouvrir(clock, EVENT_THEMES[Math.floor(Math.random() * EVENT_THEMES.length)], EVENT_MS, false, now)
  })

  log('events ready')
}
