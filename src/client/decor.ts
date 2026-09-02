import { GltfNodeModifiers, TextureWrapMode, engine, Transform, GltfContainer, MeshRenderer, MeshCollider, Material, ColliderLayer, Entity } from '@dcl/sdk/ecs'
import { Color3, Color4, Vector2, Vector3, Quaternion } from '@dcl/sdk/math'
import { CENTER, SCENE_SIDE, EDGE_MARGIN, FUSION_POS } from '../shared/schemas'
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


/*
  The balloon mystery, solved by the tester's own eye: "one of the balloons was a 9". The
  pack is NUMBER balloons, and a flat digit orbited around shows its mirror: that was the
  whole "turns against the camera". So the rich textured balloons come back, restricted to
  the shapes that cannot mirror: the star, the flower, the sphere, and the spiral landmark.
  A digit stays out: a 9 floating over a plaza is a question nobody should be asking.
*/
/*
  The fancy trio, by the owner's third and final word: the spiky star, the flower, the
  bright sphere. Not realism: SHAPES and vivid colour are the point ("des ballons fancy
  avec des couleurs vives et des formes differentes"). The classic latex teardrops bored
  him however well they were shaded, and the star's oddball camera read is a price he
  accepts. This preference is settled; do not relitigate it through another swap.
*/
const BALLONS = ['assets/Models/balloon004.glb', 'assets/Models/balloon005.glb', 'assets/Models/balloon006.glb']
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

/*
  La bande du point d'apparition vit maintenant dans `tools/model/build-vegetation.py`.

  C'est lui qui place arbres et buissons, donc c'est lui qui doit savoir ou ne rien poser. La
  garder ici en plus aurait fait deux definitions de la meme regle, et la premiere fois que le
  point d'apparition bouge, une des deux serait restee en arriere. C'est deja arrive (1 Sep).
*/



/** The carpet's width, taken from the reference's own render: about a third of a base. */
const LARGEUR_RUE = 6

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

  /*
    Toute la vegetation en DEUX objets, et son placement vit desormais dans l'outil.

    Quarante-quatre arbres et quarante-trois buissons faisaient quatre-vingt-sept objets
    rendus, plus d'un tiers du decor, pour de l'ornement sans collider (mesure du 2 Sep). Ils
    ne bougent jamais les uns par rapport aux autres: `tools/model/build-vegetation.py` les
    fond en deux modeles a un materiau chacun, exactement comme les etages. Le placement, qui
    etait ici et tirait sur le meme generateur que les ballons, est parti avec: le repliquer
    dans l'outil ET dans le client aurait garanti la derive.
  */
  pose('assets/Models/vegetation-arbres.glb', 0, 0, 0, 1, 0)
  pose('assets/Models/vegetation-buissons.glb', 0, 0, 0, 1, 0)

  // Balloons: three bouquets around the plaza's fixtures, knee-high to head-high, and the
  // spiral high over the centre, the landmark you can see from any base's top floor.
  const bouquets: Array<[number, number]> = [
    [FUSION_POS.x + 1.5, FUSION_POS.z - 1.5],
    [CENTER.x + 11, CENTER.z - 7],
    [CENTER.x - 13, CENTER.z + 6.5]
  ]
  for (const [bx, bz] of bouquets) {
    // A ring, not a dice roll: these shapes run up to two metres wide and a random jitter
    // of +/-1.1 m stacked them into each other (owner, 1 Sep). Three points 120 degrees
    // apart on a 1.7 m radius sit 2.9 m apart at worst, clear by construction, and the
    // staggered heights keep them from ever reading as a row from any side.
    const phase = alea() * 360
    for (let k = 0; k < 3; k++) {
      const a = ((phase + k * 120) * Math.PI) / 180
      pose(BALLONS[k % BALLONS.length], bx + Math.cos(a) * 1.7, 1.2 + k * 0.7 + alea() * 0.3, bz + Math.sin(a) * 1.7, 0.9 + alea() * 0.4, alea() * 360)
    }
  }
  pose(SPIRALE, CENTER.x, 27, CENTER.z, 1, 0)

  /*
    The street: one flat strip down the middle of the field, from wall to wall.

    Two rows of buildings do not read as a street on their own; what makes a street is the
    ground between them being a different ground. The reference does exactly this and nothing
    more: a bright carpet laid flat on plain grass, no kerb, no fence, no border, and it is the
    only thing separating public ground from private (its own in-game renders, read 1 Sep). It
    also matches what actually happens here now: a bought crate travels down this strip to its
    owner's door, in reach of anyone who wants to outbid it, so the strip is not decoration,
    it is the route.

    One entity, one material, no new texture, and no collider: it is a painted line, not a
    kerb, and players cross it constantly.
  */
  const rue = engine.addEntity()
  Transform.create(rue, {
    position: Vector3.create(CENTER.x, 0.03, CENTER.z),
    scale: Vector3.create(SCENE_SIDE, 0.06, LARGEUR_RUE)
  })
  MeshRenderer.setBox(rue)
  Material.setPbrMaterial(rue, {
    ...plastic(TOY.street), roughness: 0.95,
    texture: Material.Texture.Common({
      src: 'assets/textures/mat-wall.png',
      wrapMode: TextureWrapMode.TWM_REPEAT,
      tiling: Vector2.create(SCENE_SIDE / 4, LARGEUR_RUE / 4)
    })
  })

  console.log('[CLIENT] decor: rim, treeline, bushes, balloons, street placed')
}
