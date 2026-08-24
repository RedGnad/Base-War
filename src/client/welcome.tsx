import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, UiEntity } from '@dcl/sdk/react-ecs'

/**
 * MESSAGE D'ACCUEIL. Le guide UX officiel le prescrit explicitement, avec sa liste:
 * *« The scene title · Welcome the player · End goal & motivation · Instructions »*,
 * et l'avertissement: *« make sure the popup isn't too intrusive and that it's easy
 * to close »*.
 *
 * C'est aussi notre plus gros trou d'onboarding: un juge dispose de trois minutes, et
 * jusqu'ici rien ne lui disait ce qu'il fait la.
 */

export const welcomeView = { ouvert: true }
export function fermerAccueil(): void { welcomeView.ouvert = false }

const LIGNES = [
  ['1', 'OPEN your free crate: smash it 3 times'],
  ['2', 'BUILD your base anywhere on the map'],
  ['3', 'Loot earns coins into a pool: tap COLLECT to bank it'],
  ['4', 'Buy better crates from the belt'],
  ['5', 'Steal from other bases. LOCK yours']
]

export const WelcomePanel = () => {
  if (!welcomeView.ouvert) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  return (
    // Plein ecran cliquable: « easy to close by clicking anywhere ».
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
      onMouseDown={fermerAccueil}
    >
      <UiEntity
        uiTransform={{ width: 620, height: 380, flexDirection: 'column', padding: 26, justifyContent: 'space-between' }}
        uiBackground={{ color: Color4.create(0.04, 0.05, 0.08, 0.97) }}
      >
        <Label value="FRIENDZONE" fontSize={38} color={Color4.fromHexString('#ffd166ff')} uiTransform={{ height: 46 }} />
        <Label
          value="Collect, display, and steal. Your loot earns while it's on show: and while it's on show, anyone can take it."
          fontSize={16} color={Color4.fromHexString('#c8d0dcff')} uiTransform={{ height: 46 }} />

        {LIGNES.map(([n, t]) => (
          <UiEntity key={n} uiTransform={{ height: 30, flexDirection: 'row', alignItems: 'center' }}>
            <Label value={n} fontSize={17} color={Color4.fromHexString('#ffd166ff')} uiTransform={{ width: 26 }} />
            <Label value={t} fontSize={16} color={Color4.White()} />
          </UiEntity>
        ))}

        <Button
          uiTransform={{ width: 200, height: 48, alignSelf: 'center' }}
          value="START" variant="primary" fontSize={18} onMouseDown={fermerAccueil} />
      </UiEntity>
    </UiEntity>
  )
}
