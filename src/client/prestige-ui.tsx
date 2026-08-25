import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP, SKIN } from './theme'
import { Glyphs } from './glyphs'
import { Btn } from './ui-kit'
import { theftView, doPrestige } from './theft'
import { formatIncome, RARITIES } from '../shared/loot-table'

export const prestigeView = { open: false }
export function openPrestige(): void { prestigeView.open = true }
export function closePrestige(): void { prestigeView.open = false }

/**
 * The one screen that asks before it acts.
 *
 * Prestige wipes coins and every item on the base, and until now it was a button in the
 * bar that did it on the first tap, with no statement of the cost and no way back. That is
 * the single most destructive thing a player can press.
 *
 * The shape is the one the reference games use for a decision: what it unlocks, then what
 * it costs, then the line that says what it takes away, then exactly one control that
 * commits. A player who reads only the amber line still knows the important part.
 */
/** A card at module scope: a component declared inside a render is never mounted. */
const Unlock = (props: { title: string; note: string }) => (
  <UiEntity
    uiTransform={{
      width: 260, height: 150, margin: { right: TAP.gap },
      flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 16
    }}
    uiBackground={SKIN.card}
  >
    <Label value={props.title} fontSize={TYPE.title} color={C.money}
      uiTransform={{ width: '100%', height: 62 }} textAlign="middle-center" />
    <Label value={props.note} fontSize={TYPE.caption} color={C.dim}
      uiTransform={{ width: '100%', height: 40 }} textAlign="middle-center" />
  </UiEntity>
)

export const PrestigePanel = () => {
  if (!prestigeView.open) return <UiEntity uiTransform={{ width: 0, height: 0 }} />

  const cost = theftView.nextPrestige
  const affordable = cost > 0 && theftView.coins >= cost
  const nextMultiplier = theftView.multiplier + 1
  const nextFloor = RARITIES[Math.min(theftView.minRarity + 1, RARITIES.length - 1)]

  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
    >
      <UiEntity
        uiTransform={{ width: 940, height: 600, flexDirection: 'column', alignItems: 'center', padding: 22 }}
        uiBackground={SKIN.panel}
      >
        <UiEntity uiTransform={{ width: '100%', height: 56 }}>
          <Glyphs value="PRESTIGE" size={TYPE.title} role="bonus" />
        </UiEntity>

        <Label value="UNLOCKS" fontSize={TYPE.label} color={C.name}
          uiTransform={{ width: '100%', height: 34 }} textAlign="middle-center" />

        <UiEntity uiTransform={{ width: 540, height: 150, flexDirection: 'row', justifyContent: 'center' }}>
          <Unlock title={`x${nextMultiplier}`} note="on everything you earn" />
          <Unlock title={nextFloor?.name ?? ''} note="the worst you can roll" />
        </UiEntity>

        <Label value="COSTS" fontSize={TYPE.label} color={C.name}
          uiTransform={{ width: '100%', height: 40 }} textAlign="middle-center" />

        <UiEntity
          uiTransform={{ width: 540, height: 78, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={SKIN.inset}
        >
          <Glyphs value={formatIncome(cost)} size={TYPE.title} align="center" box={560}
            top={(78 - TYPE.title) / 2} role={affordable ? 'money' : 'danger'} />
        </UiEntity>

        <Label value="this resets your coins and everything on your base"
          fontSize={TYPE.label} color={C.bonus}
          uiTransform={{ width: '100%', height: 50 }} textAlign="middle-center" />

        <UiEntity uiTransform={{ width: 640, height: TAP.height, flexDirection: 'row', justifyContent: 'center' }}>
          <Btn label={affordable ? 'PRESTIGE' : 'NOT YET'} width={300} primary={affordable}
            right={TAP.gap} onClick={() => { if (affordable) { doPrestige(); closePrestige() } }} />
          <Btn label="BACK" width={220} onClick={closePrestige} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
