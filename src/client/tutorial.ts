import { room } from '../shared/messages'
import { crate } from '../shared/loot-table'
import { alerter, alerterEnFile } from './theft'

export const STEP_TEXTS = [
  { titre: 'Place your base', aide: 'tap BUILD BASE, then pick a spot' },
  { titre: 'Open your crate', aide: 'walk to your crate and smash it 3 times' },
  { titre: 'Collect your coins', aide: 'your items earn into a pool: tap COLLECT' },
  { titre: 'Buy a crate', aide: 'tap a crate on the belt before it falls' },
  { titre: 'Steal from a neighbour', aide: 'walk into another base, tap an item, hold on, and run it home' }
] as const

export const tutoView = { etape: 0, total: STEP_TEXTS.length as number }

/** Seconds until the play-time crate, and the full span, so a bar can be drawn from them. */
export const giftView = { leftS: -1, totalS: 900 }

export function setupTutorial(): void {
  room.onMessage('tutorial', (d) => { tutoView.etape = d.etape; tutoView.total = d.total })
  room.onMessage('giftProgress', (d) => { giftView.leftS = d.leftS; giftView.totalS = d.totalS })
  room.onMessage('timeGift', (d) => {
    alerterEnFile(`${d.minutes} MINUTES PLAYED  ·  free ${crate(d.crate).name}`, '#ffd166', 8000)
  })
}
