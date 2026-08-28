import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP, SKIN } from './theme'
import { Btn } from './ui-kit'
import { formatIncome } from '../shared/loot-table'
import { PRESTIGE_CASH_SHARE } from '../shared/economy'
import { SENTRY_TIERS, SENTRY_MAX_CHARGES, MAX_FLOORS, prestigeTier, prixParCharge, GEARS, prixGear, LUCK_MS } from '../shared/schemas'
import { gearView, acheterGear, acheterLuck, wield, basculerPose as basculerPosePiege, peutPoser, estPosable } from './gear'
import { view } from './setup'
import { maDefense } from './plots'
import { theftView, buyFloorFor, armSentry } from './theft'
import { openPrestige } from './prestige-ui'
import { closeMenu } from './menu'

/**
 * Where the purchases live, because a button cannot hold them.
 *
 * Floors, defence and prestige used to sit on the contextual action, alongside placing a
 * base and opening a crate. They do not belong in the same family: opening a crate is caused
 * by standing next to one, while affording a floor is a condition that stays true until the
 * money is spent. So the moment a floor became affordable the button locked onto it and
 * every other action vanished behind it, which is exactly what a player reported.
 *
 * Laid out as FAMILIES rather than as a flat list, which is the second thing this screen got
 * wrong. Five rows in one column read as five unrelated products, three of which had the same
 * sentence under them. A buyer's real question is "what kind of thing is this", and the answer
 * is one of three: it makes the building bigger, it defends it, or it resets it. Each family
 * says once what it is for, and then its rows only have to say what makes them different.
 *
 * Every detail line is measured against the column it sits in, 610 px at caption size. The
 * previous sentry line was 972.
 */

export const shopView = { open: false }

/*
  Sized to the dialog, not to taste.

  The window is capped at `BAND.dialogMaxHeight`, 620, and the old flat list reached 618 of it.
  Three family headers had to come out of that same budget, so the row shrank from 76 to 64:
  the button stays TAP.height regardless, and 34 + 26 still holds a label and a caption. What
  got cut was air, not content. 3 x 38 + 5 x 72 + the window's own padding lands at 620.
*/
const RANG = 64
const TITRE_FAMILLE = 34
/** Between rows. Eight read as one block on a phone; a row needs its own air. */
const ENTRE = 18

/** What a defence tier costs this base, mirroring the server's own formula for display. */
function prixTourelle(tier: number): number {
  const t = SENTRY_TIERS[tier]
  const parObjet = view.items === 0 ? 0 : theftView.income / view.items
  return prixParCharge(parObjet, tier) * t.charges
}

const Famille = (props: { titre: string; note: string }) => (
  <UiEntity uiTransform={{ width: '100%', height: TITRE_FAMILLE, flexDirection: 'row', alignItems: 'center', margin: { top: 10, bottom: 6 } }}>
    {/* Fixed widths, because a Label given none resolves to nothing in this layout engine. */}
    <Label value={props.titre} fontSize={TYPE.label} color={Color4.fromHexString('#ffd166ff')}
      uiTransform={{ width: 150, height: TITRE_FAMILLE }} textAlign="middle-left" textWrap="nowrap" />
    <Label value={props.note} fontSize={TYPE.caption} color={C.dim}
      uiTransform={{ width: 880, height: TITRE_FAMILLE }} textAlign="middle-left" textWrap="nowrap" />
  </UiEntity>
)

const Rang = (props: {
  key?: string
  titre: string
  detail: string
  bouton: string
  prix: number
  possible: boolean
  onClick: () => void
}) => (
  <UiEntity
    uiTransform={{
      width: '100%', height: RANG, flexDirection: 'row', alignItems: 'center',
      margin: { bottom: ENTRE }
    }}
  >
    {/*
      What is dimmed is the button, and nothing else.

      Both the name and the price used to fade when a player could not afford the row, which
      on a fresh account greys out the entire shop: every figure the same colour as every
      caption, and no way to tell a price from a sentence. A price is information you need
      precisely when you cannot pay it, because it is what you are saving towards. The state
      belongs on the control, which is the part that actually stops working.
    */}
    <UiEntity uiTransform={{ width: '58%', height: RANG, flexDirection: 'column', justifyContent: 'center' }}>
      <Label value={props.titre} fontSize={TYPE.label} color={C.name}
        uiTransform={{ width: '100%', height: 34 }} textAlign="middle-left" textWrap="nowrap" />
      <Label value={props.detail} fontSize={TYPE.caption} color={C.dim}
        uiTransform={{ width: '100%', height: 26 }} textAlign="middle-left" textWrap="nowrap" />
    </UiEntity>
    <Label value={props.prix > 0 ? formatIncome(props.prix) : ''} fontSize={TYPE.label}
      color={C.money}
      uiTransform={{ width: '18%', height: RANG }} textAlign="middle-center" textWrap="nowrap" />
    <UiEntity uiTransform={{ width: '24%', height: TAP.height, justifyContent: 'flex-end' }}>
      <Btn label={props.bouton} width={200} primary={props.possible}
        onClick={() => { if (props.possible) props.onClick() }} />
    </UiEntity>
  </UiEntity>
)

/** The gear rows in the order the ladder opens them, which is the order a player meets them. */
const ECHELLE = [...GEARS].sort((a, b) => a.prestige - b.prestige || a.id - b.id)

function mmss(s: number): string { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

/** Four family headers, the fixed rows, the gear ladder and the charm. The window scrolls past the dialog cap. */
export const HAUTEUR_SHOP = 4 * (TITRE_FAMILLE + 16) + (6 + GEARS.length) * (RANG + ENTRE)

export const ShopContent = () => {
  if (!shopView.open) return null
  const argent = theftView.coins
  const etage = theftView.floorPrice
  const palierPrestige = theftView.nextPrestige
  const prestige = prestigeTier(theftView.prestige)
  const ici = maDefense()

  return (
    <UiEntity uiTransform={{ width: '100%', height: HAUTEUR_SHOP, flexDirection: 'column' }}>

      <Famille titre="BUILD" note="more shelves, so more earns" />
      <Rang
        titre={etage > 0 ? '+1 FLOOR' : 'FLOORS MAXED'}
        detail={etage <= 0 ? `${MAX_FLOORS} floors is the cap`
          : theftView.prestige < theftView.floorNeedsPrestige ? `opens at prestige ${theftView.floorNeedsPrestige}  ·  six more slots`
          : 'six more slots, you keep everything'}
        bouton={etage > 0 && theftView.prestige < theftView.floorNeedsPrestige ? 'LOCKED' : 'BUY'} prix={etage}
        possible={etage > 0 && argent >= etage && theftView.prestige >= theftView.floorNeedsPrestige}
        onClick={() => { buyFloorFor(); closeMenu() }} />

      {/*
        The floor being armed is named ONCE, in the family line, instead of once per row.

        The purchase depends on where the player's feet are, and a button whose effect depends
        on something off-screen is the defect this project keeps finding. But saying "on FLOOR
        3" three times in three rows is what pushed each of them to nine hundred pixels. The
        family says where; the rows say what.
      */}
      <Famille
        titre="DEFEND"
        note={ici === null
          ? 'stand inside your base, on the floor to defend'
          : `floor ${ici.etage + 1} holds ${ici.charges}  ·  each charge blocks one theft there`} />
      {SENTRY_TIERS.map((t, i) => {
        const prix = prixTourelle(i)
        const plein = ici !== null && ici.charges >= SENTRY_MAX_CHARGES
        return (
          <Rang key={t.name}
            titre={t.name}
            detail={t.tithe > 0
              ? `${t.charges} charges  ·  blocks a theft, drops ${Math.round(t.tithe * 100)}% of their coins`
              : `${t.charges} charges  ·  blocks a theft, takes nothing`}
            bouton="ARM" prix={prix}
            possible={ici !== null && !plein && theftView.basePosee && argent >= prix}
            onClick={() => { armSentry(i); closeMenu() }} />
        )
      })}

      {/*
        Gear: the family prestige unlocks. Locked rows stay visible, dimmed, with the prestige
        they need on the line, which is the genre's own reveal rule: show the next rung, not
        the whole ladder. The pocket count is on the row, and the SET button hands the act to
        the E button at the player's feet rather than doing it from here.
      */}
      <Famille titre="GEAR" note="tools to steal with, or to catch thieves" />
      {ECHELLE.map((g) => {
        const prix = prixGear(g.id)
        const debloque = theftView.prestige >= g.prestige
        const held = gearView.held[g.id] ?? 0
        const posable = estPosable(g.id)
        // Worn gear is bought once and then simply held: the row says so instead of offering it again.
        const porte = !posable && held > 0
        const peutPoserCe = peutPoser(g.id)
        // The two weapons (slap id 2, taser id 5) are WIELDED from here: tap to hold, tap again for the gun.
        const armeDeG = g.id === 2 ? 'slap' as const : g.id === 5 ? 'taser' as const : null
        const estArme = armeDeG !== null && held > 0
        const tenue = estArme && gearView.armeChoisie === armeDeG
        return (
          <Rang key={g.name}
            titre={estArme ? `${g.name}  ·  ${tenue ? 'WIELDING' : 'OWNED'}` : porte ? `${g.name}  ·  WORN` : held > 0 ? `${g.name}  x${held}` : g.name}
            detail={debloque ? g.verb : `unlocks at prestige ${g.prestige}  ·  ${g.verb}`}
            bouton={estArme ? (tenue ? 'HOLD GUN' : 'WIELD') : porte ? 'OWNED' : peutPoserCe ? 'SET' : 'BUY'}
            prix={estArme || porte || peutPoserCe ? 0 : prix}
            possible={debloque && (estArme || (!porte && (posable && held > 0 ? peutPoserCe : argent >= prix)))}
            onClick={() => {
              if (estArme) { wield(tenue ? 'shoot' : (armeDeG as 'slap' | 'taser')); closeMenu() }
              else if (peutPoserCe) { basculerPosePiege(g.id); closeMenu() }
              else if (!porte) acheterGear(g.id)
            }} />
        )
      })}
      {/* Luck is the one thing here that is bought by the quarter hour, so its row shows the clock. */}
      <Rang key="luck"
        titre={theftView.luckSec > 0 ? `LUCKY CHARM  ·  ${mmss(theftView.luckSec)} LEFT` : 'LUCKY CHARM'}
        detail={`x2 odds on every mutation for ${Math.round(LUCK_MS / 60000)} min, adds to the time left`}
        bouton="BUY" prix={theftView.luckPrice}
        possible={theftView.luckPrice > 0 && argent >= theftView.luckPrice}
        onClick={() => acheterLuck()} />

      <Famille titre="PRESTIGE" note="start over, earn more for good" />
      <Rang
        titre={`PRESTIGE ${theftView.prestige + 1}`}
        detail={`x${prestige.multiplier} on everything you earn  ·  keeps your best ${prestige.guard === 1 ? 'item' : prestige.guard + ' items'}, coins reset to ${formatIncome(palierPrestige * PRESTIGE_CASH_SHARE)}`}
        bouton="OPEN" prix={palierPrestige}
        possible={palierPrestige > 0 && argent >= palierPrestige}
        onClick={() => { closeMenu(); openPrestige() }} />
    </UiEntity>
  )
}
