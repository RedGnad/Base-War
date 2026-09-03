#!/usr/bin/env python3
"""Writes the coin pickup: what banking your takings sounds like.

Cashing in was using the crate-smash clip, which is a burst, not a payout. The coin sound is
one of the oldest fixed idioms in games: a very short ASCENDING arpeggio in a bright timbre,
so the ear hears "something was gained" before the number is read. Mario's is two notes; ours
is three, because a collect banks a pile rather than a single coin, and the third note is what
makes it read as a handful.

Built here rather than sourced so it is reproducible and carries no licence:
E6, G#6, B6 (a major triad climbing), sine plus a soft second harmonic for the metal, a five
millisecond noise transient on each attack for the clink, and a fast decay so three notes fit
inside a quarter of a second.

    python3 tools/sounds/build-coin.py
"""
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/sounds/coin.wav'))
RATE = 22050
NOTES = [1318.5, 1661.2, 1975.5]   # E6, G#6, B6
STEP_S = 0.055
DECAY_S = 0.075
TOTAL_S = STEP_S * len(NOTES) + 0.16

if __name__ == '__main__':
    random.seed(11)
    n = int(RATE * TOTAL_S)
    buf = [0.0] * n
    for k, freq in enumerate(NOTES):
        start = int(RATE * STEP_S * k)
        for i in range(start, n):
            t = (i - start) / RATE
            env = math.exp(-t / DECAY_S)
            if env < 0.001:
                break
            v = math.sin(2 * math.pi * freq * t) + 0.35 * math.sin(2 * math.pi * freq * 2 * t)
            # A short metallic transient: the clink that makes it a coin and not a beep.
            if t < 0.005:
                v += 0.6 * (random.random() * 2 - 1) * (1 - t / 0.005)
            buf[i] += 0.42 * v * env
    frames = bytearray()
    for v in buf:
        frames += struct.pack('<h', int(max(-1.0, min(1.0, v)) * 32767))
    with wave.open(OUT, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print('wrote', OUT, f'{os.path.getsize(OUT)} bytes, {TOTAL_S:.2f}s')
