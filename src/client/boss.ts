import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard,
  PointerEvents, PointerEventType, InputAction, inputSystem, AudioSource, Entity
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { Boss, BOSS_POSITION } from '../shared/schemas'
import { room } from '../shared/messages'
import { boite } from '../shared/loot-table'
import { alerter } from './theft'

export const bossView = { pv: 0, pvMax: 1, vivant: false, respawnSec: 0, dernierVainqueur: '' }

let corps = 0 as unknown as Entity
let rail = 0 as unknown as Entity
let barre = 0 as unknown as Entity
let etiquette = 0 as unknown as Entity

const VIVANT = Color4.fromHexString('#e05a5aff')
const MORT = Color4.fromHexString('#3a4050ff')

/**
 * LE BOSS, cote client.
 *
 * Il est fait des memes primitives que le reste: aucun modele, aucune texture. Le budget
 * de materiaux d'une scene est LOGARITHMIQUE (log2(n+1) x 20 pour 25 parcelles), donc
 * chaque materiau supplementaire est cher; on reutilise la palette existante.
 *
 * L'etat entier vient du composant synchronise, jamais d'un calcul local: deux joueurs
 * qui frappent doivent voir la MEME barre de vie descendre, et c'est le serveur qui la
 * tient.
 */
let dernierVivant = true
let dernierTexte = ''

export function setupBoss(): void {
  corps = engine.addEntity()
  Transform.create(corps, {
    position: Vector3.create(BOSS_POSITION.x, 2.2, BOSS_POSITION.z),
    scale: Vector3.create(3.2, 4.4, 3.2),
    rotation: Quaternion.fromEulerDegrees(0, 45, 0)
  })
  MeshRenderer.setBox(corps)
  MeshCollider.setBox(corps)
  Material.setPbrMaterial(corps, { albedoColor: VIVANT, emissiveColor: VIVANT, emissiveIntensity: 0.5, metallic: 0.8, roughness: 0.3 })
  PointerEvents.create(corps, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'HIT THE BOSS' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'HIT THE BOSS' } }
    ]
  })
  AudioSource.create(corps, { audioClipUrl: 'assets/sounds/hit.wav', playing: false, loop: false, volume: 0.8 })

  rail = engine.addEntity()
  Transform.create(rail, { position: Vector3.create(BOSS_POSITION.x, 5.4, BOSS_POSITION.z), scale: Vector3.create(4.2, 0.28, 0.28) })
  MeshRenderer.setBox(rail)
  Material.setPbrMaterial(rail, { albedoColor: Color4.create(0, 0, 0, 0.5) })

  barre = engine.addEntity()
  Transform.create(barre, { position: Vector3.create(BOSS_POSITION.x, 5.4, BOSS_POSITION.z), scale: Vector3.create(4.2, 0.34, 0.34) })
  MeshRenderer.setBox(barre)
  Material.setPbrMaterial(barre, { albedoColor: VIVANT, emissiveColor: VIVANT, emissiveIntensity: 1.2 })

  etiquette = engine.addEntity()
  Transform.create(etiquette, { position: Vector3.create(BOSS_POSITION.x, 6.2, BOSS_POSITION.z), scale: Vector3.create(0.9, 0.9, 0.9) })
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
    // 1. lire l'etat autoritaire
    for (const [, b] of engine.getEntitiesWith(Boss)) {
      bossView.pv = b.pv; bossView.pvMax = b.pvMax; bossView.vivant = b.vivant
      bossView.respawnSec = b.respawnSec; bossView.dernierVainqueur = b.dernierVainqueur
      break
    }

    // 2. le geste
    const tape =
      inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, corps) ||
      inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, corps)
    if (tape && bossView.vivant) {
      void room.send('hitBoss', {})
      const s = AudioSource.getMutableOrNull(corps)
      if (s !== null) { s.playing = false; s.playing = true }
    }

    // 3. l'affichage suit l'etat, sans jamais l'anticiper
    const part = bossView.pvMax > 0 ? bossView.pv / bossView.pvMax : 0
    const tb = Transform.getMutableOrNull(barre)
    if (tb !== null) {
      const largeur = Math.max(0.001, part * 4.2)
      tb.scale = Vector3.create(largeur, 0.34, 0.34)
      tb.position = Vector3.create(BOSS_POSITION.x - 2.1 + largeur / 2, 5.4, BOSS_POSITION.z)
    }
    const tc = Transform.getMutableOrNull(corps)
    if (tc !== null) {
      // Il RETRECIT en perdant sa vie: le progres se lit de loin, sans lire la barre.
      const h = bossView.vivant ? 2.4 + part * 2.0 : 0.6
      tc.scale = Vector3.create(3.2, h, 3.2)
      tc.position = Vector3.create(BOSS_POSITION.x, h / 2, BOSS_POSITION.z)
    }
    // Le materiau ne se reecrit QU'AU CHANGEMENT d'etat. Le reecrire a chaque image
    // marque le composant sale a chaque frame et le fait serialiser pour rien.
    if (bossView.vivant !== dernierVivant) {
      dernierVivant = bossView.vivant
      const c = bossView.vivant ? VIVANT : MORT
      Material.setPbrMaterial(corps, { albedoColor: c, emissiveColor: c, emissiveIntensity: bossView.vivant ? 0.5 : 0.05, metallic: 0.8, roughness: 0.3 })
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
