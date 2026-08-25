import { questsView } from './quests-ui'
import { indexView } from './index-ui'
import { travelView } from './travel'

/**
 * One way in, three destinations.
 *
 * The platform allows the scene exactly one extra button on the client's own control
 * cluster before the rest fold behind a "+", so travel, objectives and the collection
 * cannot each have one. They share it. That is not a compromise forced on the design: a
 * bar of ours holding TRAVEL, GO HOME, TO BELT and MOVE came to some eight hundred and
 * sixty pixels inside a container of seven hundred and sixty, and overflowed itself. Four
 * rarely-used controls do not belong on screen during play.
 */
export type Onglet = 'goals' | 'index' | 'travel'

export const menuView = {
  get open(): boolean { return questsView.open || indexView.open || travelView.open }
}

export function activeTab(): Onglet {
  return indexView.open ? 'index' : travelView.open ? 'travel' : 'goals'
}

export function closeMenu(): void {
  questsView.open = false
  indexView.open = false
  travelView.open = false
}

export function basculerMenu(): void {
  if (menuView.open) { closeMenu(); return }
  questsView.open = true
}

export function chooseTab(o: Onglet): void {
  questsView.open = o === 'goals'
  indexView.open = o === 'index'
  travelView.open = o === 'travel'
}
