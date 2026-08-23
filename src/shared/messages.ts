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
  /** client -> serveur: je prends un objet sur l'emplacement d'a cote. */
  stealItem: Schemas.Map({}),
  /** client -> serveur: je protege mon emplacement. */
  activateLock: Schemas.Map({}),
  /** client -> serveur: je reprends mon bien au voleur qui est pres de moi. */
  reclaim: Schemas.Map({}),
  /** serveur -> l'auteur: refus, avec la raison. */
  actionRejected: Schemas.Map({ action: Schemas.String, raison: Schemas.String, antiCheat: Schemas.Boolean }),
  /** serveur -> LA VICTIME uniquement: alerte nominative. */
  youWereRobbed: Schemas.Map({ byName: Schemas.String, rarity: Schemas.Int }),
  /** serveur -> le voleur: applique-toi le malus (le client seul controle sa locomotion). */
  thiefPenalty: Schemas.Map({ ms: Schemas.Int }),
  /** serveur -> tous: un vol a eu lieu, pour le fil d'activite. */
  stolen: Schemas.Map({ byName: Schemas.String, fromName: Schemas.String, rarity: Schemas.Int }),
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
