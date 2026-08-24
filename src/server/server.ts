import { engine, Transform, PlayerIdentityData, timers } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { PlayerTaps, ServerBeat, SYNC_ID, BEAT_MS } from '../shared/schemas'
import { room } from '../shared/messages'
import { startPlots, accueillir, auRevoir, poserObjet, coinsDe, encaisserHorsLigne, reclamerQuotidienne, pousserQuetes } from './plots'
import { arrivee, depart, verifierCadeau } from './onboarding'
import { jour, viderJournal, rejouerJournal } from './journal'
import { startTheft, verrouArrivee, delivrerAlertes, noterPalier } from './theft'
import { startBelt } from './belt'

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

  // LE BATTEMENT DE COEUR D'ABORD, avant toute autre logique.
  // Regle apprise a la dure: la premiere version creait le battement APRES l'hydratation.
  // L'hydratation a jete, et le serveur est mort sans jamais signaler qu'il vivait, donc
  // le client affichait "silencieux" sans distinguer "serveur mort" de "serveur absent".
  // Le signal de vie ne doit dependre de rien.
  const beat = engine.addEntity()
  ServerBeat.create(beat, { at: Date.now() })
  syncEntity(beat, [ServerBeat.componentId], SYNC_ID.serverBeat)
  timers.setInterval(() => {
    const b = ServerBeat.getMutableOrNull(beat)
    if (b !== null) b.at = Date.now()
  }, BEAT_MS)

  // Vidage du tampon de journal des le depart: c'est notre seule fenetre de diagnostic,
  // elle doit vivre avant tout code susceptible de jeter.
  timers.setInterval(() => { viderJournal() }, 1000)

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
      void room.send('tapAck', { count: next, persisted: false }, { to: [address] })
    })()
  })

  startPlots()
  startTheft()
  startBelt()


  // HYDRATATION A L'ARRIVEE, via PlayerIdentityData.
  // On n'utilise PAS le helper @dcl/sdk/players: il est oriente client et le faire tourner
  // sur le runtime headless tue le serveur au demarrage. PlayerIdentityData est la voie
  // documentee cote serveur pour savoir qui est present.
  // Sans hydratation, un joueur qui revient voit zero jusqu'a ce qu'il agisse: c'est le
  // defaut "lieu vide" en miniature, exactement ce que la regle d'eligibilite punit.
  // ARRIVEES ET DEPARTS, tous deux par PlayerIdentityData.
  // Le depart compte autant que l'arrivee: c'est lui qui laisse la base visible et
  // pillable, ce qui fait vivre le lieu quand personne n'est connecte.
  const presents = new Set<string>()
  let sinceCheck = 0
  engine.addSystem((dt: number) => {
    sinceCheck += dt
    if (sinceCheck < 1) return
    sinceCheck = 0

    const ici = new Set<string>()
    for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
      const a = id.address?.toLowerCase()
      if (a) ici.add(a)
    }

    for (const address of ici) {
      if (presents.has(address)) continue
      presents.add(address)
      void (async () => {
        const n = await load(address)
        publish(address)
        await accueillir(address)
        // Les gains hors ligne sont verses AVANT tout le reste: c'est la premiere
        // chose que le joueur doit voir en revenant, c'est ce qui l'a fait revenir.
        const hl = encaisserHorsLigne(address)
        if (hl !== null) void room.send('offlineEarnings', hl, { to: [address] })
        // La recompense du jour arrive juste apres: deux bonnes nouvelles a l'arrivee.
        const dq = reclamerQuotidienne(address)
        if (dq !== null) void room.send('dailyReward', dq, { to: [address] })
        // Les quetes du jour partent a l'entree: elles doivent etre lisibles AVANT
        // que le joueur ne cherche quoi faire, pas apres sa premiere action.
        pousserQuetes(address)
        arrivee(address)
        verrouArrivee(address)    // 3.1 on ne se fait pas piller en posant le pied
        delivrerAlertes(address)  // ce qui s'est passe pendant l'absence
        rejouerJournal(address)
        console.log(`[SERVER] ${address} entre, etat restitue: ${n}`)
      })()
    }

    verifierCadeau(presents)

    for (const address of [...presents]) {
      if (ici.has(address)) continue
      presents.delete(address)
      dirty.add(address)
      auRevoir(address)
      depart(address)
      void flush()
    }
  })
}
