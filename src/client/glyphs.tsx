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

/**
 * Half a texel of margin, taken off every side of the cell.
 *
 * A cell's edge is also its neighbour's edge, and sampling exactly on that line lets the
 * filter mix in the glyph next door: the bottoms of the row above appeared as fragments
 * floating over the title. Pulling the rectangle inside its own cell removes the seam.
 * The atlas is 1024 pixels across eight cells, so a texel is one part in 1024.
 */
const BLEED = 1.5 / 1024

function uvsFor(index: number): number[] {
  const col = index % ATLAS.cols
  const row = Math.floor(index / ATLAS.cols)
  const u0 = col * CELL + BLEED
  const u1 = col * CELL + CELL - BLEED
  // Image rows run down from the top while v runs up from the bottom, so the row is flipped.
  const v1 = 1 - row * ROW - BLEED
  const v0 = 1 - (row + 1) * ROW + BLEED
  return [u0, v0, u0, v1, u1, v1, u1, v0]
}

export function glyphWidth(value: string, size: number): number {
  let w = 0
  for (const ch of value.toUpperCase()) {
    w += ((ADVANCE[ch] ?? 0.5) + TRACKING) * size
  }
  return w
}

/**
 * A dark copy behind the letters, so a number can live without a plate under it.
 *
 * The counter used to sit on an opaque panel, which is a lot of a phone screen spent on
 * making six characters readable. Taking the panel away puts them straight over the game,
 * where the background is a bright sky as often as a dark floor, and a single colour cannot
 * survive both. An offset dark copy does what an outline would if the interface had one: it
 * costs one more element per character and no screen at all.
 */
const OMBRE = Color4.create(0, 0, 0, 0.55)
const DECALAGE = 3

export const Glyphs = (props: {
  value: string
  size: number
  color?: Color4
  align?: 'left' | 'center' | 'right'
  box?: number
  top?: number
  shadow?: boolean
}) => {
  const text = props.value.toUpperCase()
  const size = props.size
  const total = glyphWidth(text, size)
  const box = props.box ?? total
  const align = props.align ?? 'left'
  const start = align === 'center' ? (box - total) / 2 : align === 'right' ? box - total : 0

  const couche = (teinte: Color4, dx: number, dy: number, cle: string) => {
    let x = start
    const out = []
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const idx = ATLAS.glyphs.indexOf(ch)
      const adv = (ADVANCE[ch] ?? 0.5) + TRACKING
      if (idx >= 0 && ch !== ' ') {
        out.push(
          <UiEntity key={`${cle}${i}`}
            uiTransform={{
              width: size, height: size, positionType: 'absolute',
              position: { left: x - (size - ADVANCE[ch] * size) / 2 + dx, top: dy }
            }}
            uiBackground={{
              color: teinte,
              texture: { src: 'assets/ui/font.png' },
              textureMode: 'stretch',
              uvs: uvsFor(idx)
            }} />
        )
      }
      x += adv * size
    }
    return out
  }

  const parts = props.shadow === true
    ? [...couche(OMBRE, DECALAGE, DECALAGE, 's'), ...couche(props.color ?? C.name, 0, 0, 'g')]
    : couche(props.color ?? C.name, 0, 0, 'g')

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
