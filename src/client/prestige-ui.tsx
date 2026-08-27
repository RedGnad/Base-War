import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP, SKIN } from './theme'
import { Glyphs } from './glyphs'
import { Btn } from './ui-kit'
import { theftView, doPrestige } from './theft'
import { formatIncome, RARITIES } from '../shared/loot-table'
import { prestigeTier, REBIRTH_MAX } from '../shared/schemas'

export const prestigeView = { open: false }
export function openPrestige(): void { prestigeView.open = true }
export function closePrestige(): void { prestigeView.open = false }

/**
 * The one screen that asks before it acts, rewritten because it was describing another game.
 *
 * Three statements were wrong and all three pushed the same way, against ever pressing it.
 *
 * It promised a rarity floor. `Rare, the worst you can roll` sat under a heading that read
 * UNLOCKS, and nothing in this game floors a roll: `rollCrate` takes a crate id, reads that
 * tier's weights and rolls, with no input from prestige anywhere. Worse, the number printed
 * means the opposite of what the card claimed. `minRarity` is the ENTRY REQUIREMENT, the
 * rarity you must already own to be allowed to prestige at all. A cost was sold as a reward.
 *
 * It said the coins were reset. `tenterRebirth` does `p.coins -= exige.cost`: it charges a
 * price and leaves the change. Somebody holding ten million read that as losing ten million,
 * when the loss is two and a half.
 *
 * It said everything on the base goes. The best `guard` items are kept, one at first and two
 * from the third tier on, and floors, sentries and crates are never touched.
 *
 * The shape stays, because the shape was right: what you get, what it costs, what it takes
 * away, one control that commits. Only the content is now what the server actually does.
 */
/** A card at module scope: a component declared inside a render is never mounted. */
const Carte = (props: { titre: string; note: string; large: number; teinte?: Color4 }) => (
  <UiEntity
    uiTransform={{
      width: props.large, height: 124, margin: { right: TAP.gap },
      flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 10
    }}
    uiBackground={SKIN.card}
  >
    <Label value={props.titre} fontSize={TYPE.title} color={props.teinte ?? C.money}
      uiTransform={{ width: '100%', height: 60 }} textAlign="middle-center" />
    <Label value={props.note} fontSize={TYPE.caption} color={C.dim}
      uiTransform={{ width: '100%', height: 44 }} textAlign="middle-center" />
  </UiEntity>
)

const Section = (props: { titre: string }) => (
  <Label value={props.titre} fontSize={TYPE.label} color={C.name}
    uiTransform={{ width: '100%', height: 30 }} textAlign="middle-center" />
)

export const PrestigePanel = () => {
  if (!prestigeView.open) return <UiEntity uiTransform={{ width: 0, height: 0 }} />

  /*
    Every figure below comes from `prestigeTier`, the same function the server calls to decide.
    Four numbers arriving from four places is how a screen ends up disagreeing with the rule
    it is describing, which is exactly what happened here.
  */
  const palier = prestigeTier(theftView.prestige)
  const max = theftView.prestige >= REBIRTH_MAX
  const cout = theftView.nextPrestige
  const exige = RARITIES[palier.minRarity]

  const assezDeCoins = cout > 0 && theftView.coins >= cout
  const aLObjet = theftView.bestRarity >= palier.minRarity
  const pret = !max && assezDeCoins && aLObjet

  /*
    The button names what is missing, because a control that offers what the server will refuse
    is a defect this project has already written down once. The item requirement is tested here
    for the first time: until now only the coins were, so a rich player with nothing on their
    shelves was invited to press, and then told no.
  */
  const manque = max ? 'MAX PRESTIGE'
    : !assezDeCoins ? 'NEED MORE COINS'
    : `NEED ${(exige?.name ?? '').toUpperCase()}`

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

        <Section titre="YOU GET" />
        <UiEntity uiTransform={{ width: 440, height: 124, flexDirection: 'row', justifyContent: 'center' }}>
          <Carte large={420} titre={`x${palier.multiplier}`} note="on everything you earn, for good" />
        </UiEntity>

        <Section titre="IT COSTS" />
        <UiEntity uiTransform={{ width: 640, height: 124, flexDirection: 'row', justifyContent: 'center' }}>
          <Carte large={300} titre={formatIncome(cout)} note="coins, taken off your balance"
            teinte={assezDeCoins ? C.money : C.danger} />
          <Carte large={300} titre={(exige?.name ?? '').toUpperCase()} note="one is consumed: your cheapest of it, or better"
            teinte={aLObjet ? C.money : C.danger} />
        </UiEntity>

        {/*
          The amber line is the only part a hurried player reads, so it is the line that has to
          be exactly true. It used to name a loss twice the size of the real one.
        */}
        <UiEntity uiTransform={{ width: '100%', height: 66, flexDirection: 'column' }}>
          <Label
            value={palier.guard === 1
              ? `the ${(exige?.name ?? '').toUpperCase()} is eaten, you keep your best item, every other item is gone`
              : `the ${(exige?.name ?? '').toUpperCase()} is eaten, you keep your best ${palier.guard} items, every other item is gone`}
            fontSize={TYPE.label} color={C.bonus}
            uiTransform={{ width: '100%', height: 33 }} textAlign="middle-center" />
          <Label value="your floors, sentries and crates all stay"
            fontSize={TYPE.label} color={C.dim}
            uiTransform={{ width: '100%', height: 33 }} textAlign="middle-center" />
        </UiEntity>

        <UiEntity uiTransform={{ width: 640, height: TAP.height, flexDirection: 'row', justifyContent: 'center' }}>
          <Btn label={pret ? 'PRESTIGE' : manque} width={340} primary={pret}
            right={TAP.gap} onClick={() => { if (pret) { doPrestige(); closePrestige() } }} />
          <Btn label="BACK" width={220} onClick={closePrestige} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
