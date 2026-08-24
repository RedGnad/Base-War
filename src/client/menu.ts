import { questsView } from './quests-ui'
import { indexView } from './index-ui'

/**
 * UN SEUL MENU, DEUX ONGLETS.
 *
 * Avant: deux boutons permanents en haut a droite (GOALS, INDEX) ouvrant deux panneaux
 * independants. Le joueur devait donc choisir OU chercher avant de chercher.
 *
 * La regle officielle de Decentraland pour le mobile dit *« Minimize options. Show only
 * what the player needs right now and progressively disclose the rest. »* Nous l'avions
 * citee pour tomber de huit boutons a trois dans la barre du bas, puis nous sommes
 * remontes a onze elements a l'ecran en ajoutant une couche a la fois.
 *
 * Un bouton, un panneau, deux onglets: -1 element permanent, et surtout une decision de
 * moins avant d'obtenir l'information.
 */
export type Onglet = 'goals' | 'index'

export const menuView = { get ouvert(): boolean { return questsView.ouvert || indexView.ouvert } }

export function ongletActif(): Onglet { return indexView.ouvert ? 'index' : 'goals' }

export function fermerMenu(): void {
  questsView.ouvert = false
  indexView.ouvert = false
}

/** Le bouton unique: ouvre sur le dernier onglet utile, ou ferme. */
export function basculerMenu(): void {
  if (menuView.ouvert) { fermerMenu(); return }
  questsView.ouvert = true
}

export function choisirOnglet(o: Onglet): void {
  questsView.ouvert = o === 'goals'
  indexView.ouvert = o === 'index'
}
