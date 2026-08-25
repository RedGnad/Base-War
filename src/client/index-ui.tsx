import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, TAP , SKIN } from './theme'
import { RARITIES, MUTATIONS, encoder, itemColor } from '../shared/loot-table'

export const indexView = { open: false, vus: [] as number[] }

export function basculerIndex(): void { indexView.open = !indexView.open }

const CASE = 30
const GAP = 3

export const IndexPanel = () => {
  if (!indexView.open) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  const vus = new Set(indexView.vus)
  const total = RARITIES.length * MUTATIONS.length

  return (
    <UiEntity
      uiTransform={{
        width: MUTATIONS.length * (CASE + GAP) + 130,
        height: RARITIES.length * (CASE + GAP) + 76,
        positionType: 'absolute',
        position: { top: '14%', left: '50%' },
        margin: { left: -(MUTATIONS.length * (CASE + GAP) + 130) / 2 },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.9) }}
    >
      <Label
        value={`COLLECTION  ${vus.size} / ${total}`}
        fontSize={TYPE.body}
        color={Color4.fromHexString('#ffd166ff')}
        uiTransform={{ height: 44 }} />

      {RARITIES.map((r) => (
        <UiEntity key={r.id} uiTransform={{ height: CASE + GAP, flexDirection: 'row', alignItems: 'center' }}>
          <Label
            value={r.name}
            fontSize={TYPE.caption}
            color={Color4.fromHexString(r.color + 'ff')}
            uiTransform={{ width: 184, height: CASE }} />
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
        value="rows: rarity   ·   columns: mutation"
        fontSize={TYPE.caption}
        color={Color4.fromHexString('#7d8798ff')}
        uiTransform={{ height: 34 }} />
    </UiEntity>
  )
}
