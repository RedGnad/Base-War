import { InputAction } from '@dcl/sdk/ecs'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP, SKIN } from './theme'
import { Glyphs } from './glyphs'

/**
 * Two families, split by role.
 *
 * The display face carries anything short that has to be recognised rather than read:
 * titles, the money, and every control label. Sentences stay on the platform's own sans,
 * because a heavy display face set as body copy is the standard way to make an interface
 * look loud and read badly, and the two are meant to complement each other rather than
 * compete. It is also where the two costs happen to agree: the atlas spends one element
 * per character, which is nothing across a dozen short labels and absurd across a
 * paragraph.
 *
 * A control is therefore built here rather than with the platform Button, which can only
 * hold a string of its own.
 */
export const Btn = (props: {
  key?: string
  label: string
  width: number
  primary?: boolean
  size?: number
  right?: number
  onClick?: () => void
  bind?: InputAction[]
  /** A red pip in the corner: something behind this control is waiting to be collected. */
  badge?: boolean
}) => {
  const size = props.size ?? TYPE.body
  return (
    <UiEntity
      uiTransform={{
        width: props.width, height: TAP.height,
        margin: props.right !== undefined ? { right: props.right } : undefined,
        pointerFilter: 'block'
      }}
      uiBackground={props.primary === true ? SKIN.primary : SKIN.secondary}
      uiInputBinding={props.bind !== undefined ? { actions: props.bind } : undefined}
      onMouseDown={props.onClick}
    >
      <Glyphs
        value={props.label} size={size} align="center" box={props.width}
        top={(TAP.height - size) / 2}
        role={props.primary === true ? 'ink' : 'name'} />
      {/*
        The oldest signal there is, and the reason it works is that it needs no reading:
        a player who has never seen this interface knows a red pip means go and look.
      */}
      {props.badge === true && (
        <UiEntity
          uiTransform={{
            width: 18, height: 18, positionType: 'absolute',
            position: { top: 10, right: 10 }, borderRadius: 9
          }}
          uiBackground={{ color: C.danger }} />
      )}
    </UiEntity>
  )
}
