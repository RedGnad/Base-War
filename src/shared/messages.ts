import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// registerMessages() definit un composant en interne: comme les schemas, il doit tourner
// au chargement du module. Import statique obligatoire depuis index.ts.

export const MESSAGES = {
  /** client -> serveur: j'ai tape la caisse. Aucune donnee de jeu n'est envoyee par le client. */
  tap: Schemas.Map({}),
  /** serveur -> client: retour immediat, sert a mesurer l'aller-retour. */
  tapAck: Schemas.Map({ count: Schemas.Int, persisted: Schemas.Boolean }),

  /** client -> serveur: j'ai frappe la caisse. AUCUNE donnee de jeu: le serveur decide tout. */
  hitCrate: Schemas.Map({}),
  /** serveur -> celui qui a frappe: coup refuse et pourquoi (trop loin = triche probable) */
  hitRejected: Schemas.Map({ raison: Schemas.String, antiCheat: Schemas.Boolean }),
  /**
   * serveur -> tous: relais de journal.
   * Les `console.log` du serveur headless NE REMONTENT PAS dans la console de scene du
   * client (runtime separe), ce qui rend tout echec serveur invisible en developpement.
   * Ce relais est notre seule fenetre. A garder jusqu'au gel, il coute une chaine.
   */
  serverLog: Schemas.Map({ line: Schemas.String }),

  /**
   * client -> serveur: je veux CET objet-la, chez CE joueur.
   * Le voleur choisit sa cible, comme chez le #1 (wiki: « check what Brainrots are on
   * each floor »). Le client exprime une INTENTION, il n'affirme rien: le serveur
   * verifie la portee, le verrou, l'existence de l'objet, et decide seul.
   */
  stealItem: Schemas.Map({ ownerId: Schemas.String, slot: Schemas.Int }),
  /** serveur -> chaque joueur: son solde et le cout du prochain palier. */
  wallet: Schemas.Map({ coins: Schemas.Float, prochainPalier: Schemas.Int, palier: Schemas.Int, rareteMin: Schemas.Int, multiplicateur: Schemas.Int, revenu: Schemas.Float, basePosee: Schemas.Boolean, verrouSec: Schemas.Int, aReprendre: Schemas.Boolean, prixEtage: Schemas.Int, rechargeSec: Schemas.Int, reserve: Schemas.Int }),

  /**
   * client -> serveur: je pose ma base sur l'emplacement n.
   * Le joueur CHOISIT ou il s'installe: pres du tapis pour acheter vite, ou a l'ecart
   * pour se faire oublier des voleurs. C'est une decision, pas une attribution.
   */
  claimSlot: Schemas.Map({ x: Schemas.Float, z: Schemas.Float }),
  /** serveur -> tous: ou sont les bases, pour que le fantome sache ce qui est occupe. */
  basePositions: Schemas.Map({ xs: Schemas.Array(Schemas.Float), zs: Schemas.Array(Schemas.Float) }),

  /** client -> serveur: j'achete l'article n du tapis. Le serveur verifie tout. */
  buyBelt: Schemas.Map({ articleId: Schemas.Int }),
  /** serveur -> tous: une boite chere vient d'entrer sur le tapis. */
  beltAlert: Schemas.Map({ typeBoite: Schemas.Int }),
  /** serveur -> tous: quelqu'un a rafle une boite. */
  bought: Schemas.Map({ byName: Schemas.String, typeBoite: Schemas.Int, prix: Schemas.Int }),

  /** client -> serveur: j'ouvre une boite de mon stock. */
  openBox: Schemas.Map({ typeBoite: Schemas.Int }),
  /**
   * serveur -> l'ouvreur: voici ce qu'elle contenait.
   * Le resultat est decide par le SERVEUR; la roulette du client n'est que du theatre
   * qui atterrit dessus. C'est ainsi que fonctionne toute loterie honnete.
   */
  boxResult: Schemas.Map({ typeBoite: Schemas.Int, rarity: Schemas.Int, mutation: Schemas.Int, etat: Schemas.String }),
  /** serveur -> chaque joueur: son stock de boites non ouvertes, par type. */
  inventory: Schemas.Map({ boites: Schemas.Array(Schemas.Int) }),

  /** client -> serveur: je franchis un palier. Le serveur verifie que j'ai les pieces. */
  rebirth: Schemas.Map({}),
  /** serveur -> l'auteur: palier franchi. */
  rebirthDone: Schemas.Map({ palier: Schemas.Int, etages: Schemas.Int }),

  /**
   * client -> serveur: je deplace MON objet de l'emplacement `de` vers `vers`.
   * Le placement devient une DECISION: mettre son objet rare en haut le protege
   * (le voleur doit grimper, ralenti), le mettre en bas le rend facile a reprendre.
   */
  moveItem: Schemas.Map({ de: Schemas.Int, vers: Schemas.Int }),

  /** serveur -> le joueur: la liste de ce qu'il a deja decouvert. */
  index: Schemas.Map({ vus: Schemas.Array(Schemas.Int) }),

  /** client -> serveur: j'encaisse ma reserve. */
  collect: Schemas.Map({}),
  /** serveur -> le collecteur: combien a ete verse. */
  collected: Schemas.Map({ gain: Schemas.Int }),
  /**
   * serveur -> le joueur: ses trois quetes du jour et l'etat du calendrier 7 jours.
   * Envoye a l'entree puis a chaque avancement, pour que la barre bouge au moment de
   * l'action: une quete dont le compteur n'avance qu'au rechargement ne se lit pas.
   */
  quests: Schemas.Map({
    ids: Schemas.Array(Schemas.Int), progres: Schemas.Array(Schemas.Int),
    cibles: Schemas.Array(Schemas.Int), pris: Schemas.Array(Schemas.Int),
    jour: Schemas.Int, jourPris: Schemas.Boolean
  }),
  /** serveur -> le joueur: l'etape du tutoriel qu'il lui reste a faire. */
  tutorial: Schemas.Map({ etape: Schemas.Int, total: Schemas.Int }),
  /** serveur -> le joueur: cadeau des 15 minutes de presence continue. */
  timeGift: Schemas.Map({ boite: Schemas.Int, minutes: Schemas.Int }),

  /** client -> serveur: je frappe le boss. Le serveur verifie la portee et decide. */
  hitBoss: Schemas.Map({}),
  /** serveur -> tous: le boss est tombe. */
  bossDown: Schemas.Map({ parNom: Schemas.String, participants: Schemas.Int }),
  /** serveur -> tous: le boss est revenu. */
  bossUp: Schemas.Map({}),
  /** serveur -> un participant: sa part. */
  bossReward: Schemas.Map({ boite: Schemas.Int, coups: Schemas.Int, meilleur: Schemas.Boolean }),

  /** client -> serveur: une repetition sur la machine n. Le serveur verifie la portee. */
  trainRep: Schemas.Map({ machine: Schemas.Int }),
  /** serveur -> le joueur: ou en est sa serie, et sa recharge. */
  trainState: Schemas.Map({ machine: Schemas.Int, reps: Schemas.Int, cible: Schemas.Int, rechargeSec: Schemas.Int }),
  /** serveur -> le joueur: serie terminee, voici le gain. */
  trainDone: Schemas.Map({ machine: Schemas.Int, gain: Schemas.Int }),

  /** client -> serveur: j'encaisse la quete n (3 = le bonus des trois). */
  claimQuest: Schemas.Map({ slot: Schemas.Int }),

  /** serveur -> le joueur: sa recompense quotidienne. */
  dailyReward: Schemas.Map({ jour: Schemas.Int, boite: Schemas.Int }),

  /** serveur -> le joueur qui revient: ce qu'il a gagne pendant son absence. */
  offlineEarnings: Schemas.Map({ gain: Schemas.Int, secondes: Schemas.Int }),

  /** client -> serveur: j'achete un etage de plus. */
  buyFloor: Schemas.Map({}),
  /** serveur -> l'acheteur: etage ouvert. */
  floorBought: Schemas.Map({ etages: Schemas.Int, cout: Schemas.Int }),

  /** client -> serveur: je revends MON objet n pour faire de la place. */
  sellItem: Schemas.Map({ slot: Schemas.Int }),
  /** serveur -> le vendeur: combien ca a rapporte. */
  sold: Schemas.Map({ gain: Schemas.Int, rarity: Schemas.Int }),

  /** client -> serveur: je protege mon emplacement. */
  activateLock: Schemas.Map({}),
  /** client -> serveur: je reprends mon bien au voleur qui est pres de moi. */
  reclaim: Schemas.Map({}),
  /** serveur -> l'auteur: refus, avec la raison. */
  actionRejected: Schemas.Map({ action: Schemas.String, raison: Schemas.String, antiCheat: Schemas.Boolean }),
  /** serveur -> LA VICTIME uniquement: alerte nominative. */
  youWereRobbed: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  /** serveur -> le voleur: applique-toi le malus (le client seul controle sa locomotion). */
  thiefPenalty: Schemas.Map({ ms: Schemas.Int }),
  /** serveur -> tous: un vol a eu lieu, pour le fil d'activite. */
  stolen: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, rarity: Schemas.Int, mutation: Schemas.Int }),
  /** serveur -> tous: un bien a ete repris. */
  reclaimed: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, rarity: Schemas.Int }),

  /** serveur -> tous: la caisse a cede, voici ce qui en sort */
  crateBroken: Schemas.Map({
    rarity: Schemas.Int,
    byId: Schemas.String,
    byName: Schemas.String
  })
} as const

export const room = registerMessages(MESSAGES)
