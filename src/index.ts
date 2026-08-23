import { isServer } from '@dcl/sdk/network'

// IMPORTS STATIQUES OBLIGATOIRES.
// registerMessages() et engine.defineComponent() doivent tourner au chargement du module,
// avant que le moteur ne se scelle. Un import() dynamique de ces fichiers jetterait
// "Engine is already sealed".
import { registerValidators } from './shared/schemas'
import './shared/messages'

import { setupUi } from './ui'

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
    void import('./client/setup').then(({ startClient }) => {
      startClient()
      setupUi()
    })
  }
}
