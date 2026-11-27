"""Speech-with-noise fixtures for scripts/bench-vad.mjs.

Ten FLEURS pt_br utterances (16 kHz) padded with 1 s of silence on each side.
Each 512-sample frame is labelled speech when its energy in the CLEAN signal is
within 35 dB of the utterance's loudest frame; the detectors are then scored on
NOISY versions: white noise and babble (eight other utterances summed, the
"full bus" case) at 0, 5 and 10 dB SNR, measured against the speech frames.

    uv run --with numpy --with soundfile python scripts/gen-vad-fixtures.py \
        <fleurs pt_br dev wav dir> <out dir>

Writes <out>/*.f32 (little-endian float32) and <out>/meta.json. The data is
not committed: FLEURS is CC-BY 4.0, download it from Hugging Face
(google/fleurs, data/pt_br/audio/dev.tar.gz).
"""
import json, sys, glob
from pathlib import Path
import numpy as np, soundfile as sf

SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
FRAME = 512
files = sorted(glob.glob(str(SRC / "*.wav")))
speech = [f for f in files[:10]]
babble_src = files[10:18]
rng = np.random.default_rng(822)

def load(f):
    a, sr = sf.read(f, dtype="float32"); assert sr == 16000
    return a if a.ndim == 1 else a.mean(1)

babble = np.zeros(16000 * 40, dtype=np.float32)
for f in babble_src:
    a = load(f); a = a / (np.sqrt((a**2).mean()) + 1e-9)
    off = rng.integers(0, 16000 * 5); n = min(len(a), len(babble) - off); babble[off:off+n] += a[:n]
babble /= np.sqrt((babble**2).mean())

meta = []
for i, f in enumerate(speech):
    clean = load(f)
    pad = np.zeros(16000, dtype=np.float32)
    clean = np.concatenate([pad, clean, pad])
    n = len(clean) // FRAME
    e = np.array([np.sqrt((clean[k*FRAME:(k+1)*FRAME]**2).mean()) for k in range(n)])
    peak = e.max()
    labels = (20 * np.log10(e / peak + 1e-12) > -35).astype(int).tolist()
    mask = np.zeros(len(clean), bool)
    for k, lab in enumerate(labels):
        if lab: mask[k*FRAME:(k+1)*FRAME] = True
    s_rms = np.sqrt((clean[mask]**2).mean())
    for noise in ["white", "babble"]:
        for snr in [0, 5, 10]:
            if noise == "white": nz = rng.standard_normal(len(clean)).astype(np.float32)
            else:
                while True:
                    off = rng.integers(0, len(babble) - len(clean)); nz = babble[off:off+len(clean)].copy()
                    if np.sqrt((nz**2).mean()) > 0.3: break
            nz = nz / np.sqrt((nz**2).mean()) * s_rms / (10 ** (snr / 20))
            mix = clean + nz
            mix = mix / max(1.0, np.abs(mix).max())
            name = f"{i:02d}-{noise}-{snr}.f32"
            mix.astype("<f4").tofile(OUT / name)
            meta.append({"file": name, "clip": i, "noise": noise, "snr": snr, "labels": labels})
    clean.astype("<f4").tofile(OUT / f"{i:02d}-clean.f32")
    meta.append({"file": f"{i:02d}-clean.f32", "clip": i, "noise": "clean", "snr": None, "labels": labels})
json.dump(meta, open(OUT / "meta.json", "w"))
print(len(meta), "files;", sum(sum(m["labels"]) for m in meta if m["noise"]=="clean"), "speech frames of", sum(len(m["labels"]) for m in meta if m["noise"]=="clean"))
