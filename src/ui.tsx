import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { view } from './client/setup'
import { crateView } from './client/crate'
import { theftView, voler, verrouiller, reprendre } from './client/theft'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

/**
 * Toute action de jeu passe par un BOUTON, jamais par une visee precise:
 * l'entree mobile est tactile seule, sans survol ni clavier (doc `input-on-mobile`).
 * Le panneau descend de 110 px: le bandeau RELOAD SCENE de l'apercu occupe le coin.
 */
const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>

    {/* Alerte de vol: plein centre, couleur de la rarete perdue. */}
    {theftView.alerte !== '' && (
      <UiEntity
        uiTransform={{ width: 520, height: 64, positionType: 'absolute', position: { top: '18%', left: '50%' }, margin: { left: -260 }, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.82) }}
      >
        <Label value={theftView.alerte} fontSize={24} color={Color4.fromHexString(theftView.alerteCouleur + 'ff')} />
      </UiEntity>
    )}

    {/* Etat */}
    <UiEntity
      uiTransform={{ width: 320, height: 150, positionType: 'absolute', position: { top: 110, left: 24 }, padding: 12, flexDirection: 'column', justifyContent: 'space-between' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.65) }}
    >
      <Label value={`serveur: ${view.serverAlive ? 'VIVANT' : 'silencieux'}`} fontSize={12}
             color={view.serverAlive ? Color4.Green() : Color4.Red()} />
      <Label value={`caisse: ${crateView.hits} / ${crateView.maxHits}`} fontSize={15} color={Color4.White()} />
      <Label value={`objets: ${view.objets}`} fontSize={20} color={Color4.fromHexString('#ffd166ff')} />
      <Label value={theftView.malusJusqua > 0 ? 'MALUS VOLEUR actif' : (theftView.refus === '' ? '' : theftView.refus)}
             fontSize={12}
             color={theftView.malusJusqua > 0 ? Color4.fromHexString('#ff6060ff') : Color4.Gray()} />
    </UiEntity>

    {/* Fil d'activite: montre que le lieu est vivant meme sans personne connecte. */}
    <UiEntity
      uiTransform={{ width: 360, height: 96, positionType: 'absolute', position: { top: 110, right: 24 }, padding: 10, flexDirection: 'column' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
    >
      {theftView.fil.map((l, i) => (
        <Label key={i} value={l} fontSize={12} color={Color4.fromHexString('#c8d0dcff')} />
      ))}
    </UiEntity>

    {/* Actions, en bas, au pouce. */}
    <UiEntity
      uiTransform={{ width: 480, height: 62, positionType: 'absolute', position: { bottom: 96, left: '50%' }, margin: { left: -240 }, flexDirection: 'row', justifyContent: 'space-between' }}
    >
      <Button uiTransform={{ width: 150, height: 56 }} value="VOLER" variant="primary" fontSize={18} onMouseDown={voler} />
      <Button uiTransform={{ width: 150, height: 56 }} value="PROTEGER" variant="secondary" fontSize={18} onMouseDown={verrouiller} />
      <Button uiTransform={{ width: 150, height: 56 }} value="REPRENDRE" variant="secondary" fontSize={18} onMouseDown={reprendre} />
    </UiEntity>
  </UiEntity>
)
