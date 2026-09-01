import { engine, Transform } from '@dcl/sdk/ecs'
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
export const STRESS_BASES = 3

function alea(n: number): number { return Math.floor(Math.random() * n) }

/**
 * Fill every free spot, which is now the whole worst case.
 *
 * Bases stand on a fixed list of spots, so "a full plaza" is no longer a guess about how many
 * players might turn up: it is the length of that list. The harness takes whatever the real
 * server has not already claimed and puts a fake base on it, which produces exactly the field
 * a full server produces, and never a base standing inside another one.
 */
function poser(): void {
  const pris: Array<{ x: number; z: number }> = []
  for (const [e] of engine.getEntitiesWith(Plot, Transform)) {
    const t = Transform.get(e)
    pris.push({ x: t.position.x, z: t.position.z })
  }
  const reelles = pris.length
  let n = 0
  for (const spot of PLOT_SPOTS) {
    if (n >= STRESS_BASES) break
    if (pris.some((q) => Math.abs(q.x - spot.x) < 0.5 && Math.abs(q.z - spot.z) < 0.5)) continue
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(spot.x, 0, spot.z) })
    const floors = 1 + alea(4)
    const items: number[] = []
    for (let k = 0; k < floors * 6; k++) items.push(Math.random() < 0.85 ? encoder(alea(5), alea(3) === 0 ? 1 + alea(5) : 0) : -1)
    Plot.create(e, {
      floors, rebirths: alea(4), index: 1000 + n, ownerId: `stress-${n}`, ownerName: `Bot ${n}`,
      items, ownerPresent: false, given: 0, received: 0, skin: alea(3) === 0 ? 1 + alea(5) : 0,
      sentries: 0, sentryFloors: [], lockedUntil: 0
    })
    n += 1
  }
  console.log(`[CLIENT] stress: ${n} fausses bases sur emplacements libres, ${reelles} vraies bases en place`)
}

export function setupStress(): void {
  if (STRESS_BASES <= 0) return
  // Deferred: the real bases arrive over the network, and a field laid out before they land is
  // a field laid out against nothing.
  let attente = 0
  let fait = false
  engine.addSystem((dt: number) => {
    if (fait) return
    attente += dt
    if (attente < 5) return
    fait = true
    poser()
  })
}
