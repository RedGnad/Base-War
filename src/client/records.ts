import { engine, Transform, MeshRenderer, Material, TextShape, TextAlignMode, Entity } from '@dcl/sdk/ecs'
import { Vector3, Color4, Color3, Quaternion } from '@dcl/sdk/math'
import { Records, CENTER, BELT_HEIGHT } from '../shared/schemas'
import { formatIncome, nomDuCode } from '../shared/loot-table'
import { TOY, plastic, plasticDe, montable } from './toy'
import { HUE } from './theme'

/**
 * The records board: the one object that makes an empty plaza read as a place where things happen.
 *
 * A dark plate by the belt with two rankings side by side and the latest events underneath,
 * the shape of a mobile game's leaderboard: a title, coloured headers, gold-silver-bronze
 * ranks, names left and figures right, alternating row bands so a line can be followed from
 * ten metres. Every row is its own text entity, because one text block cannot carry more
 * than one colour and its box anchors where the engine decides: the first board wrote its
 * three columns into three blocks anchored on a nine-unit box, and every line landed ABOVE
 * the plate, unreadable against the sky, with the plate empty below (tester, 27 Aug).
 *
 * No billboard, and two faces. Which side of a billboarded model turns to the camera is not
 * documented and has changed between SDKs; a sign that may present its back is a sign that
 * sometimes reads as blank. The board stands still, turned along the belt, and carries the
 * same layout on both faces, mirrored through a pivot, so whichever side you come from, you
 * read it.
 */
const NOIR = Color3.create(0, 0, 0)
const LARGEUR = 12
const HAUTEUR = 7.4
const MARGE = 0.35
/** Rows are 0.45 m apart: glyphs about 0.3 m tall, which is 26 px from twelve metres on a phone. */
const PAS = 0.45
const RANGS = 5
const LIGNES_JOURNAL = 6
const RANG_COULEUR = ['#ffd166', '#d9dde5', '#e0a466']
const TEXTE = '#f2f4f8'
const BANDE = Color4.create(1, 1, 1, 0.07)

type Ligne = { gauche: Entity; droite: Entity | null; texteG: string; texteD: string }
type Face = { earners: Ligne[]; thieves: Ligne[]; journal: Ligne[] }
const faces: Face[] = []

function texte(parent: Entity, x: number, y: number, taille: number, hex: string, align: TextAlignMode): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: Vector3.create(x, y, 0.11) })
  TextShape.create(e, {
    text: '', fontSize: taille, textColor: Color4.fromHexString(hex + 'ff'),
    outlineWidth: 0.12, outlineColor: NOIR, textAlign: align, textWrapping: false
  })
  return e
}

function bande(parent: Entity, x: number, y: number, largeur: number): void {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: Vector3.create(x, y, 0.085), scale: Vector3.create(largeur, PAS - 0.06, 0.01) })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, plasticDe(BANDE, 0))
}

function ligne(parent: Entity, xg: number, xd: number | null, y: number, largeurBande: number, pair: boolean, hex: string): Ligne {
  if (pair) bande(parent, xd === null ? xg + largeurBande / 2 : (xg + xd) / 2, y, largeurBande)
  const gauche = texte(parent, xg, y, 3, hex, TextAlignMode.TAM_MIDDLE_LEFT)
  const droite = xd === null ? null : texte(parent, xd, y, 3, hex, TextAlignMode.TAM_MIDDLE_RIGHT)
  return { gauche, droite, texteG: '', texteD: '' }
}

function ecrire(l: Ligne, g: string, d = ''): void {
  if (l.texteG !== g) {
    l.texteG = g
    const t = TextShape.getMutableOrNull(l.gauche)
    if (t !== null) t.text = g
  }
  if (l.droite !== null && l.texteD !== d) {
    l.texteD = d
    const t = TextShape.getMutableOrNull(l.droite)
    if (t !== null) t.text = d
  }
}

function entete(parent: Entity, x: number, y: number, taille: number, hex: string, align: TextAlignMode, mot: string): void {
  const e = texte(parent, x, y, taille, hex, align)
  const t = TextShape.getMutableOrNull(e)
  if (t !== null) t.text = mot
}

/** One face of the board, laid out from the top edge down, as children of `pivot`. */
function face(pivot: Entity): Face {
  const haut = HAUTEUR / 2
  const moitie = (LARGEUR - 3 * MARGE) / 2
  const xg1 = -LARGEUR / 2 + MARGE, xd1 = xg1 + moitie
  const xg2 = xd1 + MARGE, xd2 = xg2 + moitie
  let y = haut - MARGE - 0.35

  entete(pivot, 0, y, 4.2, '#ffd166', TextAlignMode.TAM_MIDDLE_CENTER, 'BASE WAR  ·  RECORDS')
  y -= 0.75

  entete(pivot, xg1, y, 3.4, HUE.money, TextAlignMode.TAM_MIDDLE_LEFT, 'TOP EARNERS')
  entete(pivot, xg2, y, 3.4, HUE.danger, TextAlignMode.TAM_MIDDLE_LEFT, 'TOP THIEVES')
  y -= PAS + 0.05

  const earners: Ligne[] = []
  const thieves: Ligne[] = []
  for (let i = 0; i < RANGS; i++) {
    const hex = RANG_COULEUR[i] ?? TEXTE
    earners.push(ligne(pivot, xg1, xd1, y, moitie, i % 2 === 0, hex))
    thieves.push(ligne(pivot, xg2, xd2, y, moitie, i % 2 === 0, hex))
    y -= PAS
  }
  y -= 0.2

  entete(pivot, xg1, y, 3.4, '#7cc4ff', TextAlignMode.TAM_MIDDLE_LEFT, 'LATEST')
  y -= PAS + 0.05

  const journal: Ligne[] = []
  const pleine = LARGEUR - 2 * MARGE
  for (let i = 0; i < LIGNES_JOURNAL; i++) {
    journal.push(ligne(pivot, xg1, null, y, pleine, i % 2 === 0, TEXTE))
    y -= PAS
  }
  return { earners, thieves, journal }
}

function ligneDuJournal(e: { t: number; kind: string; a: string; b: string; code: number }, now: number): string {
  const min = Math.max(0, Math.round((now - e.t) / 60000))
  const quand = min < 1 ? 'now' : min < 60 ? `${min}m` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`
  const objet = nomDuCode(e.code)
  let phrase: string
  switch (e.kind) {
    case 'vol': phrase = `${e.a} stole a ${objet} from ${e.b}`; break
    case 'garde': phrase = `${e.b}'s sentry stopped ${e.a} on floor ${e.code}`; break
    case 'don': phrase = `${e.a} gave a toy to ${e.b}`; break
    case 'tirage': phrase = `${e.a} pulled a ${objet}`; break
    case 'fusion': phrase = `${e.a} fused a ${objet}`; break
    case 'trait': phrase = `${e.a}'s ${objet} was marked by the ${e.b}`; break
    default: phrase = e.a
  }
  // Sixty characters is what the full width holds at this size; the end of a long line is the
  // least informative part of it.
  const ligne = `${quand}   ${phrase}`
  return ligne.length > 60 ? ligne.slice(0, 59) + '…' : ligne
}

export function setupRecords(): void {
  // Behind the belt, on the side away from the pit, standing along the belt so one face looks
  // at the plaza and the other at the bases behind it.
  const racine = engine.addEntity()
  Transform.create(racine, { position: Vector3.create(CENTER.x, BELT_HEIGHT + HAUTEUR / 2 + 0.6, CENTER.z - 7) })

  const cadre = engine.addEntity()
  Transform.create(cadre, { parent: racine, scale: Vector3.create(LARGEUR + 0.5, HAUTEUR + 0.5, 0.12) })
  MeshRenderer.setBox(cadre)
  Material.setPbrMaterial(cadre, plastic(TOY.wallCream))

  const plaque = engine.addEntity()
  Transform.create(plaque, { parent: racine, scale: Vector3.create(LARGEUR, HAUTEUR, 0.14) })
  MeshRenderer.setBox(plaque)
  Material.setPbrMaterial(plaque, plastic('#12141c'))
  montable(plaque, 'board.glb')

  const pied = engine.addEntity()
  const hauteurPied = BELT_HEIGHT + 0.6 + HAUTEUR / 2 + 0.2
  Transform.create(pied, { parent: racine, position: Vector3.create(0, -HAUTEUR / 2 - hauteurPied / 2 + 0.1, 0), scale: Vector3.create(0.6, hauteurPied, 0.6) })
  MeshRenderer.setBox(pied)
  Material.setPbrMaterial(pied, plastic(TOY.wallCream))

  // Two faces through one layout: the back pivot is the front one turned round, so every
  // child's left stays on the reader's left.
  const devant = engine.addEntity()
  Transform.create(devant, { parent: racine })
  const dos = engine.addEntity()
  Transform.create(dos, { parent: racine, rotation: Quaternion.fromEulerDegrees(0, 180, 0) })
  faces.push(face(devant), face(dos))

  let acc = 0
  engine.addSystem((dt) => {
    acc += dt
    if (acc < 1) return
    acc = 0
    let r: ReturnType<typeof Records.get> | null = null
    for (const [, v] of engine.getEntitiesWith(Records)) r = v
    if (r === null) return
    const now = Date.now()
    const dernier = [...r.journal].reverse().slice(0, LIGNES_JOURNAL)
    for (const f of faces) {
      for (let i = 0; i < RANGS; i++) {
        const e = r.earners[i]
        const v = r.thieves[i]
        ecrire(f.earners[i], e ? `${i + 1}.  ${e.name}` : i === 0 ? 'nobody yet' : '', e ? `${formatIncome(e.value)}/s` : '')
        ecrire(f.thieves[i], v ? `${i + 1}.  ${v.name}` : i === 0 ? 'nobody yet' : '', v ? `${v.value} ${v.value === 1 ? 'steal' : 'steals'}` : '')
      }
      for (let i = 0; i < LIGNES_JOURNAL; i++) {
        const e = dernier[i]
        ecrire(f.journal[i], e ? ligneDuJournal(e, now) : i === 0 ? 'quiet so far' : '')
      }
    }
  })
}
