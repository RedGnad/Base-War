import { Schemas, engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
// AUTH_SERVER_PEER_ID n'est PAS reexporte par @dcl/sdk/network: chemin profond obligatoire.
// Confirme par la scene officielle 90,-9-authoritative-server-leaderboard.
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// Les composants se definissent au chargement du module, avant que le moteur ne se scelle.
// Ce fichier DOIT etre importe statiquement depuis index.ts, jamais via import() dynamique,
// sinon: "Engine is already sealed".

/**
 * Une entite par joueur, creee par le serveur uniquement.
 * On n'attribue PAS d'identifiant de synchronisation derive de l'adresse: deux adresses
 * finissent par tomber dans le meme creneau et syncEntity jette. On laisse l'allocation
 * automatique et on retrouve le joueur par le champ `playerId`.
 */
export const PlayerTaps = engine.defineComponent('friendzone::player-taps', {
  playerId: Schemas.String,
  count: Schemas.Int
})

/**
 * Singleton: le serveur y ecrit Date.now() toutes les ~2 s.
 * Le client ne regarde PAS cette valeur mais l'instant OU IL L'A VUE CHANGER: un instantane
 * CRDT laisse par un serveur eteint porterait sinon un horodatage credible.
 * Int64 est obligatoire, Number corrompt les nombres a 13 chiffres.
 */
export const ServerBeat = engine.defineComponent('friendzone::server-beat', {
  at: Schemas.Int64
})

/**
 * La caisse: etat autoritaire, publie par le serveur.
 * `hits` monte, et a `maxHits` le serveur tire une rarete et remet a zero.
 * Le client N'INCREMENTE JAMAIS: il envoie "j'ai tape", le serveur decide.
 */
export const Crate = engine.defineComponent('friendzone::crate', {
  hits: Schemas.Int,
  maxHits: Schemas.Int,
  /** monte de 1 a chaque cassage: sert au client a declencher sa secousse sans double-jeu */
  breakSeq: Schemas.Int
})

/**
 * Un emplacement. Il en existe 8, TOUJOURS presents, occupes ou non.
 * Le serveur les publie meme quand leur proprietaire est absent: c'est la regle
 * d'eligibilite « Empty venues are not eligible » qui l'impose.
 */
export const Plot = engine.defineComponent('friendzone::plot', {
  index: Schemas.Int,
  ownerId: Schemas.String,
  ownerName: Schemas.String,
  /** raretes posees, dans l'ordre. Longueur = nombre d'objets visibles. */
  items: Schemas.Array(Schemas.Int),
  /** le proprietaire est-il connecte en ce moment */
  ownerPresent: Schemas.Boolean,
  /** horodatage serveur jusqu'auquel l'emplacement est protege. Int64 obligatoire. */
  lockedUntil: Schemas.Int64
})

/** Un objet tombe, pose sur l'emplacement d'un joueur. */
export const Loot = engine.defineComponent('friendzone::loot', {
  rarity: Schemas.Int,
  ownerId: Schemas.String,
  /** index de l'emplacement chez le proprietaire */
  slot: Schemas.Int
})

/** Identifiants de synchronisation explicites: reserves aux singletons. */
export const SYNC_ID = {
  serverBeat: 1,
  crate: 2
} as const

/** Distance maximale a la caisse pour qu'un coup soit accepte par le serveur. */
export const PORTEE_COUP = 4

/**
 * Les six mecaniques anti-frustration, valeurs mesurees chez le #1 (wiki Steal a Brainrot).
 * Le vol doit etre lent, bruyant, defendable et reversible: sans ca il chasse les joueurs
 * au lieu de les faire revenir.
 */
export const VERROU_ARRIVEE_MS = 30_000   // 3.1 verrou automatique a l'arrivee
export const VERROU_GRATUIT_MS = 60_000   // 3.2 verrou activable
export const VERROU_BONUS_MS = 10_000     // 3.6 +10 s par palier de progression
export const MALUS_DUREE_MS = 12_000      // 3.4 duree du malus du voleur
export const REPRISE_FENETRE_MS = 20_000  // 3.5 fenetre pour reprendre son bien
export const PORTEE_VOL = 4
export const PORTEE_REPRISE = 6

/** Les 8 emplacements, en cercle autour de la caisse. Scene = 32x32 m, centre (16,16). */
export const NB_PLOTS = 8
export const PLOT_RAYON = 11
export const PLOT_MAX_OBJETS = 6

export function plotPosition(index: number): { x: number; y: number; z: number } {
  const a = (index / NB_PLOTS) * Math.PI * 2
  return { x: 16 + Math.cos(a) * PLOT_RAYON, y: 0, z: 16 + Math.sin(a) * PLOT_RAYON }
}

/** Periode du battement de coeur, et seuil au-dela duquel on considere le serveur mort. */
export const BEAT_MS = 2000
export const BEAT_DEAD_AFTER_MS = BEAT_MS * 3


/**
 * Gardes d'ecriture: seul le serveur peut modifier l'etat autoritaire.
 * Les composants personnalises utilisent la surcharge globale (sans entite).
 * Appele depuis main() DES DEUX COTES: la garde isServer() en fait un no-op sur un
 * client, ou l'appel produirait des erreurs.
 */
export function registerValidators(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }) =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  PlayerTaps.validateBeforeChange(serverOnly)
  ServerBeat.validateBeforeChange(serverOnly)
  Crate.validateBeforeChange(serverOnly)
  Loot.validateBeforeChange(serverOnly)
  Plot.validateBeforeChange(serverOnly)
}
