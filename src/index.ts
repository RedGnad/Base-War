import { isServer } from '@dcl/sdk/network'

// IMPORTS STATIQUES OBLIGATOIRES.
// registerMessages() et engine.defineComponent() doivent tourner au chargement du module,
// avant que le moteur ne se scelle. Un import() dynamique de ces fichiers jetterait
// "Engine is already sealed".
import { registerValidators } from './shared/schemas'
import './shared/messages'

// PAS D'IMPORT STATIQUE DE `./ui`.
// Bug trouve le 24 Aug apres dix heures de serveur muet: `main()` tourne DES DEUX COTES,
// donc un import statique charge tout l'arbre qu'il tire, y compris sur le serveur
// headless. `ui.tsx` tire `client/plots.ts` et `client/travel.ts`, qui importent
// `~system/RestrictedActions` (`movePlayerTo`, pose le 24 Aug pour l'ascenseur et les
// raccourcis). C'est une API de CONTEXTE CLIENT: sur le serveur, le chargement du module
// echoue et l'isolat meurt au demarrage, SANS UN SEUL MESSAGE, puisque le relais de
// journal n'a pas encore ete installe.
// Le skill le dit pour MessageBus et le principe est le meme: du code de contexte client
// ne doit jamais se trouver dans le graphe de modules du serveur.
// REGLE: seuls `shared/schemas` et `shared/messages` sont statiques (ils DOIVENT tourner
// avant le scellement du moteur). Tout le reste se charge dans sa branche.

export function main(): void {
  // Gardes d'ecriture: appele des deux cotes, no-op sur un client.
  // Sans elles, n'importe quel client peut ecrire l'etat autoritaire en direct.
  registerValidators()

  if (isServer()) {
    // Import dynamique: ce module tire @dcl/sdk/server, qui n'a rien a faire dans le
    // paquet client. Il ne definit aucun composant au niveau module, donc le chargement
    // tardif est sans danger.
    void import('./server/server').then(({ startServer }) => startServer())
  } else {
    void import('./client/setup').then(async ({ startClient }) => {
      startClient()
      const { setupUi } = await import('./ui')
      setupUi()
    })
  }
}
