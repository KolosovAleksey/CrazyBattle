"""Звуки сайта CrazyBattle, v2 — без писка и без звонких высоких тонов.
Только глухие удары, низкие тёплые гулы и приглушённые шумы. Громкость задана пиком каждого файла.
Запуск: python3 gen_sfx.py → case-drop/sounds/*.wav
"""
import os
import numpy as np
import scipy.signal as ss
import soundfile as sf

SR = 44100
OUT = '/home/user/case-drop/sounds'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)


def T(d):
    return np.arange(int(round(d * SR))) / SR


def shape(x, a=0.002, tau=0.3, rel=0.02):
    n = len(x)
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-t / max(tau, 1e-4))
    r = min(int(rel * SR), n)
    if r > 0:
        e[-r:] *= np.linspace(1, 0, r)
    return x * e


def sine(f, d):
    return np.sin(2 * np.pi * f * T(d))


def saw(f, d, n=6):
    ph = 2 * np.pi * f * T(d)
    return sum(np.sin(k * ph) / k for k in range(1, n + 1)) * (2 / np.pi)


def sweep(f0, f1, d):
    t = T(d)
    f = f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def noise(d):
    return rng.standard_normal(int(round(d * SR)))


def lowpass(x, fc):
    return ss.sosfilt(ss.butter(4, fc, 'lowpass', fs=SR, output='sos'), x)


def bandpass(x, f1, f2):
    return ss.sosfilt(ss.butter(4, [f1, f2], 'bandpass', fs=SR, output='sos'), x)


def reverb(x, wet=0.15, t60=0.9):
    """короткая тёплая реверберация (затемнённая, без звона)"""
    n = int(t60 * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-6.9 * t / t60)
    ir = lowpass(ir, 1500) if n > 40 else ir
    ir /= np.max(np.abs(ir)) + 1e-9
    y = ss.fftconvolve(x, ir)
    y = y / (np.max(np.abs(y)) + 1e-9) * (np.max(np.abs(x)) + 1e-9)
    out = np.zeros(len(y))
    out[:len(x)] += x * (1 - wet)
    out += y * wet
    return out


def add(*xs):
    """сложить сигналы разной длины (короткий дополняется нулями)"""
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[:len(x)] += x
    return out


def layer(d, items):
    out = np.zeros(int(round(d * SR)))
    for t0, x in items:
        i = int(round(t0 * SR))
        if i >= len(out):
            continue
        n = min(len(x), len(out) - i)
        out[i:i + n] += x[:n]
    return out


def save(name, x, peak=0.35):
    x = np.asarray(x, dtype=np.float64)
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    r = min(int(0.01 * SR), len(x))
    x[-r:] *= np.linspace(1, 0, r)
    sf.write(os.path.join(OUT, name + '.wav'), x.astype(np.float32), SR, subtype='PCM_16')
    print(f'{name:16s} {len(x) / SR:5.2f} s  peak {peak}')


# ---------- тики прокрута (глухое дерево/войлок, без высоких нот) ----------
tap = add(shape(bandpass(noise(0.12), 700, 1800), 0.0004, 0.008) * 0.9, shape(sine(170, 0.12), 0.0004, 0.03) * 0.8)
save('case_tick', tap, peak=0.30)

# ---------- быстрый прокрут кейса: мягкий свист-проход ----------
d = 1.1
swell = lowpass(noise(d), 900) * np.sin(np.pi * np.clip(T(d) / d, 0, 1)) ** 2
x = layer(d, [(0, swell * 0.6), (0, sweep(140, 260, 0.9) * np.sin(np.pi * np.clip(T(0.9) / 0.9, 0, 1)) * 0.35)])
save('case_fast', reverb(x, 0.2, 0.8), peak=0.32)

# ---------- выпадение дропа по редкости: тёплые низкие гулы ----------
def warm(freqs, d, tau, fc=600):
    base = sum(sine(f, d) for f in freqs) / len(freqs)
    return lowpass(shape(base, a=0.15, tau=tau, rel=0.3), fc)


save('drop_low', reverb(layer(1.6, [(0, warm([196, 293.66], 1.6, 0.6)), (0.05, lowpass(noise(0.1), 500) * 0.3)]), 0.15, 0.9), peak=0.30)

save('drop_mid', reverb(layer(2.2, [(0, warm([146.83, 220.0, 293.66], 2.2, 0.8, 520) * 0.9),
                                   (0, shape(sine(60, 0.5), 0.002, 0.2) * 0.7)]), 0.2, 1.0), peak=0.38)

save('drop_high', reverb(layer(3.2, [(0, warm([73.4, 110.0, 146.83], 3.2, 1.2, 420) * 0.9),
                                    (0, shape(sine(45, 0.9), 0.002, 0.3) * 1.0),
                                    (0.1, lowpass(sweep(120, 260, 1.2) * np.linspace(0, 1, int(1.2 * SR)), 500) * 0.25)]), 0.2, 1.0), peak=0.42)

# ---------- продажа: глухие монетные «тюк» ----------
def knock(f, tau=0.05):
    return add(shape(sine(f, 0.12), 0.0004, tau) * 0.7, shape(bandpass(noise(0.12), 1200, 2800), 0.0003, 0.004) * 0.7)


save('sell_one', reverb(layer(0.5, [(0, knock(330)), (0.06, knock(260) * 0.6)]), 0.1, 0.5), peak=0.30)
pitches = [262, 294, 330, 262, 392, 330]
save('sell_all', reverb(layer(1.4, [(i * 0.07, knock(pitches[i % len(pitches)], 0.05) * (0.6 + 0.05 * i)) for i in range(len(pitches))]), 0.1, 0.6), peak=0.32)

# ---------- выбор / снятие / проценты (мягкие нажатия) ----------
save('select', add(shape(sine(260, 0.12), 0.0004, 0.03) * 0.8, shape(lowpass(noise(0.12), 1000), 0.0003, 0.01) * 0.6), peak=0.22)
save('deselect', shape(sweep(240, 120, 0.2), 0.001, 0.08), peak=0.24)
save('percent', shape(bandpass(noise(0.03), 1200, 2200), 0.0003, 0.004), peak=0.14)

# ---------- мистический выбор: низкий шёпот ----------
m = layer(1.8, [(0, lowpass(noise(1.6), 700) * np.sin(np.pi * np.clip(T(1.6) / 1.6, 0, 1)) ** 2 * 0.5),
                (0, sweep(110, 220, 1.4) * np.sin(np.pi * np.clip(T(1.4) / 1.4, 0, 1)) * 0.35)])
save('mystic_select', reverb(m, 0.2, 0.9), peak=0.28)

# ---------- прокрут апгрейда ----------
save('up_tick', add(shape(bandpass(noise(0.12), 600, 1500), 0.0004, 0.01) * 0.9, shape(sine(210, 0.12), 0.0004, 0.025) * 0.8), peak=0.32)
save('up_tick_fast', add(shape(bandpass(noise(0.06), 800, 1800), 0.0003, 0.006) * 0.9, shape(sine(240, 0.06), 0.0003, 0.012) * 0.6), peak=0.26)

# ---------- итог апгрейда ----------
save('up_win', reverb(layer(1.6, [(0, warm([196], 1.6, 0.6, 800) * 0.8), (0.12, warm([293.66], 1.4, 0.6, 800) * 0.7),
                                 (0.24, warm([392], 1.4, 0.6, 800) * 0.6)]), 0.2, 0.9), peak=0.34)
save('up_lose', layer(1.0, [(0, lowpass(shape(sweep(200, 90, 0.7), 0.002, 0.4), 500) * 0.9),
                           (0, shape(lowpass(noise(0.3), 400), 0.002, 0.1) * 0.6)]), peak=0.36)

# ---------- золото ----------
rise = sweep(120, 320, 1.2) * np.sin(np.pi * np.clip(T(1.2) / 1.2, 0, 1)) * 0.5
sparkle = lowpass(noise(1.2), 1200) * np.linspace(0, 0.25, int(1.2 * SR))
save('gold_appear', reverb(layer(1.3, [(0, lowpass(rise, 700)), (0, sparkle)]), 0.2, 0.9), peak=0.26)

gold = layer(2.2, [(0, warm([146.83, 220.0, 293.66], 2.2, 0.9, 700)), (0, shape(sine(55, 0.6), 0.002, 0.25) * 0.6)])
save('gold_win', reverb(gold, 0.2, 1.0), peak=0.40)

# ---------- мистический апгрейд: раскрытие ----------
mys = layer(3.2, [(0, shape(sine(40, 1.2), 0.002, 0.5) * 0.9),
                  (0, lowpass(saw(110, 3.0, 5) + saw(146.83, 3.0, 5) * 0.6, 420) * np.sin(np.pi * np.clip(T(3.0) / 3.0, 0, 1)) * 0.5),
                  (0.2, lowpass(noise(1.4), 900) * np.sin(np.pi * np.clip(T(1.4) / 1.4, 0, 1)) * 0.35)])
save('mystic_reveal', reverb(mys, 0.25, 1.2), peak=0.42)

# ---------- контракт: два мягких низких тона ----------
save('contract_done', reverb(layer(1.3, [(0, warm([220], 1.3, 0.4, 800) * 0.8), (0.14, warm([293.66], 1.2, 0.4, 800) * 0.7)]), 0.15, 0.7), peak=0.28)

# ---------- баттлы ----------
clash = layer(0.9, [(0, bandpass(noise(0.1), 800, 3000) * np.exp(-T(0.1) / 0.02) * 0.9),
                   (0, shape(sine(180, 0.6), 0.0005, 0.18) * 0.8),
                   (0.03, shape(sine(260, 0.5), 0.0005, 0.12) * 0.5)])
save('battle_skin', reverb(clash, 0.12, 0.6), peak=0.36)

impact = layer(1.2, [(0, shape(sine(55, 1.0), 0.002, 0.25) * 0.95),
                    (0, lowpass(noise(0.2), 1200) * np.exp(-T(0.2) / 0.04) * 0.6)])
save('battle_case', reverb(impact, 0.12, 0.7), peak=0.42)

print('done')
