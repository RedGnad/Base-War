import { engine, Transform, MeshRenderer, Material, TextShape, TextAlignMode, Billboard, BillboardMode, Entity } from '@dcl/sdk/ecs'
import { Vector3, Color4, Color3 } from '@dcl/sdk/math'
import { Records, CENTER, BELT_HEIGHT } from '../shared/schemas'
import {
  formatIncome, itemName, rarityOf, mutationDe, nomDuCode
} from '../shared/loot-table'
import { TOY, plastic, montable } from './toy'
import { HUE } from './theme'

/**
 * The records board: the one object that makes an empty plaza read as a place where things happen.
 *
 * Three columns on a dark plate by the belt, turned toward whoever looks at it: who earns most,
 * who steals most, what happened lately. A judge who enters alone reads names and numbers left by
 * others, which is the only social evidence available to somebody who is alone, and the form the
 * base-raid genre itself uses (a live board of rare spawns with player names, two leaderboards).
 * Text is rebuilt only when the synced data changes; the strings are the cache.
 */
const NOIR = Color3.create(0, 0, 0)
const LARGEUR = 9.6
const HAUTEUR = 3.6

type Colonne = { entite: Entity; texte: string }
const colonnes: Colonne[] = []

function colonne(parent: Entity, dx: number, hex: string): Colonne {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: Vector3.create(dx, HAUTEUR / 2 - 0.3, 0.16), scale: Vector3.create(0.36, 0.36, 0.36) })
  TextShape.create(e, {
    text: '', fontSize: 3.2, textColor: Color4.fromHexString(hex + 'ff'),
    outlineWidth: 0.16, outlineColor: NOIR,
    textAlign: TextAlignMode.TAM_TOP_LEFT, width: 8.2, height: 9, textWrapping: true, lineSpacing: 12
  })
  return { entite: e, texte: '' }
}

function ecrire(c: Colonne, texte: string): void {
  if (c.texte === texte) return
  c.texte = texte
  const t = TextShape.getMutableOrNull(c.entite)
  if (t !== null) t.text = texte
}

function ligneDuJournal(e: { t: number; kind: string; a: string; b: string; code: number }, now: number): string {
  const min = Math.max(0, Math.round((now - e.t) / 60000))
  const quand = min < 1 ? 'now' : min < 60 ? `${min}m` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`
  const objet = nomDuCode(e.code)
  switch (e.kind) {
    case 'vol': return `${quand}  ${e.a} stole a ${objet} from ${e.b}`
    case 'garde': return `${quand}  ${e.b}'s sentry stopped ${e.a} on floor ${e.code}`
    case 'don': return `${quand}  ${e.a} gave a toy to ${e.b}`
    case 'tirage': return `${quand}  ${e.a} pulled a ${objet}`
    case 'fusion': return `${quand}  ${e.a} fused a ${objet}`
    case 'trait': return `${quand}  ${e.a}'s ${objet} was marked by the ${e.b}`
    default: return `${quand}  ${e.a}`
  }
}

export function setupRecords(): void {
  // Behind the belt, on the side away from the pit, turned toward the plaza like a signpost.
  const racine = engine.addEntity()
  Transform.create(racine, { position: Vector3.create(CENTER.x, BELT_HEIGHT + HAUTEUR / 2 + 0.6, CENTER.z - 7) })
  Billboard.create(racine, { billboardMode: BillboardMode.BM_Y })

  const cadre = engine.addEntity()
  Transform.create(cadre, { parent: racine, scale: Vector3.create(LARGEUR + 0.4, HAUTEUR + 0.4, 0.22) })
  MeshRenderer.setBox(cadre)
  Material.setPbrMaterial(cadre, plastic(TOY.wallCream))

  const plaque = engine.addEntity()
  Transform.create(plaque, { parent: racine, position: Vector3.create(0, 0, 0.06), scale: Vector3.create(LARGEUR, HAUTEUR, 0.14) })
  MeshRenderer.setBox(plaque)
  Material.setPbrMaterial(plaque, plastic(TOY.beltPit))
  montable(plaque, 'board.glb')

  const pied = engine.addEntity()
  Transform.create(pied, { parent: racine, position: Vector3.create(0, -(HAUTEUR / 2 + 0.6) / 2 - HAUTEUR / 2, 0), scale: Vector3.create(0.5, BELT_HEIGHT + 0.6 + HAUTEUR / 2 + 0.2, 0.5) })
  MeshRenderer.setBox(pied)
  Material.setPbrMaterial(pied, plastic(TOY.wallCream))

  colonnes.push(colonne(racine, -LARGEUR / 2 + 0.3, HUE.money))
  colonnes.push(colonne(racine, -LARGEUR / 6 + 0.3, HUE.danger))
  colonnes.push(colonne(racine, LARGEUR / 6 + 0.3, HUE.name))

  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 1) return
    acc = 0
    let r: ReturnType<typeof Records.get> | null = null
    for (const [, v] of engine.getEntitiesWith(Records)) r = v
    if (r === null) return
    const now = Date.now()
    const earners = ['TOP EARNERS', ...r.earners.map((e, i) => `${i + 1}. ${e.name}  ${formatIncome(e.value)}/s`)]
    const thieves = ['TOP THIEVES', ...r.thieves.map((e, i) => `${i + 1}. ${e.name}  ${e.value} ${e.value === 1 ? 'steal' : 'steals'}`)]
    const latest = ['LATEST', ...[...r.journal].reverse().map((e) => ligneDuJournal(e, now))]
    ecrire(colonnes[0], earners.length === 1 ? 'TOP EARNERS\n\nnobody yet' : earners.join('\n'))
    ecrire(colonnes[1], thieves.length === 1 ? 'TOP THIEVES\n\nnobody yet' : thieves.join('\n'))
    ecrire(colonnes[2], latest.length === 1 ? 'LATEST\n\nquiet so far' : latest.join('\n'))
  })
}
