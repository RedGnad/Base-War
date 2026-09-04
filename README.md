# Rob a Base

![Rob a Base](images/base-war-thumbnail.png)

**How rich can you get before someone robs you?** Smash crates, put your loot on show, and
it earns while you are away. Lock your door, arm a sentry, or go rob theirs.

A multiplayer tycoon-theft game for the Decentraland mobile app, built for the Friendzone
Mobile Buildathon 2026. World: `basewar.dcl.eth`.

| Play it | Link |
|---|---|
| Phone (Decentraland mobile app) | https://mobile.dclexplorer.com/open?realm=basewar.dcl.eth |
| Desktop (Decentraland launcher) | https://decentraland.org/jump?realm=basewar.dcl.eth |
| Public listing | https://decentraland.org/places/world/?name=basewar.dcl.eth |

## The loop

1. **Buy a crate** on the belt in the middle of the plaza. It walks to your base, and anyone
   can outbid you for it at 150 % on the way.
2. **Smash it** on your base to reveal an item: 7 rarities, 14 mutations, themed crates during
   rushes.
3. **Put it on show.** Everything on display earns coins, online and offline (35 % of your
   income for up to four hours while you are away, collected on your next visit).
4. **Rob a base.** Walk into someone else's, hold the action button, carry the item home.
   The owner is alerted the moment you touch it and can shoot you down on the way out.
5. **Defend yours.** A lock seals the door for a while (150 s recharge, only after use), a
   sentry per storey blocks thieves and fires a tracer everyone sees and hears, and gear
   (traps, cloak, taser, bomb) turns a visit into a fight.
6. **Grow.** Up to 12 storeys of 6 slots, fusion of items into rarer ones, luck upgrades,
   base skins, prestige (rebirth), quests, a seven-day daily reward, and a global leaderboard.
7. **Show up for the rush.** A random rush on a timer, a grand rush at a fixed UTC hour every
   day, a boss on the plaza, and raids on other players' bases.

Everything above is live in the world and served by one authoritative server: all state, loot
rolls, prices, distances and anti-cheat checks run headless, clients only send intent.

## For judges

The three explanations the Buildathon asks for, as answers, then the question every tycoon
world has to answer: what happens when it is full.

**Designed for mobile.** One thumb plays the whole game. A single action button does whatever
is in front of you (buy, smash, rob, lock, place, fuse) and its glyph tells you which before
you press. The pad is laid out from measurements of the mobile explorer's own controls, with
its own jump and glider pictures, so nothing has to be learned twice. The risky moves, a
theft or a fusion, are holds rather than taps, so a stray touch costs nothing. Every crate,
door, sign and rush is readable at phone size, and the desktop HUD is the same pad scaled
up, so both platforms play the same game.

**Encourages social interaction.** Nothing on show is safe: any item can be carried away by
another player, the owner is alerted with the thief's name, and the way out is a shootout.
A crate walking to someone's base can be outbid by anyone watching the belt. You can leave a
gift on a base as well as rob it. Sentry shots, door seals and rush calls are seen and heard
by everyone on the plaza, base signs carry each owner's name and prestige, and the
leaderboard ranks the whole world. Company pays: every other player present raises your
income by 15 %, up to 60 %.

**Why players come back.** Leaving is a decision, not an exit: your base keeps earning for
four hours (at 35 % of your rate) and the welcome-back screen pays it out, while your loot
stays a target for everyone else. A daily reward on a seven-day cycle, quests, a grand rush
at the same UTC hour every day, prestige tiers that reset the base for a permanent
multiplier, twelve storeys to unlock and a collection index of every rarity and mutation
each give a reason to open the app again.

### A full world

**A newcomer always gets a base.** The ground shows where a base can stand, and if the chosen
square was taken in the half second before the tap, the server places the base on the
nearest legal square and says so, instead of refusing. New bases start on sixteen spots
along two streets facing the belt, then on any free square of the grid. A welcome crate
arrives after ten minutes of play, with a bar that shows it coming.

**Room is a budget, not a head count.** The phone renders about four hundred objects before
it degrades, so the server keeps a ledger of 385: 145 for the plaza and its decor, the rest
for bases, each charged what it really costs (a one-storey base 6, a twelve-storey tower 28).
When a newcomer needs room and the ledger is full, the base of the player absent for longest
steps off the field. Nothing is lost: it stays stored with its items, storeys and prestige,
stops earning while it is off the field, and stands again on the owner's return. A player
who is present is never removed; if everyone present fills the ledger, placing a base or
buying a storey is refused and the coins are not taken. Bases unseen for a week stay stored
but no longer occupy the ground.

**Drawing a street of towers on a phone.** The same ledger picks the level of detail: the
nearest bases are drawn in full, items included, the rest as a silhouette with its height and
colour, and your own base and any within reach are always full. A storey is four merged
meshes instead of twenty-three objects, collisions stay on invisible boxes, sixty bases
share one copy of each item model, and every effect is geometry or a textured quad. The
numbers come from measurements on the mobile client (2 Sep): decor alone 160 objects,
sixteen full bases 530, a full base about 49, a distant one about 8.

### Verify in sixty seconds

- Open the phone link above; the world loads without any account setup beyond the app's own.
- The four-character build stamp in `1 MENU` is the deployed commit; compare it with `git log`.
- `images/base-war-thumbnail.png` in this repository is byte-identical to the thumbnail the
  Worlds content server serves for `basewar.dcl.eth`.
- Server logs of the live world: `npm run server-logs -- --world basewar.dcl.eth` (wallet
  listed in `scene.json` `logsPermissions`).

## Architecture

Decentraland SDK7 with the **multiplayer server** branch (`@dcl/sdk@auth-server`): one
codebase, `isServer()` branching, the server runs headless on Decentraland's infrastructure
and persists to Decentraland `Storage`. No private backend, no external service.

- 94 message types between client and server, 31 server-side handlers, 13 validators on
  synced components so a client can never write server-owned state.
- Clients never send a price, a roll or a position that matters: the server measures
  distances itself from `PlayerIdentityData`.
- Coins and prices are `Int64`; working state lives in memory and is persisted at
  checkpoints, because storage writes are capped and the isolate has a 256 MB ceiling.
- About 19,700 lines of TypeScript; CI builds every push (`.github/workflows/ci.yml`).

```
src/
  index.ts        entry point, server/client branching
  shared/         synced components, messages, economy, loot table, quests (both sides)
  server/         belt, convoys, loot, theft, combat, gear, fusion, raids, events, records
  client/         rendering, input pad, HUD, plots, combat feel, toys, preload
tools/            generators for every model, sound, texture, icon and emote in assets/
```

`src/shared/economy.ts` holds every economic constant in one place, with the reasoning next
to each number. `tools/economy/sim.js` replays the whole progression.

Every model, sound, texture, icon and avatar clip in `assets/` is built by a script in
`tools/`, apart from the pistol (open Decentraland model catalog) and two joypad glyphs
(`NOTICE.md`): no third-party art, and every asset can be rebuilt from source.

## Run it locally

```bash
npm install
npm run start
```

Two players locally, two identities, one server:

```bash
npm run duo
```

It kills any stale preview, starts one on port 8000 and opens two explorer windows against
it. `npm run duo:reset` does the same after clearing scene storage. `bash tools/deploy.sh`
builds for production, writes the build stamp and deploys to the world.

## License

MIT, see [LICENSE](LICENSE). Third-party attributions are listed in [NOTICE.md](NOTICE.md).
