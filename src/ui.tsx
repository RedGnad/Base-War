import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { view } from './client/setup'
import { theftView, verrouiller, reprendre, franchirPalier } from './client/theft'
import { beltView } from './client/belt'
import { boxView, ouvrirMeilleure } from './client/box'
import { RARITIES } from './shared/loot-table'

/** Miroir du bareme serveur, pour dire au joueur ce que son objet lui rapporte. */
const GAIN_PAR_SECONDE_UI = [1, 4, 16, 64, 256]
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
        width: 380, height: 88, positionType: 'absolute',
        position: { top: 12, left: '50%' }, margin: { left: -180 },
        padding: 10, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center'
      }}
      uiBackground={{ color: PANNEAU }}
    >
      <Label
        value={`${theftView.coins} pieces${theftView.multiplicateur > 1 ? '  x' + theftView.multiplicateur : ''}`}
        fontSize={30} color={Color4.fromHexString('#ffd166ff')} />
      <Label
        value={
          !view.serverAlive ? 'SERVEUR SILENCIEUX'
          : !theftView.basePosee ? 'pose ta base pour que tes objets rapportent'
          : theftView.revenu === 0 ? 'ouvre une boite pour commencer a gagner'
          : `+${theftView.revenu}/s · ${view.objets} objets · ${view.etages} etage${view.etages > 1 ? 's' : ''}${theftView.palier > 0 ? ' · palier ' + theftView.palier : ''}`
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
        <Label
          value={RARITIES[boxView.index]?.nom ?? ''}
          fontSize={boxView.roule ? 34 : 44}
          color={Color4.fromHexString((RARITIES[boxView.index]?.couleur ?? '#ffffff') + 'ff')} />
        <Label
          value={boxView.roule
            ? '...'
            : (boxView.message !== ''
                ? boxView.message
                : `+${GAIN_PAR_SECONDE_UI[boxView.resultat] ?? 1} pieces/s  ·  pose sur ta base`)}
          fontSize={15}
          color={Color4.fromHexString(boxView.message !== '' ? '#ff8080ff' : '#8fe08fff')} />
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
        <Label value={`FRAPPE LA BOITE  ${boxView.coups}/3`} fontSize={20} color={Color4.fromHexString('#ffd166ff')} />
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
        width: 560, height: 58, positionType: 'absolute',
        position: { bottom: 24, left: '50%' }, margin: { left: -370 },
        flexDirection: 'row', justifyContent: 'space-between'
      }}
    >
      <Button
        uiTransform={{ width: 120, height: 54 }}
        value={boxView.stock.length > 0 ? `OUVRIR (${boxView.stock.length})` : 'OUVRIR'}
        variant={boxView.stock.length > 0 ? 'primary' : 'secondary'}
        fontSize={14}
        onMouseDown={ouvrirMeilleure} />
      <Button uiTransform={{ width: 100, height: 54 }} value="PROTEGER" variant="secondary" fontSize={14} onMouseDown={verrouiller} />
      <Button uiTransform={{ width: 100, height: 54 }} value="REPRENDRE" variant="secondary" fontSize={14} onMouseDown={reprendre} />
      <Button
        uiTransform={{ width: 110, height: 54 }}
        value={slotView.actif ? (slotView.valide ? 'POSER' : 'X') : 'MA BASE'}
        variant={slotView.actif && slotView.valide ? 'primary' : 'secondary'}
        fontSize={14}
        onMouseDown={() => { if (!slotView.actif) basculerPose(); else if (slotView.valide) poserIci(); else basculerPose() }}
      />
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
