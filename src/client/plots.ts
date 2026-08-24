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

const GAINS_UI = PRODUCTION_RARETE

export const placementView = { selection: -1 }

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
  // Land on the solid slab, not in the stairwell: the floor stops at dx = +2.5.
  const SORTIE_DX = 1.96
  void movePlayerTo({
    newRelativePosition: Vector3.create(t.position.x + SORTIE_DX, y, t.position.z + 3.0),
    cameraTarget: Vector3.create(t.position.x - 1.2, y + 0.8, t.position.z - 2.2)
  })
}
import { voler, revendre, monAdresseClient, deplacer, offrir, alerter } from './theft'
import { movePlayerTo } from '~system/RestrictedActions'

type Etage = { plancher: Entity; murs: Entity[]; rampe: Entity }
type Vue = {
  socle: Entity; etiquette: Entity; porte: Entity
  etages: Etage[]; objets: Entity[]; sentinelle: Entity; ascenseur: Entity; signature: string; ownerId: string
}

const GRIS = '#9aa3b0ff'
const GRIS_CLAIR = '#b6bec9ff'
const PLANCHER = '#7f8794ff'

function bloc(x: number, y: number, z: number, sx: number, sy: number, sz: number, couleur: string): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: Color4.fromHexString(couleur), roughness: 0.85 })
  return e
}

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

function construireEtage(x: number, z: number, etage: number): Etage {
  const y = etage * ETAGE_HAUTEUR
  const c = BASE_COTE
  const h = MUR_HAUTEUR
  const ep = MUR_EPAISSEUR

  const plancher = bloc(x - TREMIE_LARGEUR / 2, y + 0.12, z, c - TREMIE_LARGEUR, 0.24, c, PLANCHER)
  const murs: Entity[] = [
    vitre(x, y + h / 2, z - c / 2, c, h, ep),                            // fond
    vitre(x - c / 2, y + h / 2, z, ep, h, c),                            // gauche
    vitre(x + c / 2, y + h / 2, z, ep, h, c),                            // droite
    vitre(x - (c + PORTE_LARGEUR) / 4, y + h / 2, z + c / 2, (c - PORTE_LARGEUR) / 2, h, ep),
    vitre(x + (c + PORTE_LARGEUR) / 4, y + h / 2, z + c / 2, (c - PORTE_LARGEUR) / 2, h, ep),
    bloc(x, y + h - 0.15, z + c / 2, PORTE_LARGEUR, 0.3, ep, GRIS_CLAIR),  // linteau
    bloc(x - c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, GRIS),
    bloc(x + c / 2, y + h / 2, z - c / 2, 0.28, h, 0.28, GRIS),
    bloc(x - c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, GRIS),
    bloc(x + c / 2, y + h / 2, z + c / 2, 0.28, h, 0.28, GRIS)
  ]

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

  const RAIL_H = 1.1
  const bordTremie = c / 2 - TREMIE_LARGEUR
  murs.push(
    bloc(x + bordTremie, y + RAIL_H / 2, z, 0.12, RAIL_H, c, '#7d8698'),
    bloc(x + c / 2 - TREMIE_LARGEUR / 2, y + RAIL_H / 2, z - c / 2 + 0.06, TREMIE_LARGEUR, RAIL_H, 0.12, '#7d8698'),
    bloc(x + c / 2 - TREMIE_LARGEUR / 2, y + RAIL_H / 2, z + c / 2 - 0.06, TREMIE_LARGEUR, RAIL_H, 0.12, '#7d8698')
  )

  return { plancher, murs, rampe }
}
const vues = new Map<number, Vue>()   // clef = entite synchronisee du Plot

function creerVue(x: number, z: number): Vue {
  const socle = bloc(x, 0.06, z, BASE_COTE + 1.6, 0.12, BASE_COTE + 1.6, '#6b6f78ff')

  const etages: Etage[] = []
  for (let e = 0; e < ETAGES_MAX; e++) etages.push(construireEtage(x, z, e))

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
  PointerEvents.create(socle, {
    pointerEvents: [
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: 'Leave a gift' } },
      { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Leave a gift' } }
    ]
  })

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
  engine.addSystem(() => {
    for (const v of vues.values()) {
      for (let k = 0; k < v.objets.length; k++) {
        if (
          inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.objets[k]) ||
          inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.objets[k])
        ) {
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

      const secondesVerrou = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
      const monBase = p.ownerId.toLowerCase() === monAdresseClient()
      const txt = TextShape.getMutableOrNull(v.etiquette)
      if (txt !== null) {
        const verrou = Math.max(0, Math.ceil((p.lockedUntil - Date.now()) / 1000))
        const etat = verrou > 0 ? `\nLOCKED ${verrou}s` : (p.ownerPresent ? '' : '\n(away)')
        const bilan = (p.donnes > 0 || p.recus > 0)
          ? `\n${p.recus} received  ·  ${p.donnes} given`
          : ''
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
          const k = p.sentinelles === 0 ? 0 : 0.6 + p.sentinelles * 0.18
          ts.scale = Vector3.create(k, k, k)
        }
        txt.text = `${p.ownerName}${etat}${garde}${bilan}`
        txt.textColor = p.ownerPresent ? Color4.White() : Color4.fromHexString('#9aa4b2ff')
      }
      Material.setPbrMaterial(v.socle, {
        albedoColor: Color4.fromHexString(p.ownerPresent ? '#4a5568ff' : '#40454fff')
      })

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
        mettre(et.rampe, 1.1, 0.18, RAMPE_LONGUEUR)
        const rtr = Transform.getMutableOrNull(et.rampe)
        if (rtr !== null && (e + 1) >= p.etages) rtr.scale = Vector3.create(0, 0, 0)
      }

      const ptr = Transform.getMutableOrNull(v.porte)
      if (ptr !== null) {
        const verrouille = p.lockedUntil > Date.now()
        const h = p.etages * ETAGE_HAUTEUR + 0.6
        ptr.position = Vector3.create(t.position.x, h / 2, t.position.z)
        ptr.scale = verrouille
          ? Vector3.create(BASE_COTE + 1.2, h, BASE_COTE + 1.2)
          : Vector3.create(0, 0, 0)
      }

      // The signature only carries STRUCTURAL state. A value that ticks every second
      // (a countdown, a gauge) belongs on its own element: inside a cache key it forces
      // a full rebuild each second, which restarts item rotation tweens from identity.
      const sig = `${p.ownerId}|${p.ownerName}|${p.ownerPresent}|${p.etages}|${p.items.join(',')}|${p.donnes}|${p.recus}|${p.sentinelles}|${monBase ? placementView.selection : -1}`
      if (sig === v.signature) continue
      v.signature = sig
      v.ownerId = p.ownerId

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

    for (const [id, v] of vues) {
      if (vivantes.has(id)) continue
      detruireVue(v)
      vues.delete(id)
    }
  })
}
