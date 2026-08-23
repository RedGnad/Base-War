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

/**
 * LE TAPIS. Coeur du jeu de reference (wiki, page `Red Carpet`):
 * *« a studded carpet where Brainrots spawn and walk across to the other side.
 *   People can buy Brainrots from it »*
 * *« You can buy one, and the Brainrot will go to your base. However, OTHER PEOPLE CAN BUY
 *   IT when it walks to your side »*
 *
 * Trois proprietes que notre caisse n'avait pas, et qui font le jeu:
 *  - PARTAGE: tout le monde voit passer les memes objets
 *  - DISPUTE: le premier qui paie l'emporte, competition SANS combat (Decentraland n'en a pas)
 *  - EVENEMENTIEL: une rarete qui apparait est annoncee, et tout le monde converge
 *
 * C'est aussi ce qui donne aux pieces leur vrai emploi: sans le tapis elles ne servent
 * qu'au rebirth, et rien ne met les joueurs en concurrence.
 */
export const Belt = engine.defineComponent('friendzone::belt', {
  /** identifiant stable de l'article tant qu'il defile */
  articleId: Schemas.Int,
  rarity: Schemas.Int,
  prix: Schemas.Int,
  /** avancee sur le tapis, de 0 (entree) a 1 (sortie) */
  progres: Schemas.Float,
  /** vide tant que personne n'a paye */
  acheteurNom: Schemas.String
})

export const TAPIS_LONGUEUR = 26
export const TAPIS_DUREE_S = 34          // temps pour traverser: laisse le temps de decider
export const TAPIS_INTERVALLE_S = 5      // un article toutes les 5 s
export const PORTEE_ACHAT = 5

/** Position d'un article selon son avancee. Le tapis traverse le lieu d'ouest en est. */
export function beltPosition(progres: number): { x: number; y: number; z: number } {
  return {
    x: CENTRE.x - TAPIS_LONGUEUR / 2 + progres * TAPIS_LONGUEUR,
    y: 1.15,
    z: CENTRE.z
  }
}

/** Prix d'un article, croissant avec la rarete. */
export const PRIX_RARETE = [40, 150, 600, 2600, 11000]

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

// parcelles (gratuites dans un World). Un anneau de rayon r exige une scene de rayon r+5.
// Contrepartie a peser: plus le lieu est grand, plus on marche, et un juge a 3 minutes.

/** 90 bases affichables. Au-dela on n'affiche plus, on ne casse pas. */
/**
 * Plafond d'affichage, pas de joueurs. Fixe par le rendu mobile (~1 000 appels de dessin
 * recommandes), pas par une grille. Au-dela, les bases les moins recemment vues ne sont
 * plus affichees; leur butin reste intact dans le profil de leur proprietaire.
 */
export const MAX_BASES_AFFICHEES = 60
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
/**
 * 8 m de cote. A 5 m c'etait exigu: un avatar doit pouvoir CIRCULER entre les objets et
 * monter la rampe sans se coincer. La reference va jusqu'a 31 emplacements, donc l'emprise
 * doit rester genereuse.
 */
export const BASE_COTE = 8.0
/**
 * La rampe doit TENIR DANS le batiment. Franchir `ETAGE_HAUTEUR` sous un angle a
 * demande une longueur de h/sin(a). A 32 degres pour 3,2 m il fallait 6,0 m, donc elle
 * depassait d'un batiment large de 5. A 40 degres pour 2,8 m il faut 4,36 m: ca rentre.
 */
export const RAMPE_ANGLE = 40
export const RAMPE_LONGUEUR = 4.4  // h/sin(40 deg) pour 2,8 m
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

/**
 * PLACEMENT LIBRE. Le joueur pose sa base ou il veut, avec un fantome au sol qui dit si
 * l'endroit convient. C'est le motif classique de construction, et il donne une vraie
 * decision d'implantation: pres du tapis pour acheter vite, a l'ecart pour se faire
 * oublier des voleurs, ou colle a un ami.
 */
export const GRILLE = 2                    // pas d'accrochage, en metres
export const ECART_MIN_BASES = 11          // entre deux centres: 8 m de base + circulation
export const MARGE_BORD = 7                // du bord de la scene
export const ECART_TAPIS = 6               // du tapis, pour ne pas le barrer

/** Accroche une coordonnee sur la grille de pose. */
export function accrocher(v: number): number {
  return Math.round(v / GRILLE) * GRILLE
}

/**
 * Un emplacement est-il valable ? Verifie cote CLIENT pour le fantome, et re-verifie
 * cote SERVEUR a la pose: le fantome est une aide, jamais une autorisation.
 */
export function raisonInvalide(
  x: number, z: number, cote: number,
  autres: Array<{ x: number; z: number }>
): string | null {
  if (x < MARGE_BORD || z < MARGE_BORD || x > cote - MARGE_BORD || z > cote - MARGE_BORD) {
    return 'trop pres du bord'
  }
  if (Math.abs(z - CENTRE.z) < ECART_TAPIS && Math.abs(x - CENTRE.x) < TAPIS_LONGUEUR / 2 + 4) {
    return 'sur le passage du tapis'
  }
  for (const a of autres) {
    const dx = a.x - x, dz = a.z - z
    if (Math.sqrt(dx * dx + dz * dz) < ECART_MIN_BASES) return 'trop pres d une autre base'
  }
  return null
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
  // Deux rangees de trois, ecartees vers les murs: le centre reste libre pour circuler
  // et pour la rampe. Un objet inatteignable est un objet involable.
  const col = k % 3
  const rang = Math.floor(k / 3)
  return {
    dx: (col - 1) * 2.2,
    dy: 0.45 + etage * ETAGE_HAUTEUR,
    dz: -2.6 + rang * 1.6
  }
}

/**
 * La rampe monte DANS la tremie, la bande de plancher laissee libre cote +X.
 * Elle doit etre centree sur cette bande, sinon elle debouche sous une dalle.
 */
export const TREMIE_LARGEUR = 2.6

export function rampePosition(etage: number): { dx: number; dy: number; dz: number } {
  return {
    dx: BASE_COTE / 2 - TREMIE_LARGEUR / 2,
    dy: etage * ETAGE_HAUTEUR + ETAGE_HAUTEUR / 2,
    dz: 0
  }
}
/** Centre de la scene: 25 parcelles = 80x80 m. */
export const CENTRE = { x: 40, z: 40 }


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
