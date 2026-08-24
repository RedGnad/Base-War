import { PRODUCTION_RARETE } from '../shared/economie'
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
// UNE SEULE DEFINITION DANS LE DEPOT. Cette table etait recopiee ici et dans deux
// autres fichiers; a la refonte du 24 Aug elle a diverge du serveur en trois endroits,
// et l'interface annoncait des revenus faux. Une table dupliquee finit toujours par
// mentir.
const GAINS_UI = PRODUCTION_RARETE

/**
 * SELECTION POUR DEPLACER. Sur mobile il n'y a ni glisser ni clic droit: le motif qui
 * marche est TAPER LA SOURCE puis TAPER LA DESTINATION. L'objet selectionne monte et
 * grossit, pour qu'on voie ce qu'on tient.
 */
export const placementView = { selection: -1 }

/**
 * Monte d'un etage dans SA base, et redescend au rez apres le dernier etage ouvert.
 * Un ascenseur qui bloquerait en haut obligerait a redescendre la rampe: le raccourci
 * ne servirait qu'une fois sur deux.
 */
function monterUnEtage(v: Vue): void {
  const t = Transform.getOrNull(v.socle)
  if (t === null) return
  let ouverts = 1
  for (const [, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() === v.ownerId.toLowerCase()) { ouverts = p.etages; break }
  }
  const moi = Transform.getOrNull(engine.PlayerEntity)
  const actuel = moi === null ? 0 : Math.max(0, Math.round(moi.position.y / ETAGE_HAUTEUR))
  const cible = actuel + 1 >= ouverts ? 0 : actuel + 1
  const y = cible * ETAGE_HAUTEUR + 0.3
  // ON DEPOSE SUR LE PLANCHER PLEIN, PAS DANS LA TREMIE.
  // Defaut trouve par le calcul le 24 Aug: la sortie etait a dx = +4,0 alors que la
  // dalle s'arrete a dx = +2,5. On etait donc teleporte a 1,5 m au-dela du plancher,
  // dans la cage d'escalier, et on retombait aussitot. Le joueur croyait a un ascenseur
  // casse; c'etait une coordonnee jamais confrontee a la geometrie.
  // +1,96 est le milieu entre le dernier objet (bord a +1,425) et le vide (+2,5).
  const SORTIE_DX = 1.96
  void movePlayerTo({
    newRelativePosition: Vector3.create(t.position.x + SORTIE_DX, y, t.position.z + 3.0),
    // ET ON REGARDE VERS LES OBJETS. Arriver face au vide ne dit pas ou l'on est;
    // arriver face a son butin situe immediatement l'etage.
    cameraTarget: Vector3.create(t.position.x - 1.2, y + 0.8, t.position.z - 2.2)
  })
}
import { voler, revendre, monAdresseClient, deplacer, offrir, alerter } from './theft'
import { movePlayerTo } from '~system/RestrictedActions'

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
  etages: Etage[]; objets: Entity[]; sentinelle: Entity; ascenseur: Entity; signature: string; ownerId: string
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
    scale: Vector3.create(TREMIE_LARGEUR - 0.3, 0.18, RAMPE_LONGUEUR),
    rotation: Quaternion.fromEulerDegrees(-RAMPE_ANGLE, 0, 0)
  })
  MeshRenderer.setBox(rampe)
  MeshCollider.setBox(rampe)
  Material.setPbrMaterial(rampe, { albedoColor: Color4.fromHexString('#c9a227ff'), roughness: 0.7, metallic: 0.3 })

  // DEUX RAILS, ENFANTS DE LA RAMPE pour suivre sa pente sans un calcul de plus.
  // Une rampe de 1,1 m au milieu d'une tremie de 3 m laissait 95 cm de vide de chaque
  // cote: on montait sur une planche bordee de deux trous. Elle est portee a 2,7 m,
  // c'est-a-dire la largeur de sa cage moins un jeu de 15 cm, et bordee.
  for (const cote of [-1, 1]) {
    const rail = engine.addEntity()
    Transform.create(rail, {
      parent: rampe,
      position: Vector3.create(cote * 0.5, 3.0, 0),
      scale: Vector3.create(0.06, 6.0, 1.0)
    })
    MeshRenderer.setBox(rail)
    MeshCollider.setBox(rail)
    Material.setPbrMaterial(rail, { albedoColor: Color4.fromHexString('#7d8698ff'), roughness: 0.6, metallic: 0.4 })
  }

  // ============================================================================
  // GARDE-CORPS DE LA TREMIE.
  // Le plancher plein s'arrete a dx = +2,5 et le vide court jusqu'a +5,5: c'est un
  // trou de 3 x 11 m au milieu de l'etage, sans rien autour. On y tombait en marchant,
  // et l'ascenseur y deposait le joueur (voir plus bas). Un escalier sans garde-corps
  // n'est pas un choix de style, c'est un plancher inacheve.
  //
  // Trois cotes seulement: le quatrieme, cote -X, est l'arrivee de la rampe. Une
  // barriere sur les quatre cotes fermerait l'acces qu'elle est censee securiser.
  // ============================================================================
  const RAIL_H = 1.1
  const bordTremie = c / 2 - TREMIE_LARGEUR
  murs.push(
    // le long du vide, cote interieur: c'est celui-la qu'on longe en circulant
    bloc(x + bordTremie, y + RAIL_H / 2, z, 0.12, RAIL_H, c, '#7d8698'),
    // les deux extremites de la tremie
    bloc(x + c / 2 - TREMIE_LARGEUR / 2, y + RAIL_H / 2, z - c / 2 + 0.06, TREMIE_LARGEUR, RAIL_H, 0.12, '#7d8698'),
    bloc(x + c / 2 - TREMIE_LARGEUR / 2, y + RAIL_H / 2, z + c / 2 - 0.06, TREMIE_LARGEUR, RAIL_H, 0.12, '#7d8698')
  )

  return { plancher, murs, rampe }
}
const vues = new Map<number, Vue>()   // clef = entite synchronisee du Plot

function creerVue(x: number, z: number): Vue {
  // Le socle deborde du batiment: un parvis, qui donne au lieu une assise.
  const socle = bloc(x, 0.06, z, BASE_COTE + 1.6, 0.12, BASE_COTE + 1.6, '#6b6f78ff')

  const etages: Etage[] = []
  for (let e = 0; e < ETAGES_MAX; e++) etages.push(construireEtage(x, z, e))

  /**
   * ASCENSEUR. Source, transcription 1: *« un systeme d'ascenseur pour se deplacer
   * d'etage en etage »*.
   *
   * IL NE SERT QU'AU PROPRIETAIRE, et c'est le point mecanique: la montee est le COUT
   * que paie le voleur (malus de vitesse et de saut sur une rampe). Un ascenseur ouvert
   * a tous supprimerait ce cout et rendrait la hauteur inutile, alors que c'est elle qui
   * fait que l'objet le plus rare, place en haut, est le plus difficile a prendre.
   */
  // UNE COLONNE QUI TRAVERSE TOUS LES ETAGES, pas une borne au rez-de-chaussee.
  // Defaut signale le 24 Aug: j'avais pose UNE entite a hauteur d'homme au sol, donc
  // acheter un etage donnait un etage sans ascenseur. Une colonne montante est
  // atteignable depuis CHAQUE niveau, et sa hauteur suit les etages ouverts (mise a jour
  // dans la boucle d'affichage, comme les planchers et les murs).
  const ascenseur = engine.addEntity()
  Transform.create(ascenseur, {
    position: Vector3.create(x + BASE_COTE / 2 - TREMIE_LARGEUR / 2, ETAGE_HAUTEUR / 2, z + 1.4),
    scale: Vector3.create(0.5, ETAGE_HAUTEUR, 0.5)
  })
  MeshRenderer.setBox(ascenseur)
  MeshCollider.setBox(ascenseur)
  Material.setPbrMaterial(ascenseur, {
    albedoColor: Color4.fromHexString('#2f3648ff'),
    emissiveColor: Color4.fromHexString('#4dd2ffff'), emissiveIntensity: 0.7,
    metallic: 0.85, roughness: 0.25
  })
  PointerEvents.create(ascenseur, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Elevator' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Elevator' } }
    ]
  })

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
  // DEUX CIBLES, DEUX SENS, aucun bouton flottant:
  //   taper un OBJET sur la base d'un autre  = PRENDRE
  //   taper LE SOCLE d'un autre, un objet en main = LAISSER
  // Le socle portait deja un PointerEvents « Steal » que plus rien n'ecoutait depuis que
  // le vol vise l'objet: c'etait une affordance morte. Il porte maintenant le don.
  PointerEvents.create(socle, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Leave a gift' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Leave a gift' } }
    ]
  })

  // LA SENTINELLE, sur le toit. Un texte se lit de pres; une forme se voit de loin, et
  // c'est de loin qu'on choisit quelle base on va tenter.
  const sentinelle = engine.addEntity()
  Transform.create(sentinelle, {
    position: Vector3.create(x, ETAGES_MAX * ETAGE_HAUTEUR + 0.35, z),
    scale: Vector3.create(0, 0, 0)
  })
  MeshRenderer.setCylinder(sentinelle, 0.25, 0.45)
  Material.setPbrMaterial(sentinelle, {
    albedoColor: Color4.fromHexString('#4dd2ffff'),
    emissiveColor: Color4.fromHexString('#4dd2ffff'),
    emissiveIntensity: 1.6, metallic: 0.8, roughness: 0.2
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
  return { socle, etiquette, porte, sentinelle, ascenseur, etages, objets, signature: '', ownerId: '' }
}

function detruireVue(v: Vue): void {
  engine.removeEntity(v.socle)
  engine.removeEntity(v.etiquette)
  engine.removeEntity(v.porte)
  engine.removeEntity(v.sentinelle)
  engine.removeEntity(v.ascenseur)
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
          // CHEZ SOI: on SELECTIONNE, puis un second tap deplace. Chez les autres: on vole.
          if (v.ownerId.toLowerCase() === monAdresseClient()) {
            if (placementView.selection === -1) {
              placementView.selection = k
            } else if (placementView.selection === k) {
              placementView.selection = -1          // meme objet: on relache
            } else {
              deplacer(placementView.selection, k)  // echange des deux places
              placementView.selection = -1
            }
          } else {
            voler(v.ownerId, k)
          }
          return
        }
      }

      // L'ASCENSEUR: il monte d'un etage, et revient au rez apres le dernier.
      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.ascenseur) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.ascenseur)
      ) {
        if (v.ownerId.toLowerCase() !== monAdresseClient()) {
          alerter('THAT ELEVATOR IS NOT YOURS: TAKE THE RAMP', '#ffd166', 3500)
          return
        }
        monterUnEtage(v)
        return
      }

      // LE SOCLE D'UN AUTRE JOUEUR: on y laisse l'objet qu'on tient.
      // Sans objet selectionne, le geste n'a pas de sens et on le dit, plutot que de
      // laisser un tap sans effet: un refus muet se lit comme un bug.
      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.socle) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.socle)
      ) {
        if (v.ownerId === '' || v.ownerId.toLowerCase() === monAdresseClient()) return
        if (placementView.selection === -1) {
          alerter('PICK ONE OF YOUR ITEMS FIRST, THEN TAP THEIR BASE', '#ffd166', 3500)
          return
        }
        offrir(v.ownerId, placementView.selection)
        placementView.selection = -1
        return
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
      const monBase = p.ownerId.toLowerCase() === monAdresseClient()
      // LA SIGNATURE NE PORTE QUE CE QUI EST STRUCTUREL.
      // Bug trouve le 24 Aug sur signalement: `secondesVerrou` en faisait partie. Or il
      // change CHAQUE SECONDE. La signature changeait donc chaque seconde, tout le bloc
      // de reconstruction repassait, et `Tween.createOrReplace` REDEMARRAIT la rotation
      // des objets depuis l'identite: les cubes tressautaient au lieu de tourner.
      // Le meme defaut reecrivait aussi, une fois par seconde et pour rien, le materiau
      // et la position de chaque objet de chaque base.
      // REGLE: une valeur qui varie en continu (compte a rebours, jauge) ne doit jamais
      // entrer dans une cle de cache censee detecter un changement de STRUCTURE. Elle se
      // met a jour a part, sur son propre element.
      // CE QUI BAT LA SECONDE PASSE AVANT LE TEST DE SIGNATURE.
      // L'etiquette porte le compte a rebours du verrou et le dome de protection change
      // d'echelle avec lui: tous deux doivent se mettre a jour meme quand la structure
      // de la base n'a pas bouge. Ils ne reconstruisent rien, ils ecrivent une valeur.
      const txt = TextShape.getMutableOrNull(v.etiquette)
      if (txt !== null) {
        // Le nom reste affiche meme absent: une base occupee n'est jamais vide a l'ecran,
        // et c'est elle que les autres viendront piller.
        const verrou = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
        const etat = verrou > 0 ? `\nLOCKED ${verrou}s` : (p.ownerPresent ? '' : '\n(away)')
        // LE BILAN SOCIAL, sous le nom. Il ne se montre que s'il a quelque chose a dire:
        // « 0 given, 0 received » sur chaque base transformerait le lieu en tableur.
        // Quand il parle, il dit qu'une personne vit ici et que d'autres sont passees.
        const bilan = (p.donnes > 0 || p.recus > 0)
          ? `\n${p.recus} received  ·  ${p.donnes} given`
          : ''
        // LA DEFENSE SE LIT AVANT D'ENTRER. C'est ce qui fait du raid une decision au lieu
        // d'un ramassage: on voit ce qu'on risque, et on choisit une autre base ou on tente.
        // L'ascenseur monte AVEC le batiment.
        const ta = Transform.getMutableOrNull(v.ascenseur)
        if (ta !== null) {
          const h = p.etages * ETAGE_HAUTEUR
          ta.scale = Vector3.create(0.5, h, 0.5)
          ta.position = Vector3.create(
            t.position.x + BASE_COTE / 2 - TREMIE_LARGEUR / 2, h / 2, t.position.z + 1.4
          )
        }
        const garde = p.sentinelles > 0 ? `\nSENTRY x${p.sentinelles}` : ''
        const ts = Transform.getMutableOrNull(v.sentinelle)
        if (ts !== null) {
          // Elle grandit avec ses charges: une sentinelle a une charge se voit plus petite
          // qu'une sentinelle a trois, donc la faiblesse aussi se lit de loin.
          const k = p.sentinelles === 0 ? 0 : 0.6 + p.sentinelles * 0.18
          ts.scale = Vector3.create(k, k, k)
        }
        txt.text = `${p.ownerName}${etat}${garde}${bilan}`
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


      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.etages}|${p.items.join(',')}|${p.donnes}|${p.recus}|${p.sentinelles}|${monBase ? placementView.selection : -1}`
      if (sig === v.signature) continue
      v.signature = sig
      v.ownerId = p.ownerId

      // Le libelle du survol dit ce que le geste FERA, et ca depend de qui possede.
      // Le survol NOMME l'objet et dit ce qu'il rapporte: sans ca, une base de six
      // cubes colores ne se lit pas, et une mutation ne se distingue pas d'une rarete.
      const mien = monBase
      const verbe = mien
        ? (placementView.selection === -1 ? 'Move' : 'Swap here')
        : 'Steal'
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
          const choisi = mien && placementView.selection === k
          tr.position = Vector3.create(t.position.x + d.dx, d.dy + (choisi ? 0.55 : 0), t.position.z + d.dz)
          const taille = r.taille * (m.mult > 1 ? 1.12 : 1) * (choisi ? 1.25 : 1)
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
