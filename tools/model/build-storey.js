/*
  Generates the merged storey models.

  Why this exists. The mobile client counts one MATERIAL per rendered object, and its budget is
  400 soft / 500 hard (`docs.decentraland.org/creator/build-for-mobile/develop/optimize-performance`).
  A storey built from SDK primitives is seventeen rendered objects of shell plus six pedestals,
  and sixteen bases put us at 1 542 measured, three times the hard limit. Boxes that share a
  colour and never move relative to each other do not need to be separate objects: merged into
  one mesh they are ONE rendered object, one material, one draw call.

  There is a second prize, read in the mobile client's own source
  (`godot-explorer`, `lib/src/content/gltf/common.rs` L358-363): every imported GLTF gets an
  automatic LOD chain built at import, 50% then 25% then 10% of its indices, switched by a
  screen-error threshold of 8 to 2 pixels depending on the graphics profile. SDK primitives get
  none of that. So merging does not only divide the draw calls, it hands the distant copies a
  triangle reduction we could not write ourselves.

  Colour is BAKED, one file per colour, rather than tinted at runtime. Runtime tinting of a
  loaded model goes through `GltfNodeModifiers`, which we have never confirmed works on the
  Godot mobile client, and a base's accent is its identity on the street: it cannot be the thing
  that silently fails on half the devices. The palette is bounded (eight owner accents plus one
  per skin), the geometry is a handful of boxes, so a file per colour costs a few kilobytes.

  Geometry is READ FROM THE SOURCE, never retyped: every dimension below comes out of
  `src/shared/schemas.ts` and every colour out of `src/client/toy.ts` and `src/shared/loot-table.ts`.
  A storey drawn from two descriptions is a storey that will disagree with itself.
*/
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.join(__dirname, '..', '..')
const OUT = path.join(ROOT, 'assets', 'Models')

function lire(fichier) { return fs.readFileSync(path.join(ROOT, fichier), 'utf8') }

/** A `export const NAME = <expression>` read straight out of the TypeScript, then evaluated. */
function constante(src, nom, portee) {
  const m = new RegExp(`(?:export )?const ${nom}\\s*=\\s*([^\\n]+?)\\s*(?://.*)?$`, 'm').exec(src)
  if (m === null) throw new Error(`constante introuvable: ${nom}`)
  const expr = m[1].replace(/\s*$/, '')
  return Function(...Object.keys(portee), `"use strict"; return (${expr})`)(...Object.values(portee))
}

const schemas = lire('src/shared/schemas.ts')
const toy = lire('src/client/toy.ts')
const loot = lire('src/shared/loot-table.ts')

const G = {}
G.BASE_SIDE = constante(schemas, 'BASE_SIDE', {})
G.FLOOR_HEIGHT = constante(schemas, 'FLOOR_HEIGHT', {})
G.RAMP_ANGLE = constante(schemas, 'RAMP_ANGLE', {})
G.RAMP_LENGTH = constante(schemas, 'RAMP_LENGTH', { FLOOR_HEIGHT: G.FLOOR_HEIGHT, RAMP_ANGLE: G.RAMP_ANGLE, Math })
G.WALL_THICKNESS = constante(schemas, 'WALL_THICKNESS', {})
G.WALL_HEIGHT = constante(schemas, 'WALL_HEIGHT', { FLOOR_HEIGHT: G.FLOOR_HEIGHT })
G.DOOR_WIDTH = constante(schemas, 'DOOR_WIDTH', {})
G.STAIRWELL_WIDTH = constante(schemas, 'STAIRWELL_WIDTH', {})
G.SLAB_THICKNESS = constante(schemas, 'SLAB_THICKNESS', {})
G.SLOTS_PER_FLOOR = constante(schemas, 'SLOTS_PER_FLOOR', {})

/** The pedestal grid, transcribed from `slotPosition` in schemas.ts. */
function slotPosition(slot) {
  const k = slot % G.SLOTS_PER_FLOOR
  const col = k % 3
  const rang = Math.floor(k / 3)
  const centreX = -G.STAIRWELL_WIDTH / 2
  const pasX = (G.BASE_SIDE - G.STAIRWELL_WIDTH) / 3.4
  const pasZ = G.BASE_SIDE / 4.4
  return { dx: centreX + (col - 1) * pasX, dz: -G.BASE_SIDE / 5 + rang * pasZ }
}

const COULEURS = {}
for (const nom of ['slab', 'socle', 'rail', 'ramp']) {
  const m = new RegExp(`\\b${nom}:\\s*'(#[0-9a-fA-F]{6})'`).exec(toy)
  if (m === null) throw new Error(`couleur introuvable: ${nom}`)
  COULEURS[nom] = m[1]
}
const ACCENTS = JSON.parse('[' + /const ACCENTS = \[([^\]]+)\]/.exec(toy)[1].replace(/'/g, '"') + ']')
const MUTATIONS = [...loot.matchAll(/\{ id:\s*(\d+),\s*name:\s*'([^']*)',\s*mult:[^,]+,\s*color:\s*'([^']*)'/g)]
  .filter((m) => m[3] !== '').map((m) => ({ id: Number(m[1]), color: m[3] }))

const GLASS = { r: 0.75, g: 0.9, b: 1.0, a: 0.22 }
/*
  Eclaire, sans emissif ni unlit, et c'est un choix mesure (2 Sep).

  Sur le profil graphique BAS, une dalle GLTF de la couleur exacte de la primitive qu'elle
  remplace sort a 55-65 % de sa luminosite; les montants verticaux, eux, concordent. Sur le
  profil MOYEN les couleurs concordent partout (proprietaire, a l'oeil). J'ai essaye
  `KHR_materials_unlit`, declare et reconnu: sans effet sur ce client. Et un `emissiveFactor`
  a 0,35 depasse la cible (135-160 %). Le profil bas assombrit TOUT GLTF, arbres compris, et
  les scenes de reference vivent avec: on ne compense pas ici, on garde la recette simple.
*/

// --- glTF plumbing -------------------------------------------------------------------------

function hex(h) {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
}

/** A box, optionally rotated about X, emitted as 24 vertices and 36 indices. */
/*
  MIROIR SUR X, applique a l'ecriture et a rien d'autre.

  glTF est droitier, le moteur est gaucher: l'importateur retourne X en convertissant. Nos
  ecrivains, eux, ecrivaient dans le repere du MOTEUR, donc tout ce qu'ils produisaient
  arrivait inverse. Invisible sur ce qui est symetrique (caisses, anneau, poteaux, vitres),
  flagrant sur ce qui ne l'est pas: la tremie de la dalle apparaissait a gauche quand la rampe
  posee par le CODE etait a droite, dans la meme piece (capture du proprietaire, 3 Sep, la
  seule experience qui tranchait). Les modeles tiers passent, eux, parce qu'ils sont ecrits
  pour glTF et non pour le moteur.

  On garde donc les coordonnees du MONDE dans tout l'outil, lisibles et comparables au code,
  et on ne retourne qu'au moment d'ecrire les octets. Une symetrie inverse aussi le sens des
  triangles, d'ou l'echange d'indices plus bas: sans lui toutes les faces seraient a l'envers.
*/
function boite(cx, cy, cz, sx, sy, sz, angleX) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2
  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] }
  ]
  const c = Math.cos(((angleX ?? 0) * Math.PI) / 180)
  const s = Math.sin(((angleX ?? 0) * Math.PI) / 180)
  const tourne = (p) => (angleX ? [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c] : p)
  const pos = [], nor = [], uv = [], idx = []
  for (const f of faces) {
    const base = pos.length / 3
    const n = tourne(f.n)
    for (const v of f.v) {
      const p = tourne(v)
      // X NEGATIF: voir `MIROIR` en tete de fichier.
      pos.push(-(p[0] + cx), p[1] + cy, p[2] + cz)
      nor.push(-n[0], n[1], n[2])
    }
    // Flat unit UVs per face. The materials carry no texture, but the importer expects the
    // attribute to exist: without TEXCOORD_0 the client accepted the file and drew nothing.
    uv.push(0, 1, 1, 1, 1, 0, 0, 0)
    // Enroulement inverse avec X: une symetrie retourne les faces, il faut les remettre.
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }
  return { pos, nor, uv, idx }
}

/** Writes one .glb: one primitive per group, each group being every box that shares a colour. */
/*
  Un pixel blanc, embarque dans chaque fichier.

  Les modeles du depot qui s affichent (arbres, ballons) portent tous une `baseColorTexture`.
  Les miens n en avaient aucune, juste un `baseColorFactor`, et le client les acceptait sans
  jamais les dessiner ni les faire apparaitre dans sa repartition de contenu. Un pixel blanc
  suffit: en glTF la couleur finale est le facteur MULTIPLIE par la texture, donc un pixel
  blanc laisse la couleur exactement telle qu elle est ecrite, pour soixante-huit octets.
*/
/*
  Et ce pixel est CALCULE, plus jamais un litteral colle.

  Il etait ecrit en base64 dans le fichier, et son bloc IDAT portait un CRC faux: `5c9fcfd8`
  la ou le calcul donne `712f12ca`. Un decodeur strict refuse une image dont le CRC ne tombe
  pas juste, le materiau perd sa couleur de base, et le client dessine du NOIR. Tous les
  modeles d'etage sont sortis de cet outil, donc dalles, accents, escaliers et vitres etaient
  noirs depuis leur regeneration (proprietaire, 3 Sep, "l'escalier est tout noir"). Un octet
  de travers dans un blob opaque ne se voit pas a la relecture; une fonction qui construit le
  fichier et calcule ses sommes de controle, si.
*/
function crc32(donnees) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  let crc = 0xFFFFFFFF
  for (const o of donnees) crc = table[(crc ^ o) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function blocPng(type, donnees) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(donnees.length, 0)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, donnees])), 0)
  return Buffer.concat([len, t, donnees, crc])
}

function pixelBlanc() {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)   // largeur
  ihdr.writeUInt32BE(1, 4)   // hauteur
  ihdr[8] = 8                // huit bits par canal
  ihdr[9] = 2                // couleur vraie, RGB
  const brut = Buffer.from([0, 255, 255, 255])   // octet de filtre, puis un pixel blanc
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    blocPng('IHDR', ihdr),
    blocPng('IDAT', zlib.deflateSync(brut)),
    blocPng('IEND', Buffer.alloc(0))
  ])
}

const PIXEL = pixelBlanc()

function ecrire(nomFichier, groupes) {
  const bin = []          // float and short payload, assembled at the end
  const bufferViews = [], accessors = [], materials = [], primitives = []
  let octets = 0
  const aligner = () => { while (octets % 4 !== 0) { bin.push({ pad: 1 }); octets += 1 } }

  for (const g of groupes) {
    const pos = [], nor = [], uv = [], idx = []
    for (const b of g.boites) {
      const d = boite(...b)
      const base = pos.length / 3
      pos.push(...d.pos); nor.push(...d.nor); uv.push(...d.uv)
      for (const i of d.idx) idx.push(i + base)
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (pos[i + k] < min[k]) min[k] = pos[i + k]
        if (pos[i + k] > max[k]) max[k] = pos[i + k]
      }
    }
    aligner()
    bufferViews.push({ buffer: 0, byteOffset: octets, byteLength: pos.length * 4, target: 34962 })
    bin.push({ f32: pos }); octets += pos.length * 4
    const aPos = accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max }) - 1
    aligner()
    bufferViews.push({ buffer: 0, byteOffset: octets, byteLength: nor.length * 4, target: 34962 })
    bin.push({ f32: nor }); octets += nor.length * 4
    const aNor = accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' }) - 1
    aligner()
    bufferViews.push({ buffer: 0, byteOffset: octets, byteLength: uv.length * 4, target: 34962 })
    bin.push({ f32: uv }); octets += uv.length * 4
    const aUv = accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: uv.length / 2, type: 'VEC2' }) - 1
    aligner()
    bufferViews.push({ buffer: 0, byteOffset: octets, byteLength: idx.length * 2, target: 34963 })
    bin.push({ u16: idx }); octets += idx.length * 2
    const aIdx = accessors.push({ bufferView: bufferViews.length - 1, componentType: 5123, count: idx.length, type: 'SCALAR' }) - 1

    const c = g.couleur
    const mat = {
      name: g.nom,
      pbrMetallicRoughness: {
        baseColorFactor: [c[0], c[1], c[2], c[3] ?? 1],
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: g.rugosite ?? 0.55
      }
    }
    if ((c[3] ?? 1) < 1) { mat.alphaMode = 'BLEND'; mat.doubleSided = true }
    materials.push(mat)
    primitives.push({ attributes: { POSITION: aPos, NORMAL: aNor, TEXCOORD_0: aUv }, indices: aIdx, material: materials.length - 1 })
  }

  // Le pixel, en queue de tampon, partage par tous les materiaux du fichier.
  aligner()
  const vuePixel = bufferViews.length
  bufferViews.push({ buffer: 0, byteOffset: octets, byteLength: PIXEL.length })
  bin.push({ brut: PIXEL })
  octets += PIXEL.length

  const total = octets
  const buf = Buffer.alloc(total)
  let o = 0
  for (const part of bin) {
    if (part.pad) { o += 1; continue }
    if (part.f32) { for (const v of part.f32) { buf.writeFloatLE(v, o); o += 4 } }
    if (part.u16) { for (const v of part.u16) { buf.writeUInt16LE(v, o); o += 2 } }
    if (part.brut) { part.brut.copy(buf, o); o += part.brut.length }
  }
  const json = Buffer.from(JSON.stringify({
    asset: { version: '2.0', generator: 'base-war storey builder' },
    scene: 0, scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [{ mesh: 0, name: path.basename(nomFichier, '.glb') }],
    meshes: [{ primitives }],
    images: [{ bufferView: vuePixel, mimeType: 'image/png' }],
    samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 10497, wrapT: 10497 }],
    textures: [{ sampler: 0, source: 0 }],
    materials, accessors, bufferViews, buffers: [{ byteLength: total }]
  }), 'utf8')
  const jsonPad = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
  const binPad = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, 0)])
  const taille = 12 + 8 + jsonPad.length + 8 + binPad.length
  const out = Buffer.alloc(taille)
  out.write('glTF', 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(taille, 8)
  out.writeUInt32LE(jsonPad.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonPad.copy(out, 20)
  out.writeUInt32LE(binPad.length, 20 + jsonPad.length)
  out.writeUInt32LE(0x004e4942, 24 + jsonPad.length); binPad.copy(out, 28 + jsonPad.length)
  fs.mkdirSync(path.dirname(nomFichier), { recursive: true })
  fs.writeFileSync(nomFichier, out)
  return out.length
}

// --- the storey ----------------------------------------------------------------------------

const c = G.BASE_SIDE, h = G.WALL_HEIGHT, ep = G.WALL_THICKNESS
const rdx = G.BASE_SIDE / 2 - G.STAIRWELL_WIDTH / 2
const course = G.RAMP_LENGTH * Math.cos((G.RAMP_ANGLE * Math.PI) / 180)
const bande = c / 2 - G.STAIRWELL_WIDTH / 2
const finPalier = course / 2 + 2.4
const finArriere = -1.2
const rampeX = G.STAIRWELL_WIDTH - 0.3

/*
  The shell: slab, stairwell strip, pedestals. The landing belongs to the storey it lands ON.

  A ramp is hidden on the top storey, because it would climb to nothing, and so is its landing.
  Two pieces that hide at different moments cannot share a mesh, so the ramp lives in its own
  model. The landing is subtler: it sits at the level of the storey ABOVE, and is shown exactly
  when that storey exists, which is the same thing as saying it belongs to that storey's own
  shell. Moving it there costs nothing and removes a piece that would otherwise have to hide.
*/
function coque(etageZero) {
  const b = [
    [-G.STAIRWELL_WIDTH / 2, G.SLAB_THICKNESS / 2, 0, c - G.STAIRWELL_WIDTH, G.SLAB_THICKNESS, c]
  ]
  if (etageZero) {
    b.push([bande, G.SLAB_THICKNESS / 2, 0, G.STAIRWELL_WIDTH, G.SLAB_THICKNESS, c])
  } else {
    b.push([bande, G.SLAB_THICKNESS / 2, (-c / 2 + finArriere) / 2, G.STAIRWELL_WIDTH, G.SLAB_THICKNESS, finArriere + c / 2])
    b.push([bande, G.SLAB_THICKNESS / 2, (finPalier + c / 2) / 2, G.STAIRWELL_WIDTH, G.SLAB_THICKNESS, c / 2 - finPalier])
    // The landing left behind by the ramp climbing from the storey below.
    b.push([rdx, G.SLAB_THICKNESS / 2, course / 2 + 1.2, G.STAIRWELL_WIDTH, G.SLAB_THICKNESS, 2.4])
  }
  return b
}

/*
  La montee: la rampe et ses deux rambardes, AUTOUR DE L'ORIGINE et sans pente bakee.

  Elle etait ecrite a sa place finale, decalage `rdx` et rotation comprises, pendant que le
  collisionneur qu'on gravit etait place separement par `plots.ts` avec son propre calcul.
  Deux objets, deux chemins, donc deux endroits possibles: le proprietaire a vu la rampe
  dessinee d'un cote de la piece et la rampe marchable de l'autre, devant l'ascenseur
  (3 Sep). Le modele est desormais centre sur rien: c'est l'entite qui porte la position et
  la pente, et le collisionneur est son ENFANT. Une seule transformation pour les deux, donc
  ils ne peuvent plus diverger, quelle qu'en soit la raison.
*/
function montee() {
  const RAIL_H = 1.1
  const dy = (RAIL_H + 0.18) / 2
  const out = [[0, 0, 0, rampeX, 0.18, G.RAMP_LENGTH, 0]]
  for (const cote of [-1, 1]) {
    out.push([cote * (rampeX / 2 - 0.03), dy, 0, 0.06, RAIL_H, G.RAMP_LENGTH, 0])
  }
  return out
}

function socles() {
  return Array.from({ length: G.SLOTS_PER_FLOOR }, (_, k) => {
    const d = slotPosition(k)
    return [d.dx, G.SLAB_THICKNESS + 0.225, d.dz, 0.45, 0.45, 0.45]
  })
}

function vitres() {
  return [
    [0, h / 2, -c / 2, c, h, ep],
    [-c / 2, h / 2, 0, ep, h, c],
    [c / 2, h / 2, 0, ep, h, c],
    [-(c + G.DOOR_WIDTH) / 4, h / 2, c / 2, (c - G.DOOR_WIDTH) / 2, h, ep],
    [(c + G.DOOR_WIDTH) / 4, h / 2, c / 2, (c - G.DOOR_WIDTH) / 2, h, ep]
  ]
}

/** Lintel and four corner posts: the base's colour on the parts that never hide. */
function accent() {
  return [
    [0, h - 0.15, c / 2, G.DOOR_WIDTH, 0.3, ep],
    [-c / 2, h / 2, -c / 2, 0.28, h, 0.28],
    [c / 2, h / 2, -c / 2, 0.28, h, 0.28],
    [-c / 2, h / 2, c / 2, 0.28, h, 0.28],
    [c / 2, h / 2, c / 2, 0.28, h, 0.28]
  ]
}

let n = 0, octetsTotal = 0
const teintes = [...ACCENTS.map((hexa, i) => ({ suffixe: String(i), hexa })), ...MUTATIONS.map((m) => ({ suffixe: `skin-${m.id}`, hexa: m.color }))]

for (const [nom, zero] of [['storey-ground', true], ['storey-upper', false]]) {
  // No pedestals here: what the scene calls a `socle` is the TOY's own entity, which carries
  // its pad as a child. Drawing six grey cubes at those spots would double every shelf.
  octetsTotal += ecrire(path.join(OUT, `${nom}.glb`), [
    { nom: 'cream', couleur: hex(COULEURS.slab), boites: coque(zero), rugosite: 0.85 }
  ])
  n += 1
}
for (const t of teintes) {
  octetsTotal += ecrire(path.join(OUT, `accent-${t.suffixe}.glb`), [{ nom: 'accent', couleur: hex(t.hexa), boites: accent() }])
  octetsTotal += ecrire(path.join(OUT, `climb-${t.suffixe}.glb`), [{ nom: 'climb', couleur: hex(t.hexa), boites: montee() }])
  n += 2
}
octetsTotal += ecrire(path.join(OUT, 'glass.glb'), [{ nom: 'glass', couleur: [GLASS.r, GLASS.g, GLASS.b, GLASS.a], boites: vitres(), rugosite: 0.15 }])
n += 1
for (const m of MUTATIONS) {
  const [r, g, b] = hex(m.color)
  octetsTotal += ecrire(path.join(OUT, `glass-skin-${m.id}.glb`), [{ nom: 'glass', couleur: [r, g, b, 0.3], boites: vitres(), rugosite: 0.15 }])
  n += 1
}
console.log(`${n} modeles ecrits, ${(octetsTotal / 1024).toFixed(1)} Ko au total`)
console.log(`  teintes: ${teintes.length} (${ACCENTS.length} accents proprietaire + ${MUTATIONS.length} skins)`)
console.log(`  rendus par etage: 1 coque + 1 vitrage + 1 accent + 1 montee = 4, 3 au dernier etage`)
