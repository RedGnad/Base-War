import { engine, Transform, AudioSource, Entity, InputAction } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP, SKIN } from './theme'
import { Glyphs } from './glyphs'

/**
 * Two families, split by role.
 *
 * The display face carries anything short that has to be recognised rather than read:
 * titles, the money, and every control label. Sentences stay on the platform's own sans,
 * because a heavy display face set as body copy is the standard way to make an interface
 * look loud and read badly, and the two are meant to complement each other rather than
 * compete. It is also where the two costs happen to agree: the atlas spends one element
 * per character, which is nothing across a dozen short labels and absurd across a
 * paragraph.
 *
 * A control is therefore built here rather than with the platform Button, which can only
 * hold a string of its own.
 */
/*
  The press answered, on every control at once.

  The organisers' one repeated note at the Show & Tell (28 Aug) was tap feedback: "most apps,
  when you click a button..." and the written recap says "give players clear feedback when
  they tap something". Every control in the game goes through this component, so the answer
  lives here and nowhere else: for 130 ms after the touch, a dark film over the plate and the
  label pressed down two pixels, and one short tick through the speaker. An inert control (no
  action, no binding) stays silent, because a dead button that clicks reads as a broken one.
*/
const PRESSE_MS = 130
const presse = new Map<string, number>()
let sonClic: Entity | null = null
function tic(): void {
  if (sonClic === null) {
    sonClic = engine.addEntity()
    Transform.create(sonClic, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
    AudioSource.create(sonClic, { audioClipUrl: 'assets/sounds/tick.wav', playing: false, loop: false, volume: 0.55 })
  }
  const a = AudioSource.getMutableOrNull(sonClic)
  if (a !== null) { a.playing = false; a.playing = true }
}

export const Btn = (props: {
  key?: string
  label: string
  width: number
  primary?: boolean
  /** A named plate when the role is finer than primary/secondary: a claim, a refusal. */
  skin?: 'primary' | 'secondary' | 'success' | 'danger' | 'disabled'
  size?: number
  height?: number
  right?: number
  onClick?: () => void
  bind?: InputAction[]
  /** A red pip in the corner: something behind this control is waiting to be collected. */
  badge?: boolean
}) => {
  const size = props.size ?? TYPE.body
  const height = props.height ?? TAP.height
  const actif = props.onClick !== undefined || props.bind !== undefined
  const cle = `${props.label}|${props.width}`
  const enfonce = actif && Date.now() - (presse.get(cle) ?? 0) < PRESSE_MS
  return (
    <UiEntity
      uiTransform={{
        width: props.width, height,
        margin: props.right !== undefined ? { right: props.right } : undefined,
        pointerFilter: 'block'
      }}
      uiBackground={SKIN[props.skin ?? (props.primary === true ? 'primary' : 'secondary')]}
      uiInputBinding={props.bind !== undefined ? { actions: props.bind } : undefined}
      onMouseDown={actif ? () => { presse.set(cle, Date.now()); tic(); props.onClick?.() } : undefined}
    >
      <Glyphs
        value={props.label} size={size} align="center" box={props.width}
        top={(height - size) / 2 + (enfonce ? 3 : 0)}
        role="name" />
      {enfonce && (
        <UiEntity
          uiTransform={{
            width: props.width, height, positionType: 'absolute', position: { top: 0, left: 0 },
            borderRadius: 26
          }}
          uiBackground={{ color: Color4.create(0.03, 0.08, 0.17, 0.30) }} />
      )}
      {/*
        A pip that sits ON the corner, not inside it.

        It was drawn ten pixels in from the edge, which makes it look like part of the label
        rather than something attached to the control. The documented pattern is a corner
        OVERLAY: anchored top right, straddling the boundary, and separated from a busy parent
        by a ring of the surrounding colour so the two shapes never merge. Sitting half outside
        is what makes it read as a notification rather than as decoration.

        A dot rather than a number, because what matters here is that something is waiting and
        not how much. And it never takes a click: it annotates the button, the button acts.

        The sizes are ours, derived from the control: a fifth of a 96-tall button, which is the
        smallest disc that survives a phone's scale factor, plus a four-pixel ring.
      */}
      {props.badge === true && (
        <UiEntity
          uiTransform={{
            width: 28, height: 28, positionType: 'absolute',
            position: { top: -10, right: -10 }, borderRadius: 14,
            justifyContent: 'center', alignItems: 'center'
          }}
          uiBackground={{ color: Color4.fromHexString('#0b0e17ff') }}
        >
          <UiEntity
            uiTransform={{ width: 20, height: 20, borderRadius: 10 }}
            uiBackground={{ color: C.danger }} />
        </UiEntity>
      )}
    </UiEntity>
  )
}

/*
  The animated fill every bar shares: the drawn percentage chases the real one, and the
  moment a bar completes it flashes once. Keyed module state read by pure renders, the same
  pattern as the living counter. `flashDe` returns the white overlay's alpha for ~220 ms
  after completion; both are cheap enough to call every frame from any list row.
*/
const barres = new Map<string, { vu: number; finiA: number }>()
export function pctAnime(cle: string, cible: number): number {
  const b = barres.get(cle) ?? { vu: cible, finiA: 0 }
  if (cible < b.vu - 30) b.vu = cible                        // a reset (new quest day) snaps down
  else b.vu = b.vu + (cible - b.vu) * 0.22
  if (cible >= 100 && b.vu > 99 && b.finiA === 0) b.finiA = Date.now()
  if (cible < 100) b.finiA = 0
  barres.set(cle, b)
  return Math.max(0, Math.min(100, b.vu))
}
export function flashDe(cle: string): number {
  const b = barres.get(cle)
  if (b === undefined || b.finiA === 0) return 0
  return Math.max(0, 1 - (Date.now() - b.finiA) / 220)
}
