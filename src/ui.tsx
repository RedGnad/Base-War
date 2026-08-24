import { PRODUCTION_PER_RARITY } from './shared/economy'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { InputAction } from '@dcl/sdk/ecs'
import { TYPE, C, HUE, TAP } from './client/theme'
import { view } from './client/setup'
import { theftView, lockBase, recover, doPrestige, buyFloorFor, collectPending, armSentry, cancelSteal } from './client/theft'
import { beltView } from './client/belt'
import { boxView, openBestCrate, peutOuvrirIci } from './client/box'
import { placementView } from './client/plots'
import { IndexPanel, indexView } from './client/index-ui'
import { QuestsPanel, questsToClaim } from './client/quests-ui'
import { menuView, activeTab, basculerMenu, chooseTab } from './client/menu'
import { tutoView, ETAPES_TEXTE } from './client/tutorial'
import { travelView, rentrer, goToBelt, basculerVoyage } from './client/travel'
import { WelcomePanel, welcomeView } from './client/welcome'
import { sell } from './client/theft'
import { RARITIES, itemName, itemColor, mutation, formatIncome } from './shared/loot-table'

const INCOME_UI = PRODUCTION_PER_RARITY

const ETATS: Record<string, (r: number) => string> = {
  expose: (r) => `+${INCOME_UI[r] ?? 1} coins/s  ·  placed on your base`,
  'en-stock': () => 'kept in stock  ·  BUILD YOUR BASE to earn from it',
  plein: () => 'your base is full  ·  make room'
}
import { slotView, basculerPose, placeHere } from './client/slots'
import { combatView } from './client/combat'

export function setupUi() {
  function choose(): void {
    if (getPlatform() === null) return
    engine.removeSystem(choose)
    const inset = isMobile() ? 'interactable' : 'device'
    ReactEcsRenderer.setUiRenderer(uiComponent, {
      virtualWidth: 1920, virtualHeight: 1080, screenInset: inset
    })
    console.log(`[CLIENT] interface en screenInset '${inset}'`)
  }
  ReactEcsRenderer.setUiRenderer(uiComponent, { virtualWidth: 1920, virtualHeight: 1080 })
  engine.addSystem(choose)
}

const PANNEAU = C.plate
const BTN_H = TAP.height
const BTN_GAP = TAP.gap

/**
 * Announcement backdrop, tinted by the crate. A fixed dark brown made every tier look the
 * same; a wash of the crate's own colour lets the eye read the tier before the words.
 */
function announceBackdrop(): Color4 {
  const c = Color4.fromHexString(beltView.annonceColor + 'ff')
  return Color4.create(c.r * 0.22, c.g * 0.22, c.b * 0.22, 0.9)
}

/**
 * The one thing worth tapping right now, or nothing at all.
 *
 * It used to hand back a label with a `ready` flag, so a state the player cannot act on
 * still arrived as a button: "OPEN AT YOUR BASE", "WAIT 10s". A control that does nothing
 * when pressed is worse than an absent one, and the reference games put those states in
 * the world or in a line of text instead. What cannot be tapped now goes to `hint`.
 */
function nextAction(): { label: string; action: () => void } | null {
  if (slotView.active) return slotView.valid ? { label: 'PLACE HERE', action: placeHere } : null
  if (theftView.canRecover) return { label: 'RECOVER', action: recover }
  if (!theftView.basePosee) return { label: 'BUILD BASE', action: basculerPose }
  if (boxView.stock.length > 0 && peutOuvrirIci()) {
    return { label: `OPEN ${boxView.stock.length}`, action: openBestCrate }
  }
  if (theftView.basePosee && view.items > 0 && theftView.sentries === 0
      && theftView.sentryPrice > 0 && theftView.coins >= theftView.sentryPrice) {
    return { label: `SENTRY ${formatIncome(theftView.sentryPrice)}`, action: armSentry }
  }
  if (theftView.floorPrice > 0 && theftView.coins >= theftView.floorPrice) {
    return { label: '+1 FLOOR', action: buyFloorFor }
  }
  if (theftView.nextPrestige > 0 && theftView.coins >= theftView.nextPrestige) {
    return { label: `PRESTIGE x${theftView.multiplier + 1}`, action: doPrestige }
  }
  return null
}

/** What the player is waiting on, in one line, never as a control. */
function hint(): string {
  if (slotView.active && !slotView.valid) return slotView.reason
  if (boxView.stock.length > 0 && !peutOuvrirIci()) {
    return `${boxView.stock.length} crate${boxView.stock.length > 1 ? 's' : ''} waiting at your base`
  }
  if (theftView.lockSec > 0) return `base locked for ${theftView.lockSec}s`
  if (theftView.rechargeSec > 0) return `lock recharges in ${theftView.rechargeSec}s`
  if (theftView.floorPrice > 0) return `next floor at ${formatIncome(theftView.floorPrice)}`
  if (theftView.nextPrestige > 0) return `prestige at ${formatIncome(theftView.nextPrestige)}`
  return ''
}

/**
 * The reticle, on screen only while the player is aiming. It is drawn from the same cone
 * the server rules with, so it is allowed to claim a lock: red and named means the shot
 * lands, and the player learns the weapon's reach by watching it rather than by reading it.
 */
function Crosshair() {
  const locked = combatView.targetName !== ''
  const cold = combatView.cooldown > 0
  const gap = 8
  const len = 12
  const th = 2
  const col = cold
    ? Color4.create(1, 1, 1, 0.22)
    : locked ? Color4.fromHexString('#ff5c5cff') : Color4.create(1, 1, 1, 0.7)

  const bar = (left: number, top: number, w: number, h: number, key: string) => (
    <UiEntity key={key}
      uiTransform={{
        width: w, height: h, positionType: 'absolute',
        position: { top: '50%', left: '50%' }, margin: { left, top }
      }}
      uiBackground={{ color: col }} />
  )

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {bar(-th / 2, -(gap + len), th, len, 'up')}
      {bar(-th / 2, gap, th, len, 'down')}
      {bar(-(gap + len), -th / 2, len, th, 'left')}
      {bar(gap, -th / 2, len, th, 'right')}
      {locked && (
        <UiEntity
          uiTransform={{
            width: 300, height: 24, positionType: 'absolute',
            position: { top: '50%', left: '50%' }, margin: { left: -150, top: 34 },
            justifyContent: 'center'
          }}
        >
          <Label value={`${combatView.targetName.toUpperCase()}  ·  ${Math.round(combatView.targetDist)} m`}
            fontSize={TYPE.label} color={Color4.fromHexString('#ff8b8bff')} textAlign="middle-center" />
        </UiEntity>
      )}
    </UiEntity>
  )
}

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>

    <WelcomePanel />
    {!welcomeView.open && <IndexPanel />}
    {!welcomeView.open && <QuestsPanel />}

    {combatView.aiming && !welcomeView.open && !menuView.open && !slotView.active && <Crosshair />}

    {!welcomeView.open && (
    <UiEntity
      uiTransform={{
        width: 460, height: TAP.height, positionType: 'absolute', position: { top: 158, right: 24 },
        flexDirection: 'row', justifyContent: 'flex-end'
      }}
    >
      {menuView.open && (
        <Button
          uiTransform={{ width: 150, height: TAP.height, margin: { right: TAP.gap } }}
          value="GOALS" variant={activeTab() === 'goals' ? 'primary' : 'secondary'}
          fontSize={TYPE.caption} onMouseDown={() => chooseTab('goals')} />
      )}
      {menuView.open && (
        <Button
          uiTransform={{ width: 150, height: TAP.height, margin: { right: TAP.gap } }}
          value={`INDEX ${indexView.vus.length}`}
          variant={activeTab() === 'index' ? 'primary' : 'secondary'}
          fontSize={TYPE.caption} onMouseDown={() => chooseTab('index')} />
      )}
      <Button
        uiTransform={{ width: 110, height: TAP.height }}
        value={menuView.open ? 'X' : (questsToClaim() > 0 ? `☰ ${questsToClaim()}` : '☰')}
        variant={menuView.open || questsToClaim() > 0 ? 'primary' : 'secondary'}
        fontSize={TYPE.label} onMouseDown={basculerMenu} />
    </UiEntity>
    )}

    {tutoView.etape < tutoView.total && (
      <UiEntity
        uiTransform={{
          width: 480, height: 130, positionType: 'absolute', position: { top: 16, right: 24 },
          flexDirection: 'column', padding: 16
        }}
        uiBackground={{ color: Color4.create(0.04, 0.07, 0.12, 0.88) }}
      >
        {/*
          Anchored right, not left. The left edge belongs to the Decentraland client: its
          own icon rail, its place card and the chat all live there, and on a phone the
          interactable inset reserves it. Sitting there put this panel under the client's
          own furniture, which a capture of the running game showed plainly.
        */}
        <Label
          value={`STEP ${tutoView.etape + 1}/${tutoView.total}  ${ETAPES_TEXTE[tutoView.etape]?.titre ?? ''}`}
          fontSize={TYPE.label} color={C.bonus}
          uiTransform={{ width: '100%', height: 40 }} textAlign="middle-left" />
        <Label
          value={ETAPES_TEXTE[tutoView.etape]?.aide ?? ''}
          fontSize={TYPE.caption} color={C.dim}
          uiTransform={{ width: '100%', height: 52 }} textAlign="middle-left" />
      </UiEntity>
    )}

    {theftView.prime > 0 && (
      <UiEntity
        uiTransform={{
          width: 300, height: 40, positionType: 'absolute',
          position: { top: 112, left: '50%' }, margin: { left: -150 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0.06, 0.20, 0.10, 0.85) }}
      >
        <Label
          value={`CROWD BONUS  +${Math.round(theftView.prime * 100)}%  ·  ${theftView.presents} players here`}
          fontSize={TYPE.label} color={Color4.fromHexString('#8fe08fff')} />
      </UiEntity>
    )}

    {/*
      The travel rail, down the right edge under the step panel.

      The reference games keep their menus in a vertical rail of large entries at the edge
      of the screen rather than in the action bar, and they keep it collapsed until asked.
      Theirs runs down the left; ours cannot, because that edge is the Decentraland
      client's own. Collapsed it is one control, which is the whole point: the three
      destinations only exist once the player has said they want to go somewhere.
    */}
    {!combatView.aiming && (
      <UiEntity
        uiTransform={{
          width: 300, height: travelView.open ? TAP.height * 4 + TAP.gap * 3 : TAP.height,
          positionType: 'absolute', position: { top: 158 + TAP.height + TAP.gap, right: 24 },
          flexDirection: 'column', justifyContent: 'flex-start'
        }}
      >
        <Button
          uiTransform={{ width: 300, height: TAP.height, margin: { bottom: TAP.gap } }}
          value={travelView.open ? 'CLOSE' : 'TRAVEL'}
          variant={travelView.open ? 'primary' : 'secondary'}
          fontSize={TYPE.body} onMouseDown={basculerVoyage} />
        {travelView.open && (
          <Button
            uiTransform={{ width: 300, height: TAP.height, margin: { bottom: TAP.gap } }}
            value="GO HOME" variant={travelView.peutRentrer ? 'primary' : 'secondary'}
            fontSize={TYPE.body} onMouseDown={() => { rentrer(); basculerVoyage() }} />
        )}
        {travelView.open && (
          <Button
            uiTransform={{ width: 300, height: TAP.height, margin: { bottom: TAP.gap } }}
            value="GO TO BELT" variant="secondary" fontSize={TYPE.body}
            onMouseDown={() => { goToBelt(); basculerVoyage() }} />
        )}
        {travelView.open && theftView.basePosee && (
          <Button
            uiTransform={{ width: 300, height: TAP.height }}
            value={slotView.active ? 'CANCEL' : 'MOVE BASE'}
            variant={slotView.active ? 'primary' : 'secondary'}
            fontSize={TYPE.body} onMouseDown={() => { basculerPose(); basculerVoyage() }} />
        )}
      </UiEntity>
    )}

    <UiEntity
      uiTransform={{
        width: 560, height: 128, positionType: 'absolute',
        position: { top: 12, left: '50%' }, margin: { left: -280 },
        padding: 12, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center'
      }}
      uiBackground={{ color: PANNEAU }}
    >
      {/*
        The one number that carries the whole game, at hero size and in the money colour.
        The pending amount is not repeated here: it already rides the COLLECT button, and
        showing it twice was the clearest redundancy in the old interface.
      */}
      <Label
        value={`${formatIncome(theftView.coins)}${theftView.multiplier > 1 ? '  x' + theftView.multiplier : ''}`}
        fontSize={TYPE.hero} color={C.money} />
      <Label
        value={
          !view.serverAlive ? 'SERVER OFFLINE'
          : !theftView.basePosee ? 'place your base so your loot earns'
          : theftView.income === 0 ? 'open a crate to start earning'
          : `+${formatIncome(theftView.income)}/s${theftView.sentries > 0 ? '   sentry ' + theftView.sentries : ''}`
        }
        fontSize={TYPE.label}
        color={
          !view.serverAlive ? C.danger
          : (!theftView.basePosee || theftView.income === 0) ? C.bonus
          : C.money
        } />
    </UiEntity>

    {theftView.fil.length > 0 && (
      <UiEntity
        uiTransform={{
          width: 400, height: 62, positionType: 'absolute',
          position: { top: 106, left: '50%' }, margin: { left: -200 },
          padding: 8, flexDirection: 'column', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.42) }}
      >
        {theftView.fil.slice(0, 3).map((l, i) => (
          <Label key={i} value={l} fontSize={TYPE.caption} color={Color4.fromHexString('#b8c2d0ff')} />
        ))}
      </UiEntity>
    )}

    {beltView.annonce !== '' && (
      <UiEntity
        uiTransform={{
          width: 700, height: 62, positionType: 'absolute',
          position: { top: 160, left: '50%' }, margin: { left: -350 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: announceBackdrop() }}
      >
        {/*
          Kept high and out of the middle third: that band is where the reticle sits and
          where the player is looking when the weapon is out.
        */}
        <Label
          value={beltView.annonce}
          fontSize={TYPE.body + beltView.annonceTier * 4}
          color={Color4.fromHexString(beltView.annonceColor + 'ff')} />
      </UiEntity>
    )}

    {(boxView.roule || boxView.resultat >= 0) && (
      <UiEntity
        uiTransform={{
          width: 460, height: 130, positionType: 'absolute',
          position: { top: '34%', left: '50%' }, margin: { left: -230 },
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.88) }}
      >
        <Label
          value={boxView.roule
            ? (RARITIES[boxView.index]?.name ?? '')
            : itemName(boxView.resultat, boxView.resultatMutation)}
          fontSize={boxView.roule ? 32 : (mutation(boxView.resultatMutation).mult > 1 ? 38 : 44)}
          color={Color4.fromHexString(
            (boxView.roule
              ? (RARITIES[boxView.index]?.color ?? '#ffffff')
              : itemColor(boxView.resultat, boxView.resultatMutation)) + 'ff')} />
        <Label
          value={boxView.roule ? '...' : ETATS[boxView.state]?.(boxView.resultat) ?? ''}
          fontSize={TYPE.label}
          color={Color4.fromHexString(boxView.state === 'expose' ? '#8fe08fff' : '#ffd166ff')} />
      </UiEntity>
    )}

    {!theftView.basePosee && boxView.stock.length > 0 && !boxView.opening && !boxView.roule && (
      <UiEntity
        uiTransform={{
          width: 400, height: 40, positionType: 'absolute',
          position: { bottom: 150, left: '50%' }, margin: { left: -200 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0.12, 0.10, 0.02, 0.8) }}
      >
        <Label value="place your base first: crates are opened at your base" fontSize={TYPE.label} color={Color4.fromHexString('#ffd166ff')} />
      </UiEntity>
    )}

    {placementView.selection >= 0 && (
      <UiEntity
        uiTransform={{
          width: 560, height: 46, positionType: 'absolute',
          position: { bottom: 150, left: '50%' }, margin: { left: -280 },
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          padding: 6
        }}
        uiBackground={{ color: Color4.create(0.05, 0.12, 0.05, 0.85) }}
      >
        <Label value="tap a slot to move it  ·  tap ANOTHER BASE to gift it" fontSize={TYPE.label} color={Color4.fromHexString('#8fe08fff')} />
        <Button
          uiTransform={{ width: 110, height: 34 }}
          value="SELL IT" variant="secondary" fontSize={TYPE.caption}
          onMouseDown={() => { sell(placementView.selection); placementView.selection = -1 }} />
      </UiEntity>
    )}

    {boxView.opening && (
      <UiEntity
        uiTransform={{
          width: 320, height: 54, positionType: 'absolute',
          position: { bottom: 150, left: '50%' }, margin: { left: -160 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
      >
        <Label value={`SMASH THE CRATE  ${boxView.coups}/3`} fontSize={20} color={Color4.fromHexString('#ffd166ff')} />
      </UiEntity>
    )}

    {theftView.stealing && (
      <UiEntity
        uiTransform={{
          width: 460, height: 76, positionType: 'absolute',
          position: { bottom: 210, left: '50%' }, margin: { left: -230 },
          flexDirection: 'column', padding: 10
        }}
        uiBackground={{ color: Color4.create(0.24, 0.06, 0.06, 0.9) }}
      >
        <Label
          value={`TAKING FROM ${theftView.stealTarget.toUpperCase()}  ·  ${(theftView.stealLeftMs / 1000).toFixed(1)}s`}
          fontSize={TYPE.label} color={Color4.fromHexString('#ff9b9bff')}
          uiTransform={{ width: '100%', height: 24 }} textAlign="middle-center" />
        <UiEntity
          uiTransform={{ width: '100%', height: 12, margin: { top: 4, bottom: 4 } }}
          uiBackground={{ color: Color4.create(1, 1, 1, 0.14) }}
        >
          <UiEntity
            uiTransform={{ width: `${Math.max(0, Math.min(100, 100 - (theftView.stealLeftMs / theftView.stealTotalMs) * 100))}%`, height: 12 }}
            uiBackground={{ color: Color4.fromHexString('#ff6b6bff') }} />
        </UiEntity>
        <Label value="stay close - walking away cancels it" fontSize={TYPE.caption}
          color={Color4.fromHexString('#c9a0a0ff')}
          uiTransform={{ width: '100%', height: 18 }} textAlign="middle-center" />
      </UiEntity>
    )}

    {theftView.alert !== '' && (
      <UiEntity
        uiTransform={{
          width: 520, height: 70, positionType: 'absolute',
          position: { top: '42%', left: '50%' }, margin: { left: -260 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      >
        <Label value={theftView.alert} fontSize={23} color={Color4.fromHexString(theftView.alertColor + 'ff')} />
      </UiEntity>
    )}

    {/*
      The bottom bar, and only what can be pressed.

      Every control is at TAP.height with TAP.gap between them, and every label at
      TYPE.body, so a thumb can hit them and an eye can read them on a phone. What the
      player is merely waiting for sits above as one dim line, never as a dead button.
    */}
    {hint() !== '' && !combatView.aiming && (
      <UiEntity
        uiTransform={{
          width: 900, height: 34, positionType: 'absolute',
          position: { bottom: 26 + TAP.height + 14, left: '50%' }, margin: { left: -450 },
          justifyContent: 'center', alignItems: 'center'
        }}
      >
        <Label value={hint()} fontSize={TYPE.caption} color={C.dim} textAlign="middle-center" />
      </UiEntity>
    )}

    <UiEntity
      uiTransform={{
        width: 1120, height: TAP.height, positionType: 'absolute',
        position: { bottom: 26, left: '50%' }, margin: { left: -560 },
        flexDirection: 'row', justifyContent: 'center'
      }}
    >
      {theftView.pending > 0 && !slotView.active && !combatView.aiming && (
        <Button
          uiTransform={{ width: 300, height: TAP.height, margin: { right: TAP.gap } }}
          value={`COLLECT ${formatIncome(theftView.pending)}`}
          variant="primary"
          fontSize={TYPE.body}
          onMouseDown={collectPending} />
      )}

      {!combatView.aiming && (() => {
        const a = nextAction()
        return a === null ? null : (
          <Button
            uiTransform={{ width: 300, height: TAP.height, margin: { right: TAP.gap } }}
            value={a.label} variant="primary"
            fontSize={TYPE.body} onMouseDown={a.action} />
        )
      })()}

      {theftView.basePosee && view.items > 0 && !slotView.active && !combatView.aiming
        && theftView.lockSec === 0 && theftView.rechargeSec === 0 && (
        <Button
          uiTransform={{ width: 180, height: TAP.height, margin: { right: TAP.gap } }}
          value="LOCK" variant="secondary"
          fontSize={TYPE.body}
          onMouseDown={lockBase} />
      )}

      {/*
        The weapon control, and while the weapon is out it is the only control left.

        A tap anywhere fires, so every other button in this bar would fire as well as do
        its own job: the global input reports the tap whether or not the interface
        swallowed it. Drawing therefore empties the bar down to this one button, which
        also says what combat mode is without a word of explanation. uiInputBinding carries
        IA_SECONDARY, so the same element serves the phone, where there is no key, and the
        desktop, where F alone told the player nothing.
      */}
      {!slotView.active && (
        <Button
          uiTransform={{ width: 220, height: TAP.height, pointerFilter: 'block' }}
          uiInputBinding={{ actions: [InputAction.IA_SECONDARY] }}
          value={combatView.aiming ? 'HOLSTER' : 'DRAW'}
          variant={combatView.aiming ? 'primary' : 'secondary'}
          fontSize={TYPE.body} />
      )}
    </UiEntity>
  </UiEntity>
)
