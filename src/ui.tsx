import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { view } from './client/setup'
import { theftView, verrouiller, reprendre, franchirPalier, acheterEtage, collecter } from './client/theft'
import { beltView } from './client/belt'
import { boxView, ouvrirMeilleure } from './client/box'
import { placementView } from './client/plots'
import { IndexPanel, indexView, basculerIndex } from './client/index-ui'
import { QuestsPanel, questsView, basculerQuests, quetesAPrendre } from './client/quests-ui'
import { WelcomePanel } from './client/welcome'
import { revendre } from './client/theft'
import { RARITIES, nomObjet, couleurObjet, mutation, formatRevenu } from './shared/loot-table'

/** Miroir du bareme serveur, pour dire au joueur ce que son objet lui rapporte. */
const GAIN_PAR_SECONDE_UI = [1, 4, 16, 64, 256, 1024, 4096]

/** Ce qu'on dit au joueur selon ce qui est REELLEMENT arrive a son objet. */
const ETATS: Record<string, (r: number) => string> = {
  expose: (r) => `+${GAIN_PAR_SECONDE_UI[r] ?? 1} coins/s  ·  placed on your base`,
  'en-stock': () => 'kept in stock  ·  BUILD YOUR BASE to earn from it',
  plein: () => 'your base is full  ·  make room'
}
import { slotView, basculerPose, poserIci } from './client/slots'

/**
 * DISPOSITION DICTEE PAR LA DOC MOBILE (`build-for-mobile/develop/safe-area`), pas par
 * l'esthetique. La zone sure est le **motif de rejet numero un** cite par Decentraland.
 *
 * Ce que le client mobile s'approprie, et qu'on doit fuir:
 *  - COLONNE DE GAUCHE: chat, profil, joystick, emotes -> exclue de la zone interactable
 *  - COIN BAS-DROIT: boutons d'action, dessines PAR-DESSUS meme la zone interactable
 *  - COIN HAUT-DROIT: profil et controles camera, une UI collee la se lit comme du HUD client
 *
 * Emplacements prescrits, et ce qu'on y met:
 *  - centre: dialogues actionnables         -> l'alerte de vol
 *  - haut-centre: messages non actionnables -> etat et fil d'activite
 *  - bas-centre: indices contextuels        -> les deux boutons, decales a GAUCHE du centre
 */
export function setupUi() {
  // `interactable` n'est PAS neutre sur desktop (le client y reserve ~25 % a gauche),
  // donc on ne l'applique QUE sur telephone. La plateforme n'est pas connue au premier
  // tick: on attend qu'elle le soit avant de choisir.
  function choisir(): void {
    if (getPlatform() === null) return
    engine.removeSystem(choisir)
    const inset = isMobile() ? 'interactable' : 'device'
    // ECRAN VIRTUEL EPINGLE. Sans lui, la taille de reference depend de la plateforme
    // (1920x1080 desktop, 1600x720 mobile) et nos valeurs en pixels changent de sens
    // d'un appareil a l'autre. On l'ecrit pour que la mise en page soit intentionnelle.
    ReactEcsRenderer.setUiRenderer(uiComponent, {
      virtualWidth: 1920, virtualHeight: 1080, screenInset: inset
    })
    console.log(`[CLIENT] interface en screenInset '${inset}'`)
  }
  ReactEcsRenderer.setUiRenderer(uiComponent, { virtualWidth: 1920, virtualHeight: 1080 })
  engine.addSystem(choisir)
}

const PANNEAU = Color4.create(0, 0, 0, 0.62)

/**
 * UNE SEULE action affichee a la fois, choisie par ORDRE D'URGENCE.
 * C'est la divulgation progressive: le joueur n'a jamais a choisir entre huit boutons,
 * on lui montre celui qui compte maintenant. L'ordre encode la boucle du jeu.
 */
function prochaineAction(): { libelle: string; pret: boolean; action: () => void } {
  // LE MODE DE POSE PASSE EN PREMIER. Bug corrige le 24 Aug: le test « sans base »
  // venait avant, donc le bouton affichait encore BUILD BASE une fois le mode actif et
  // rappelait la bascule, qui l'eteignait. On ne pouvait JAMAIS atteindre PLACE HERE.
  // Un etat MODAL doit toujours etre teste avant les etats de fond.
  if (slotView.actif) {
    return slotView.valide
      ? { libelle: 'PLACE HERE', pret: true, action: poserIci }
      : { libelle: slotView.raison.toUpperCase(), pret: false, action: basculerPose }
  }
  // reprendre un vol passe avant tout: la fenetre est courte
  if (theftView.aReprendre) return { libelle: 'RECOVER!', pret: true, action: reprendre }
  // sans base, rien ne rapporte
  if (!theftView.basePosee) return { libelle: 'BUILD BASE', pret: true, action: basculerPose }
  // une boite non ouverte est une recompense qui attend
  if (boxView.stock.length > 0) return { libelle: `OPEN (${boxView.stock.length})`, pret: true, action: ouvrirMeilleure }
  // puis les achats, le moins cher d'abord
  if (theftView.prixEtage > 0 && theftView.coins >= theftView.prixEtage) {
    return { libelle: '+1 FLOOR', pret: true, action: acheterEtage }
  }
  if (theftView.prochainPalier > 0 && theftView.coins >= theftView.prochainPalier) {
    return { libelle: `PRESTIGE x${theftView.multiplicateur + 1}`, pret: true, action: franchirPalier }
  }
  // rien d'urgent: on annonce le prochain palier atteignable
  if (theftView.prixEtage > 0) return { libelle: `FLOOR ${formatRevenu(theftView.prixEtage)}`, pret: false, action: acheterEtage }
  if (theftView.prochainPalier > 0) return { libelle: `PRESTIGE ${formatRevenu(theftView.prochainPalier)}`, pret: false, action: franchirPalier }
  return { libelle: 'MOVE BASE', pret: false, action: basculerPose }
}

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>

    <WelcomePanel />
    <IndexPanel />
    <QuestsPanel />

    {/* Bouton d'index, en haut a droite mais DANS la zone sure: le coin lui-meme
        appartient au profil et aux controles camera du client mobile. */}
    <UiEntity
      uiTransform={{
        width: 240, height: 36, positionType: 'absolute', position: { top: 12, right: 24 },
        flexDirection: 'row', justifyContent: 'flex-end'
      }}
    >
      {/* Le compteur du bouton porte le NOMBRE DE QUETES A ENCAISSER, pas le nombre de
          quetes. Un badge qui affiche « 3 » en permanence n'appelle a rien; un badge qui
          passe a 1 quand quelque chose attend est la seule raison d'ouvrir le panneau. */}
      <Button
        uiTransform={{ width: 118, height: 36, margin: { right: 6 } }}
        value={questsView.ouvert ? 'CLOSE' : (quetesAPrendre() > 0 ? `GOALS  ${quetesAPrendre()} !` : 'GOALS')}
        variant={questsView.ouvert || quetesAPrendre() > 0 ? 'primary' : 'secondary'}
        fontSize={12}
        onMouseDown={basculerQuests} />
      <Button
        uiTransform={{ width: 108, height: 36 }}
        value={indexView.ouvert ? 'CLOSE' : `INDEX ${indexView.vus.length}`}
        variant={indexView.ouvert ? 'primary' : 'secondary'}
        fontSize={12}
        onMouseDown={basculerIndex} />
    </UiEntity>

    {/* HAUT-CENTRE: etat, non actionnable. */}
    <UiEntity
      uiTransform={{
        width: 380, height: 88, positionType: 'absolute',
        position: { top: 12, left: '50%' }, margin: { left: -180 },
        padding: 10, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center'
      }}
      uiBackground={{ color: PANNEAU }}
    >
      <Label
        value={`${formatRevenu(theftView.coins)} coins${theftView.multiplicateur > 1 ? '  x' + theftView.multiplicateur : ''}`}
        fontSize={30} color={Color4.fromHexString('#ffd166ff')} />
      <Label
        value={
          !view.serverAlive ? 'SERVER OFFLINE'
          : !theftView.basePosee ? 'place your base so your loot earns'
          : theftView.revenu === 0 ? 'open a crate to start earning'
          // On MONTRE la reserve qui se remplit: sans ca, le bouton COLLECT sort de
          // nulle part et personne ne comprend d'ou vient l'argent.
          : `+${formatRevenu(theftView.revenu)}/s  →  ${formatRevenu(theftView.reserve)} waiting  ·  ${view.objets} items · ${view.etages} floor${view.etages > 1 ? 's' : ''}${theftView.palier > 0 ? ' · prestige ' + theftView.palier : ''}`
        }
        fontSize={13}
        color={
          !view.serverAlive ? Color4.Red()
          : (!theftView.basePosee || theftView.revenu === 0) ? Color4.fromHexString('#ffd166ff')
          : Color4.fromHexString('#8fe08fff')
        } />
    </UiEntity>

    {/* HAUT-CENTRE, sous l'etat: fil d'activite, non actionnable. */}
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

    {/* HAUT-CENTRE: l'annonce du tapis. Non actionnable, mais elle doit faire lever la tete. */}
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

    {/* CENTRE: LA ROULETTE. Le moment du jeu: elle defile, ralentit, s'arrete. */}
    {(boxView.roule || boxView.resultat >= 0) && (
      <UiEntity
        uiTransform={{
          width: 460, height: 130, positionType: 'absolute',
          position: { top: '34%', left: '50%' }, margin: { left: -230 },
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.88) }}
      >
        {/* Pendant la roulette on ne montre que la rarete qui defile; a l'arret on
            revele le NOM COMPLET, mutation comprise: « Gold Epic » se lit autrement
            qu'« Epic », et c'est la toute la surprise composee. */}
        <Label
          value={boxView.roule
            ? (RARITIES[boxView.index]?.nom ?? '')
            : nomObjet(boxView.resultat, boxView.resultatMutation)}
          fontSize={boxView.roule ? 32 : (mutation(boxView.resultatMutation).mult > 1 ? 38 : 44)}
          color={Color4.fromHexString(
            (boxView.roule
              ? (RARITIES[boxView.index]?.couleur ?? '#ffffff')
              : couleurObjet(boxView.resultat, boxView.resultatMutation)) + 'ff')} />
        <Label
          value={boxView.roule ? '...' : ETATS[boxView.etat]?.(boxView.resultat) ?? ''}
          fontSize={15}
          color={Color4.fromHexString(boxView.etat === 'expose' ? '#8fe08fff' : '#ffd166ff')} />
      </UiEntity>
    )}

    {/* Rappel AVANT d'ouvrir: sans base, l'objet ne rapportera rien. On previent
        plutot que d'interdire: bloquer un joueur qui veut juste voir sa boite serait pire. */}
    {!theftView.basePosee && boxView.stock.length > 0 && !boxView.ouverture && !boxView.roule && (
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

    {/* Un objet selectionne: on dit quoi faire, et on offre la revente ici. Sans ce
        rappel, taper son propre objet parait sans effet. */}
    {placementView.selection >= 0 && (
      <UiEntity
        uiTransform={{
          width: 460, height: 46, positionType: 'absolute',
          position: { bottom: 150, left: '50%' }, margin: { left: -230 },
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          padding: 6
        }}
        uiBackground={{ color: Color4.create(0.05, 0.12, 0.05, 0.85) }}
      >
        <Label value="tap another slot to move it" fontSize={14} color={Color4.fromHexString('#8fe08fff')} />
        <Button
          uiTransform={{ width: 110, height: 34 }}
          value="SELL IT" variant="secondary" fontSize={13}
          onMouseDown={() => { revendre(placementView.selection); placementView.selection = -1 }} />
      </UiEntity>
    )}

    {/* CENTRE-BAS: les trois coups. */}
    {boxView.ouverture && (
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

    {/* CENTRE: l'alerte, seule chose qui exige une reaction. */}
    {theftView.alerte !== '' && (
      <UiEntity
        uiTransform={{
          width: 520, height: 70, positionType: 'absolute',
          position: { top: '42%', left: '50%' }, margin: { left: -260 },
          justifyContent: 'center', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
      >
        <Label value={theftView.alerte} fontSize={23} color={Color4.fromHexString(theftView.alerteCouleur + 'ff')} />
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
        un bouton ecarterait les deux autres aux extremites et la barre bougerait sous
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
      {theftView.reserve > 0 && !slotView.actif && (
        <Button
          uiTransform={{ width: 160, height: 58, margin: { right: 10 } }}
          value={`COLLECT ${formatRevenu(theftView.reserve)}`}
          variant="primary"
          fontSize={15}
          onMouseDown={collecter} />
      )}

      {/* 2. UNE seule action selon l'etat, par ordre d'urgence. Toujours presente:
             c'est elle qui porte le pas suivant, jusqu'a BUILD BASE au tout debut. */}
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
             150 s pour proteger zero objet. Il apparait donc au moment exact ou le
             joueur a quelque chose a perdre, ce qui l'explique tout seul.
             Cache aussi pendant la pose: un etat modal ne garde que son propre geste. */}
      {theftView.basePosee && view.objets > 0 && !slotView.actif && (
        <Button
          uiTransform={{ width: 140, height: 58 }}
          value={
            theftView.verrouSec > 0 ? `LOCKED ${theftView.verrouSec}s`
            : theftView.rechargeSec > 0 ? `WAIT ${theftView.rechargeSec}s`
            : 'LOCK'
          }
          variant={theftView.verrouSec === 0 && theftView.rechargeSec === 0 ? 'primary' : 'secondary'}
          fontSize={14}
          onMouseDown={verrouiller} />
      )}
    </UiEntity>
  </UiEntity>
)
