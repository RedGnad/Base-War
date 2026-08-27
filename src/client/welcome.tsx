import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP } from './theme'
import { Glyphs } from './glyphs'
import { Btn } from './ui-kit'
import { strip } from './layout'

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

/**
 * The way in, and it never holds the player back.
 *
 * The server takes about fifteen seconds to cold-start, and it was tempting to keep this
 * panel shut until it answered. That is the wrong trade: dismissing the first screen the
 * instant you have read it is what makes a game feel like it belongs to you, and a START
 * that refuses to start is worse than a game that is still loading. The world itself needs
 * no server, so the player leaves here into something that works: they walk, they look,
 * they find the belt. Only an action that changes the world has to wait, and that wait is
 * shown where it happens rather than in front of the door.
 */
export const WelcomePanel = () => {
  if (!welcomeView.open) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  return (
    /*
      Full bleed, and no veil behind it.

      This was a panel floating on a sixty-two percent black wash of the whole screen. On a
      desktop the wash covers everything and reads as a dimming; on a phone the renderer
      insets the canvas by the device's safe margins, so the wash stops short of the edges
      and turns into a second dark rectangle around the first. That is what looked like an
      extra panel, and it was only ever visible on a handset because desktop insets are zero.

      A wash that cannot reach the edges is not worth keeping, and a first screen has no
      reason to be a window: it is the only thing there is at that moment. So it fills what
      it is given, and the content inside is what gets a width.
    */
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%', positionType: 'absolute',
        justifyContent: 'center', alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0.04, 0.05, 0.08, 0.98) }}
      onMouseDown={closeWelcome}
    >
      <UiEntity
        uiTransform={{
          width: strip(900).width, height: 600,
          flexDirection: 'column', padding: 24, justifyContent: 'space-between'
        }}
      >
        <UiEntity uiTransform={{ width: '100%', height: 54 }}>
          <Glyphs value="BASE WAR" size={TYPE.title} role="bonus" />
        </UiEntity>
        {/* The goal in one line, before the how: the platform's own guide asks a welcome to state the end goal. */}
        <Label
          uiTransform={{ width: '100%', height: 40 }}
          value="GOAL: top the records board. Earn, steal, defend."
          fontSize={TYPE.label} color={C.bonus} />
        <Label
          uiTransform={{ width: '100%', height: 40 }}
          value="Your loot earns while it is on show. While it is on show, anyone can take it."
          fontSize={TYPE.caption} color={C.dim} />

        {LIGNES.map(([n, t]) => (
          <UiEntity key={n} uiTransform={{ height: 46, flexDirection: 'row', alignItems: 'center' }}>
            <Label value={n} fontSize={TYPE.label} color={C.bonus} uiTransform={{ width: 38 }} />
            <Label uiTransform={{ width: '100%' }} value={t} fontSize={TYPE.label} color={C.name} />
          </UiEntity>
        ))}

        <UiEntity uiTransform={{ width: 320, height: TAP.height, alignSelf: 'center' }}>
          <Btn label="START" width={320} primary onClick={closeWelcome} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
