import { questsView } from './quests-ui'
import { indexView } from './index-ui'

export type Onglet = 'goals' | 'index'

export const menuView = { get ouvert(): boolean { return questsView.ouvert || indexView.ouvert } }

export function ongletActif(): Onglet { return indexView.ouvert ? 'index' : 'goals' }

export function fermerMenu(): void {
  questsView.ouvert = false
  indexView.ouvert = false
}

export function basculerMenu(): void {
  if (menuView.ouvert) { fermerMenu(); return }
  questsView.ouvert = true
}

export function choisirOnglet(o: Onglet): void {
  questsView.ouvert = o === 'goals'
  indexView.ouvert = o === 'index'
}
