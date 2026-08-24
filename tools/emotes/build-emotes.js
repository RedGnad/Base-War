#!/usr/bin/env node
/**
 * Builds the two avatar clips the pistol needs, from the Decentraland reference rig.
 *
 * Decentraland gives a scene no handle on the avatar skeleton other than emotes, and the
 * platform's fixed emote list holds neither an aim nor a shot. So the scene ships its own.
 *
 * The poses are solved, not eyeballed: ask for a hand position in world metres and the
 * script searches the joint rotations that put it there, then reports the residual. The
 * rig is a T-pose at 0.01 scale, forward +Z, the character's right -X, bones along local +Y.
 *
 *   node tools/emotes/build-emotes.js
 *
 * Writes assets/animations/aim_emote.glb and fire_emote.glb. The trailing _emote.glb is a
 * hard runtime requirement, not a convention: the explorer rejects any other name.
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'assets/animations')
const RIG = path.join(__dirname, 'reference-rig.glb')
/** A Decentraland-rigged avatar from the open model catalog, used only for its armature. */
const RIG_URL = 'https://models.dclregenesislabs.xyz/blobs/bafkreidb6iorouc4gzjfpebv2ungg5fnpx3pqpnt5drkzmtuks4lh336cy'

// One hand on the gun, the other down at the side. A two-handed grip needs the support
// arm to cross the chest, which is where an arm rig looks wrong first, and the pistol
// reads fine one-handed. Positions are world metres in rig space: forward +Z, up +Y.
const AIM_R = [-0.13, 1.47, 0.48]
const AIM_L = [0.21, 0.96, 0.06]
const KICK_R = [-0.14, 1.57, 0.42]
const KICK_L = [0.21, 0.96, 0.06]
// Where each elbow is pushed. Without this the solver picks any joint configuration that
// lands the wrist, including ones no shoulder can reach: an arm has more freedom than a
// point target constrains, so the elbow has to be told where to go.
const POLE_R = [-0.6, -1, -0.35]
const POLE_L = [0.6, -1, -0.35]

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location).then(resolve, reject)
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} on ${url}`))
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

function parseGlb(buf) {
  let off = 12, json = null
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4)
    if (type === 0x4E4F534A) json = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8'))
    off += 8 + len
  }
  return json
}

const mul = (a, b) => { const o = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s } return o }
const trs = (t, q, s) => { const [x, y, z, w] = q; return [
  (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
  (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
  (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
  t[0], t[1], t[2], 1] }
const qmul = (a, b) => { const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b; return [
  aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz] }
function qeuler(x, y, z) {
  const r = Math.PI / 180
  const cx = Math.cos(x * r / 2), sx = Math.sin(x * r / 2)
  const cy = Math.cos(y * r / 2), sy = Math.sin(y * r / 2)
  const cz = Math.cos(z * r / 2), sz = Math.sin(z * r / 2)
  return qmul(qmul([sx, 0, 0, cx], [0, sy, 0, cy]), [0, 0, sz, cz])
}

async function main() {
  if (!fs.existsSync(RIG)) {
    process.stdout.write('fetching the reference rig... ')
    fs.writeFileSync(RIG, await get(RIG_URL))
    console.log('ok')
  }
  const rig = parseGlb(fs.readFileSync(RIG))
  const byName = {}; rig.nodes.forEach((n, i) => { if (n.name) byName[n.name] = i })
  const parent = {}; rig.nodes.forEach((n, i) => { for (const c of n.children || []) parent[c] = i })
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

  function handPos(name, poses) {
    let k = byName[name]; const chain = []
    while (k !== undefined) { chain.unshift(k); k = parent[k] }
    let m = I
    for (const j of chain) {
      const n = rig.nodes[j]
      m = mul(m, trs(n.translation || [0, 0, 0], (poses && poses[n.name]) || n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]))
    }
    return [m[12], m[13], m[14]]
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

  /** World matrix of a node, with a map of joint rotations applied on the way down. */
  function worldOf(name, poses) {
    let k = byName[name]; const chain = []
    while (k !== undefined) { chain.unshift(k); k = parent[k] }
    let m = I
    for (const j of chain) {
      const n = rig.nodes[j]
      m = mul(m, trs(n.translation || [0, 0, 0], (poses && poses[n.name]) || n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]))
    }
    return m
  }
  const originOf = (name, poses) => { const m = worldOf(name, poses); return [m[12], m[13], m[14]] }
  /** The node's world basis, unit length: the rig scales uniformly so this is a pure rotation. */
  const basisOf = (name, poses) => {
    const m = worldOf(name, poses)
    return [norm([m[0], m[1], m[2]]), norm([m[4], m[5], m[6]]), norm([m[8], m[9], m[10]])]
  }
  /** Express a world direction in the space of that basis. */
  const intoBasis = (B, v) => [dot(B[0], v), dot(B[1], v), dot(B[2], v)]

  /** Shortest rotation carrying a onto b. */
  function arc(a, b) {
    const d = dot(a, b)
    if (d < -0.999999) {
      let ax = cross([1, 0, 0], a)
      if (Math.hypot(ax[0], ax[1], ax[2]) < 1e-6) ax = cross([0, 0, 1], a)
      ax = norm(ax)
      return [ax[0], ax[1], ax[2], 0]
    }
    const c = cross(a, b)
    const q = [c[0], c[1], c[2], 1 + d]
    const l = Math.hypot(q[0], q[1], q[2], q[3])
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
  }

  /**
   * Analytic two-bone IK.
   *
   * The wrist target fixes three numbers while the shoulder and elbow together offer more
   * than three, so the arm is under-determined and a search will happily return a pose no
   * shoulder can hold. The law of cosines fixes how far the elbow is bent, and the pole
   * vector picks which way it points; nothing is left to chance. Bones run along their own
   * local +Y, so each joint rotation is the shortest arc from +Y onto the direction wanted.
   */
  function solveArm(armBone, foreBone, handBone, target, pole, poses) {
    const base = Object.assign({}, poses)
    const S = originOf(armBone, base)
    const L1 = Math.hypot(...sub(originOf(foreBone, base), S))
    const L2 = Math.hypot(...sub(originOf(handBone, base), originOf(foreBone, base)))

    let toT = sub(target, S)
    let d = Math.hypot(...toT)
    const dMin = Math.abs(L1 - L2) + 1e-4
    const dMax = L1 + L2 - 1e-3
    const reached = d <= dMax
    if (d < dMin || d > dMax) { d = Math.min(dMax, Math.max(dMin, d)); toT = scale(norm(toT), d) }
    const axis = norm(toT)

    // Elbow: on the circle where both bone lengths agree, at the angle the pole asks for.
    const a = (d * d + L1 * L1 - L2 * L2) / (2 * d)
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a))
    let side = sub(pole, scale(axis, dot(pole, axis)))
    if (Math.hypot(...side) < 1e-6) side = cross(axis, [1, 0, 0])
    side = norm(side)
    const elbow = add(add(S, scale(axis, a)), scale(side, h))

    const upperBasis = basisOf(rig.nodes[parent[byName[armBone]]].name, base)
    const rArm = arc([0, 1, 0], norm(intoBasis(upperBasis, norm(sub(elbow, S)))))
    const withArm = Object.assign({}, base, { [armBone]: rArm })
    const foreBasis = basisOf(armBone, withArm)
    const rFore = arc([0, 1, 0], norm(intoBasis(foreBasis, norm(sub(add(S, toT), elbow)))))

    const rot = { [armBone]: rArm, [foreBone]: rFore }
    const hand = originOf(handBone, Object.assign({}, base, rot))
    return { rot, elbow, hand, reached, error: Math.hypot(...sub(hand, target)) }
  }

  function pose(rt, lt) {
    const R = solveArm('Avatar_RightArm', 'Avatar_RightForeArm', 'Avatar_RightHand', rt, POLE_R)
    const L = solveArm('Avatar_LeftArm', 'Avatar_LeftForeArm', 'Avatar_LeftHand', lt, POLE_L)
    return { rot: Object.assign({}, R.rot, L.rot), R, L }
  }


  function write(outPath, keyframes) {
    const bones = [...new Set(keyframes.flatMap((k) => Object.keys(k.rot)))]
    const keep = [byName['Armature'], ...rig.skins[0].joints]
    const index = {}; keep.forEach((old, i) => { index[old] = i })
    const nodes = keep.map((old) => {
      const n = rig.nodes[old], copy = { name: n.name }
      if (n.translation) copy.translation = n.translation
      if (n.rotation) copy.rotation = n.rotation
      if (n.scale) copy.scale = n.scale
      const kids = (n.children || []).filter((c) => index[c] !== undefined).map((c) => index[c])
      if (kids.length) copy.children = kids
      return copy
    })

    const floats = [], views = [], accessors = []
    const push = (arr, type, count, extra) => {
      views.push({ buffer: 0, byteOffset: floats.length * 4, byteLength: arr.length * 4 })
      floats.push(...arr)
      accessors.push(Object.assign({ bufferView: views.length - 1, componentType: 5126, count, type }, extra || {}))
      return accessors.length - 1
    }
    const times = keyframes.map((k) => k.t)
    const tAcc = push(times, 'SCALAR', times.length, { min: [Math.min(...times)], max: [Math.max(...times)] })

    const channels = [], samplers = []
    for (const b of bones) {
      const data = []
      for (const k of keyframes) data.push(...(k.rot[b] || rig.nodes[byName[b]].rotation || [0, 0, 0, 1]))
      samplers.push({ input: tAcc, output: push(data, 'VEC4', keyframes.length), interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: index[byName[b]], path: 'rotation' } })
    }

    const bin = Buffer.alloc(floats.length * 4)
    floats.forEach((v, i) => bin.writeFloatLE(v, i * 4))
    const json = Buffer.from(JSON.stringify({
      asset: { version: '2.0', generator: 'base-tycoon emote builder' },
      scene: 0, scenes: [{ nodes: [0] }], nodes,
      animations: [{ name: 'emote', channels, samplers }],
      accessors, bufferViews: views, buffers: [{ byteLength: bin.length }]
    }), 'utf8')
    const jsonPad = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
    const binPad = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4, 0)])
    const total = 28 + jsonPad.length + binPad.length
    const out = Buffer.alloc(total)
    out.write('glTF', 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8)
    out.writeUInt32LE(jsonPad.length, 12); out.writeUInt32LE(0x4E4F534A, 16); jsonPad.copy(out, 20)
    out.writeUInt32LE(binPad.length, 20 + jsonPad.length)
    out.writeUInt32LE(0x004E4942, 24 + jsonPad.length); binPad.copy(out, 28 + jsonPad.length)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, out)
    return out.length
  }

  const aim = pose(AIM_R, AIM_L)
  const kick = pose(KICK_R, KICK_L)
  const report = (label, s) => console.log(
    `${label.padEnd(11)} wrist ${s.hand.map((v) => v.toFixed(3)).join(', ')}` +
    `   elbow ${s.elbow.map((v) => v.toFixed(3)).join(', ')}` +
    `   residual ${(s.error * 1000).toFixed(1)} mm${s.reached ? '' : '  [OUT OF REACH, clamped]'}`)
  report('aim right', aim.R); report('aim left', aim.L)
  report('kick right', kick.R); report('kick left', kick.L)

  // AIM is one held pose, looped by the scene for as long as the control is down.
  const a = write(path.join(OUT, 'aim_emote.glb'), [{ t: 0, rot: aim.rot }, { t: 1, rot: aim.rot }])
  // FIRE rises off that same pose and drops back, so the two read as one motion.
  const f = write(path.join(OUT, 'fire_emote.glb'), [
    { t: 0, rot: aim.rot }, { t: 0.05, rot: kick.rot }, { t: 0.30, rot: aim.rot }
  ])
  console.log(`wrote aim_emote.glb (${a} B) and fire_emote.glb (${f} B)`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
