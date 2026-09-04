/**
 * Quelle famille d'icones le bouton contextuel porte. Un mot, et tout bascule.
 *
 * Trois jeux vivent dans le depot, tous commites, et un seul est charge a l'execution.
 *
 *   `blanc`   l'aplat blanc d'origine, dessine dans `tools/ui/build-hud-icon.js`. Il a ete
 *             fait pour le bouton NATIF de Decentraland, qui est sombre: jusqu'au 1 Sep le HUD
 *             mobile n'avait aucun bouton a nous.
 *   `encre`   exactement les memes formes, en navy. Depuis que le HUD porte nos plaques, le
 *             blanc sur l'or ne tient qu'a 1,57 contre 1, et le navy y tient a 11,12, quand ce
 *             depot s'impose un plancher de 3 dans `theme.ts`. Rien d'autre ne change.
 *   `plaque`  du corps sature a contour sombre, dessine dans `tools/ui/build-toy-icons.py`,
 *             la grammaire des icones de cartes.
 *
 * Basculer ne coute qu'un mot et un deploiement: le prechauffage suit la famille active.
 */
export const FAMILLE: 'blanc' | 'encre' | 'plaque' = 'encre'

const PREFIXE = { blanc: 'icon', encre: 'encre', plaque: 'act' } as const

/*
  Nourrir la machine et l'ouvrir portent la MEME icone.

  Ce sont deux etats du meme endroit, mains pleines ou mains vides, et c'est le libelle qui
  porte la difference. Une tremie de plus n'apprenait rien et faisait un dessin a reconnaitre
  pour un contexte deja identifie (proprietaire, 2 Sep).
*/
const VERBES = [
  'build', 'crate', 'place', 'give', 'drop', 'recover', 'collect', 'fire',
  'pickup', 'steal', 'up', 'fuse', 'outbid', 'buy'
] as const

export function ico(nom: (typeof VERBES)[number]): string {
  return `${PREFIXE[FAMILLE]}-${nom}`
}

/** Ce que le prechauffage doit demander: la famille active, et elle seule. */
export const ICONES_VERBES: string[] = VERBES.map((v) => ico(v))
