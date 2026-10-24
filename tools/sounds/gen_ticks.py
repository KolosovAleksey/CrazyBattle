"""Замена 4 звуков: открытие кейса (быстрое и медленное) и прокрут рулетки апгрейда (быстрый и медленный).
Сухие механические щелчки из шума в середине диапазона, без низкого «бочечного» тона и без чистого тона.
Отдельный генератор, со своим rng: остальные звуки не меняются.
"""
import os
import numpy as np
import scipy.signal as ss
import soundfile as sf

SR = 44100
OUT = '/home/user/case-drop/sounds'
rng = np.random.default_rng(2024)


def bp(x, f1, f2, order=4):
    return ss.sosfilt(ss.butter(order, [f1, f2], 'bandpass', fs=SR, output='sos'), x)


def hp(x, fc):
    return ss.sosfilt(ss.butter(4, fc, 'highpass', fs=SR, output='sos'), x)


def expenv(n, tau, a=0.0002):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / tau)


def fade_out(x, ms=4):
    r = min(int(ms / 1000 * SR), len(x))
    x[-r:] *= np.linspace(1, 0, r)
    return x


def save(name, x, peak):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    x = fade_out(x)
    sf.write(os.path.join(OUT, name + '.wav'), x.astype(np.float32), SR, subtype='PCM_16')
    print(f'{name:16s} {len(x) / SR:5.3f} s  peak {peak}')


def click(d, f1, f2, tau):
    n = int(d * SR)
    body = bp(rng.standard_normal(n), f1, f2) * expenv(n, tau)
    # короткий сухой «клик» в самом начале, без хвоста
    tip = bp(rng.standard_normal(n), 2500, 6000) * expenv(n, tau * 0.35, a=0.00005)
    return body + 0.5 * tip


def swish(d, f_lo, f_hi):
    """короткий «шух»: полоса, которая едет вверх по частоте, с огибающей пик-спад"""
    n = int(d * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 256
    for i in range(0, n, seg):
        p = i / n
        fc = f_lo + (f_hi - f_lo) * p
        chunk = noise[i:i + seg]
        lo, hi = fc * 0.6, min(fc * 1.4, SR / 2 - 200)
        y = bp(np.concatenate([chunk, np.zeros(seg)]), lo, hi)[:len(chunk)]
        out[i:i + seg] = y
    t = np.arange(n) / n
    env = np.sin(np.pi * t) ** 1.5
    return out * env


# медленное открытие кейса: сухой щелчок, как у тикающей рулетки (тик)
save('case_tick', click(0.05, 1400, 4200, 0.0035), peak=0.26)

# быстрое открытие кейса: короткий «шух» и один клик в конце
fast = swish(0.32, 1400, 4200)
fast[-int(0.02 * SR):] += click(0.02, 1800, 4500, 0.002)[:int(0.02 * SR)] * 0.4
save('case_fast', fast, peak=0.30)

# прокрут рулетки апгрейда, медленный: чуть теплее, но без бочки
save('up_tick', click(0.06, 1000, 3000, 0.0050), peak=0.28)

# прокрут рулетки апгрейда, быстрый: короче и выше
save('up_tick_fast', click(0.035, 1800, 4500, 0.0028), peak=0.24)

print('done')
