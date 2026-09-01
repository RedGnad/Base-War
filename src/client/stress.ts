import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Plot, CENTER, SCENE_SIDE, BELT_CLEARANCE, MIN_BASE_GAP, placeLibre } from '../shared/schemas'
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
export const STRESS_BASES = 60

function alea(n: number): number { return Math.floor(Math.random() * n) }

/**
 * The wanted spots, in rows either side of the lane, before any rule is applied.
 *
 * These are wishes, not decisions. Each one goes through the same placement rule a real base
 * goes through, against the real bases already standing. The harness used to write its own
 * grid straight into the world without ever looking at what was there, so its buildings stood
 * inside the tester's own base and the field it produced was a picture of a bug in the
 * instrument rather than of the game (tester, 1 Sep). A measuring field has to be built by the
 * rules it is meant to measure.
 */
function souhaits(): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = []
  const pas = MIN_BASE_GAP
  for (let rang = 0; rang < 5 && points.length < STRESS_BASES * 2; rang++) {
    for (const cote of [-1, 1]) {
      const z = CENTER.z + cote * (BELT_CLEARANCE + pas / 2 + rang * pas)
      if (z < pas || z > SCENE_SIDE - pas) continue
      for (let x = pas; x <= SCENE_SIDE - pas; x += pas) points.push({ x, z })
    }
  }
  return points
}

function poser(): void {
  const occupes: Array<{ x: number; z: number }> = []
  for (const [e] of engine.getEntitiesWith(Plot, Transform)) {
    const t = Transform.get(e)
    occupes.push({ x: t.position.x, z: t.position.z })
  }
  const reelles = occupes.length
  let n = 0
  for (const v of souhaits()) {
    if (n >= STRESS_BASES) break
    const libre = placeLibre(v.x, v.z, SCENE_SIDE, occupes)
    if (libre === null) continue
    occupes.push(libre)
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(libre.x, 0, libre.z) })
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
  console.log(`[CLIENT] stress: ${n} fausses bases posees par la regle, ${reelles} vraies bases evitees`)
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
