#!/usr/bin/env python3
"""Bakes a display typeface into a glyph atlas.

Decentraland exposes exactly three fonts, in the interface and in the world alike:
F_SANS_SERIF, F_SERIF and F_MONOSPACE. It is a closed enum in the protocol itself, with no
font asset, no file field and no escape hatch, so a scene cannot ship a typeface the normal
way. What it can ship is a texture, and uiBackground takes a `uvs` rectangle: a string drawn
as one small quad per letter, each quad showing its own corner of one image.

That is what this builds. The atlas is a fixed grid, so a glyph's cell follows from its
index and no lookup table is needed at runtime; the JSON beside it carries only the advance
widths, which is what keeps the text proportional rather than typewritten.

Requires Python with Pillow, and downloads the face once. The outputs are committed, so
building the scene needs neither.

    python3 tools/ui/build-font-atlas.py
"""
import os
import urllib.request

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/ui'))
CACHE = os.path.join(HERE, 'display.ttf')

# Baloo 2 ExtraBold, SIL Open Font License 1.1. Rounded and heavy, which is the register
# the reference games use and the opposite of the platform's default grotesque.
FONT_URL = 'https://fonts.gstatic.com/s/baloo2/v23/wXK0E3kTposypRydzVT08TS3JnAmtdiayqpv.ttf'

# Uppercase only: the interface is set in caps throughout, and halving the glyph count
# halves the atlas. The digits and the handful of symbols cover every number the game
# formats, including the K and M suffixes.
GLYPHS = list('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,:+-/%x$!?() ')

COLS, ROWS = 8, 8
CELL = 128
PAD = 10


def main():
    if not os.path.exists(CACHE):
        print('fetching the face...', end=' ', flush=True)
        urllib.request.urlretrieve(FONT_URL, CACHE)
        print('ok')

    assert len(GLYPHS) <= COLS * ROWS, 'the grid is too small for this glyph set'
    atlas = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (255, 255, 255, 0))
    draw = ImageDraw.Draw(atlas)

    # The size is measured, not assumed.
    #
    # This used to ask for a face of CELL - 2 * PAD and put the baseline at PAD + ascent.
    # Both numbers come from the font's declared metrics, and this face declares very tall
    # ones: at a nominal 108 its ascent alone passes 128, so the baseline landed below the
    # bottom of the cell and every glyph spilled into the row underneath. The atlas came out
    # with the bottom of one row of letters baked into the top of the next, which is what put
    # yellow fragments above the title. No amount of trimming the sampling rectangle can
    # remove ink that is genuinely inside the cell.
    #
    # So the fit is computed from the ink instead. We are baking capitals and digits, whose
    # real extent is roughly the cap height, far short of ascent plus descent. Measuring the
    # union of the actual outlines lets the letters stay as large as the cell can hold while
    # guaranteeing nothing crosses into a neighbour.
    PROBE = 100
    probe = ImageFont.truetype(CACHE, PROBE)
    haut, bas, large = 0.0, 0.0, 0.0
    for ch in GLYPHS:
        if ch == ' ':
            continue
        x0, y0, x1, y1 = draw.textbbox((0, 0), ch, font=probe, anchor='ls')
        haut = min(haut, y0)
        bas = max(bas, y1)
        large = max(large, x1 - x0)
    dispo = CELL - PAD * 2
    # Height and width both have to fit, so the tighter of the two decides.
    facteur = min(dispo / (bas - haut), dispo / large)
    taille = max(8, int(PROBE * facteur))

    font = ImageFont.truetype(CACHE, taille)
    x0, y0, x1, y1 = 0, 0, 0, 0
    encre_haut, encre_bas = 0.0, 0.0
    for ch in GLYPHS:
        if ch == ' ':
            continue
        _, y0, _, y1 = draw.textbbox((0, 0), ch, font=font, anchor='ls')
        encre_haut = min(encre_haut, y0)
        encre_bas = max(encre_bas, y1)
    # One baseline for the whole set, so glyphs sit on a line instead of each centring
    # itself in its own cell and making the text wobble. Placed so the tallest ink starts
    # exactly PAD below the top of the cell.
    baseline = PAD - encre_haut + (dispo - (encre_bas - encre_haut)) / 2
    assert baseline + encre_bas <= CELL, 'the ink would still cross the cell'

    advance = {}
    for i, ch in enumerate(GLYPHS):
        cx, cy = (i % COLS) * CELL, (i // COLS) * CELL
        box = font.getbbox(ch)
        width = font.getlength(ch)
        # Centre the ink in the cell horizontally; the cell is square and most glyphs are
        # narrower, so the advance below is what actually spaces them.
        draw.text((cx + (CELL - width) / 2, cy + baseline), ch, font=font,
                  fill=(255, 255, 255, 255), anchor='ls')
        advance[ch] = round(width / CELL, 4)

    atlas.save(os.path.join(OUT, 'font.png'))

    # The metrics go out as TypeScript rather than JSON: the scene bundle has no loader to
    # argue with, and the table is small enough that inlining it costs nothing.
    src = os.path.abspath(os.path.join(HERE, '../../src/client/font-metrics.ts'))
    rows = ',\n'.join('  "%s": %.4f' % (g, advance[g]) for g in GLYPHS)
    body = TEMPLATE % (COLS, ROWS, ''.join(GLYPHS), rows)
    with open(src, 'w') as f:
        f.write(body)

    size = os.path.getsize(os.path.join(OUT, 'font.png'))
    print('font.png  %d x %d  %d B  face %d px, ink %.1f..%.1f in a %d cell'
          % (COLS * CELL, ROWS * CELL, size, taille,
             baseline + encre_haut, baseline + encre_bas, CELL))
    print('src/client/font-metrics.ts  %d glyphs' % len(GLYPHS))


TEMPLATE = """/**
 * Generated by tools/ui/build-font-atlas.py. Do not edit by hand.
 *
 * Baloo 2 ExtraBold, SIL Open Font License 1.1. Advances are a fraction of one cell, which
 * is what keeps a string proportional instead of typewritten.
 */
export const ATLAS = { cols: %d, rows: %d, glyphs: '%s' } as const

export const ADVANCE: Record<string, number> = {
%s
}
"""


if __name__ == '__main__':
    main()
