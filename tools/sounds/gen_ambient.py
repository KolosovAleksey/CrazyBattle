"""Пример фоновой музыки «тёмный космос» — оригинальный синтез (не копия Interstellar).
Низкий дрон, медленные органоподобные пады, редкие колокола, реверберация. 32 с, плавная петля.
"""
import numpy as np
import scipy.signal as ss
import soundfile as sf

SR = 44100
D = 32.0
N = int(D * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)


def saw(f, n_harm=10):
    ph = 2 * np.pi * f * t
    return sum(np.sin(k * ph) / k for k in range(1, n_harm + 1)) * (2 / np.pi)


def lp(x, fc):
    return ss.sosfilt(ss.butter(4, fc, 'lowpass', fs=SR, output='sos'), x)


def loop_env(period, phase=0.0):
    return 0.5 - 0.5 * np.cos(2 * np.pi * (t / period + phase))


# дрон: D1, A1, D2 — тихо, медленно «дышит»
drone = (saw(36.71) + saw(55.0) * 0.7 + saw(73.42) * 0.5) * (0.6 + 0.4 * loop_env(16))
drone = lp(drone, 260) * 0.35

# органоподобный пад D-минор: F3-A3-D4 с лёгким расстройством
pad = np.zeros(N)
for f, a in [(174.6, 0.4), (220.0, 0.35), (293.66, 0.3), (146.83, 0.25)]:
    for det in (-0.4, 0.4):
        pad += np.sin(2 * np.pi * (f + det) * t) * a
pad = pad * (0.2 + 0.8 * loop_env(12, 0.25)) * 0.12

# колокола: раз в несколько секунд, пентатоника D-минор
notes = [293.66, 349.23, 440.0, 523.25, 587.33, 698.46, 880.0]
bells = np.zeros(N)
time = 0.6
while time < D - 3:
    f = notes[rng.integers(len(notes))]
    dur = 6.0
    n = int(dur * SR)
    tt = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2.0 * f * tt) * np.exp(-tt / 1.2)) * np.exp(-tt / 2.4)
    i = int(time * SR)
    bells[i:i + n] += tone[:max(0, min(n, N - i))] * 0.22
    time += rng.uniform(3.5, 6.0)

mix = drone + pad + bells

# реверберация (короткий пласт, чтобы петля не звучала сухо)
ir_n = int(2.5 * SR)
it = np.arange(ir_n) / SR
ir = rng.standard_normal(ir_n) * np.exp(-6.9 * it / 2.5)
wet = ss.fftconvolve(mix, ir / np.max(np.abs(ir)))[:N]
mix = mix * 0.65 + wet * 0.35

# плавная петля: склейка начала и конца перекрёстным затуханием
x = mix / (np.max(np.abs(mix)) + 1e-9) * 0.6
fade = int(2.0 * SR)
x[:fade] = x[:fade] * np.linspace(0, 1, fade) + x[-fade:] * np.linspace(1, 0, fade)
x = x[:-fade]
print('ambient', round(len(x) / SR, 2), 's')
