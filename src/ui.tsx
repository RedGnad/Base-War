import { PRODUCTION_PER_RARITY } from './shared/economy'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { InputAction } from '@dcl/sdk/ecs'
import { view } from './client/setup'
import { theftView, lockBase, recover, doPrestige, buyFloorFor, collectPending, armSentry, cancelSteal } from './client/theft'
import { beltView } from './client/belt'
import { boxView, openBestCrate } from './client/box'
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

const PANNEAU = Color4.create(0, 0, 0, 0.62)

/**
 * Action buttons, sized for a thumb rather than a mouse.
 *
 * Decentraland overrides a 16:9 virtual screen to 1600x720 on a phone, so on a handset in
 * landscape (roughly 844x390 logical) the UI scale factor is min(844/1600, 390/720) = 0.53.
 * The old 58 px buttons therefore measured 31 pt, under the 44 pt floor Apple, Material and
 * WCAG 2.5.5 all converge on, and their 10 px margins measured 5 pt against a recommended 8.
 * 96 and 20 virtual pixels put both back over the line with room to spare.
 */
const BTN_H = 96
const BTN_GAP = 20

/**
 * Announcement backdrop, tinted by the crate. A fixed dark brown made every tier look the
 * same; a wash of the crate's own colour lets the eye read the tier before the words.
 */
function announceBackdrop(): Color4 {
  const c = Color4.fromHexString(beltView.annonceColor + 'ff')
  return Color4.create(c.r * 0.22, c.g * 0.22, c.b * 0.22, 0.9)
}

function nextAction(): { label: string; ready: boolean; action: () => void } {
  if (slotView.active) {
    return slotView.valid
      ? { label: 'PLACE HERE', ready: true, action: placeHere }
      : { label: slotView.reason.toUpperCase(), ready: false, action: basculerPose }
  }
  if (theftView.canRecover) return { label: 'RECOVER!', ready: true, action: recover }
  if (!theftView.basePosee) return { label: 'BUILD BASE', ready: true, action: basculerPose }
  if (boxView.stock.length > 0) return { label: `OPEN (${boxView.stock.length})`, ready: true, action: openBestCrate }
  if (theftView.basePosee && view.items > 0 && theftView.sentries === 0
      && theftView.sentryPrice > 0 && theftView.coins >= theftView.sentryPrice) {
    return { label: `SENTRY ${formatIncome(theftView.sentryPrice)}`, ready: true, action: armSentry }
  }
  if (theftView.floorPrice > 0 && theftView.coins >= theftView.floorPrice) {
    return { label: '+1 FLOOR', ready: true, action: buyFloorFor }
  }
  if (theftView.nextPrestige > 0 && theftView.coins >= theftView.nextPrestige) {
    return { label: `PRESTIGE x${theftView.multiplier + 1}`, ready: true, action: doPrestige }
  }
  if (theftView.basePosee && view.items > 0 && theftView.sentries === 0 && theftView.sentryPrice > 0
      && (theftView.floorPrice === 0 || theftView.sentryPrice <= theftView.floorPrice)) {
    return { label: `SENTRY ${formatIncome(theftView.sentryPrice)}`, ready: false, action: armSentry }
  }
  if (theftView.floorPrice > 0) return { label: `FLOOR ${formatIncome(theftView.floorPrice)}`, ready: false, action: buyFloorFor }
  if (theftView.nextPrestige > 0) return { label: `PRESTIGE ${formatIncome(theftView.nextPrestige)}`, ready: false, action: doPrestige }
  return { label: 'ALL MAXED', ready: false, action: () => {} }
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
            fontSize={14} color={Color4.fromHexString('#ff8b8bff')} textAlign="middle-center" />
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
        width: 260, height: 36, positionType: 'absolute', position: { top: 12, right: 24 },
        flexDirection: 'row', justifyContent: 'flex-end'
      }}
    >
      {menuView.open && (
        <Button
          uiTransform={{ width: 90, height: 36, margin: { right: 6 } }}
          value="GOALS" variant={activeTab() === 'goals' ? 'primary' : 'secondary'}
          fontSize={12} onMouseDown={() => chooseTab('goals')} />
      )}
      {menuView.open && (
        <Button
          uiTransform={{ width: 90, height: 36, margin: { right: 6 } }}
          value={`INDEX ${indexView.vus.length}`}
          variant={activeTab() === 'index' ? 'primary' : 'secondary'}
          fontSize={12} onMouseDown={() => chooseTab('index')} />
      )}
      <Button
        uiTransform={{ width: 62, height: 36 }}
        value={menuView.open ? 'X' : (questsToClaim() > 0 ? `☰ ${questsToClaim()}` : '☰')}
        variant={menuView.open || questsToClaim() > 0 ? 'primary' : 'secondary'}
        fontSize={14} onMouseDown={basculerMenu} />
    </UiEntity>
    )}

    {tutoView.etape < tutoView.total && (
      <UiEntity
        uiTransform={{
          width: 320, height: 92, positionType: 'absolute', position: { top: 112, left: 110 },
          flexDirection: 'column', padding: 12
        }}
        uiBackground={{ color: Color4.create(0.04, 0.07, 0.12, 0.88) }}
      >
        <Label
          value={`STEP ${tutoView.etape + 1}/${tutoView.total}  ·  ${ETAPES_TEXTE[tutoView.etape]?.titre ?? ''}`}
          fontSize={15} color={Color4.fromHexString('#4dd2ffff')}
          uiTransform={{ width: '100%', height: 24 }} textAlign="middle-left" />
        <Label
          value={ETAPES_TEXTE[tutoView.etape]?.aide ?? ''}
          fontSize={13} color={Color4.fromHexString('#a8b2c0ff')}
          uiTransform={{ width: '100%', height: 40 }} textAlign="middle-left" />
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
          fontSize={15} color={Color4.fromHexString('#8fe08fff')} />
      </UiEntity>
    )}

    <UiEntity
      uiTransform={{
        width: 150, height: travelView.open ? 172 : 38,
        positionType: 'absolute', position: { top: 216, left: 110 },
        flexDirection: 'column', justifyContent: 'flex-start'
      }}
    >
      <Button
        uiTransform={{ width: 150, height: 38, margin: { bottom: 6 } }}
        value={travelView.open ? 'CLOSE' : 'TRAVEL'}
        variant={travelView.open ? 'primary' : 'secondary'}
        fontSize={13} onMouseDown={basculerVoyage} />
      {travelView.open && (
        <Button
          uiTransform={{ width: 150, height: 38, margin: { bottom: 6 } }}
          value="GO HOME" variant={travelView.peutRentrer ? 'primary' : 'secondary'}
          fontSize={13} onMouseDown={() => { rentrer(); basculerVoyage() }} />
      )}
      {travelView.open && (
        <Button
          uiTransform={{ width: 150, height: 38, margin: { bottom: 6 } }}
          value="GO TO BELT" variant="secondary" fontSize={13}
          onMouseDown={() => { goToBelt(); basculerVoyage() }} />
      )}
      {travelView.open && theftView.basePosee && (
        <Button
          uiTransform={{ width: 150, height: 38 }}
          value={slotView.active ? 'CANCEL MOVE' : 'MOVE BASE'}
          variant={slotView.active ? 'primary' : 'secondary'}
          fontSize={13} onMouseDown={() => { basculerPose(); basculerVoyage() }} />
      )}
    </UiEntity>

    <UiEntity
      uiTransform={{
        width: 380, height: 88, positionType: 'absolute',
        position: { top: 12, left: '50%' }, margin: { left: -180 },
        padding: 10, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center'
      }}
      uiBackground={{ color: PANNEAU }}
    >
      <Label
        value={`${formatIncome(theftView.coins)} coins${theftView.multiplier > 1 ? '  x' + theftView.multiplier : ''}`}
        fontSize={30} color={Color4.fromHexString('#ffd166ff')} />
      <Label
        value={
          !view.serverAlive ? 'SERVER OFFLINE'
          : !theftView.basePosee ? 'place your base so your loot earns'
          : theftView.income === 0 ? 'open a crate to start earning'
          : `+${formatIncome(theftView.income)}/s  →  ${formatIncome(theftView.pending)} waiting${theftView.sentries > 0 ? '  ·  sentry ' + theftView.sentries : ''}`
        }
        fontSize={13}
        color={
          !view.serverAlive ? Color4.Red()
          : (!theftView.basePosee || theftView.income === 0) ? Color4.fromHexString('#ffd166ff')
          : Color4.fromHexString('#8fe08fff')
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
          <Label key={i} value={l} fontSize={12} color={Color4.fromHexString('#b8c2d0ff')} />
        ))}
      </UiEntity>
    )}

    {beltView.annonce !== '' && (
      <UiEntity
        uiTransform={{
          width: 420, height: 44, positionType: 'absolute',
          position: { top: 176, left: '50%' }, margin: { left: -210 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: announceBackdrop() }}
      >
        <Label
          value={beltView.annonce}
          fontSize={17 + beltView.annonceTier * 2}
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
          fontSize={15}
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
        <Label value="place your base first: items earn nothing without one" fontSize={14} color={Color4.fromHexString('#ffd166ff')} />
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
        <Label value="tap a slot to move it  ·  tap ANOTHER BASE to gift it" fontSize={14} color={Color4.fromHexString('#8fe08fff')} />
        <Button
          uiTransform={{ width: 110, height: 34 }}
          value="SELL IT" variant="secondary" fontSize={13}
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
          fontSize={16} color={Color4.fromHexString('#ff9b9bff')}
          uiTransform={{ width: '100%', height: 24 }} textAlign="middle-center" />
        <UiEntity
          uiTransform={{ width: '100%', height: 12, margin: { top: 4, bottom: 4 } }}
          uiBackground={{ color: Color4.create(1, 1, 1, 0.14) }}
        >
          <UiEntity
            uiTransform={{ width: `${Math.max(0, Math.min(100, 100 - (theftView.stealLeftMs / theftView.stealTotalMs) * 100))}%`, height: 12 }}
            uiBackground={{ color: Color4.fromHexString('#ff6b6bff') }} />
        </UiEntity>
        <Label value="stay close - walking away cancels it" fontSize={12}
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

    <UiEntity
      uiTransform={{
        width: 840, height: 100, positionType: 'absolute',
        position: { bottom: 26, left: '50%' }, margin: { left: -420 },
        flexDirection: 'row', justifyContent: 'center'
      }}
    >
      {theftView.pending > 0 && !slotView.active && (
        <Button
          uiTransform={{ width: 190, height: BTN_H, margin: { right: BTN_GAP } }}
          value={`COLLECT ${formatIncome(theftView.pending)}`}
          variant="primary"
          fontSize={17}
          onMouseDown={collectPending} />
      )}

      {(() => {
        const a = nextAction()
        return (
          <Button
            uiTransform={{ width: 200, height: BTN_H, margin: { right: BTN_GAP } }}
            value={a.label} variant={a.ready ? 'primary' : 'secondary'}
            fontSize={17} onMouseDown={a.action} />
        )
      })()}

      {theftView.basePosee && view.items > 0 && !slotView.active && (
        <Button
          uiTransform={{ width: 170, height: BTN_H, margin: { right: BTN_GAP } }}
          value={
            theftView.lockSec > 0 ? `LOCKED ${theftView.lockSec}s`
            : theftView.rechargeSec > 0 ? `WAIT ${theftView.rechargeSec}s`
            : 'LOCK'
          }
          variant={theftView.lockSec === 0 && theftView.rechargeSec === 0 ? 'primary' : 'secondary'}
          fontSize={16}
          onMouseDown={lockBase} />
      )}

      {/*
        The weapon control, and there is only one: it draws and holsters. While the weapon
        is out the shot leaves on its own, so no trigger button competes for a thumb.
        uiInputBinding carries IA_SECONDARY, so the same element serves the phone, where
        there is no key, and the desktop, where F alone told the player nothing.
        pointerFilter blocks the tap so hitting the button does not also click the world.
      */}
      {!slotView.active && (
        <Button
          uiTransform={{ width: 180, height: BTN_H, pointerFilter: 'block' }}
          uiInputBinding={{ actions: [InputAction.IA_SECONDARY] }}
          value={combatView.aiming ? 'HOLSTER' : 'DRAW  F'}
          variant={combatView.aiming ? 'primary' : 'secondary'}
          fontSize={17} />
      )}
    </UiEntity>
  </UiEntity>
)
