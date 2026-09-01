import { engine } from '@dcl/sdk/ecs'

/**
 * A per-system stopwatch, client only, off by default.
 *
 * A frame budget says the scene is slow; it never says WHICH of the forty systems is slow,
 * and guessing costs a build and a launch per guess. This wraps `engine.addSystem` before
 * anything registers, charges every frame to the system that spent it, and prints the
 * ranking every five seconds. One run, the whole attribution.
 *
 * `Date.now()` has millisecond resolution, which is far too coarse for one call of one
 * system; that is why nothing is printed per frame. Over five seconds a system is credited
 * with the sum of its rounded samples, and the rounding averages out across the hundreds of
 * frames in the window. Systems below a millisecond total simply do not appear, which is
 * exactly the ones we do not care about.
 *
 * Ship with `PROFIL = false`. It is a measuring instrument, not a feature.
 */
export const PROFIL = true

const temps = new Map<string, number>()
let frames = 0
let anonymes = 0

export function installerProfil(): void {
  if (!PROFIL) return
  const brut = engine.addSystem.bind(engine)
  engine.addSystem = ((fn: (dt: number) => void, priority?: number, name?: string) => {
    anonymes += 1
    const etiquette = name ?? (fn.name !== '' ? fn.name : `anon-${anonymes}`)
    temps.set(etiquette, 0)
    brut((dt: number) => {
      const t0 = Date.now()
      fn(dt)
      temps.set(etiquette, (temps.get(etiquette) ?? 0) + (Date.now() - t0))
    }, priority, name)
  }) as typeof engine.addSystem

  let acc = 0
  brut((dt: number) => {
    frames += 1
    acc += dt
    if (acc < 5) return
    const classement = [...temps.entries()].filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 14)
    const total = [...temps.values()].reduce((a, b) => a + b, 0)
    const fenetre = acc * 1000
    console.log(`[PROFIL] ${frames} frames en ${Math.round(fenetre)} ms, systemes ${total} ms (${Math.round((total / fenetre) * 100)}% du temps mesure)`)
    for (const [nom, ms] of classement) {
      console.log(`[PROFIL]   ${nom}: ${ms} ms total, ${(ms / frames).toFixed(2)} ms/frame`)
    }
    for (const k of temps.keys()) temps.set(k, 0)
    frames = 0
    acc = 0
  })
}
