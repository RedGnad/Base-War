#!/usr/bin/env python3
"""Writes the two upper reveal stings, so a rare pull does not sound like a common one.

Every rarity shared one clip, which flattens the single most emotional moment in the game.
The genre's answer is not a clip per rarity, it is a LADDER: the higher the pull, the longer
the arpeggio, the further it climbs, and the more it rings afterwards. Two extra files cover
the whole ladder while staying cheap:

    reveal.wav       (existing)  Common, Uncommon, Rare
    reveal-big.wav               Epic, Legendary       four notes, half a second
    reveal-huge.wav              Mythic, Secret        six notes, a held chord, a full second

Same synthesis as the coin: sine plus harmonics, exponential decay. The top sting adds a fifth
and an octave held under the last note, which is what makes a jackpot feel like an arrival
rather than a longer beep.

    python3 tools/sounds/build-reveal-tiers.py
"""
import math
import os
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
RATE = 22050


def write(path, notes, step_s, decay_s, tail, chord=None, gain=0.36):
    total = step_s * len(notes) + tail
    n = int(RATE * total)
    buf = [0.0] * n
    for k, freq in enumerate(notes):
        start = int(RATE * step_s * k)
        for i in range(start, n):
            t = (i - start) / RATE
            env = math.exp(-t / decay_s)
            if env < 0.001:
                break
            v = math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(2 * math.pi * freq * 2 * t)
            buf[i] += gain * v * env
    if chord is not None:
        start = int(RATE * step_s * (len(notes) - 1))
        for freq in chord:
            for i in range(start, n):
                t = (i - start) / RATE
                env = math.exp(-t / (decay_s * 3.2))
                if env < 0.001:
                    break
                buf[i] += gain * 0.5 * math.sin(2 * math.pi * freq * t) * env
    frames = bytearray()
    for v in buf:
        frames += struct.pack('<h', int(max(-1.0, min(1.0, v)) * 32767))
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print('wrote', path, f'{os.path.getsize(path)} bytes, {total:.2f}s')


if __name__ == '__main__':
    out = os.path.abspath(os.path.join(HERE, '../../assets/sounds'))
    # Epic and Legendary: a four note climb, C6 E6 G6 C7.
    write(os.path.join(out, 'reveal-big.wav'),
          [1046.5, 1318.5, 1568.0, 2093.0], step_s=0.085, decay_s=0.16, tail=0.22)
    # Mythic and Secret: six notes climbing an octave and a half, then a held triad under the top.
    write(os.path.join(out, 'reveal-huge.wav'),
          [783.99, 1046.5, 1318.5, 1568.0, 2093.0, 2637.0],
          step_s=0.095, decay_s=0.2, tail=0.45,
          chord=[1046.5, 1568.0, 2093.0])
