import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { view } from './client/setup'
import { crateView } from './client/crate'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      width: 340, height: 190,
      margin: '110px 0 0 24px', padding: 12,
      flexDirection: 'column', justifyContent: 'space-between'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.65) }}
  >
    <Label
      value={`serveur: ${view.serverAlive ? 'VIVANT' : 'silencieux'}`}
      fontSize={13}
      color={view.serverAlive ? Color4.Green() : Color4.Red()}
    />
    <Label value={`caisse: ${crateView.hits} / ${crateView.maxHits}`} fontSize={16} color={Color4.White()} />
    <Label
      value={crateView.dernierButin === '' ? 'aucun butin' : `dernier: ${crateView.dernierButin} (${crateView.dernierParQui})`}
      fontSize={14}
      color={Color4.fromHexString('#ffd166ff')}
    />
    <Label value={`objets: ${view.objets}`} fontSize={20} color={Color4.White()} />
    <Label
      value={`malus voleur: ${view.malusActif ? 'ACTIF' : 'inactif'}${crateView.refus === '' ? '' : ' · refus: ' + crateView.refus}`}
      fontSize={12}
      color={view.malusActif ? Color4.fromHexString('#ff6060ff') : Color4.Gray()}
    />
  </UiEntity>
)
