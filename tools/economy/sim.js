// Greedy-player simulator for the ladder: node tools/economy/sim.js
// A player who buys the best crate they can afford the second they can, fills every slot,
// buys a floor the moment it is affordable and allowed, and prestiges the moment they can.
// No theft, no gifts, no rushes: a LOWER BOUND on real times. Written 27 Aug 2026 after a
// tester chained floors 2 to 4 and three prestiges in an evening.
const PROD = [1, 7, 44, 287, 1897, 12523, 82654]; const MAVG = 1.630  // expected mutation multiplier after the 5 Sep tail lift (was 1.492)
const W = [[55,22,6,1.2,0.2,0.03,0.004],[22,55,22,6,1.2,0.2,0.03],[6,22,55,22,6,1.2,0.2],[1,6,22,55,22,6,1.2],[0.2,1.2,6,22,55,22,6],[0.03,0.2,1.2,6,22,55,22]]
const yieldOf = (w) => { const t = w.reduce((a, b) => a + b, 0); return w.reduce((a, x, i) => a + x / t * PROD[i], 0) * MAVG }
const rarOf = (w) => { const t = w.reduce((a, b) => a + b, 0); let r = 0; for (let i = 0; i < 7; i++) r += w[i] / t * i; return r }
const fmt = (t) => t < 3600 ? Math.round(t / 60) + 'min' : t < 86400 ? (t / 3600).toFixed(1) + 'h' : (t / 86400).toFixed(1) + 'd'
function sim(cfg) {
  const { payback, floorBase, floorGrowth, prestigeBase, prestigeGrowth, guard, cashBonus, label, maxFloors, gate, days, wipe = true } = cfg
  const price = W.map((w, i) => yieldOf(w) * payback[i])
  const avail = [0, 0, 0, 0, 17 * 60, 70 * 60]  // Legendary and Mythic crates are rare on the belt
  let coins = 0, items = [{ y: yieldOf(W[0]), r: rarOf(W[0]) }], floors = 1, n = 0, t = 0
  const lastBuy = [-1e9, -1e9, -1e9, -1e9, -1e9, -1e9]
  const ms = []; const mark = (s) => ms.push(s + ' @ ' + fmt(t)); const seen = new Set()
  while (t < days * 86400) {
    const inc = items.reduce((a, x) => a + x.y, 0) * (1 + n); coins += inc; t += 1
    const slots = floors * 6
    let best = -1; for (let i = 5; i >= 0; i--) { if (price[i] <= coins && t - lastBuy[i] >= avail[i]) { best = i; break } }
    if (best >= 0) {
      const y = yieldOf(W[best])
      if (items.length < slots) { coins -= price[best]; items.push({ y, r: rarOf(W[best]) }); lastBuy[best] = t; if (!seen.has(best)) { seen.add(best); mark('crate tier ' + best) } }
      else { const worst = items.reduce((m, x, i) => x.y < items[m].y ? i : m, 0); if (items[worst].y * 1.5 < y) { coins -= price[best]; coins += items[worst].y * 30; items[worst] = { y, r: rarOf(W[best]) }; lastBuy[best] = t } }
    }
    if (floors < maxFloors && (!gate || n >= floors - 1)) { const fc = floorBase * Math.pow(floorGrowth, floors - 1); if (coins >= fc) { coins -= fc; floors++; if ([2, 3, 5, 8, 12].includes(floors)) mark('floor ' + floors) } }
    const pc = prestigeBase * Math.pow(prestigeGrowth, n); const minR = Math.min(1 + Math.floor(n / 2), 6)
    const bestR = items.reduce((m, x) => Math.max(m, x.r), -1)
    if (coins >= pc && bestR >= minR - 0.5 && n < 30) { items.sort((a, b) => b.y - a.y); items = items.slice(0, guard); n++; coins = wipe ? Math.round(pc * cashBonus) : coins - pc; if ([1, 2, 3, 5, 7, 10].includes(n)) mark('P' + n) }
  }
  console.log('== ' + label + '\n   ' + ms.join(' | '))
}
const PB4 = [60, 240, 960, 3840, 15360, 61440]
sim({ label: 'LIVE 27 Aug (thr 10M x6, guard 1 then 2, cash to 1%, floors x4 gated by prestige, paybacks x4)', payback: PB4, floorBase: 800e3, floorGrowth: 4, prestigeBase: 10e6, prestigeGrowth: 6, guard: 1, cashBonus: 0.01, maxFloors: 12, gate: true, days: 30 })
sim({ label: 'same, wipe all (guard 0)', payback: PB4, floorBase: 800e3, floorGrowth: 4, prestigeBase: 10e6, prestigeGrowth: 6, guard: 0, cashBonus: 0.01, maxFloors: 12, gate: true, days: 30 })
sim({ label: 'BEFORE (thr 2.5M x4, no wipe, floors x2.31 ungated, paybacks x2)', payback: [60, 120, 240, 480, 960, 1920], floorBase: 800e3, floorGrowth: 2.313, prestigeBase: 2.5e6, prestigeGrowth: 4, guard: 1, cashBonus: 0, maxFloors: 12, gate: false, days: 14, wipe: false })
