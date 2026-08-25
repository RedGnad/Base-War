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
import { strip, row, topBand, noticeBand, active, setReference } from './client/layout'
import { Btn } from './client/ui-kit'
import { view } from './client/setup'
import { theftView, lockBase, recover, doPrestige, buyFloorFor, collectPending, armSentry, cancelSteal } from './client/theft'
import { beltView } from './client/belt'
import { boxView, openBestCrate, peutOuvrirIci, REEL_WIN } from './client/box'
import { placementView } from './client/plots'
import { IndexPanel, indexView } from './client/index-ui'
import { QuestsPanel, questsToClaim } from './client/quests-ui'
import { TravelPanel } from './client/travel-ui'
import { menuView, activeTab, basculerMenu, chooseTab } from './client/menu'
import { tutoView, ETAPES_TEXTE } from './client/tutorial'
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
    // The fifth control on the client's cluster, and the 1 key on a keyboard: the menu.
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) basculerMenu()
    if (modale()) return
    if (!inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) return
    const a = nextAction()
    if (a !== null) a.action()
  })

  function choose(): void {
    if (getPlatform() === null) return
    engine.removeSystem(choose)
    const phone = isMobile() || FORCE_MOBILE_LAYOUT
    /*
      'device' rather than 'interactable', deliberately.

      The interactable inset shifts the whole canvas inward to clear the client's controls,
      so '50%' stops being the middle of the screen and a centred dialog drifts to one side,
      which is what a phone showed. The documentation puts dialogs at the centre of the
      screen, so the canvas is left whole and only the hardware margins are avoided here.
      Staying clear of the client's own controls is a placement question, and it is answered
      one place, in layout.ts, where the forbidden columns are named.
    */
    const inset = 'device'
    setReference(phone ? 1600 : 1920, phone ? 720 : 1080)
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

/** A handset, or the desktop preview asked to measure like one. */
function phone(): boolean { return isMobile() || FORCE_MOBILE_LAYOUT }

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
/**
 * The wait, as a bar rather than a sentence.
 *
 * The scene's server only runs while somebody is inside it, so the first visitor to an
 * empty venue waits on a cold start, documented at about fifteen seconds. A word for that
 * wait is not enough: a line of static text is exactly what a broken game also shows, and
 * the player cannot tell the two apart. Something that visibly advances can only mean work
 * is happening, and where the duration is roughly known a bar beats a spinner, because it
 * answers "how much longer" instead of only "is it alive".
 *
 * It fills fast and then slows, and it stops short of the end. The curve is honest about
 * what we know: the fifteen seconds is a documented figure, not a measurement of our own
 * server, so a bar that marched to the end on a timer would be inventing a certainty we do
 * not have, and would sit full and lying whenever the wait ran long. This one reaches
 * about seven eighths at fifteen seconds and never quite arrives. The last part of the
 * journey belongs to the heartbeat: the bar disappears because the server answered, which
 * is the only thing that was ever worth reporting.
 */
const WaitBar = () => {
  const attente = view.waitingSince === 0 ? 0 : Date.now() - view.waitingSince
  const part = 0.9 * (1 - Math.exp(-attente / 5000))
  return (
    <UiEntity uiTransform={{ width: '100%', height: 6 }} uiBackground={{ color: C.inset }}>
      <UiEntity uiTransform={{ width: `${Math.round(part * 100)}%`, height: 6 }}
        uiBackground={{ color: C.bonus }} />
    </UiEntity>
  )
}

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

const uiComponent = () => {
  /*
    The top band, resolved once per frame, in priority order.

    The money is permanent and leads. The tutorial step matters only until it is finished.
    A crowd bonus and a crate on the belt are moments. The feed is history, so it goes last
    and is the one dropped when the band is full.
  */
  const band = topBand([
    ['money', true, 104],
    ['tuto', tutoView.etape < tutoView.total, 56],
    ['prime', theftView.prime > 0, 44],
    ['belt', beltView.annonce !== '', 58],
    ['feed', theftView.fil.length > 0, 62]
  ])
  /*
    What the game is waiting for, stacked above the controls, most urgent first.
  */
  const notice = noticeBand([
    ['stealing', theftView.stealing, 76],
    ['opening', boxView.opening, 54],
    ['placement', placementView.selection >= 0, 46],
    ['baseFirst', !theftView.basePosee && boxView.stock.length > 0 && !boxView.opening && !boxView.roule, 40]
  ])
  return (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>

    <WelcomePanel />
    <PrestigePanel />
    {!modale() && <IndexPanel />}
    {!modale() && <QuestsPanel />}
    {!modale() && <TravelPanel />}

    {combatView.aiming && !modale() && !menuView.open && !slotView.active && <Crosshair />}

    {/*
      The tabs, and on a phone nothing else.

      The client draws its own control cluster and will show one button of ours in it before
      folding the rest behind a "+", so the menu lives there instead of on a bar we draw.
      That is the whole reason this row is empty during play on a handset: the way in is the
      client's own button, and these tabs only exist once it has been pressed. A desktop has
      no such cluster, so it keeps a visible opener.
    */}
    {!modale() && (menuView.open || !phone()) && (
    <UiEntity
      uiTransform={{
        width: strip(760).width, height: TAP.height, positionType: 'absolute',
        position: { bottom: row(1), left: '50%' }, margin: strip(760).margin,
        flexDirection: 'row', justifyContent: 'flex-start'
      }}
    >
      {menuView.open && (['goals', 'index', 'travel'] as const).map((o) => (
        <Button key={o}
          uiTransform={{ width: 150, height: TAP.height, margin: { right: TAP.gap } }}
          value={o === 'index' ? `INDEX ${indexView.vus.length}` : o.toUpperCase()}
          variant={activeTab() === o ? 'primary' : 'secondary'} uiBackground={btn(activeTab() === o)}
          fontSize={TYPE.caption} onMouseDown={() => chooseTab(o)} />
      ))}
      <Btn
        width={menuView.open ? 140 : 190}
        primary={menuView.open || questsToClaim() > 0}
        onClick={basculerMenu}
        label={menuView.open ? 'CLOSE' : (questsToClaim() > 0 ? `MENU ${questsToClaim()}` : 'MENU')} />
    </UiEntity>
    )}

    {!modale() && tutoView.etape < tutoView.total && band.tuto >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(1000).width, height: 56, positionType: 'absolute',
          position: { top: band.tuto, left: '50%' }, margin: strip(1000).margin,
          flexDirection: 'row', alignItems: 'center', padding: 12
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
          uiTransform={{ width: 360, height: 34 }} textAlign="middle-left" textWrap="nowrap" />
        <Label
          value={ETAPES_TEXTE[tutoView.etape]?.aide ?? ''}
          fontSize={TYPE.caption} color={C.dim}
          uiTransform={{ width: 600, height: 34 }} textAlign="middle-left" textWrap="nowrap" />
      </UiEntity>
    )}

    {!modale() && theftView.prime > 0 && band.prime >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(620).width, height: 44, positionType: 'absolute',
          position: { top: band.prime, left: '50%' }, margin: strip(620).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0.06, 0.20, 0.10, 0.85) }}
      >
        <Label
          value={`CROWD BONUS  +${Math.round(theftView.prime * 100)}%  ·  ${theftView.presents} players here`}
          fontSize={TYPE.label} color={Color4.fromHexString('#8fe08fff')} />
      </UiEntity>
    )}

    {!modale() && (
    <UiEntity
      uiTransform={{
        width: strip(520).width, height: 104, positionType: 'absolute',
        position: { top: band.money, left: '50%' }, margin: strip(520).margin,
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
                ? (intentEnAttente() ? 'starting up, your action is queued' : 'starting up')
                : (intentEnAttente() ? 'reconnecting, your action is queued' : 'reconnecting'))
          : !theftView.basePosee ? 'place your base so your loot earns'
          : theftView.income === 0 ? 'open a crate to start earning'
          : `+${formatIncome(theftView.income)}/s${theftView.sentries > 0 ? '   sentry ' + theftView.sentries : ''}`
        }
        fontSize={TYPE.label}
        color={
          !view.serverAlive ? C.bonus
          : (!theftView.basePosee || theftView.income === 0) ? C.bonus
          : C.money
        } />
      {!view.serverAlive && <WaitBar />}
    </UiEntity>
    )}

    {!modale() && theftView.fil.length > 0 && band.feed >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(400).width, height: 62, positionType: 'absolute',
          position: { top: band.feed, left: '50%' }, margin: strip(400).margin,
          padding: 8, flexDirection: 'column', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.42) }}
      >
        {theftView.fil.slice(0, 3).map((l, i) => (
          <Label key={i} value={l} fontSize={TYPE.caption} color={Color4.fromHexString('#b8c2d0ff')} />
        ))}
      </UiEntity>
    )}

    {!modale() && beltView.annonce !== '' && band.belt >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(700).width, height: 58, positionType: 'absolute',
          position: { top: band.belt, left: '50%' }, margin: strip(700).margin,
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
          // Centred on the screen actually being drawn. These were 960 and 1920, the
          // middle and the edge of a desktop canvas, so on a phone's 1600 the whole strip
          // and its marker sat a hundred and sixty pixels right of centre.
          const x = active.w / 2 - REEL_W / 2 + (i - boxView.progres) * (REEL_W + REEL_GAP)
          if (x < -REEL_W || x > active.w) return null
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
            position: { left: active.w / 2 - 2.5, top: 0 }
          }}
          uiBackground={{ color: C.name }} />
      </UiEntity>
    )}

    {!modale() && !boxView.roule && boxView.resultat >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(900).width, height: 96, positionType: 'absolute',
          position: { bottom: 250 + REEL_H + 26, left: '50%' }, margin: strip(900).margin,
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
          width: strip(400).width, height: 40, positionType: 'absolute',
          position: { bottom: notice.baseFirst, left: '50%' }, margin: strip(400).margin,
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
          width: strip(560).width, height: 46, positionType: 'absolute',
          position: { bottom: notice.placement, left: '50%' }, margin: strip(560).margin,
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
          width: strip(320).width, height: 54, positionType: 'absolute',
          position: { bottom: notice.opening, left: '50%' }, margin: strip(320).margin,
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
          width: strip(460).width, height: 76, positionType: 'absolute',
          position: { bottom: notice.stealing, left: '50%' }, margin: strip(460).margin,
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
          width: strip(520).width, height: 70, positionType: 'absolute',
          position: { top: '42%', left: '50%' }, margin: strip(520).margin,
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
          width: strip(620).width, height: 34, positionType: 'absolute',
          position: { bottom: row(0) + 62, left: '50%' }, margin: strip(620).margin,
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
          width: strip(620).width, height: 52, positionType: 'absolute',
          position: { bottom: row(0), left: '50%' }, margin: strip(620).margin,
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
              /*
                A press that cannot reach the server yet answers here, where the player
                was looking when they pressed, and not only in the counter at the top of
                the screen. Feedback that appears somewhere else is feedback the player
                does not connect to what they did, which is the whole complaint against a
                held action: it reads as a dead button.
              */
              : intentEnAttente() ? 'queued, the game is still starting up'
              : (() => { const a = nextAction(); return a === null ? 'F to draw' : `E   ${a.label}   ·   F to draw` })()
          }
          fontSize={TYPE.label} color={combatView.aiming ? C.danger : C.name} textAlign="middle-center" />
      </UiEntity>
    )}

  </UiEntity>
  )
}
