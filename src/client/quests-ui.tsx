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
      uiTransform={{ width: '100%', height: 105, flexDirection: 'row', alignItems: 'center', margin: { bottom: 14 } }}
    >
      <UiEntity uiTransform={{ width: 510, height: 92, flexDirection: 'column', justifyContent: 'center' }}>
        <Label value={q?.texte ?? ''} fontSize={TYPE.label}
          color={pris ? Color4.fromHexString('#6f7a6fff') : Color4.White()}
          uiTransform={{ width: '100%', height: 37 }} textAlign="middle-left" />
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
        uiTransform={{ width: 119, height: 92 }} textAlign="middle-center" />
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

export function QuestsPanel(): ReactEcs.JSX.Element | null {
  if (!questsView.open) return null
  const allDone = allQuestsDone()
  return (
    /*
      A dialog that fits the screen it is drawn on.

      It was 1088 by 731 with a top margin computed for a box of 430, on a phone whose whole
      canvas is 1600 by 720. It was taller than the screen, and it was hung from the wrong
      half-height, so it started too high and ran off the bottom. Its contents came to 862,
      so it also overflowed itself, which is what put the login streak on top of the button.
      Three separate reasons for one symptom, all of them arithmetic.
      The header and the way out are pinned, and only the middle scrolls, so the button that
      closes it can never be the thing pushed off the edge.
    */
    <UiEntity
      uiTransform={{
        width: strip(1088).width, height: BAND.dialogMaxHeight, positionType: 'absolute',
        position: { top: '50%', left: '50%' },
        margin: { left: strip(1088).margin.left, top: -BAND.dialogMaxHeight / 2 },
        flexDirection: 'column', padding: 18
      }}
      uiBackground={{ color: Color4.create(0.04, 0.05, 0.09, 0.95) }}
    >
      <Label value="DAILY OBJECTIVES" fontSize={TYPE.title} color={Color4.fromHexString('#ffd166ff')}
        uiTransform={{ width: '100%', height: 51 }} textAlign="middle-left" />
      <Label value="resets every day at 00:00 UTC" fontSize={TYPE.caption} color={Color4.fromHexString('#7d879bff')}
        uiTransform={{ width: '100%', height: 34, margin: { bottom: 17 } }} textAlign="middle-left" />

      <UiEntity uiTransform={{ width: '100%', flexGrow: 1, overflow: 'scroll', flexDirection: 'column' }}>
      {questsView.ids.map((_, i) => <QuestRow i={i} />)}

      <UiEntity
        uiTransform={{ width: '100%', height: 78, flexDirection: 'row', alignItems: 'center', margin: { top: 7 } }}
        uiBackground={{ color: Color4.create(1, 1, 1, 0.05) }}
      >
        <Label value="ALL THREE  ·  bonus rare crate" fontSize={TYPE.label}
          color={allDone ? Color4.fromHexString('#ffd166ff') : Color4.fromHexString('#7d879bff')}
          uiTransform={{ width: 629, height: 68 }} textAlign="middle-left" />
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
        uiTransform={{ width: '100%', height: 44, margin: { top: 20 } }} textAlign="middle-left" />
      <UiEntity uiTransform={{ width: '100%', height: 105, flexDirection: 'row' }}>
        {DAILY_REWARDS.map((t, j) => {
          const dayN = j + 1
          const passe = dayN < questsView.log || (dayN === questsView.log && questsView.dayClaimed)
          const actuel = dayN === questsView.log
          return (
            <UiEntity
              uiTransform={{
                width: 139, height: 99, margin: { right: 7 },
                flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                borderWidth: actuel ? 2 : 0, borderColor: Color4.fromHexString('#ffd166ff')
              }}
              uiBackground={{ color: passe ? Color4.create(0.14, 0.30, 0.14, 0.9) : Color4.create(1, 1, 1, 0.06) }}
            >
              <Label value={`DAY ${dayN}`} fontSize={TYPE.caption}
                color={passe ? Color4.fromHexString('#8fe08fff') : Color4.fromHexString('#a8b2c0ff')}
                uiTransform={{ width: '100%', height: 31 }} textAlign="middle-center" />
              <Label value={crate(t).name} fontSize={TYPE.caption}
                color={Color4.fromHexString(crate(t).color + 'ff')}
                uiTransform={{ width: '100%', height: 31 }} textAlign="middle-center" />
            </UiEntity>
          )
        })}
      </UiEntity>

      </UiEntity>

      <Button uiTransform={{ width: 221, height: TAP.height, margin: { top: 17 } }}
        value="CLOSE" variant="secondary" uiBackground={SKIN.secondary} color={C.name} fontSize={TYPE.label} onMouseDown={closeMenu} />
    </UiEntity>
  )
}
