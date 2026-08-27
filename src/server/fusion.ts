import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Fusion, FUSION_NEEDS, FUSION_RANGE, FUSION_POS } from '../shared/schemas'
import { room } from '../shared/messages'
import { encoder, rarityOf, mutationDe, rarity, itemName, RARITIES } from '../shared/loot-table'
import { log } from './log'
import { displayName, positionOf, fusionOf, setFusion } from './plots'
import { porteDetail, prendreDesMains, remettreEnMain } from './carry'
import { rollMutation } from './loot'
import { noter } from './records'

/**
 * The fusion machine, server side.
 *
 * Three toys of one rarity in, one toy of the rarity above out, its mutation rolled afresh
 * with whatever the venue is pushing at that moment. The hopper is per player and persisted
 * with the profile, so a second Common fed tomorrow still counts; the machine itself is one
 * synced entity that shows the last hand that fed it, and the last thing that came out.
 *
 * Two rules from elsewhere in this game, kept here. What is not yours does not go in: a
 * stolen toy has to reach a base first, the same line the sell bin draws, or the fuser is a
 * way to launder a theft without the walk home. And the top rarity has nothing above it.
 */
export function startFusion(): void {
  for (const [e] of engine.getEntitiesWith(Fusion)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e)
  }
  const machine = engine.addEntity()
  Fusion.create(machine, { byName: '', rarity: -1, count: 0, lastName: '', lastCode: -1, atMs: 0 })
  syncEntity(machine, [Fusion.componentId])

  room.onMessage('feedFusion', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const refuse = (reason: string): void => {
      void room.send('actionRejected', { action: 'fusion', reason, antiCheat: false }, { to: [a] })
    }
    const p = positionOf(a)
    if (p === null) return
    const dx = p.x - FUSION_POS.x, dz = p.z - FUSION_POS.z
    if (Math.sqrt(dx * dx + dz * dz) > FUSION_RANGE) { refuse('walk up to the fuser'); return }
    const main = porteDetail(a)
    if (main === null) { refuse('carry a toy to the fuser first'); return }
    if (main.origin !== a) { refuse('not yours to fuse, put it down at home first'); return }
    const r = rarityOf(main.code)
    if (r >= RARITIES.length - 1) { refuse(`a ${rarity(r).name} is the top: nothing above it`); return }
    const hopper = fusionOf(a)
    if (hopper.length > 0 && rarityOf(hopper[0]) !== r) {
      const tenu = rarity(rarityOf(hopper[0])).name
      refuse(`the fuser holds ${hopper.length} ${tenu} of yours: feed it a ${tenu}`)
      return
    }
    if (prendreDesMains(a) === null) { refuse('your hands are empty'); return }
    hopper.push(main.code)
    const name = displayName(a)
    if (hopper.length < FUSION_NEEDS) {
      setFusion(a, hopper)
      const f = Fusion.getMutableOrNull(machine)
      if (f !== null) { f.byName = name; f.rarity = r; f.count = hopper.length; f.atMs = Date.now() }
      void room.send('fusionState', { codes: hopper, made: -1 }, { to: [a] })
      log(`fusion: ${name} fed a ${itemName(r, mutationDe(main.code))}, ${hopper.length}/${FUSION_NEEDS}`)
      return
    }
    setFusion(a, [])
    const sortie = encoder(r + 1, rollMutation(0))
    remettreEnMain(a, sortie, a)
    const f = Fusion.getMutableOrNull(machine)
    if (f !== null) {
      f.byName = name; f.rarity = r + 1; f.count = 0
      f.lastName = name; f.lastCode = sortie; f.atMs = Date.now()
    }
    void room.send('fusionState', { codes: [], made: sortie }, { to: [a] })
    void room.send('fused', { byName: name, rarity: r + 1, mutation: mutationDe(sortie), code: sortie })
    noter('fusion', name, '', sortie)
    log(`fusion: ${name} made a ${itemName(r + 1, mutationDe(sortie))} out of three ${rarity(r).name}s`)
  })

  log('fusion ready')
}
