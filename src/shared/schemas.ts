import { Schemas, engine } from '@dcl/sdk/ecs'

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

/** Identifiants de synchronisation explicites: reserves aux singletons. */
export const SYNC_ID = {
  serverBeat: 1
} as const

/** Periode du battement de coeur, et seuil au-dela duquel on considere le serveur mort. */
export const BEAT_MS = 2000
export const BEAT_DEAD_AFTER_MS = BEAT_MS * 3

// [A VERIFIER] Le skill `authoritative-server` prescrit `Component.validateBeforeChange(...)`
// pour interdire aux clients d'ecrire l'etat autoritaire. Cette methode publique n'existe PAS
// dans les typages de @dcl/ecs livres avec @dcl/sdk@auth-server 7.26.1-32239895147 (0 occurrence
// dans dist/), alors que le runtime appelle bien `component.__run_validateBeforeChange` en
// interne. A resoudre avant la phase 3 (le vol) en lisant la scene officielle
// sdk7-test-scenes/scenes/90,-9-authoritative-server-leaderboard.
// Le spike n'en depend pas: il prouve la chaine de persistance, pas l'anti-triche.
