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
export const TYPE = {
  hero: 52,     // 27 pt: the coin counter, and nothing else
  title: 42,    // 22 pt: modal titles, the reveal
  body: 32,     // 17 pt: buttons and anything the player must read while moving
  label: 26,    // 14 pt: secondary lines inside a panel
  caption: 21   // 11 pt: hints, the floor
} as const

/**
 * Colour carries meaning, and the same meaning everywhere.
 *
 * Four roles, no decorative exceptions: money is green, a bonus or a warning is amber, a
 * name is white, and anything destructive or refused is red. A player who learns the code
 * once reads any new panel without being taught it.
 */
export const HUE = {
  money: '#6ef07a',
  bonus: '#ffb340',
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
  plate: Color4.create(0, 0, 0, 0.62),
  inset: Color4.create(0, 0, 0, 0.45)
}

/**
 * Touch geometry. 44 pt is the floor Apple, Material and WCAG 2.5.5 all land on, and 8 pt
 * is the smallest gap that stops one thumb hitting two things. Divided by the 0.5275 above,
 * that is 84 and 16 virtual pixels; both are rounded up.
 */
export const TAP = { height: 96, gap: 20 } as const
