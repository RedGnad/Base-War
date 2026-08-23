import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem,
  Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import {
  Plot, PLOT_MAX_OBJETS, SLOTS_PAR_ETAGE, ETAGES_MAX, ETAGE_HAUTEUR, slotPosition,
  rampePosition, BASE_COTE, MUR_EPAISSEUR, MUR_HAUTEUR, PORTE_LARGEUR
} from '../shared/schemas'
import { rarity } from '../shared/loot-table'
import { voler } from './theft'

/**
 * Rendu DYNAMIQUE des bases: une vue apparait quand le serveur cree une base, disparait
 * quand il la retire. Le client ne fait que PEINDRE l'etat autoritaire, il ne cree ni ne
 * supprime aucun objet de jeu de son propre chef.
 *
 * Seules les entites RENDUES comptent dans les limites de scene (doc `scene-limitations`),
 * donc une base retiree ne coute rien.
 */

type Etage = { plancher: Entity; murs: Entity[]; rampe: Entity }
type Vue = {
  socle: Entity; etiquette: Entity; porte: Entity
  etages: Etage[]; objets: Entity[]; signature: string; ownerId: string
}

const GRIS = '#5b6472ff'
const GRIS_CLAIR = '#6e7889ff'

/** Un pave plein, l'unite de construction du batiment. */
function bloc(x: number, y: number, z: number, sx: number, sy: number, sz: number, couleur: string): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: Color4.fromHexString(couleur), roughness: 0.85 })
  return e
}

/**
 * Un etage: son plancher, trois murs, et l'ouverture en facade.
 * La FACE AVANT (+Z) reste ouverte: le butin doit se voir de l'exterieur, sinon personne
 * ne sait ce qu'il y a a prendre et le lieu n'attire personne.
 */
function construireEtage(x: number, z: number, etage: number): Etage {
  const y = etage * ETAGE_HAUTEUR
  const c = BASE_COTE
  const h = MUR_HAUTEUR
  const ep = MUR_EPAISSEUR

  const plancher = bloc(x, y + 0.12, z, c, 0.24, c, etage === 0 ? '#4a5568ff' : GRIS)
  const murs: Entity[] = [
    bloc(x, y + h / 2, z - c / 2, c, h, ep, GRIS),                       // fond
    bloc(x - c / 2, y + h / 2, z, ep, h, c, GRIS),                       // gauche
    bloc(x + c / 2, y + h / 2, z, ep, h, c, GRIS),                       // droite
    // facade: deux jambages qui laissent l'entree au milieu
    bloc(x - (c + PORTE_LARGEUR) / 4, y + h / 2, z + c / 2, (c - PORTE_LARGEUR) / 2, h, ep, GRIS_CLAIR),
    bloc(x + (c + PORTE_LARGEUR) / 4, y + h / 2, z + c / 2, (c - PORTE_LARGEUR) / 2, h, ep, GRIS_CLAIR),
    bloc(x, y + h - 0.2, z + c / 2, PORTE_LARGEUR, 0.4, ep, GRIS_CLAIR)  // linteau
  ]

  // Rampe vers l'etage suivant, le long du mur droit.
  const r = rampePosition(etage)
  const rampe = engine.addEntity()
  Transform.create(rampe, {
    position: Vector3.create(x + r.dx, y + ETAGE_HAUTEUR / 2, z + r.dz),
    scale: Vector3.create(1.2, 0.2, ETAGE_HAUTEUR * 1.9),
    rotation: Quaternion.fromEulerDegrees(-32, 0, 0)
  })
  MeshRenderer.setBox(rampe)
  MeshCollider.setBox(rampe)
  Material.setPbrMaterial(rampe, { albedoColor: Color4.fromHexString('#7a8496ff'), roughness: 0.9 })

  return { plancher, murs, rampe }
}
const vues = new Map<number, Vue>()   // clef = entite synchronisee du Plot

function creerVue(x: number, z: number): Vue {
  // Le socle deborde du batiment: un parvis, qui donne au lieu une assise.
  const socle = bloc(x, 0.06, z, BASE_COTE + 1.6, 0.12, BASE_COTE + 1.6, '#3b424dff')

  const etages: Etage[] = []
  for (let e = 0; e < ETAGES_MAX; e++) etages.push(construireEtage(x, z, e))

  // La porte n'apparait QUE verrouille: c'est le rendu visible de la mecanique 3.2.
  const porte = bloc(x, MUR_HAUTEUR / 2, z + BASE_COTE / 2, PORTE_LARGEUR, MUR_HAUTEUR - 0.4, MUR_EPAISSEUR, '#c94f3dff')
  Transform.getMutable(porte).scale = Vector3.create(0, 0, 0)
  // On vole en tapant LA BASE, pas un bouton flottant: la cible du geste est la chose
  // convoitee. Plus lisible pour un juge, et utilisable au doigt sur mobile.
  PointerEvents.create(socle, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Prendre un objet' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Prendre un objet' } }
    ]
  })

  const etiquette = engine.addEntity()
  Transform.create(etiquette, { position: Vector3.create(x, ETAGES_MAX * ETAGE_HAUTEUR + 1.0, z), scale: Vector3.create(0.6, 0.6, 0.6) })
  Billboard.create(etiquette, {})
  TextShape.create(etiquette, { text: '', fontSize: 3, textColor: Color4.White() })

  const objets: Entity[] = []
  for (let k = 0; k < PLOT_MAX_OBJETS; k++) {
    const o = engine.addEntity()
    const d = slotPosition(k)
    Transform.create(o, {
      position: Vector3.create(x + d.dx, -5, z + d.dz),
      scale: Vector3.create(0.45, 0.45, 0.45)
    })
    MeshRenderer.setBox(o)
    MeshCollider.setBox(o)
    // C'est l'OBJET qu'on vise, pas la base: le voleur choisit sa cible, comme chez le #1.
    PointerEvents.create(o, {
      pointerEvents: [
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Prendre' } },
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Prendre' } }
      ]
    })
    objets.push(o)
  }
  return { socle, etiquette, porte, etages, objets, signature: '', ownerId: '' }
}

function detruireVue(v: Vue): void {
  engine.removeEntity(v.socle)
  engine.removeEntity(v.etiquette)
  engine.removeEntity(v.porte)
  for (const e of v.etages) {
    engine.removeEntity(e.plancher)
    engine.removeEntity(e.rampe)
    for (const m of e.murs) engine.removeEntity(m)
  }
  for (const o of v.objets) engine.removeEntity(o)
}

export function setupPlots(): void {
  // Une frappe sur n'importe quelle base declenche la demande de vol. Le SERVEUR
  // choisit la cible par proximite et refuse tout ce qui doit l'etre.
  // On vise UN OBJET precis. Taper le socle ne vole rien: il faut designer sa prise.
  engine.addSystem(() => {
    for (const v of vues.values()) {
      for (let k = 0; k < v.objets.length; k++) {
        if (
          inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.objets[k]) ||
          inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.objets[k])
        ) { voler(v.ownerId, k); return }
      }
    }
  })

  engine.addSystem(() => {
    const vivantes = new Set<number>()

    for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
      const id = ent as unknown as number
      vivantes.add(id)
      const t = Transform.get(ent)
      let v = vues.get(id)
      if (!v) {
        v = creerVue(t.position.x, t.position.z)
        vues.set(id, v)
      }

      // Le verrou entre dans la signature en BOOLEEN, pas en horodatage: sinon la vue se
      // repeindrait a chaque image pendant toute la duree du verrou.
      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.etages}|${p.lockedUntil > Date.now() ? 1 : 0}|${p.items.join(',')}`
      if (sig === v.signature) continue
      v.signature = sig
      v.ownerId = p.ownerId

      const txt = TextShape.getMutableOrNull(v.etiquette)
      if (txt !== null) {
        // Le nom reste affiche meme absent: une base occupee n'est jamais vide a l'ecran,
        // et c'est elle que les autres viendront piller.
        txt.text = p.ownerPresent ? p.ownerName : `${p.ownerName}\n(absent)`
        txt.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')
      }
      Material.setPbrMaterial(v.socle, {
        albedoColor: Color4.fromHexString(p.ownerPresent ? '#4a5568ff' : '#40454fff')
      })

      // Un etage non debloque disparait entierement: murs, plancher et rampe.
      // Le batiment POUSSE a mesure qu'on progresse, et ca se voit de loin.
      for (let e = 0; e < v.etages.length; e++) {
        const ouvert = e < p.etages
        const et = v.etages[e]
        const mettre = (ent: Entity, sx: number, sy: number, sz: number) => {
          const tr = Transform.getMutableOrNull(ent)
          if (tr !== null) tr.scale = ouvert ? Vector3.create(sx, sy, sz) : Vector3.create(0, 0, 0)
        }
        mettre(et.plancher, BASE_COTE, 0.24, BASE_COTE)
        mettre(et.murs[0], BASE_COTE, MUR_HAUTEUR, MUR_EPAISSEUR)
        mettre(et.murs[1], MUR_EPAISSEUR, MUR_HAUTEUR, BASE_COTE)
        mettre(et.murs[2], MUR_EPAISSEUR, MUR_HAUTEUR, BASE_COTE)
        mettre(et.murs[3], (BASE_COTE - PORTE_LARGEUR) / 2, MUR_HAUTEUR, MUR_EPAISSEUR)
        mettre(et.murs[4], (BASE_COTE - PORTE_LARGEUR) / 2, MUR_HAUTEUR, MUR_EPAISSEUR)
        mettre(et.murs[5], PORTE_LARGEUR, 0.4, MUR_EPAISSEUR)
        // la rampe ne sert que s'il y a un etage AU-DESSUS a rejoindre
        mettre(et.rampe, 1.2, 0.2, ETAGE_HAUTEUR * 1.9)
        const rtr = Transform.getMutableOrNull(et.rampe)
        if (rtr !== null && (e + 1) >= p.etages) rtr.scale = Vector3.create(0, 0, 0)
      }

      // La porte se ferme quand la base est verrouillee: la mecanique devient VISIBLE.
      const ptr = Transform.getMutableOrNull(v.porte)
      if (ptr !== null) {
        const verrouille = p.lockedUntil > Date.now()
        ptr.scale = verrouille ? Vector3.create(PORTE_LARGEUR, MUR_HAUTEUR - 0.4, MUR_EPAISSEUR) : Vector3.create(0, 0, 0)
      }

      for (let k = 0; k < v.objets.length; k++) {
        const tr = Transform.getMutableOrNull(v.objets[k])
        if (tr === null) continue
        const d = slotPosition(k)
        if (k < p.items.length) {
          // Taille, lueur et rotation portent la rarete: lisible de loin, sans texte.
          const r = rarity(p.items[k])
          tr.position = Vector3.create(t.position.x + d.dx, d.dy, t.position.z + d.dz)
          tr.scale = Vector3.create(r.taille, r.taille, r.taille)
          const c = Color4.fromHexString(r.couleur + 'ff')
          Material.setPbrMaterial(v.objets[k], {
            albedoColor: c, emissiveColor: c, emissiveIntensity: r.glow, roughness: 0.35, metallic: 0.6
          })
          if (r.tours > 0) {
            Tween.createOrReplace(v.objets[k], {
              mode: Tween.Mode.Rotate({ start: Quaternion.Identity(), end: Quaternion.fromEulerDegrees(0, 180, 0) }),
              duration: Math.round(360000 / r.tours),
              easingFunction: EasingFunction.EF_LINEAR
            })
            TweenSequence.createOrReplace(v.objets[k], { sequence: [], loop: TweenLoop.TL_RESTART })
          } else {
            Tween.deleteFrom(v.objets[k])
            TweenSequence.deleteFrom(v.objets[k])
          }
        } else {
          tr.position = Vector3.create(t.position.x, -5, t.position.z)
        }
      }
    }

    // Une base retiree par le serveur emporte sa vue: aucun socle fantome.
    for (const [id, v] of vues) {
      if (vivantes.has(id)) continue
      detruireVue(v)
      vues.delete(id)
    }
  })
}
