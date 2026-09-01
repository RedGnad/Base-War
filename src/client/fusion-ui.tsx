import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { engine } from '@dcl/sdk/ecs'
import { TYPE, C, TAP, SKIN, lisible } from './theme'
import { Glyphs } from './glyphs'
import { Btn , SURF} from './ui-kit'
import { Plot, FUSION_NEEDS, VIDE, poidsDesMutations, LUCK_MULT } from '../shared/schemas'
import { RARITIES, MUTATIONS, rarityOf, mutationDe, itemIncome, nomDuCode } from '../shared/loot-table'
import { PRODUCTION_PER_RARITY } from '../shared/economy'
import { room } from '../shared/messages'
import { monAdresseClient, theftView } from './theft'
import { eventView } from './events'
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

const RANG = 84

/** The player's toys: what the machine already holds for them first, then the shelves. */
function miens(): { hopper: number[]; etagere: number[] } {
  const moi = monAdresseClient()
  let etagere: number[] = []
  for (const [, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    etagere = p.items.filter((c) => c !== VIDE)
    break
  }
  return { hopper: [...fusionView.codes], etagere }
}

/**
 * Exactly what the server would take for rarity `r`: the hopper's, then the shelf's cheapest.
 * Named on the row, because a fusion that eats a Lava Rare +2 among three Rares must say so
 * before the button, not after (the prestige learned this on 27 Aug).
 */
function choix(m: { hopper: number[]; etagere: number[] }, r: number): number[] {
  const dedans = m.hopper.filter((c) => rarityOf(c) === r)
  const sur = m.etagere.filter((c) => rarityOf(c) === r)
    .sort((x, y) => itemIncome(x, PRODUCTION_PER_RARITY) - itemIncome(y, PRODUCTION_PER_RARITY))
  return [...dedans, ...sur].slice(0, FUSION_NEEDS)
}

/** The chance each fed mutation passes on, from the same weights the server rolls with. */
function chances(pris: number[]): string {
  const pousses = pris.map(mutationDe).filter((m) => m > 0)
  if (pousses.length === 0) return 'no mutation fed'
  const poids = poidsDesMutations(0, eventView.theme, theftView.luckSec > 0 ? LUCK_MULT : 1, pousses)
  const total = poids.reduce((a, b) => a + b, 0)
  return [...new Set(pousses)]
    .map((m) => `${MUTATIONS[m]?.name ?? ''} ${Math.round((poids[m] / total) * 100)}%`)
    .join(', ')
}

export const FusionPanel = () => {
  if (!fusionPanelView.open) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  const m = miens()
  const fusibles = RARITIES.slice(0, RARITIES.length - 1)
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: SURF.voile }}
    >
      <UiEntity
        uiTransform={{ width: 940, height: 150 + fusibles.length * RANG + TAP.height + 40 + (m.hopper.length > 0 ? TAP.height + 8 : 0), flexDirection: 'column', alignItems: 'center', padding: 22 }}
        uiBackground={SKIN.panel}
      >
        <UiEntity uiTransform={{ width: '100%', height: 56 }}>
          <Glyphs value="FUSER" size={TYPE.title} role="bonus" />
        </UiEntity>
        <Label
          value={`${FUSION_NEEDS} toys of one rarity become one better, the cheapest of them first`}
          fontSize={TYPE.caption} color={C.dim}
          uiTransform={{ width: '100%', height: 30 }} textAlign="middle-center" textWrap="nowrap" />
        <Label
          value="a mutated toy fed is a chance its mutation passes on  ·  traits are lost"
          fontSize={TYPE.caption} color={C.dim}
          uiTransform={{ width: '100%', height: 30 }} textAlign="middle-center" textWrap="nowrap" />
        {/* What the machine already holds for this player, and the way back out of it. */}
        {m.hopper.length > 0 && (
          <UiEntity uiTransform={{ width: '100%', height: TAP.height + 8, flexDirection: 'row', alignItems: 'center' }}>
            <Label value={`in the fuser for you: ${m.hopper.map(nomDuCode).join(', ')}`} fontSize={TYPE.caption}
              color={Color4.fromHexString('#ffd166ff')} uiTransform={{ width: 600, height: TAP.height }} textAlign="middle-left" textWrap="nowrap" />
            <UiEntity uiTransform={{ width: 280, height: TAP.menu, justifyContent: 'flex-end' }}>
              <Btn label="TAKE BACK" width={260} height={TAP.menu} onClick={() => { void room.send('takeBackFusion', {}); closeFusion() }} />
            </UiEntity>
          </UiEntity>
        )}
        {fusibles.map((r) => {
          const total = m.hopper.filter((c) => rarityOf(c) === r.id).length + m.etagere.filter((c) => rarityOf(c) === r.id).length
          const assez = total >= FUSION_NEEDS
          const suivant = RARITIES[r.id + 1]
          const pris = choix(m, r.id)
          return (
            <UiEntity key={r.id} uiTransform={{ width: '100%', height: RANG, flexDirection: 'row', alignItems: 'center' }}>
              <UiEntity uiTransform={{ width: 440, height: RANG, flexDirection: 'column', justifyContent: 'center' }}>
                <Label value={`${total}  ${r.name}${total === 1 ? '' : 's'}`} fontSize={TYPE.body}
                  color={Color4.fromHexString(lisible(r.color) + 'ff')}
                  uiTransform={{ width: '100%', height: 40 }} textAlign="middle-left" textWrap="nowrap" />
                <Label value={pris.length > 0 ? `takes: ${pris.map(nomDuCode).join(', ')}  ·  ${chances(pris)}` : 'none on your shelves'} fontSize={TYPE.caption}
                  color={C.dim} uiTransform={{ width: '100%', height: 30 }} textAlign="middle-left" textWrap="nowrap" />
              </UiEntity>
              <UiEntity uiTransform={{ width: 440, height: TAP.menu, justifyContent: 'flex-end' }}>
                <Btn label={assez ? `FUSE ${FUSION_NEEDS} INTO A ${suivant.name.toUpperCase()}` : `${FUSION_NEEDS} NEEDED`} width={420} height={TAP.menu} primary={assez}
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
