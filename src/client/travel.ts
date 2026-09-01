import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Plot, CENTER, BASE_SIDE, FLOOR_HEIGHT, SCENE_SIDE, tourner } from '../shared/schemas'
import { allerA } from './deplacer'
import { monAdresseClient } from './theft'
import { alerter } from './theft'

function maBase(): Vector3 | null {
  const moi = monAdresseClient()
  if (moi === '') return null
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const t = Transform.getOrNull(e)
    if (t === null) return null
    // In front of the DOOR, which faces the belt: a base north of the belt is turned round,
    // so the door is on the -z side there. `tourner` puts the landing on the right side.
    const o = tourner(t.position.z, 0, BASE_SIDE / 2 + 1.5)
    return Vector3.create(t.position.x + o.dx, 0, t.position.z + o.dz)
  }
  return null
}

export const travelView = {
  peutRentrer: false,
  open: false
}

export function setupTravel(): void {
  engine.addSystem(() => { travelView.peutRentrer = maBase() !== null })
  apparaitreChezSoi()
  ramenerSiDehors()
}

/**
 * On apparait chez soi, une fois, a la connexion.
 *
 * C'est ce que fait la reference: chaque parcelle contient sa propre part `Spawn`, le serveur
 * y teleporte son proprietaire (`Plot:TeleportOwnerToSpawn`, code decompile lu le 1 Sep), et
 * son wiki le dit en une ligne, "You spawn at your base". La raison tient au jeu: la base est
 * ce qui produit, ce qui se fait voler, et le seul endroit ou l'on ouvre une caisse. Arriver
 * ailleurs commence chaque session par une marche.
 *
 * Un joueur qui n'a pas encore de base garde le point d'apparition de la scene: il n'a pas de
 * chez-soi ou l'envoyer, et c'est la que le marqueur de pose l'attend.
 *
 * Une seule fois, et seulement dans les vingt premieres secondes: la base arrive du serveur
 * quelques instants apres l'entree, alors on l'attend, mais on ne teleporte jamais quelqu'un
 * qui a commence a jouer.
 */
function apparaitreChezSoi(): void {
  let attente = 0
  let fait = false
  engine.addSystem((dt: number) => {
    if (fait) return
    attente += dt
    if (attente > 20) { fait = true; return }
    const chez = maBase()
    if (chez === null) return
    fait = true
    allerA('apparition', chez, Vector3.create(CENTER.x, 1.6, CENTER.z))
  })
}

export function rentrer(): void {
  const p = maBase()
  if (p === null) { alerter('YOU HAVE NO BASE YET', '#ffd166', 3000); return }
  allerA('retour-base', p, Vector3.create(p.x, FLOOR_HEIGHT, p.z - 4))
}

export function goToBelt(): void {
  const p = Vector3.create(CENTER.x, 0, CENTER.z - 4.5)
  allerA('tapis', p, Vector3.create(CENTER.x, 2.5, CENTER.z))
}

/**
 * Sorti du terrain, on y est ramene. Sans exception et sans avoir a demander.
 *
 * Il n'y a rien dehors: le monde est ces cent quatre-vingt-douze metres, la bordure ne fait
 * que trois metres vingt et le planeur passe par-dessus, un solide qui se deplace peut
 * pousser un corps a travers, et une chute laisse tomber sous le sol. Quelle que soit la
 * cause, la situation est la meme et elle est sans issue: le joueur est dans le vide rouge,
 * son bouton contextuel ne propose plus rien, et la seule sortie serait de quitter le monde
 * (proprietaire, 2 Sep). Le genre traite ca depuis toujours par un retour automatique, chez
 * soi si on a une base, au tapis sinon.
 *
 * Huit dixiemes de seconde de tolerance, pour ne pas se declencher sur un frottement contre
 * la bordure, puis un delai avant de pouvoir recommencer, le temps que le retour prenne.
 */
function ramenerSiDehors(): void {
  let dehors = 0
  engine.addSystem((dt: number) => {
    const t = Transform.getOrNull(engine.PlayerEntity)
    if (t === null) return
    const p = t.position
    /*
      Le seuil est la face INTERNE de la bordure, pas la marge prudente du portail.

      Le mur occupe les huit premiers decimetres; un joueur colle a l'interieur se tient vers
      1,15 m, et le declencher la serait le renvoyer chez lui parce qu'il longe le decor. On ne
      reagit qu'a un corps reellement passe de l'autre cote, ou tombe sous le sol.
    */
    const perdu = p.x < 0.6 || p.x > SCENE_SIDE - 0.6 || p.z < 0.6 || p.z > SCENE_SIDE - 0.6 || p.y < -4
    if (!perdu) { dehors = dehors < 0 ? Math.min(0, dehors + dt) : 0; return }
    dehors += dt
    if (dehors < 0.8) return
    dehors = -4
    const chez = maBase()
    const cible = chez ?? Vector3.create(CENTER.x, 0, CENTER.z - 4.5)
    const camera = chez === null
      ? Vector3.create(CENTER.x, 2.5, CENTER.z)
      : Vector3.create(chez.x, FLOOR_HEIGHT, chez.z - 4)
    if (allerA('hors-terrain', cible, camera)) alerter('OUT OF BOUNDS  ·  BROUGHT BACK', '#ffd166', 2600)
  })
}
