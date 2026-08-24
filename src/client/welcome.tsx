import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, UiEntity } from '@dcl/sdk/react-ecs'

export const welcomeView = { ouvert: true }
export function fermerAccueil(): void { welcomeView.ouvert = false }

const LIGNES = [
  ['1', 'BUILD your base anywhere on the map'],
  ['2', 'OPEN your free crate: smash it 3 times'],
  ['3', 'Loot earns coins into a pool: tap COLLECT to bank it'],
  ['4', 'Buy better crates from the belt'],
  ['5', 'Take from other bases, or leave a gift. LOCK yours']
]

export const WelcomePanel = () => {
  if (!welcomeView.ouvert) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
      onMouseDown={fermerAccueil}
    >
      <UiEntity
        uiTransform={{ width: 620, height: 380, flexDirection: 'column', padding: 26, justifyContent: 'space-between' }}
        uiBackground={{ color: Color4.create(0.04, 0.05, 0.08, 0.97) }}
      >
        <Label value="BASE TYCOON" fontSize={38} color={Color4.fromHexString('#ffd166ff')} uiTransform={{ height: 46 }} />
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
