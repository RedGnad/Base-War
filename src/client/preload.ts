import { engine, AssetLoad } from '@dcl/sdk/ecs'
import { CRATES } from '../shared/loot-table'

/*
  The models the world shows within the first minute, asked for at once.

  The client fetches a model the first time an entity names it. Bases, belt crates and toys
  arrive after the room has synced, so each of them popped in on first sight, one download
  at a time (owner, 4 Sep: "the world loads slowly"). The renderer accepts a list of assets
  to fetch ahead (`AssetLoad`, checked in the SDK's own test scene 88,-12), so this names
  everything a first visit is certain to need: the storeys and their glass, the default
  accent and climb, every crate tier on the belt, every toy rarity. The bytes are the same
  ones the visit would download anyway; they now arrive while the loading screen is still
  up instead of one by one while the player is already walking.

  Decor is not listed: its entities exist from the first frame and are requested on their
  own. Skins are not listed either: a skinned base is rare and its glass arrives on sight.
*/
const FIRST_MINUTE: string[] = [
  'assets/Models/storey-ground.glb', 'assets/Models/storey-upper.glb', 'assets/Models/glass.glb',
  'assets/Models/accent-0.glb', 'assets/Models/climb-0.glb',
  ...CRATES.map((_, i) => `assets/Models/crate-${i}.glb`),
  ...[0, 1, 2, 3, 4, 5].map((r) => `assets/toy/item-${r}.glb`)
]

export function setupPreload(): void {
  AssetLoad.getOrCreateMutable(engine.addEntity(), { assets: FIRST_MINUTE })
}
