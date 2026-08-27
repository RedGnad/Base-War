import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { engine } from '@dcl/sdk/ecs'
import { TYPE, C, TAP, SKIN, lisible } from './theme'
import { Glyphs } from './glyphs'
import { Btn } from './ui-kit'
import { Plot, FUSION_NEEDS, VIDE } from '../shared/schemas'
import { RARITIES, rarityOf } from '../shared/loot-table'
import { room } from '../shared/messages'
import { monAdresseClient } from './theft'
import { fusionView } from './fusion'

/**
 * The fuser's panel: fuse straight from your shelves.
 *
 * The machine asked for three toys and a player can carry one, so feeding it meant three
 * walks across the plaza, and the tester read the machine as unclear (27 Aug). Feeding by
 * hand stays, for whoever is already carrying something; with empty hands the drum opens
 * this panel instead, which counts what you own of each rarity, shelves plus what the
 * machine already holds for you, and fuses three of them from where they stand. The result
 * still lands in your hand, so the new toy is carried home like any other.
 */
export const fusionPanelView = { open: false }
export function openFusion(): void { fusionPanelView.open = true }
export function closeFusion(): void { fusionPanelView.open = false }

const RANG = 58

/** What the player owns of each rarity: on their shelves, plus what the machine already holds for them. */
function comptes(): number[] {
  const n = new Array<number>(RARITIES.length).fill(0)
  const moi = monAdresseClient()
  for (const [, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    for (const c of p.items) if (c !== VIDE) n[rarityOf(c)] += 1
    break
  }
  for (const c of fusionView.codes) n[rarityOf(c)] += 1
  return n
}

export const FusionPanel = () => {
  if (!fusionPanelView.open) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  const n = comptes()
  const fusibles = RARITIES.slice(0, RARITIES.length - 1)
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
    >
      <UiEntity
        uiTransform={{ width: 940, height: 130 + fusibles.length * RANG + TAP.height + 40, flexDirection: 'column', alignItems: 'center', padding: 22 }}
        uiBackground={SKIN.panel}
      >
        <UiEntity uiTransform={{ width: '100%', height: 56 }}>
          <Glyphs value="FUSER" size={TYPE.title} role="bonus" />
        </UiEntity>
        <Label
          value={`${FUSION_NEEDS} toys of one rarity become one of the rarity above, mutation rolled again  ·  taken from your shelves, cheapest first`}
          fontSize={TYPE.caption} color={C.dim}
          uiTransform={{ width: '100%', height: 40 }} textAlign="middle-center" textWrap="nowrap" />
        {fusibles.map((r) => {
          const assez = n[r.id] >= FUSION_NEEDS
          const suivant = RARITIES[r.id + 1]
          return (
            <UiEntity key={r.id} uiTransform={{ width: '100%', height: RANG, flexDirection: 'row', alignItems: 'center' }}>
              <Label value={`${n[r.id]}  ${r.name}${n[r.id] === 1 ? '' : 's'}`} fontSize={TYPE.body}
                color={Color4.fromHexString(lisible(r.color) + 'ff')}
                uiTransform={{ width: 420, height: RANG }} textAlign="middle-left" textWrap="nowrap" />
              <UiEntity uiTransform={{ width: 440, height: TAP.height, justifyContent: 'flex-end' }}>
                <Btn label={assez ? `FUSE ${FUSION_NEEDS} INTO A ${suivant.name.toUpperCase()}` : `${FUSION_NEEDS} NEEDED`} width={420} primary={assez}
                  onClick={() => { if (assez) { void room.send('fuseFromBase', { rarity: r.id }); closeFusion() } }} />
              </UiEntity>
            </UiEntity>
          )
        })}
        <UiEntity uiTransform={{ width: '100%', height: TAP.height, flexDirection: 'row', justifyContent: 'center', margin: { top: 12 } }}>
          <Btn label="BACK" width={220} onClick={closeFusion} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
