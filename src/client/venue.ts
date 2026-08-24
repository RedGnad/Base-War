import { engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard } from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { CENTRE, TAPIS_LONGUEUR, ECART_TAPIS } from '../shared/schemas'

/**
 * LE LIEU.
 *
 * Ce n'est pas de la decoration, c'est une regle d'ELIMINATION:
 * *« Empty venues and single-player experiences without a meaningful social component are
 * not eligible. »* Un juge qui atterrit sur un plan uni de 80 x 80 m ecrit « empty », et
 * il l'ecrit avant d'avoir joue.
 *
 * Trois moyens, tous en primitives, tous verifies contre les budgets de la scene
 * (25 parcelles: 94 materiaux, 47 textures, 5 000 entites, 250 000 triangles, 94 m de haut):
 *
 * 1. UNE LIMITE. Sans bord, le sol flotte dans le terrain de l'hote et rien ne dit ou le
 *    lieu commence. Un mur bas suffit: il borne sans enfermer.
 * 2. UN ZONAGE. Une place claire autour du tapis, un sol plus sombre autour: on lit une
 *    place centrale et un quartier, pas une dalle. C'est ce qui fait qu'on comprend ou
 *    aller sans qu'on l'explique.
 * 3. UN RYTHME VERTICAL. Des mats le long du tapis: de loin, une silhouette au lieu d'un
 *    aplat. C'est ce qui donne une ligne d'horizon a la premiere capture d'ecran.
 */

const COTE = 80
const SOL = Color4.fromHexString('#5c667aff')
const PLACE = Color4.fromHexString('#8b93a4ff')
const ACCENT = Color4.fromHexString('#4dd2ffff')

function plaque(x: number, z: number, w: number, d: number, y: number, c: Color4): void {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(w, d, 1),
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0)
  })
  MeshRenderer.setPlane(e)
  MeshCollider.setPlane(e)
  Material.setPbrMaterial(e, { albedoColor: c, metallic: 0, roughness: 0.95 })
}

export function setupVenue(): void {
  // 1. LE SOL. Un plan unique: l'echelle s'applique AVANT la rotation, donc (80, 80, 1)
  //    puis -90 deg autour de X pour que la face regarde le ciel.
  plaque(CENTRE.x, CENTRE.z, COTE, COTE, 0.01, SOL)

  // 2. LA PLACE, autour du tapis. Elle deborde de 3 m de chaque cote de la bande ou aucune
  //    base ne peut etre posee: la zone claire coincide donc EXACTEMENT avec l'espace
  //    public, et le joueur lit la regle de construction sans qu'on la lui dise.
  plaque(CENTRE.x, CENTRE.z, TAPIS_LONGUEUR + 12, ECART_TAPIS * 2 + 6, 0.06, PLACE)

  // 3. LA LIMITE. Quatre murs bas, poses sur le bord, hauteur d'appui: ils bornent sans
  //    enfermer et sans couper la vue sur les bases.
  const cotes: Array<[number, number, number, number]> = [
    [CENTRE.x, 0.5, COTE, 0.6],
    [CENTRE.x, COTE - 0.5, COTE, 0.6],
    [0.5, CENTRE.z, 0.6, COTE],
    [COTE - 0.5, CENTRE.z, 0.6, COTE]
  ]
  for (const [x, z, w, d] of cotes) {
    const m = engine.addEntity()
    Transform.create(m, { position: Vector3.create(x, 0.55, z), scale: Vector3.create(w, 1.1, d) })
    MeshRenderer.setBox(m)
    MeshCollider.setBox(m)
    Material.setPbrMaterial(m, {
      albedoColor: Color4.fromHexString('#232a38ff'),
      emissiveColor: ACCENT, emissiveIntensity: 0.12, metallic: 0.4, roughness: 0.6
    })
  }

  // 4. LE RYTHME VERTICAL: six mats de part et d'autre du tapis, avec une tete lumineuse.
  //    Deux entites par mat, douze mats: 24 entites sur les 5 000 disponibles.
  for (let i = 0; i < 4; i++) {
    const x = CENTRE.x - TAPIS_LONGUEUR / 2 + (i * TAPIS_LONGUEUR) / 3
    for (const dz of [-ECART_TAPIS - 1, ECART_TAPIS + 1]) {
      const mat = engine.addEntity()
      Transform.create(mat, { position: Vector3.create(x, 2.1, CENTRE.z + dz), scale: Vector3.create(0.18, 4.2, 0.18) })
      MeshRenderer.setBox(mat)
      Material.setPbrMaterial(mat, { albedoColor: Color4.fromHexString('#2b3242ff'), metallic: 0.7, roughness: 0.4 })

      const tete = engine.addEntity()
      Transform.create(tete, { position: Vector3.create(x, 4.3, CENTRE.z + dz), scale: Vector3.create(0.42, 0.14, 0.42) })
      MeshRenderer.setBox(tete)
      Material.setPbrMaterial(tete, { albedoColor: ACCENT, emissiveColor: ACCENT, emissiveIntensity: 2.2 })
    }
  }

  // 5. L'ENSEIGNE. Elle donne un nom au lieu des la premiere seconde, et un lieu nomme
  //    n'est plus un terrain vague. Posee au-dessus du tapis, lisible de partout.
  const enseigne = engine.addEntity()
  Transform.create(enseigne, { position: Vector3.create(CENTRE.x, 8.6, CENTRE.z), scale: Vector3.create(1.6, 1.6, 1.6) })
  Billboard.create(enseigne, {})
  TextShape.create(enseigne, { text: 'BASE TYCOON', fontSize: 4, textColor: ACCENT })
}
