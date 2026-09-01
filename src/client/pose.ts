/**
 * "C'est moi qui viens de poser ma base", su par les deux morceaux qui en dependent.
 *
 * Sans ce fait, deux choses fausses arrivaient dans la meme seconde (proprietaire, 2 Sep).
 * Le marqueur au sol revenait: `placeHere` l'eteint, mais le systeme qui l'allume tout seul
 * ne regarde que `theftView.basePosee`, qui vient du serveur un aller-retour plus tard, et
 * pendant cet aller-retour il le rallumait. Et l'apparition chez soi se declenchait: elle
 * attend vingt secondes qu'une base arrive du serveur, or une base POSEE arrive par le meme
 * chemin qu'une base RESTAUREE, alors le joueur qui venait de choisir sa place etait aussitot
 * teleporte a sa porte. La regle du genre est "on apparait chez soi EN ARRIVANT", pas "on est
 * deplace quand on construit": quelqu'un qui vient de poser sa base se tient deja exactement
 * ou il a voulu.
 *
 * Module sans aucune importation, expres: `slots.ts` et `travel.ts` sont deja tous deux dans
 * la boucle d'importations de `setup.ts`, et un fait partage ne doit pas dependre de l'ordre
 * d'initialisation des modules.
 */
export const poseView = { demandee: false }
