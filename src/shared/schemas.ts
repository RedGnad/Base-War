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
  /** nombre d'etages ouverts chez ce joueur: 1 a 3 */
  etages: Schemas.Int,
  /** paliers de rebirth franchis: statut visible, et +10 s de verrou chacun */
  rebirths: Schemas.Int,
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

/**
 * DISPOSITION EN ANNEAUX, dimensionnee le 23 Aug apres la question « et si on a 100 joueurs ».
 *
 * Motif copie des jeux de reference (memo §3.1): une base par joueur, creee a l'arrivee,
 * liberee au depart. Ce qui NE se copie pas, c'est le « serveur de 6 »: Decentraland ne
 * partitionne pas le monde, il n'y a qu'un serveur autoritaire par scene.
 *
 * Plafond reel, formule officielle des limites (entites = 200 x parcelles, et seules les
 * entites RENDUES comptent, doc `scene-limitations`): a 25 parcelles, 5 000 entites pour
 * ~9 par base, soit ~550. Les parcelles sont GRATUITES dans un World (jusqu'a 90 000).
 * Le vrai plafond est le rendu mobile: ~1 000 appels de dessin recommandes, donc de
 * l'ordre de 100 bases affichees. C'est notre chiffre de dimensionnement.
 *
 * Les anneaux gardent le lieu DENSE quand il y a peu de monde, et l'etendent sans
 * redessiner quand il y en a beaucoup.
 */
export const ANNEAUX = [
  { rayon: 9, places: 6 },
  { rayon: 15, places: 12 },
  { rayon: 21, places: 18 },
  { rayon: 27, places: 24 },
  { rayon: 33, places: 30 }
] as const

/** 90 bases affichables. Au-dela on n'affiche plus, on ne casse pas. */
export const MAX_BASES = ANNEAUX.reduce((n, a) => n + a.places, 0)
/**
 * LA BASE EST UN BATIMENT, pas un tapis.
 * Source: wiki du #1, page `Base`: *« The Base is a building that can currently only have
 * up to 3 floors, depending on how much rebirths you have »*, avec des emplacements qui
 * passent d'environ 10 a 31 au fil de la progression.
 *
 * Consequence de jeu, et c'est le coeur: le voleur doit MONTER pour atteindre le rare,
 * pendant que son malus de vitesse et de saut le penalise. *« it is good to check what
 * Brainrots are on each floor »*. La disposition verticale EST la defense.
 */
export const ETAGE_HAUTEUR = 2.8
export const SLOTS_PAR_ETAGE = 6
export const ETAGES_MAX = 3

/**
 * GEOMETRIE DU BATIMENT. Une dalle ne se verrouille pas: le wiki dit que l'entree
 * « se scelle » et qu'on place des tourelles « en haut des escaliers ». Il faut donc
 * des murs, UNE entree, et un escalier. Trois consequences mecaniques:
 *  - le verrou a quelque chose a fermer
 *  - la montee est une vraie traversee, ou le malus du voleur se paie
 *  - le butin reste VISIBLE de l'exterieur (face avant ouverte), sinon personne ne
 *    sait ce qu'il y a a voler et le lieu n'attire pas
 */
export const BASE_COTE = 5.0
/**
 * La rampe doit TENIR DANS le batiment. Franchir `ETAGE_HAUTEUR` sous un angle a
 * demande une longueur de h/sin(a). A 32 degres pour 3,2 m il fallait 6,0 m, donc elle
 * depassait d'un batiment large de 5. A 40 degres pour 2,8 m il faut 4,36 m: ca rentre.
 */
export const RAMPE_ANGLE = 40
export const RAMPE_LONGUEUR = 4.4
export const MUR_EPAISSEUR = 0.22
/**
 * Les murs montent EXACTEMENT jusqu'au plancher du dessus. Une hauteur inferieure
 * laisse une bande de vide entre les niveaux, et le batiment redevient une pile de
 * dalles flottantes: c'est ce qui distingue un immeuble d'un empilement.
 */
export const MUR_HAUTEUR = ETAGE_HAUTEUR
export const PORTE_LARGEUR = 2.0

/**
 * REBIRTH. Definition exacte relevee chez le praticien (transcription Aywen 1):
 * *« un systeme de palier que vous debloquez en atteignant un certain niveau d'argent
 * [...] debloquer des recompenses comme des nouvelles boites [...] ou UN ETAGE
 * SUPPLEMENTAIRE a votre salle de sport. Sauf qu'en echange, ca vous RESETTE votre argent. »*
 *
 * C'est ce qui donne un BUT aux pieces. Sans lui elles s'accumulent sans rien acheter,
 * et le gain passif ne sert a rien.
 */
/**
 * Page `Rebirth` du wiki, mot pour mot: *« takes all your brainrots and most of your money,
 * but gives [...] extra slots and money multiplier »*, et *« the requirements begin to
 * include higher income and RARER BRAINROTS »*.
 *
 * Donc le palier coute DES DEUX COTES (pieces ET objets) et paie DES DEUX COTES
 * (multiplicateur de revenu, places, verrou). Un cout en pieces seul serait trop maigre:
 * c'est le sacrifice des objets qui rend le palier signifiant, et le multiplicateur qui
 * fait accelerer la boucle au lieu de la faire stagner.
 */
export const PALIERS = [
  { cout: 500,   rareteMin: 1, multiplicateur: 2,  garde: 1 },
  { cout: 2500,  rareteMin: 2, multiplicateur: 4,  garde: 1 },
  { cout: 12000, rareteMin: 3, multiplicateur: 9,  garde: 2 },
  { cout: 60000, rareteMin: 4, multiplicateur: 20, garde: 2 }
] as const
export const REBIRTH_MAX = PALIERS.length

export function paliers(n: number) { return PALIERS[Math.min(n, PALIERS.length - 1)] }
export function coutRebirth(palier: number): number { return paliers(palier).cout }

/** Multiplicateur de revenu cumule apres n paliers. */
export function multiplicateurRevenu(n: number): number {
  return n <= 0 ? 1 : PALIERS[Math.min(n, PALIERS.length) - 1].multiplicateur
}

/**
 * Seuils de deblocage des etages, en objets collectes.
 * CALES SUR LA CONTRAINTE DE JUGEMENT, pas sur une courbe de progression longue: un juge
 * dispose de trois minutes. Si le 2e etage exigeait 10 objets (30 coups de caisse), il ne
 * verrait jamais son batiment grandir, et c'est precisement le moment qui donne envie de
 * rester. 4 objets = 12 coups, atteignable dans la premiere minute.
 * Le jeu de reference fait monter les etages avec les rebirths (progression longue): on
 * garde la MECANIQUE, on resserre la COURBE pour le format juge.
 */
export const SEUILS_ETAGE = [0, 4, 10] as const

/**
 * Les etages viennent de DEUX sources: la collecte (visible vite, pour le juge de passage)
 * et le rebirth (le vrai palier, qui coute des pieces). On prend le plus genereux des deux.
 */
export function etagesOuverts(objetsCollectes: number, rebirths = 0): number {
  let n = 1
  for (let i = 1; i < SEUILS_ETAGE.length; i++) if (objetsCollectes >= SEUILS_ETAGE[i]) n = i + 1
  return Math.min(Math.max(n, 1 + rebirths), ETAGES_MAX)
}

export function placesOuvertes(objetsCollectes: number, rebirths = 0): number {
  return etagesOuverts(objetsCollectes, rebirths) * SLOTS_PAR_ETAGE
}

/** Plafond absolu d'objets visibles sur une base. */
export const PLOT_MAX_OBJETS = SLOTS_PAR_ETAGE * ETAGES_MAX

/**
 * Position d'un emplacement dans le batiment. Les objets sont ranges du plus RARE au
 * plus commun, donc le plus convoite finit en HAUT: le voleur doit grimper pour l'avoir.
 */
export function slotPosition(slot: number): { dx: number; dy: number; dz: number } {
  const etage = Math.floor(slot / SLOTS_PAR_ETAGE)
  const k = slot % SLOTS_PAR_ETAGE
  // Deux rangees de trois le long des murs du fond: le butin se voit depuis l'entree.
  const col = k % 3
  const rang = Math.floor(k / 3)
  return {
    dx: (col - 1) * 1.4,
    dy: 0.45 + etage * ETAGE_HAUTEUR,
    dz: -0.9 - rang * 1.1
  }
}

/** L'escalier monte le long du mur droit, centre pour rester dans l'emprise. */
export function rampePosition(etage: number): { dx: number; dy: number; dz: number } {
  return { dx: BASE_COTE / 2 - 0.85, dy: etage * ETAGE_HAUTEUR + ETAGE_HAUTEUR / 2, dz: 0 }
}
/** Centre de la scene: 25 parcelles = 80x80 m. */
export const CENTRE = { x: 40, z: 40 }

export function plotPosition(index: number): { x: number; y: number; z: number } {
  let reste = index
  for (const a of ANNEAUX) {
    if (reste < a.places) {
      const ang = (reste / a.places) * Math.PI * 2
      return { x: CENTRE.x + Math.cos(ang) * a.rayon, y: 0, z: CENTRE.z + Math.sin(ang) * a.rayon }
    }
    reste -= a.places
  }
  return { x: CENTRE.x, y: 0, z: CENTRE.z }
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
