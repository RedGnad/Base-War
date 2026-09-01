import { Color4 } from '@dcl/sdk/math'

/**
 * The interface tokens, and the arithmetic behind them.
 *
 * Sizes are in virtual pixels. The renderer declares 1920x1080, but Decentraland overrides
 * a 16:9 request to 1600x720 on a phone, and the scale factor is min(canvasW / virtualW,
 * canvasH / virtualH). On a handset in landscape, near 844x390 logical, that is
 * min(844/1600, 390/720) = 0.5275. So a virtual size renders at roughly half its number in
 * points, and the scale below is derived from the point size wanted at the far end:
 *
 *   BODY 32  ->  17 pt, the size Apple treats as body text
 *   CAPTION 21 -> 11 pt, the floor under which text stops being readable
 *
 * Nothing in the interface is allowed below CAPTION. Measured before this file existed,
 * 43 of the 47 labels in the game sat under that floor and the median landed at 7 pt.
 */
/**
 * Two families, and which one a string belongs to.
 *
 * DISPLAY is the atlas in src/client/glyphs.tsx, a rounded heavy face the platform does
 * not carry. It takes anything short that is recognised rather than read: the money, panel
 * titles, control labels, a headline figure in a decision panel.
 *
 * BODY is the platform's own 'sans-serif'. It takes every sentence: hints, help, item
 * descriptions, tutorial lines.
 *
 * The split is the standard one, a characterful display face for branding against a clean
 * neutral sans for copy so the two do not compete, and two families is the ceiling: a
 * third only earns its place if it is functional. It is also where the costs agree, since
 * the atlas spends one element per character, which is nothing over a dozen short labels
 * and unreasonable over a paragraph.
 *
 * The sizes below serve both.
 */
export const TYPE = {
  /*
    The coin counter, and nothing else.

    Sized against the rule of thumb the HUD guides give for readouts, body text at about
    twenty-eight pixels for a 1080p screen; ours is thirty-two, and a primary readout sits at
    two to two and a half times that. Seventy-two is 2.25x. It was fifty-two because it had to
    share a plate with a second line; with the plate gone the number is free to be the size it
    should have been. On a phone the virtual screen is 720 tall rather than 1080, so the same
    figure reads half again as large there, which is the right way round for the one number
    the whole game is about.
  */
  hero: 72,
  title: 42,    // 22 pt: modal titles, the reveal
  body: 32,     // 17 pt: buttons and anything the player must read while moving
  label: 26,    // 14 pt: secondary lines inside a panel
  caption: 21   // 11 pt: hints, the floor
} as const

/**
 * Colour carries meaning, and the same meaning everywhere.
 *
 * Five roles, no decorative exceptions: money is gold, the thing to press is green, a
 * warning is orange, a name is white, and anything destructive or refused is red. A player
 * who learns the code once reads any new panel without being taught it.
 *
 * Money is gold, at last. It was green for one measured reason: bare gold over a bright sky
 * at speed is glare. That objection died the day the atlas baked a dark navy contour around
 * every glyph (28 Aug), which is the exact device the reference GUI sheets use to put white
 * on gold and gold on sky; the counter now matches the coin lying on the ground. The warning
 * hue stays on the orange, which still differs from both.
 */
export const HUE = {
  money: '#ffd24a',
  bonus: '#ff8a3d',
  name: '#ffffff',
  danger: '#ffa3a3',
  dim: '#b4bcc6'
} as const

/**
 * Lift a colour until it can be read as text on our dark panels.
 *
 * Rarity and mutation colours are chosen to say what a thing IS: Cursed is a deep violet,
 * Blood is a dark red, Galaxy is a dark purple. Printed as words on a panel that is nearly
 * black they measure 1.21, 1.94 and 2.02 to one against it, which is to say a player looking
 * for the seventh day of their login streak finds an empty space. The other colours pass
 * comfortably, so the fault is not the palette, it is using an identity colour as a legibility
 * colour without checking.
 *
 * Three to one is the floor WCAG sets for large text and for graphics; below it the colour is
 * blended towards white until it reaches it, which keeps the hue recognisable rather than
 * replacing it with a safe one. A colour that already passes is returned untouched.
 */
const PANNEAU_L = 0.0041
const CONTRASTE_MIN = 3

function lineaire(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * lineaire(r) + 0.7152 * lineaire(g) + 0.0722 * lineaire(b)
}

/*
  Memoised, because this is a pure function called per cell per frame.

  The collection grid asks it for every one of its ninety-eight squares, and the answer walks
  up to twenty blend steps computing a relative luminance at each one, so an open index was
  paying a couple of thousand of them sixty times a second for a set of colours that is fixed
  at compile time. Same input, same answer, for ever.
*/
const lisibleCache = new Map<string, string>()

export function lisible(hex: string): string {
  const cache = lisibleCache.get(hex)
  if (cache !== undefined) return cache
  const valeur = calculerLisible(hex)
  lisibleCache.set(hex, valeur)
  return valeur
}

function calculerLisible(hex: string): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  let r = parseInt(h.slice(0, 2), 16)
  let g = parseInt(h.slice(2, 4), 16)
  let b = parseInt(h.slice(4, 6), 16)
  const assez = (rr: number, gg: number, bb: number): boolean =>
    (luminance(rr, gg, bb) + 0.05) / (PANNEAU_L + 0.05) >= CONTRASTE_MIN
  if (assez(r, g, b)) return `#${h.slice(0, 6)}`
  // Blend towards white in small steps: the hue survives, the reading becomes possible.
  for (let k = 1; k <= 20; k++) {
    const t = k / 20
    const rr = Math.round(r + (255 - r) * t)
    const gg = Math.round(g + (255 - g) * t)
    const bb = Math.round(b + (255 - b) * t)
    if (assez(rr, gg, bb)) { r = rr; g = gg; b = bb; break }
  }
  const deux = (v: number): string => v.toString(16).padStart(2, '0')
  return `#${deux(r)}${deux(g)}${deux(b)}`
}

/*
  Two of the five were failing the contrast floor at the sizes they are used at, measured.

  Google's Playables certification is blunt: text under 18 pt needs 4.5:1, everything else 3:1.
  Our `label` (14 pt) and `caption` (11 pt) are under 18. Against the inset plate on a mid-grey
  sky, `danger` at #ff5c5c measured 2.87:1 and `dim` at #9aa3ad measured 3.40:1, and `dim` is
  the colour of every secondary line in every panel. Lifted to the first value of each hue that
  clears 4.5 on both the plate and the inset: danger #ffa3a3 (4.57), dim #b4bcc6 (4.54). The
  hue survives; the reading becomes possible for the sizes the rule is about.
*/
export const C = {
  money: Color4.fromHexString(HUE.money + 'ff'),
  bonus: Color4.fromHexString(HUE.bonus + 'ff'),
  name: Color4.fromHexString(HUE.name + 'ff'),
  danger: Color4.fromHexString(HUE.danger + 'ff'),
  dim: Color4.fromHexString(HUE.dim + 'ff'),
  /** Label colour for a control on a light plate: the default pink vanishes on green. */
  ink: Color4.fromHexString('#12305cff'),
  plate: Color4.create(0, 0, 0, 0.62),
  inset: Color4.create(0, 0, 0, 0.45)
}

/**
 * Touch geometry. 44 pt is the floor Apple, Material and WCAG 2.5.5 all land on, and 8 pt
 * is the smallest gap that stops one thumb hitting two things. Divided by the 0.5275 above,
 * that is 84 and 16 virtual pixels; both are rounded up.
 */
/**
 * The corner radii, all of them.
 *
 * Cards were 14, chips 12, bars and bands square, and a photograph of the menu showed the
 * mismatch plainly (owner, 1 Sep). Consistency is the cheapest of the five UI principles
 * and the most visible when it is missing: one radius for surfaces, one for the bars
 * inside them.
 */
export const RAD = { card: 14, bar: 10 } as const

export const TAP = { height: 96, gap: 20, phone: 120 } as const   // phone: 63 pt, what the tester's thumb asked for (28 Aug)

/**
 * Draw the interface as a phone would, while sitting at a desk.
 *
 * Decentraland overrides a 16:9 virtual screen to 1600x720 on a handset and insets the
 * interface out of the client's own furniture, and those two facts are what set every
 * size in this file. Flipping this to true applies both on the desktop preview, so the
 * layout a phone gets can be looked at without one.
 *
 * It tests the layout and nothing else: not touch, not framerate, not the native mobile
 * HUD, not the mobile client at all. Those still need a device or an emulator. Ship it
 * false.
 */
export const FORCE_MOBILE_LAYOUT = false

/**
 * The skins, and why they exist at all.
 *
 * Decentraland offers three fonts and no more: 'sans-serif', 'serif' and 'monospace' in
 * the interface, the same three in the world. Both are closed enums, so the rounded
 * display face those reference games lean on is simply not available here. What the
 * platform does give is a nine-sliced background image, and that is where the rounded
 * corners, the border, the gradient and the grain come from instead. The images are drawn
 * by tools/ui/build-ui-textures.js, so every colour in them is a number in a file.
 *
 * The slice fraction is the corner radius over the texture size, 40 over 128. Change one
 * in the generator and this has to follow, which is why the generator prints it.
 */
const SLICE = { top: 0.3125, right: 0.3125, bottom: 0.3125, left: 0.3125 }
const skin = (name: string) => ({
  // White, explicitly: the Button component supplies a variant colour of its own, and a
  // texture drawn under it comes out multiplied into whatever that colour is. Naming the
  // tint white lets the image show the colours it was drawn with.
  color: Color4.White(),
  texture: { src: `assets/ui/${name}.png` },
  textureMode: 'nine-slices' as const,
  textureSlices: SLICE
})

export const SKIN = {
  panel: skin('panel'),
  card: skin('card'),
  inset: skin('inset'),
  primary: skin('primary'),
  secondary: skin('secondary'),
  danger: skin('danger'),
  success: skin('success'),
  disabled: skin('disabled')
}

/** The skin a control wears, picked from the same condition that picks its variant. */
export const btn = (primary: boolean) => (primary ? SKIN.primary : SKIN.secondary)
