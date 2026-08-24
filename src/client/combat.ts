import {
  engine, Transform, MeshRenderer, Material, TextShape, Billboard, Entity,
  InputAction, inputSystem, PointerEventType, AudioSource, Tween, TweenSequence, TweenLoop, EasingFunction
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { DroppedCoins, SHOT_RANGE } from '../shared/schemas'
import { room } from '../shared/messages'
import { formatIncome } from '../shared/loot-table'
import { alerter } from './theft'

export const combatView = { armed: false }

let gun = 0 as unknown as Entity
const piles = new Map<number, { body: Entity; label: Entity }>()
const OR = Color4.fromHexString('#ffd166ff')

/**
 * The pistol, client side.
 *
 * The gun is parented to engine.CameraEntity, not to the avatar: a bone anchor is animated
 * and the weapon would jitter, and PlayerEntity carries body yaw without camera pitch, so
 * the shot would ignore where the player is looking.
 *
 * The client only reports the point it aimed at. Who was hit, and how much fell, is
 * decided by the server against positions it reads itself.
 */
export function setupCombat(): void {
  gun = engine.addEntity()
  Transform.create(gun, {
    parent: engine.CameraEntity,
    position: Vector3.create(0.28, -0.22, 0.55),
    scale: Vector3.create(0.07, 0.07, 0.34),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0)
  })
  MeshRenderer.setBox(gun)
  Material.setPbrMaterial(gun, { albedoColor: Color4.fromHexString('#3a4152ff'), metallic: 0.9, roughness: 0.3 })
  AudioSource.create(gun, { audioClipUrl: 'assets/sounds/hit.wav', playing: false, loop: false, volume: 0.5 })

  room.onMessage('shotResult', (d) => {
    if (d.reason === 'hit') alerter(`HIT ${d.hitName.toUpperCase()}  ·  ${formatIncome(d.dropped)} dropped`, '#ffd166', 3000)
    else if (d.reason === 'nothing to drop') alerter(`${d.hitName.toUpperCase()} HAS NOTHING TO DROP`, '#9aa3ad', 2200)
  })
  room.onMessage('wasShot', (d) => {
    alerter(`${d.byName.toUpperCase()} SHOT YOU  ·  ${formatIncome(d.lost)} on the ground`, '#ff6b6b', 5000)
  })
  room.onMessage('pickedUp', (d) => alerter(`+${formatIncome(d.amount)} picked up`, '#8fe08f', 2500))

  engine.addSystem(() => {
    // FIRE. The aim point is the camera position pushed forward along its own facing.
    if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
      const cam = Transform.getOrNull(engine.CameraEntity)
      if (cam !== null) {
        const fwd = Vector3.rotate(Vector3.create(0, 0, SHOT_RANGE), cam.rotation)
        void room.send('shoot', { x: cam.position.x + fwd.x, y: cam.position.y, z: cam.position.z + fwd.z })
        const s = AudioSource.getMutableOrNull(gun)
        if (s !== null) { s.playing = false; s.playing = true }
      }
    }

    // Dropped piles: the server owns them, we only draw what it publishes.
    const alive = new Set<number>()
    for (const [ent, c] of engine.getEntitiesWith(DroppedCoins, Transform)) {
      const id = ent as unknown as number
      alive.add(id)
      const t = Transform.get(ent)
      let v = piles.get(id)
      if (v === undefined) {
        const body = engine.addEntity()
        Transform.create(body, { position: t.position, scale: Vector3.create(0.34, 0.12, 0.34) })
        MeshRenderer.setCylinder(body, 0.34, 0.34)
        Material.setPbrMaterial(body, { albedoColor: OR, emissiveColor: OR, emissiveIntensity: 1.6, metallic: 0.8 })
        Tween.setRotate(body, Quaternion.Identity(), Quaternion.fromEulerDegrees(0, 180, 0), 1600, EasingFunction.EF_LINEAR)
        TweenSequence.createOrReplace(body, { sequence: [], loop: TweenLoop.TL_RESTART })
        const label = engine.addEntity()
        Transform.create(label, { position: Vector3.create(t.position.x, t.position.y + 0.7, t.position.z), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(label, {})
        TextShape.create(label, { text: formatIncome(c.amount), fontSize: 3, textColor: OR })
        v = { body, label }
        piles.set(id, v)
      }
    }
    for (const [id, v] of [...piles]) {
      if (alive.has(id)) continue
      engine.removeEntity(v.body); engine.removeEntity(v.label); piles.delete(id)
    }
  })
}
