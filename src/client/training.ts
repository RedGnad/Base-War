import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard,
  PointerEvents, PointerEventType, InputAction, inputSystem, AudioSource, Entity
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { MACHINES, REPS_PAR_SERIE } from '../shared/training'
import { alerter } from './theft'

export const trainView = { machine: -1, reps: 0, cible: REPS_PAR_SERIE, rechargeSec: 0 }

type Vue = { socle: Entity; barre: Entity; etiquette: Entity; couleur: Color4; texte: string; part: number }
const vues = new Map<number, Vue>()

/**
 * MACHINES D'ENTRAINEMENT, cote client.
 *
 * Le geste est le MEME que celui de la caisse: on tape plusieurs fois de suite. Reutiliser
 * un geste deja appris plutot qu'en introduire un second est ce qui permet de l'ajouter
 * sans rallonger le tutoriel.
 *
 * La barre de progression est PHYSIQUE, posee sur la machine, pas dans le HUD: le joueur
 * regarde la machine pendant qu'il tape, pas le coin de son ecran.
 */
export function setupTraining(): void {
  for (const m of MACHINES) {
    const couleur = Color4.fromHexString(m.couleur + 'ff')

    const socle = engine.addEntity()
    Transform.create(socle, {
      position: Vector3.create(m.x, 0.45, m.z),
      scale: Vector3.create(1.7, 0.9, 1.1),
      rotation: Quaternion.fromEulerDegrees(0, 180, 0)
    })
    MeshRenderer.setBox(socle)
    MeshCollider.setBox(socle)
    Material.setPbrMaterial(socle, { albedoColor: couleur, emissiveColor: couleur, emissiveIntensity: 0.22, metallic: 0.7, roughness: 0.4 })
    PointerEvents.create(socle, {
      pointerEvents: [
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: `${m.nom}: tap to train` } },
        { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: `${m.nom}: tap to train` } }
      ]
    })

    // Rail de progression, au-dessus de la machine. Largeur 0 tant qu'on n'a rien fait.
    const rail = engine.addEntity()
    Transform.create(rail, { position: Vector3.create(m.x, 1.55, m.z), scale: Vector3.create(1.6, 0.12, 0.12) })
    MeshRenderer.setBox(rail)
    Material.setPbrMaterial(rail, { albedoColor: Color4.create(1, 1, 1, 0.14), metallic: 0, roughness: 1 })

    const barre = engine.addEntity()
    Transform.create(barre, { position: Vector3.create(m.x - 0.8, 1.55, m.z), scale: Vector3.create(0.001, 0.16, 0.16) })
    MeshRenderer.setBox(barre)
    Material.setPbrMaterial(barre, { albedoColor: couleur, emissiveColor: couleur, emissiveIntensity: 1.1 })

    const etiquette = engine.addEntity()
    Transform.create(etiquette, { position: Vector3.create(m.x, 2.1, m.z), scale: Vector3.create(0.55, 0.55, 0.55) })
    Billboard.create(etiquette, {})
    TextShape.create(etiquette, { text: `${m.nom}\ntap to train`, fontSize: 3, textColor: couleur })

    AudioSource.create(socle, { audioClipUrl: 'assets/sounds/hit.wav', playing: false, loop: false, volume: 0.5 })

    vues.set(m.id, { socle, barre, etiquette, couleur, texte: '', part: -1 })
  }

  room.onMessage('trainState', (d) => {
    trainView.machine = d.machine
    trainView.reps = d.reps
    trainView.cible = d.cible
    trainView.rechargeSec = d.rechargeSec
    peindre()
  })

  room.onMessage('trainDone', (d) => {
    const m = MACHINES.find((x) => x.id === d.machine)
    alerter(`SET COMPLETE  ·  +${d.gain} coins`, m?.couleur ?? '#8fe08f', 2600)
  })

  // Un seul systeme pour les quatre machines: on teste laquelle a ete tapee.
  engine.addSystem(() => {
    for (const [id, v] of vues) {
      const tape =
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.socle) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.socle)
      if (!tape) continue
      // On n'AVANCE RIEN localement: le serveur compte, on ne fait qu'annoncer le geste.
      // Une barre qui avance en local puis recule quand le serveur refuse est pire que
      // pas de barre du tout.
      void room.send('trainRep', { machine: id })
      const s = AudioSource.getMutableOrNull(v.socle)
      if (s !== null) { s.playing = false; s.playing = true }
    }
  })

  // Le compte a rebours de recharge descend tout seul entre deux messages du serveur.
  let acc = 0
  engine.addSystem((dt) => {
    if (trainView.rechargeSec <= 0) return
    acc += dt
    if (acc < 1) return
    acc = 0
    trainView.rechargeSec -= 1
    peindre()
  })
}

function peindre(): void {
  for (const [id, v] of vues) {
    const actif = id === trainView.machine
    const part = actif && trainView.rechargeSec === 0 ? trainView.reps / trainView.cible : 0
    if (part !== v.part) {
      v.part = part
      const t = Transform.getMutableOrNull(v.barre)
      if (t !== null) {
        // Une barre qui grandit depuis la GAUCHE: on met a l'echelle et on RECENTRE,
        // sinon elle grandirait des deux cotes a partir de son milieu.
        const m = MACHINES.find((x) => x.id === id)
        const largeur = Math.max(0.001, part * 1.6)
        t.scale = Vector3.create(largeur, 0.16, 0.16)
        if (m !== undefined) t.position = Vector3.create(m.x - 0.8 + largeur / 2, 1.55, m.z)
      }
    }
    const m2 = MACHINES.find((x) => x.id === id)
    if (m2 === undefined) continue
    const voulu = trainView.rechargeSec > 0
      ? `${m2.nom}\nresting ${trainView.rechargeSec}s`
      : actif && trainView.reps > 0
        ? `${m2.nom}\n${trainView.reps}/${trainView.cible}`
        : `${m2.nom}\ntap to train`
    if (voulu !== v.texte) {
      v.texte = voulu
      const txt = TextShape.getMutableOrNull(v.etiquette)
      if (txt !== null) txt.text = voulu
    }
  }
}
