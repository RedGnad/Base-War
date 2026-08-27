import { engine, Entity, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { Records, RECORDS_TOP, JOURNAL_SHOWN, JOURNAL_KEPT, VIDE, incomeMultiplier } from '../shared/schemas'
import { itemIncome } from '../shared/loot-table'
import { INCOME_PER_RARITY } from './loot'
import { toutesLesBases } from './plots'

/**
 * The records board's data: a journal that survives the server, and two rankings read off the bases.
 *
 * The server dies two minutes after the last player leaves, so anything a judge should find when
 * they arrive alone has to be in Storage. The journal is kept in memory, trimmed to JOURNAL_KEPT,
 * and written at most every ten seconds while dirty (writes are capped and a failed one returns
 * false, so a failed write marks it dirty again). The rankings need no storage of their own: income
 * comes from what stands on each base, thefts from a counter on the base record, both restored
 * with the base, present owner or not.
 */
type Entree = { t: number; kind: string; a: string; b: string; code: number }

const JOURNAL_KEY = 'journal'
let journal: Entree[] = []
let sale = false
let tableau: Entity | null = null

export function noter(kind: 'vol' | 'garde' | 'don' | 'tirage' | 'fusion', a: string, b: string, code: number): void {
  journal.push({ t: Date.now(), kind, a, b, code })
  if (journal.length > JOURNAL_KEPT) journal = journal.slice(-JOURNAL_KEPT)
  sale = true
  rafraichir()
}

function rafraichir(): void {
  if (tableau === null) return
  const r = Records.getMutableOrNull(tableau)
  if (r === null) return
  const bases = toutesLesBases()
  const earners = bases
    .map((b) => {
      let parSeconde = 0
      for (const code of b.items) if (code !== VIDE) parSeconde += itemIncome(code, INCOME_PER_RARITY)
      return { name: b.name, value: parSeconde * incomeMultiplier(b.rebirths) }
    })
    .filter((e) => e.value > 0)
    .sort((x, y) => y.value - x.value)
    .slice(0, RECORDS_TOP)
  const thieves = bases
    .filter((b) => b.vols > 0)
    .map((b) => ({ name: b.name, value: b.vols }))
    .sort((x, y) => y.value - x.value)
    .slice(0, RECORDS_TOP)
  r.earners = earners
  r.thieves = thieves
  r.journal = journal.slice(-JOURNAL_SHOWN)
}

export function startRecords(): void {
  // A stale board from a previous run would be a second board; only the runtime's own entities stay.
  for (const [e] of engine.getEntitiesWith(Records)) {
    if ((e & 0xffff) < 512) continue
    engine.removeEntity(e)
  }
  tableau = engine.addEntity()
  Records.create(tableau, { earners: [], thieves: [], journal: [] })
  syncEntity(tableau, [Records.componentId])

  executeTask(async () => {
    const raw = await Storage.get<string>(JOURNAL_KEY)
    if (typeof raw === 'string' && raw.length > 0) {
      try { journal = JSON.parse(raw) as Entree[] } catch { journal = [] }
    }
    rafraichir()
    console.log(`[SERVER] records ready, ${journal.length} journal lines`)
  })

  let accLecture = 0
  let accEcriture = 0
  engine.addSystem((dt) => {
    accLecture += dt
    accEcriture += dt
    // Income moves with every placement and theft; five seconds is fresh enough for a board.
    if (accLecture >= 5) { accLecture = 0; rafraichir() }
    if (sale && accEcriture >= 10) {
      accEcriture = 0
      sale = false
      const copie = JSON.stringify(journal)
      void Storage.set(JOURNAL_KEY, copie).then((ok) => { if (!ok) sale = true })
    }
  })
}
