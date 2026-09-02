#!/usr/bin/env python3
"""Le marteau du bouton BUILD, rasterise depuis un SVG de game-icons.net.

Le dessin maison etait un assemblage de deux barres arrondies et il se voyait: "le marteau est
mal fait, c'est hyper simple de trouver un logo de marteau gaming" (proprietaire, 2 Sep). Il a
raison, et la silhouette d'un marteau n'est pas quelque chose qu'on improvise a la taille du
pouce. Celui-ci vient de la bibliotheque de reference du domaine.

    Icone "thor-hammer" par Delapouite, https://game-icons.net
    Creative Commons BY 3.0. Le SVG est verse dans `vendor/` pour que la construction
    soit reproductible hors ligne, et l'attribution est dans NOTICE.md a la racine.

Le SVG n'a que des segments droits, alors le rasteriseur tient en une page: on aplatit les
sous-chemins, on remplit ligne par ligne avec la regle du non-zero, quatre fois trop grand,
puis on reduit. Aucune dependance au-dela de Pillow, deja utilise par les autres outils.

    python3 tools/ui/build-hammer-icon.py
"""
import os
import re

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/ui'))
SVG = os.path.join(HERE, 'vendor/thor-hammer.svg')
N = 256
BLANC = (255, 255, 255)
NAVY = (16, 26, 43)

TOK = re.compile(r'([MmLlHhVvZz])|(-?\d*\.?\d+)')


def sous_chemins(d):
    toks = TOK.findall(d)
    i = 0
    subs, sub = [], []
    cur = (0.0, 0.0)
    debut = (0.0, 0.0)
    cmd = None

    def nombre():
        nonlocal i
        while toks[i][0]:
            i += 1
        v = float(toks[i][1])
        i += 1
        return v

    while i < len(toks):
        if toks[i][0]:
            cmd = toks[i][0]
            i += 1
            if cmd in 'Zz':
                if sub:
                    sub.append(debut)
                    subs.append(sub)
                    sub = []
                cur = debut
                continue
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'M':
            x, y = nombre(), nombre()
            if rel:
                x += cur[0]
                y += cur[1]
            if sub:
                subs.append(sub)
            cur = (x, y)
            debut = cur
            sub = [cur]
            cmd = 'l' if rel else 'L'
        elif c == 'L':
            x, y = nombre(), nombre()
            if rel:
                x += cur[0]
                y += cur[1]
            cur = (x, y)
            sub.append(cur)
        elif c == 'H':
            x = nombre()
            if rel:
                x += cur[0]
            cur = (x, cur[1])
            sub.append(cur)
        elif c == 'V':
            y = nombre()
            if rel:
                y += cur[1]
            cur = (cur[0], y)
            sub.append(cur)
        else:
            raise SystemExit('commande SVG non geree: ' + c)
    if sub:
        subs.append(sub)
    return subs


def rasteriser(subs, taille, marge, couleur):
    SS = 4
    W = taille * SS
    xs = [p[0] for s in subs for p in s]
    ys = [p[1] for s in subs for p in s]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    ech = (1 - 2 * marge) * W / max(x1 - x0, y1 - y0)
    ox = (W - (x1 - x0) * ech) / 2 - x0 * ech
    oy = (W - (y1 - y0) * ech) / 2 - y0 * ech
    segments = []
    for s in subs:
        pts = [(p[0] * ech + ox, p[1] * ech + oy) for p in s]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        for a, b in zip(pts, pts[1:]):
            if a[1] != b[1]:
                segments.append((a, b))
    masque = Image.new('L', (W, W), 0)
    px = masque.load()
    for y in range(W):
        yc = y + 0.5
        croisements = []
        for (ax, ay), (bx, by) in segments:
            if (ay <= yc < by) or (by <= yc < ay):
                t = (yc - ay) / (by - ay)
                croisements.append((ax + t * (bx - ax), 1 if by > ay else -1))
        if not croisements:
            continue
        croisements.sort()
        enroule = 0
        depart = 0.0
        for x, sens in croisements:
            if enroule == 0:
                depart = x
            enroule += sens
            if enroule == 0:
                for xx in range(max(0, int(depart)), min(W, int(x) + 1)):
                    px[xx, y] = 255
    im = Image.new('RGBA', (taille, taille), couleur + (0,))
    im.putalpha(masque.resize((taille, taille), Image.LANCZOS))
    return im


if __name__ == '__main__':
    texte = open(SVG, encoding='utf-8').read()
    # Le premier chemin est le fond carre du fichier de game-icons, le second est l'icone.
    chemin = re.findall(r'<path[^>]*d="([^"]+)"', texte)[1]
    subs = sous_chemins(chemin)
    rasteriser(subs, N, 0.10, BLANC).save(os.path.join(OUT, 'icon-build.png'), optimize=True)
    rasteriser(subs, N, 0.10, NAVY).save(os.path.join(OUT, 'encre-build.png'), optimize=True)
    print('wrote icon-build.png, encre-build.png')
