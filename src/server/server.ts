import { engine, Transform, timers } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { onEnterScene, onLeaveScene } from '@dcl/sdk/players'
import { Storage } from '@dcl/sdk/server'
import { PlayerTaps, ServerBeat, SYNC_ID, BEAT_MS } from '../shared/schemas'
import { room } from '../shared/messages'

// Ce module importe @dcl/sdk/server: il ne doit etre charge que dans la branche serveur,
// via import() dynamique, et il ne definit AUCUN composant au niveau module.

const STORAGE_KEY = 'taps'
const SAVE_EVERY_MS = 5000

/** Etat vivant en memoire. Storage n'est PAS un magasin temps reel. */
const counts = new Map<string, number>()
const dirty = new Set<string>()
/** address -> entite synchronisee. A revalider: un serveur long recycle les creneaux. */
const entities = new Map<string, ReturnType<typeof engine.addEntity>>()

function entityFor(address: string) {
  const cached = entities.get(address)
  // Le composant peut avoir disparu si le creneau a ete recycle: on revalide avant de reutiliser.
  if (cached !== undefined && PlayerTaps.getOrNull(cached) !== null) return cached

  const e = engine.addEntity()
  Transform.create(e, { position: { x: 0, y: -100, z: 0 } }) // hors de vue: porteur de donnees
  PlayerTaps.create(e, { playerId: address, count: counts.get(address) ?? 0 })
  // Pas d'identifiant explicite: l'allocation automatique est unique par construction.
  syncEntity(e, [PlayerTaps.componentId])
  entities.set(address, e)
  return e
}

function publish(address: string) {
  const e = entityFor(address)
  const c = PlayerTaps.getMutableOrNull(e)
  if (c === null) return
  c.count = counts.get(address) ?? 0
}

/** Charge une seule fois par session, depuis Storage, puis reste en memoire. */
async function load(address: string): Promise<number> {
  if (counts.has(address)) return counts.get(address)!
  const raw = await Storage.player.get<string>(address, STORAGE_KEY)
  const n = raw ? (JSON.parse(raw).count ?? 0) : 0
  counts.set(address, n)
  console.log(`[SERVER] charge ${address} -> ${n} (brut: ${raw === undefined ? 'absent' : raw})`)
  return n
}

/** Point de controle: on n'ecrit jamais par tap ni par image. */
async function flush(): Promise<void> {
  if (dirty.size === 0) return
  const batch = [...dirty]
  dirty.clear()
  for (const address of batch) {
    const value = JSON.stringify({ count: counts.get(address) ?? 0, at: Date.now() })
    const ok = await Storage.player.set(address, STORAGE_KEY, value)
    // set() ne jette JAMAIS: un false ignore est une sauvegarde silencieusement perdue.
    if (!ok) {
      console.error(`[SERVER] ECHEC d'ecriture pour ${address}, remis en attente`)
      dirty.add(address)
    } else {
      console.log(`[SERVER] persiste ${address} = ${counts.get(address)}`)
    }
  }
}

export function startServer(): void {
  console.log('[SERVER] demarrage')

  // HYDRATATION A L'ARRIVEE.
  // Sans ceci, un joueur qui revient voit zero jusqu'a ce qu'il agisse: on ne chargeait
  // depuis Storage qu'au premier tap. C'est le defaut "lieu vide" en miniature, et c'est
  // exactement ce que la regle d'eligibilite punit. On publie donc son etat des l'entree.
  onEnterScene((player) => {
    const address = player.userId?.toLowerCase()
    if (!address) return
    void (async () => {
      const n = await load(address)
      publish(address)
      console.log(`[SERVER] ${player.name} entre, etat restitue: ${n}`)
    })()
  })

  // Point de controle a la sortie: c'est le moment ou l'on est sur de ne rien perdre.
  onLeaveScene((userId) => {
    const address = userId?.toLowerCase()
    if (address) dirty.add(address)
    void flush()
  })

  // Battement de coeur, publie immediatement pour que le premier client n'attende pas.
  const beat = engine.addEntity()
  ServerBeat.create(beat, { at: Date.now() })
  syncEntity(beat, [ServerBeat.componentId], SYNC_ID.serverBeat)
  timers.setInterval(() => {
    const b = ServerBeat.getMutableOrNull(beat)
    if (b !== null) b.at = Date.now()
  }, BEAT_MS)

  timers.setInterval(() => {
    void flush()
  }, SAVE_EVERY_MS)

  room.onMessage('tap', (_data, context) => {
    const address = context?.from?.toLowerCase()
    if (!address) return
    void (async () => {
      const current = await load(address)
      const next = current + 1
      counts.set(address, next)
      dirty.add(address)
      publish(address)
      console.log(`[SERVER] tap de ${address} -> ${next}`)
      void room.send('tapAck', { count: next, persisted: !dirty.has(address) }, { to: [address] })
    })()
  })
}
