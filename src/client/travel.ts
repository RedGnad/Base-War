import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Plot, CENTER, BASE_SIDE, FLOOR_HEIGHT, orientToBase } from '../shared/schemas'
import { moveTo } from './deplacer'
import { poseView } from './pose'
import { myClientAddress } from './theft'
import { alerter } from './theft'

function maBase(): Vector3 | null {
  const moi = myClientAddress()
  if (moi === '') return null
  for (const [e, p] of engine.getEntitiesWith(Plot)) {
    if (p.ownerId.toLowerCase() !== moi) continue
    const t = Transform.getOrNull(e)
    if (t === null) return null
    // In front of the DOOR, which faces the belt: a base north of the belt is turned round,
    // so the door is on the -z side there. `orientToBase` puts the landing on the right side.
    const o = orientToBase(t.position.z, 0, BASE_SIDE / 2 + 1.5)
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
 * chez-soi ou l'send, et c'est la que le marqueur de pose l'attend.
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
    /*
      Poser sa base n'est pas arriver chez soi.

      Une base POSEE arrive du serveur par le meme chemin qu'une base RESTAUREE, alors ce
      systeme, qui attend vingt secondes qu'une base apparaisse, prenait l'une pour l'autre et
      teleportait a sa porte le joueur qui venait juste de choisir sa place (proprietaire,
      2 Sep, "j'ai pose ma base et j'ai eu MOVED tout de suite"). Il se tient deja exactement
      ou il a voulu.
    */
    if (poseView.pending) { fait = true; return }
    attente += dt
    if (attente > 20) { fait = true; return }
    const chez = maBase()
    if (chez === null) return
    fait = true
    moveTo('apparition', chez, Vector3.create(CENTER.x, 1.6, CENTER.z))
  })
}

export function rentrer(): void {
  const p = maBase()
  if (p === null) { alerter('YOU HAVE NO BASE YET', '#ffd166', 3000); return }
  moveTo('retour-base', p, Vector3.create(p.x, FLOOR_HEIGHT, p.z - 4))
}

export function goToBelt(): void {
  const p = Vector3.create(CENTER.x, 0, CENTER.z - 4.5)
  moveTo('tapis', p, Vector3.create(CENTER.x, 2.5, CENTER.z))
}
