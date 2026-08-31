import { engine, Transform, GltfContainer, MeshRenderer, MeshCollider, Material, Animator, ColliderLayer, Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { CENTER, SCENE_SIDE, EDGE_MARGIN, BELT_CLEARANCE, BELT_LENGTH, FUSION_POS } from '../shared/schemas'
import { TOY, plastic } from './toy'

/**
 * The world's dressing: a toybox rim, a treeline, bushes, balloons.
 *
 * The venue is a play mat on a table, and the table now has its edge: a cream rim wall with
 * a yellow lip, the box the toys came in. That is the hard boundary the tester asked for,
 * and it costs four colliders. Everything else is dressing and can be walked through:
 * the treeline lives in the EDGE_MARGIN band where no base can ever be built, the bushes in
 * the belt lane's clearance where building is equally forbidden, so decor and player bases
 * can never contest the same ground.
 *
 * The budget is the point (the show-and-tell showed the other way: heavy worlds, lost and
 * lagging testers). Three GLBs repeated: one 4 m faceted tree (1015 tri, its sway clip
 * looping), two 70-tri bushes, three party balloons and one balloon spiral as the landmark.
 * About fifty thousand triangles all told, no lights, no alpha we control, and no collider
 * beyond the rim: the phone pays almost nothing for a world that finally has edges.
 *
 * Every position comes from one seeded LCG, so the wood is the same wood for everyone and
 * on every visit, without shipping a single coordinate.
 */
let graine = 987654321
function alea(): number { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x7fffffff }

const ARBRE = 'assets/Models/tree.glb'
const BUISSONS = ['assets/Models/bush-02.glb', 'assets/Models/bush-03.glb']
const BALLONS = ['assets/Models/balloon001.glb', 'assets/Models/balloon005.glb', 'assets/Models/balloon006.glb']
const SPIRALE = 'assets/Models/balloon-group01.glb'

/** A decorative GLB: no physics, no pointer, nothing for the phone to test against. */
function pose(src: string, x: number, y: number, z: number, sc: number, ry: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(sc, sc, sc),
    rotation: Quaternion.fromEulerDegrees(0, ry, 0)
  })
  GltfContainer.create(e, { src, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  return e
}

function surSpawn(x: number, z: number): boolean {
  return x > 88 && x < 104 && z > 92 && z < 108
}

export function setupDecor(): void {
  // The rim: four walls just inside the scene edge, cream with a yellow lip, like the side
  // of the box. Physics AND pointer on the same boxes so the third-person camera cannot
  // slide through into the void (camera rule: both layers or it clips).
  const H = 3.2, EP = 0.8, LIP = 0.5
  const murs: Array<[number, number, number, number]> = [
    [SCENE_SIDE / 2, EP / 2, SCENE_SIDE, EP],
    [SCENE_SIDE / 2, SCENE_SIDE - EP / 2, SCENE_SIDE, EP],
    [EP / 2, SCENE_SIDE / 2, EP, SCENE_SIDE],
    [SCENE_SIDE - EP / 2, SCENE_SIDE / 2, EP, SCENE_SIDE]
  ]
  for (const [x, z, lx, lz] of murs) {
    const mur = engine.addEntity()
    Transform.create(mur, { position: Vector3.create(x, H / 2, z), scale: Vector3.create(lx, H, lz) })
    MeshRenderer.setBox(mur)
    MeshCollider.setBox(mur, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)
    Material.setPbrMaterial(mur, plastic(TOY.wallCream))
    const levre = engine.addEntity()
    Transform.create(levre, { position: Vector3.create(x, H + LIP / 2, z), scale: Vector3.create(lx === EP ? EP + 0.3 : lx, LIP, lz === EP ? EP + 0.3 : lz) })
    MeshRenderer.setBox(levre)
    Material.setPbrMaterial(levre, plastic(TOY.ramp))
  }

  // The treeline: inside the rim, in the band where bases are forbidden. Forty-four trees,
  // every twelve metres or so with a stride of jitter, each with its own turn and size.
  const arbres: Entity[] = []
  const bande = EDGE_MARGIN * 0.55
  for (const cote of [0, 1, 2, 3]) {
    for (let d = 10; d < SCENE_SIDE - 10; d += 17) {
      const j = (alea() - 0.5) * 6
      const r = 2.2 + alea() * 2.6
      let x = 0, z = 0
      if (cote === 0) { x = d + j; z = bande + (alea() - 0.5) * 3 }
      if (cote === 1) { x = d + j; z = SCENE_SIDE - bande + (alea() - 0.5) * 3 }
      if (cote === 2) { x = bande + (alea() - 0.5) * 3; z = d + j }
      if (cote === 3) { x = SCENE_SIDE - bande + (alea() - 0.5) * 3; z = d + j }
      if (surSpawn(x, z)) continue
      const sc = 1.1 + alea() * 0.9
      arbres.push(pose(ARBRE, x, 0, z, sc, alea() * 360))
      void r
    }
  }
  // Still, on purpose. The clip turned out to spin the canopy (tester, 31 Aug: "the models
  // rotate to face you"), and decor that tracks the player is a billboard, not a wood. The
  // Animator stays, holding the clip OFF: a model with clips and no Animator autoplays.
  for (const a of arbres) {
    Animator.create(a, { states: [{ clip: 'Tree_Action', playing: false, loop: false }] })
  }

  // Bushes: the belt lane's clearance band, forbidden to bases, walked by everyone: the
  // one strip of the field guaranteed free, and the one every player crosses every visit.
  for (const cote of [-1, 1]) {
    for (let dx = -BELT_LENGTH / 2 - 2; dx <= BELT_LENGTH / 2 + 2; dx += 5) {
      const x = CENTER.x + dx + (alea() - 0.5) * 2
      const z = CENTER.z + cote * (BELT_CLEARANCE - 1.6) + (alea() - 0.5) * 1.4
      if (surSpawn(x, z)) continue
      pose(BUISSONS[alea() < 0.5 ? 0 : 1], x, 0, z, 0.9 + alea() * 0.7, alea() * 360)
    }
  }
  // And at the feet of the rim, between the trees, so the boundary reads soft up close.
  for (let d = 8; d < SCENE_SIDE - 8; d += 23) {
    for (const [x, z] of [[d, 2.6], [SCENE_SIDE - d, SCENE_SIDE - 2.6], [2.6, SCENE_SIDE - d], [SCENE_SIDE - 2.6, d]] as Array<[number, number]>) {
      if (surSpawn(x, z)) continue
      pose(BUISSONS[alea() < 0.5 ? 0 : 1], x + (alea() - 0.5) * 2, 0, z + (alea() - 0.5) * 2, 0.8 + alea() * 0.6, alea() * 360)
    }
  }

  // Balloons: three bouquets around the plaza's fixtures, knee-high to head-high, and the
  // spiral high over the centre, the landmark you can see from any base's top floor.
  const bouquets: Array<[number, number]> = [
    [FUSION_POS.x + 1.5, FUSION_POS.z - 1.5],
    [CENTER.x + 11, CENTER.z - 7],
    [CENTER.x - 13, CENTER.z + 6.5]
  ]
  for (const [bx, bz] of bouquets) {
    for (let k = 0; k < 3; k++) {
      pose(BALLONS[k % BALLONS.length], bx + (alea() - 0.5) * 2.2, 1.1 + alea() * 1.6, bz + (alea() - 0.5) * 2.2, 0.9 + alea() * 0.5, alea() * 360)
    }
  }
  pose(SPIRALE, CENTER.x, 27, CENTER.z, 1, 0)

  console.log('[CLIENT] decor: rim, treeline, bushes, balloons placed')
}
