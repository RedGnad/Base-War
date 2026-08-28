import ReactEcs, { Button, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, TAP, SKIN, btn, C, lisible } from './theme'
import { Color4 } from '@dcl/sdk/math'
import { strip, BAND } from './layout'
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
  dayClaimed: false,
  dailyDispo: false,
  prochainJour: 1
}

export function setupQuests(): void {
  room.onMessage('quests', (d) => {
    questsView.ids = [...d.ids]
    questsView.progres = [...d.progres]
    questsView.cibles = [...d.cibles]
    questsView.pris = [...d.pris]
    questsView.log = d.log
    questsView.dayClaimed = d.dayClaimed
    questsView.dailyDispo = d.dailyDispo
    questsView.prochainJour = d.prochainJour
  })
}

function claim(slot: number): void { void room.send('claimQuest', { slot }) }
function claimDaily(): void { void room.send('claimDaily', {}) }

export function questsToClaim(): number {
  let n = 0
  for (let i = 0; i < questsView.ids.length; i++) {
    if (questsView.progres[i] >= questsView.cibles[i] && questsView.pris[i] !== 1) n++
  }
  if (n === 0 && allQuestsDone() && questsView.pris[3] !== 1) n = 1
  if (questsView.dailyDispo) n += 1     // today's chest is waiting to be claimed
  return n
}

function allQuestsDone(): boolean {
  if (questsView.ids.length === 0) return false
  for (let i = 0; i < questsView.ids.length; i++) {
    if (questsView.progres[i] < questsView.cibles[i]) return false
  }
  return true
}

function QuestRow(props: { i: number }): ReactEcs.JSX.Element {
  const i = props.i
  const q = QUESTS[questsView.ids[i]]
  const fait = questsView.progres[i] ?? 0
  const cible = questsView.cibles[i] ?? 1
  const fini = fait >= cible
  const pris = questsView.pris[i] === 1
  const pct = Math.min(100, Math.round((fait / cible) * 100))
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: 84, flexDirection: 'row', alignItems: 'center', margin: { bottom: 10 } }}
    >
      <UiEntity uiTransform={{ width: 510, height: 76, flexDirection: 'column', justifyContent: 'center' }}>
        <Label value={q?.texte ?? ''} fontSize={TYPE.label}
          color={pris ? Color4.fromHexString('#6f7a6fff') : Color4.White()}
          uiTransform={{ width: '100%', height: 34 }} textAlign="middle-left" />
        <UiEntity
          uiTransform={{ width: 493, height: 20, margin: { top: 3 } }}
          uiBackground={{ color: Color4.create(1, 1, 1, 0.12) }}
        >
          <UiEntity
            uiTransform={{ width: `${pct}%`, height: 20 }}
            uiBackground={{ color: fini ? Color4.fromHexString('#8fe08fff') : Color4.fromHexString('#4dd2ffff') }}
          />
        </UiEntity>
      </UiEntity>
      <Label value={`${fait}/${cible}`} fontSize={TYPE.label}
        color={Color4.fromHexString('#a8b2c0ff')}
        uiTransform={{ width: 119, height: 76 }} textAlign="middle-center" />
      {pris ? (
        <Label value="CLAIMED" fontSize={TYPE.caption} color={Color4.fromHexString('#6f7a6fff')}
          uiTransform={{ width: 187, height: TAP.height }} textAlign="middle-center" />
      ) : (
        <Button
          uiTransform={{ width: 187, height: TAP.height }}
          value={fini ? 'CLAIM' : `+1 crate`}
          variant={fini ? 'primary' : 'secondary'} uiBackground={btn(fini)} color={fini ? C.ink : C.name}
          fontSize={TYPE.caption}
          onMouseDown={() => { if (fini) claim(i) }} />
      )}
    </UiEntity>
  )
}

/**
 * What this tab needs, so the window can be exactly that tall and no taller.
 *
 * Added up rather than guessed: title, subtitle, three rows with their gaps, the
 * all-three strip, the streak heading and the streak cards.
 */
const STREAK_H = 64

export const HAUTEUR_GOALS = 3 * (84 + 10) + (70 + 6) + (30 + 10) + STREAK_H

export function QuestsContent(): ReactEcs.JSX.Element | null {
  if (!questsView.open) return null
  const allDone = allQuestsDone()
  return (
    <UiEntity uiTransform={{ width: '100%', height: HAUTEUR_GOALS, flexDirection: 'column' }}>


    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
      {questsView.ids.map((_, i) => <QuestRow i={i} />)}

    <UiEntity
        uiTransform={{ width: '100%', height: 70, flexDirection: 'row', alignItems: 'center', margin: { top: 6 } }}
        uiBackground={{ color: Color4.create(1, 1, 1, 0.05) }}
      >
        <Label value="ALL THREE  ·  bonus rare crate" fontSize={TYPE.label}
          color={allDone ? Color4.fromHexString('#ffd166ff') : Color4.fromHexString('#7d879bff')}
          uiTransform={{ width: 629, height: 60 }} textAlign="middle-left" />
        {questsView.pris[3] === 1 ? (
          <Label value="CLAIMED" fontSize={TYPE.caption} color={Color4.fromHexString('#6f7a6fff')}
            uiTransform={{ width: 187, height: TAP.height }} textAlign="middle-center" />
        ) : (
          <Button uiTransform={{ width: 187, height: TAP.height }}
            value={allDone ? 'CLAIM' : 'LOCKED'} variant={allDone ? 'primary' : 'secondary'} uiBackground={btn(allDone)} color={allDone ? C.ink : C.name} fontSize={TYPE.caption}
            onMouseDown={() => { if (allDone) claim(3) }} />
        )}
    </UiEntity>

    <Label value="LOGIN STREAK" fontSize={TYPE.label} color={Color4.fromHexString('#4dd2ffff')}
        uiTransform={{ width: '100%', height: 30, margin: { top: 10 } }} textAlign="middle-left" />
      {/*
        Seven chips sized as a share of the width, so the row can never wrap.

        They were fixed at 104 wide and allowed to wrap when the panel narrowed, which broke
        the one thing the window relies on: this tab declares how tall it is, and the
        declaration assumed a single row. On the phone the seventh chip wrapped onto a second
        row that fell outside the declared height, so it could not be scrolled to and simply
        did not exist. A width in percent keeps all seven on one line at any panel width, and
        the height stays the number that was promised.

        12.4 rather than 13.2: seven of them leave 13 percent for six gaps, which on the
        narrowed window a phone actually gets is a visible space rather than the hairline the
        old figure produced.
      */}
      <UiEntity
        uiTransform={{ width: '100%', height: STREAK_H, flexDirection: 'row', justifyContent: 'space-between' }}
      >
        {DAILY_REWARDS.map((t, j) => {
          const dayN = j + 1
          const passe = dayN < questsView.log || (dayN === questsView.log && questsView.dayClaimed)
          // The day to claim is the next in the streak, offered only when today's chest is waiting.
          const aReclamer = questsView.dailyDispo && dayN === questsView.prochainJour
          const actuel = dayN === questsView.log && !aReclamer
          return (
            <UiEntity
              uiTransform={{
                width: '12.4%', height: STREAK_H,
                flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                borderWidth: aReclamer ? 3 : actuel ? 2 : 0,
                borderColor: Color4.fromHexString((aReclamer ? '#ff6b6b' : '#ffd166') + 'ff')
              }}
              uiBackground={{ color: aReclamer ? Color4.create(0.35, 0.12, 0.12, 0.95) : passe ? Color4.create(0.14, 0.30, 0.14, 0.9) : Color4.create(1, 1, 1, 0.06) }}
              onMouseDown={aReclamer ? claimDaily : undefined}
            >
              <Label value={aReclamer ? `DAY ${dayN}  ✦` : `DAY ${dayN}`} fontSize={TYPE.caption}
                color={aReclamer ? Color4.fromHexString('#ff9e9eff') : passe ? Color4.fromHexString('#8fe08fff') : Color4.fromHexString('#a8b2c0ff')}
                uiTransform={{ width: '100%', height: 28 }} textAlign="middle-center" />
              <Label value={aReclamer ? 'CLAIM' : crate(t).name} fontSize={TYPE.caption}
                color={aReclamer ? Color4.fromHexString('#ffd166ff') : Color4.fromHexString(lisible(crate(t).color) + 'ff')}
                uiTransform={{ width: '100%', height: 28 }} textAlign="middle-center" />
            </UiEntity>
          )
        })}
    </UiEntity>

    </UiEntity>
    </UiEntity>
  )
}
