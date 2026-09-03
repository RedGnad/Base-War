/**
 * "I am the one who just placed my base", known by the two pieces that depend on it.
 *
 * Without this fact, two wrong things happened in the same second (owner, 2 Sep). The ground
 * marker came back: `placeHere` clears it, but the system that lights it on its own only reads
 * `theftView.basePosee`, which arrives from the server a round trip later, and during that round
 * trip it relit it. And the spawn-at-home fired: it waits twenty seconds for a base to arrive
 * from the server, but a PLACED base arrives by the same path as a RESTORED one, so the player
 * who had just chosen their spot was immediately teleported to their door. The genre's rule is
 * "you spawn home ON ARRIVAL", not "you get moved when you build": someone who just placed their
 * base already stands exactly where they wanted.
 *
 * A module with no imports at all, on purpose: `slots.ts` and `travel.ts` are both already in
 * `setup.ts`'s import chain, and a shared fact must not depend on module initialisation order.
 */
export const poseView = { pending: false }
