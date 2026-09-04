import { engine, Entity, Transform, MeshRenderer, Material, Billboard, BillboardMode, Tween, EasingFunction, timers } from '@dcl/sdk/ecs'
import { Vector3, Color4, Color3 } from '@dcl/sdk/math'

/*
  A burst where a blow lands: the mobile stand-in for a particle puff.

  The mobile client draws no particles, so a hit had nothing at the point of impact: the
  crate punched and thudded, the coins rang, and testers still said the blow did not
  connect (3 and 4 Sep). A flat sprite of the reveal's rays, facing the camera, scaled up
  over a tenth of a second and gone, is what every mobile game draws in that spot when it
  cannot afford particles. Three entities reused in turn, parked underground between blows,
  so the cost is three rendered objects at most and usually zero on screen.
*/
const TEXTURE = 'assets/ui/burst.png'
const POOL = 3
const GROW_MS = 140
const LIFE_MS = 220

const pool: Array<{ e: Entity; hex: string }> = []
let next = 0

function ensurePool(): void {
  if (pool.length > 0) return
  for (let i = 0; i < POOL; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -60, 0), scale: Vector3.Zero() })
    MeshRenderer.setPlane(e)
    Billboard.create(e, { billboardMode: BillboardMode.BM_ALL })
    pool.push({ e, hex: '' })
  }
}

/** Burst at `at`, in `hex`, `size` metres across at its widest. */
export function puff(at: Vector3, hex: string, size = 1.2): void {
  ensurePool()
  const slot = pool[next]
  next = (next + 1) % POOL
  if (slot.hex !== hex) {
    slot.hex = hex
    Material.setPbrMaterial(slot.e, {
      texture: Material.Texture.Common({ src: TEXTURE }),
      emissiveTexture: Material.Texture.Common({ src: TEXTURE }),
      albedoColor: Color4.fromHexString(hex + 'ff'),
      emissiveColor: Color3.fromHexString(hex),
      emissiveIntensity: 2.2,
      metallic: 0, roughness: 1, specularIntensity: 0,
      transparencyMode: 1, alphaTest: 0.5, castShadows: false
    })
  }
  const t = Transform.getMutableOrNull(slot.e)
  if (t === null) return
  t.position = Vector3.create(at.x, at.y, at.z)
  t.scale = Vector3.create(0.2, 0.2, 1)
  Tween.setScale(slot.e, Vector3.create(0.2, 0.2, 1), Vector3.create(size, size, 1), GROW_MS, EasingFunction.EF_EASEOUTQUAD)
  const mine = slot.e
  timers.setTimeout(() => {
    const tt = Transform.getMutableOrNull(mine)
    if (tt !== null && tt.scale.x >= size - 0.01) { tt.scale = Vector3.Zero(); tt.position = Vector3.create(0, -60, 0) }
  }, LIFE_MS)
}
