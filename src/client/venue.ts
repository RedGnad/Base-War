import { engine, Transform, MeshRenderer, MeshCollider, Material } from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { CENTER } from '../shared/schemas'

/**
 * A ground plane. Without one the scene inherits the host terrain.
 * Scale applies BEFORE rotation, so a horizontal 80x80 plane is (80, 80, 1) rotated -90
 * around X — not (80, 1, 80), which yields an 80x1 strip.
 */
export function setupVenue(): void {
  const sol = engine.addEntity()
  Transform.create(sol, {
    position: Vector3.create(CENTER.x, 0.01, CENTER.z),
    scale: Vector3.create(80, 80, 1),
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0)
  })
  MeshRenderer.setPlane(sol)
  MeshCollider.setPlane(sol)
  Material.setPbrMaterial(sol, { albedoColor: Color4.fromHexString('#5c667aff'), metallic: 0, roughness: 0.95 })
}
