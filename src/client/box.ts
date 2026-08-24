import {
  engine, Transform, MeshRenderer, MeshCollider, Material, PointerEvents, PointerEventType,
  InputAction, inputSystem, Tween, TweenSequence, EasingFunction, Entity, AudioSource, timers
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { room } from '../shared/messages'
import { Plot, SLOTS_PAR_ETAGE } from '../shared/schemas'
import { rarity, boite, RARITIES, mutation, nomObjet, couleurObjet } from '../shared/loot-table'
import { alerter } from './theft'

let monAdresse = ''

const COUPS = 3

export const boxView = {
  stock: [] as number[],
  ouverture: false,
  coups: 0,
  typeEnCours: 0,
  roule: false,
  index: 0,
  resultat: -1,
  resultatMutation: 0,
  resultatJusqua: 0,
  etat: 'expose',
  message: ''
}

let boite3d: Entity
let sonCoup: Entity
let sonBurst: Entity
let sonReveal: Entity
const eclats: Entity[] = []
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

  const emetteur = (clip: string, vol: number): Entity => {
    const e = engine.addEntity()
    Transform.create(e, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
    AudioSource.create(e, { audioClipUrl: clip, playing: false, loop: false, volume: vol })
    return e
  }
  sonCoup = emetteur('assets/sounds/hit.wav', 0.9)
  sonBurst = emetteur('assets/sounds/burst.wav', 1)
  sonReveal = emetteur('assets/sounds/reveal.wav', 0.85)

  for (let i = 0; i < 14; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0, 0, 0) })
    MeshRenderer.setBox(e)
    eclats.push(e)
  }

  room.onMessage('inventory', (d) => { boxView.stock = [...d.boites] })

  engine.addSystem(() => {
    if (monAdresse !== '') return
    const me = getPlayer()
    if (me !== null) monAdresse = me.userId.toLowerCase()
  })

  room.onMessage('boxResult', (d) => {
    boxView.roule = true
    boxView.resultat = d.rarity
    boxView.resultatMutation = d.mutation
    boxView.etat = d.etat
    restant = 2.6
    prochainPas = 0.045
    pasCourant = 0

    const depart = dernierePosition
    if (depart !== null && d.etat === 'expose') {
      timers.setTimeout(() => envoyerVersBase(depart, d.rarity, d.mutation), 2700)
    }
  })

  engine.addSystem((dt: number) => {
    if (boxView.ouverture) {
      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, boite3d) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, boite3d)
      ) {
        boxView.coups += 1
        const b = boite(boxView.typeEnCours)
        Tween.createOrReplace(boite3d, {
          mode: Tween.Mode.Scale({
            start: Vector3.create(b.taille * 0.72, b.taille * 1.25, b.taille * 0.72),
            end: Vector3.create(b.taille, b.taille, b.taille)
          }),
          duration: 190,
          easingFunction: EasingFunction.EF_EASEOUTELASTIC,
          currentTime: 0
        })
        jouer(sonCoup)

        const usure = boxView.coups / COUPS
        Material.setPbrMaterial(boite3d, {
          albedoColor: Color4.fromHexString(b.couleur + 'ff'),
          emissiveColor: Color4.fromHexString(b.couleur + 'ff'),
          emissiveIntensity: 0.4 + usure * 1.6,
          metallic: 0.5,
          roughness: 0.4
        })

        if (boxView.coups >= COUPS) {
          boxView.ouverture = false
          const t = Transform.getOrNull(boite3d)
          if (t !== null) exploser(Vector3.create(t.position.x, t.position.y, t.position.z), b.couleur)
          rangerBoite()
          void room.send('openBox', { typeBoite: boxView.typeEnCours })
        }
      }
    }

    if (boxView.roule) {
      restant -= dt
      pasCourant += dt
      if (pasCourant >= prochainPas) {
        pasCourant = 0
        boxView.index = (boxView.index + 1) % RARITIES.length
        prochainPas = Math.min(0.34, prochainPas * 1.085)
      }
      if (restant <= 0) {
        boxView.roule = false
        boxView.index = boxView.resultat
        jouer(sonReveal)
        boxView.resultatJusqua = Date.now() + 3200
        console.log(`[CLIENT] boite ouverte -> ${nomObjet(boxView.resultat, boxView.resultatMutation)}`)
      }
    } else if (boxView.resultat >= 0 && Date.now() > boxView.resultatJusqua) {
      boxView.resultat = -1
      boxView.message = ''
    }
  })
}

let dernierePosition: Vector3 | null = null

function jouer(e: Entity): void {
  const a = AudioSource.getMutableOrNull(e)
  if (a !== null) { a.playing = false; a.playing = true }
}

function exploser(centre: Vector3, couleur: string): void {
  dernierePosition = centre
  jouer(sonBurst)
  const c = Color4.fromHexString(couleur + 'ff')
  for (let i = 0; i < eclats.length; i++) {
    const e = eclats[i]
    const a = (i / eclats.length) * Math.PI * 2
    const h = 0.6 + (i % 3) * 0.5
    const r = 1.6 + (i % 4) * 0.45
    const t = Transform.getMutableOrNull(e)
    if (t === null) continue
    t.position = centre
    t.scale = Vector3.create(0.16, 0.16, 0.16)
    Material.setPbrMaterial(e, { albedoColor: c, emissiveColor: c, emissiveIntensity: 1.4 })
    Tween.createOrReplace(e, {
      mode: Tween.Mode.Move({
        start: centre,
        end: Vector3.create(centre.x + Math.cos(a) * r, centre.y + h, centre.z + Math.sin(a) * r)
      }),
      duration: 260,
      easingFunction: EasingFunction.EF_EASEOUTQUAD
    })
    TweenSequence.createOrReplace(e, {
      sequence: [{
        mode: Tween.Mode.Move({
          start: Vector3.create(centre.x + Math.cos(a) * r, centre.y + h, centre.z + Math.sin(a) * r),
          end: Vector3.create(centre.x + Math.cos(a) * r * 1.5, 0.2, centre.z + Math.sin(a) * r * 1.5)
        }),
        duration: 520,
        easingFunction: EasingFunction.EF_EASEINQUAD
      }]
    })
  }
  timers.setTimeout(() => {
    for (const e of eclats) {
      const t = Transform.getMutableOrNull(e)
      if (t !== null) { t.scale = Vector3.create(0, 0, 0); t.position = Vector3.create(0, -10, 0) }
      Tween.deleteFrom(e); TweenSequence.deleteFrom(e)
    }
  }, 850)
}

function rangerBoite(): void {
  Tween.deleteFrom(boite3d)
  const t = Transform.getMutableOrNull(boite3d)
  if (t !== null) { t.scale = Vector3.create(0, 0, 0); t.position = Vector3.create(0, -10, 0) }
}

function envoyerVersBase(depart: Vector3, rarete: number, mut = 0): void {
  const cible = positionDeMaBase()
  if (cible === null) return

  const e = engine.addEntity()
  const r = rarity(rarete)
  Transform.create(e, { position: depart, scale: Vector3.create(r.taille, r.taille, r.taille) })
  MeshRenderer.setBox(e)
  const c = Color4.fromHexString(couleurObjet(rarete, mut) + 'ff')
  Material.setPbrMaterial(e, { albedoColor: c, emissiveColor: c, emissiveIntensity: 1.2 })

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

function positionDeMaBase(): Vector3 | null {
  if (monAdresse === '') return null
  for (const [ent, p] of engine.getEntitiesWith(Plot, Transform)) {
    if (p.ownerId.toLowerCase() !== monAdresse) continue
    const t = Transform.get(ent)
    return Vector3.create(t.position.x, 1.4, t.position.z)
  }
  return null
}

function maBasePleine(): boolean {
  const me = getPlayer()
  if (me === null) return false
  const a = me.userId.toLowerCase()
  for (const [, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== a) continue
    return p.items.length >= SLOTS_PAR_ETAGE * p.etages
  }
  return false
}

export function ouvrirBoite(typeBoite: number): void {
  if (boxView.ouverture || boxView.roule) return
  if (!boxView.stock.includes(typeBoite)) return
  if (!Transform.has(engine.PlayerEntity)) return

  if (maBasePleine()) {
    alerter('BASE FULL: SELL AN ITEM OR BUY A FLOOR', '#ff6b6b', 4000)
    return
  }

  const p = Transform.get(engine.PlayerEntity)
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

export function ouvrirMeilleure(): void {
  if (boxView.stock.length === 0) return
  ouvrirBoite(Math.max(...boxView.stock))
}
