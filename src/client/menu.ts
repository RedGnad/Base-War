import { questsView } from './quests-ui'
import { indexView } from './index-ui'

export type Onglet = 'goals' | 'index'

export const menuView = { get open(): boolean { return questsView.open || indexView.open } }

export function activeTab(): Onglet { return indexView.open ? 'index' : 'goals' }

export function closeMenu(): void {
  questsView.open = false
  indexView.open = false
}

export function basculerMenu(): void {
  if (menuView.open) { closeMenu(); return }
  questsView.open = true
}

export function chooseTab(o: Onglet): void {
  questsView.open = o === 'goals'
  indexView.open = o === 'index'
}
