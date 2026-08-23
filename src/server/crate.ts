import { engine, Transform, PlayerIdentityData, AvatarBase, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Crate, SYNC_ID, PORTEE_COUP, CENTRE } from '../shared/schemas'
import { room } from '../shared/messages'
import { rollRarity } from './loot'

const COUPS_POUR_CASSER = 3
const REAPPARITION_MS = 2500

/** Position de la caisse: le centre du lieu (25 parcelles = 0..80). */
export const CRATE_POS = Vector3.create(CENTRE.x, 1, CENTRE.z)

let crate = engine.addEntity()

/**
 * Position du joueur LUE PAR LE SERVEUR, jamais rapportee par le client.
 * En coordonnees locales a la scene: on compare directement, sans decalage de parcelle.
 */
function positionDe(address: string): Vector3 | null {
  for (const [entity, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    const t = Transform.getOrNull(entity)
    return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : null
  }
  return null
}

function nomDe(address: string): string {
  for (const [entity, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address?.toLowerCase() !== address) continue
    return AvatarBase.getOrNull(entity)?.name ?? address.slice(0, 8)
  }
  return address.slice(0, 8)
}

export function startCrate(onLoot: (address: string, rarity: number) => void): void {
  Transform.create(crate, { position: CRATE_POS })
  Crate.create(crate, { hits: 0, maxHits: COUPS_POUR_CASSER, breakSeq: 0 })
  syncEntity(crate, [Crate.componentId, Transform.componentId], SYNC_ID.crate)
  console.log('[SERVER] caisse prete')

  room.onMessage('hitCrate', (_data, context) => {
    const address = context?.from?.toLowerCase()
    if (!address) return

    const c = Crate.getMutableOrNull(crate)
    if (c === null) return
    if (c.hits >= c.maxHits) return // deja cassee, en attente de reapparition

    // ANTI-TRICHE: le serveur mesure lui-meme la distance. Un client qui envoie
    // hitCrate depuis l'autre bout de la scene est refuse et signale.
    const p = positionDe(address)
    if (p === null) {
      void room.send('hitRejected', { raison: 'position inconnue', antiCheat: false }, { to: [address] })
      return
    }
    const d = Vector3.distance(p, CRATE_POS)
    if (d > PORTEE_COUP) {
      console.log(`[SERVER] coup REFUSE de ${address}: ${d.toFixed(1)} m > ${PORTEE_COUP} m`)
      void room.send('hitRejected', { raison: `trop loin (${d.toFixed(1)} m)`, antiCheat: true }, { to: [address] })
      return
    }

    c.hits += 1
    console.log(`[SERVER] coup ${c.hits}/${c.maxHits} par ${address} a ${d.toFixed(1)} m`)

    if (c.hits < c.maxHits) return

    // LE TIRAGE EST ICI, sur le serveur, et nulle part ailleurs.
    const r = rollRarity()
    c.breakSeq += 1
    console.log(`[SERVER] caisse cassee par ${address} -> rarete ${r}`)
    onLoot(address, r)
    void room.send('crateBroken', { rarity: r, byId: address, byName: nomDe(address) })

    timers.setTimeout(() => {
      const again = Crate.getMutableOrNull(crate)
      if (again !== null) again.hits = 0
    }, REAPPARITION_MS)
  })
}
