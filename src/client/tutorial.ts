import { room } from '../shared/messages'
import { boite } from '../shared/loot-table'
import { alerter } from './theft'

/**
 * ETAPES cote client: le SERVEUR dit a quelle etape on en est, le client dit quoi faire.
 * Les libelles vivent ici parce que ce sont des mots, pas des regles: le serveur n'a pas
 * a transporter du texte a chaque message.
 */
export const ETAPES_TEXTE = [
  { titre: 'Place your base', aide: 'tap BUILD BASE, then pick a spot' },
  { titre: 'Open your crate', aide: 'walk to your crate and smash it 3 times' },
  { titre: 'Collect your coins', aide: 'your items earn into a pool: tap COLLECT' },
  { titre: 'Buy a crate', aide: 'tap a crate on the belt before it falls' },
  { titre: 'Finish a training set', aide: 'tap a machine 12 times while you wait' }
] as const

export const tutoView = { etape: 0, total: ETAPES_TEXTE.length as number }

export function setupTutorial(): void {
  room.onMessage('tutorial', (d) => { tutoView.etape = d.etape; tutoView.total = d.total })
  room.onMessage('timeGift', (d) => {
    alerter(`${d.minutes} MINUTES PLAYED  ·  free ${boite(d.boite).nom} crate`, '#ffd166', 8000)
  })
}
