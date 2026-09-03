#!/usr/bin/env python3
"""Writes the two sounds a shot needs: the shot itself, and the confirmation that it landed.

The gun was firing the crate-smash clip at half volume, so a shot sounded like a thud on
wood and a hit sounded like nothing at all; every tester said the weapons did not feel like
anything (3 Sep). The genre's answer is two distinct cues: a short, bright report when the
round leaves, and a separate crisp tick the instant it lands (the hit marker's sound), so
the ear tells fire from hit without looking. Both synthesised here, reproducible, no licence.

    shot.wav     140 ms: a white-noise burst decaying in 25 ms over a 100 Hz thump that
                 decays in 60 ms, soft-clipped so it reads as a report, not a hiss.
    hitmark.wav   60 ms: two sine ticks, 1.8 kHz then 2.6 kHz, 25 ms each, sharp decay.
    slap.wav      90 ms: a low, rounded thwack: noise through a one-pole low-pass, a 180 Hz
                 body, no click. A paddle on a back, not a gunshot (the slap and the taser
                 played the gun's report, 4 Sep).
    taser.wav    150 ms: an electric crackle: noise gated at 60 Hz with a 4 kHz whine that
                 falls away, so it reads as a zap.

    python3 tools/sounds/build-gun.py
"""
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '../../assets/sounds'))
RATE = 22050


def write(name, samples):
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32767)) for s in samples))
    print(f'wrote {name} ({len(samples) / RATE * 1000:.0f} ms)')


def shot():
    random.seed(7)
    n = int(RATE * 0.14)
    out = []
    for i in range(n):
        t = i / RATE
        noise = (random.random() * 2 - 1) * math.exp(-t / 0.025)
        thump = math.sin(2 * math.pi * 100 * t) * math.exp(-t / 0.06) * 0.9
        click = math.exp(-t / 0.002) * 0.6
        s = math.tanh(2.2 * (noise * 0.8 + thump + click))
        out.append(s * 0.95)
    return out


def hitmark():
    n = int(RATE * 0.06)
    out = []
    for i in range(n):
        t = i / RATE
        if t < 0.025:
            s = math.sin(2 * math.pi * 1800 * t) * math.exp(-t / 0.010)
        else:
            u = t - 0.025
            s = math.sin(2 * math.pi * 2600 * u) * math.exp(-u / 0.010)
        out.append(s * 0.7)
    return out


def slap():
    random.seed(11)
    n = int(RATE * 0.09)
    out = []
    lp = 0.0
    for i in range(n):
        t = i / RATE
        raw = (random.random() * 2 - 1)
        lp += (raw - lp) * 0.18                       # one-pole low-pass: rounds the noise
        body = math.sin(2 * math.pi * 180 * t) * math.exp(-t / 0.035)
        env = math.exp(-t / 0.028)
        out.append(math.tanh(1.8 * (lp * 1.4 * env + body * 0.7)) * 0.9)
    return out


def taser():
    random.seed(13)
    n = int(RATE * 0.15)
    out = []
    for i in range(n):
        t = i / RATE
        gate = 1.0 if (t * 60) % 1 < 0.5 else 0.25     # 60 Hz buzz gating
        noise = (random.random() * 2 - 1) * gate
        whine = math.sin(2 * math.pi * (4000 - 1800 * t / 0.15) * t) * 0.5
        env = math.exp(-t / 0.09)
        out.append(math.tanh(1.6 * (noise * 0.8 + whine)) * env * 0.85)
    return out


if __name__ == '__main__':
    write('shot.wav', shot())
    write('hitmark.wav', hitmark())
    write('slap.wav', slap())
    write('taser.wav', taser())
