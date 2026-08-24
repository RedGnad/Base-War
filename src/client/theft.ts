import { engine, AudioSource, Transform, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { rarity } from '../shared/loot-table'
import { indexView } from './index-ui'
import { applyThiefPenalty, applyFreeze } from './locomotion'
import { tutoView } from './tutorial'

/**
 * Retour joueur du vol. Le client ne DECIDE rien: il reagit a ce que le serveur annonce.
 * Le malus de locomotion est le seul element qu'il applique lui-meme, faute d'API serveur
 * pour la locomotion d'un joueur distant. Le TRANSFERT de l'objet, lui, est autoritaire.
 */

export const theftView = {
  presents: 1,
  prime: 0,
  sentinelles: 0,
  prixSentinelle: 0,
  coins: 0,
  palier: 0,
  prochainPalier: 0,
  rareteMin: 0,
  multiplicateur: 1,
  revenu: 0,
  basePosee: false,
  verrouSec: 0,
  aReprendre: false,
  prixEtage: 0,
  rechargeSec: 0,
  reserve: 0,
  alerte: '',
  alerteCouleur: '#ffffff',
  alerteJusqua: 0,
  fil: [] as string[],
  malusJusqua: 0,
}

let sonneur = 0 as unknown as ReturnType<typeof engine.addEntity>

export function alerter(texte: string, couleur: string, dureeMs = 6000): void {
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
    alerter(`${d.byName} STOLE YOUR ${r.nom.toUpperCase()}!`, r.couleur, 8000)
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
  room.onMessage('sentryBlocked', (d) => {
    applyFreeze(d.gelMs)
    alerter(`${d.ownerName.toUpperCase()}'S SENTRY CAUGHT YOU\nfrozen ${Math.round(d.gelMs / 1000)}s  ·  base sealed ${d.verrouSec}s`, '#ff6b6b', 6500)
  })
  room.onMessage('sentryTriggered', (d) => {
    alerter(`YOUR SENTRY STOPPED ${d.byName.toUpperCase()}  ·  ${d.restant} charge${d.restant === 1 ? '' : 's'} left`, '#4dd2ff', 7000)
  })
  room.onMessage('sentryBought', (d) => {
    alerter(`SENTRY ARMED  ·  ${d.charges} charges  ·  -${d.cout} coins`, '#4dd2ff', 4000)
  })

  room.onMessage('gaveItem', (d) => {
    const r = rarity(d.rarity)
    alerter(`GIFTED TO ${d.toName.toUpperCase()}: ${r.nom.toUpperCase()}`, '#8fe08f', 5000)
  })
  room.onMessage('wasGifted', (d) => {
    const r = rarity(d.rarity)
    // Meme canal que l'alerte de vol, et c'est voulu: recevoir et se faire prendre sont
    // les deux faces du meme evenement social, et ils doivent se lire au meme endroit.
    alerter(`${d.byName} LEFT YOU A ${r.nom.toUpperCase()}!`, r.couleur, 8000)
  })
  room.onMessage('gifted', (d) => {
    ajouterAuFil(`${d.byName} gifted ${rarity(d.rarity).nom} to ${d.toName}`)
  })

  room.onMessage('wallet', (d) => {
    // Le portefeuille porte aussi l'etape du tutoriel: voir le commentaire cote serveur.
    tutoView.etape = d.tutoEtape
    theftView.sentinelles = d.sentinelles
    theftView.prixSentinelle = d.prixSentinelle
    theftView.presents = d.presents
    theftView.prime = d.prime
    theftView.coins = Math.floor(d.coins)
    theftView.palier = d.palier
    theftView.prochainPalier = d.prochainPalier
    theftView.rareteMin = d.rareteMin
    theftView.multiplicateur = d.multiplicateur
    theftView.revenu = d.revenu
    theftView.basePosee = d.basePosee
    theftView.verrouSec = d.verrouSec
    theftView.aReprendre = d.aReprendre
    theftView.prixEtage = d.prixEtage
    theftView.rechargeSec = d.rechargeSec
    theftView.reserve = d.reserve
  })

  room.onMessage('rebirthDone', (d) => {
    alerter(`PRESTIGE ${d.palier}  ·  ${d.etages} floors`, '#f5a524', 6000)
    console.log(`[CLIENT] palier ${d.palier}, ${d.etages} etages`)
  })

  room.onMessage('index', (d) => { indexView.vus = [...d.vus] })

  room.onMessage('collected', (d) => {
    alerter(`+${d.gain} coins collected`, '#8fe08f', 2200)
  })

  room.onMessage('offlineEarnings', (d) => {
    // La fenetre de retour: c'est ELLE qui fait revenir le joueur, elle doit rester
    // longtemps et dire combien de temps a couru.
    const min = Math.round(d.secondes / 60)
    alerter(`WELCOME BACK  ·  +${d.gain} coins earned in ${min} min away`, '#ffd166', 9000)
    console.log(`[CLIENT] hors ligne: +${d.gain} en ${min} min`)
  })

  room.onMessage('dailyReward', (d) => {
    alerter(`DAY ${d.jour}/7  ·  free crate!`, '#4dd2ff', 7000)
    console.log(`[CLIENT] recompense du jour ${d.jour}`)
  })

  room.onMessage('floorBought', (d) => {
    alerter(`FLOOR ${d.etages} UNLOCKED  ·  +6 slots`, '#4dd2ff', 5000)
    console.log(`[CLIENT] etage ${d.etages} achete pour ${d.cout}`)
  })

  room.onMessage('sold', (d) => {
    alerter(`+${d.gain} coins`, '#8fe08f', 2500)
    console.log(`[CLIENT] revendu pour ${d.gain}`)
  })

  // TOUT REFUS DOIT SE VOIR.
  // Bug corrige le 24 Aug: la raison n'atterrissait que dans `theftView.refus`, un champ
  // qu'AUCUN composant n'affichait. Les refus du serveur etaient donc tous muets: verrou,
  // vol, achat, revente, ouverture. Vu du joueur, le bouton ne marchait pas, sans un mot
  // d'explication. Un refus silencieux est indiscernable d'un bug, et le joueur conclut
  // toujours au bug.
  room.onMessage('actionRejected', (d) => {
    alerter(d.raison.toUpperCase(), '#ff6b6b', 4000)
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
export function revendre(slot: number): void { void room.send('sellItem', { slot }) }
/** Le don: mon objet `slot` part sur la base de `ownerId`. Miroir de `voler`. */
export function offrir(ownerId: string, slot: number): void { void room.send('giveItem', { ownerId, slot }) }
export function acheterEtage(): void { void room.send('buyFloor', {}) }
export function armerSentinelle(): void { void room.send('buySentry', {}) }
export function collecter(): void { void room.send('collect', {}) }
export function deplacer(de: number, vers: number): void { void room.send('moveItem', { de, vers }) }

/** Adresse du joueur local, resolue une fois. */
let _adresse = ''
export function monAdresseClient(): string { return _adresse }
export function setAdresseClient(a: string): void { _adresse = a }
