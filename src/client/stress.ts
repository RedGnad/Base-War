import { engine, Transform, Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Plot, PLOT_SPOTS } from '../shared/schemas'
import { encoder } from '../shared/loot-table'

/**
 * A load-test harness, client only, off by default.
 *
 * The workshop's rule is "measure on the device", and a measurement made with one player and
 * two bases says nothing about a plaza with sixty (tester, 28 Aug). Set `STRESS_BASES` above
 * zero, build, scan the QR from a phone, open the stats panel, and read the real numbers under
 * a full plaza. The fake plots are local entities carrying a `Plot` component: never synced,
 * never seen by the server, drawn by exactly the code path real bases use, lights and all. A
 * steal aimed at one is refused by the server with an unknown owner, which is harmless.
 *
 * Ship with 0. It is a measuring instrument, not a feature.
 */
export const STRESS_BASES = 0
/** The skins the first fakes wear, patterned ones first, so every skin stands on the field. */
const SKIN_PALETTE = [5, 9, 6, 12, 11, 1, 2, 3, 10, 13]

/*
  Deterministe, expres. Un instrument qui tire au sort donne deux champs differents a deux
  mesures, et une comparaison avant/apres d'un changement de rendu n'a alors aucun sens.
  Meme graine, meme plaza, a chaque lancement.
*/
let graine = 20260902
function alea(n: number): number {
  graine = (graine * 1103515245 + 12345) % 2147483648
  return Math.floor((graine / 2147483648) * n)
}

/**
 * Fill every free spot, which is now the whole worst case.
 *
 * Bases stand on a fixed list of spots, so "a full plaza" is no longer a guess about how many
 * players might turn up: it is the length of that list. The harness takes whatever the real
 * server has not already claimed and puts a fake base on it, which produces exactly the field
 * a full server produces, and never a base standing inside another one.
 */
function poser(
  reelles: Array<{ x: number; z: number }>,
  faux: Map<string, Entity>,
  clef: (x: number, z: number) => string
): void {
  const pris = [...reelles]
  let n = 0
  for (const spot of PLOT_SPOTS) {
    if (n >= STRESS_BASES) break
    if (pris.some((q) => Math.abs(q.x - spot.x) < 0.5 && Math.abs(q.z - spot.z) < 0.5)) continue
    const e = engine.addEntity()
    faux.set(clef(spot.x, spot.z), e)
    Transform.create(e, { position: Vector3.create(spot.x, 0, spot.z) })
    /*
      The first two fakes are a palette, not a roll: one piece of every mutation as an Epic,
      then one of every rarity plain and as gold and diamond. A tint can only be judged on a
      piece that exists (owner, 5 Sep: "je vois aucun item cursed").
    */
    const palette = n === 0 ? Array.from({ length: 14 }, (_, m) => encoder(3, m))
      : n === 1 ? [0, 1, 2, 3, 4, 5, 6].flatMap((r) => [encoder(r, 0), encoder(r, 1), encoder(r, 9)])
      : null
    const floors = palette !== null ? Math.ceil(palette.length / 6) : 1 + alea(4)
    const items: number[] = []
    for (let k = 0; k < floors * 6; k++) {
      if (palette !== null) { items.push(palette[k] ?? -1); continue }
      items.push(Math.random() < 0.85 ? encoder(alea(5), alea(3) === 0 ? 1 + alea(5) : 0) : -1)
    }
    // Armed storeys draw a cone each: half the storeys of a fake carry charges.
    const sentryFloors = Array.from({ length: floors }, () => (alea(2) === 0 ? 1 + alea(20) : 0))
    Plot.create(e, {
      floors, rebirths: alea(4), index: 1000 + n, ownerId: `stress-${n}`, ownerName: `Bot ${n}`,
      items, ownerPresent: false, given: 0, received: 0, skin: SKIN_PALETTE[n] ?? (alea(3) === 0 ? 1 + alea(5) : 0),
      sentries: sentryFloors.reduce((a, b) => a + b, 0), sentryFloors, lockedUntil: 0
    })
    n += 1
  }
  console.log(`[CLIENT] stress: ${n} fausses bases sur emplacements libres, ${reelles.length} vraies bases evitees`)
}

/**
 * A fake base NEVER stands where a real one stands, at any point in time.
 *
 * Waiting five seconds and then reading the field was not enough: the player's own base
 * arrives over the network whenever the server gets to it, and if that is on the sixth second
 * the harness has already taken their spot. The tester then stood inside his own building
 * being told "not your base", with two sets of walls, two ramps and two lifts interleaved
 * (1 Sep). It looked like the merge had broken the world; it was the instrument.
 *
 * So placement waits for the first real base to appear, and afterwards a light sweep keeps
 * watching: any fake sitting on a spot a real base has since claimed is destroyed on sight.
 * A measuring instrument that changes what it measures is worse than no instrument.
 */
export function setupStress(): void {
  if (STRESS_BASES <= 0) return
  const faux = new Map<string, Entity>()
  const clef = (x: number, z: number): string => `${Math.round(x)}|${Math.round(z)}`
  let acc = 0
  let attente = 0
  let pose = false
  engine.addSystem((dt: number) => {
    acc += dt
    attente += dt
    if (acc < 2) return
    acc = 0
    const reelles: Array<{ x: number; z: number }> = []
    for (const [e, p] of engine.getEntitiesWith(Plot, Transform)) {
      if (p.ownerId.startsWith('stress-')) continue
      const t = Transform.get(e)
      reelles.push({ x: t.position.x, z: t.position.z })
    }
    // Any fake standing where a real base now stands gives way, immediately.
    for (const r of reelles) {
      const k = clef(r.x, r.z)
      const intrus = faux.get(k)
      if (intrus !== undefined) {
        engine.removeEntity(intrus)
        faux.delete(k)
        console.log(`[CLIENT] stress: fausse base retiree de ${k}, une vraie s y est posee`)
      }
    }
    // Nothing is placed before a real base has been seen: the field has to exist to be avoided.
    if (!pose && (reelles.length > 0 || attente > 30)) {
      pose = true
      poser(reelles, faux, clef)
    }
  })
}
