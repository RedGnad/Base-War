import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP } from './theme'
import { Glyphs } from './glyphs'
import { Btn } from './ui-kit'

export const welcomeView = { open: true }
export function closeWelcome(): void { welcomeView.open = false }

/**
 * Five lines, and the verb comes first.
 *
 * A player reads the first two words of each line and no more, so the action carries them
 * and the explanation follows. Shortened again when the type doubled: at readable size
 * these have to fit one line each, and a sentence that wraps is a sentence nobody reads.
 */
const LIGNES: Array<[string, string]> = [
  ['1', 'BUILD your base'],
  ['2', 'SMASH your crate, three hits'],
  ['3', 'COLLECT what your loot earns'],
  ['4', 'BUY better crates off the belt'],
  ['5', 'STEAL from other bases. LOCK yours']
]

export const WelcomePanel = () => {
  if (!welcomeView.open) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.62) }}
      onMouseDown={closeWelcome}
    >
      <UiEntity
        uiTransform={{ width: 900, height: 560, flexDirection: 'column', padding: 24, justifyContent: 'space-between' }}
        uiBackground={{ color: Color4.create(0.04, 0.05, 0.08, 0.97) }}
      >
        <UiEntity uiTransform={{ width: '100%', height: 54 }}>
          <Glyphs value="BASE TYCOON" size={TYPE.title} color={C.bonus} />
        </UiEntity>
        <Label
          value="Your loot earns while it is on show. While it is on show, anyone can take it."
          fontSize={TYPE.caption} color={C.dim} uiTransform={{ height: 44 }} />

        {LIGNES.map(([n, t]) => (
          <UiEntity key={n} uiTransform={{ height: 46, flexDirection: 'row', alignItems: 'center' }}>
            <Label value={n} fontSize={TYPE.label} color={C.bonus} uiTransform={{ width: 38 }} />
            <Label value={t} fontSize={TYPE.label} color={C.name} />
          </UiEntity>
        ))}

        <UiEntity uiTransform={{ width: 320, height: TAP.height, alignSelf: 'center' }}>
          <Btn label="START" width={320} primary onClick={closeWelcome} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
