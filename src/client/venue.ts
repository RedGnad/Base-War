import { engine, Transform, MeshRenderer, MeshCollider, Material } from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { CENTRE } from '../shared/schemas'

/**
 * LE SOL, et RIEN D'AUTRE.
 *
 * Ce module a porte pendant une heure une place publique, une enceinte, huit mats
 * lumineux et une enseigne. Tout cela a ete RETIRE le 24 Aug: c'etait du decor decide
 * sans demande, et la direction visuelle se choisit a la fin, pas au hasard en cours de
 * route. Recuperable en un `git revert` du commit « Le lieu: sol, place publique... ».
 *
 * Ce qui reste n'est pas du decor: sans plan de sol, la scene herite du terrain de
 * l'hote (rouge dans l'apercu). Ce n'est pas un choix esthetique, c'est l'absence de
 * choix.
 *
 * L'echelle s'applique AVANT la rotation: (80, 80, 1) puis -90 deg autour de X pour que
 * la face regarde le ciel. Ecrit (80, 1, 80) au premier essai, ca donnait une bande de
 * 80 x 1 m.
 */
export function setupVenue(): void {
  const sol = engine.addEntity()
  Transform.create(sol, {
    position: Vector3.create(CENTRE.x, 0.01, CENTRE.z),
    scale: Vector3.create(80, 80, 1),
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0)
  })
  MeshRenderer.setPlane(sol)
  MeshCollider.setPlane(sol)
  Material.setPbrMaterial(sol, { albedoColor: Color4.fromHexString('#5c667aff'), metallic: 0, roughness: 0.95 })
}
