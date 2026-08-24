import {
  engine, Transform, MeshRenderer, MeshCollider, Material, TextShape, Billboard, Entity,
  PointerEvents, PointerEventType, InputAction, inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Convoi, CONVOI_SURENCHERE } from '../shared/schemas'
import { room } from '../shared/messages'
import { boite, formatRevenu } from '../shared/loot-table'
import { alerter, monAdresseClient } from './theft'

type Vue = { corps: Entity; etiquette: Entity; texte: string }
const vues = new Map<number, Vue>()

export function setupConvoi(): void {
  room.onMessage('outbidWon', (d) => {
    alerter(`YOU OUTBID ${d.fromName.toUpperCase()}  ·  ${boite(d.typeBoite).nom} for ${formatRevenu(d.prix)}`, '#8fe08f', 5000)
  })
  room.onMessage('outbidLost', (d) => {
    alerter(`${d.byName.toUpperCase()} OUTBID YOU\\nrefunded ${formatRevenu(d.rembourse)}`, '#ff6b6b', 6000)
  })
  room.onMessage('convoiArrived', (d) => {
    alerter(`${boite(d.typeBoite).nom.toUpperCase()} DELIVERED`, '#4dd2ff', 3000)
  })

  engine.addSystem(() => {
    const vivants = new Set<number>()

    for (const [e, c] of engine.getEntitiesWith(Convoi)) {
      vivants.add(c.convoiId)
      let v = vues.get(c.convoiId)
      const b = boite(c.typeBoite)
      const couleur = Color4.fromHexString(b.couleur + 'ff')

      if (v === undefined) {
        const corps = engine.addEntity()
        Transform.create(corps, { position: Vector3.create(0, -5, 0), scale: Vector3.create(b.taille, b.taille, b.taille) })
        MeshRenderer.setBox(corps)
        MeshCollider.setBox(corps)
        Material.setPbrMaterial(corps, { albedoColor: couleur, emissiveColor: couleur, emissiveIntensity: 0.6, metallic: 0.5, roughness: 0.4 })
        const etiquette = engine.addEntity()
        Transform.create(etiquette, { position: Vector3.create(0, -5, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
        Billboard.create(etiquette, {})
        TextShape.create(etiquette, { text: '', fontSize: 3, textColor: Color4.White() })
        v = { corps, etiquette, texte: '' }
        vues.set(c.convoiId, v)
      }

      // Position comes from the server's `progres`. Two players must see the convoy in
      // the same place, or a tap that looks well-timed gets rejected.
      const k = Math.max(0, Math.min(1, c.progres))
      const x = c.departX + (c.cibleX - c.departX) * k
      const z = c.departZ + (c.cibleZ - c.departZ) * k
      const tc = Transform.getMutableOrNull(v.corps)
      if (tc !== null) tc.position = Vector3.create(x, 1.0, z)
      const te = Transform.getMutableOrNull(v.etiquette)
      if (te !== null) te.position = Vector3.create(x, 2.0, z)

      const mien = c.proprietaire.toLowerCase() === monAdresseClient()
      const prix = Math.ceil(c.prixPaye * CONVOI_SURENCHERE)
      const voulu = mien
        ? `${b.nom}\nyours - ${formatRevenu(prix)} to take it`
        : `${b.nom}\n${c.nomProprietaire} - OUTBID ${formatRevenu(prix)}`
      if (voulu !== v.texte) {
        v.texte = voulu
        const ts = TextShape.getMutableOrNull(v.etiquette)
        if (ts !== null) {
          ts.text = voulu
          ts.textColor = mien ? Color4.fromHexString('#8fe08fff') : couleur
        }
        PointerEvents.createOrReplace(v.corps, {
          pointerEvents: [
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_PRIMARY, hoverText: mien ? 'Yours' : `Outbid for ${prix}` } },
            { eventType: PointerEventType.PET_DOWN, eventInfo: { button: InputAction.IA_POINTER, hoverText: mien ? 'Yours' : `Outbid for ${prix}` } }
          ]
        })
      }

      if (
        inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, v.corps) ||
        inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, v.corps)
      ) {
        if (mien) alerter('THIS ONE IS ALREADY YOURS', '#ffd166', 2500)
        else void room.send('outbid', { convoiId: c.convoiId })
      }
    }

    for (const [id, v] of [...vues]) {
      if (vivants.has(id)) continue
      engine.removeEntity(v.corps)
      engine.removeEntity(v.etiquette)
      vues.delete(id)
    }
  })
}
