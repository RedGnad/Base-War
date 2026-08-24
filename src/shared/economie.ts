/**
 * L'ECONOMIE, EN UN SEUL ENDROIT, DERIVEE DE LA COURBE DU GENRE.
 *
 * ============================================================================
 * D'OU VIENNENT CES NOMBRES (mesure du 24 Aug, pas une invention)
 * ============================================================================
 *
 * Source: les 20 paliers de Cookie Clicker, le baremе le mieux documente du genre.
 * Extraits par API depuis `cookieclicker.fandom.com/wiki/Building` et la base de
 * `cookieclickercalc.com/buildings`, puis mesures:
 *
 *   - DANS un palier : cout x1,15 par unite possedee, production constante.
 *   - ENTRE paliers  : cout x13 (mediane), production x6,6 (mediane).
 *   - donc le RAPPORT cout/production DOUBLE a chaque palier (x2,02 mesure).
 *   - le reset (ascension) suit une RACINE CUBIQUE du gain cumule.
 *
 * CE QU'ON AVAIT, ET POURQUOI C'ETAIT FAUX. Notre table etait plate: production x4,
 * prix des boites x4, donc rapport CONSTANT. Le retour sur investissement valait
 * 60 secondes pour la boite a 60 comme pour celle a 3 840. Consequences mesurees:
 *   - aucune raison de progresser, tous les paliers se valent;
 *   - tout prix ABSOLU (etage, palier) devient trivial des la 3e rarete, et une nuit
 *     hors ligne payait 21 etages alors qu'il n'en existe que 3.
 *
 * ============================================================================
 * CE QU'ON REPREND, ET CE QU'ON N'A PAS PU REPRENDRE
 * ============================================================================
 *
 * REPRIS: la geometrie (x6,6 production / x13 cout / rapport x2), et la racine cubique
 * du reset.
 *
 * NON REPRIS: l'escalade x1,15 par unite possedee. Elle suppose des unites illimitees;
 * nous plafonnons a 6 emplacements par etage. Notre limiteur est donc le NOMBRE DE
 * PLACES, comme chez Steal a Brainrot (21 a 31 emplacements). Consequence a assumer
 * partout: **progresser, c'est REMPLACER**, pas accumuler.
 */

/** Production par seconde et par rarete. x6,6 par cran, la mediane mesuree. */
export const PRODUCTION_RARETE = [1, 7, 44, 287, 1897, 12523, 82654] as const

/**
 * Prix des quatre boites.
 * Derives, pas choisis: prix = esperance de production de la boite x retour vise,
 * ou le retour vise DOUBLE a chaque palier (60 s, 120 s, 240 s, 480 s).
 * Les rapports obtenus valent x10,3 / x13,1 / x13,2: la mediane x13 de la reference.
 */
export const PRIX_BOITE = [342, 3539, 46331, 610857] as const

/**
 * Retour vise par palier de boite, en secondes. C'est LUI la regle; les prix ci-dessus
 * en decoulent. Ecrit ici pour qu'on puisse recalculer si la table de butin change.
 */
export const RETOUR_BOITE_S = [60, 120, 240, 480] as const

/**
 * Prix des etages. Meme geometrie que le reste (x12,5), ancres pour couter environ
 * quinze minutes de jeu au moment ou l'on en a besoin:
 *   etage 2: on a 6 emplacements d'uncommon, soit 42/s -> 38 000 = 15,1 min
 *   etage 3: on a 12 emplacements de rare,   soit 528/s -> 475 000 = 15,0 min
 */
export const PRIX_ETAGE_ABS = [0, 38000, 475000] as const

/**
 * PALIERS: racine cubique du gain CUMULE, la formule exacte de la reference
 * (`floor((cumul / seuil)^(1/3))`). Les rendements sont donc decroissants par
 * construction, ce qu'aucune table ecrite a la main ne garantit.
 * Seuil choisi pour que le premier palier tombe apres ~30 min de jeu a 42/s.
 */
export const PALIER_SEUIL = 75000

/** Palier atteignable avec ce gain cumule. */
export function palierPour(cumul: number): number {
  return cumul <= 0 ? 0 : Math.floor(Math.cbrt(cumul / PALIER_SEUIL))
}

/** Gain cumule qu'il faut pour atteindre le palier n. */
export function cumulPourPalier(n: number): number {
  return n <= 0 ? 0 : Math.round(n * n * n * PALIER_SEUIL)
}

/** Multiplicateur de revenu au palier n. +1 par palier, comme la reference. */
export function multiplicateurPalier(n: number): number {
  return 1 + Math.max(0, n)
}

/** Nombre de paliers avant le plafond de rarete. */
export const PALIER_MAX = 12

/**
 * HORS LIGNE: plafonne en SECONDES DE PRODUCTION, pas en heures.
 * Un plafond en heures verse un montant qui croit avec la production, donc qui saute
 * du contenu de plus en plus vite. Un plafond en secondes de production verse toujours
 * la meme AVANCE, quel que soit le stade: ici quinze minutes de jeu, soit exactement le
 * prix d'un etage au moment ou on le veut.
 * A 35 %, le plafond est atteint apres ~43 min d'absence: revenir apres une pause
 * dejeuner ou apres une nuit donne la meme chose, et c'est la norme du genre.
 */
export const HORS_LIGNE_TAUX_V2 = 0.35
export const HORS_LIGNE_PLAFOND_PRODUCTION_S = 900
