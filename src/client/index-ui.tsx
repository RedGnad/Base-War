import { Color4 } from '@dcl/sdk/math'
import { strip } from './layout'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, TAP , SKIN, lisible } from './theme'
import { RARITIES, MUTATIONS, encoder, itemColor, progresDuSkin, skinDebloque, SKIN_NEEDS } from '../shared/loot-table'
import { room } from '../shared/messages'
import { Btn } from './ui-kit'

export const indexView = { open: false, vus: [] as number[], skin: 0 }

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
/** The skin row under the grid: the buttons for the columns that are full, the count for the nearest ones. */
const SKINS_H = TAP.height + 16
export const HAUTEUR_INDEX = TITRE_H + RARITIES.length * (CASE + GAP) + PIED_H + SKINS_H

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
            color={Color4.fromHexString(lisible(r.color) + 'ff')}
            uiTransform={{ width: LABEL_W, height: CASE }} />
          {MUTATIONS.map((m) => {
            const trouve = vus.has(encoder(r.id, m.id))
            return (
              <UiEntity
                key={m.id}
                uiTransform={{ width: CASE, height: CASE, margin: { right: GAP } }}
                uiBackground={{
                  color: trouve
                    ? Color4.fromHexString(lisible(itemColor(r.id, m.id)) + 'ff')
                    : Color4.create(1, 1, 1, 0.06)
                }} />
            )
          })}
        </UiEntity>
      ))}

      <Label
        uiTransform={{ width: '100%', height: PIED_H }}
        value={`rows: rarity   ·   columns: mutation   ·   ${SKIN_NEEDS} of ${RARITIES.length} in a column unlocks that base skin`}
        fontSize={TYPE.caption}
        color={Color4.fromHexString('#7d8798ff')} />
      <UiEntity uiTransform={{ width: '100%', height: SKINS_H, flexDirection: 'row', alignItems: 'center' }}>
        {MUTATIONS.filter((m) => m.id > 0 && skinDebloque(indexView.vus, m.id)).map((m) => (
          <Btn key={`s${m.id}`}
            label={indexView.skin === m.id ? `${m.name.toUpperCase()} SKIN  ·  ON` : `${m.name.toUpperCase()} SKIN`}
            width={250} primary={indexView.skin === m.id} right={TAP.gap}
            onClick={() => { void room.send('setSkin', { mutation: indexView.skin === m.id ? 0 : m.id }) }} />
        ))}
        {[...MUTATIONS]
          .filter((m) => m.id > 0 && !skinDebloque(indexView.vus, m.id))
          .sort((a, b) => progresDuSkin(indexView.vus, b.id) - progresDuSkin(indexView.vus, a.id))
          .slice(0, 3)
          .map((m) => (
            <Label key={`p${m.id}`}
              value={`${m.name} skin  ${progresDuSkin(indexView.vus, m.id)}/${RARITIES.length}`}
              fontSize={TYPE.caption} color={Color4.fromHexString(lisible(m.color) + 'ff')}
              uiTransform={{ width: 210, height: TAP.height }} textAlign="middle-left" textWrap="nowrap" />
          ))}
      </UiEntity>
    </UiEntity>
  )
}
