import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { ATLAS, ADVANCE } from './font-metrics'
import { C } from './theme'

/**
 * Text in a typeface the platform does not have.
 *
 * Decentraland exposes three fonts and no more, in the interface and in the world alike:
 * F_SANS_SERIF, F_SERIF and F_MONOSPACE, a closed enum in the protocol with no font asset
 * and no file field. A scene cannot ship a typeface the ordinary way. It can ship a
 * texture, though, and `uiBackground` takes a `uvs` rectangle, so a string is drawn as one
 * small quad per letter, each quad showing its own cell of one atlas image.
 *
 * The cost is one element per character, so this is for the handful of strings that carry
 * the game's face, the title and the money, and not for prose. Everything else stays on
 * the platform font, which is perfectly readable at the sizes the type scale sets.
 *
 * The glyphs are baked white, so `color` tints them and one atlas serves every colour in
 * the palette.
 */

const CELL = 1 / ATLAS.cols
const ROW = 1 / ATLAS.rows
/** Extra air between letters, as a fraction of the size. The face is heavy; it needs some. */
const TRACKING = 0.02

function uvsFor(index: number): number[] {
  const col = index % ATLAS.cols
  const row = Math.floor(index / ATLAS.cols)
  const u0 = col * CELL
  const u1 = u0 + CELL
  // Image rows run down from the top while v runs up from the bottom, so the row is flipped.
  const v1 = 1 - row * ROW
  const v0 = v1 - ROW
  return [u0, v0, u0, v1, u1, v1, u1, v0]
}

export function glyphWidth(value: string, size: number): number {
  let w = 0
  for (const ch of value.toUpperCase()) {
    w += ((ADVANCE[ch] ?? 0.5) + TRACKING) * size
  }
  return w
}

export const Glyphs = (props: {
  value: string
  size: number
  color?: Color4
  align?: 'left' | 'center' | 'right'
  box?: number
  top?: number
}) => {
  const text = props.value.toUpperCase()
  const size = props.size
  const total = glyphWidth(text, size)
  const box = props.box ?? total
  const align = props.align ?? 'left'
  const start = align === 'center' ? (box - total) / 2 : align === 'right' ? box - total : 0

  let x = start
  const parts = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const idx = ATLAS.glyphs.indexOf(ch)
    const adv = (ADVANCE[ch] ?? 0.5) + TRACKING
    if (idx >= 0 && ch !== ' ') {
      parts.push(
        <UiEntity key={i}
          uiTransform={{
            width: size, height: size, positionType: 'absolute',
            position: { left: x - (size - ADVANCE[ch] * size) / 2, top: 0 }
          }}
          uiBackground={{
            color: props.color ?? C.name,
            texture: { src: 'assets/ui/font.png' },
            textureMode: 'stretch',
            uvs: uvsFor(idx)
          }} />
      )
    }
    x += adv * size
  }

  return (
    <UiEntity
      uiTransform={{
        width: box, height: size, positionType: 'absolute',
        position: { left: 0, top: props.top ?? 0 }
      }}
    >
      {parts}
    </UiEntity>
  )
}
