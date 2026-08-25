import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C } from './theme'
import { strip } from './layout'
import { Btn } from './ui-kit'
import { travelView, rentrer, goToBelt } from './travel'
import { theftView } from './theft'
import { slotView, basculerPose } from './slots'
import { closeMenu } from './menu'

/**
 * Getting around, as a panel rather than a row of buttons under the thumb.
 *
 * These four controls used to live in a strip across the bottom of the screen, expanding
 * as they were needed: TRAVEL, then GO HOME, TO BELT and MOVE beside it. Laid end to end
 * they came to roughly eight hundred and sixty pixels inside a container of seven hundred
 * and sixty, so the last of them hung off its own frame. The deeper problem is that they
 * were on screen during play at all: a player travels a handful of times in a session and
 * shoots continuously, and the two were competing for the same corner.
 *
 * So travel moved behind the menu, where a rare action belongs, and the room it freed at
 * the bottom went back to the game. Each entry is a full-width row with its own line of
 * explanation, which is what the space allows once four controls stop fighting for it.
 */

const LARGEUR = 720
const RANG = 96

const Rang = (props: { label: string; note: string; primary?: boolean; onClick: () => void }) => (
  <UiEntity uiTransform={{ width: '100%', height: RANG + 26, flexDirection: 'column', margin: { bottom: 10 } }}>
    <Btn label={props.label} width={LARGEUR} primary={props.primary} onClick={props.onClick} />
    <Label value={props.note} fontSize={TYPE.caption} color={C.dim}
      uiTransform={{ width: '100%', height: 26 }} textAlign="middle-center" />
  </UiEntity>
)

export const TravelContent = () => {
  if (!travelView.open) return null
  return (
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column' }}>
      <Label value="WHERE TO" fontSize={TYPE.body} color={Color4.fromHexString('#4dd2ffff')}
        uiTransform={{ width: '100%', height: 52 }} textAlign="middle-left" />

      <Rang label="GO HOME" note="back to your own base" primary={travelView.peutRentrer}
        onClick={() => { rentrer(); closeMenu() }} />
      <Rang label="TO BELT" note="where the crates come past"
        onClick={() => { goToBelt(); closeMenu() }} />
      {theftView.basePosee && (
        <Rang label={slotView.active ? 'CANCEL MOVE' : 'MOVE MY BASE'}
          note="pick a new plot for your base" primary={slotView.active}
          onClick={() => { basculerPose(); closeMenu() }} />
      )}
    </UiEntity>
  )
}

