"""RNNoise vs DeepFilterNet3 on speech + noise (#825): PESQ-WB and STOI against clean speech.

Fixtures from scripts/gen-vad-fixtures.py (FLEURS pt_br + white noise / babble at
0, 5 and 10 dB). Both suppressors run at 48 kHz (what they assume) and are
scored at 16 kHz. Every output is aligned to the clean reference by
cross-correlation before scoring: RNNoise delays its output by 20 ms, and
STOI on the unaligned output read 0.47 on CLEAN speech (0.81 aligned) — a
first run without this made RNNoise look destructive everywhere.

    uv run --python 3.10 --index-strategy unsafe-best-match \
        --with "deepfilternet==0.5.6" --with pesq --with pystoi --with pyrnnoise \
        --with soundfile --with scipy --with "numpy<2" \
        --with "torch==1.13.1" --with "torchaudio==0.13.1" \
        --index-url https://pypi.org/simple \
        --extra-index-url https://download.pytorch.org/whl/cpu \
        python scripts/bench-noise-suppression.py <fixtures dir>

deepfilternet 0.5.6 (DeepFilterNet3) still imports torch._six, hence torch 1.13.
"""
import json, sys, time
from pathlib import Path
import numpy as np
from scipy.signal import resample_poly, correlate
from pesq import pesq
from pystoi import stoi
from pyrnnoise import RNNoise
import torch
from df.enhance import enhance, init_df

DATA = Path(sys.argv[1])
meta = json.load(open(DATA / "meta.json"))
clean = {m["clip"]: np.fromfile(DATA / m["file"], dtype="<f4") for m in meta if m["noise"] == "clean"}
model, df_state, _ = init_df()

def rnnoise(x16):
    x48 = resample_poly(x16, 3, 1).astype(np.float32)
    den = RNNoise(sample_rate=48000)
    pcm = np.clip(x48, -1, 1)
    pcm16 = (pcm * 32767).astype(np.int16)
    out = [frame for _, frame in den.denoise_chunk(pcm16, partial=True)]
    y = np.concatenate([np.asarray(f).reshape(-1) for f in out]).astype(np.float32)
    if np.abs(y).max() > 2: y = y / 32768.0
    y = y[: len(x48)]
    if len(y) < len(x48): y = np.pad(y, (0, len(x48) - len(y)))
    return resample_poly(y, 1, 3).astype(np.float32)[: len(x16)]

def dfn(x16):
    x48 = torch.from_numpy(resample_poly(x16, 3, 1).astype(np.float32))[None]
    y = enhance(model, df_state, x48)[0].numpy()
    return resample_poly(y, 1, 3).astype(np.float32)[: len(x16)]

def align(ref, y, max_lag=1600):
    """Shift y to best match ref (cross-correlation within +-100 ms); scores on misaligned output are meaningless."""
    n = min(len(ref), len(y))
    c = correlate(y[:n], ref[:n], mode="full", method="fft")
    mid = n - 1
    window = c[mid - max_lag: mid + max_lag + 1]
    lag = int(np.argmax(window)) - max_lag
    if lag > 0: y = y[lag:]
    elif lag < 0: y = np.concatenate([np.zeros(-lag, np.float32), y])
    return y, lag

lags = {}
rows = {}
cost = {"rnnoise": [0.0, 0.0], "dfn": [0.0, 0.0]}
for m in meta:
    if m["noise"] == "clean": continue
    ref = clean[m["clip"]]; noisy = np.fromfile(DATA / m["file"], dtype="<f4")
    key = f'{m["noise"]} {m["snr"]} dB'
    for name, fn in [("noisy", lambda x: x), ("rnnoise", rnnoise), ("dfn", dfn)]:
        t = time.perf_counter(); y = fn(noisy); dt = time.perf_counter() - t
        if name in cost: cost[name][0] += dt; cost[name][1] += len(noisy) / 16000
        y, lag = align(ref, y)
        lags.setdefault(name, []).append(lag)
        n = min(len(ref), len(y))
        p = pesq(16000, ref[:n], y[:n], "wb"); s = stoi(ref[:n], y[:n], 16000, extended=False)
        rows.setdefault((key, name), []).append((p, s))
print("condition | method | PESQ-WB | STOI")
for (key, name), vals in rows.items():
    a = np.array(vals); print(f"{key} | {name} | {a[:,0].mean():.2f} | {a[:,1].mean():.3f}")
for name, ls in lags.items():
    print(f"{name}: lag compensated, median {int(np.median(ls))} samples at 16 kHz")
for name, (t, d) in cost.items():
    print(f"{name}: real-time factor {t/d:.4f} (Python, CPU, {torch.get_num_threads()} torch threads)")
