#!/usr/bin/env python3
"""Builds the catalogue card: the picture the whole platform judges us by.

The card that shipped was a screenshot from before the art existed: a grey floor and three
primitive placeholder shapes, in a 1.43 aspect the listing crops. Measured against the
best-performing worlds in the same feed (1 Sep), the pattern is unanimous: SIXTEEN BY NINE,
and the game's NAME lettered on the image. Rat Scape, Space Runner and Flag Tag, the three
most-liked worlds in the catalogue, are all key art with a title lockup, not raw captures.

So this draws key art in the game's own language, and takes an optional background image:

    python3 tools/ui/build-card.py                    # composed background
    python3 tools/ui/build-card.py shot.png           # a real in-game capture behind it

Requires Pillow and tools/ui/display.ttf (Baloo 2 ExtraBold, the face the HUD uses).
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(HERE, '../..'))
POLICE = os.path.join(HERE, 'display.ttf')
SORTIE = os.path.join(RACINE, 'images/base-war-thumbnail.png')
"""Format et zone sure, mesures plutot que supposes.

La fiche jump-in affiche la carte dans un cadre PORTRAIT (~0.78) et recadre au CENTRE, la
liste Discover la montre en paysage. Une image doit donc survivre aux deux coupes. En 16:9
le portrait ne garde que 44 pour cent de la largeur: notre premiere carte y perdait son
titre et la fin de ses trois lignes (proprietaire, 1 Sep). Mesure faite sur les references:
dans cette coupe WonderMine perd son W, Rat Scape perd son titre entier, Soul Magic la
moitie de son logo; SEUL CozyFarm survit, et c'est le seul en 3:2 avec un titre centre.

Donc: master en 3:2, et tout ce qui porte du sens dans la ZONE SURE, l'intersection des
deux coupes. Le decor, lui, peut deborder: c'est son role.
"""
W, H = 1440, 960
SUR_X0, SUR_X1 = int((W - H * 0.78) / 2), int((W + H * 0.78) / 2)   # survit au portrait
SUR_Y0, SUR_Y1 = int((H - W / 1.78) / 2), int((H + W / 1.78) / 2)   # survit au paysage

# The palette is the game's, not a fresh one: theme.ts and toy.ts, read across.
CIEL_HAUT, CIEL_BAS = (0x6f, 0xb4, 0xe8), (0xd6, 0xec, 0xfa)
HERBE = (0x4e, 0xb8, 0x5a)
NAVY, OR = (0x16, 0x23, 0x3f), (0xff, 0xd4, 0x47)
RARETES = ['#78818e', '#4ec04e', '#3d8ef0', '#a855f7', '#f5a524', '#ff4d6d']
PIECES = '♟♞♝♜♛♚'
SYMBOLES = '/System/Library/Fonts/Apple Symbols.ttf'


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def arbre(d, x, sol, h, c):
    """A lollipop tree: a trunk and three canopies, which is what the scene's own trees are."""
    tronc = (0x8a, 0x63, 0x4a)
    d.rectangle((x - h * 0.055, sol - h * 0.42, x + h * 0.055, sol), fill=tronc)
    for dx, dy, r in ((0, -0.62, 0.30), (-0.22, -0.44, 0.24), (0.22, -0.46, 0.25)):
        d.ellipse((x + dx * h - r * h, sol + dy * h - r * h, x + dx * h + r * h, sol + dy * h + r * h),
                  fill=c, outline=mix(c, (0, 0, 0), 0.22), width=3)


def caisse(d, x, y, larg, c):
    """A crate as the game draws it: a body, a lit lid and the strap cross."""
    haut = larg * 0.78
    corps = mix(c, (0, 0, 0), 0.12)
    d.rectangle((x - larg / 2, y - haut, x + larg / 2, y), fill=corps, outline=mix(c, (0, 0, 0), 0.5), width=3)
    d.rectangle((x - larg * 0.56, y - haut - larg * 0.2, x + larg * 0.56, y - haut + larg * 0.04),
                fill=mix(c, (255, 255, 255), 0.3), outline=mix(c, (0, 0, 0), 0.5), width=3)
    sangle = mix(c, (0, 0, 0), 0.42)
    d.rectangle((x - larg * 0.07, y - haut, x + larg * 0.07, y), fill=sangle)
    d.rectangle((x - larg / 2, y - haut * 0.62, x + larg / 2, y - haut * 0.46), fill=sangle)


def base(im, d, x, sol, larg, accent, butin):
    """A plot, with a roof that gives it volume and the loot standing behind its glass.

    A flat front read as a picture frame; the building is a box, so it gets a top face. And
    the glass has to show something: what a base IS, in this game, is loot on display.
    """
    h = larg * 0.78
    creme, verre = (0xf2, 0xe9, 0xd8), (0xcf, 0xe6, 0xf2)
    fuite = larg * 0.30
    # Roof and right flank first, so the front face closes over them.
    d.polygon([(x - larg / 2, sol - h), (x + larg / 2, sol - h),
               (x + larg / 2 + fuite, sol - h - fuite * 0.5), (x - larg / 2 + fuite, sol - h - fuite * 0.5)],
              fill=mix(creme, (255, 255, 255), 0.45), outline=(0xd0, 0xc4, 0xac))
    d.polygon([(x + larg / 2, sol), (x + larg / 2, sol - h),
               (x + larg / 2 + fuite, sol - h - fuite * 0.5), (x + larg / 2 + fuite, sol - fuite * 0.5)],
              fill=mix(creme, (0, 0, 0), 0.14), outline=(0xd0, 0xc4, 0xac))
    d.rectangle((x - larg / 2, sol - h, x + larg / 2, sol), fill=creme, outline=(0xd0, 0xc4, 0xac))
    d.rectangle((x - larg * 0.40, sol - h * 0.86, x + larg * 0.40, sol - h * 0.06), fill=verre,
                outline=(0xb9, 0xd4, 0xe2), width=3)
    # The loot on show, behind the glass, on its lit pad.
    c = rgb(RARETES[butin])
    pad = larg * 0.20
    d.ellipse((x - pad, sol - h * 0.16, x + pad, sol - h * 0.06), fill=(0xbf, 0xb5, 0xa4))
    ft = ImageFont.truetype(SYMBOLES, int(h * 0.52))
    d.text((x, sol - h * 0.12), PIECES[butin], font=ft, fill=c, stroke_width=3,
           stroke_fill=mix(c, (0, 0, 0), 0.6), anchor='ms')
    d.rectangle((x - larg / 2, sol - h - larg * 0.07, x + larg / 2, sol - h + larg * 0.02), fill=accent)
    for dx in (-0.5, 0.5):
        d.rectangle((x + dx * larg - larg * 0.05, sol - h, x + dx * larg + larg * 0.05, sol), fill=accent)


def fond_compose():
    """The plaza as the game lays it out: mat, wall, treeline, a belt of crates and two plots."""
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    horizon = int(H * 0.42)
    for y in range(horizon):
        d.line([(0, y), (W, y)], fill=mix(CIEL_HAUT, CIEL_BAS, (y / horizon) ** 0.8))
    for k in range(9):
        cx, cy, r = 90 + k * 165, 40 + (k * 53) % 90, 34 + (k * 29) % 30
        d.ellipse((cx - r * 1.7, cy - r, cx + r * 1.7, cy + r), fill=(255, 255, 255))
    # Treeline behind the wall, then the wall that closes the plot.
    for k in range(11):
        arbre(d, 40 + k * 128, horizon - 6, 120 + (k * 31) % 46,
              [(0xd8, 0x7a, 0x8e), (0xc9, 0x5f, 0x5f), (0x7f, 0xb0, 0x6a), (0xe0, 0x9a, 0x5a)][k % 4])
    d.rectangle((0, horizon - 22, W, horizon + 6), fill=(0xef, 0xc9, 0xcf))
    d.rectangle((0, horizon - 28, W, horizon - 20), fill=(0xff, 0xd9, 0x7a))
    # The mat, with a perspective grid that opens toward the camera.
    for y in range(horizon + 6, H):
        t = (y - horizon) / (H - horizon)
        d.line([(0, y), (W, y)], fill=mix(mix(HERBE, (255, 255, 255), 0.14), mix(HERBE, (0, 0, 0), 0.12), t))
    for k in range(-16, 34):
        d.line([(W / 2 + (k * 44 - W / 2) * 0.34, horizon + 6),
                (W / 2 + (k * 44 - W / 2) * 2.4, H)], fill=mix(HERBE, (0, 0, 0), 0.07), width=2)
    y, pas = horizon + 20, 12
    while y < H:
        d.line([(0, y), (W, y)], fill=mix(HERBE, (0, 0, 0), 0.07), width=2)
        pas = int(pas * 1.36)
        y += pas
    # Two plots on the left, a belt of crates across the middle: the loop in one picture.
    base(im, d, 372, horizon + 104, 150, (0x3f, 0x86, 0xd6), 2)
    base(im, d, 165, horizon + 132, 214, (0xff, 0xc6, 0x3f), 5)
    # Le tapis traverse toute la scene a l'HORIZONTALE.
    #
    # Il etait dessine en bande oblique partant du milieu de l'image: une pente qui ne
    # suivait ni la grille du sol ni l'axonometrie des parcelles, donc tout paraissait de
    # travers (proprietaire, 1 Sep). Un objet pose au sol dans un decor a fuite centrale se
    # lit droit quand il est perpendiculaire au regard; c'est aussi ce que fait le jeu.
    by = horizon + 172
    ep = 44
    d.rectangle((0, by, W, by + ep), fill=(0xc9, 0x5f, 0x5f))
    d.rectangle((0, by, W, by + 15), fill=(0xe8, 0xa9, 0x5c))
    for k in range(0, W, 54):
        d.rectangle((k, by + 3, k + 26, by + 12), fill=(0xf2, 0xd0, 0xa8))
    for i, c in enumerate([(0x9a, 0xa3, 0xad), (0x4e, 0xc0, 0x4e), (0x3d, 0x8e, 0xf0), (0xa8, 0x55, 0xf7),
                           (0xf5, 0xa5, 0x24)]):
        caisse(d, 118 + i * 268, by + 6, 92, c)
    return im


def piece(im, k, cx, base, haut):
    """One chess piece, in its rarity's colour, with the outline the icons use."""
    c = rgb(RARETES[k])
    sombre = mix(c, (0, 0, 0), 0.62)
    ft = ImageFont.truetype(SYMBOLES, haut)
    calque = Image.new('RGBA', (haut * 2, haut * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    d.text((haut, haut), PIECES[k], font=ft, fill=c + (255,), stroke_width=max(3, haut // 26),
           stroke_fill=sombre + (255,), anchor='ms')
    # A soft contact shadow, so a piece stands on the mat instead of floating over it.
    ombre = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(ombre).ellipse((cx - haut * 0.34, base - haut * 0.07, cx + haut * 0.34, base + haut * 0.07),
                                  fill=(0, 0, 0, 70))
    im.alpha_composite(ombre.filter(ImageFilter.GaussianBlur(9)))
    im.alpha_composite(calque, (int(cx - haut), int(base - haut)))


OR_HAUT, OR_BAS = (0xff, 0xef, 0xa8), (0xf5, 0xa5, 0x24)


def logotype(texte, taille, arc=8):
    """Le nom, traite en logotype: lettres cintrees, degradé, contour navy epais, ombre.

    Les douze cartes de tete du catalogue en portent un; aucune ne se contente de texte pose.
    """
    ft = ImageFont.truetype(POLICE, taille)
    W2 = int(taille * len(texte) * 0.78) + 200
    H2 = int(taille * 2.2)
    calque = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    x = 100
    milieu = len(texte) / 2 - 0.5
    for i, ch in enumerate(texte):
        dy = int(((i - milieu) ** 2) * arc / max(1, milieu ** 2) - arc)
        d.text((x, H2 // 2 + dy), ch, font=ft, fill=(255, 255, 255, 255),
               stroke_width=int(taille * 0.085), stroke_fill=NAVY + (255,), anchor='lm')
        x += int(d.textlength(ch, font=ft) + taille * 0.02)
    masque = calque.split()[3]
    corps = calque.point(lambda v: 255 if v > 200 else 0).convert('L')
    grad = Image.new('RGBA', (W2, H2))
    gd = ImageDraw.Draw(grad)
    for y in range(H2):
        t = min(1, max(0, (y - H2 * 0.30) / (H2 * 0.42)))
        gd.line([(0, y), (W2, y)], fill=mix(OR_HAUT, OR_BAS, t) + (255,))
    lettres = Image.composite(grad, calque, corps)
    lettres.putalpha(masque)
    ombre = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    ombre.paste((0, 0, 0, 140), (0, 0), masque)
    out = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    out.alpha_composite(ombre.filter(ImageFilter.GaussianBlur(11)), (0, int(taille * 0.12)))
    out.alpha_composite(lettres)
    return out.crop(out.getbbox())


def ligne_promesse(texte, taille, couleur=(255, 255, 255)):
    """Une des trois lignes de promesse. WonderMine, second de la plateforme, en a trois."""
    ft = ImageFont.truetype(POLICE, taille)
    tmp = ImageDraw.Draw(Image.new('RGBA', (8, 8)))
    w = int(tmp.textlength(texte, font=ft)) + int(taille * 1.4)
    im = Image.new('RGBA', (w, int(taille * 2)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((taille * 0.7, taille), texte, font=ft, fill=couleur + (255,),
           stroke_width=int(taille * 0.17), stroke_fill=NAVY + (255,), anchor='lm')
    return im.crop(im.getbbox())


def caisse_ouverte(im, cx, sol, larg):
    """Un coffre OUVERT: couvercle rabattu en arriere sur sa charniere, piece qui en sort.

    Deux versions ratees avant celle-ci, toutes deux pour la meme raison: le couvercle etait
    pose PAR-DESSUS la caisse, en biais, et se lisait comme une planche jetee dessus
    (proprietaire, 1 Sep, deux fois). Un coffre qu'on ouvre a son couvercle DERRIERE, dresse
    sur la charniere arriere, dont on voit l'interieur. Ordre de dessin: couvercle, puis
    lueur, puis la piece, puis le corps au premier plan.
    """
    d = ImageDraw.Draw(im)
    haut = larg * 0.66
    c = (0xe0, 0xa2, 0x4a)
    contour = mix(c, (0, 0, 0), 0.58)
    ep = max(3, int(larg * 0.030))
    dos = sol - haut

    # 1. Le couvercle, dresse en arriere. On en voit la face interieure, plus sombre.
    lw = larg * 0.94
    lh = larg * 0.46
    d.polygon([(cx - lw / 2, dos), (cx + lw / 2, dos),
               (cx + lw / 2 * 0.88, dos - lh), (cx - lw / 2 * 0.88, dos - lh)],
              fill=mix(c, (0, 0, 0), 0.34), outline=contour, width=ep)
    d.polygon([(cx - lw / 2 * 0.88, dos - lh), (cx + lw / 2 * 0.88, dos - lh),
               (cx + lw / 2 * 0.88, dos - lh - larg * 0.07), (cx - lw / 2 * 0.88, dos - lh - larg * 0.07)],
              fill=mix(c, (255, 255, 255), 0.34), outline=contour, width=ep)
    d.rectangle((cx - lw * 0.075, dos - lh, cx + lw * 0.075, dos), fill=mix(c, (0, 0, 0), 0.50))

    # 2. La lueur qui sort du coffre, entre le couvercle et le corps.
    cy = dos - larg * 0.10
    lueur = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dl = ImageDraw.Draw(lueur)
    for k in range(12):
        a = k * math.pi / 6 + 0.22
        long = larg * (1.30 if k % 2 == 0 else 0.92)
        demi = 0.15 if k % 2 == 0 else 0.10
        dl.polygon([(cx + math.cos(a - demi) * larg * 0.24, cy + math.sin(a - demi) * larg * 0.24),
                    (cx + math.cos(a + demi) * larg * 0.24, cy + math.sin(a + demi) * larg * 0.24),
                    (cx + math.cos(a) * long, cy + math.sin(a) * long)], fill=(255, 226, 138, 255))
    dl.ellipse((cx - larg * 0.40, cy - larg * 0.40, cx + larg * 0.40, cy + larg * 0.40),
               fill=(255, 240, 186, 205))
    lueur = lueur.filter(ImageFilter.GaussianBlur(5))
    px = lueur.load()
    rmax = larg * 1.6
    for y in range(max(0, int(cy - rmax)), min(im.size[1], int(cy + rmax))):
        for x in range(max(0, int(cx - rmax)), min(im.size[0], int(cx + rmax))):
            r0, g0, b0, a0 = px[x, y]
            if a0 == 0:
                continue
            t = math.hypot(x - cx, y - cy) / rmax
            px[x, y] = (r0, g0, b0, int(a0 * max(0.0, 1 - t) ** 1.15))
    im.alpha_composite(lueur)

    # 3. La piece qui sort, bien au-dessus du bord.
    ft = ImageFont.truetype(SYMBOLES, int(larg * 0.95))
    pc = rgb(RARETES[5])
    d.text((cx, dos + larg * 0.10), PIECES[5], font=ft, fill=pc,
           stroke_width=max(3, int(larg * 0.040)), stroke_fill=mix(pc, (0, 0, 0), 0.66), anchor='ms')

    # 4. Le corps au premier plan, qui coupe la piece a hauteur du bord.
    d.rectangle((cx - larg / 2, dos + larg * 0.02, cx + larg / 2, sol),
                fill=mix(c, (0, 0, 0), 0.10), outline=contour, width=ep)
    sangle = mix(c, (0, 0, 0), 0.46)
    d.rectangle((cx - larg * 0.075, dos + larg * 0.02, cx + larg * 0.075, sol), fill=sangle)
    d.rectangle((cx - larg / 2, sol - haut * 0.52, cx + larg / 2, sol - haut * 0.36), fill=sangle)
    # Le rebord superieur, qui donne son epaisseur au coffre.
    d.rectangle((cx - larg * 0.53, dos - larg * 0.03, cx + larg * 0.53, dos + larg * 0.06),
                fill=mix(c, (255, 255, 255), 0.22), outline=contour, width=ep)


def titre(im):
    """Nom en logotype puis promesse en trois lignes, CENTRES dans la zone sure.

    La structure est celle de WonderMine, second de la plateforme. Le centrage, lui, vient de
    CozyFarm: c'est la seule reference qui traverse le recadrage portrait intacte.
    """
    cx = (SUR_X0 + SUR_X1) // 2
    large_sure = SUR_X1 - SUR_X0
    logo = logotype('BASE WAR', 104)
    if logo.width > large_sure - 20:
        logo = logo.resize((large_sure - 20, int(logo.height * (large_sure - 20) / logo.width)), Image.LANCZOS)
    im.alpha_composite(logo, (cx - logo.width // 2, SUR_Y0 + 22))
    lignes = [ligne_promesse(t, 62) for t in ('SMASH CRATES', 'SHOW YOUR LOOT', 'GUARD IT')]
    bloc_w = max(l.width for l in lignes)
    y0 = SUR_Y0 + 22 + logo.height + 16
    pan = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(pan).rounded_rectangle(
        (cx - bloc_w // 2 - 30, y0 - 20, cx + bloc_w // 2 + 30, y0 + 3 * 94 + 2), radius=28, fill=NAVY + (140,))
    im.alpha_composite(pan)
    y = y0
    for l in lignes:
        im.alpha_composite(l, (cx - l.width // 2, y))
        y += 94


if __name__ == '__main__':
    if len(sys.argv) > 1:
        src = Image.open(sys.argv[1]).convert('RGB')
        # Cover-crop to sixteen by nine, which is what the listing expects.
        r = max(W / src.width, H / src.height)
        src = src.resize((int(src.width * r), int(src.height * r)), Image.LANCZOS)
        gauche = (src.width - W) // 2
        im = src.crop((gauche, 0, gauche + W, H)).convert('RGBA')
    else:
        im = fond_compose().convert('RGBA')
        # Le decor recule: floute et assombri, pour que deux choses seulement avancent,
        # la caisse et le texte. Sur telephone la carte est lue plus petite encore que
        # les trois cents pixels de la planche de reference; peu d'elements, tres gros.
        im = im.filter(ImageFilter.GaussianBlur(3))
        recul = Image.new('RGBA', (W, H), NAVY + (86,))
        im.alpha_composite(recul)
        caisse_ouverte(im, (SUR_X0 + SUR_X1) // 2, SUR_Y1 - 6, 248)
    # A dark wash rising from the bottom, so the lettering never sits on a busy pixel.

    titre(im)
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    im.convert('RGB').save(SORTIE, optimize=True)
    print('ecrit', SORTIE, im.size)
