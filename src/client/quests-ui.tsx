import ReactEcs, { Button, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, TAP, SKIN, btn, C } from './theme'
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

function claim(slot: number): void { void room.send('claimQuest', { slot }) }

export function questsToClaim(): number {
  let n = 0
  for (let i = 0; i < questsView.ids.length; i++) {
    if (questsView.progres[i] >= questsView.cibles[i] && questsView.pris[i] !== 1) n++
  }
  if (n === 0 && allQuestsDone() && questsView.pris[3] !== 1) n = 1
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
export const HAUTEUR_GOALS = 54 + 3 * (84 + 10) + (70 + 6) + (36 + 14) + 64

export function QuestsContent(): ReactEcs.JSX.Element | null {
  if (!questsView.open) return null
  const allDone = allQuestsDone()
  return (
    <UiEntity uiTransform={{ width: '100%', height: HAUTEUR_GOALS, flexDirection: 'column' }}>

    {/* Heading and its footnote on one line: the footnote never deserved a line of its own. */}
    <UiEntity uiTransform={{ width: '100%', height: 54, flexDirection: 'row', alignItems: 'center' }}>
      <Label value="DAILY OBJECTIVES" fontSize={TYPE.body} color={Color4.fromHexString('#ffd166ff')}
        uiTransform={{ height: 44, margin: { right: 18 } }} textWrap="nowrap" />
      <Label value="resets 00:00 UTC" fontSize={TYPE.caption} color={Color4.fromHexString('#7d879bff')}
        uiTransform={{ height: 44 }} textWrap="nowrap" />
    </UiEntity>

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
        uiTransform={{ width: '100%', height: 36, margin: { top: 14 } }} textAlign="middle-left" />
      {/* Seven fixed cards come to 1022; they wrap rather than run off a narrowed panel. */}
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap' }}>
        {DAILY_REWARDS.map((t, j) => {
          const dayN = j + 1
          const passe = dayN < questsView.log || (dayN === questsView.log && questsView.dayClaimed)
          const actuel = dayN === questsView.log
          return (
            <UiEntity
              uiTransform={{
                width: 104, height: 64, margin: { right: 6 },
                flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                borderWidth: actuel ? 2 : 0, borderColor: Color4.fromHexString('#ffd166ff')
              }}
              uiBackground={{ color: passe ? Color4.create(0.14, 0.30, 0.14, 0.9) : Color4.create(1, 1, 1, 0.06) }}
            >
              <Label value={`DAY ${dayN}`} fontSize={TYPE.caption}
                color={passe ? Color4.fromHexString('#8fe08fff') : Color4.fromHexString('#a8b2c0ff')}
                uiTransform={{ width: '100%', height: 28 }} textAlign="middle-center" />
              <Label value={crate(t).name} fontSize={TYPE.caption}
                color={Color4.fromHexString(crate(t).color + 'ff')}
                uiTransform={{ width: '100%', height: 28 }} textAlign="middle-center" />
            </UiEntity>
          )
        })}
    </UiEntity>

    </UiEntity>
    </UiEntity>
  )
}
