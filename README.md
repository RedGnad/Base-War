# Base Tycoon

A multiplayer tycoon for Decentraland. Open crates, put your loot on show, and it earns
while you are away. Everything on show can be taken by someone else.

Built with SDK7 and a Decentraland **multiplayer server**: all game state, loot rolls,
prices and anti-cheat checks run headless and server-side. Clients only send intent.

## Loop

1. **Buy a crate** from the belt in the middle of the venue.
2. The crate **walks to your base** — and anyone can outbid you for it at 150% along the way.
3. **Smash it** to reveal an item: 7 rarities x 14 mutations.
4. Items on your base **earn coins**, online and offline.
5. **Take from other bases**, or leave a gift on one. Arm a sentry so they cannot take yours.

## Run it

```bash
npm install
npm run start
```

Two players locally, two identities, one server:

```bash
npm run start -- --multi-instance --skip-auth-screen false
```

## Layout

```
src/
  index.ts        entry point, server/client branching
  shared/         synced components, messages, economy — run on both sides
  server/         authoritative logic: loot rolls, prices, theft, persistence
  client/         rendering, input, UI
```

`src/shared/economie.ts` holds every economic constant in one place. Costs grow ~x13 per
tier while production grows ~x6.6, so the cost-per-income ratio doubles at each step;
prestige follows a cube root of lifetime earnings.

## Notes

- The server is authoritative. Clients never send a price, a roll or a position that
  matters — the server measures distances itself from `PlayerIdentityData`.
- State persists in Decentraland `Storage`, no private backend.
- Everything is built from SDK primitives: no external assets.

## License

MIT — see [LICENSE](LICENSE).
