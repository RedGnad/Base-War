import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP , SKIN} from './theme'
import { Glyphs } from './glyphs'
import { Btn } from './ui-kit'
import { strip } from './layout'

import { STRESS_BASES } from './stress'

/*
  Shown once, to a player whose tutorial is not finished, and to nobody else. It used to open
  at every launch for everyone; the sponsor's own line on mobile onboarding is "forcing
  everyone to onboarding creates frustration" (Friendzone workshop 3, Mobile UX, 19 Aug), and
  a returning player already gets WELCOME BACK. Decided on the first profile the server sends.
  Never on a measurement build: an instrument should not have to get past a door.
*/
export const welcomeView = { open: false, decided: false }
export function closeWelcome(): void { welcomeView.open = false }
export function decideWelcome(tutoEtape: number, tutoTotal: number): void {
  if (welcomeView.decided) return
  welcomeView.decided = true
  welcomeView.open = STRESS_BASES <= 0 && tutoEtape < tutoTotal
}

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
      uiBackground={SKIN.panel}
      onMouseDown={closeWelcome}
    >
      <UiEntity
        uiTransform={{
          width: strip(900).width, height: 380,
          flexDirection: 'column', padding: 24, justifyContent: 'space-between'
        }}
      >
        {/*
          A title card, not a lecture.

          This held five numbered lines teaching the loop, and the organisers' own recap
          (Show & Tell, 28 Aug) names that pattern the thing to replace: visual guidance
          instead of text-heavy tutorials. The teaching moved into the world, where each
          lesson now fires at the moment it applies: the step chip says why, the gold beacon
          says where, the central button says what to press, and the red dot pays the first
          visit to the menu. What the world cannot say is the only thing left here: the name
          of the game and the shape of the goal, one line, read in the time a splash screen
          takes. It shows every session and costs one tap, which is what the genre's own
          splashes cost.
        */}
        <UiEntity uiTransform={{ width: '100%', height: 60, justifyContent: 'center' }}>
          <Glyphs value="BASE WAR" size={TYPE.hero} role="money" align="center" box={strip(900).width - 48} />
        </UiEntity>
        <Label
          uiTransform={{ width: '100%', height: 44 }}
          value="EARN. STEAL. DEFEND. Top the records board."
          fontSize={TYPE.body} color={C.bonus} textAlign="middle-center" />
        <Label
          uiTransform={{ width: '100%', height: 36 }}
          value="Your loot earns while it is on show, and while it is on show anyone can take it."
          fontSize={TYPE.caption} color={C.dim} textAlign="middle-center" />
        <UiEntity uiTransform={{ width: 340, height: TAP.height, alignSelf: 'center' }}>
          <Btn label="START" width={340} primary onClick={closeWelcome} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
