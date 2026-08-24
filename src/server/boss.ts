import { engine, Transform, timers } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Boss, BOSS_PV, BOSS_RESPAWN_MS, BOSS_PORTEE, BOSS_POSITION, BOSS_BOITE, BOSS_BOITE_MEILLEUR, SYNC_ID } from '../shared/schemas'
import { room } from '../shared/messages'
import { jour } from './journal'
import { positionDe, nomAffiche, ajouterBoite, boitesDe, avancerQuete, pousserQuetes } from './plots'

let entite = 0 as unknown as ReturnType<typeof engine.addEntity>
/** degats portes par joueur sur le boss EN COURS, remis a zero a chaque reapparition */
let degats = new Map<string, number>()
let finRespawn = 0

export function startBoss(): void {
  entite = engine.addEntity()
  Transform.create(entite, { position: Vector3.create(BOSS_POSITION.x, 2.2, BOSS_POSITION.z) })
  Boss.create(entite, { pv: BOSS_PV, pvMax: BOSS_PV, vivant: true, respawnSec: 0, dernierVainqueur: '' })
  syncEntity(entite, [Boss.componentId, Transform.componentId], SYNC_ID.boss)

  room.onMessage('hitBoss', (_d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const b = Boss.getMutableOrNull(entite)
    if (b === null || !b.vivant) return

    // ANTI-TRICHE: portee mesuree par le serveur, comme partout ailleurs.
    const p = positionDe(a)
    if (p === null) return
    const dist = Vector3.distance(p, Vector3.create(BOSS_POSITION.x, p.y, BOSS_POSITION.z))
    if (dist > BOSS_PORTEE) {
      void room.send('actionRejected', { action: 'boss', raison: `too far (${dist.toFixed(1)}m)`, antiCheat: true }, { to: [a] })
      return
    }

    b.pv = Math.max(0, b.pv - 1)
    degats.set(a, (degats.get(a) ?? 0) + 1)
    if (b.pv > 0) return

    // ABATTU. Tout participant est paye; le meilleur frappeur recoit mieux.
    b.vivant = false
    finRespawn = Date.now() + BOSS_RESPAWN_MS
    b.respawnSec = Math.ceil(BOSS_RESPAWN_MS / 1000)

    let meilleur = ''
    let record = 0
    for (const [adr, n] of degats) if (n > record) { record = n; meilleur = adr }
    b.dernierVainqueur = meilleur === '' ? '' : nomAffiche(meilleur)

    for (const [adr, n] of degats) {
      if (n <= 0) continue
      const boite = adr === meilleur ? BOSS_BOITE_MEILLEUR : BOSS_BOITE
      ajouterBoite(adr, boite)
      void room.send('inventory', { boites: boitesDe(adr) }, { to: [adr] })
      void room.send('bossReward', { boite, coups: n, meilleur: adr === meilleur }, { to: [adr] })
      avancerQuete(adr, 'boss')
      pousserQuetes(adr)
    }
    void room.send('bossDown', { parNom: b.dernierVainqueur, participants: degats.size })
    jour(`boss abattu par ${b.dernierVainqueur} (${degats.size} participants)`)
    degats = new Map()
  })

  // Reapparition. Un seul systeme, cadence a la seconde: le compte a rebours est une
  // information, pas une animation.
  let acc = 0
  engine.addSystem((dt) => {
    const b = Boss.getMutableOrNull(entite)
    if (b === null || b.vivant) return
    acc += dt
    if (acc < 1) return
    acc = 0
    const reste = Math.max(0, finRespawn - Date.now())
    b.respawnSec = Math.ceil(reste / 1000)
    if (reste > 0) return
    b.pv = BOSS_PV
    b.vivant = true
    b.respawnSec = 0
    degats = new Map()
    void room.send('bossUp', {})
    jour('boss revenu')
  })

  jour('boss pret')
}
