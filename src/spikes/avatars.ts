import { engine, Transform, AvatarShape } from '@dcl/sdk/ecs'
import { Color3, Vector3 } from '@dcl/sdk/math'

/**
 * SPIKE 1.2 — budget mobile.
 * Le mémo exige de savoir si 8 avatars visibles tiennent >= 30 images/s AVANT d'ecrire
 * la moindre ligne de gameplay. Si ca ne passe pas, on reduit le nombre d'avatars
 * visibles plutot que de decouvrir le probleme en phase 4.
 *
 * Code jetable: il sera retire une fois la mesure prise et consignee.
 */

const B = 'urn:decentraland:off-chain:base-avatars:'

// Des avatars HABILLES: AvatarShape avec un simple id rend un corps nu, donc
// sous-estimerait le cout reel (moins de maillages, moins de textures).
const OUTFITS = [
  { body: 'BaseMale', wear: ['eyes', 'eyebrows', 'mouth', 'green_hoodie', 'brown_pants', 'sneakers', 'casual_hair_01'] },
  { body: 'BaseFemale', wear: ['f_eyes', 'f_eyebrows', 'f_mouth', 'f_sweater', 'f_jeans', 'bun_shoes', 'standard_hair'] }
]

export function spawnTestAvatars(count: number): void {
  const centre = Vector3.create(40, 0, 40)
  const rayon = 6
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.create(centre.x + Math.cos(a) * rayon, 0, centre.z + Math.sin(a) * rayon)
    })
    const o = OUTFITS[i % OUTFITS.length]
    AvatarShape.create(e, {
      id: `spike-avatar-${i}`,
      name: `Testeur ${i + 1}`,
      bodyShape: B + o.body,
      wearables: o.wear.map((w) => B + w),
      emotes: [],
      skinColor: Color3.create(0.8, 0.6, 0.5),
      hairColor: Color3.create(0.2, 0.1, 0.05),
      eyeColor: Color3.create(0.3, 0.5, 0.7)
    })
  }
  console.log(`[SPIKE] ${count} avatars de test crees`)
}
