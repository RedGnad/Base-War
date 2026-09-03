import { isServer } from '@dcl/sdk/network'

// Static imports only. registerMessages() and defineComponent() must run at module load,
// before the engine seals; a dynamic import of these would throw "Engine is already sealed".
import { registerValidators } from './shared/schemas'
import './shared/messages'

export function main(): void {
  registerValidators()

  // main() runs on BOTH sides, so anything imported statically here loads on the headless
  // server too. Each branch pulls its own tree lazily.
  if (isServer()) {
    void import('./server/server').then(({ startServer }) => startServer())
  } else {
    void import('./client/setup').then(async ({ startClient }) => {
      const { setupProfile } = await import('./client/profil')
      setupProfile()
      startClient()
      const { setupUi } = await import('./ui')
      setupUi()
    })
  }
}
