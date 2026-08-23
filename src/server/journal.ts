import { room } from '../shared/messages'

/**
 * FENETRE DE DIAGNOSTIC DU SERVEUR.
 *
 * Deux faits mesures le 23 Aug, qui justifient ce module:
 *  1. les `console.log` du serveur headless ne remontent PAS dans la console de scene
 *     du client (runtime separe): sans relais, tout echec serveur est invisible
 *  2. un message emis AU DEMARRAGE du serveur est perdu: le serveur demarre a l'arrivee
 *     du premier joueur, dont le gestionnaire `onMessage` n'est pas encore pose
 *
 * D'ou le tampon: on accumule, on vide a intervalle regulier, et on rejoue l'historique
 * a tout client qui arrive ensuite.
 */

const HISTORIQUE_MAX = 60
const historique: string[] = []
let enAttente: string[] = []

export function jour(line: string): void {
  console.log(`[SERVER] ${line}`)
  historique.push(line)
  if (historique.length > HISTORIQUE_MAX) historique.shift()
  enAttente.push(line)
}

/** Vide vers les clients connectes. Appele par un minuteur. */
export function viderJournal(): void {
  if (enAttente.length === 0) return
  const lot = enAttente
  enAttente = []
  for (const line of lot) void room.send('serverLog', { line })
}

/** Rejoue l'historique pour un client qui vient d'arriver. */
export function rejouerJournal(address: string): void {
  for (const line of historique) void room.send('serverLog', { line }, { to: [address] })
}
