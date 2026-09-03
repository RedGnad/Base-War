import { questsView } from './quests-ui'
import { indexView } from './index-ui'
import { travelView } from './travel'
import { shopView } from './shop-ui'

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
export type Onglet = 'goals' | 'index' | 'travel' | 'shop'

export const menuView = {
  get open(): boolean { return questsView.open || indexView.open || travelView.open || shopView.open }
}

export function activeTab(): Onglet {
  return indexView.open ? 'index' : travelView.open ? 'travel' : shopView.open ? 'shop' : 'goals'
}

/**
 * The page the dialog body is showing.
 *
 * The body used to scroll, and scrolling drew the client's own scrollbar: a grey bar with
 * arrow buttons, the one element on screen not drawn by us, and this SDK offers no way to
 * restyle or hide it (owner, 3 Sep). So the body pages instead: it clips to its height and
 * two chevrons of ours turn the pages. A page is one body height; the last one is short.
 */
export const dialogPage = { n: 0 }

export function turnPage(delta: number, pages: number): void {
  dialogPage.n = Math.max(0, Math.min(pages - 1, dialogPage.n + delta))
}

export function closeMenu(): void {
  dialogPage.n = 0
  questsView.open = false
  indexView.open = false
  travelView.open = false
  shopView.open = false
}

export function basculerMenu(): void {
  if (menuView.open) { closeMenu(); return }
  dialogPage.n = 0
  questsView.open = true
}

export function chooseTab(o: Onglet): void {
  dialogPage.n = 0
  questsView.open = o === 'goals'
  indexView.open = o === 'index'
  travelView.open = o === 'travel'
  shopView.open = o === 'shop'
}
