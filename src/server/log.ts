import { room } from '../shared/messages'

const HISTORIQUE_MAX = 60
const historique: string[] = []
let enAttente: string[] = []

/**
 * Server console.log does NOT reach the scene console: the headless server is a separate
 * runtime. Lines are relayed to clients as `serverLog`, and buffered because messages
 * sent before any client listens are lost.
 */
export function log(line: string): void {
  console.log(`[SERVER] ${line}`)
  historique.push(line)
  if (historique.length > HISTORIQUE_MAX) historique.shift()
  enAttente.push(line)
}

export function flushLog(): void {
  if (enAttente.length === 0) return
  const lot = enAttente
  enAttente = []
  for (const line of lot) void room.send('serverLog', { line })
}

const REJEU_MAX = 20
export function replayLog(address: string): void {
  // Twenty lines tell a joiner what is going on; sixty per join, times a burst of joins, sat on the per-tick send budget.
  for (const line of historique.slice(-REJEU_MAX)) void room.send('serverLog', { line }, { to: [address] })
}
