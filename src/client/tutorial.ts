import { room } from '../shared/messages'
import { crate } from '../shared/loot-table'
import { alerter } from './theft'

export const ETAPES_TEXTE = [
  { titre: 'Place your base', aide: 'tap BUILD BASE, then pick a spot' },
  { titre: 'Open your crate', aide: 'walk to your crate and smash it 3 times' },
  { titre: 'Collect your coins', aide: 'your items earn into a pool: tap COLLECT' },
  { titre: 'Buy a crate', aide: 'tap a crate on the belt before it falls' },
  { titre: 'Leave a gift', aide: 'pick up one of your items and carry it into their base' }
] as const

export const tutoView = { etape: 0, total: ETAPES_TEXTE.length as number }

export function setupTutorial(): void {
  room.onMessage('tutorial', (d) => { tutoView.etape = d.etape; tutoView.total = d.total })
  room.onMessage('timeGift', (d) => {
    alerter(`${d.minutes} MINUTES PLAYED  ·  free ${crate(d.crate).name}`, '#ffd166', 8000)
  })
}
