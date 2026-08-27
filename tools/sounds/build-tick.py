#!/usr/bin/env python3
"""Writes the reel's tick: one short click each time a card crosses the line.

A case-opening reel is heard as much as seen; the reference implementations loop a rolling
sound and the click rate falling with the strip is what makes the slowdown felt. Ours is a
click per card, so the rhythm IS the deceleration. Synthesised here so it is reproducible:
a 2 kHz sine with an eight-millisecond decay and a touch of noise at the attack.

    python3 tools/sounds/build-tick.py
"""
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/sounds/tick.wav'))
RATE = 22050
MS = 45

if __name__ == '__main__':
    random.seed(7)
    frames = bytearray()
    for i in range(int(RATE * MS / 1000)):
        t = i / RATE
        env = math.exp(-t / 0.008)
        v = 0.55 * math.sin(2 * math.pi * 2000 * t) * env
        v += 0.25 * (random.random() * 2 - 1) * math.exp(-t / 0.002)
        frames += struct.pack('<h', int(max(-1, min(1, v)) * 32767))
    with wave.open(OUT, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print('wrote', OUT)
