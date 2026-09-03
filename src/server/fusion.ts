import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Fusion, FUSION_NEEDS, FUSION_RANGE, FUSION_POS, VIDE, LUCK_MULT, poidsDesMutations, incomeMultiplier } from '../shared/schemas'
import { room } from '../shared/messages'
import { encoder, rarityOf, mutationDe, rarity, itemName, itemIncome, expectedMutationMult, RARITIES } from '../shared/loot-table'
import { PRODUCTION_PER_RARITY, fusionCost } from '../shared/economy'
import { log } from './log'
import { displayName, positionOf, fusionOf, setFusion, baseDe, removeItem, addItem, luckUntilOf, spend, coinsOf, prestigeOf } from './plots'
import { carriedDetail, prendreDesMains, remettreEnMain } from './carry'
import { rollMutation } from './loot'
import { noter } from './records'

/**
 * The fusion machine, server side.
 *
 * Three toys of one rarity in, one toy of the rarity above out, its mutation rolled afresh
 * with whatever the venue is pushing at that moment. Two ways in. By hand: a toy carried to
 * the drum goes into the player's hopper, persisted with the profile, until three are there.
 * From the shelves: with empty hands the drum offers the player's own counts, and three of
 * a rarity are taken from where they stand, cheapest first, hopper first. The second way is
 * from 27 Aug: a player carries one toy, the machine wanted three, and three walks across
 * the plaza read as a broken machine (tester).
 *
 * Two rules from elsewhere in this game, kept here. What is not yours does not go in: a
 * stolen toy has to reach a base first, the same line the sell bin draws, or the fuser is a
 * way to launder a theft without the walk home. And the top rarity has nothing above it.
 */

type Machine = ReturnType<typeof engine.addEntity>

function refuser(a: string, reason: string): void {
  void room.send('actionRejected', { action: 'fusion', reason, antiCheat: false }, { to: [a] })
}

function pres(a: string): boolean {
  const p = positionOf(a)
  if (p === null) return false
  const dx = p.x - FUSION_POS.x, dz = p.z - FUSION_POS.z
  return Math.sqrt(dx * dx + dz * dz) <= FUSION_RANGE
}

/**
 * Three of rarity `r` are gone; here is what they became, in the player's hand and on the dome.
 *
 * The mutation is rolled again, with the venue's push, the player's bought luck, and one
 * push per mutated toy that went in (`FUSION_PUSH`): a Lava fed in is a chance of a Lava out,
 * about one in five, never a certainty. "Keeps the best of the three" lasted an hour: the
 * tester saw the farm in it at once (two plain and one Lava, every rung). Traits are not
 * kept: they come from rushes, not from machines. The reference does not document its own
 * machine's rule; this is ours.
 */
/**
 * What this exact fusion costs this exact player.
 *
 * The price follows the value actually being created, so it needs the pieces going in (their
 * mutations are known), the odds on the piece coming out (the same weights the roll uses,
 * pushes included) and the owner's prestige. Pricing off the rarity alone is what made a
 * Mythic pay for itself in six seconds.
 */
function prixDeLaFusion(a: string, r: number, entrees: readonly number[]): number {
  const pousses = entrees.map(mutationDe).filter((m) => m > 0)
  const poids = poidsDesMutations(0, -1, luckUntilOf(a) > Date.now() ? LUCK_MULT : 1, pousses)
  let revenuEntrees = 0
  for (const c of entrees) revenuEntrees += itemIncome(c, PRODUCTION_PER_RARITY)
  return fusionCost(r, revenuEntrees, expectedMutationMult(poids), incomeMultiplier(prestigeOf(a)))
}

function produire(machine: Machine, a: string, r: number, resteHopper: number[], entrees: number[]): void {
  const name = displayName(a)
  const prix = prixDeLaFusion(a, r, entrees)
  if (prix > 0) spend(a, prix)
  setFusion(a, resteHopper)
  const pousses = entrees.map(mutationDe).filter((m) => m > 0)
  const sortie = encoder(r + 1, rollMutation(0, luckUntilOf(a) > Date.now() ? LUCK_MULT : 1, pousses))
  remettreEnMain(a, sortie, a)
  const f = Fusion.getMutableOrNull(machine)
  if (f !== null) {
    f.byName = name; f.rarity = r + 1; f.count = 0
    f.lastName = name; f.lastCode = sortie; f.atMs = Date.now()
  }
  void room.send('fusionState', { codes: resteHopper, made: sortie }, { to: [a] })
  void room.send('fused', { byName: name, rarity: r + 1, mutation: mutationDe(sortie), code: sortie })
  noter('fusion', name, '', sortie)
  log(`fusion: ${name} made a ${itemName(r + 1, mutationDe(sortie))} out of three ${rarity(r).name}s for ${prix}`)
}

export function startFuser(): void {
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
    if (!pres(a)) { refuser(a, 'walk up to the fuser'); return }
    const main = carriedDetail(a)
    if (main === null) { refuser(a, 'carry a toy to the fuser, or open it with empty hands'); return }
    if (main.origin !== a) { refuser(a, 'not yours to fuse, put it down at home first'); return }
    const r = rarityOf(main.code)
    if (r >= RARITIES.length - 1) { refuser(a, `a ${rarity(r).name} is the top: nothing above it`); return }
    const hopper = fusionOf(a)
    if (hopper.length > 0 && rarityOf(hopper[0]) !== r) {
      const tenu = rarity(rarityOf(hopper[0])).name
      refuser(a, `the fuser holds ${hopper.length} ${tenu} of yours: feed it a ${tenu}`)
      return
    }
    /*
      Le prix se verifie AVANT de prendre l'objet des mains, jamais apres.

      Une fusion qui echoue sur le prix apres avoir mange le troisieme objet serait un vol. On
      ne facture qu'au moment ou elle PRODUIT, et on refuse avant si l'or manque.
    */
    if (hopper.length + 1 >= FUSION_NEEDS) {
      const prix = prixDeLaFusion(a, r, [...hopper, main.code])
      if (coinsOf(a) < prix) {
        refuser(a, `fusing needs ${prix} coins`)
        return
      }
    }
    if (prendreDesMains(a) === null) { refuser(a, 'your hands are empty'); return }
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
    produire(machine, a, r, [], hopper)
  })

  room.onMessage('fuseFromBase', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (!pres(a)) { refuser(a, 'walk up to the fuser'); return }
    if (carriedDetail(a) !== null) { refuser(a, 'hands full: feed the fuser by hand, or put it down first'); return }
    const r = Number.isInteger(d?.rarity) ? d.rarity : -1
    if (r < 0 || r >= RARITIES.length - 1) { refuser(a, 'nothing above that'); return }
    const b = baseDe(a)
    if (b === undefined) { refuser(a, 'place a base first'); return }
    const hopper = fusionOf(a)
    const dedans = hopper.filter((c) => rarityOf(c) === r)
    const reste = hopper.filter((c) => rarityOf(c) !== r)
    const onShelf = b.items
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c !== VIDE && rarityOf(x.c) === r)
      .sort((x, y) => itemIncome(x.c, PRODUCTION_PER_RARITY) - itemIncome(y.c, PRODUCTION_PER_RARITY))
    const besoin = FUSION_NEEDS - dedans.length
    if (onShelf.length < besoin) {
      const total = onShelf.length + dedans.length
      refuser(a, `you own ${total} ${rarity(r).name}${total === 1 ? '' : 's'}, ${FUSION_NEEDS} needed`)
      return
    }
    // Holes are left where the toys stood (removeItem), so earlier indices stay valid.
    const pris = onShelf.slice(0, besoin)
    const prix = prixDeLaFusion(a, r, [...dedans, ...pris.map((x) => x.c)])
    if (coinsOf(a) < prix) { refuser(a, `fusing needs ${prix} coins`); return }
    for (const x of pris) removeItem(a, x.i)
    log(`fusion: ${displayName(a)} fused ${besoin} ${rarity(r).name}(s) off the shelf${dedans.length > 0 ? ` and ${dedans.length} from the hopper` : ''}`)
    produire(machine, a, r, reste, [...dedans, ...pris.map((x) => x.c)])
  })

  // A hopper filled by mistake goes back to the shelves, as far as the shelves have room.
  room.onMessage('takeBackFusion', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    if (!pres(a)) { refuser(a, 'walk up to the fuser'); return }
    const hopper = fusionOf(a)
    if (hopper.length === 0) { refuser(a, 'the fuser holds nothing of yours'); return }
    const reste: number[] = []
    let rendus = 0
    for (const code of hopper) {
      if (reste.length === 0 && addItem(a, code) !== 'plein') rendus += 1
      else reste.push(code)
    }
    setFusion(a, reste)
    const f = Fusion.getMutableOrNull(machine)
    if (f !== null && f.byName === displayName(a)) { f.count = reste.length; if (reste.length === 0) f.rarity = -1 }
    void room.send('fusionState', { codes: reste, made: -1 }, { to: [a] })
    if (reste.length > 0) refuser(a, `${rendus} back on your shelves, no room for the other ${reste.length}`)
    log(`fusion: ${displayName(a)} took ${rendus} toy(s) back out of the fuser`)
  })

  log('fusion ready')
}
