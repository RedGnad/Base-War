import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { view } from './client/setup'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      width: 320,
      height: 168,
      margin: '24px 0 0 24px',
      padding: 10,
      flexDirection: 'column',
      justifyContent: 'space-between'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.65) }}
  >
    <Label value="SPIKE 1.1 — Storage" fontSize={16} color={Color4.White()} />
    <Label
      value={`serveur: ${view.serverAlive ? 'VIVANT' : 'silencieux'}`}
      fontSize={14}
      color={view.serverAlive ? Color4.Green() : Color4.Red()}
    />
    <Label value={`taps envoyes: ${view.taps}`} fontSize={14} color={Color4.White()} />
    <Label
      value={`malus voleur: ${view.malusActif ? 'ACTIF (jog 4.7 / saut 0.6)' : 'inactif (jog 8 / saut 1)'}`}
      fontSize={13}
      color={view.malusActif ? Color4.fromHexString('#ff6060ff') : Color4.Gray()}
    />
    <Label
      value={`compteur serveur: ${view.count}`}
      fontSize={22}
      color={Color4.fromHexString('#ffd166ff')}
    />
  </UiEntity>
)
