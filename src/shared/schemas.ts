import {
  PRODUCTION_RARETE, PRIX_ETAGE_ABS, PALIER_MAX, cumulPourPalier, multiplicateurPalier,
  HORS_LIGNE_TAUX_V2, HORS_LIGNE_PLAFOND_PRODUCTION_S
} from './economie'
import { Schemas, engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

export const PlayerTaps = engine.defineComponent('friendzone::player-taps', {
  playerId: Schemas.String,
  count: Schemas.Int
})

export const ServerBeat = engine.defineComponent('friendzone::server-beat', {
  at: Schemas.Int64
})

export const Crate = engine.defineComponent('friendzone::crate', {
  hits: Schemas.Int,
  maxHits: Schemas.Int,
  breakSeq: Schemas.Int
})

export const Plot = engine.defineComponent('friendzone::plot', {
  etages: Schemas.Int,
  rebirths: Schemas.Int,
  index: Schemas.Int,
  ownerId: Schemas.String,
  ownerName: Schemas.String,
  items: Schemas.Array(Schemas.Int),
  ownerPresent: Schemas.Boolean,
  donnes: Schemas.Int,
  recus: Schemas.Int,
  sentinelles: Schemas.Int,
  lockedUntil: Schemas.Int64
})

export const Loot = engine.defineComponent('friendzone::loot', {
  rarity: Schemas.Int,
  ownerId: Schemas.String,
  slot: Schemas.Int
})

export const Belt = engine.defineComponent('friendzone::belt', {
  articleId: Schemas.Int,
  typeBoite: Schemas.Int,
  prix: Schemas.Int,
  progres: Schemas.Float,
  acheteurNom: Schemas.String
})

/**
 * The sentry is the only defence that acts while its owner is offline, which is the
 * normal case here. It has charges rather than a duration: a defence that expires
 * punishes disconnecting, one that depletes punishes being robbed often.
 * Triggering it also re-locks the base, otherwise a thief just waits out the freeze and
 * drains all charges in a minute.
 */
export const SENTINELLE_CHARGES = 3
export const SENTINELLE_SECONDES = 120
export const SENTINELLE_MINIMUM = 240
export const SENTINELLE_GEL_MS = 7000
export const SENTINELLE_VERROU_MS = 60_000

export const PRIME_PRESENCE_PAR_JOUEUR = 0.15
export const PRIME_PRESENCE_PLAFOND = 0.60

export function primePresence(nbPresents: number): number {
  return Math.min(PRIME_PRESENCE_PLAFOND, Math.max(0, nbPresents - 1) * PRIME_PRESENCE_PAR_JOUEUR)
}

/**
 * A bought crate walks to the buyer's base and stays purchasable by anyone at 150% of
 * what the current holder paid. The trip duration IS the bidding window.
 *
 * duration = max(8s, distance / 2.0 m/s). Players run at 11 m/s, so they always catch
 * up: the contest is about attention and money, never footspeed — the only version that
 * works with a thumb on a phone. The 8s floor stops a base built next to the belt from
 * being uncontestable, which would make "build close" strictly dominant.
 */
export const CONVOI_VITESSE = 2.0
export const CONVOI_DUREE_MIN_S = 8
export const CONVOI_SURENCHERE = 1.5
export const CONVOI_PORTEE = 6

export const Convoi = engine.defineComponent('friendzone::convoi', {
  convoiId: Schemas.Int,
  typeBoite: Schemas.Int,
  prixPaye: Schemas.Int,
  proprietaire: Schemas.String,
  nomProprietaire: Schemas.String,
  progres: Schemas.Float,
  departX: Schemas.Float, departZ: Schemas.Float,
  cibleX: Schemas.Float, cibleZ: Schemas.Float
})

export const TAPIS_LONGUEUR = 26
export const TAPIS_DUREE_S = 34          // temps pour traverser: laisse le temps de decider
export const TAPIS_INTERVALLE_S = 5      // un article toutes les 5 s
export const PORTEE_ACHAT = 5

export const CHUTE_FIN = 0.22        // part de course consacree a la chute
export const FOSSE_PROFONDEUR = 2.4   // du tapis (2,65) au fond de la fosse (0,25)

export const TAPIS_HAUTEUR = 2.2

export function beltPosition(progres: number): { x: number; y: number; z: number } {
  const surTapis = Math.min(progres, 1)
  const x = CENTRE.x - TAPIS_LONGUEUR / 2 + surTapis * TAPIS_LONGUEUR
  if (progres <= 1) return { x, y: TAPIS_HAUTEUR + 0.45, z: CENTRE.z }
  const t = Math.min((progres - 1) / CHUTE_FIN, 1)
  return { x, y: TAPIS_HAUTEUR + 0.45 - t * t * FOSSE_PROFONDEUR, z: CENTRE.z }
}

export const PRIX_RARETE = [40, 150, 600, 2600, 11000]

export const SYNC_ID = {
  serverBeat: 1,
  crate: 2
} as const

export const PORTEE_COUP = 4

export const VERROU_ARRIVEE_MS = 30_000   // 3.1 verrou automatique a l'arrivee
export const VERROU_GRATUIT_MS = 60_000   // 3.2 verrou activable, duree SOURCEE au wiki
export const VERROU_RECHARGE_MS = 150_000
export const VERROU_BONUS_MS = 10_000     // 3.6 +10 s par palier de progression
export const MALUS_DUREE_MS = 12_000      // 3.4 duree du malus du voleur
export const REPRISE_FENETRE_MS = 20_000  // 3.5 fenetre pour reprendre son bien
export const PORTEE_VOL = 4
export const PORTEE_REPRISE = 6

export const MAX_BASES_AFFICHEES = 60
export const ETAGE_HAUTEUR = 2.8
export const SLOTS_PAR_ETAGE = 6
export const ETAGES_MAX = 3

export const BASE_COTE = 11.0
export const RAMPE_ANGLE = 40
export const RAMPE_LONGUEUR = 4.4  // h/sin(40 deg) pour 2,8 m
export const MUR_EPAISSEUR = 0.22
export const MUR_HAUTEUR = ETAGE_HAUTEUR
export const PORTE_LARGEUR = 2.0

export const PALIERS = Array.from({ length: PALIER_MAX }, (_, i) => {
  const n = i + 1
  return {
    cout: cumulPourPalier(n),
    rareteMin: Math.min(1 + Math.floor(i / 2), PRODUCTION_RARETE.length - 1),
    multiplicateur: multiplicateurPalier(n),
    garde: i < 2 ? 1 : 2
  }
}) as ReadonlyArray<{ cout: number; rareteMin: number; multiplicateur: number; garde: number }>
export const REBIRTH_MAX = PALIERS.length

export function paliers(n: number) { return PALIERS[Math.min(n, PALIERS.length - 1)] }
export function coutRebirth(palier: number): number { return paliers(palier).cout }

export function multiplicateurRevenu(n: number): number {
  return n <= 0 ? 1 : PALIERS[Math.min(n, PALIERS.length) - 1].multiplicateur
}

export const PRIX_ETAGE = PRIX_ETAGE_ABS

export function prixEtage(etageVise: number): number {
  return PRIX_ETAGE[Math.max(0, Math.min(etageVise - 1, PRIX_ETAGE.length - 1))]
}

export function etagesOuverts(etagesAchetes = 0): number {
  return Math.min(1 + etagesAchetes, ETAGES_MAX)
}

export function placesOuvertes(etagesAchetes = 0): number {
  return etagesOuverts(etagesAchetes) * SLOTS_PAR_ETAGE
}

export const DELAI_DEPLACEMENT_MS = 180_000

export const HORS_LIGNE_TAUX = HORS_LIGNE_TAUX_V2        // 35 % du revenu normal
export const HORS_LIGNE_PLAFOND_MS = 4 * 3600_000
export { HORS_LIGNE_PLAFOND_PRODUCTION_S }

export const RESERVE_PLAFOND_S = 600      // 10 minutes de production accumulables

export const RECOMPENSES_JOUR = [0, 0, 1, 1, 2, 2, 3] as const   // type de boite offerte

export const REVENTE_SECONDES = 30

export const GRILLE = 2                    // pas d'accrochage, en metres
export const ECART_MIN_BASES = 15          // 11 m de base + 4 m de rue entre deux voisins
export const MARGE_BORD = 7                // du bord de la scene
export const ECART_TAPIS = 6               // du tapis, pour ne pas le barrer

export function accrocher(v: number): number {
  return Math.round(v / GRILLE) * GRILLE
}

export function raisonInvalide(
  x: number, z: number, cote: number,
  autres: Array<{ x: number; z: number }>
): string | null {
  if (x < MARGE_BORD || z < MARGE_BORD || x > cote - MARGE_BORD || z > cote - MARGE_BORD) {
    return 'too close to the edge'
  }
  if (Math.abs(z - CENTRE.z) < ECART_TAPIS && Math.abs(x - CENTRE.x) < TAPIS_LONGUEUR / 2 + 4) {
    return 'on the belt lane'
  }
  for (const a of autres) {
    const dx = a.x - x, dz = a.z - z
    if (Math.sqrt(dx * dx + dz * dz) < ECART_MIN_BASES) return 'too close to another base'
  }
  return null
}

export const PLOT_MAX_OBJETS = SLOTS_PAR_ETAGE * ETAGES_MAX

export function slotPosition(slot: number): { dx: number; dy: number; dz: number } {
  const etage = Math.floor(slot / SLOTS_PAR_ETAGE)
  const k = slot % SLOTS_PAR_ETAGE
  const col = k % 3
  const rang = Math.floor(k / 3)
  return {
    dx: (col - 1.5) * 2.4,
    dy: 0.45 + etage * ETAGE_HAUTEUR,
    dz: -3.4 + rang * 2.4
  }
}

export const TREMIE_LARGEUR = 3.0

export function rampePosition(etage: number): { dx: number; dy: number; dz: number } {
  return {
    dx: BASE_COTE / 2 - TREMIE_LARGEUR / 2,
    dy: etage * ETAGE_HAUTEUR + ETAGE_HAUTEUR / 2,
    dz: 0
  }
}
export const CENTRE = { x: 40, z: 40 }

export const BEAT_MS = 2000
export const BEAT_DEAD_AFTER_MS = BEAT_MS * 3

/**
 * Write guards: only the authoritative server may change synced state.
 * Called on both sides; the isServer() guard makes it a no-op on a client, where
 * validateBeforeChange would otherwise error.
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
  Convoi.validateBeforeChange(serverOnly)
}
