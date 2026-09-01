import { engine, Transform, AudioSource, Entity, InputAction } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { TYPE, C, TAP, SKIN, RAD } from './theme'
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
export function tic(): void {
  if (sonClic === null) {
    sonClic = engine.addEntity()
    Transform.create(sonClic, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
    AudioSource.create(sonClic, { audioClipUrl: 'assets/sounds/tick.wav', playing: false, loop: false, volume: 0.55 })
  }
  const a = AudioSource.getMutableOrNull(sonClic)
  if (a !== null) { a.playing = false; a.playing = true }
}

/**
 * The surfaces, all of them, so no screen invents its own again.
 *
 * An audit of the interface (1 Sep) found thirty-three hand-written backgrounds across nine
 * files: the menu spoke the generated skins while the HUD, which is what a player looks at
 * for the whole session, was flat black rectangles with square corners. That is not a style,
 * it is the absence of one, and it is the consistency lesson at the scale that matters.
 *
 * Four surfaces and nothing else:
 *   PLAQUE  SKIN.panel, the nine-sliced navy: any window, dialog, banner or notice.
 *   CARTE   a faint wash, rounded: one row inside a panel.
 *   PUCE    the same wash, shorter: information, or a state that cannot be acted on.
 *   PISTE   the groove a progress bar fills.
 * Plus VOILE, the dimming behind a modal.
 */
export const SURF = {
  carte: Color4.create(1, 1, 1, 0.05),
  puce: Color4.create(1, 1, 1, 0.06),
  piste: Color4.create(1, 1, 1, 0.14),
  voile: Color4.create(0, 0, 0, 0.7)
} as const

/**
 * The plate, switched off: an inert state or a piece of information in an action slot.
 *
 * ONE SHAPE FOR EVERY CONTROL. An earlier pass gave inert states a different shape, a flat
 * chip, on the reasoning that only pressable things should wear a plate. The owner caught
 * it (1 Sep): two shapes side by side, differing only by whether you can click, is exactly
 * what consistency forbids. The reference systems agree, and they are unanimous: a disabled
 * control keeps its container and loses its VALUE and its saturation. So this is the same
 * nine-sliced plate as a button, in the skin that sits below the card instead of above it,
 * at the same width and the same height as the control it stands in for.
 */
export const Puce = (props: { width: number; height?: number; right?: number; children?: unknown }) => (
  <UiEntity
    uiTransform={{
      width: props.width, height: props.height ?? TAP.height,
      justifyContent: 'center', alignItems: 'center',
      margin: props.right !== undefined ? { right: props.right } : undefined
    }}
    uiBackground={SKIN.disabled}
  >
    {props.children}
  </UiEntity>
)

/** A row inside a panel: the wash, the radius, the padding, decided once. */
export const Carte = (props: { hauteur: number; bas?: number; children?: unknown }) => (
  <UiEntity
    uiTransform={{
      width: '100%', height: props.hauteur, flexDirection: 'row', alignItems: 'center',
      margin: { bottom: props.bas ?? 10 }, padding: { left: 16, right: 10 }, borderRadius: RAD.card
    }}
    uiBackground={{ color: SURF.carte }}
  >
    {props.children}
  </UiEntity>
)

/**
 * A progress bar, groove and fill, both rounded.
 *
 * There were four of these written by hand, and every one of them was a pair of square
 * rectangles inside an interface where everything else is rounded.
 */
export const Barre = (props: { pct: number; hauteur: number; couleur: Color4; largeur?: number | `${number}%`; haut?: number }) => (
  <UiEntity
    uiTransform={{
      width: props.largeur ?? '100%', height: props.hauteur,
      margin: props.haut !== undefined ? { top: props.haut } : undefined, borderRadius: RAD.bar
    }}
    uiBackground={{ color: SURF.piste }}
  >
    <UiEntity
      uiTransform={{ width: `${Math.max(0, Math.min(100, props.pct))}%`, height: props.hauteur, borderRadius: RAD.bar }}
      uiBackground={{ color: props.couleur }} />
  </UiEntity>
)

/**
 * Une commande de pouce: ronde, grande, une image et rien d'autre.
 *
 * Le client ne laisse pas choisir la position de ses boutons tactiles, seulement les cacher ou
 * changer leur image. La seule facon documentee de decider de la disposition est de remplacer
 * les natifs par notre interface (doc officielle, "Input on Mobile": *hide any button
 * (including jump) [...] or replace the native controls entirely with custom UI*). Ces boutons
 * sont donc les notres, lies aux memes actions par `uiInputBinding`, ronds et dimensionnes
 * pour un pouce plutot que pour un curseur.
 *
 * La pastille mord sur le bord, elle ne flotte pas a cote: c'est cette position qui dit "il y a
 * quelque chose a faire ici" sans qu'on ait a le lire.
 */
export const Pouce = (props: {
  icone: string
  taille: number
  actions?: InputAction[]
  onClick?: () => void
  primaire?: boolean
  badge?: boolean
  /** Sa place sur l'arc, en pixels depuis le coin bas droit du pave. */
  droite?: number
  bas?: number
}) => {
  const d = props.taille
  const cle = `pouce|${props.icone}`
  const enfonce = Date.now() - (presse.get(cle) ?? 0) < PRESSE_MS
  const fond = props.primaire === true ? SKIN.primary : SKIN.secondary
  return (
    <UiEntity
      uiTransform={{
        width: d, height: d,
        justifyContent: 'center', alignItems: 'center', positionType: 'absolute',
        // Sa place sur l'arc, plus trois pixels vers le bas tant que le doigt appuie.
        position: { right: props.droite ?? 0, bottom: (props.bas ?? 0) - (enfonce ? 3 : 0) }
      }}
      uiBackground={fond}
      uiInputBinding={props.actions !== undefined ? { actions: props.actions } : undefined}
      onMouseDown={() => { presse.set(cle, Date.now()); props.onClick?.() }}
    >
      <UiEntity
        uiTransform={{ width: Math.round(d * 0.56), height: Math.round(d * 0.56), positionType: 'absolute' }}
        uiBackground={{ texture: { src: `assets/ui/${props.icone}.png` }, textureMode: 'stretch' }} />
      {props.badge === true && (
        <UiEntity
          uiTransform={{
            /*
              Sur un disque, le coin de la boite englobante est du vide: la pastille se pose a
              quarante-cinq degres SUR la circonference, ou le bord passe reellement.
            */
            width: 30, height: 30, positionType: 'absolute',
            position: { top: Math.round(d / 2 - (d / 2) * 0.7071 - 15), right: Math.round(d / 2 - (d / 2) * 0.7071 - 15) },
            borderRadius: 15,
            justifyContent: 'center', alignItems: 'center'
          }}
          uiBackground={{ color: Color4.fromHexString('#0b0e17ff') }}
        >
          <UiEntity
            uiTransform={{ width: 20, height: 20, borderRadius: 10 }}
            uiBackground={{ color: Color4.fromHexString('#ff4d6dff') }} />
        </UiEntity>
      )}
    </UiEntity>
  )
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
  /*
    ONE SHAPE, THREE VALUES. That is the whole language of a control.

      LIT      gold, green, blue: press me. The value carries which kind of press it is.
      OFF      the same plate, below the card in value, barely glossed: this exists and
               you cannot act on it. LOCKED, CLAIMED, OWNED, a skin not yet unlocked, a
               reward you have not earned.
      TEXT     a name, a price, a sentence. Never a control.

    Two failures got us here and both are worth remembering. The disabled plate used to be
    LIGHTER than the panel, so the one thing a player cannot press was the brightest shape
    on screen. Then a pass replaced it with a flat chip, which fixed the loudness and broke
    consistency instead: two shapes in one column, differing only by whether they answer a
    tap. The answer both times is the same plate at a lower value.
  */
  if (props.skin === 'disabled') {
    return (
      <Puce width={props.width} height={height} right={props.right}>
        <UiEntity uiTransform={{ width: props.width, height, opacity: 0.62 }}>
          <Glyphs value={props.label} size={size} align="center" box={props.width}
            top={(height - size) / 2} role="name" />
        </UiEntity>
      </Puce>
    )
  }
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
            /*
              Le centre de la pastille est SUR le coin de la plaque: moitie dedans, moitie
              dehors. C'est la position standard d'une notification, et c'est elle qui dit "il
              y a quelque chose a faire ICI". Posee entierement a l'exterieur elle flotte et
              se lit comme un objet separe (proprietaire, 1 Sep).
            */
            width: 28, height: 28, positionType: 'absolute',
            position: { top: -14, right: -14 }, borderRadius: 14,
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
