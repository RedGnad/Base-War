import { Vector3 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { jour } from './journal'
import {
  MACHINES, REPS_PAR_SERIE, ENTRAINEMENT_SECONDES, ENTRAINEMENT_MINIMUM,
  ENTRAINEMENT_RECHARGE_MS, PORTEE_MACHINE
} from '../shared/training'
import { positionDe, revenuParSeconde, crediter, nomAffiche, avancerQuete, pousserQuetes } from './plots'
import { tutoFait } from './onboarding'

type Serie = { machine: number; reps: number; finRecharge: number }
const series = new Map<string, Serie>()

function envoyer(a: string): void {
  const s = series.get(a)
  const reste = s === undefined ? 0 : Math.max(0, s.finRecharge - Date.now())
  void room.send('trainState', {
    machine: s?.machine ?? -1,
    reps: s?.reps ?? 0,
    cible: REPS_PAR_SERIE,
    rechargeSec: Math.ceil(reste / 1000)
  }, { to: [a] })
}

export function startTraining(): void {
  room.onMessage('trainRep', (d, ctx) => {
    const a = ctx?.from?.toLowerCase()
    if (!a) return
    const m = MACHINES.find((x) => x.id === d.machine)
    if (m === undefined) return

    // ANTI-TRICHE: le serveur mesure la distance lui-meme. Le client ne fait que
    // signaler une intention, exactement comme pour la caisse et le tapis.
    const p = positionDe(a)
    if (p === null) { void room.send('actionRejected', { action: 'training', raison: 'position unknown', antiCheat: false }, { to: [a] }); return }
    const dist = Vector3.distance(p, Vector3.create(m.x, p.y, m.z))
    if (dist > PORTEE_MACHINE) {
      void room.send('actionRejected', { action: 'training', raison: `too far (${dist.toFixed(1)}m)`, antiCheat: true }, { to: [a] })
      return
    }

    const maintenant = Date.now()
    let s = series.get(a)
    if (s !== undefined && s.finRecharge > maintenant) {
      void room.send('actionRejected', { action: 'training', raison: `resting, ${Math.ceil((s.finRecharge - maintenant) / 1000)}s`, antiCheat: false }, { to: [a] })
      return
    }
    // Changer de machine en cours de serie RECOMMENCE la serie: sinon on cumule des
    // repetitions sur quatre machines a la fois et la recharge ne borne plus rien.
    if (s === undefined || s.machine !== m.id) s = { machine: m.id, reps: 0, finRecharge: 0 }

    s.reps += 1
    if (s.reps >= REPS_PAR_SERIE) {
      const gain = Math.max(ENTRAINEMENT_MINIMUM, Math.floor(revenuParSeconde(a) * ENTRAINEMENT_SECONDES))
      crediter(a, gain)
      s.reps = 0
      s.finRecharge = maintenant + ENTRAINEMENT_RECHARGE_MS
      void room.send('trainDone', { machine: m.id, gain }, { to: [a] })
      tutoFait(a, 4)
      avancerQuete(a, 'entrainer')
      avancerQuete(a, 'banquer', gain)
      pousserQuetes(a)
      jour(`${nomAffiche(a)} termine une serie sur ${m.nom}: +${gain}`)
    }
    series.set(a, s)
    envoyer(a)
  })

  jour('machines pretes')
}
