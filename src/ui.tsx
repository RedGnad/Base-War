import { PRODUCTION_PER_RARITY } from './shared/economy'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { InputAction, inputSystem, PointerEventType } from '@dcl/sdk/ecs'
import { TYPE, C, HUE, TAP, SKIN, btn, FORCE_MOBILE_LAYOUT } from './client/theme'
import { Glyphs } from './client/glyphs'
import { PrestigePanel, prestigeView, openPrestige } from './client/prestige-ui'
import { intentEnAttente } from './client/intent'
import { strip, row } from './client/layout'
import { Btn } from './client/ui-kit'
import { view } from './client/setup'
import { theftView, lockBase, recover, doPrestige, buyFloorFor, collectPending, armSentry, cancelSteal } from './client/theft'
import { beltView } from './client/belt'
import { boxView, openBestCrate, peutOuvrirIci, REEL_WIN } from './client/box'
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

/** Card geometry for the reel, in virtual pixels. */
const REEL_W = 210
const REEL_H = 172
const REEL_GAP = 12

const ETATS: Record<string, (r: number) => string> = {
  expose: (r) => `+${INCOME_UI[r] ?? 1} coins/s  ·  placed on your base`,
  'en-stock': () => 'kept in stock  ·  BUILD YOUR BASE to earn from it',
  plein: () => 'your base is full  ·  make room'
}
import { slotView, basculerPose, placeHere } from './client/slots'
import { combatView } from './client/combat'

export function setupUi() {
  /*
    E is the game's action, and the only one.

    The mobile client gives four buttons a thumb can reach and names what each emits: the
    interaction button sends IA_POINTER at whatever is under the reticle, E sends
    IA_PRIMARY, F sends IA_SECONDARY, and there is a jump. Adding our own row beside them
    was noise. So the world answers the interaction button, E carries whatever the scene
    would have put on a button of its own, and F draws the weapon. One button, one meaning.
  */
  engine.addSystem(() => {
    if (modale()) return
    if (!inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) return
    const a = nextAction()
    if (a !== null) a.action()
  })

  function choose(): void {
    if (getPlatform() === null) return
    engine.removeSystem(choose)
    const phone = isMobile() || FORCE_MOBILE_LAYOUT
    const inset = phone ? 'interactable' : 'device'
    // 1600x720 is what the client substitutes on a handset for a 16:9 request; asking for
    // it directly is what makes the desktop preview measure like a phone.
    ReactEcsRenderer.setUiRenderer(uiComponent, {
      virtualWidth: phone ? 1600 : 1920, virtualHeight: phone ? 720 : 1080, screenInset: inset
    })
    console.log(`[CLIENT] interface ${phone ? '1600x720 (phone)' : '1920x1080'}, screenInset '${inset}'`)
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
    // Opens the decision, never commits it: prestige wipes the base and cannot be undone.
    return { label: `PRESTIGE x${theftView.multiplier + 1}`, action: openPrestige }
  }
  return null
}

/** What the player is waiting on, in one line, never as a control. */
/**
 * A dialog owns the screen.
 *
 * The heads-up display used to keep drawing under the welcome panel, so the title was
 * crossed by the tutorial line and START sat next to BUILD BASE and DRAW. The condition
 * existed on some blocks and not others, added one at a time. It lives here now, and
 * every block reads the same function.
 */
function modale(): boolean {
  return welcomeView.open || prestigeView.open
}

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
    <PrestigePanel />
    {!modale() && <IndexPanel />}
    {!modale() && <QuestsPanel />}

    {combatView.aiming && !modale() && !menuView.open && !slotView.active && <Crosshair />}

    {!modale() && (
    <UiEntity
      uiTransform={{
        width: strip(760).width, height: TAP.height, positionType: 'absolute',
        position: { bottom: row(1), left: '50%' }, margin: strip(760).margin,
        flexDirection: 'row', justifyContent: 'flex-start'
      }}
    >
      {menuView.open && (
        <Button
          uiTransform={{ width: 150, height: TAP.height, margin: { right: TAP.gap } }}
          value="GOALS" variant={activeTab() === 'goals' ? 'primary' : 'secondary'} uiBackground={btn(activeTab() === 'goals')}
          fontSize={TYPE.caption} onMouseDown={() => chooseTab('goals')} />
      )}
      {menuView.open && (
        <Button
          uiTransform={{ width: 150, height: TAP.height, margin: { right: TAP.gap } }}
          value={`INDEX ${indexView.vus.length}`}
          variant={activeTab() === 'index' ? 'primary' : 'secondary'} uiBackground={btn(activeTab() === 'index')}
          fontSize={TYPE.caption} onMouseDown={() => chooseTab('index')} />
      )}
      <Button
        uiTransform={{ width: 110, height: TAP.height }}
        value={menuView.open ? 'X' : (questsToClaim() > 0 ? `☰ ${questsToClaim()}` : '☰')}
        variant={menuView.open || questsToClaim() > 0 ? 'primary' : 'secondary'} uiBackground={btn(menuView.open || questsToClaim() > 0)}
        fontSize={TYPE.label} onMouseDown={basculerMenu} />
    </UiEntity>
    )}

    {!modale() && tutoView.etape < tutoView.total && (
      <UiEntity
        uiTransform={{
          width: 760, height: 64, positionType: 'absolute',
          position: { top: 120, left: '50%' }, margin: { left: -380 },
          flexDirection: 'row', alignItems: 'center', padding: 10
        }}
        uiBackground={SKIN.panel}
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
          uiTransform={{ width: 300, height: 44 }} textAlign="middle-left" />
        <Label
          value={ETAPES_TEXTE[tutoView.etape]?.aide ?? ''}
          fontSize={TYPE.caption} color={C.dim}
          uiTransform={{ width: 430, height: 44 }} textAlign="middle-left" />
      </UiEntity>
    )}

    {!modale() && theftView.prime > 0 && (
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
    {!modale() && !combatView.aiming && (
      <UiEntity
        uiTransform={{
          width: strip(760).width, height: TAP.height, positionType: 'absolute',
          position: { bottom: row(1), left: '50%' }, margin: strip(760).margin,
          flexDirection: 'row', justifyContent: 'flex-end'
        }}
      >
        <Btn label={travelView.open ? 'CLOSE' : 'TRAVEL'} width={travelView.open ? 200 : 240}
          primary={travelView.open} right={TAP.gap} onClick={basculerVoyage} />
        {travelView.open && (
          <Btn label="GO HOME" width={220} primary={travelView.peutRentrer} right={TAP.gap}
            onClick={() => { rentrer(); basculerVoyage() }} />
        )}
        {travelView.open && (
          <Btn label="TO BELT" width={200} right={TAP.gap}
            onClick={() => { goToBelt(); basculerVoyage() }} />
        )}
        {travelView.open && theftView.basePosee && (
          <Btn label={slotView.active ? 'CANCEL' : 'MOVE'} width={180}
            primary={slotView.active} onClick={() => { basculerPose(); basculerVoyage() }} />
        )}
      </UiEntity>
    )}

    {!modale() && (
    <UiEntity
      uiTransform={{
        width: 520, height: 104, positionType: 'absolute',
        position: { top: 10, left: '50%' }, margin: { left: -260 },
        padding: 8, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center'
      }}
      uiBackground={SKIN.panel}
    >
      {/*
        The one number that carries the whole game, at hero size and in the money colour.
        The pending amount is not repeated here: it already rides the COLLECT button, and
        showing it twice was the clearest redundancy in the old interface.
      */}
      {/*
        The money is set in the game's own face, which the platform does not carry: one
        quad per digit, each showing its cell of an atlas. Glyphs place themselves, so they
        need a box of their own in the column or the line under them is walked over.
      */}
      <UiEntity uiTransform={{ width: '100%', height: TYPE.title + 8 }}>
        <Glyphs
          value={`${formatIncome(theftView.coins)}${theftView.multiplier > 1 ? '  x' + theftView.multiplier : ''}`}
          size={TYPE.title} color={C.money} align="center" box={504} />
      </UiEntity>
      <Label
        value={
          !view.serverAlive
            ? (view.serverBooting
                ? (intentEnAttente() ? 'waking the server up, your action is queued' : 'waking the server up')
                : 'SERVER OFFLINE')
          : !theftView.basePosee ? 'place your base so your loot earns'
          : theftView.income === 0 ? 'open a crate to start earning'
          : `+${formatIncome(theftView.income)}/s${theftView.sentries > 0 ? '   sentry ' + theftView.sentries : ''}`
        }
        fontSize={TYPE.label}
        color={
          !view.serverAlive ? (view.serverBooting ? C.bonus : C.danger)
          : (!theftView.basePosee || theftView.income === 0) ? C.bonus
          : C.money
        } />
    </UiEntity>
    )}

    {!modale() && theftView.fil.length > 0 && (
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

    {!modale() && beltView.annonce !== '' && (
      <UiEntity
        uiTransform={{
          width: 700, height: 58, positionType: 'absolute',
          position: { top: 196, left: '50%' }, margin: { left: -350 },
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

    {/*
      The reel.

      A strip of candidate cards runs along the bottom and decelerates onto one, with a
      white line marking the centre. It replaces a spinning list of rarity names, which
      told the player the result without ever showing them what they nearly had: the whole
      point of the form is the cards that go past. Only the cards actually on screen are
      drawn, out of the thirty-four in the strip.
    */}
    {!modale() && (boxView.roule || boxView.resultat >= 0) && (
      <UiEntity
        uiTransform={{
          width: '100%', height: REEL_H + 8, positionType: 'absolute',
          position: { bottom: 250, left: 0 }
        }}
        uiBackground={SKIN.panel}
      >
        {boxView.reel.map((r, i) => {
          const x = 960 - REEL_W / 2 + (i - boxView.progres) * (REEL_W + REEL_GAP)
          if (x < -REEL_W || x > 1920) return null
          const gagnant = !boxView.roule && i === REEL_WIN
          const col = Color4.fromHexString((RARITIES[r]?.color ?? '#ffffff') + 'ff')
          return (
            <UiEntity key={i}
              uiTransform={{
                width: REEL_W, height: REEL_H, positionType: 'absolute',
                position: { left: x, top: 4 },
                flexDirection: 'column', justifyContent: 'space-between', padding: 10
              }}
              uiBackground={gagnant ? { ...SKIN.card, color: col } : SKIN.card}
            >
              <Label value={RARITIES[r]?.name ?? ''} fontSize={TYPE.caption}
                color={gagnant ? C.name : col}
                uiTransform={{ width: '100%', height: 30 }} textAlign="middle-center" />
              <UiEntity
                uiTransform={{ width: '100%', height: 84 }}
                uiBackground={gagnant ? SKIN.inset : { ...SKIN.inset, color: col }} />
              <Label value={`+${formatIncome(INCOME_UI[r] ?? 1)}/s`} fontSize={TYPE.caption}
                color={C.money}
                uiTransform={{ width: '100%', height: 30 }} textAlign="middle-center" />
            </UiEntity>
          )
        })}

        {/* The selector. Whatever sits under it when the strip stops is what was won. */}
        <UiEntity
          uiTransform={{
            width: 5, height: REEL_H + 8, positionType: 'absolute',
            position: { left: 958, top: 0 }
          }}
          uiBackground={{ color: C.name }} />
      </UiEntity>
    )}

    {!modale() && !boxView.roule && boxView.resultat >= 0 && (
      <UiEntity
        uiTransform={{
          width: 900, height: 96, positionType: 'absolute',
          position: { bottom: 250 + REEL_H + 26, left: '50%' }, margin: { left: -450 },
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}
      >
        <Label
          value={itemName(boxView.resultat, boxView.resultatMutation)}
          fontSize={TYPE.title}
          color={Color4.fromHexString(itemColor(boxView.resultat, boxView.resultatMutation) + 'ff')} />
        <Label
          value={ETATS[boxView.state]?.(boxView.resultat) ?? ''}
          fontSize={TYPE.label}
          color={boxView.state === 'expose' ? C.money : C.bonus} />
      </UiEntity>
    )}

    {!modale() && !theftView.basePosee && boxView.stock.length > 0 && !boxView.opening && !boxView.roule && (
      <UiEntity
        uiTransform={{
          width: 400, height: 40, positionType: 'absolute',
          position: { bottom: 150, left: '50%' }, margin: { left: -200 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label value="place your base first: crates are opened at your base" fontSize={TYPE.label} color={Color4.fromHexString('#ffd166ff')} />
      </UiEntity>
    )}

    {!modale() && placementView.selection >= 0 && (
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
          value="SELL IT" variant="secondary" uiBackground={SKIN.secondary} color={C.name} fontSize={TYPE.caption}
          onMouseDown={() => { sell(placementView.selection); placementView.selection = -1 }} />
      </UiEntity>
    )}

    {!modale() && boxView.opening && (
      <UiEntity
        uiTransform={{
          width: 320, height: 54, positionType: 'absolute',
          position: { bottom: 150, left: '50%' }, margin: { left: -160 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
      >
        <Label value={`SMASH THE CRATE  ${boxView.coups}/3`} fontSize={TYPE.body} color={C.bonus} />
      </UiEntity>
    )}

    {!modale() && theftView.stealing && (
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

    {!modale() && theftView.alert !== '' && (
      <UiEntity
        uiTransform={{
          width: 520, height: 70, positionType: 'absolute',
          position: { top: '42%', left: '50%' }, margin: { left: -260 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label value={theftView.alert} fontSize={TYPE.title} color={Color4.fromHexString(theftView.alertColor + 'ff')} />
      </UiEntity>
    )}

    {/*
      The bottom bar, and only what can be pressed.

      Every control is at TAP.height with TAP.gap between them, and every label at
      TYPE.body, so a thumb can hit them and an eye can read them on a phone. What the
      player is merely waiting for sits above as one dim line, never as a dead button.
    */}
    {hint() !== '' && !combatView.aiming && !modale() && (
      <UiEntity
        uiTransform={{
          width: strip(760).width, height: 34, positionType: 'absolute',
          position: { bottom: row(2), left: '50%' }, margin: strip(760).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
      >
        <Label value={hint()} fontSize={TYPE.caption} color={C.dim} textAlign="middle-center" />
      </UiEntity>
    )}

    {/*
      What the buttons do, said in one line, exactly where the documentation puts context
      hints: centre bottom, just above the client's own interaction button. No control of
      ours sits down there any more, because every one of them found a native button.
    */}
    {!modale() && !slotView.active && (
      <UiEntity
        uiTransform={{
          width: strip(760).width, height: 52, positionType: 'absolute',
          position: { bottom: row(0), left: '50%' }, margin: strip(760).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label
          value={
            combatView.aiming
              ? (combatView.targetName !== ''
                  ? `FIRE on ${combatView.targetName}   ·   F to holster`
                  : 'aim at someone   ·   F to holster')
              : (() => { const a = nextAction(); return a === null ? 'F to draw' : `E   ${a.label}   ·   F to draw` })()
          }
          fontSize={TYPE.label} color={combatView.aiming ? C.danger : C.name} textAlign="middle-center" />
      </UiEntity>
    )}

  </UiEntity>
)
