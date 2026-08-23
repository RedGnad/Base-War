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
}
