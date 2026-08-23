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
  /** serveur -> tous: la caisse a cede, voici ce qui en sort */
  crateBroken: Schemas.Map({
    rarity: Schemas.Int,
    byId: Schemas.String,
    byName: Schemas.String
  })
} as const

export const room = registerMessages(MESSAGES)
