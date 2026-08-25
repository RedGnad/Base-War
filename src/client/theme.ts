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
 * Money stays green, and that is a deliberate departure from the coin lying on the ground,
 * which is gold. Gold was tried: it matches the world, and against a bright sky at speed a
 * warm yellow is harder on the eye than a green over the same long session. The reading of
 * the counter as grey was never the hue anyway, it was the tint never arriving; with the
 * colour baked into the atlas the green is finally the green that was asked for. The warning
 * hue stays on the orange it moved to, which now differs from both.
 */
export const HUE = {
  money: '#6ef07a',
  bonus: '#ff8a3d',
  name: '#ffffff',
  danger: '#ff5c5c',
  dim: '#9aa3ad'
} as const

export const C = {
  money: Color4.fromHexString(HUE.money + 'ff'),
  bonus: Color4.fromHexString(HUE.bonus + 'ff'),
  name: Color4.fromHexString(HUE.name + 'ff'),
  danger: Color4.fromHexString(HUE.danger + 'ff'),
  dim: Color4.fromHexString(HUE.dim + 'ff'),
  /** Label colour for a control on a light plate: the default pink vanishes on green. */
  ink: Color4.fromHexString('#0b1a0fff'),
  plate: Color4.create(0, 0, 0, 0.62),
  inset: Color4.create(0, 0, 0, 0.45)
}

/**
 * Touch geometry. 44 pt is the floor Apple, Material and WCAG 2.5.5 all land on, and 8 pt
 * is the smallest gap that stops one thumb hitting two things. Divided by the 0.5275 above,
 * that is 84 and 16 virtual pixels; both are rounded up.
 */
export const TAP = { height: 96, gap: 20 } as const

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
  danger: skin('danger')
}

/** The skin a control wears, picked from the same condition that picks its variant. */
export const btn = (primary: boolean) => (primary ? SKIN.primary : SKIN.secondary)
