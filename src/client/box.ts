import {
  engine, Transform, MeshRenderer, MeshCollider, Material, PointerEvents, PointerEventType,
  InputAction, inputSystem, Tween, TweenSequence, EasingFunction, Entity, AudioSource, timers
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { room } from '../shared/messages'
import { Plot } from '../shared/schemas'
import { rarity, boite, RARITIES } from '../shared/loot-table'

let monAdresse = ''

/**
 * OUVERTURE D'UNE BOITE. C'est LE moment du jeu: la donnee dit qu'une boucle entiere
 * faite d'ouvrir des boites tient 10 205 joueurs simultanes a 97 % d'approbation
 * (`Unbox ASMR`), et 49 746 pour `Sol's RNG`. Un tirage instantane supprime le produit.
 *
 * Trois temps:
 *  1. la boite apparait devant le joueur
 *  2. TROIS TAPS RAPIDES la fissurent, avec un retour a chaque coup
 *  3. une ROULETTE defile, ralentit, et s'arrete sur ce que le SERVEUR a decide
 *
 * Le resultat n'est jamais calcule ici: la roulette atterrit sur la reponse serveur.
 */

const COUPS = 3

export const boxView = {
  stock: [] as number[],
  ouverture: false,
  coups: 0,
  typeEnCours: 0,
  /** roulette */
  roule: false,
  index: 0,
  resultat: -1,
  /** instant jusqu'auquel le resultat reste affiche apres l'arret de la roulette */
  resultatJusqua: 0,
  /** 'expose' | 'en-stock' | 'plein' */
  etat: 'expose',
  message: ''
}

let boite3d: Entity
let sonneur: Entity
let prochainPas = 0
let pasCourant = 0
let restant = 0

export function setupBox(): void {
  boite3d = engine.addEntity()
  Transform.create(boite3d, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0, 0, 0) })
  MeshRenderer.setBox(boite3d)
  MeshCollider.setBox(boite3d)
  PointerEvents.create(boite3d, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Smash' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Smash' } }
    ]
  })

  sonneur = engine.addEntity()
  Transform.create(sonneur, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
  AudioSource.create(sonneur, { audioClipUrl: 'assets/sounds/alerte-vol.wav', playing: false, loop: false, volume: 0.7 })

  room.onMessage('inventory', (d) => { boxView.stock = [...d.boites] })

  engine.addSystem(() => {
    if (monAdresse !== '') return
    const me = getPlayer()
    if (me !== null) monAdresse = me.userId.toLowerCase()
  })

  room.onMessage('boxResult', (d) => {
    // On lance la roulette VERS le resultat serveur. Duree fixe, ralentissement continu.
    boxView.roule = true
    boxView.resultat = d.rarity
    // On dit la VERITE sur ce qui vient d'arriver a l'objet. Annoncer « pose sur ta
    // base » quand il n'y a pas de base laisse le joueur devant un compteur immobile
    // sans aucun moyen de comprendre.
    boxView.etat = d.etat
    restant = 2.6
    prochainPas = 0.045
    pasCourant = 0

    // On memorise ou etait la boite AVANT de la ranger: c'est de la que part l'objet.
    const t = Transform.getOrNull(boite3d)
    const depart = t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
    rangerBoite()
    if (depart !== null && d.etat === 'expose') {
      // L'envoi part a la FIN de la roulette, pas avant: sinon on voit le resultat
      // filer vers la base pendant qu'on attend encore de savoir ce que c'est.
      timers.setTimeout(() => envoyerVersBase(depart, d.rarity), 2700)
    }
  })

  engine.addSystem((dt: number) => {
    // --- les trois coups ---
    if (boxView.ouverture) {
      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, boite3d) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, boite3d)
      ) {
        boxView.coups += 1
        const b = boite(boxView.typeEnCours)
        // Secousse d'echelle: chaque coup se SENT, sinon les trois taps sont une corvee.
        Tween.createOrReplace(boite3d, {
          mode: Tween.Mode.Scale({
            start: Vector3.create(b.taille * 0.72, b.taille * 1.25, b.taille * 0.72),
            end: Vector3.create(b.taille, b.taille, b.taille)
          }),
          duration: 190,
          easingFunction: EasingFunction.EF_EASEOUTELASTIC,
          currentTime: 0
        })
        const a = AudioSource.getMutableOrNull(sonneur)
        if (a !== null) { a.playing = false; a.playing = true }

        if (boxView.coups >= COUPS) {
          boxView.ouverture = false
          void room.send('openBox', { typeBoite: boxView.typeEnCours })
        }
      }
    }

    // --- la roulette ---
    if (boxView.roule) {
      restant -= dt
      pasCourant += dt
      if (pasCourant >= prochainPas) {
        pasCourant = 0
        boxView.index = (boxView.index + 1) % RARITIES.length
        // Le pas s'allonge: la roulette RALENTIT, c'est ce qui cree l'attente.
        prochainPas = Math.min(0.34, prochainPas * 1.085)
      }
      if (restant <= 0) {
        boxView.roule = false
        boxView.index = boxView.resultat
        // Le resultat RESTE a l'ecran: sans ce temps de lecture, la roulette s'arrete
        // et il ne se passe visiblement rien. C'est le paiement du geste.
        boxView.resultatJusqua = Date.now() + 3200
        console.log(`[CLIENT] boite ouverte -> ${rarity(boxView.resultat).nom}`)
      }
    } else if (boxView.resultat >= 0 && Date.now() > boxView.resultatJusqua) {
      boxView.resultat = -1
      boxView.message = ''
    }
  })
}

function rangerBoite(): void {
  // SUPPRIMER LE TWEEN D'ABORD. Celui du dernier coup continue d'ecrire l'echelle a
  // chaque image et ecrase le masquage: la boite restait plantee au sol.
  Tween.deleteFrom(boite3d)
  const t = Transform.getMutableOrNull(boite3d)
  if (t !== null) { t.scale = Vector3.create(0, 0, 0); t.position = Vector3.create(0, -10, 0) }
}

/**
 * L'OBJET PART VERS LA BASE. Comportement de la reference:
 * *« You can buy one, and the Brainrot will go to your base »*.
 * Sans ce trajet, rien ne relie visuellement ce qu'on vient d'ouvrir a l'endroit ou
 * ca se met a rapporter.
 */
function envoyerVersBase(depart: Vector3, rarete: number): void {
  const cible = positionDeMaBase()
  if (cible === null) return

  const e = engine.addEntity()
  const r = rarity(rarete)
  Transform.create(e, { position: depart, scale: Vector3.create(r.taille, r.taille, r.taille) })
  MeshRenderer.setBox(e)
  const c = Color4.fromHexString(r.couleur + 'ff')
  Material.setPbrMaterial(e, { albedoColor: c, emissiveColor: c, emissiveIntensity: 1.2 })

  // Il passe PAR LE HAUT: une trajectoire rectiligne se lit mal et traverse les murs.
  const haut = Vector3.create((depart.x + cible.x) / 2, Math.max(depart.y, cible.y) + 5, (depart.z + cible.z) / 2)
  Tween.createOrReplace(e, {
    mode: Tween.Mode.Move({ start: depart, end: haut }),
    duration: 420,
    easingFunction: EasingFunction.EF_EASEOUTQUAD
  })
  TweenSequence.createOrReplace(e, {
    sequence: [{
      mode: Tween.Mode.Move({ start: haut, end: cible }),
      duration: 520,
      easingFunction: EasingFunction.EF_EASEINQUAD
    }]
  })
  timers.setTimeout(() => engine.removeEntity(e), 1100)
}

/** Position de MA base, lue dans l'etat autoritaire. */
function positionDeMaBase(): Vector3 | null {
  if (monAdresse === '') return null
  for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
    if (p.ownerId.toLowerCase() !== monAdresse) continue
    const t = Transform.get(ent)
    return Vector3.create(t.position.x, 1.4, t.position.z)
  }
  return null
}

/** Fait apparaitre la boite devant le joueur et arme les trois coups. */
export function ouvrirBoite(typeBoite: number): void {
  if (boxView.ouverture || boxView.roule) return
  if (!boxView.stock.includes(typeBoite)) return
  if (!Transform.has(engine.PlayerEntity)) return

  const p = Transform.get(engine.PlayerEntity)
  // Deux metres DEVANT le joueur: il ne doit pas avoir a marcher pour ouvrir.
  const avant = Vector3.rotate(Vector3.create(0, 0, 2), p.rotation)
  const b = boite(typeBoite)

  boxView.ouverture = true
  boxView.coups = 0
  boxView.typeEnCours = typeBoite
  boxView.message = ''

  const t = Transform.getMutableOrNull(boite3d)
  if (t !== null) {
    t.position = Vector3.create(p.position.x + avant.x, 1.1, p.position.z + avant.z)
    t.scale = Vector3.create(b.taille, b.taille, b.taille)
    t.rotation = Quaternion.fromEulerDegrees(0, 25, 0)
  }
  const c = Color4.fromHexString(b.couleur + 'ff')
  Material.setPbrMaterial(boite3d, { albedoColor: c, emissiveColor: c, emissiveIntensity: 0.4, metallic: 0.5, roughness: 0.4 })
}

/** Ouvre la meilleure boite disponible. */
export function ouvrirMeilleure(): void {
  if (boxView.stock.length === 0) return
  ouvrirBoite(Math.max(...boxView.stock))
}
