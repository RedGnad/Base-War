import { engine, Transform, MeshRenderer, MeshCollider, Material } from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { CENTER, SCENE_SIDE } from '../shared/schemas'

/**
 * A ground plane. Without one the scene inherits the host terrain.
 * Scale applies BEFORE rotation, so a horizontal NxN plane is (N, N, 1) rotated -90
 * around X — not (N, 1, N), which yields an Nx1 strip.
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
  Material.setPbrMaterial(sol, { albedoColor: Color4.fromHexString('#5c667aff'), metallic: 0, roughness: 0.95 })
}
