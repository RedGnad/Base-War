import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { RARITIES, MUTATIONS, encoder, couleurObjet } from '../shared/loot-table'

/**
 * L'INDEX. *« ce menu index qui permet de voir quelle machine on a trouve et lesquelles
 * il nous reste a trouver »*.
 *
 * Avec 98 combinaisons (7 raretes x 14 mutations), c'est ce qui leur donne un sens:
 * sans lui, un Gold Epic n'est qu'un cube violet de plus. Une grille de cases remplies
 * ou vides transforme une table de chiffres en COLLECTION, et une collection incomplete
 * est une raison de revenir.
 */

export const indexView = { ouvert: false, vus: [] as number[] }

export function basculerIndex(): void { indexView.ouvert = !indexView.ouvert }

const CASE = 30
const ECART = 3

export const IndexPanel = () => {
  if (!indexView.ouvert) return <UiEntity uiTransform={{ width: 0, height: 0 }} />
  const vus = new Set(indexView.vus)
  const total = RARITIES.length * MUTATIONS.length

  return (
    <UiEntity
      uiTransform={{
        width: MUTATIONS.length * (CASE + ECART) + 130,
        height: RARITIES.length * (CASE + ECART) + 76,
        positionType: 'absolute',
        position: { top: '14%', left: '50%' },
        margin: { left: -(MUTATIONS.length * (CASE + ECART) + 130) / 2 },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.9) }}
    >
      <Label
        value={`COLLECTION  ${vus.size} / ${total}`}
        fontSize={18}
        color={Color4.fromHexString('#ffd166ff')}
        uiTransform={{ height: 26 }} />

      {RARITIES.map((r) => (
        <UiEntity key={r.id} uiTransform={{ height: CASE + ECART, flexDirection: 'row', alignItems: 'center' }}>
          <Label
            value={r.nom}
            fontSize={11}
            color={Color4.fromHexString(r.couleur + 'ff')}
            uiTransform={{ width: 108, height: CASE }} />
          {MUTATIONS.map((m) => {
            const trouve = vus.has(encoder(r.id, m.id))
            return (
              <UiEntity
                key={m.id}
                uiTransform={{ width: CASE, height: CASE, margin: { right: ECART } }}
                // Trouve: la couleur reelle de l'objet. Pas trouve: une case sourde.
                // La grille se lit d'un coup d'oeil, sans lire un seul mot.
                uiBackground={{
                  color: trouve
                    ? Color4.fromHexString(couleurObjet(r.id, m.id) + 'ff')
                    : Color4.create(1, 1, 1, 0.06)
                }} />
            )
          })}
        </UiEntity>
      ))}

      <Label
        value="rows: rarity   ·   columns: mutation"
        fontSize={11}
        color={Color4.fromHexString('#7d8798ff')}
        uiTransform={{ height: 20 }} />
    </UiEntity>
  )
}
