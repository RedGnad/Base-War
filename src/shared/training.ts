import { CENTRE } from './schemas'

/**
 * MACHINES D'ENTRAINEMENT.
 *
 * Source, mot pour mot: elles servent a *« occuper le joueur pendant qu'il attend qu'une
 * boite rare apparaisse »*. C'est le seul temps mort du jeu et il etait vide.
 *
 * CALIBRAGE, pas une valeur choisie au feeling:
 *
 * - Une serie paie **8 secondes de la production du joueur**, avec un plancher de 25
 *   pieces pour qu'elle veuille dire quelque chose quand la base est encore vide. Le
 *   jeu comptait deja en « secondes de production » (`REVENTE_SECONDES = 30`); on
 *   reste dans la meme unite plutot que d'inventer un second bareme.
 * - La recharge est de 30 s **par joueur**, pas par machine: sinon on tourne entre les
 *   quatre machines et la limite ne limite rien.
 * - 2 series par minute x 8 s = **16 s de production gagnees par minute**, soit au plus
 *   +27 % de revenu si on s'entraine sans arret. L'entrainement est un COMPLEMENT: il
 *   ne doit jamais devenir un meilleur revenu que la base, sinon plus personne ne joue
 *   au jeu de base.
 * - 12 repetitions par serie: assez pour que le geste existe, assez court pour tenir
 *   dans l'attente d'une boite (une boite passe toutes les 5 s sur le tapis).
 */
export const REPS_PAR_SERIE = 12
export const ENTRAINEMENT_SECONDES = 8
export const ENTRAINEMENT_MINIMUM = 25
export const ENTRAINEMENT_RECHARGE_MS = 30_000
/** Portee de verification serveur, en metres. Meme logique anti-triche que la caisse. */
export const PORTEE_MACHINE = 5

export type Machine = { id: number; x: number; z: number; nom: string; couleur: string }

/**
 * Rangee au NORD du tapis, dans la bande ou aucune base ne peut etre posee
 * (`raisonInvalide` interdit |z - centre| < 6 pres du tapis): les machines ne peuvent
 * donc jamais se retrouver a l'interieur d'un batiment.
 */
export const MACHINES: readonly Machine[] = [
  { id: 0, x: CENTRE.x - 10, z: CENTRE.z + 4.5, nom: 'BENCH',    couleur: '#4dd2ff' },
  { id: 1, x: CENTRE.x - 3.5, z: CENTRE.z + 4.5, nom: 'SQUAT',   couleur: '#8fe08f' },
  { id: 2, x: CENTRE.x + 3.5, z: CENTRE.z + 4.5, nom: 'ROW',     couleur: '#ffd166' },
  { id: 3, x: CENTRE.x + 10, z: CENTRE.z + 4.5, nom: 'DEADLIFT', couleur: '#f5a524' }
]
