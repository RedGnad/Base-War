import { engine, AudioSource, Transform, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { rarity } from '../shared/loot-table'
import { applyThiefPenalty } from '../spikes/locomotion'

/**
 * Retour joueur du vol. Le client ne DECIDE rien: il reagit a ce que le serveur annonce.
 * Le malus de locomotion est le seul element qu'il applique lui-meme, faute d'API serveur
 * pour la locomotion d'un joueur distant. Le TRANSFERT de l'objet, lui, est autoritaire.
 */

export const theftView = {
  coins: 0,
  palier: 0,
  prochainPalier: 0,
  alerte: '',
  alerteCouleur: '#ffffff',
  alerteJusqua: 0,
  fil: [] as string[],
  malusJusqua: 0,
  refus: ''
}

let sonneur = 0 as unknown as ReturnType<typeof engine.addEntity>

function alerter(texte: string, couleur: string, dureeMs = 6000): void {
  theftView.alerte = texte
  theftView.alerteCouleur = couleur
  theftView.alerteJusqua = Date.now() + dureeMs
}

function ajouterAuFil(ligne: string): void {
  theftView.fil.unshift(ligne)
  if (theftView.fil.length > 4) theftView.fil.pop()
}

export function setupTheft(): void {
  // Un emetteur attache au joueur: l'alerte s'entend ou qu'il soit.
  sonneur = engine.addEntity()
  Transform.create(sonneur, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
  AudioSource.create(sonneur, { audioClipUrl: 'assets/sounds/alerte-vol.wav', playing: false, loop: false, volume: 1 })

  /** 3.3 alerte a la victime: texte + son + nom du voleur + couleur de rarete. */
  room.onMessage('youWereRobbed', (d) => {
    const r = rarity(d.rarity)
    alerter(`${d.byName} t'a pris un ${r.nom} !`, r.couleur, 8000)
    const a = AudioSource.getMutableOrNull(sonneur)
    if (a !== null) { a.playing = false; a.playing = true }
    console.log(`[CLIENT] VOL SUBI: ${d.byName} -> ${r.nom}`)
  })

  /** 3.4 malus du voleur, applique a la demande du serveur. */
  room.onMessage('thiefPenalty', (d) => {
    applyThiefPenalty(true)
    theftView.malusJusqua = Date.now() + d.ms
    timers.setTimeout(() => {
      applyThiefPenalty(false)
      theftView.malusJusqua = 0
    }, d.ms)
    console.log(`[CLIENT] malus voleur pour ${d.ms} ms`)
  })

  room.onMessage('stolen', (d) => {
    ajouterAuFil(`${d.byName} a pris un ${rarity(d.rarity).nom} a ${d.fromName}`)
  })
  room.onMessage('reclaimed', (d) => {
    ajouterAuFil(`${d.byName} a repris son ${rarity(d.rarity).nom} a ${d.fromName}`)
  })
  room.onMessage('wallet', (d) => {
    theftView.coins = d.coins
    theftView.palier = d.palier
    theftView.prochainPalier = d.prochainPalier
  })

  room.onMessage('rebirthDone', (d) => {
    alerter(`PALIER ${d.palier} — ${d.etages} etages`, '#f5a524', 6000)
    console.log(`[CLIENT] palier ${d.palier}, ${d.etages} etages`)
  })

  room.onMessage('actionRejected', (d) => {
    theftView.refus = `${d.action}: ${d.raison}`
    console.log(`[CLIENT] refuse (${d.action}): ${d.raison}${d.antiCheat ? ' [anti-triche]' : ''}`)
  })

  // L'alerte s'efface d'elle-meme.
  engine.addSystem(() => {
    if (theftView.alerte !== '' && Date.now() > theftView.alerteJusqua) theftView.alerte = ''
  })
}

/** Le voleur designe SA cible: quel joueur, quel emplacement. */
export function voler(ownerId = '', slot = -1): void {
  void room.send('stealItem', { ownerId, slot })
}
export function verrouiller(): void { void room.send('activateLock', {}) }
export function reprendre(): void { void room.send('reclaim', {}) }
export function franchirPalier(): void { void room.send('rebirth', {}) }
