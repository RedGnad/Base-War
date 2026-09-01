/**
 * Le verbe que le bouton contextuel propose a cet instant, nomme une fois pour toute la scene.
 *
 * Les marqueurs au sol doivent obeir au bouton, pas a leurs propres conditions. Tant que chacun
 * decidait dans son coin, deux fantomes verts pouvaient s'afficher ensemble sans qu'on sache
 * lequel la touche allait servir (proprietaire, 1 Sep). `nextAction()` est le seul endroit qui
 * arbitre, avec sa liste de priorites; il ecrit ici ce qu'il a choisi, et les marqueurs le
 * lisent. Un marqueur visible signifie donc exactement: appuyer fait CA.
 */
export const verbe: { id: string } = { id: '' }
