import { Color4 } from '@dcl/sdk/math'
import { strip } from './layout'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, TAP , SKIN } from './theme'
import { RARITIES, MUTATIONS, encoder, itemColor } from '../shared/loot-table'

export const indexView = { open: false, vus: [] as number[] }

export function basculerIndex(): void { indexView.open = !indexView.open }

const CASE = 30
const GAP = 3
/*
  The box is the sum of what goes in it, not a guess with a round number added.

  It was `MUTATIONS.length * (CASE + GAP) + 130` wide, where the 130 was meant to cover the
  rarity label at the start of each row. That label is 184, and the padding another 24, so
  every row ran seventy-eight pixels past its own container. The height was short by
  twenty-six for the same reason. Both are now added up from the pieces, so a new rarity or
  a new mutation resizes the panel instead of overflowing it.
*/
const LABEL_W = 184
const PAD = 12
const TITRE_H = 44
const PIED_H = 34
const PANEL_W = PAD * 2 + LABEL_W + MUTATIONS.length * (CASE + GAP)
const PANEL_H = PAD * 2 + TITRE_H + RARITIES.length * (CASE + GAP) + PIED_H

/** The grid plus its two labels, which is what the window is asked to make room for. */
export const HAUTEUR_INDEX = TITRE_H + RARITIES.length * (CASE + GAP) + PIED_H

export const IndexContent = () => {
  if (!indexView.open) return null
  const vus = new Set(indexView.vus)
  const total = RARITIES.length * MUTATIONS.length

  return (
    <UiEntity uiTransform={{ width: '100%', height: HAUTEUR_INDEX, flexDirection: 'column' }}>
      <Label
        uiTransform={{ width: '100%', height: TITRE_H }}
        value={`COLLECTION  ${vus.size} / ${total}`}
        fontSize={TYPE.body}
        color={Color4.fromHexString('#ffd166ff')} />

      {RARITIES.map((r) => (
        <UiEntity key={r.id} uiTransform={{ height: CASE + GAP, flexDirection: 'row', alignItems: 'center' }}>
          <Label
            value={r.name}
            fontSize={TYPE.caption}
            color={Color4.fromHexString(r.color + 'ff')}
            uiTransform={{ width: LABEL_W, height: CASE }} />
          {MUTATIONS.map((m) => {
            const trouve = vus.has(encoder(r.id, m.id))
            return (
              <UiEntity
                key={m.id}
                uiTransform={{ width: CASE, height: CASE, margin: { right: GAP } }}
                uiBackground={{
                  color: trouve
                    ? Color4.fromHexString(itemColor(r.id, m.id) + 'ff')
                    : Color4.create(1, 1, 1, 0.06)
                }} />
            )
          })}
        </UiEntity>
      ))}

      <Label
        uiTransform={{ width: '100%', height: PIED_H }}
        value="rows: rarity   ·   columns: mutation"
        fontSize={TYPE.caption}
        color={Color4.fromHexString('#7d8798ff')} />
    </UiEntity>
  )
}
