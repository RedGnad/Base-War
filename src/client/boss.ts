import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard,
  PointerEvents, PointerEventType, InputAction, inputSystem, AudioSource, Entity, Tween
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { Boss, BOSS_POSITION } from '../shared/schemas'
import { room } from '../shared/messages'
import { boite } from '../shared/loot-table'
import { alerter } from './theft'

export const bossView = { pv: 0, pvMax: 1, vivant: false, respawnSec: 0, dernierVainqueur: '' }

let pivot = 0 as unknown as Entity
let corps = 0 as unknown as Entity
let barre = 0 as unknown as Entity
let etiquette = 0 as unknown as Entity
const yeux: Entity[] = []

/**
 * Rouge PROFOND, emission faible. Un rouge clair fortement emissif vire au rose et perd
 * toute charge: une couleur d'alerte doit rester une alerte.
 */
const VIVANT = Color4.fromHexString('#8f1f2eff')
const MORT = Color4.fromHexString('#3a4050ff')
const OEIL = Color4.fromHexString('#ffd166ff')

let dernierVivant = true
let dernierTexte = ''
let derniereHauteur = -1
let dernierePart = -1

/**
 * LE BOSS, cote client.
 *
 * Tout son etat vient du composant synchronise, jamais d'un calcul local: deux joueurs
 * qui frappent doivent voir LA MEME barre descendre, et c'est le serveur qui la tient.
 *
 * STRUCTURE EN DEUX ENTITES, et c'est deliberе:
 * un PIVOT porte la rotation continue, le CORPS est son enfant et porte la taille. Un
 * tween ecrit le Transform de son entite a chaque image; si le meme Transform portait
 * aussi la hauteur, les deux ecritures se marcheraient dessus et le boss tremblerait.
 */
export function setupBoss(): void {
  pivot = engine.addEntity()
  Transform.create(pivot, { position: Vector3.create(BOSS_POSITION.x, 0, BOSS_POSITION.z) })
  // `setRotateContinuous` prend un AXE (la partie imaginaire du quaternion) et une
  // vitesse en DEGRES PAR SECONDE; l'angle du quaternion passe est ignore.
  Tween.setRotateContinuous(pivot, Quaternion.fromEulerDegrees(0, 1, 0), 14)

  corps = engine.addEntity()
  Transform.create(corps, { parent: pivot, position: Vector3.create(0, 2.2, 0), scale: Vector3.create(3.2, 4.4, 3.2) })
  MeshRenderer.setBox(corps)
  MeshCollider.setBox(corps)
  Material.setPbrMaterial(corps, { albedoColor: VIVANT, emissiveColor: VIVANT, emissiveIntensity: 0.22, metallic: 0.55, roughness: 0.45 })
  PointerEvents.create(corps, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'HIT THE BOSS' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'HIT THE BOSS' } }
    ]
  })
  AudioSource.create(corps, { audioClipUrl: 'assets/sounds/hit.wav', playing: false, loop: false, volume: 0.8 })

  // DEUX YEUX. Sans eux la cible commune n'est qu'un cube: rien ne dit ou est son
  // devant, rien ne dit qu'elle est vivante. Deux primitives suffisent.
  for (const cote of [-0.62, 0.62]) {
    const oeil = engine.addEntity()
    Transform.create(oeil, { parent: corps, position: Vector3.create(cote, 0.22, -0.52), scale: Vector3.create(0.09, 0.055, 0.02) })
    MeshRenderer.setBox(oeil)
    Material.setPbrMaterial(oeil, { albedoColor: OEIL, emissiveColor: OEIL, emissiveIntensity: 2.4 })
    yeux.push(oeil)
  }

  // Barre de vie et etiquette: NON parentees au pivot, sinon elles tourneraient avec lui
  // et deviendraient illisibles la moitie du temps.
  const rail = engine.addEntity()
  Transform.create(rail, { position: Vector3.create(BOSS_POSITION.x, 5.0, BOSS_POSITION.z), scale: Vector3.create(4.2, 0.28, 0.28) })
  MeshRenderer.setBox(rail)
  Material.setPbrMaterial(rail, { albedoColor: Color4.create(0, 0, 0, 0.55) })

  barre = engine.addEntity()
  Transform.create(barre, { position: Vector3.create(BOSS_POSITION.x, 5.0, BOSS_POSITION.z), scale: Vector3.create(4.2, 0.34, 0.34) })
  MeshRenderer.setBox(barre)
  Material.setPbrMaterial(barre, { albedoColor: VIVANT, emissiveColor: Color4.fromHexString('#ff5a6eff'), emissiveIntensity: 1.4 })

  etiquette = engine.addEntity()
  Transform.create(etiquette, { position: Vector3.create(BOSS_POSITION.x, 5.7, BOSS_POSITION.z), scale: Vector3.create(0.9, 0.9, 0.9) })
  Billboard.create(etiquette, {})
  TextShape.create(etiquette, { text: 'THE BOSS', fontSize: 3, textColor: Color4.White() })

  room.onMessage('bossDown', (d) => {
    alerter(`BOSS DOWN by ${d.parNom}  ·  ${d.participants} fighter${d.participants > 1 ? 's' : ''} paid`, '#ffd166', 7000)
  })
  room.onMessage('bossUp', () => alerter('THE BOSS IS BACK', '#e05a5a', 5000))
  room.onMessage('bossReward', (d) => {
    alerter(`${d.meilleur ? 'TOP HITTER' : 'YOUR SHARE'}  ·  ${boite(d.boite).nom} crate  (${d.coups} hits)`, d.meilleur ? '#ffd166' : '#8fe08f', 6000)
  })

  engine.addSystem(() => {
    for (const [, b] of engine.getEntitiesWith(Boss)) {
      bossView.pv = b.pv; bossView.pvMax = b.pvMax; bossView.vivant = b.vivant
      bossView.respawnSec = b.respawnSec; bossView.dernierVainqueur = b.dernierVainqueur
      break
    }

    const tape =
      inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, corps) ||
      inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, corps)
    if (tape && bossView.vivant) {
      void room.send('hitBoss', {})
      const s = AudioSource.getMutableOrNull(corps)
      if (s !== null) { s.playing = false; s.playing = true }
    }

    // TOUTE ECRITURE EST GARDEE PAR UN CHANGEMENT DE VALEUR.
    // Reecrire un composant a chaque image le marque sale a chaque image et le fait
    // serialiser pour rien, meme quand la valeur est identique.
    const part = bossView.pvMax > 0 ? bossView.pv / bossView.pvMax : 0
    if (part !== dernierePart) {
      dernierePart = part
      const tb = Transform.getMutableOrNull(barre)
      if (tb !== null) {
        const largeur = Math.max(0.001, part * 4.2)
        tb.scale = Vector3.create(largeur, 0.34, 0.34)
        tb.position = Vector3.create(BOSS_POSITION.x - 2.1 + largeur / 2, 5.0, BOSS_POSITION.z)
      }
    }

    // Il RETRECIT en perdant sa vie: le progres se lit de loin, sans lire la barre.
    const h = bossView.vivant ? 2.4 + part * 2.0 : 0.6
    if (h !== derniereHauteur) {
      derniereHauteur = h
      const tc = Transform.getMutableOrNull(corps)
      if (tc !== null) {
        tc.scale = Vector3.create(3.2, h, 3.2)
        tc.position = Vector3.create(0, h / 2, 0)
      }
      for (const o of yeux) {
        // Les yeux heritent de l'echelle du corps: on compense en Y pour qu'ils ne
        // s'ecrasent pas quand il rapetisse.
        const to = Transform.getMutableOrNull(o)
        if (to !== null) to.scale = Vector3.create(0.09, 0.055 * (4.4 / Math.max(0.6, h)), 0.02)
      }
    }

    if (bossView.vivant !== dernierVivant) {
      dernierVivant = bossView.vivant
      const c = bossView.vivant ? VIVANT : MORT
      Material.setPbrMaterial(corps, { albedoColor: c, emissiveColor: c, emissiveIntensity: bossView.vivant ? 0.22 : 0.03, metallic: 0.55, roughness: 0.45 })
    }

    const voulu = bossView.vivant
      ? `THE BOSS\n${bossView.pv}/${bossView.pvMax}`
      : `DEFEATED${bossView.dernierVainqueur === '' ? '' : ' by ' + bossView.dernierVainqueur}\nback in ${bossView.respawnSec}s`
    if (voulu !== dernierTexte) {
      dernierTexte = voulu
      const txt = TextShape.getMutableOrNull(etiquette)
      if (txt !== null) txt.text = voulu
    }
  })
}
