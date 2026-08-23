import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { view } from './client/setup'
import { crateView } from './client/crate'
import { theftView, verrouiller, reprendre, franchirPalier } from './client/theft'

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
    ReactEcsRenderer.setUiRenderer(uiComponent, { screenInset: inset })
    console.log(`[CLIENT] interface en screenInset '${inset}'`)
  }
  ReactEcsRenderer.setUiRenderer(uiComponent)
  engine.addSystem(choisir)
}

const PANNEAU = Color4.create(0, 0, 0, 0.62)

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>

    {/* HAUT-CENTRE: etat, non actionnable. */}
    <UiEntity
      uiTransform={{
        width: 360, height: 74, positionType: 'absolute',
        position: { top: 12, left: '50%' }, margin: { left: -180 },
        padding: 10, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center'
      }}
      uiBackground={{ color: PANNEAU }}
    >
      <Label value={`ma base: ${view.objets} objets · ${view.etages} etage${view.etages > 1 ? 's' : ''}`}
             fontSize={17} color={Color4.fromHexString('#ffd166ff')} />
      <Label value={`${theftView.coins} pieces${theftView.multiplicateur > 1 ? ' x' + theftView.multiplicateur : ''}${theftView.palier > 0 ? ' · palier ' + theftView.palier : ''}${view.serverAlive ? '' : ' · serveur silencieux'}`}
             fontSize={13} color={view.serverAlive ? Color4.fromHexString('#c8d0dcff') : Color4.Red()} />
    </UiEntity>

    {/* HAUT-CENTRE, sous l'etat: fil d'activite, non actionnable. */}
    {theftView.fil.length > 0 && (
      <UiEntity
        uiTransform={{
          width: 400, height: 62, positionType: 'absolute',
          position: { top: 92, left: '50%' }, margin: { left: -200 },
          padding: 8, flexDirection: 'column', alignItems: 'center'
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.42) }}
      >
        {theftView.fil.slice(0, 3).map((l, i) => (
          <Label key={i} value={l} fontSize={12} color={Color4.fromHexString('#b8c2d0ff')} />
        ))}
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

    {/* BAS-CENTRE, DECALE A GAUCHE: le coin bas-droit appartient au client.
        Voler ne passe plus par un bouton: on tape l'objet convoite. */}
    <UiEntity
      uiTransform={{
        width: 340, height: 58, positionType: 'absolute',
        position: { bottom: 24, left: '50%' }, margin: { left: -260 },
        flexDirection: 'row', justifyContent: 'space-between'
      }}
    >
      <Button uiTransform={{ width: 100, height: 54 }} value="PROTEGER" variant="primary" fontSize={14} onMouseDown={verrouiller} />
      <Button uiTransform={{ width: 100, height: 54 }} value="REPRENDRE" variant="secondary" fontSize={14} onMouseDown={reprendre} />
      {theftView.prochainPalier > 0 && (
        <Button
          uiTransform={{ width: 110, height: 54 }}
          value={theftView.coins >= theftView.prochainPalier ? 'PALIER !' : `${theftView.prochainPalier}`}
          variant={theftView.coins >= theftView.prochainPalier ? 'primary' : 'secondary'}
          fontSize={14}
          onMouseDown={franchirPalier}
        />
      )}
    </UiEntity>
  </UiEntity>
)
