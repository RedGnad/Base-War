import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem,
  Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import {
  Plot, PLOT_MAX_OBJETS, SLOTS_PAR_ETAGE, ETAGES_MAX, ETAGE_HAUTEUR, slotPosition,
  rampePosition, BASE_COTE, MUR_EPAISSEUR, MUR_HAUTEUR, PORTE_LARGEUR, RAMPE_ANGLE, RAMPE_LONGUEUR, TREMIE_LARGEUR
} from '../shared/schemas'
import {
  rarity, rareteDe, mutationDe, couleurObjet, mutation, nomObjet, formatRevenu, revenuObjet
} from '../shared/loot-table'

/** Miroir du bareme serveur, pour afficher ce qu'un objet rapporte. */
const GAINS_UI = [1, 4, 16, 64, 256, 1024, 4096]
import { voler, revendre, monAdresseClient } from './theft'

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

// Materiaux clairs: sous un ciel de 16h, un batiment gris fonce devient une silhouette
// noire et illisible. On monte les valeurs pour que les etages se distinguent.
const GRIS = '#9aa3b0ff'
const GRIS_CLAIR = '#b6bec9ff'
const PLANCHER = '#7f8794ff'

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
 * Une paroi VITREE. Le wiki dit que le voleur « verifie quels objets sont a chaque etage »:
 * le butin doit donc se voir depuis l'exterieur, a TOUS les niveaux, pas seulement au rez.
 * Une facade ouverte ne le permet qu'en bas; le verre le permet partout, et il laisse la
 * base lisible de loin, ce qui est ce qui donne envie de venir.
 */
function vitre(x: number, y: number, z: number, sx: number, sy: number, sz: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(0.62, 0.78, 0.88, 0.22),   // alpha bas = transparent
    metallic: 0.1,
    roughness: 0.05
  })
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

  // LE PLANCHER LAISSE UNE BANDE OUVERTE cote rampe. Sans cette tremie, la rampe monte
  // dans le plafond et les etages sont inaccessibles: c'est le bug signale.
  // Une seule dalle, decalee, plutot qu'un decoupage complique.
  const plancher = bloc(x - TREMIE_LARGEUR / 2, y + 0.12, z, c - TREMIE_LARGEUR, 0.24, c, PLANCHER)
  // Les trois cotes sont VITRES: on voit le butin de partout, a tous les etages.
  // Seuls les montants et le linteau restent pleins, pour que le batiment garde une
  // structure lisible et que l'entree se distingue.
  const murs: Entity[] = [
    vitre(x, y + h / 2, z - c / 2, c, h, ep),                            // fond
    vitre(x - c / 2, y + h / 2, z, ep, h, c),                            // gauche
    vitre(x + c / 2, y + h / 2, z, ep, h, c),                            // droite
    // Facade VITREE elle aussi, de part et d'autre de l'entree: avec une base de 8 m,
    // des jambages pleins de 3 m rendaient le batiment opaque de face, donc le butin
    // invisible depuis l'exterieur. C'est precisement ce qu'il ne faut pas.
    vitre(x - (c + PORTE_LARGEUR) / 4, y + h / 2, z + c / 2, (c - PORTE_LARGEUR) / 2, h, ep),
    vitre(x + (c + PORTE_LARGEUR) / 4, y + h / 2, z + c / 2, (c - PORTE_LARGEUR) / 2, h, ep),
    bloc(x, y + h - 0.15, z + c / 2, PORTE_LARGEUR, 0.3, ep, GRIS_CLAIR),  // linteau
    // Montants d'angle pleins: sans eux le batiment n'a plus de structure lisible et
    // se confond avec le decor.
    bloc(x - c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, GRIS),
    bloc(x + c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, GRIS),
    bloc(x - c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, GRIS),
    bloc(x + c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, GRIS)
  ]

  // Rampe vers l'etage suivant, le long du mur droit.
  const r = rampePosition(etage)
  const rampe = engine.addEntity()
  Transform.create(rampe, {
    position: Vector3.create(x + r.dx, y + ETAGE_HAUTEUR / 2, z + r.dz),
    scale: Vector3.create(1.1, 0.18, RAMPE_LONGUEUR),
    rotation: Quaternion.fromEulerDegrees(-RAMPE_ANGLE, 0, 0)
  })
  MeshRenderer.setBox(rampe)
  MeshCollider.setBox(rampe)
  Material.setPbrMaterial(rampe, { albedoColor: Color4.fromHexString('#c9a227ff'), roughness: 0.7, metallic: 0.3 })

  return { plancher, murs, rampe }
}
const vues = new Map<number, Vue>()   // clef = entite synchronisee du Plot

function creerVue(x: number, z: number): Vue {
  // Le socle deborde du batiment: un parvis, qui donne au lieu une assise.
  const socle = bloc(x, 0.06, z, BASE_COTE + 1.6, 0.12, BASE_COTE + 1.6, '#6b6f78ff')

  const etages: Etage[] = []
  for (let e = 0; e < ETAGES_MAX; e++) etages.push(construireEtage(x, z, e))

  /**
   * BOUCLIER, et non une porte. Une porte qui n'empeche pas d'entrer par le haut ne
   * veut rien dire: le vrai barrage est la verification serveur, et une decoration qui
   * pretend bloquer ment au joueur.
   * Un dome translucide englobe TOUTE la base, toits compris. Il ne bloque rien
   * physiquement (aucun collider), il DIT que le serveur refusera le vol.
   */
  const porte = engine.addEntity()
  Transform.create(porte, {
    position: Vector3.create(x, (ETAGES_MAX * ETAGE_HAUTEUR) / 2, z),
    scale: Vector3.create(0, 0, 0)
  })
  MeshRenderer.setBox(porte)
  Material.setPbrMaterial(porte, {
    albedoColor: Color4.create(0.30, 0.85, 1.0, 0.16),
    emissiveColor: Color4.fromHexString('#4dd2ffff'),
    emissiveIntensity: 0.55,
    metallic: 0,
    roughness: 0.1
  })
  // On vole en tapant LA BASE, pas un bouton flottant: la cible du geste est la chose
  // convoitee. Plus lisible pour un juge, et utilisable au doigt sur mobile.
  PointerEvents.create(socle, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Steal' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Steal' } }
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
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Steal' } },
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Steal' } }
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
        ) {
          // MEME GESTE, CIBLE DIFFERENTE: chez soi on revend pour faire de la place,
          // chez les autres on vole. C'est la seule facon de remplacer un Commun par
          // un Epique quand la base est pleine.
          if (v.ownerId.toLowerCase() === monAdresseClient()) revendre(k)
          else voler(v.ownerId, k)
          return
        }
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
      // Le decompte du verrou entre dans la signature a la SECONDE, pas a l'image:
      // sinon soit l'etiquette ne se rafraichit jamais, soit on repeint 30 fois/s.
      const secondesVerrou = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.etages}|${secondesVerrou}|${p.items.join(',')}`
      if (sig === v.signature) continue
      v.signature = sig
      v.ownerId = p.ownerId

      // Le libelle du survol dit ce que le geste FERA, et ca depend de qui possede.
      // Le survol NOMME l'objet et dit ce qu'il rapporte: sans ca, une base de six
      // cubes colores ne se lit pas, et une mutation ne se distingue pas d'une rarete.
      const mien = p.ownerId.toLowerCase() === monAdresseClient()
      const verbe = mien ? 'Sell' : 'Steal'
      for (let k = 0; k < v.objets.length; k++) {
        const code = p.items[k]
        const libelle = code === undefined
          ? verbe
          : `${verbe} ${nomObjet(rareteDe(code), mutationDe(code))} · ${formatRevenu(revenuObjet(code, GAINS_UI))}/s`
        PointerEvents.createOrReplace(v.objets[k], {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: libelle } },
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: libelle } }
          ]
        })
      }

      const txt = TextShape.getMutableOrNull(v.etiquette)
      if (txt !== null) {
        // Le nom reste affiche meme absent: une base occupee n'est jamais vide a l'ecran,
        // et c'est elle que les autres viendront piller.
        const verrou = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
        const etat = verrou > 0 ? `\nLOCKED ${verrou}s` : (p.ownerPresent ? '' : '\n(away)')
        txt.text = `${p.ownerName}${etat}`
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
        mettre(et.plancher, BASE_COTE - TREMIE_LARGEUR, 0.24, BASE_COTE)
        mettre(et.murs[0], BASE_COTE, MUR_HAUTEUR, MUR_EPAISSEUR)
        mettre(et.murs[1], MUR_EPAISSEUR, MUR_HAUTEUR, BASE_COTE)
        mettre(et.murs[2], MUR_EPAISSEUR, MUR_HAUTEUR, BASE_COTE)
        mettre(et.murs[3], (BASE_COTE - PORTE_LARGEUR) / 2, MUR_HAUTEUR, MUR_EPAISSEUR)
        mettre(et.murs[4], (BASE_COTE - PORTE_LARGEUR) / 2, MUR_HAUTEUR, MUR_EPAISSEUR)
        mettre(et.murs[5], PORTE_LARGEUR, 0.3, MUR_EPAISSEUR)
        for (let m = 6; m <= 9; m++) mettre(et.murs[m], 0.28, MUR_HAUTEUR, 0.28)
        // la rampe ne sert que s'il y a un etage AU-DESSUS a rejoindre
        mettre(et.rampe, 1.1, 0.18, RAMPE_LONGUEUR)
        const rtr = Transform.getMutableOrNull(et.rampe)
        if (rtr !== null && (e + 1) >= p.etages) rtr.scale = Vector3.create(0, 0, 0)
      }

      // Le bouclier apparait quand la base est protegee: la mecanique devient VISIBLE
      // de loin, et un voleur sait avant de traverser le lieu que c'est inutile.
      const ptr = Transform.getMutableOrNull(v.porte)
      if (ptr !== null) {
        const verrouille = p.lockedUntil > Date.now()
        const h = p.etages * ETAGE_HAUTEUR + 0.6
        ptr.position = Vector3.create(t.position.x, h / 2, t.position.z)
        ptr.scale = verrouille
          ? Vector3.create(BASE_COTE + 1.2, h, BASE_COTE + 1.2)
          : Vector3.create(0, 0, 0)
      }

      for (let k = 0; k < v.objets.length; k++) {
        const tr = Transform.getMutableOrNull(v.objets[k])
        if (tr === null) continue
        const d = slotPosition(k)
        if (k < p.items.length) {
          // Taille, lueur et rotation portent la rarete: lisible de loin, sans texte.
          // La MUTATION domine l'apparence: un Gold Common doit se voir comme dore,
          // pas comme un commun gris. C'est ce qui rend une mutation desirable a voler.
          const code = p.items[k]
          const r = rarity(rareteDe(code))
          const m = mutation(mutationDe(code))
          tr.position = Vector3.create(t.position.x + d.dx, d.dy, t.position.z + d.dz)
          const taille = r.taille * (m.mult > 1 ? 1.12 : 1)
          tr.scale = Vector3.create(taille, taille, taille)
          const c = Color4.fromHexString(couleurObjet(rareteDe(code), mutationDe(code)) + 'ff')
          Material.setPbrMaterial(v.objets[k], {
            albedoColor: c, emissiveColor: c, emissiveIntensity: r.glow, roughness: 0.35, metallic: 0.6
          })
          if (r.tours > 0 || m.mult > 1) {
            Tween.createOrReplace(v.objets[k], {
              mode: Tween.Mode.Rotate({ start: Quaternion.Identity(), end: Quaternion.fromEulerDegrees(0, 180, 0) }),
              duration: Math.round(360000 / Math.max(1, r.tours + (m.mult > 1 ? 30 : 0))),
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
