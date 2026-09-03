import { engine, Transform, MeshRenderer, Material, Entity } from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4 } from '@dcl/sdk/math'
import { ATLAS, ADVANCE, FONT_FILES } from './font-metrics'

/*
  The HUD's typeface, standing in the world.

  The platform's TextShape speaks three fonts and none of them is ours, so a facade sign in
  it reads like a default (owner, 1 Sep: "un texte en Arial sans reflexion UI gaming"). The
  HUD already solved this for the money counters: one small quad per letter, each showing
  its own cell of a baked Baloo atlas. This is that same trick with MeshRenderer planes
  instead of UiEntities, so a base's nameplate and the score in a player's hand are set in
  the one typeface the game owns.

  One entity per letter is the cost, which is why this dresses the dozen characters of a
  nameplate and not prose. The plane primitive wants sixteen uv values, four vertices for
  each of its two sides; the same eight serve both, so the back shows a mirrored letter
  that the sign's own backing plate hides.
*/

const CELL = 1 / ATLAS.cols
const ROW = 1 / ATLAS.rows
const TRACKING = 0.02
const BLEED = 1.5 / 1024

function uvsFace(index: number): number[] {
  const col = index % ATLAS.cols
  const row = Math.floor(index / ATLAS.cols)
  const u0 = col * CELL + BLEED
  const u1 = col * CELL + CELL - BLEED
  const v1 = 1 - row * ROW - BLEED
  const v0 = 1 - (row + 1) * ROW + BLEED
  return [u0, v0, u0, v1, u1, v1, u1, v0]
}

export type Segment3D = { texte: string; role: keyof typeof FONT_FILES; taille: number }

function largeurDe(texte: string, taille: number): number {
  let w = 0
  for (const ch of texte) {
    const idx = ATLAS.glyphs.indexOf(ch)
    if (idx < 0 && ch !== ' ') continue
    w += ((ADVANCE[ch] ?? 0.5) + TRACKING) * taille
  }
  return w
}

/**
 * Lays the segments as one centred line of glyph quads under a fresh root entity, and
 * returns that root so the caller can retire the whole line with one call. `estompe`
 * greys the letters the way the plate greys an absent owner.
 */
export function place3DText(parent: Entity, segments: Segment3D[], estompe: boolean): Entity {
  const racine = engine.addEntity()
  Transform.create(racine, { parent })

  const propres = segments.map((s) => ({ ...s, texte: s.texte.toUpperCase() }))
  const total = propres.reduce((w, s) => w + largeurDe(s.texte, s.taille), 0)
  let curseur = -total / 2

  for (const seg of propres) {
    for (const ch of seg.texte) {
      const idx = ATLAS.glyphs.indexOf(ch)
      if (idx < 0 && ch !== ' ') continue
      const adv = (ADVANCE[ch] ?? 0.5) + TRACKING
      if (idx >= 0 && ch !== ' ') {
        const quad = engine.addEntity()
        Transform.create(quad, {
          parent: racine,
          position: Vector3.create(curseur + (ADVANCE[ch] * seg.taille) / 2, 0, 0),
          scale: Vector3.create(seg.taille, seg.taille, 1)
        })
        const face = uvsFace(idx)
        MeshRenderer.setPlane(quad, [...face, ...face])
        Material.setPbrMaterial(quad, {
          texture: Material.Texture.Common({ src: `assets/ui/${FONT_FILES[seg.role]}` }),
          emissiveTexture: Material.Texture.Common({ src: `assets/ui/${FONT_FILES[seg.role]}` }),
          albedoColor: estompe ? Color4.create(0.62, 0.66, 0.74, 1) : Color4.White(),
          emissiveColor: estompe ? Color3.create(0.62, 0.66, 0.74) : Color3.White(),
          emissiveIntensity: estompe ? 0.12 : 0.35,
          metallic: 0, roughness: 1, specularIntensity: 0,
          transparencyMode: 1, alphaTest: 0.5
        })
      }
      curseur += adv * seg.taille
    }
  }
  return racine
}
