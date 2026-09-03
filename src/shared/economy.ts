/**
 * Every economic constant lives here.
 *
 * Shape taken from the idle/tycoon genre rather than picked by hand: production grows
 * ~x6.6 per tier while cost grows ~x13, so the cost-per-income ratio DOUBLES at each
 * step. A flat ratio makes all tiers equivalent and turns every absolute price trivial
 * two tiers later. Prestige uses a cube root of lifetime earnings, so returns diminish
 * by construction.
 */
export const PRODUCTION_PER_RARITY = [1, 7, 44, 287, 1897, 12523, 82654] as const
/** Selling an item pays this many seconds of its own income. Both sides price from it. */
export const RESELL_SECONDS = 30

/**
 * Derived: expected output x target payback, where payback doubles per tier.
 *
 * Rederived from the tables themselves on 25 Aug, because the previous figures did not do
 * what this comment says. Measured against `CRATE_WEIGHTS` and `MUTATIONS`, a Basic crate
 * paid for itself in ten seconds against a stated sixty, and every price was between 2.4 and
 * 5.9 times too low. The factor that had gone missing is the mutation multiplier: a third of
 * items carry one, worth x1.4921 on average, and the old derivation priced the crate as if
 * none did.
 *
 * The distortion also shrank with tier, 5.9 down to 2.4, which flattened the curve this file
 * exists to create: the early game was a firehose and the late game was not. Second-by-second
 * simulation of the old numbers had six slots full in twenty-four seconds, before a new
 * player can read what a crate is.
 *
 * The scale is the genre's, and deliberately not the event's.
 *
 * There was a version of this file tuned so a three-minute visitor would reach the upper
 * floors. That is the wrong thing to optimise: it buys a demo by flattening the game into
 * something finished in half an hour. What a short visit has to show is the LOOP, not the
 * ladder. Simulated at these prices, a first-time player buys their first crate at one
 * minute and has all six slots full at 2.3, so three minutes shows the whole cycle five
 * times over, and theft is available from the first second because it is gated by nothing.
 * The ladder stays where it belongs: second floor at 24 minutes, third at 1.3 hours.
 */
export const CRATE_PRICE = [2018, 34848, 660529, 11785149, 179901757, 2196893933] as const

/*
  Payback QUADRUPLES a tier, from 27 Aug evening. It doubled, and a greedy player simulated
  second by second (tools/economy/sim.js) went Basic to Epic in 1.3 hours and to Mythic in a
  day and a half: each tier multiplies income by 6.6 and cost only a few minutes of the
  previous tier's income, so the rarity ladder was a firehose feeding the prestige ladder. At
  x4 the same player buys their first Epic crate at 7 hours, Legendary at a day, Mythic at
  five days, with the belt's rarity of those crates on top.
*/
export const CRATE_PAYBACK_S = [60, 240, 960, 3840, 15360, 61440] as const

/**
 * Ce que coute une fusion, en or.
 *
 * Elle etait gratuite, au motif qu'elle "coutait deja trois objets". C'etait faux, et le
 * proprietaire l'a vu avant moi: un palier rapporte 6,5 fois le precedent alors que la fusion
 * n'en consomme que trois, donc chaque fusion MULTIPLIE le revenu par 2,2 et rend deux
 * emplacements par-dessus. En chaine, 729 Commons deviennent un Secret a 82 654/s contre 729/s
 * si on les gardait: cent treize fois plus, gratuitement. On n'achetait que des caisses Basic
 * et on montait toute l'echelle sans jamais payer le prix des paliers (3 Sep).
 *
 * Le prix est le revenu CREE par la fusion, multiplie par un horizon FIXE.
 *
 * Premiere version: le revenu cree multiplie par le temps de retour d'une caisse de ce palier.
 * Elle fermait l'exploit et le fermait trop. Les deux facteurs grandissent d'environ 6,5 par
 * palier, donc le prix grandissait de 42 par palier pendant que la valeur de l'objet n'en
 * gagnait que 6,5: la formule composait deux fois. Monter jusqu'a un Secret coutait 3,13
 * MILLIARDS de frais pour 2,26 M de caisses, soit 1 385 fois le prix de la matiere premiere, et
 * le fuser devenait inutile a quiconque possede de l'or.
 *
 * Un horizon fixe de huit minutes met la fusion entre 1,0 et 1,6 fois le prix d'acheter la
 * meme rarete en caisses, a TOUS les paliers (mesure sur les tables reelles: Uncommon 1,45,
 * Rare 1,57, Epic 1,47, Legendary 1,32, Mythic 1,17, Secret 0,98). Jamais moins cher, donc on
 * ne court-circuite pas l'echelle; jamais absurde, donc la machine garde son role. Le
 * surcout achete trois choses reelles: la fusion est DETERMINISTE la ou une caisse est un
 * pari, elle compacte l'etagere, et elle retire la mutation.
 *
 * Le Secret a parite est voulu: il n'existe pas de caisse Secret, la seule autre voie est la
 * caisse Mythic et son quatre millieme de chance. La parite est le juste prix de la seule
 * route sure vers le sommet.
 */
export const FUSION_HORIZON_S = 480

export function prixFusion(rarete: number): number {
  const r = Math.max(0, Math.min(rarete, PRODUCTION_PER_RARITY.length - 2))
  const cree = PRODUCTION_PER_RARITY[r + 1] - 3 * PRODUCTION_PER_RARITY[r]
  if (cree <= 0) return 0
  return Math.round(cree * FUSION_HORIZON_S)
}
/*
  Two rungs above Epic, added 27 Aug because the ladder stopped where the money started.

  A tester a few days in, at multiplier five with 700M in hand: "nothing costs anything any
  more". The belt's top crate was Epic at 1.47M, which is the reference's conveyor stopping
  at its third tier of seven; theirs runs to the top of the rarity table with prices in the
  trillions, and the expensive item passing by IS the thing a rich player is saving for.
  Same rule as the four below, expected yield times a payback that doubles again: the
  Legendary crate (11713/s) pays back in sixteen minutes, the Mythic crate
  (35758/s) in thirty-two. Both are rare on the belt and both are announced.
*/

/**
 * Floors grow geometrically, and the RATE is the whole ladder. It was set too high.
 *
 * There were three floors at fixed prices, the third reachable in about eighty minutes. For
 * the one purchase that visibly makes the building taller, an hour is nothing: a tycoon's
 * third storey should be the reward for several days. A geometric price is the right answer
 * and it is what the genre does. Four was the wrong number for it.
 *
 * The old comment here claimed four times the last is "what makes the ladder endless". It is
 * the opposite, and the simulation printed right below it was already saying so: 1.1 hours,
 * 3.4, 9.2, 27, 83, 271, 916 for floors two through eight. Those times multiply by about
 * 3.3 each rung, and that ratio tends to the growth rate itself, because cost rises like
 * `g^n` while income rises like `n`. Extending it: floor 12 costs 4^10 times floor 2, which
 * from a measured 1.1 hours is a hundred and thirty-one YEARS. Floors nine through twelve
 * were ornaments nobody could reach, and raising `MAX_FLOORS` would only have added more.
 *
 * Cookie Clicker charges 1.15 per building bought, stated as a formula on its own wiki and
 * checked against its two published rules of thumb (a doubling every 5 purchases, 1.15^5 =
 * 2.01; a thousandfold every 50, 1.15^50 = 1083). Its unit of production is one building.
 * Ours is one SLOT, and a floor grants six of them, so the honest translation of that rate
 * to our unit is 1.15^6. At that rate the same floor 12 lands at about 200 days, which is
 * the months-long climb this file says it wants, and the twelve floors we already have are
 * enough ladder to hold it. The cap was never the binding constraint; the rate was.
 *
 * It stays the safe purchase against prestige, which multiplies income but takes the loot.
 * And it is not free of risk here the way it is in the games this genre came from: every
 * slot is on show, distance to a base is measured at ground level, so building tall makes a
 * bigger target rather than a safer one. If anything that argues for a gentler curve than
 * the genre's, not a steeper one.
 */
export const FLOOR_BASE_PRICE = 800_000
/** 1.15 per unit of production, the genre's rate, times the six slots a floor grants. */
export const FLOOR_PRICE_GROWTH = Math.pow(1.15, 6)

/** Cost of reaching `targetFloor`, which is 2 or more. */
export function floorCost(targetFloor: number): number {
  if (targetFloor <= 1) return 0
  return Math.round(FLOOR_BASE_PRICE * Math.pow(FLOOR_PRICE_GROWTH, targetFloor - 2))
}

/**
 * Prestige 1 lands at about thirty-one minutes of real play, simulated rather than assumed.
 *
 * Every earlier value here was calibrated against a guess at the player's income: 75 000
 * against an assumed 42/s, then 430 000 against a measured 288/s but with the crate prices
 * that turned out to be six times too low. The number is now the outcome of a second-by-
 * second run of the whole loop under the prices above, swept across candidates and read off
 * the milestones it produces.
 *
 * A price paid in coins held, not a lifetime total reached. The cost then multiplies by
 * `PRESTIGE_GROWTH` a rung (see `coutPrestige`); the cube it replaced read "106 hours for
 * the sixth tier" against a base that never held an Epic or a multiplier, and was measured
 * wrong on 27 Aug. A tycoon is a thing somebody can still be playing in three months, and a
 * threshold picked so a visitor reaches the top of it in an afternoon would have thrown that
 * away.
 */
export const PRESTIGE_THRESHOLD = 10_000_000

/*
  What tier `n` costs, in coins the player must have in hand.

  It was called `lifetimeForPrestige` and it is spent straight out of `p.coins`, so the name
  described a model the code does not implement. Its twin `prestigeFor(cumul)`, which derived
  a tier from lifetime earnings, sat right here implementing the other model and was called by
  nothing: two contradictory economies in nine lines, around real money. One survives.
*/
/**
 * Geometric, four times the last rung, and the reason is a measurement.
 *
 * The cube was calibrated against a base of Basic-crate items at multiplier one. Measured on
 * 27 Aug against what a base actually holds after a few days, the ladder was finished: a
 * tester at multiplier five with 700M and "nothing costs anything any more". Simulated with
 * the real tables, six Epic-crate slots earn 18K/s before prestige, and income is multiplied
 * by the tier: under the cube, tier 6 came 1.4 hours after tier 5, tier 10 two hours later,
 * and the ratio between rungs tends to one. A polynomial price against an income that is
 * itself multiplied every rung is a ladder that flattens exactly when it should steepen.
 *
 * The reference's rebirth cash goes $500K, 1.5M, 12.5M, 35M, 100M, 350M, 1B, 5B, 12.5B, 125B
 * ... 30Qa: times 3.35 a rung on average, never under times two.
 *
 * Four from 2.5M was the first correction and it was measured wrong too: it looked at a
 * standing base, not at a player who keeps buying. The greedy player in tools/economy/sim.js
 * reached prestige 5 in 1.7 hours and 10 in a day and a half under it, and the tester did
 * the same in an evening. Ten million then six a rung, with the purse reset to one percent
 * at each prestige and floors gated by prestige: P1 10M, P2 60M, P3 360M, P4 2.2B, P5 13B,
 * P7 467B, P10 101T. The same greedy player, a lower bound on a real one: P1 at 1.4 h, P3 at
 * 4.8 h, P5 at 13 h, P7 at 2 days, P10 past a month; floor 5 at 5 h, floor 8 at a day. Tier
 * 30 is not meant to be reached; it is meant to exist.
 */
export const PRESTIGE_GROWTH = 6
/**
 * What prestige leaves in the purse: the reference's rebirth "takes most of your money" and
 * hands back a cash bonus ($5K after a $500K rebirth, $50K after $35M: about one percent).
 * Without this the tester's coins compounded across prestiges and the ladder was walked in
 * an evening.
 */
export const PRESTIGE_CASH_SHARE = 0.01
/**
 * Floors are gated by prestige as well as priced: floor n opens at prestige n - 2. The
 * reference grows capacity through rebirth (one slot a rebirth, the second floor at R2, the
 * third at R10); ours sold twelve floors for cash alone, and a base at seventy-two slots was
 * a x12 on income bought in an afternoon (tester, 27 Aug: "I chained floors 2, 3, 4 and on").
 */
export const FLOOR_PRESTIGE_GATE = 2
export function coutPrestige(n: number): number {
  return n <= 0 ? 0 : Math.round(PRESTIGE_THRESHOLD * Math.pow(PRESTIGE_GROWTH, n - 1))
}

export function prestigeMultiplier(n: number): number {
  return 1 + Math.max(0, n)
}

/**
 * High enough that nobody meets it.
 *
 * Twelve was a real ceiling: reachable, and then nothing beyond. The tiers are generated by
 * a formula, so having more of them costs nothing at all, and a progression that ends is a
 * progression a long-term player eventually falls off. At the cube scaling above, tier
 * thirty asks for sixty-seven billion.
 */
export const MAX_PRESTIGE = 30

/**
 * Offline earnings are capped in SECONDS OF PRODUCTION, not in hours. An hour-based cap
 * pays an amount that grows with production, so it skips more and more content as the
 * player advances; a production-based cap always grants the same head start.
 */
export const OFFLINE_RATE_V2 = 0.35
export const OFFLINE_CAP_PRODUCTION_S = 900
