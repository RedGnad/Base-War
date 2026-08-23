import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// registerMessages() definit un composant en interne: comme les schemas, il doit tourner
// au chargement du module. Import statique obligatoire depuis index.ts.

export const MESSAGES = {
  /** client -> serveur: j'ai tape la caisse. Aucune donnee de jeu n'est envoyee par le client. */
  tap: Schemas.Map({}),
  /** serveur -> client: retour immediat, sert a mesurer l'aller-retour. */
  tapAck: Schemas.Map({ count: Schemas.Int, persisted: Schemas.Boolean })
} as const

export const room = registerMessages(MESSAGES)
