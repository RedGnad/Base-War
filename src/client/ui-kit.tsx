import { InputAction } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
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
  /** The danger skin: a question about something irreversible, waiting for its second press. */
  danger?: boolean
}) => {
  const size = props.size ?? TYPE.body
  return (
    <UiEntity
      uiTransform={{
        width: props.width, height: TAP.height,
        margin: props.right !== undefined ? { right: props.right } : undefined,
        pointerFilter: 'block'
      }}
      uiBackground={props.danger === true ? SKIN.danger : props.primary === true ? SKIN.primary : SKIN.secondary}
      uiInputBinding={props.bind !== undefined ? { actions: props.bind } : undefined}
      onMouseDown={props.onClick}
    >
      <Glyphs
        value={props.label} size={size} align="center" box={props.width}
        top={(TAP.height - size) / 2}
        role={props.primary === true ? 'ink' : 'name'} />
      {/*
        A pip that sits ON the corner, not inside it.

        It was drawn ten pixels in from the edge, which makes it look like part of the label
        rather than something attached to the control. The documented pattern is a corner
        OVERLAY: anchored top right, straddling the boundary, and separated from a busy parent
        by a ring of the surrounding colour so the two shapes never merge. Sitting half outside
        is what makes it read as a notification rather than as decoration.

        A dot rather than a number, because what matters here is that something is waiting and
        not how much. And it never takes a click: it annotates the button, the button acts.

        The sizes are ours, derived from the control: a fifth of a 96-tall button, which is the
        smallest disc that survives a phone's scale factor, plus a four-pixel ring.
      */}
      {props.badge === true && (
        <UiEntity
          uiTransform={{
            width: 28, height: 28, positionType: 'absolute',
            position: { top: -10, right: -10 }, borderRadius: 14,
            justifyContent: 'center', alignItems: 'center'
          }}
          uiBackground={{ color: Color4.fromHexString('#0b0e17ff') }}
        >
          <UiEntity
            uiTransform={{ width: 20, height: 20, borderRadius: 10 }}
            uiBackground={{ color: C.danger }} />
        </UiEntity>
      )}
    </UiEntity>
  )
}
