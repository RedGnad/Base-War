import { TransitionMode, SkyboxTime, engine, Transform, MeshRenderer, MeshCollider, Material, TextureWrapMode } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { CENTER, SCENE_SIDE } from '../shared/schemas'
import { setEventFloor, materiauDuSol } from './events'
import { TOY } from './toy'

/**
 * A ground plane. Without one the scene inherits the host terrain.
 * Scale applies BEFORE rotation, so a horizontal NxN plane is (N, N, 1) rotated -90
 * around X, not (N, 1, N), which yields an Nx1 strip.
 */
export function setupVenue(): void {
  const sol = engine.addEntity()
  Transform.create(sol, {
    position: Vector3.create(CENTER.x, 0.01, CENTER.z),
    scale: Vector3.create(SCENE_SIDE, SCENE_SIDE, 1),
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0)
  })
  MeshRenderer.setPlane(sol)
  MeshCollider.setPlane(sol)
  // A play mat: matte green, the table every toy stands on.
  Material.setPbrMaterial(sol, materiauDuSol(TOY.ground))
  setEventFloor(sol, TOY.ground)
  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 37_800, transitionMode: TransitionMode.TM_FORWARD })

  // The event floors' textures, fetched now rather than at the first event: a texture is
  // requested when a material first names it, and an event floor that appears untextured
  // for its first seconds is the same cold-start defect the reel had.
  for (const f of ['mat-gold', 'mat-lava', 'mat-cursed']) {
    const chauffe = engine.addEntity()
    Transform.create(chauffe, { position: Vector3.create(CENTER.x, -2, CENTER.z), scale: Vector3.create(0.01, 0.01, 0.01) })
    MeshRenderer.setPlane(chauffe)
    Material.setPbrMaterial(chauffe, { texture: Material.Texture.Common({ src: `assets/textures/${f}.png`, wrapMode: TextureWrapMode.TWM_REPEAT }) })
  }
}
