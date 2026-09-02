/**
 * Quelle famille d'icones le bouton contextuel porte. Un mot, et tout bascule.
 *
 * Il y en a deux dans le depot, et c'est voulu.
 *
 *   `trait`   la direction artistique du jeu: un aplat blanc sur transparent, dessine dans
 *             `tools/ui/build-hud-icon.js`. C'est celle du proprietaire.
 *   `plaque`  du corps sature a contour sombre, dessine dans `tools/ui/build-toy-icons.py`,
 *             la meme grammaire que les icones des cartes. Elle existe parce que la mesure du
 *             2 Sep dit que sur la plaque OR le blanc ne tient qu'a 1,57 contre 1, quand ce
 *             depot s'impose un plancher de 3 dans `theme.ts`. Le contour, lui, mesure 11,12.
 *
 * Le choix est esthetique et il appartient au proprietaire; le chiffre est un fait et il est
 * ecrit ici pour que la decision se reprenne en connaissance de cause plutot que de memoire.
 * Les deux jeux de fichiers restent commites: basculer ne coute qu'un deploiement.
 */
export const FAMILLE: 'trait' | 'plaque' = 'trait'

const VERBES = [
  'build', 'crate', 'place', 'give', 'drop', 'recover', 'collect', 'fire',
  'pickup', 'steal', 'up', 'fuse', 'feed', 'outbid'
] as const

export function ico(nom: (typeof VERBES)[number]): string {
  return `${FAMILLE === 'trait' ? 'icon' : 'act'}-${nom}`
}

/** Ce que le prechauffage doit demander: la famille active, et elle seule. */
export const ICONES_VERBES: string[] = VERBES.map((v) => ico(v))
