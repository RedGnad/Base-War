import { engine, Transform, MeshRenderer, Material, TextShape, TextAlignMode, Entity, Billboard, BillboardMode } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
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
/** Gold, silver and bronze, as metals rather than as pastels: #e0a466 was a tan. */
const RANG_COULEUR = ['#ffd447', '#c9d1dc', '#cd7f32']
/**
 * The podium's three rows stand taller than the rest, because a face needs the height.
 *
 * The board's vertical budget is fixed at HAUTEUR, and it is spent, not guessed: the first
 * cut of this podium pushed the sixth journal line to -3.72 on a panel whose bottom edge is
 * -3.70, which is a line drawn into the frame. Every gap below is measured against that
 * total, and a face is 0.38, a little taller than the 0.3 of a line of text, which is the
 * proportion the reference leaderboards use.
 */
const PAS_PODIUM = 0.56
const PORTRAIT = 0.38
const TEXTE = '#f2f4f8'
const BANDE = Color4.create(1, 1, 1, 0.07)

type Ligne = { gauche: Entity; droite: Entity | null; texteG: string; texteD: string; surbrillance: Entity | null; hautG: number; portrait: Entity | null; dernierId: string }
type Face = { earners: Ligne[]; thieves: Ligne[]; journal: Ligne[] }
const faces: Face[] = []
let moi = ''

function texte(parent: Entity, x: number, y: number, taille: number, hex: string, align: TextAlignMode): Entity {
  const e = engine.addEntity()
  // A text is readable from its -Z side (tester, 27 Aug: the first build read mirrored), so each face's
  // text sits on the -Z side of its pivot; the back pivot's turn puts its copy on the far side.
  Transform.create(e, { parent, position: Vector3.create(x, y, -0.11) })
  TextShape.create(e, {
    text: '', fontSize: taille, textColor: Color4.fromHexString(hex + 'ff'),
    outlineWidth: 0.12, outlineColor: NOIR, textAlign: align, textWrapping: false
  })
  return e
}

function bande(parent: Entity, x: number, y: number, largeur: number, pas = PAS): void {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: Vector3.create(x, y, -0.085), scale: Vector3.create(largeur, pas - 0.06, 0.01) })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, plasticDe(BANDE, 0))
}

/**
 * The medal: a metal disc, and the player's own face on it.
 *
 * The platform can texture a surface with any player's avatar from their address alone
 * (`Material.Texture.Avatar`), which is how a leaderboard stops being a list of strings.
 * Only the podium gets one: a face is a render per row, and this board carries two faces of
 * five rows in two columns. Three is the budget, and the three that matter.
 *
 * The disc is drawn wider than the portrait, so a face that never loads still leaves a
 * medal rather than a hole.
 */
function medaille(parent: Entity, x: number, y: number, hex: string): Entity {
  const disque = engine.addEntity()
  Transform.create(disque, {
    parent, position: Vector3.create(x, y, -0.1),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
    scale: Vector3.create(PORTRAIT + 0.12, 0.02, PORTRAIT + 0.12)
  })
  MeshRenderer.setCylinder(disque, 0.5, 0.5)
  Material.setPbrMaterial(disque, plastic(hex, 1.3))

  const portrait = engine.addEntity()
  Transform.create(portrait, { parent, position: Vector3.create(x, y, -0.118), scale: Vector3.Zero() })
  MeshRenderer.setPlane(portrait)
  return portrait
}

/** Puts a face on a podium row, or takes it off. Only writes when the player changes. */
function visage(l: Ligne, id: string): void {
  if (l.portrait === null || l.dernierId === id) return
  l.dernierId = id
  const t = Transform.getMutableOrNull(l.portrait)
  if (t !== null) t.scale = id === '' ? Vector3.Zero() : Vector3.create(PORTRAIT, PORTRAIT, 1)
  // Unlit: a portrait lit by the scene's sun would go dark on the shaded face of the board.
  if (id !== '') Material.setBasicMaterial(l.portrait, { texture: Material.Texture.Avatar({ userId: id }) })
}

/**
 * A row, with the two things a leaderboard needs beyond its text.
 *
 * A medal on the top three, and a band that can light up gold for the reader's OWN line.
 * Both come from the same lesson: a table where every line looks alike makes the reader
 * search, and the one line they came to find is their own. The highlight is built at zero
 * scale on every row and grown on the one that matches, so lighting it costs a scale.
 */
function ligne(parent: Entity, xg: number, xd: number | null, y: number, largeurBande: number, pair: boolean, hex: string, rang: number, sien: boolean, pas: number): Ligne {
  if (pair) bande(parent, xd === null ? xg + largeurBande / 2 : (xg + xd) / 2, y, largeurBande, pas)
  let surbrillance: Entity | null = null
  if (sien) {
    surbrillance = engine.addEntity()
    Transform.create(surbrillance, {
      parent,
      position: Vector3.create(xd === null ? xg + largeurBande / 2 : (xg + xd) / 2, y, -0.09),
      scale: Vector3.Zero()
    })
    MeshRenderer.setBox(surbrillance)
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    Material.setPbrMaterial(surbrillance, plastic('#ffd166', 1.1))
  }
  const podium = rang >= 0 && rang < 3
  const decal = podium ? 0.66 : rang >= 0 ? 0.28 : 0
  const portrait = podium ? medaille(parent, xg + 0.3, y, RANG_COULEUR[rang]) : null
  const gauche = texte(parent, xg + decal, y, podium ? 3.3 : 3, hex, TextAlignMode.TAM_MIDDLE_LEFT)
  const droite = xd === null ? null : texte(parent, xd, y, podium ? 3.3 : 3, hex, TextAlignMode.TAM_MIDDLE_RIGHT)
  return { gauche, droite, texteG: '', texteD: '', surbrillance, hautG: largeurBande, portrait, dernierId: '' }
}

/** Lights a row as the reader's own, or puts it out. Called once a second with the data. */
function marquer(l: Ligne, sien: boolean): void {
  const t = l.surbrillance === null ? null : Transform.getMutableOrNull(l.surbrillance)
  if (t === null) return
  const veut = sien ? Vector3.create(l.hautG, PAS - 0.02, 0.012) : Vector3.Zero()
  // The band sits behind the portrait, so a lit row frames the face rather than hiding it.
  if (t.scale.x !== veut.x || t.scale.y !== veut.y) t.scale = veut
  const tg = TextShape.getMutableOrNull(l.gauche)
  if (tg !== null) tg.outlineWidth = sien ? 0.3 : 0.12
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
  let y = haut - MARGE - 0.30

  entete(pivot, 0, y, 4.2, '#ffd166', TextAlignMode.TAM_MIDDLE_CENTER, 'BASE WAR  ·  RECORDS')
  y -= 0.66

  entete(pivot, xg1, y, 3.4, HUE.money, TextAlignMode.TAM_MIDDLE_LEFT, 'TOP EARNERS')
  entete(pivot, xg2, y, 3.4, HUE.danger, TextAlignMode.TAM_MIDDLE_LEFT, 'TOP THIEVES')
  y -= 0.42

  const earners: Ligne[] = []
  const thieves: Ligne[] = []
  for (let i = 0; i < RANGS; i++) {
    const hex = RANG_COULEUR[i] ?? TEXTE
    const pas = i < 3 ? PAS_PODIUM : PAS
    earners.push(ligne(pivot, xg1, xd1, y, moitie, i % 2 === 0, hex, i, true, pas))
    thieves.push(ligne(pivot, xg2, xd2, y, moitie, i % 2 === 0, hex, i, true, pas))
    y -= pas
  }
  y -= 0.06

  entete(pivot, xg1, y, 3.4, '#7cc4ff', TextAlignMode.TAM_MIDDLE_LEFT, 'LATEST')
  y -= 0.46

  const journal: Ligne[] = []
  const pleine = LARGEUR - 2 * MARGE
  for (let i = 0; i < LIGNES_JOURNAL; i++) {
    journal.push(ligne(pivot, xg1, null, y, pleine, i % 2 === 0, TEXTE, -1, false, PAS))
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
    case 'raid': phrase = `${e.a} slew the raid boss, Legendary Crate`; break
    default: phrase = e.a
  }
  // Sixty characters is what the full width holds at this size; the end of a long line is the
  // least informative part of it.
  const ligne = `${quand}   ${phrase}`
  return ligne.length > 60 ? ligne.slice(0, 59) + '…' : ligne
}

export function setupRecords(): void {
  // Centred OVER the belt line and floating, so it is the same distance from bases on either
  // side, not planted on one (tester, 28 Aug: "one arbitrary side"). Two-faced, high enough to
  // clear the crates passing under it.
  const racine = engine.addEntity()
  Transform.create(racine, { position: Vector3.create(CENTER.x, BELT_HEIGHT + HAUTEUR / 2 + 2.4, CENTER.z) })
  // Billboard so it turns to face each viewer wherever they stand (tester preferred this). The
  // two faces stay: whichever way the billboard turns, one readable face is toward the camera,
  // which sidesteps the undocumented "which side of a billboard faces you" (advanced-rendering).
  Billboard.create(racine, { billboardMode: BillboardMode.BM_Y })

  const cadre = engine.addEntity()
  Transform.create(cadre, { parent: racine, scale: Vector3.create(LARGEUR + 0.5, HAUTEUR + 0.5, 0.12) })
  MeshRenderer.setBox(cadre)
  Material.setPbrMaterial(cadre, plastic(TOY.wallCream))

  const plaque = engine.addEntity()
  Transform.create(plaque, { parent: racine, scale: Vector3.create(LARGEUR, HAUTEUR, 0.14) })
  MeshRenderer.setBox(plaque)
  Material.setPbrMaterial(plaque, plastic('#12141c'))
  montable(plaque, 'board.glb')


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
    // Who is reading. Resolved lazily: the profile is not there on the first frames.
    if (moi === '') {
      const me = getPlayer()
      if (me !== null) moi = me.name.toLowerCase()
    }
    const dernier = [...r.journal].reverse().slice(0, LIGNES_JOURNAL)
    for (const f of faces) {
      for (let i = 0; i < RANGS; i++) {
        const e = r.earners[i]
        const v = r.thieves[i]
        ecrire(f.earners[i], e ? `${i + 1}.  ${e.name}` : i === 0 ? 'nobody yet' : '', e ? `${formatIncome(e.value)}/s` : '')
        ecrire(f.thieves[i], v ? `${i + 1}.  ${v.name}` : i === 0 ? 'nobody yet' : '', v ? `${v.value} ${v.value === 1 ? 'steal' : 'steals'}` : '')
        marquer(f.earners[i], e !== undefined && moi !== '' && e.name.toLowerCase() === moi)
        marquer(f.thieves[i], v !== undefined && moi !== '' && v.name.toLowerCase() === moi)
        visage(f.earners[i], e?.id ?? '')
        visage(f.thieves[i], v?.id ?? '')
      }
      for (let i = 0; i < LIGNES_JOURNAL; i++) {
        const e = dernier[i]
        ecrire(f.journal[i], e ? ligneDuJournal(e, now) : i === 0 ? 'quiet so far' : '')
      }
    }
  })
}
