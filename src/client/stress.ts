import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Plot, CENTER, SCENE_SIDE, BELT_CLEARANCE, BASE_SIDE } from '../shared/schemas'
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

function alea(n: number): number { return Math.floor(Math.random() * n) }

export function setupStress(): void {
  if (STRESS_BASES <= 0) return
  const points: Array<{ x: number; z: number }> = []
  const pas = BASE_SIDE + 4
  for (let rang = 0; rang < 4 && points.length < STRESS_BASES; rang++) {
    for (const cote of [-1, 1]) {
      const z = CENTER.z + cote * (BELT_CLEARANCE + BASE_SIDE / 2 + 1 + rang * pas)
      if (z < pas || z > SCENE_SIDE - pas) continue
      for (let x = pas; x <= SCENE_SIDE - pas; x += pas) points.push({ x, z })
    }
  }
  let n = 0
  for (const p of points.slice(0, STRESS_BASES)) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(p.x, 0, p.z) })
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
  console.log(`[CLIENT] stress: ${n} fake bases drawn for measurement`)
}
