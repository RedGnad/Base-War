#!/usr/bin/env python3
"""Moves the images embedded in a .glb out to shared .png files next to it.

Why: seven toy models each carried the same two 512 px images (385 KB) inside, so a phone
downloaded the same bytes seven times, and two balloons carried the same 2.2 MB pair (4 Sep).
A glTF may reference an image by URI; the client fetches the file once and reuses it for
every model that names it (the crate models already work this way with `crate-atlas.png`).
The image bytes are hashed, so identical images across files become one file on disk; each
PNG is re-encoded losslessly with the best compression on the way out. Geometry, materials
and UVs are untouched: the model renders identically.

    python3 tools/model/externalise-textures.py assets/toy/item-0.glb [more.glb ...]
"""
import hashlib
import io
import json
import os
import struct
import sys

from PIL import Image


def read_glb(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'glTF', path
    json_len = struct.unpack('<I', data[12:16])[0]
    js = json.loads(data[20:20 + json_len])
    off = 20 + json_len
    bin_len = struct.unpack('<I', data[off:off + 4])[0]
    assert data[off + 4:off + 8] == b'BIN\x00'
    return js, data[off + 8:off + 8 + bin_len]


def write_glb(path, js, binb):
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    binb += b'\x00' * ((4 - len(binb) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(binb)
    with open(path, 'wb') as h:
        h.write(b'glTF' + struct.pack('<II', 2, total))
        h.write(struct.pack('<I', len(jb)) + b'JSON' + jb)
        h.write(struct.pack('<I', len(binb)) + b'BIN\x00' + binb)


def externalise(path):
    js, binb = read_glb(path)
    folder = os.path.dirname(path)
    image_views = {}
    for im in js.get('images', []):
        if 'bufferView' not in im:
            continue
        bv = js['bufferViews'][im['bufferView']]
        start = bv.get('byteOffset', 0)
        raw = binb[start:start + bv['byteLength']]
        digest = hashlib.sha1(raw).hexdigest()[:10]
        name = f'tex-{digest}.png'
        out = os.path.join(folder, name)
        if not os.path.exists(out):
            Image.open(io.BytesIO(raw)).save(out, optimize=True)
        image_views[im['bufferView']] = name
        del im['bufferView']
        im.pop('mimeType', None)
        im['uri'] = name
    if not image_views:
        return 0, 0
    # Rebuild the BIN without the image views, and renumber the ones that stay.
    keep = [i for i in range(len(js['bufferViews'])) if i not in image_views]
    remap = {old: new for new, old in enumerate(keep)}
    new_bin = bytearray()
    new_views = []
    for old in keep:
        bv = js['bufferViews'][old]
        start = bv.get('byteOffset', 0)
        chunk = binb[start:start + bv['byteLength']]
        while len(new_bin) % 4:
            new_bin += b'\x00'
        nv = dict(bv)
        nv['byteOffset'] = len(new_bin)
        new_views.append(nv)
        new_bin += chunk
    js['bufferViews'] = new_views
    for acc in js.get('accessors', []):
        if 'bufferView' in acc:
            acc['bufferView'] = remap[acc['bufferView']]
        sp = acc.get('sparse')
        if sp:
            sp['indices']['bufferView'] = remap[sp['indices']['bufferView']]
            sp['values']['bufferView'] = remap[sp['values']['bufferView']]
    for k in ('images',):
        for im in js.get(k, []):
            assert 'bufferView' not in im
    js['buffers'] = [{'byteLength': len(new_bin)}]
    before = os.path.getsize(path)
    write_glb(path, js, bytes(new_bin))
    return before, os.path.getsize(path)


if __name__ == '__main__':
    total_before = total_after = 0
    for p in sys.argv[1:]:
        b, a = externalise(p)
        total_before += b
        total_after += a
        print(f'{os.path.basename(p)}: {b // 1024} KB -> {a // 1024} KB')
    print(f'total: {total_before // 1024} KB -> {total_after // 1024} KB (plus the shared .png files, once)')
