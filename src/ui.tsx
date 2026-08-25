import { PRODUCTION_PER_RARITY } from './shared/economy'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { InputAction, inputSystem, PointerEventType } from '@dcl/sdk/ecs'
import { TYPE, C, HUE, TAP, SKIN, btn, FORCE_MOBILE_LAYOUT } from './client/theme'
import { Glyphs } from './client/glyphs'
import { PrestigePanel, prestigeView } from './client/prestige-ui'
import { intentEnAttente } from './client/intent'
import { strip, row, topBand, noticeBand, active, BAND, COIN_HAUT_DROIT, decalageCentre, setReference } from './client/layout'
import { Btn } from './client/ui-kit'
import { view } from './client/setup'
import { setIconePrimaire, setReticuleClient } from './client/locomotion'
import { theftView, lockBase, recover, doPrestige, collectPending, cancelSteal } from './client/theft'
import { beltView } from './client/belt'
import { boxView, openBestCrate, peutOuvrirIci, REEL_WIN } from './client/box'
import { placementView } from './client/plots'
import { IndexContent, indexView, HAUTEUR_INDEX } from './client/index-ui'
import { ShopContent, shopView, HAUTEUR_SHOP } from './client/shop-ui'
import { QuestsContent, questsToClaim, questsView, HAUTEUR_GOALS } from './client/quests-ui'
import { TravelContent, HAUTEUR_TRAVEL } from './client/travel-ui'
import { menuView, activeTab, basculerMenu, chooseTab, closeMenu } from './client/menu'
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
    /*
      What the central button is for, right now, drawn on the central button.

      Aiming makes it the trigger. Otherwise it takes the picture of whatever action is on
      offer, when that action has one, and falls back to the plain E for the actions whose
      price or count has to be read rather than recognised.
    */
    setIconePrimaire(combatView.aiming ? 'icon-fire' : (nextAction()?.icon ?? null))
    setReticuleClient(!combatView.aiming && !modale() && !menuView.open)

    // The fifth control on the client's cluster, and the 1 key on a keyboard: the menu.
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) basculerMenu()
    if (modale()) return
    // While the weapon is out this button is the trigger, and combat.ts owns it. Without
    // this, one press would fire and open the nearest crate in the same frame.
    if (combatView.aiming) return
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

/**
 * One window, one row of tabs, three contents.
 *
 * The three panels each used to draw their own frame, centred, while the row that switched
 * between them sat in the bottom band at a fixed height. On a phone that height falls inside
 * the frame, so the tabs were printed across the middle of the very panel they command, and
 * each panel was free to be a different size from its neighbours.
 *
 * A tab row belongs to its window. Putting the frame here, once, means the three can only
 * ever agree on where they are and how big they are, and the controls that steer them can
 * no longer land on top of them.
 */
/**
 * A full-width row whose only job is to centre one thing of unknown width.
 *
 * Everything else in this interface is placed by computing a margin of minus half its
 * width, which works and is exact, and which quietly requires every plate to declare a
 * width it may not need. A line of text that changes with the game does not have a width to
 * declare, and padding it out to a fixed one is how a two-word hint came to take a third of
 * a phone screen. This lets the layout do the centring instead of the arithmetic.
 */
const Centre = (props: { top?: number; bottom?: number; children?: unknown }) => (
  <UiEntity
    uiTransform={{
      width: '100%', positionType: 'absolute',
      position: props.top !== undefined ? { top: props.top, left: 0 } : { bottom: props.bottom ?? 0, left: 0 },
      justifyContent: 'center', alignItems: 'center'
    }}
  >
    {props.children}
  </UiEntity>
)

const MENU_W = 1088

const MENU_PAD = 18
const MENU_ENTETE = TAP.height + 14

const MenuWindow = () => {
  if (modale() || !menuView.open) return null

  /*
    The height is computed, and the scrolling area is given a number rather than a wish.
    
    The body used to be `flexGrow: 1` inside a fixed-height window, on the assumption that
    it would take the space left over and no more. That is CSS reasoning. The engine lays
    out with Yoga, where `flexShrink` defaults to zero rather than one, so a child whose
    content is taller than the room available does not shrink to fit: it keeps its size and
    runs out through the bottom of the frame. On a desktop it happened to scroll; on a phone
    it simply spilled past the panel, which is what a photograph of the running game showed.
    
    So each tab declares what it needs, the window takes that or the ceiling, whichever is
    smaller, and the body is handed the exact remainder in pixels. A tab that fits makes a
    short window instead of a tall one with a hole in it, which is the other half of the
    complaint: a card for three objectives should not take over the screen.
  */
  const besoin = questsView.open ? HAUTEUR_GOALS
    : indexView.open ? HAUTEUR_INDEX
    : shopView.open ? HAUTEUR_SHOP
    : HAUTEUR_TRAVEL
  const h = Math.min(BAND.dialogMaxHeight, MENU_PAD * 2 + MENU_ENTETE + besoin)
  const corps = h - MENU_PAD * 2 - MENU_ENTETE

  return (
    <UiEntity
      uiTransform={{
        width: strip(MENU_W).width, height: h, positionType: 'absolute',
        position: { top: '50%', left: '50%' },
        margin: { left: strip(MENU_W).margin.left, top: -h / 2 },
        flexDirection: 'column', padding: MENU_PAD
      }}
      uiBackground={{ color: Color4.create(0.04, 0.05, 0.09, 0.97) }}
    >
      <UiEntity
        uiTransform={{
          width: '100%', height: TAP.height, flexDirection: 'row',
          alignItems: 'center', margin: { bottom: 14 }
        }}
      >
        {/*
          The purse leads, because a shop that hides what you can spend is a shop you cannot
          use, and the counter outside is suppressed while a window is open.

          Everything here is measured against the window's inner width: four tabs, the purse
          and the way out come to 1034 of the 1052 a full-width window gives, and the spacer
          swallows what is left. Sized by hand rather than by flexGrow because these glyphs
          need a box in pixels, and a box wider than the room it was given draws outside it.
        */}
        <UiEntity uiTransform={{ width: 220, height: TAP.height, justifyContent: 'center' }}>
          <Glyphs value={formatIncome(theftView.coins)} size={TYPE.body}
            color={C.money} align="left" box={220} top={(TAP.height - TYPE.body) / 2} />
        </UiEntity>
        {(['goals', 'shop', 'index', 'travel'] as const).map((o) => (
          <Btn key={o} width={150} right={16} primary={activeTab() === o}
            onClick={() => chooseTab(o)}
            label={o === 'index' ? `INDEX ${indexView.vus.length}` : o.toUpperCase()} />
        ))}
        <UiEntity uiTransform={{ flexGrow: 1, height: 1 }} />
        <Btn label="CLOSE" width={150} onClick={closeMenu} />
      </UiEntity>

      <UiEntity
        uiTransform={{
          width: '100%', height: corps, overflow: 'scroll', flexDirection: 'column'
        }}
      >
        <QuestsContent />
        <ShopContent />
        <IndexContent />
        <TravelContent />
      </UiEntity>
    </UiEntity>
  )
}

/**
 * The controls, for a machine that has no touch cluster to lend us.
 *
 * Everything of ours moved onto the client's own buttons, which was right for a phone and
 * left the desktop with nothing: the pictures we write go into TouchScreenControls, which
 * that client does not draw. The moment COLLECT started carrying an icon instead of a
 * sentence, a desktop player was shown no way to bank their takings at all.
 *
 * So the desktop gets the same three controls, in the same corner, drawn by us: the menu,
 * the weapon, and whatever the game currently offers. They carry their key as well as their
 * name, and they are bound to the same actions, so they can be clicked or typed.
 */
const DesktopControls = () => {
  if (phone() || !hud()) return null
  const a = nextAction()
  const action = combatView.aiming ? 'FIRE' : a?.label ?? null
  return (
    <UiEntity
      uiTransform={{
        height: TAP.height, positionType: 'absolute',
        position: { bottom: row(0), right: 40 },
        flexDirection: 'row', alignItems: 'center'
      }}
    >
      <Btn label="1  MENU" width={190} right={TAP.gap}
        primary={questsToClaim() > 0} onClick={basculerMenu} />
      <Btn label={combatView.aiming ? 'F  HOLSTER' : 'F  DRAW'} width={210} right={TAP.gap}
        primary={combatView.aiming} bind={[InputAction.IA_SECONDARY]} />
      {action !== null && (
        <Btn label={`E  ${action}`} width={300} primary bind={[InputAction.IA_PRIMARY]} />
      )}
    </UiEntity>
  )
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
function nextAction(): { label: string; action: () => void; icon?: string } | null {
  if (slotView.active) return slotView.valid ? { label: 'PLACE HERE', action: placeHere } : null
  if (theftView.canRecover) return { label: 'RECOVER', action: recover }
  if (!theftView.basePosee) return { label: 'BUILD BASE', action: basculerPose }
  if (boxView.stock.length > 0 && peutOuvrirIci()) {
    return { label: `OPEN ${boxView.stock.length}`, action: openBestCrate }
  }
  /*
    No purchase past this point, and that is the whole rule.

    A floor, a defence tier and a prestige used to be offered here. They are not the same
    kind of thing as the actions above: opening a crate is caused by standing next to one and
    stops being available the moment it is done, while being able to afford a floor is a
    condition that stays true until the money is spent. So the button locked onto the
    purchase and everything else vanished behind it for as long as the player could pay.
    The contextual action carries what the place and the last few seconds caused; the three
    purchases live in the shop tab, which is a room you go to.
  */
  /*
    Collecting, which had no button at all.

    Items earn into a pool that only a `collect` message empties, and the client has always
    had the call. Nothing ever invoked it. The pool filled and could not be banked, while the
    tutorial's third step told the player in as many words to tap COLLECT, naming a control
    that did not exist. A comment a few lines further down still explained that the pending
    amount was not shown in the counter "because it already rides the COLLECT button".

    It goes last on purpose. Something is nearly always pending, so anywhere higher and it
    would hide every purchase behind itself; last, it is what the button offers whenever
    there is nothing more urgent, which is most of the time.
  */
  if (theftView.pending >= 1) {
    // A picture, so the button says it and the bar above the controls can stay away. The
    // amount is not lost: the counter states the pool, which is where a total belongs.
    return { label: 'COLLECT', icon: 'icon-collect', action: collectPending }
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

/** A panel that takes the whole screen: nothing of the game draws behind it, not even tabs. */
function modale(): boolean {
  return welcomeView.open || prestigeView.open
}

/**
 * Whether the running game's own display is allowed on screen.
 *
 * This is the distinction the interface was missing, and it is why an opened menu came out
 * looking like a collision: `modale()` knew about the welcome screen and the prestige
 * dialog, and nothing else. The objectives window is neither, so the money counter, the
 * tutorial step and the crowd bonus kept drawing straight over it, and the tab row landed
 * across the middle of its own panel.
 *
 * A window is open or it is not. When one is, the game's readouts have nothing to say that
 * cannot wait, and they go away. Only the window and the controls that steer it remain.
 */
function hud(): boolean {
  return !modale() && !menuView.open
}

/**
 * The one line above the controls, or nothing at all.
 *
 * Kept short on purpose: it is read out of the corner of the eye, and a sentence read that
 * way is a sentence not read. What the weapon button means is no longer in here, because it
 * is drawn on the weapon button.
 */
function barre(): string {
  if (combatView.aiming) {
    return combatView.targetName !== '' ? `FIRE on ${combatView.targetName}` : 'aim at someone'
  }
  if (intentEnAttente()) return 'queued, the game is still starting up'
  /*
    Below here it is captioning the client's own buttons, which only a phone has. A desktop
    draws its own controls with their names on them, so a plate repeating those names is
    furniture. And on a phone, an action that put a picture on the button has already said
    itself.
  */
  if (!phone()) return ''
  const a = nextAction()
  if (a === null || a.icon !== undefined) return ''
  return `E   ${a.label}`
}

function hint(): string {
  if (slotView.active && !slotView.valid) return slotView.reason
  if (boxView.stock.length > 0 && !peutOuvrirIci()) {
    return `${boxView.stock.length} crate${boxView.stock.length > 1 ? 's' : ''} waiting at your base`
  }
  // Said from the owner's side. "base locked" and "lock recharges" describe the mechanism,
  // and read like a fault on your own screen; what the player owns here is a protection.
  if (theftView.lockSec > 0) return `your base is shielded for ${theftView.lockSec}s`
  if (theftView.rechargeSec > 0) return `shield ready in ${theftView.rechargeSec}s`
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
  // Our fifty percent is the middle of the safe area, not the middle of the glass, and the
  // shot goes to the middle of the glass. This is the difference.
  const c = decalageCentre()
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
        position: { top: '50%', left: '50%' }, margin: { left: left + c.x, top: top + c.y }
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
            position: { top: '50%', left: '50%' }, margin: { left: -150 + c.x, top: 34 + c.y },
            justifyContent: 'center'
          }}
        >
          <Label uiTransform={{ width: '100%' }} textWrap="nowrap"
            value={`${combatView.targetName.toUpperCase()}  ·  ${Math.round(combatView.targetDist)} m`}
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

    <DesktopControls />
    <WelcomePanel />
    <PrestigePanel />
    <MenuWindow />

    {combatView.aiming && hud() && !slotView.active && <Crosshair />}


    {/*
      The current step, in the top right corner.

      It was centred at the top, directly under the money, which put a running objective in
      the middle of the screen: the one place eye-tracking work on game interfaces says to
      keep clear, because it is where the player is looking. An objective tracker is read in
      the periphery and is conventionally in that corner.

      The corner is genuinely free here, which is not what this scene assumed. A photograph
      of the mobile client shows its four buttons in a row at the top LEFT with nothing at
      the top right; the desktop client has two small icons there, and the margin clears them.
      It is also no longer part of the stacked top band, since it now occupies a corner
      nothing else competes for.
    */}
    {hud() && tutoView.etape < tutoView.total && (
      <UiEntity
        uiTransform={{
          height: 52, positionType: 'absolute', padding: { left: 20, right: 20 },
          position: { top: BAND.top, right: COIN_HAUT_DROIT },
          flexDirection: 'row', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label
          value={`STEP ${tutoView.etape + 1}/${tutoView.total}`}
          fontSize={TYPE.caption} color={C.dim}
          uiTransform={{ height: 32, margin: { right: 14 } }} textWrap="nowrap" />
        <Label
          value={ETAPES_TEXTE[tutoView.etape]?.titre ?? ''}
          fontSize={TYPE.label} color={C.bonus}
          uiTransform={{ height: 32 }} textWrap="nowrap" />
      </UiEntity>
    )}


    {/*
      The counter, with nothing behind it.

      It sat on an opaque plate five hundred and twenty wide and a hundred tall, which on a
      phone is a real piece of the playing field spent on a background for six characters.
      On a screen this size the rule is to obstruct as little as possible, so the plate is
      gone and the letters carry their own contrast: the typeface draws a dark copy of itself
      behind, which costs one element per character and no screen at all. Freed of the plate
      the number can also be bigger, which is what a counter read from the corner of the eye
      needs anyway.
    */}
    {hud() && (
    <UiEntity
      uiTransform={{
        width: strip(560).width, height: 104, positionType: 'absolute',
        position: { top: band.money, left: '50%' }, margin: strip(560).margin,
        flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center'
      }}
    >
      {/*
        The one number that carries the whole game, at hero size and in the money colour.
        The pool waiting to be banked is named here as well as on the button, because a
        purchase the player can afford takes the button's place and would otherwise take the
        only mention of the pool with it.
      */}
      {/*
        The money is set in the game's own face, which the platform does not carry: one
        quad per digit, each showing its cell of an atlas. Glyphs place themselves, so they
        need a box of their own in the column or the line under them is walked over.
      */}
      <UiEntity uiTransform={{ width: '100%', height: TYPE.hero + 6 }}>
        <Glyphs
          value={`${formatIncome(theftView.coins)}${theftView.multiplier > 1 ? '  x' + theftView.multiplier : ''}`}
          size={TYPE.hero} color={C.money} align="center" box={strip(560).width} shadow />
      </UiEntity>
      {/*
        The line under it, in the same face for the same reason: no plate, so it has to
        carry its own contrast rather than borrow one.
      */}
      <UiEntity uiTransform={{ width: '100%', height: 34 }}>
        <Glyphs
          size={TYPE.label} align="center" box={strip(560).width} shadow
          color={
            !view.serverAlive ? C.bonus
            : (!theftView.basePosee || theftView.income === 0) ? C.bonus
            : C.money
          }
          value={
            !view.serverAlive
              ? (view.serverBooting
                  ? (intentEnAttente() ? 'STARTING UP, ACTION QUEUED' : 'STARTING UP')
                  : (intentEnAttente() ? 'RECONNECTING, ACTION QUEUED' : 'RECONNECTING'))
            : !theftView.basePosee ? 'PLACE YOUR BASE'
            : theftView.income === 0 ? 'OPEN A CRATE TO EARN'
            : `+${formatIncome(theftView.income)}/S`
              + (theftView.pending >= 1 ? `   ${formatIncome(theftView.pending)} BANKED` : '')
              + (theftView.prime > 0 ? `   +${Math.round(theftView.prime * 100)}% CROWD` : '')
          } />
      </UiEntity>
      {!view.serverAlive && <WaitBar />}
    </UiEntity>
    )}

    {hud() && theftView.fil.length > 0 && band.feed >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(400).width, height: 62, positionType: 'absolute',
          position: { top: band.feed, left: '50%' }, margin: strip(400).margin,
          padding: 8, flexDirection: 'column', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.42) }}
      >
        {theftView.fil.slice(0, 3).map((l, i) => (
          <Label key={i} uiTransform={{ width: '100%' }} textWrap="nowrap"
            value={l} fontSize={TYPE.caption} color={Color4.fromHexString('#b8c2d0ff')} />
        ))}
      </UiEntity>
    )}

    {/*
      A crate worth crossing the room for. One in about thirteen now, rather than one in
      four, so it is allowed to be loud; it is not allowed to be wider than its sentence.
    */}
    {hud() && beltView.annonce !== '' && band.belt >= 0 && (
      <Centre top={band.belt}>
        <UiEntity
          uiTransform={{
            height: 58, padding: { left: 24, right: 24 },
            justifyContent: 'center', alignItems: 'center'
          }}
          uiBackground={{ color: Color4.create(0.10, 0.08, 0.02, 0.88) }}
        >
          <Label value={beltView.annonce} fontSize={TYPE.label}
            color={C.bonus} textWrap="nowrap" />
        </UiEntity>
      </Centre>
    )}

    {/*
      The reel.

      A strip of candidate cards runs along the bottom and decelerates onto one, with a
      white line marking the centre. It replaces a spinning list of rarity names, which
      told the player the result without ever showing them what they nearly had: the whole
      point of the form is the cards that go past. Only the cards actually on screen are
      drawn, out of the thirty-four in the strip.
    */}
    {hud() && (boxView.roule || boxView.resultat >= 0) && (
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

    {hud() && !boxView.roule && boxView.resultat >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(900).width, height: 96, positionType: 'absolute',
          position: { bottom: 250 + REEL_H + 26, left: '50%' }, margin: strip(900).margin,
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}
      >
        <Label
          uiTransform={{ width: '100%' }}
          value={itemName(boxView.resultat, boxView.resultatMutation)}
          fontSize={TYPE.title}
          color={Color4.fromHexString(itemColor(boxView.resultat, boxView.resultatMutation) + 'ff')} />
        <Label
          uiTransform={{ width: '100%' }}
          value={ETATS[boxView.state]?.(boxView.resultat) ?? ''}
          fontSize={TYPE.label}
          color={boxView.state === 'expose' ? C.money : C.bonus} />
      </UiEntity>
    )}

    {hud() && !theftView.basePosee && boxView.stock.length > 0 && !boxView.opening && !boxView.roule && (
      <UiEntity
        uiTransform={{
          width: strip(400).width, height: 40, positionType: 'absolute',
          position: { bottom: notice.baseFirst, left: '50%' }, margin: strip(400).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label uiTransform={{ width: '100%' }} value="place your base first: crates are opened at your base" fontSize={TYPE.label} color={Color4.fromHexString('#ffd166ff')} />
      </UiEntity>
    )}

    {hud() && placementView.selection >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(560).width, height: 46, positionType: 'absolute',
          position: { bottom: notice.placement, left: '50%' }, margin: strip(560).margin,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          padding: 6
        }}
        uiBackground={{ color: Color4.create(0.05, 0.12, 0.05, 0.85) }}
      >
        <Label uiTransform={{ width: 400 }} value="tap a slot to move it  ·  tap ANOTHER BASE to gift it" fontSize={TYPE.label} color={Color4.fromHexString('#8fe08fff')} />
        <Button
          uiTransform={{ width: 110, height: 34 }}
          value="SELL IT" variant="secondary" uiBackground={SKIN.secondary} color={C.name} fontSize={TYPE.caption}
          onMouseDown={() => { sell(placementView.selection); placementView.selection = -1 }} />
      </UiEntity>
    )}

    {hud() && boxView.opening && (
      <UiEntity
        uiTransform={{
          width: strip(320).width, height: 54, positionType: 'absolute',
          position: { bottom: notice.opening, left: '50%' }, margin: strip(320).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
      >
        <Label uiTransform={{ width: '100%' }} textWrap="nowrap" value={`SMASH THE CRATE  ${boxView.coups}/3`} fontSize={TYPE.body} color={C.bonus} />
      </UiEntity>
    )}

    {hud() && theftView.stealing && (
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

    {hud() && theftView.alert !== '' && (
      <UiEntity
        uiTransform={{
          width: strip(520).width, height: 70, positionType: 'absolute',
          position: { top: '42%', left: '50%' }, margin: strip(520).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label uiTransform={{ width: '100%' }} value={theftView.alert} fontSize={TYPE.title} color={Color4.fromHexString(theftView.alertColor + 'ff')} />
      </UiEntity>
    )}

    {/*
      The bottom bar, and only what can be pressed.

      Every control is at TAP.height with TAP.gap between them, and every label at
      TYPE.body, so a thumb can hit them and an eye can read them on a phone. What the
      player is merely waiting for sits above as one dim line, never as a dead button.
    */}
    {hint() !== '' && !combatView.aiming && hud() && (
      <UiEntity
        uiTransform={{
          width: strip(620).width, height: 34, positionType: 'absolute',
          position: { bottom: row(0) + 62, left: '50%' }, margin: strip(620).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
      >
        <Label uiTransform={{ width: '100%' }} value={hint()} fontSize={TYPE.caption} color={C.dim} textAlign="middle-center" />
      </UiEntity>
    )}

    {/*
      What E does right now, and nothing else.

      This was a fixed plate six hundred and twenty wide holding two captions, "E BUILD
      BASE" and "F to draw", parked above the client's buttons. Two things were wrong with
      it. Half of it captioned a control that can carry its own meaning, and now does: F
      wears a pistol, struck through once the weapon is out. And a plate with a fixed width
      is a block of furniture whatever it has to say, which is how a single short word came
      to occupy a third of the screen.

      What is left hugs its text and appears only when there is something to say. Eye
      tracking on game interfaces is blunt about this: players hold their gaze on the action
      and read the rest in peripheral vision, so anything permanent near the middle is paid
      for out of the part of the screen they are actually using.
    */}
    {hud() && !slotView.active && barre() !== '' && (
      <Centre bottom={row(0)}>
        <UiEntity
          uiTransform={{
            height: 52, padding: { left: 26, right: 26 },
            justifyContent: 'center', alignItems: 'center'
          }}
          uiBackground={SKIN.panel}
        >
          <Label value={barre()} fontSize={TYPE.label}
            color={combatView.aiming ? C.danger : C.name} textWrap="nowrap" />
        </UiEntity>
      </Centre>
    )}

  </UiEntity>
  )
}
