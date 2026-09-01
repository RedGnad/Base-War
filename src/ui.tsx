import { PRODUCTION_PER_RARITY } from './shared/economy'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { InputAction, inputSystem, PointerEventType } from '@dcl/sdk/ecs'
import { TYPE, C, HUE, TAP, SKIN, btn, lisible, lignesDeTexte, largeurTexte, FORCE_MOBILE_LAYOUT } from './client/theme'
import { Glyphs } from './client/glyphs'
import { FONT_FILES } from './client/font-metrics'
import { PrestigePanel, prestigeView } from './client/prestige-ui'
import { FusionPanel, fusionPanelView } from './client/fusion-ui'
import { intentEnAttente } from './client/intent'
import { strip, row, topBand, noticeBand, active, BAND, COIN_HAUT_DROIT, decalageCentre, setReference, clientEdges } from './client/layout'
import { forceDuTir, GEARS, CARRY_STOLEN_SHARE } from './shared/schemas'
import { Btn, Pouce, Barre, SURF, pctAnime } from './client/ui-kit'
import { BUILD } from './client/build-stamp'
import { view } from './client/setup'
import { setIconePrimaire, setReticuleClient, setMenuIcone } from './client/locomotion'
import { theftView, lockBase, recover, doPrestige, collectPending, cancelSteal, filVisible, alertesVisibles } from './client/theft'
import { gearView, poserPiege } from './client/gear'
import { ligneDuBandeau, prochainGrandTexte } from './client/events'
import { beltView, caisseAPortee, acheterCaisse } from './client/belt'
import { convoiAPortee, surencherir } from './client/convoy'
import { fuserAPortee, agirSurFuser } from './client/fusion'
import { boxView, openBestCrate, peutOuvrirIci, frapper, REEL_WIN } from './client/box'

import { IndexContent, indexView, HAUTEUR_INDEX } from './client/index-ui'
import { ShopContent, shopView, HAUTEUR_SHOP } from './client/shop-ui'
import { QuestsContent, questsToClaim, questsView, HAUTEUR_GOALS } from './client/quests-ui'
import { TravelContent, HAUTEUR_TRAVEL } from './client/travel-ui'
import { menuView, activeTab, basculerMenu, chooseTab, closeMenu } from './client/menu'
import { volView } from './client/locomotion'
import { tutoView, ETAPES_TEXTE, cadeauView } from './client/tutorial'
import { WelcomePanel, welcomeView } from './client/welcome'
import { RARITIES, itemName, itemColor, mutation, formatIncome, prixDeRevente, crate } from './shared/loot-table'

const INCOME_UI = PRODUCTION_PER_RARITY

/** Card geometry for the reel, in virtual pixels. */
/**
 * The reel is as wide as the room allows, because seeing the near misses IS the mechanic.
 *
 * A first pass gave it a fixed 1400 to have a width to centre against, and that made it
 * shorter than the screen on both sides. A reel exists so a player watches an Epic slide past
 * on its way to stopping on a Good: cut the ends off and it stops being a wheel and becomes an
 * announcement. It now takes whatever `strip` leaves between the client's own furniture, and
 * the cards came down from 210 so more of the strip fits into it.
 */
const REEL_W = 200
const REEL_H = 200
const REEL_GAP = 14
/** The result line lives inside the reel's panel, above the strip: one vertical budget for the whole reveal. */
const REEL_TITRE = 48

const ETATS: Record<string, (r: number) => string> = {
  // The item lands in the hand now, so the line under the reveal says what to do with it.
  main: (r) => `+${INCOME_UI[r] ?? 1} coins/s  ·  IN YOUR HAND: put it on any pedestal`,
  expose: (r) => `+${INCOME_UI[r] ?? 1} coins/s  ·  placed on your base`,
  'en-stock': () => 'kept in stock  ·  BUILD YOUR BASE to earn from it',
  plein: () => 'your base is full  ·  make room'
}
import { slotView, basculerPose, placeHere } from './client/slots'
import { carryView, placeDown, dropCarried, vendre } from './client/carry'
import { baseIci, padEnFace, agirSurPad, ascenseurAPortee, monterIci } from './client/plots'
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
    setMenuIcone(questsToClaim() > 0)

    // The fifth control on the client's cluster, and the 1 key on a keyboard: the menu.
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) basculerMenu()
    if (modale()) return
    // While the weapon is out this button is the trigger, and combat.ts owns it. Without
    // this, one press would fire and open the nearest crate in the same frame.
    // Key 2 on a desktop, the chip's own binding on a phone: both arrive here, once.
    if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) vendre()
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

/**
 * The right-hand corner, as a stack with air between its tenants.
 *
 * Three things want that corner: the tutorial step, the crate being earned, and the event
 * feed. They were each adding their own guess at an offset, and two of them landed eight
 * pixels apart, which reads as one panel that has split rather than two panels. One place
 * decides, and it leaves a real gap.
 */
const COIN_H = [52, 52, 40, 62]
/** One feed row. Caption is 21, and 26 leaves the descenders somewhere to go. */
const FIL_LIGNE = 26
const COIN_GAP = 14

function coinDroit(rang: number): number {
  const present = [
    tutoView.etape < tutoView.total,
    cadeauView.leftS > 0,
    prochainGrandTexte() !== null
  ]
  let y = BAND.top
  for (let i = 0; i < rang; i++) if (present[i] === true) y += COIN_H[i] + COIN_GAP
  return y
}

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
  /*
    The header, divided out of the width this window really has rather than the one it wanted.
    Five gaps: one after the purse and one after each of the first three tabs, plus the one
    before CLOSE, which is what the fourth tab's own margin provides.
  */
  const dedans = strip(MENU_W).width - MENU_PAD * 2
  const ecart = Math.round(dedans * 0.018)
  const bourse = Math.round(dedans * 0.19)
  // CLOSE is utility, not a destination: it took as much of the bar as a whole tab and
  // read as a fifth one. Half the width and a single letter give the four real tabs the
  // room, which is the hierarchy lesson applied to our own header.
  const fermer = Math.round(dedans * 0.075)
  const onglet = Math.floor((dedans - bourse - fermer - ecart * 5) / 4)

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
      /*
        The window wears the same plate as everything inside it.

        It was a flat near-black rectangle with square corners: the ONE surface in the game
        that did not use the generated skins. Over the records board, which is also nearly
        black, the two merged and the tab row looked like it was floating outside its own
        panel (owner, 1 Sep). The navy plate brings the outline, the rounded corners and the
        top gloss every card and button already has, so the window reads as a window.
      */
      uiBackground={SKIN.panel}
    >
      <UiEntity
        uiTransform={{
          width: '100%', height: TAP.height, flexDirection: 'row',
          alignItems: 'center', margin: { bottom: 14 }
        }}
      >
        {/*
          Every width here is a share of the window that actually got drawn.

          They were fixed pixel sizes adding up to 1034, checked against the 1052 a full-width
          window gives. But `strip` trims that window on a narrow phone, and a row of fixed
          children in a flex line does not shrink to fit: it overflows. A photograph of the
          real thing showed the four tabs touching each other and CLOSE hanging off the right
          edge of its own panel. Shares of the measured width cannot do that at any size, and
          the glyphs still get their box in pixels, which is the one thing they need.
        */}
        <UiEntity uiTransform={{ width: bourse, height: TAP.height, justifyContent: 'center' }}>
          <Glyphs value={formatIncome(theftView.coins)} size={TYPE.body}
            role="money" align="left" box={bourse} top={(TAP.height - TYPE.body) / 2} />
          {/* The running build, four characters, dim: which version is on screen is a
              question the client should answer, not a thing to argue about. */}
          <Label value={BUILD} fontSize={TYPE.caption} color={Color4.create(1, 1, 1, 0.28)}
            uiTransform={{ width: bourse, height: 22, positionType: 'absolute', position: { left: 0, top: TAP.height - 24 } }}
            textAlign="middle-left" textWrap="nowrap" />
        </UiEntity>
        {(['goals', 'shop', 'index', 'travel'] as const).map((o) => (
          <Btn key={o} width={onglet} right={ecart} primary={activeTab() === o}
            onClick={() => chooseTab(o)}
            badge={o === 'goals' && questsToClaim() > 0}
            label={o.toUpperCase()} />
        ))}
        <Btn label="X" width={fermer} onClick={closeMenu} />
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
/**
 * Selling, as a control: contextual, secondary, with friction.
 *
 * Three versions came before this one. A plate in the middle of the screen with a large SELL
 * whenever you carried your own item, which a tester read as an incitement to sell, and the
 * game wants shelves filled. A row in the shop, which was a room too far for an act done
 * once per crate. A bin by the door, a place, which was still a walk. The mobile HUD
 * guidance this project reads settles it: show a control only when it applies (contextual
 * minimalism), keep primary actions in the thumb zone and put secondary or destructive ones
 * beside them in a lesser style, and give an irreversible act friction rather than distance.
 * So: a small secondary control, priced, present only while your own item is in your hands,
 * at the edge of the screen rather than its centre. It asked a question first; the tester cut
 * that as friction, so one press sells. Key 2 on a desktop. On a phone it is a scene button, because the
 * client's own stack has no free slot without folding the others behind a "+".
 */
const SellChip = (props: { right?: number }) => {
  if (carryView.code < 0 || carryView.vole) return null
  const prix = formatIncome(prixDeRevente(carryView.code))
  return (
    <Btn label={phone() ? `SELL  +${prix}` : `2  SELL  +${prix}`}
      width={phone() ? 250 : 290} right={props.right}
      bind={[InputAction.IA_ACTION_4]} />
  )
}

/**
 * Every image the interface will ever show, requested at start.
 *
 * The client fetches a UI texture the first time an element shows it. In production that
 * fetch goes to the content server, and the first crate reel of a session was drawn before
 * its cards' icons, fondus and backgrounds had arrived: a strip of nothing, then a normal one
 * the second time. Two pixels off the canvas, one per image, is what it costs to have them
 * all resident before the first moment that needs them.
 */
/*
  Every UI texture the scene will ever show, fetched at start in a 2 px box off-screen. The
  mobile team's own words (workshop #3): the first time a UI texture appears you get a white
  flash, and nothing while loading "doesn't read as long, it reads as broken". The button
  icons were missing from this list; the first draw of the gun or the menu badge flashed.
*/
/*
  The living counter's state: what is drawn chases what is true, and each arrival is kept
  long enough to float up and disappear. Module state, read by pure render functions.
*/
let compteurVu = -1
let gainA = 0
let gainMontant = 0
function compteurAffiche(): number {
  const vrai = theftView.coins
  if (compteurVu < 0 || Math.abs(vrai - compteurVu) > Math.max(1000, vrai * 0.5)) { compteurVu = vrai; return vrai }
  if (vrai > compteurVu) { gainMontant = gainMontant > 0 && Date.now() - gainA < 700 ? gainMontant + (vrai - compteurVu) : vrai - compteurVu; gainA = Date.now() }
  compteurVu = compteurVu + (vrai - compteurVu) * 0.16
  if (Math.abs(vrai - compteurVu) < Math.max(2, vrai * 0.0002)) compteurVu = vrai
  return Math.round(compteurVu)
}
function poussee(): number { return Math.max(0, 1 - (Date.now() - gainA) / 260) }
function gainMonte(): number { return Math.min(1, (Date.now() - gainA) / 900) }
function gainRecent(): string { return gainMontant > 0 && Date.now() - gainA < 900 ? `+${formatIncome(gainMontant)}` : '' }

const PRECHAUFFE = [
  'panel', 'card', 'inset', 'primary', 'secondary', 'danger', 'fade-left', 'fade-right',
  'toy-0', 'toy-1', 'toy-2', 'toy-3', 'toy-4', 'toy-5', 'toy-6',
  'icon-build', 'icon-collect', 'icon-crate', 'icon-drop', 'icon-fire', 'icon-give', 'icon-gun',
  'icon-holster', 'icon-jump', 'icon-glide', 'icon-menu', 'icon-menu-alert', 'icon-place', 'icon-recover',
  // The interface icon family and the reveal's ray fan. A texture named for the first time
  // while a panel is drawing arrives a beat late, and the player sees an empty square where
  // the crate should be (owner, 1 Sep). Anything the interface can show has to be listed
  // here the moment it is created, which is the whole job of this list.
  'ui-crate', 'ui-floor', 'ui-shield', 'ui-prestige', 'ui-luck',
  'ui-gear-0', 'ui-gear-1', 'ui-gear-2', 'ui-gear-3', 'ui-gear-4', 'ui-gear-5', 'ui-gear-6', 'ui-gear-7',
  'burst'
]
/*
  Every interface texture referenced from the first frame: the icons, the five atlases and the
  eight plates. A texture downloads the first time something on screen names it, and on a cold
  cache the money was drawn before its atlas arrived (tester, 28 Aug). Two pixels each, off
  screen, so the downloads ride the loading screen. The shadow atlas is absent on purpose:
  nothing references it any more.
*/
const PRECHAUFFE_FICHIERS: string[] = [
  ...PRECHAUFFE.map((n) => `${n}.png`),
  ...(['money', 'bonus', 'name', 'danger', 'ink'] as const).map((r) => FONT_FILES[r]),
  ...Object.values(SKIN).map((sk) => sk.texture.src.replace('assets/ui/', ''))
]
const Prechauffe = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { left: -8, top: -8 }, width: 2, height: 2, overflow: 'hidden' }}>
    {PRECHAUFFE_FICHIERS.map((n) => (
      <UiEntity key={n} uiTransform={{ width: 2, height: 2 }}
        uiBackground={{ texture: { src: `assets/ui/${n}` }, textureMode: 'stretch' }} />
    ))}
  </UiEntity>
)

/**
 * The phone's own two controls, beside the client's three.
 *
 * The client's small buttons are the client's size, and the tester could not hit F or the
 * menu on a real handset (28 Aug). These two are ours: taller than the desktop row, in the
 * game's skin, bound to the same actions, with the pip the native menu button could never
 * carry. The central action stays native, it is already the biggest thing on the screen.
 */
const PhoneControls = () => {
  if (!phone() || !hud()) return null
  const a = nextAction()
  /*
    Nos quatre commandes de pouce, dans l'ordre demande: saut, arme, menu, et l'action au
    dessous parce qu'elle est la plus grosse et la plus souvent pressee.

    Le saut porte l'icone du parapente des que le joueur descend en l'air, ce que le client
    faisait tout seul sur son propre bouton et qu'un bouton a nous doit reproduire.
  */
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: BAND.bottom, right: clientEdges().right + 16 },
        flexDirection: 'column', alignItems: 'flex-end'
      }}
    >
      {/* Sa propre ligne, au-dessus de l'arc: sur la rangee elle chevauchait la bande d'avis. */}
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: 10 } }}><SellChip /></UiEntity>
      {/*
        Un arc, pas une ligne. Le pouce pivote depuis le bas a droite: sa course naturelle
        monte a mesure qu'elle s'eloigne, et trois boutons alignes obligent a tendre le doigt
        pour le plus lointain. Chacun est donc remonte selon sa distance au pivot, ce qui est
        la forme du pave que le client dessine lui-meme.
      */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-end', margin: { bottom: 10 } }}>
        <Pouce icone={volView.descend ? 'icon-glide' : 'icon-jump'} taille={POUCE} right={TAP.gap} haut={-46}
          actions={[InputAction.IA_JUMP]} />
        <Pouce icone={combatView.aiming ? 'icon-holster' : 'icon-gun'} taille={POUCE} right={TAP.gap} haut={-18}
          primaire={combatView.aiming} actions={[InputAction.IA_SECONDARY]} />
        <Pouce icone={questsToClaim() > 0 ? 'icon-menu-alert' : 'icon-menu'} taille={POUCE}
          badge={questsToClaim() > 0} onClick={basculerMenu} />
      </UiEntity>
      {a !== null && (
        <Pouce icone={combatView.aiming ? 'icon-fire' : (a.icon ?? 'icon-collect')} taille={POUCE_GROS}
          primaire actions={[InputAction.IA_PRIMARY]} />
      )}
    </UiEntity>
  )
}

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
      <SellChip right={TAP.gap * 2} />
      <Btn label="1  MENU" width={190} right={TAP.gap} badge={questsToClaim() > 0}
        primary={questsToClaim() > 0} onClick={basculerMenu} />
      <Btn label={combatView.aiming ? 'F  HOLSTER' : 'F  DRAW'} width={210} right={TAP.gap}
        primary={combatView.aiming} bind={[InputAction.IA_SECONDARY]} />
      {action !== null && (
        <Btn label={`E  ${action}`} width={300} primary bind={[InputAction.IA_PRIMARY]} />
      )}
    </UiEntity>
  )
}

/** Un pouce mesure environ 9 mm; ces tailles sont celles que le testeur a pu viser sans rater. */
const POUCE = 118
const POUCE_GROS = 168

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
  /*
    Almost everything here carries a picture, and the two exceptions are on purpose.

    The rule was written when COLLECT got its coins and then applied to nothing else, which
    left seven of eight actions still announcing themselves on a plate above the controls. A
    plate is furniture; a button that already exists is free. So building, recovering and
    opening take their own shapes, and only the carrying verbs keep words, because PUT IT
    DOWN, GIVE IT and DROP differ by where you are standing rather than by what you are doing,
    and three variations on an arrow at the size of a thumb would blur exactly the distinction
    that matters. They are also the shortest-lived state in the game, which is the one moment
    a word is worth its room.
  */
  if (slotView.active) {
    return slotView.valid ? { label: 'PLACE HERE', icon: 'icon-build', action: placeHere } : null
  }
  // A crate on the floor in front of you is smashed with the same button as everything else,
  // not only by clicking the crate itself: on a phone the click is a hunt, the button is a thumb.
  // And while that crate is in flight, result, reel or landing, the button offers nothing at
  // all: a fourth press in a rhythm used to open a second crate under the first one's reel.
  if (boxView.phase === 'smash') return { label: 'SMASH', icon: 'icon-crate', action: frapper }
  if (boxView.phase !== 'idle') return null
  /*
    Hands first, because full hands are the loudest fact about your situation.

    Where you are standing is what the verb turns out to be. Inside your own building it is
    putting something on a shelf; inside somebody else's it is a gift, which used to be a
    click on a plinth that no player ever found; anywhere else it is letting go, and it goes
    back where it came from.

    All three carry a picture, which they did not at first: they were left as words on the
    grounds that three arrows would blur, and that dropping an item by mistake is expensive.
    The worry was right and the conclusion wrong. What separates them is the DIRECTION plus
    whether anything waits underneath, two independent differences rather than one, and a
    picture on the button beats a plate on the screen every time.
  */
  if (carryView.code >= 0) {
    // A toy in hand at the fuser feeds the machine; that beats putting it on a shelf.
    if (fuserAPortee()) return { label: 'FEED THE FUSER', action: agirSurFuser }
    const ou = baseIci()
    if (ou === null) return { label: 'DROP', icon: 'icon-drop', action: dropCarried }
    return ou.mienne
      ? { label: 'PUT IT DOWN', icon: 'icon-place', action: () => placeDown(ou.ownerId) }
      : { label: 'GIVE IT', icon: 'icon-give', action: () => placeDown(ou.ownerId) }
  }
  if (theftView.canRecover) return { label: 'RECOVER', icon: 'icon-recover', action: recover }
  /*
    Setting a trap is a two-tap act, like placing the base: the first shows where, the second
    commits. It sits below the carry verbs because the genre forbids gear while carrying, and
    above building because a pocket with a trap in it is a state the player created on purpose
    a moment ago, which is exactly what this button is for.
  */
  if (gearView.placing >= 0) return { label: `SET ${GEARS[gearView.placing].name} HERE`, icon: 'icon-build', action: poserPiege }
  if (!theftView.basePosee) return { label: 'BUILD BASE', icon: 'icon-build', action: basculerPose }
  /*
    What the place offers, so the phone needs no interaction button at all.

    Every one of these was a click on a thing in the world, which on a handset is a hunt for
    a small pointer button and then a small target. The genre's mobile answer is the
    proximity prompt: stand at the thing and one button does it. So standing at the belt
    offers the nearest crate, by name and price; beside a convoy, the outbid; at the fuser,
    the fuser; near your own elevator, the climb; facing a shelf, the toy on it. The desktop
    keeps its clicks as well. Ordered by how deliberate the standing is: a belt or a convoy
    you walked to, an elevator you spam, a shelf you happen to face.
  */
  const caisse = caisseAPortee()
  if (caisse !== null) {
    return { label: `BUY ${crate(caisse.crateTier).name.toUpperCase()}  ${formatIncome(caisse.price)}`, icon: 'icon-crate', action: () => acheterCaisse(caisse.articleId) }
  }
  const convoi = convoiAPortee()
  if (convoi !== null && !convoi.mine) return { label: `OUTBID  ${formatIncome(convoi.price)}`, action: () => surencherir(convoi.convoyId) }
  if (fuserAPortee()) return { label: 'FUSER', action: agirSurFuser }
  if (ascenseurAPortee()) return { label: 'GO UP', action: monterIci }
  const pad = padEnFace()
  if (pad !== null && !pad.mine) return { label: `STEAL ${pad.nom}`, action: () => agirSurPad(pad) }
  if (boxView.stock.length > 0 && peutOuvrirIci()) {
    return { label: `OPEN ${boxView.stock.length}`, icon: 'icon-crate', action: openBestCrate }
  }
  // Your own shelf, below opening crates: at home the crate you carry is the louder intent.
  if (pad !== null && pad.mine) return { label: `PICK UP ${pad.nom}`, action: () => agirSurPad(pad) }
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
/** True once the wait has outrun the fifteen seconds the platform documents for a cold start. */
function attenteLongue(): boolean {
  return view.waitingSince !== 0 && Date.now() - view.waitingSince > 25_000
}

const WaitBar = () => {
  const attente = view.waitingSince === 0 ? 0 : Date.now() - view.waitingSince
  const part = 0.9 * (1 - Math.exp(-attente / 5000))
  return (
    <Barre pct={Math.round(part * 100)} hauteur={6} couleur={C.bonus} />
  )
}

/** A panel that takes the whole screen: nothing of the game draws behind it, not even tabs. */
function modale(): boolean {
  return welcomeView.open || prestigeView.open || fusionPanelView.open
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
    /*
      The reticle names the target at the crosshair and the weapon button wears the sight, so
      a line down here saying "FIRE on X" said it a third time (tester, 28 Aug: noise). What
      remains is a first-timer's nudge, shown for the first seconds of the first two draws of
      a session and never again: the guide's "players are there to play, not to read".
    */
    if (combatView.targetName !== '') return ''
    return combatView.aideVisee ? 'aim at someone' : ''
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

/**
 * The one ambient line, and the test every candidate for it has to pass.
 *
 * Two questions decide whether something belongs here. Is it time-critical, meaning it
 * changes on its own and the player loses something by not seeing it? And is it unavailable
 * anywhere else? A line that fails either is furniture, because permanent screen on a phone
 * is paid for out of the game.
 *
 * Two were removed on those grounds. "next floor at X" and "prestige at X" are prices that do
 * not move and now sit in the shop tab, where the player goes precisely to compare them.
 * A third, "place your base first", was a whole plate of its own saying what the tutorial says
 * in the top right corner and what the action button says under their thumb, with an icon, at
 * that very moment: the same instruction three times over, which is worse than not saying it.
 */
function hint(): string {
  if (slotView.active && !slotView.valid) return slotView.reason
  // Actionable: it says go home, and the crates are not doing anything until you do.
  if (boxView.stock.length > 0 && !peutOuvrirIci()) {
    return `${boxView.stock.length} crate${boxView.stock.length > 1 ? 's' : ''} waiting at your base`
  }
  // Time-critical, and said from the owner's side: what they own here is a protection, and
  // "base locked" describes the mechanism while reading like a fault on your own screen.
  if (theftView.lockSec > 0) return `your base is shielded for ${theftView.lockSec}s`
  if (theftView.rechargeSec > 0) return `shield ready in ${theftView.rechargeSec}s`
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

  /*
    The reticle says how much this shot is worth, and nothing new appears on screen to say it.

    A hit weakens with the square of the distance, which is the rule the whole chase now turns
    on, and a rule the player has to feel rather than be told. The place they are already
    looking while they aim is the sight itself, and a sight that opens up as the shot gets
    weaker is the one convention every shooter has taught them. So the four arms spread as the
    target gets further, and the colour drains with them: tight and red means this shot takes
    their loot, wide and pale means they are walking away with it.

    Nothing is added. The reticle was already on screen, and it was already saying nothing
    about the only thing it needed to say.
  */
  const force = locked ? forceDuTir(combatView.targetDist) : 1
  /*
    The kick and the marker, the two heartbeats every mobile shooter gives its sight. The
    arms jump outward for 120 ms after each round leaves; four gold points flash on the
    diagonals for 160 ms when a round LANDS. Both read from timestamps the combat layer
    stamps, so the reticle stays a pure function of state.
  */
  const now = Date.now()
  const kick = Math.max(0, 1 - (now - combatView.lastShotAt) / 120)
  const touche = now - combatView.lastHitAt < 160
  const gap = Math.round(8 + (1 - force) * 22 + kick * 7)
  const len = 12
  const th = 2
  const col = cold
    ? Color4.create(1, 1, 1, 0.22)
    : locked
      ? Color4.create(1, 0.36 + (1 - force) * 0.5, 0.36 + (1 - force) * 0.5, 0.35 + force * 0.65)
      : Color4.create(1, 1, 1, 0.7)

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
      {touche && [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => (
        <UiEntity key={'hm' + i}
          uiTransform={{
            width: 7, height: 7, positionType: 'absolute',
            position: { left: `${50 + dx * 2.2}%`, top: `${50 + dy * 3.4}%` }
          }}
          uiBackground={{ color: Color4.fromHexString('#ffd166ff') }} />
      ))}
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

/**
 * The reel: a strip of cards that decelerates onto the one you won.
 *
 * What the genre's openings share, from CS:GO's case to a mobile chest, is the delay: the
 * reveal is a drumroll, the outcome is decided before it starts, and every second of the
 * slowdown is the product. So the strip is wide (as much of the screen as the client leaves,
 * up to eight cards), the cards carry the toy itself rather than a name and a box, the run
 * grows with the rarity, a tick marks every card crossing the line, and the landing is a
 * flash in the winner's colour with the winning card popping while the rest go dim. The result
 * line sits inside the same panel, so the whole moment fits above the controls on a phone.
 *
 * Width is deliberately NOT `strip()`: that helper keeps clear of the client's furniture for
 * the full height of the screen, and this panel sits in a band (250 to 506 from the bottom)
 * where neither the joystick nor the action buttons are. Eighty pixels of margin, and a cap.
 */
function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * The reveal, centre stage. The reel below is the drumroll; THIS is the product, the way
 * the genre's lootboxes and idle games spend their whole screen on the moment: the room
 * dims, the won piece bursts huge over a fan of rays, name and yield under it, and the
 * whole thing melts away on the same clock as the panel. It blocks nothing: no handler,
 * so taps fall through to the game.
 */
function Revelation(): ReactEcs.JSX.Element {
  const depuis = Date.now() - boxView.gagneA
  const entree = Math.min(1, depuis / 160)
  const heroPop = easeOutBack(Math.min(1, depuis / 340))
  const sortie = Math.max(0, Math.min(1, (boxView.resultatJusqua - Date.now()) / 260))
  const gagneHex = itemColor(boxView.resultat, boxView.resultatMutation)
  const mut = mutation(boxView.resultatMutation)
  const rayon = (560 + 120 * heroPop) * entree
  const icone = 290 * heroPop
  const mid = active.h * 0.36
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { left: 0, top: 0 }, opacity: sortie }}>
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { left: 0, top: 0 } }}
        uiBackground={{ color: Color4.create(0, 0, 0, SURF.voile.a * 0.63 * entree) }} />
      {depuis < 900 && (
        <UiEntity
          uiTransform={{
            width: rayon, height: rayon, positionType: 'absolute',
            position: { left: active.w / 2 - rayon / 2, top: mid - rayon / 2 },
            opacity: Math.max(0, 1 - depuis / 900)
          }}
          uiBackground={{ texture: { src: 'assets/ui/burst.png' }, textureMode: 'stretch' }} />
      )}
      <UiEntity
        uiTransform={{
          width: icone, height: icone, positionType: 'absolute',
          position: { left: active.w / 2 - icone / 2, top: mid - icone / 2 }
        }}
        uiBackground={{ texture: { src: `assets/ui/toy-${boxView.resultat}.png` }, textureMode: 'stretch' }} />
      <UiEntity
        uiTransform={{
          width: '100%', positionType: 'absolute', position: { left: 0, top: mid + icone / 2 + 6 },
          flexDirection: 'column', alignItems: 'center'
        }}>
        <Label value={`${itemName(boxView.resultat, boxView.resultatMutation)}${boxView.resultatTraits > 0 ? ' +' + boxView.resultatTraits : ''}`.toUpperCase()}
          fontSize={TYPE.title} textWrap="nowrap" textAlign="middle-center"
          color={Color4.fromHexString(lisible(gagneHex) + 'ff')}
          uiTransform={{ height: 52 }} />
        <Label value={mut.mult > 1 ? `${mut.name.toUpperCase()}  x${mut.mult}  ·  +${formatIncome((INCOME_UI[boxView.resultat] ?? 1) * mut.mult)}/s` : `+${formatIncome(INCOME_UI[boxView.resultat] ?? 1)}/s`}
          fontSize={TYPE.body} textWrap="nowrap" textAlign="middle-center"
          color={C.money}
          uiTransform={{ height: 40 }} />
      </UiEntity>
    </UiEntity>
  )
}

function Roulette(): ReactEcs.JSX.Element {
  const large = Math.min(active.w - 80, 1700)
  const fini = !boxView.roule && boxView.resultat >= 0
  const depuis = fini ? Date.now() - boxView.gagneA : 0
  // The panel leaves on a fade instead of blinking out at its timer.
  const sortie = fini ? Math.max(0, Math.min(1, (boxView.resultatJusqua - Date.now()) / 260)) : 1
  const pop = fini ? easeOutBack(Math.min(1, depuis / 280)) : 0
  const flash = fini ? Math.max(0, 1 - depuis / 750) : 0
  const gagneHex = fini ? itemColor(boxView.resultat, boxView.resultatMutation) : '#ffffff'
  const gagne = Color4.fromHexString(gagneHex + 'ff')
  const mut = mutation(boxView.resultatMutation)
  const bande = REEL_H + 12
  return (
    <Centre bottom={250}>
      <UiEntity
        uiTransform={{ width: large, height: REEL_TITRE + bande, flexDirection: 'column', overflow: 'hidden', opacity: sortie }}
        uiBackground={SKIN.panel}
      >
        {flash > 0 && (
          <UiEntity
            uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { left: 0, top: 0 } }}
            uiBackground={{ color: Color4.create(gagne.r, gagne.g, gagne.b, 0.5 * flash) }} />
        )}

        <UiEntity uiTransform={{ width: '100%', height: REEL_TITRE, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          {fini && (
            <Label value={`${itemName(boxView.resultat, boxView.resultatMutation)}${boxView.resultatTraits > 0 ? ' +' + boxView.resultatTraits : ''}`.toUpperCase()}
              fontSize={TYPE.body} textWrap="nowrap" textAlign="middle-center"
              color={Color4.fromHexString(lisible(gagneHex) + 'ff')}
              uiTransform={{ height: REEL_TITRE, margin: { right: 24 } }} />
          )}
          {fini && (
            <Label value={ETATS[boxView.state]?.(boxView.resultat) ?? ''}
              fontSize={TYPE.label} textWrap="nowrap" textAlign="middle-center"
              color={boxView.state === 'expose' ? C.money : C.bonus}
              uiTransform={{ height: REEL_TITRE }} />
          )}
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: bande }}>
          {boxView.reel.map((r, i) => {
            const rar = RARITIES[r] ?? RARITIES[0]
            const gagnant = fini && i === REEL_WIN
            const s = gagnant ? 1 + 0.22 * pop : 1
            const w = REEL_W * s, h = REEL_H * s
            const x = large / 2 - w / 2 + (i - boxView.progres) * (REEL_W + REEL_GAP)
            if (x < -w || x > large) return null
            const brut = Color4.fromHexString(rar.color + 'ff')
            const texte = Color4.fromHexString(lisible(rar.color) + 'ff')
            // A card carries its rarity as a tint; the winner takes the full colour.
            const teinte = gagnant
              ? brut
              : Color4.create(0.55 + 0.45 * brut.r, 0.55 + 0.45 * brut.g, 0.55 + 0.45 * brut.b, 1)
            const mute = gagnant && mut.mult > 1
            return (
              <UiEntity key={i}
                uiTransform={{
                  width: w, height: h, positionType: 'absolute',
                  position: { left: x, top: (bande - h) / 2 },
                  flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: 8,
                  opacity: fini && !gagnant ? 0.42 : 1
                }}
                uiBackground={{ ...SKIN.card, color: teinte }}
              >
                <Label value={rar.name.toUpperCase()} fontSize={TYPE.caption} textWrap="nowrap"
                  color={gagnant ? C.name : texte}
                  uiTransform={{ width: '100%', height: 26 }} textAlign="middle-center" />
                <UiEntity
                  uiTransform={{ width: 118 * s, height: 118 * s }}
                  uiBackground={{ texture: { src: `assets/ui/toy-${r}.png` }, textureMode: 'stretch' }} />
                <Label
                  value={mute ? `${mut.name.toUpperCase()}  x${mut.mult}` : `+${formatIncome(INCOME_UI[r] ?? 1)}/s`}
                  fontSize={TYPE.caption} textWrap="nowrap"
                  color={mute ? Color4.fromHexString(lisible(mut.color) + 'ff') : C.money}
                  uiTransform={{ width: '100%', height: 26 }} textAlign="middle-center" />
              </UiEntity>
            )
          })}

          {/* The strip fades into the panel at both ends: cards arrive from beyond the window. */}
          <UiEntity
            uiTransform={{ width: 140, height: bande, positionType: 'absolute', position: { left: 0, top: 0 } }}
            uiBackground={{ texture: { src: 'assets/ui/fade-left.png' }, textureMode: 'stretch' }} />
          <UiEntity
            uiTransform={{ width: 140, height: bande, positionType: 'absolute', position: { right: 0, top: 0 } }}
            uiBackground={{ texture: { src: 'assets/ui/fade-right.png' }, textureMode: 'stretch' }} />

          {/* The selector, gone once the strip has stopped: the winner's pop says it instead. */}
          {!fini && (
            <UiEntity
              uiTransform={{ width: 5, height: bande, positionType: 'absolute', position: { left: large / 2 - 2.5, top: 0 } }}
              uiBackground={{ color: C.name }} />
          )}
        </UiEntity>
      </UiEntity>
    </Centre>
  )
}


const uiComponent = () => {
  // The alert clock reads this: an alert behind a screen keeps for when the screen goes.
  theftView.hudVisible = hud()
  /*
    The top band, resolved once per frame, in priority order.

    The money is permanent and leads. The tutorial step matters only until it is finished.
    A crowd bonus and a crate on the belt are moments. The feed is history, so it goes last
    and is the one dropped when the band is full.
  */
  const band = topBand([
    ['money', true, TYPE.hero + 6 + 34 + 6],
    ['event', ligneDuBandeau() !== null, 52],
    ['belt', beltView.annonce !== '', 58]
  ])
  /*
    What the game is waiting for, stacked above the controls, most urgent first.
  */
  const notice = noticeBand([
    ['stealing', theftView.stealing, 76],
    ['opening', boxView.opening, 76],
    ['carrying', carryView.code >= 0 && carryView.vole, 64],
  ])
  return (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>

    <Prechauffe />
    <DesktopControls />
    <PhoneControls />
    <WelcomePanel />
    <PrestigePanel />
    <FusionPanel />
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
          position: { top: coinDroit(0), right: COIN_HAUT_DROIT },
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

      And with the plate gone the width stopped being a surface and became a measuring frame:
      it obstructs nothing, so it costs nothing to be wide enough for the line underneath.
      Five hundred and sixty was inherited from the plate it replaced, and it was the reason
      the subtitle could not say what the multiplier was for. Measured against the atlas, the
      busiest line this can hold is 597 px; the frame is 760.
    */}
    {hud() && (
    <UiEntity
      uiTransform={{
        /*
          Six more than the two lines need: the wait bar draws below them while the server
          is silent, and a column sized to the text alone let it overflow onto the glyphs.
          The photograph read RECONNEC G, with the T, I and N under an orange line.
        */
        width: strip(760).width, height: TYPE.hero + 6 + 34 + 6, positionType: 'absolute',
        position: { top: band.money, left: '50%' }, margin: strip(760).margin,
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
      {/*
        A live counter, not a teleprompter. The displayed value chases the real one (fast
        lerp, snapped when close), the digits swell for a beat when money arrives, and the
        gain itself floats up beside them and vanishes: the standard grammar of every 2026
        mobile earner, built from the pieces already on screen.
      */}
      <UiEntity uiTransform={{ width: '100%', height: TYPE.hero + 6 }}>
        <Glyphs
          value={formatIncome(compteurAffiche())}
          size={Math.round(TYPE.hero * (1 + poussee() * 0.09))} role="money" align="center" box={strip(760).width} />
        {gainRecent() !== '' && (
          <UiEntity uiTransform={{
            width: 300, height: 40, positionType: 'absolute',
            position: { top: -26 - gainMonte() * 26, left: '50%' }, margin: { left: 170 }
          }}>
            <Glyphs value={gainRecent()} size={30} role="money" align="left" box={300} />
          </UiEntity>
        )}
      </UiEntity>
      {/*
        The line under it, in the same face for the same reason: no plate, so it has to
        carry its own contrast rather than borrow one.
      */}
      <UiEntity uiTransform={{ width: '100%', height: 34 }}>
        <Glyphs
          size={TYPE.label} align="center" box={strip(760).width}
          role={
            (!view.serverAlive || !theftView.basePosee || theftView.income === 0)
              ? 'bonus'
              : 'money'
          }
          value={
            !view.serverAlive
              /*
                A wait that outlives its own estimate has to say so.

                The bar approaches nine tenths and stops, on purpose, because the fifteen
                seconds it is drawn against is a documented figure and not a measurement of
                our server. That honesty becomes silence if the wait runs long: the player
                watches a bar that has not moved in half a minute and concludes it is stuck.
                Past twenty-five seconds the line stops repeating itself and admits the delay,
                which is the only thing left that is true.
              */
              ? (view.serverBooting
                  ? (attenteLongue() ? 'STILL STARTING, THIS ONE IS SLOW'
                    : intentEnAttente() ? 'STARTING UP, ACTION QUEUED' : 'STARTING UP')
                  : (intentEnAttente() ? 'RECONNECTING, ACTION QUEUED' : 'RECONNECTING'))
            : !theftView.basePosee ? 'PLACE YOUR BASE'
            : theftView.income === 0 ? 'OPEN A CRATE TO EARN'
            /*
                The rate, then the two things that multiply it, then the pool to be collected.

                The prestige multiplier used to sit on the BALANCE, glued to the coin total
                with no word beside it: `1.2M  x4`. It multiplies neither the balance nor
                anything else the player owns, it multiplies what comes in, and what comes in
                was on the line below. So the one number it acts on and the multiplier itself
                were on two different lines, in the wrong order, and the multiplier had no
                noun. Here it sits next to the rate it produced, in the same shape as the
                crowd bonus, which is the same kind of thing and was already written this way.
                `+340/S` already includes both, so the line reads as an explanation of the
                rate rather than a sum to be done.
              */
              : `+${formatIncome(theftView.income)}/S`
              + (theftView.multiplier > 1 ? `   x${theftView.multiplier} PRESTIGE` : '')
              + (theftView.prime > 0 ? `   +${Math.round(theftView.prime * 100)}% CROWD` : '')
              + (theftView.pending >= 1 ? `   ${formatIncome(theftView.pending)} BANKED` : '')
          } />
      </UiEntity>
      {!view.serverAlive && <WaitBar />}
    </UiEntity>
    )}

    {/*
      The crate being earned by simply being here, and how much of it is left.

      Nothing said this was coming: the game took fifteen minutes of somebody's attention and
      turned it into a surprise, when the same fifteen minutes shown as a filling bar is an
      anticipation the whole time. That is not decoration and it is not clutter, it is the
      product of the wait, and the research on progress indicators says plainly why it works:
      an unfinished bar reads as something to be finished, every time it is glanced at.

      Which is also a correction to how the rest of this screen was pruned. Two tests were
      used all evening, is it time-critical and is it available elsewhere, and both only ask
      whether an element WASTES the screen. Neither asks whether it EARNS it by showing
      progress towards something wanted. This one fails the first two and passes the third.
    */}
    {/* The next grand rush, as a chip: a standing fact, not an announcement. */}
    {hud() && prochainGrandTexte() !== null && (
      <UiEntity
        uiTransform={{
          height: 40, positionType: 'absolute', padding: { left: 16, right: 16 },
          position: { top: coinDroit(2), right: COIN_HAUT_DROIT },
          flexDirection: 'row', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label value={prochainGrandTexte() ?? ''} fontSize={TYPE.caption}
          color={Color4.fromHexString('#ffd166ff')} textWrap="nowrap" />
      </UiEntity>
    )}

    {hud() && cadeauView.leftS > 0 && (
      <UiEntity
        uiTransform={{
          width: 320, height: 52, positionType: 'absolute',
          position: { top: coinDroit(1), right: COIN_HAUT_DROIT },
          flexDirection: 'column', padding: { left: 14, right: 14, top: 6 }
        }}
        uiBackground={SKIN.panel}
      >
        <Label
          value={`FREE CRATE IN ${Math.floor(cadeauView.leftS / 60)}:${String(cadeauView.leftS % 60).padStart(2, '0')}`}
          fontSize={TYPE.caption} color={C.bonus}
          uiTransform={{ width: '100%', height: 26 }} textAlign="middle-left" textWrap="nowrap" />
        <Barre hauteur={8} couleur={C.bonus}
          pct={(1 - cadeauView.leftS / Math.max(1, cadeauView.totalS)) * 100} />
      </UiEntity>
    )}

    {/*
      The event feed lives in a corner, not across the middle of the play area.

      It was centred at the top, which is where the player is looking, for a stream of things
      that happened to other people somewhere else: the definition of what belongs in the
      periphery. It stacks under the tutorial step in the same right-hand corner, and takes
      that corner over once the tutorial is done with it.
    */}
    {hud() && filVisible().length > 0 && (
      <UiEntity
        uiTransform={{
          /*
            A row per line, a plate the size of the rows, and a left edge to read down.

            Each line was a Label with a width and NO HEIGHT, inside a column. Everywhere else
            in this interface a Label carries an explicit height, because text does not give
            this layout engine a size to lay out with: three lines all resolved to nothing and
            were painted at the same y, which is the illegible stack in the photograph. The
            plate was a fixed sixty-two whatever it held, so one line sat in a box built for
            three, and centring lines of different lengths turned a list into a shape.
          */
          width: 400, height: 16 + filVisible().length * FIL_LIGNE, positionType: 'absolute',
          position: { top: coinDroit(3), right: COIN_HAUT_DROIT },
          padding: 8, flexDirection: 'column', alignItems: 'flex-start'
        }}
        uiBackground={{ color: SURF.voile }}
      >
        {filVisible().map((l, i) => (
          <Label key={i} uiTransform={{ width: '100%', height: FIL_LIGNE }} textWrap="nowrap"
            textAlign="middle-left"
            value={l} fontSize={TYPE.caption} color={Color4.fromHexString('#b8c2d0ff')} />
        ))}
      </UiEntity>
    )}

    {/*
      A crate worth crossing the room for. One in about thirteen now, rather than one in
      four, so it is allowed to be loud; it is not allowed to be wider than its sentence.
    */}
    {/*
      The event clock: announced once in the player's gaze, then it lives here.

      Placement and shape follow the documented timer conveyance: after the initial prompt the
      timer moves to a permanent spot at the top, it carries iconography (the theme's name in
      the theme's colour is ours), and it is set apart from the rest of the HUD by that colour
      alone. It sits between the money and the belt line because it is the one thing on screen
      that ties the two together: this is why the belt is worth watching right now.
    */}
    {hud() && ligneDuBandeau() !== null && band.event >= 0 && (
      <Centre top={band.event}>
        <UiEntity
          uiTransform={{
            width: Math.min(strip(760).width, largeurTexte(ligneDuBandeau()?.text ?? '', TYPE.label) + 60),
            height: 64, justifyContent: 'center', alignItems: 'center'
          }}
          uiBackground={SKIN.panel}
        >
          <Label
            value={ligneDuBandeau()?.text ?? ''}
            fontSize={TYPE.label}
            color={Color4.fromHexString((ligneDuBandeau()?.color ?? '#ffffff') + 'ff')} textWrap="nowrap" />
        </UiEntity>
      </Centre>
    )}

    {hud() && beltView.annonce !== '' && band.belt >= 0 && (
      <Centre top={band.belt}>
        <UiEntity
          uiTransform={{
            width: Math.min(strip(860).width, largeurTexte(beltView.annonce, TYPE.label) + 64),
            height: 68, justifyContent: 'center', alignItems: 'center'
          }}
          uiBackground={SKIN.panel}
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
    {hud() && (boxView.roule || boxView.resultat >= 0) && Roulette()}
    {hud() && !boxView.roule && boxView.resultat >= 0 && Revelation()}




    {hud() && boxView.opening && (
      <UiEntity
        uiTransform={{
          width: strip(400).width, height: 76, positionType: 'absolute',
          flexDirection: 'column', padding: { top: 6, bottom: 6 },
          position: { bottom: notice.opening, left: '50%' }, margin: strip(400).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={SKIN.panel}
      >
        <Label uiTransform={{ width: '100%', height: 30 }} textWrap="nowrap" value={`SMASH THE CRATE  ${boxView.coups}/3`} fontSize={TYPE.body} color={C.bonus} textAlign="middle-center" />
        {/* Three segments that fill as the blows land: the chest-tap bar every reference shows. */}
        <UiEntity uiTransform={{ width: '86%', height: 10, margin: { top: 2 }, flexDirection: 'row', justifyContent: 'space-between' }}>
          {[0, 1, 2].map((k) => (
            <UiEntity key={`seg${k}`} uiTransform={{ width: '31%', height: 10, borderRadius: 5 }}
              uiBackground={{ color: pctAnime(`smash${k}`, boxView.coups > k ? 100 : 0) > 50 ? C.bonus : SURF.piste }} />
          ))}
        </UiEntity>
      </UiEntity>
    )}

    {hud() && theftView.stealing && (
      <UiEntity
        uiTransform={{
          width: strip(620).width, height: 76, positionType: 'absolute',
          position: { bottom: notice.stealing, left: '50%' }, margin: strip(620).margin,
          flexDirection: 'column', padding: 10
        }}
        uiBackground={SKIN.danger}
      >
        <Label
          value={`TAKING FROM ${theftView.stealTarget.toUpperCase()}  ·  ${(theftView.stealLeftMs / 1000).toFixed(1)}s`}
          fontSize={TYPE.label} color={Color4.fromHexString('#ff9b9bff')}
          uiTransform={{ width: '100%', height: 24 }} textAlign="middle-center" />
        <Barre hauteur={12} haut={4}
          pct={100 - (theftView.stealLeftMs / theftView.stealTotalMs) * 100}
          couleur={Color4.fromHexString('#ffd7d7ff')} />
        <Label value="stay close - walking away cancels it" fontSize={TYPE.caption}
          color={Color4.fromHexString('#c9a0a0ff')}
          uiTransform={{ width: '100%', height: 18 }} textAlign="middle-center" />
      </UiEntity>
    )}

    {/*
      Hauling stolen goods, and what it costs.

      More than half the carrier's speed goes into the load, and the only sign of it was
      being slow, which reads as nothing (owner, 1 Sep). The ring under the thief says it to
      everyone else; this says it to the thief, as a number, in the danger plate the theft
      panel already uses. It names the way out too: a state a player cannot end is a
      punishment, and one they can is a chase.
    */}
    {hud() && carryView.code >= 0 && carryView.vole && notice.carrying >= 0 && (
      <UiEntity
        uiTransform={{
          width: strip(560).width, height: 64, positionType: 'absolute',
          position: { bottom: notice.carrying, left: '50%' }, margin: strip(560).margin,
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={SKIN.danger}
      >
        <Label
          // The item is already in the thief's hand and named over their head; the line
          // carries what neither of those says, which is the cost and the way out.
          value={`STOLEN  ·  -${Math.round((1 - CARRY_STOLEN_SHARE) * 100)}% SPEED  ·  GET IT HOME`}
          fontSize={TYPE.label} color={Color4.fromHexString('#ffdcdcff')} textWrap="nowrap"
          uiTransform={{ width: '100%', height: 40 }} textAlign="middle-center" />
      </UiEntity>
    )}

    {/*
      The box grows with its text. It was seventy pixels for a title-size line, and several
      alerts carry two (a sentry, a rush gift); the second line ran past the panel and the
      third, when there was one, was simply not on screen. One line of height per line of
      text, and wide enough that a sum and a name fit on the first.
    */}
    {/*
      The toast stack: two at most, newest first, each sliding down into place and fading
      out at the end of its life, with its severity as a left accent bar. The colours were
      already the hierarchy (gold gain, red danger, grey info); the anatomy and the motion
      are what make it read as a system rather than a message that teleports.
    */}
    {hud() && alertesVisibles().length > 0 && (
      <UiEntity
        uiTransform={{
          width: strip(820).width, positionType: 'absolute',
          position: { top: '28%', left: '50%' }, margin: strip(820).margin,
          flexDirection: 'column', alignItems: 'center'
        }}
      >
        {alertesVisibles().map((a) => {
          const now = Date.now()
          const entree = Math.min(1, (now - a.ne) / 160)
          const sortie = Math.min(1, Math.max(0, (a.jusqua - now) / 250))
          // Wrapped lines, not newlines: this counted the latter and drew the former.
          const lignes = lignesDeTexte(a.t, TYPE.body, strip(820).width * 0.94 - 18)
          const h = 58 + (lignes - 1) * Math.round(TYPE.body * 1.35)
          return (
            <UiEntity key={`toast${a.ne}`}
              uiTransform={{
                width: '100%', height: h,
                margin: { top: Math.round(-(1 - entree) * 14), bottom: 10 },
                justifyContent: 'center', alignItems: 'center'
              }}
              uiBackground={SKIN.panel}
            >
              {/*
                The severity bar is gone, and it was never earning its place.

                A straight five-pixel rectangle laid on a plate whose corners are rounded by
                a third of its height and whose outline is six pixels thick: it crossed
                outside the shape at both ends, and the taller the box grew the worse it got
                (owner, 1 Sep). It was redundant besides. What it encoded, the kind of thing
                that just happened, is already carried by the colour of the text itself, so
                removing it costs the interface nothing and gives the plate its shape back.
              */}
              <Label uiTransform={{ width: '92%' }} value={a.t} fontSize={TYPE.body} textAlign="middle-center"
                color={(() => { const c = Color4.fromHexString(a.c + 'ff'); return Color4.create(c.r, c.g, c.b, sortie * entree) })()} />
            </UiEntity>
          )
        })}
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
