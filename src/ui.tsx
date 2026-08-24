import { PRODUCTION_PER_RARITY } from './shared/economy'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { view } from './client/setup'
import { theftView, lockBase, recover, doPrestige, buyFloorFor, collectPending, armSentry } from './client/theft'
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

function prochaineAction(): { libelle: string; pret: boolean; action: () => void } {
  if (slotView.active) {
    return slotView.valid
      ? { libelle: 'PLACE HERE', pret: true, action: placeHere }
      : { libelle: slotView.reason.toUpperCase(), pret: false, action: basculerPose }
  }
  if (theftView.canRecover) return { libelle: 'RECOVER!', pret: true, action: recover }
  if (!theftView.basePosee) return { libelle: 'BUILD BASE', pret: true, action: basculerPose }
  if (boxView.stock.length > 0) return { libelle: `OPEN (${boxView.stock.length})`, pret: true, action: openBestCrate }
  if (theftView.basePosee && view.items > 0 && theftView.sentries === 0
      && theftView.sentryPrice > 0 && theftView.coins >= theftView.sentryPrice) {
    return { libelle: `SENTRY ${formatIncome(theftView.sentryPrice)}`, pret: true, action: armSentry }
  }
  if (theftView.floorPrice > 0 && theftView.coins >= theftView.floorPrice) {
    return { libelle: '+1 FLOOR', pret: true, action: buyFloorFor }
  }
  if (theftView.nextPrestige > 0 && theftView.coins >= theftView.nextPrestige) {
    return { libelle: `PRESTIGE x${theftView.multiplier + 1}`, pret: true, action: doPrestige }
  }
  if (theftView.basePosee && view.items > 0 && theftView.sentries === 0 && theftView.sentryPrice > 0
      && (theftView.floorPrice === 0 || theftView.sentryPrice <= theftView.floorPrice)) {
    return { libelle: `SENTRY ${formatIncome(theftView.sentryPrice)}`, pret: false, action: armSentry }
  }
  if (theftView.floorPrice > 0) return { libelle: `FLOOR ${formatIncome(theftView.floorPrice)}`, pret: false, action: buyFloorFor }
  if (theftView.nextPrestige > 0) return { libelle: `PRESTIGE ${formatIncome(theftView.nextPrestige)}`, pret: false, action: doPrestige }
  return { libelle: 'ALL MAXED', pret: false, action: () => {} }
}

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>

    <WelcomePanel />
    {!welcomeView.open && <IndexPanel />}
    {!welcomeView.open && <QuestsPanel />}

    {/* Bouton d'index, en haut a droite mais DANS la zone sure: le coin lui-meme
        appartient au profil et aux controles camera du client mobile. */}
    {!welcomeView.open && (
    <UiEntity
      uiTransform={{
        width: 260, height: 36, positionType: 'absolute', position: { top: 12, right: 24 },
        flexDirection: 'row', justifyContent: 'flex-end'
      }}
    >
      {/* LES ONGLETS n'apparaissent QUE menu open: fermes, ils seraient deux boutons
          permanents de plus, c'est-a-dire le probleme qu'on vient de resoudre. */}
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

    {/* GAUCHE: LE TUTORIEL, tant qu'il reste une etape.
        Il ne se lit pas, il se SUIT: le serveur n'avance l'etape que quand l'action a
        reellement eu lieu, donc la carte dit toujours le geste suivant et rien d'autre.
        Elle disparait a la derniere etape: un tutoriel qui reste apres avoir servi
        devient du decor, et le decor ne se lit plus. */}
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

    {/* PRIME DE PRESENCE. Elle ne s'affiche QUE quand elle vaut quelque chose, donc
        seulement quand quelqu'un d'autre est la. Affichee en permanence a +0 %, elle
        dirait surtout « tu es seul », ce qui est le contraire du but. */}
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

    {/* VOYAGE, REPLIE. Un bouton, et les destinations n'apparaissent qu'a la demande.
        Le lieu fait 80 m et un juge a trois minutes: marcher n'est pas du gameplay ici.
        Mais trois boutons permanents pour des gestes rares, c'est trois choses a lire en
        permanence, et la lisibilite est notee (Mobile UX, un tiers des 43 %). */}
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

    {/* HAUT-CENTER: etat, non actionnable. */}
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

    {/* HAUT-CENTER, sous l'etat: fil d'activite, non actionnable. */}
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

    {/* HAUT-CENTER: l'annonce du tapis. Non actionnable, mais elle doit faire lever la head. */}
    {beltView.annonce !== '' && (
      <UiEntity
        uiTransform={{
          width: 420, height: 44, positionType: 'absolute',
          position: { top: 176, left: '50%' }, margin: { left: -210 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0.10, 0.08, 0.02, 0.85) }}
      >
        <Label value={beltView.annonce} fontSize={19} color={Color4.fromHexString('#f5a524ff')} />
      </UiEntity>
    )}

    {/* CENTER: LA ROULETTE. Le moment du jeu: elle defile, ralentit, s'arrete. */}
    {(boxView.roule || boxView.resultat >= 0) && (
      <UiEntity
        uiTransform={{
          width: 460, height: 130, positionType: 'absolute',
          position: { top: '34%', left: '50%' }, margin: { left: -230 },
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.88) }}
      >
        {/* Pendant la roulette on ne montre que la rarity qui defile; a l'arret on
            revele le NOM COMPLET, mutation comprise: « Gold Epic » se lit autrement
            qu'« Epic », et c'est la toute la surprise composee. */}
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
          value={boxView.roule ? '...' : ETATS[boxView.etat]?.(boxView.resultat) ?? ''}
          fontSize={15}
          color={Color4.fromHexString(boxView.etat === 'expose' ? '#8fe08fff' : '#ffd166ff')} />
      </UiEntity>
    )}

    {/* Rappel AVANT d'ouvrir: sans base, l'item ne rapportera rien. On previent
        plutot que d'interdire: bloquer un joueur qui veut juste voir sa crate serait pire. */}
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

    {/* Un item selectionne: on dit quoi faire, et on offre la revente ici. Sans ce
        rappel, taper son propre item parait sans effet. */}
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

    {/* CENTER-BAS: les trois coups. */}
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

    {/* CENTER: l'alerte, seule chose qui exige une reaction. */}
    {theftView.alerte !== '' && (
      <UiEntity
        uiTransform={{
          width: 520, height: 70, positionType: 'absolute',
          position: { top: '42%', left: '50%' }, margin: { left: -260 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      >
        <Label value={theftView.alerte} fontSize={23} color={Color4.fromHexString(theftView.alertColor + 'ff')} />
      </UiEntity>
    )}

    {/* BARRE D'ACTION CONTEXTUELLE.
        « Minimize options. Show only what the player needs right now and progressively
        disclose the rest. » Nous en avions HUIT en permanence: illisible, et sur un
        telephone chaque bouton mange un pouce.
        REGLE TENUE PARTOUT ICI: on n'affiche JAMAIS un bouton avec lequel le joueur ne
        peut rien faire. Un bouton mort n'est pas neutre, il occupe un pouce, il attire
        le regard, et il oblige a deviner ce qu'il veut dire.
        Les boutons sont ranges A GAUCHE avec un ecart fixe: en `space-between`, retirer
        un bouton ecarterait les deux autres aux extremites et la bar bougerait sous
        les doigts d'un tap a l'autre.
        Decalee a gauche: le coin bas-droit appartient aux boutons du client mobile. */}
    <UiEntity
      uiTransform={{
        width: 470, height: 62, positionType: 'absolute',
        position: { bottom: 24, left: '50%' }, margin: { left: -320 },
        flexDirection: 'row', justifyContent: 'flex-start'
      }}
    >
      {/* 1. COLLECT: seulement s'il y a quelque chose a encaisser. */}
      {theftView.pending > 0 && !slotView.active && (
        <Button
          uiTransform={{ width: 160, height: 58, margin: { right: 10 } }}
          value={`COLLECT ${formatIncome(theftView.pending)}`}
          variant="primary"
          fontSize={15}
          onMouseDown={collectPending} />
      )}

      {/* 2. UNE seule action selon l'etat, par ordre d'urgence. Toujours presente:
             c'est elle qui door le pas suivant, jusqu'a BUILD BASE au tout debut. */}
      {(() => {
        const a = prochaineAction()
        return (
          <Button
            uiTransform={{ width: 160, height: 58, margin: { right: 10 } }}
            value={a.libelle} variant={a.pret ? 'primary' : 'secondary'}
            fontSize={15} onMouseDown={a.action} />
        )
      })()}

      {/* 3. LOCK: seulement quand il y a une base ET quelque chose dedans.
             Sans base il ne protege rien; base vide, il gaspillerait sa recharge de
             150 s pour proteger zero item. Il apparait donc au moment exact ou le
             joueur a quelque chose a perdre, ce qui l'explique tout seul.
             Cache aussi pendant la pose: un etat modal ne keeps que son propre geste. */}
      {theftView.basePosee && view.items > 0 && !slotView.active && (
        <Button
          uiTransform={{ width: 140, height: 58 }}
          value={
            theftView.lockSec > 0 ? `LOCKED ${theftView.lockSec}s`
            : theftView.rechargeSec > 0 ? `WAIT ${theftView.rechargeSec}s`
            : 'LOCK'
          }
          variant={theftView.lockSec === 0 && theftView.rechargeSec === 0 ? 'primary' : 'secondary'}
          fontSize={14}
          onMouseDown={lockBase} />
      )}
    </UiEntity>
  </UiEntity>
)
