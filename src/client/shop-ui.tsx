import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP, SKIN } from './theme'
import { Btn } from './ui-kit'
import { formatIncome } from '../shared/loot-table'
import { SENTRY_TIERS, SENTRY_MIN_PRICE, SENTRY_MAX_CHARGES, MAX_FLOORS, prestigeTier, prixParCharge } from '../shared/schemas'
import { view } from './setup'
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
 * A shop is not new surface here. It is the room these three were always missing.
 */

export const shopView = { open: false }

const RANG = 76

/** What a defence tier costs this base, mirroring the server's own formula for display. */
function prixTourelle(tier: number): number {
  const t = SENTRY_TIERS[tier]
  const parObjet = view.items === 0 ? 0 : theftView.income / view.items
  return prixParCharge(parObjet, tier) * t.charges
}

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
      margin: { bottom: 8 }
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
        uiTransform={{ width: '100%', height: 28 }} textAlign="middle-left" textWrap="nowrap" />
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

export const HAUTEUR_SHOP = 52 + 5 * (RANG + 8)

export const ShopContent = () => {
  if (!shopView.open) return null
  const argent = theftView.coins
  const etage = theftView.floorPrice
  const palier = theftView.nextPrestige

  return (
    <UiEntity uiTransform={{ width: '100%', height: HAUTEUR_SHOP, flexDirection: 'column' }}>
      <Label value="UPGRADES" fontSize={TYPE.body} color={Color4.fromHexString('#ffd166ff')}
        uiTransform={{ width: '100%', height: 52 }} textAlign="middle-left" />

      <Rang
        titre={etage > 0 ? '+1 FLOOR' : 'FLOORS MAXED'}
        detail={etage > 0 ? 'six more slots, you keep everything' : `${MAX_FLOORS} floors is the cap`}
        bouton="BUY" prix={etage}
        possible={etage > 0 && argent >= etage}
        onClick={() => { buyFloorFor(); closeMenu() }} />

      {SENTRY_TIERS.map((t, i) => {
        const prix = prixTourelle(i)
        const plein = theftView.sentries >= SENTRY_MAX_CHARGES
        return (
          <Rang key={t.name}
            titre={t.name}
            /*
              What each tier actually DOES, now that they differ.

              All three read `N charges, each one blocks a theft`, which was true of all of
              them and therefore said nothing: the choice was arithmetic, buy whichever is
              cheapest per charge. The tithe is the difference, so the tithe is what the line
              names, and GUARD's absence of one is stated rather than left blank.
            */
            detail={t.tithe > 0
              ? `${t.charges} charges  ·  blocks a theft and drops ${Math.round(t.tithe * 100)}% of their coins  ·  you hold ${theftView.sentries}`
              : `${t.charges} charges  ·  blocks a theft, takes nothing  ·  you hold ${theftView.sentries}`}
            bouton="ARM" prix={prix}
            possible={!plein && theftView.basePosee && argent >= prix}
            onClick={() => { armSentry(i); closeMenu() }} />
        )
      })}

      <Rang
        titre={`PRESTIGE x${theftView.multiplier + 1}`}
        detail={`x${prestigeTier(theftView.prestige).multiplier} on everything you earn, and you keep your best ${prestigeTier(theftView.prestige).guard === 1 ? 'item' : prestigeTier(theftView.prestige).guard + ' items'}`}
        bouton="OPEN" prix={palier}
        possible={palier > 0 && argent >= palier}
        onClick={() => { closeMenu(); openPrestige() }} />
    </UiEntity>
  )
}
