import ReactEcs, { Button, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { QUESTS } from '../shared/quests'
import { DAILY_REWARDS } from '../shared/schemas'
import { crate } from '../shared/loot-table'
import { closeMenu } from './menu'

export const questsView = {
  open: false,
  ids: [] as number[],
  progres: [] as number[],
  cibles: [] as number[],
  pris: [] as number[],
  log: 1,
  dayClaimed: false
}

export function setupQuests(): void {
  room.onMessage('quests', (d) => {
    questsView.ids = [...d.ids]
    questsView.progres = [...d.progres]
    questsView.cibles = [...d.cibles]
    questsView.pris = [...d.pris]
    questsView.log = d.log
    questsView.dayClaimed = d.dayClaimed
  })
}

function reclamer(slot: number): void { void room.send('claimQuest', { slot }) }

export function questsToClaim(): number {
  let n = 0
  for (let i = 0; i < questsView.ids.length; i++) {
    if (questsView.progres[i] >= questsView.cibles[i] && questsView.pris[i] !== 1) n++
  }
  if (n === 0 && toutesFinies() && questsView.pris[3] !== 1) n = 1
  return n
}

function toutesFinies(): boolean {
  if (questsView.ids.length === 0) return false
  for (let i = 0; i < questsView.ids.length; i++) {
    if (questsView.progres[i] < questsView.cibles[i]) return false
  }
  return true
}

function Ligne(props: { i: number }): ReactEcs.JSX.Element {
  const i = props.i
  const q = QUESTS[questsView.ids[i]]
  const fait = questsView.progres[i] ?? 0
  const cible = questsView.cibles[i] ?? 1
  const fini = fait >= cible
  const pris = questsView.pris[i] === 1
  const pct = Math.min(100, Math.round((fait / cible) * 100))
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: 62, flexDirection: 'row', alignItems: 'center', margin: { bottom: 8 } }}
    >
      <UiEntity uiTransform={{ width: 300, height: 54, flexDirection: 'column', justifyContent: 'center' }}>
        <Label value={q?.texte ?? ''} fontSize={15}
          color={pris ? Color4.fromHexString('#6f7a6fff') : Color4.White()}
          uiTransform={{ width: '100%', height: 22 }} textAlign="middle-left" />
        {/* rail */}
        <UiEntity
          uiTransform={{ width: 290, height: 12, margin: { top: 2 } }}
          uiBackground={{ color: Color4.create(1, 1, 1, 0.12) }}
        >
          <UiEntity
            uiTransform={{ width: `${pct}%`, height: 12 }}
            uiBackground={{ color: fini ? Color4.fromHexString('#8fe08fff') : Color4.fromHexString('#4dd2ffff') }}
          />
        </UiEntity>
      </UiEntity>
      <Label value={`${fait}/${cible}`} fontSize={14}
        color={Color4.fromHexString('#a8b2c0ff')}
        uiTransform={{ width: 70, height: 54 }} textAlign="middle-center" />
      {pris ? (
        <Label value="CLAIMED" fontSize={13} color={Color4.fromHexString('#6f7a6fff')}
          uiTransform={{ width: 110, height: 40 }} textAlign="middle-center" />
      ) : (
        <Button
          uiTransform={{ width: 110, height: 40 }}
          value={fini ? 'CLAIM' : `+1 crate`}
          variant={fini ? 'primary' : 'secondary'}
          fontSize={13}
          onMouseDown={() => { if (fini) reclamer(i) }} />
      )}
    </UiEntity>
  )
}

export function QuestsPanel(): ReactEcs.JSX.Element | null {
  if (!questsView.open) return null
  const tout = toutesFinies()
  return (
    <UiEntity
      uiTransform={{
        width: 640, height: 430, positionType: 'absolute',
        position: { top: '50%', left: '50%' }, margin: { left: -320, top: -215 },
        flexDirection: 'column', padding: 18
      }}
      uiBackground={{ color: Color4.create(0.04, 0.05, 0.09, 0.95) }}
    >
      <Label value="DAILY OBJECTIVES" fontSize={22} color={Color4.fromHexString('#ffd166ff')}
        uiTransform={{ width: '100%', height: 30 }} textAlign="middle-left" />
      <Label value="resets every day at 00:00 UTC" fontSize={13} color={Color4.fromHexString('#7d879bff')}
        uiTransform={{ width: '100%', height: 20, margin: { bottom: 10 } }} textAlign="middle-left" />

      {questsView.ids.map((_, i) => <Ligne i={i} />)}

      {/* Le bonus des trois: visible des le debut, sinon il n'incite a rien. */}
      <UiEntity
        uiTransform={{ width: '100%', height: 46, flexDirection: 'row', alignItems: 'center', margin: { top: 4 } }}
        uiBackground={{ color: Color4.create(1, 1, 1, 0.05) }}
      >
        <Label value="ALL THREE  ·  bonus rare crate" fontSize={15}
          color={tout ? Color4.fromHexString('#ffd166ff') : Color4.fromHexString('#7d879bff')}
          uiTransform={{ width: 370, height: 40 }} textAlign="middle-left" />
        {questsView.pris[3] === 1 ? (
          <Label value="CLAIMED" fontSize={13} color={Color4.fromHexString('#6f7a6fff')}
            uiTransform={{ width: 110, height: 40 }} textAlign="middle-center" />
        ) : (
          <Button uiTransform={{ width: 110, height: 38 }}
            value={tout ? 'CLAIM' : 'LOCKED'} variant={tout ? 'primary' : 'secondary'} fontSize={13}
            onMouseDown={() => { if (tout) reclamer(3) }} />
        )}
      </UiEntity>

      {/* CALENDRIER 7 JOURS. Le memo l'exigeait des le log 1: c'est lui qui ANNONCE la
          boucle. Une recompense qui tombe sans calendrier ne promet rien pour demain. */}
      <Label value="LOGIN STREAK" fontSize={16} color={Color4.fromHexString('#4dd2ffff')}
        uiTransform={{ width: '100%', height: 26, margin: { top: 12 } }} textAlign="middle-left" />
      <UiEntity uiTransform={{ width: '100%', height: 62, flexDirection: 'row' }}>
        {DAILY_REWARDS.map((t, j) => {
          const dayN = j + 1
          const passe = dayN < questsView.log || (dayN === questsView.log && questsView.dayClaimed)
          const actuel = dayN === questsView.log
          return (
            <UiEntity
              uiTransform={{
                width: 82, height: 58, margin: { right: 4 },
                flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                borderWidth: actuel ? 2 : 0, borderColor: Color4.fromHexString('#ffd166ff')
              }}
              uiBackground={{ color: passe ? Color4.create(0.14, 0.30, 0.14, 0.9) : Color4.create(1, 1, 1, 0.06) }}
            >
              <Label value={`DAY ${dayN}`} fontSize={12}
                color={passe ? Color4.fromHexString('#8fe08fff') : Color4.fromHexString('#a8b2c0ff')}
                uiTransform={{ width: '100%', height: 18 }} textAlign="middle-center" />
              <Label value={crate(t).name} fontSize={11}
                color={Color4.fromHexString(crate(t).color + 'ff')}
                uiTransform={{ width: '100%', height: 18 }} textAlign="middle-center" />
            </UiEntity>
          )
        })}
      </UiEntity>

      <Button uiTransform={{ width: 130, height: 40, margin: { top: 10 } }}
        value="CLOSE" variant="secondary" fontSize={14} onMouseDown={closeMenu} />
    </UiEntity>
  )
}
