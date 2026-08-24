import {
  PRODUCTION_RARETE, PRIX_ETAGE_ABS, PALIER_MAX, cumulPourPalier, multiplicateurPalier,
  HORS_LIGNE_TAUX_V2, HORS_LIGNE_PLAFOND_PRODUCTION_S
} from './economie'
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
  /**
   * COMPTEURS SOCIAUX, lisibles de l'exterieur sans entrer.
   * Ils disent qu'une personne existe derriere ce batiment et que d'autres sont venues.
   * C'est notre reponse directe a la regle d'elimination « Empty venues [...] are not
   * eligible »: le lieu n'est pas vide, il est plein de gens qui ne sont pas la.
   */
  donnes: Schemas.Int,
  recus: Schemas.Int,
  /**
   * SENTINELLE: charges de defense AUTOMATIQUE restantes.
   * Synchronisee, donc LISIBLE DE L'EXTERIEUR avant d'entrer. C'est la moitie du jeu:
   * le voleur voit ce qu'il risque et decide, au lieu de ramasser.
   */
  sentinelles: Schemas.Int,
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
  /** TYPE DE BOITE, pas une rarete: on achete du hasard, pas un objet connu. */
  typeBoite: Schemas.Int,
  prix: Schemas.Int,
  /** avancee sur le tapis, de 0 (entree) a 1 (sortie) */
  progres: Schemas.Float,
  /** vide tant que personne n'a paye */
  acheteurNom: Schemas.String
})

/**
 * LA SENTINELLE, defense automatique.
 *
 * Source, `stealabrainrot.fandom.com` page `Gears`, texte exact:
 *   All-Seeing Sentry: *« Use this sentry turret as means of AUTOMATED PROTECTION for you
 *   and your items »*
 *   Trap: *« Place traps that freeze thieves for 7 SECONDS »*
 *
 * Pourquoi elle et pas les gears TENUS (Bat, Taser, Medusa's Head, Rage Table) qui renvoient
 * aussi l'objet: ceux-la exigent un proprietaire CONNECTE au moment du vol. A 191 330 joueurs
 * simultanes c'est un choix raisonnable; chez nous, ou le lieu le plus frequente de la
 * plateforme comptait ONZE joueurs et ou les juges testent seuls, c'est une mecanique morte.
 * La sentinelle est la SEULE defense de la reference qui agisse en l'absence de son
 * proprietaire, et c'est exactement la question qu'on ne savait pas resoudre.
 *
 * Elle a des CHARGES et pas une duree: une defense qui expire punit celui qui se deconnecte,
 * une defense qui se consomme punit celui qui se fait beaucoup voler. La seconde est juste.
 */
export const SENTINELLE_CHARGES = 3
/** Cout = 120 s de la production du proprietaire, plancher 240 (quatre boites de base). */
export const SENTINELLE_SECONDES = 120
export const SENTINELLE_MINIMUM = 240
/** 7 s, la valeur exacte du `Trap` de la reference. */
export const SENTINELLE_GEL_MS = 7000
/**
 * ET ELLE REVERROUILLE LA BASE. Sans ca, le voleur attend 7 s, revient, et vide les
 * trois charges en une minute: la sentinelle ne fait que RETARDER, elle ne dissuade rien.
 * Le verrou de 60 s est la valeur de la reference (wiki `Base`: *« The Base has a lock of
 * 60 seconds »*), on la reutilise plutot que d'inventer un second delai.
 * Consequence: vider une sentinelle a trois charges coute TROIS MINUTES d'attente, pendant
 * lesquelles le proprietaire peut revenir et la reamorcer. La base reste prenable, elle
 * n'est plus gratuite.
 */
export const SENTINELLE_VERROU_MS = 60_000

/**
 * PRIME DE PRESENCE.
 *
 * Source, transcription 2: *« sur Build Your Gym, on a mis un petit boost d'argent si la
 * personne se situe sur le meme serveur qu'un pote. Si on clique, on peut carrement
 * inviter ses potes »*, et le raisonnement qui va avec: *« le monde attire le monde »*.
 *
 * Elle vise deux verbes ecrits par le sponsor, *invite friends* et *stay longer*, et elle
 * est HONNETE par construction: elle se calcule sur la presence REELLE, il n'y a rien a
 * simuler. Seul, elle vaut zero et ne bloque rien: c'est une prime, pas une porte.
 *
 * +15 % par joueur supplementaire, plafonne a +60 %. Le plafond mord a CINQ joueurs,
 * calibre sur les formats mesures: Steal An Egg tourne sur des serveurs de 7, Grow a
 * Garden de 4, et le lieu le plus frequente de Decentraland comptait onze joueurs. Un
 * plafond plus haut ne recompenserait qu'une affluence qui n'existe pas.
 */
export const PRIME_PRESENCE_PAR_JOUEUR = 0.15
export const PRIME_PRESENCE_PLAFOND = 0.60

export function primePresence(nbPresents: number): number {
  return Math.min(PRIME_PRESENCE_PLAFOND, Math.max(0, nbPresents - 1) * PRIME_PRESENCE_PAR_JOUEUR)
}

export const TAPIS_LONGUEUR = 26
export const TAPIS_DUREE_S = 34          // temps pour traverser: laisse le temps de decider
export const TAPIS_INTERVALLE_S = 5      // un article toutes les 5 s
export const PORTEE_ACHAT = 5

/**
 * Position d'un article selon son avancee. Le tapis traverse le lieu d'ouest en est.
 *
 * Au-dela de 1, l'article TOMBE DANS LA FOSSE au bout du tapis. Une boite que personne
 * n'a prise doit finir quelque part: une disparition seche ne se lit pas, et rate
 * l'occasion de montrer ce qu'on vient de laisser passer.
 */
export const CHUTE_FIN = 0.22        // part de course consacree a la chute
export const FOSSE_PROFONDEUR = 2.4   // du tapis (2,65) au fond de la fosse (0,25)

/**
 * Le tapis est SURELEVE. Au sol, aucune fosse n'est possible: Decentraland interdit
 * de descendre sous y=0, donc le "trou" ne pouvait etre qu'un bac pose par-dessus, ce
 * qui ne se lit pas. Sur pieds a 2,2 m, la chute fait 2 m dans un vrai renfoncement.
 * Hauteur choisie pour rester a portee de main d'un avatar (1,8 m).
 */
export const TAPIS_HAUTEUR = 2.2

export function beltPosition(progres: number): { x: number; y: number; z: number } {
  const surTapis = Math.min(progres, 1)
  const x = CENTRE.x - TAPIS_LONGUEUR / 2 + surTapis * TAPIS_LONGUEUR
  if (progres <= 1) return { x, y: TAPIS_HAUTEUR + 0.45, z: CENTRE.z }
  // Chute VERTICALE, dans l'axe du tapis. Une derive laterale se lisait comme un
  // objet ejecte, pas comme un objet qui bascule dans un trou.
  // Acceleration en t au carre: une chute a vitesse constante n'a pas de poids.
  const t = Math.min((progres - 1) / CHUTE_FIN, 1)
  return { x, y: TAPIS_HAUTEUR + 0.45 - t * t * FOSSE_PROFONDEUR, z: CENTRE.z }
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
export const VERROU_GRATUIT_MS = 60_000   // 3.2 verrou activable, duree SOURCEE au wiki
/**
 * TEMPS DE RECHARGE DU VERROU. `[DERIVE, PAS SOURCE]`
 * Le wiki donne la duree (60 s, +10 s par palier) mais AUCUN temps de recharge.
 * Or un verrou reactivable a volonte rendrait le vol impossible, et le jeu de reference
 * repose entierement sur le vol: une limite existe forcement, elle n'est simplement pas
 * documentee dans ce qu'on atteint.
 * Retenu: 150 s a compter de la FIN du verrou. Cycle 60 s protege / 150 s expose, soit
 * ~29 % du temps sous protection. A REEQUILIBRER si le vol devient trop facile ou trop
 * rare une fois teste a deux joueurs.
 */
export const VERROU_RECHARGE_MS = 150_000
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
/**
 * COTE DE LA BASE, porte de 8 a 11 m le 24 Aug sur retour utilisateur (« les bases peuvent
 * etre plus spacieuses »).
 * Ce n'est pas cosmetique. A 8 m, avec six emplacements par etage plus la tremie de la
 * rampe, un avatar frotte les objets en circulant, et un objet qu'on ne peut pas atteindre
 * proprement est un objet involable: c'est la mecanique qui se degrade, pas le decor.
 * 11 m laisse ~1,2 m de passage entre deux rangees et devant la rampe.
 */
export const BASE_COTE = 11.0
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
/**
 * PALIERS (prestige). PRIX CALCULES, pas devines ni copies.
 *
 * Ce que coute VRAIMENT un prestige, mesure par simulation seconde par seconde:
 * le sacrifice des objets ne coute que **39 a 69 secondes** de reconstruction (les
 * boites se remboursent en 60 s, donc on refait une base pleine tres vite). Le PRIX EN
 * PIECES porte donc tout le poids du choix.
 *
 * Chaque palier exige de POSSEDER une rarete donnee, donc la base produit bien plus au
 * moment de l'achat, et le gain du +1 de multiplicateur suit:
 *
 *   palier 1 (exige Uncommon ): 12 x   4 =   48/s · gain +48/s   -> 48 x 300 =  14 400
 *   palier 2 (exige Rare     ): 12 x  16 =  192/s · gain +192/s  -> 192 x 300 =  57 600
 *   palier 3 (exige Epic     ): 12 x  64 =  768/s · gain +768/s  -> 768 x 300 = 230 400
 *   palier 4 (exige Legendary): 12 x 256 = 3072/s · gain +3072/s -> 3072 x 300 = 921 600
 *
 * REGLE: remboursement en 300 s, le pari le plus long du jeu.
 *   une boite : 60 s · un etage : 120 s · un palier : 300 s
 *
 * Les rapports obtenus valent 4,0 partout, ce qui tombe dans la fourchette 3 a 5 de la
 * courbe de reference. On y arrive par CALCUL, pas par imitation: c'est la meme
 * conclusion atteinte independamment, ce qui la rend plus solide qu'une transposition.
 */
/**
 * DOUZE paliers, generes par la REGLE calculee plutot qu'ecrits un par un.
 *
 * Cout(n) = 12 emplacements x revenu de la rarete exigee x 300 s.
 * La rarete exigee monte d'un cran tous les deux paliers, et plafonne a Secret (6).
 * Multiplicateur: +1 par palier, comme la reference (x0.5, x1, x2, x3...).
 *
 * Douze paliers au lieu de quatre, parce que la mesure est sans appel: notre contenu
 * s'epuisait en 19 minutes de jeu actif. La reference en a 19, et c'est le NOMBRE de
 * marches qui fait tenir un jeu des semaines, pas la lenteur de chacune.
 */
/**
 * PALIERS: RACINE CUBIQUE DU GAIN CUMULE, la formule exacte de la reference.
 *
 * Ce bloc portait une table calculee a la main (« 12 emplacements x revenu de la rarete
 * exigee x 300 s »), et le commentaire au-dessus se felicitait d'arriver « par CALCUL,
 * pas par imitation » a des rapports de 4,0. La mesure du 24 Aug a montre que la
 * reference ne fait PAS 4,0: elle fait un rapport cout/production qui DOUBLE a chaque
 * palier, et un reset en racine cubique. Notre calcul independant etait faux, et la
 * fierte de ne pas avoir imite nous a coute une economie plate.
 *
 * La rarete exigee monte d'un cran tous les deux paliers, ce qui reste: c'est la porte
 * qui empeche de franchir un palier en accumulant du commun.
 */
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

/** Multiplicateur de revenu cumule apres n paliers. */
export function multiplicateurRevenu(n: number): number {
  return n <= 0 ? 1 : PALIERS[Math.min(n, PALIERS.length) - 1].multiplicateur
}

/**
 * PRIX DES ETAGES: derives de `shared/economie.ts`.
 *
 * Le bloc precedent les calculait sur « 300 s de remboursement, remplissage compris »,
 * ce qui donnait 5 760 et 23 040. Avec une production qui croit en x6,6 par rarete, un
 * prix ABSOLU calcule sur le stade de depart devient trivial deux crans plus loin:
 * mesure, une nuit hors ligne payait 21 etages alors qu'il n'en existe que 3.
 * Les nouveaux prix suivent la meme geometrie que la production (x12,5) et valent
 * environ quinze minutes de jeu au moment ou l'etage devient utile.
 */
export const PRIX_ETAGE = PRIX_ETAGE_ABS

export function prixEtage(etageVise: number): number {
  return PRIX_ETAGE[Math.max(0, Math.min(etageVise - 1, PRIX_ETAGE.length - 1))]
}

/**
 * Les etages viennent de DEUX sources: la collecte (visible vite, pour le juge de passage)
 * et le rebirth (le vrai palier, qui coute des pieces). On prend le plus genereux des deux.
 */
/** Les etages ne viennent QUE de l'achat. Le palier, lui, ne donne qu'un multiplicateur. */
export function etagesOuverts(etagesAchetes = 0): number {
  return Math.min(1 + etagesAchetes, ETAGES_MAX)
}

export function placesOuvertes(etagesAchetes = 0): number {
  return etagesOuverts(etagesAchetes) * SLOTS_PAR_ETAGE
}

/**
 * PLACEMENT LIBRE. Le joueur pose sa base ou il veut, avec un fantome au sol qui dit si
 * l'endroit convient. C'est le motif classique de construction, et il donne une vraie
 * decision d'implantation: pres du tapis pour acheter vite, a l'ecart pour se faire
 * oublier des voleurs, ou colle a un ami.
 */
/**
 * DELAI ENTRE DEUX DEPLACEMENTS DE BASE.
 * Sans lui, on peut teleporter sa base des qu'un voleur approche: la defense devient
 * gratuite et le vol impossible. Le premier placement ne compte pas comme un
 * deplacement, pour ne pas punir un choix fait avant de connaitre le lieu.
 */
export const DELAI_DEPLACEMENT_MS = 180_000

/**
 * GAINS HORS LIGNE. Cite par le praticien comme l'une des trois « mecaniques virales »
 * que quasi tous les jeux ont, et son levier de RETOUR numero un:
 *   « meme si le joueur est deconnecte, le jeu continue d'accumuler l'argent des
 *    machines. Des qu'il se reconnecte, on lui affiche cette fenetre qui lui indique
 *    combien il a gagne [...] la personne a envie de revenir »
 *
 * J'avais SUPPRIME cette accumulation en corrigeant un bug (un million de pieces en
 * cinq minutes). L'erreur etait de retirer la fonctionnalite au lieu de la PLAFONNER.
 *
 * Deux gardes qui rendent la chose saine:
 *  - un TAUX REDUIT: hors ligne on ne gagne qu'une fraction, sinon rester connecte
 *    n'a plus d'interet et le jeu se joue tout seul
 *  - un PLAFOND de duree: au-dela, l'accumulation s'arrete. C'est ce qui donne envie
 *    de revenir SOUVENT plutot que de laisser mijoter une semaine
 */
export const HORS_LIGNE_TAUX = HORS_LIGNE_TAUX_V2        // 35 % du revenu normal
/** Conserve pour borner l'ecart de temps; le VRAI plafond est en secondes de production. */
export const HORS_LIGNE_PLAFOND_MS = 4 * 3600_000
export { HORS_LIGNE_PLAFOND_PRODUCTION_S }

/**
 * COLLECTE MANUELLE. Le praticien insiste: *« on a fait un bouton parce que sur Roblox,
 * il faut SIMPLIFIER la vie des joueurs. Ils ont vraiment pas votre temps. »*
 *
 * L'argent s'accumule dans une reserve, et un bouton l'encaisse. Deux effets:
 *  - un GESTE regulier au lieu d'un compteur qui monte tout seul, donc une raison de
 *    revenir a l'ecran et une petite recompense a chaque fois
 *  - la reserve PLAFONNE, donc laisser tourner sans rien faire ne paie pas
 */
export const RESERVE_PLAFOND_S = 600      // 10 minutes de production accumulables

/**
 * RECOMPENSES QUOTIDIENNES SUR 7 JOURS. Decidees des le memo (§3.1) sur la foi du
 * praticien: *« pour augmenter la retention apres une semaine, on a rajoute des
 * recompenses si on se connecte chaque jour pendant une semaine »*.
 * La recompense du JOUR 1 se debloque immediatement: c'est elle qui annonce la boucle.
 * Pas de palier long: le badge « streak 30 jours » du champ n'est atteint que par
 * 3 036 joueurs, contre 1 440 pour « 100 jours » (mesure du memo).
 */
export const RECOMPENSES_JOUR = [0, 0, 1, 1, 2, 2, 3] as const   // type de boite offerte

/** Valeur de revente d'un objet: 30 secondes de sa production. */
export const REVENTE_SECONDES = 30

export const GRILLE = 2                    // pas d'accrochage, en metres
export const ECART_MIN_BASES = 15          // 11 m de base + 4 m de rue entre deux voisins
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
  // Les emplacements s'ECARTENT avec le batiment, et se DECALENT vers -X.
  // La tremie de la rampe occupe la bande +X, de dx = 2,5 a dx = 5,5. Une colonne
  // centree aurait pose des objets DANS la cage d'escalier: verifie par le calcul avant
  // d'ecrire, parce qu'en jeu ca se serait vu comme un objet qui flotte dans le vide.
  // Ici la borne haute vaut 1,2 + 0,225 = 1,425, largement sous 2,5.
  return {
    dx: (col - 1.5) * 2.4,
    dy: 0.45 + etage * ETAGE_HAUTEUR,
    dz: -3.4 + rang * 2.4
  }
}

/**
 * La rampe monte DANS la tremie, la bande de plancher laissee libre cote +X.
 * Elle doit etre centree sur cette bande, sinon elle debouche sous une dalle.
 */
export const TREMIE_LARGEUR = 3.0

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
