"""Reference log-mel spectrograms for `src/audio/log-mel.test.ts`.

Reproduces, in numpy, the exact feature pipelines the models were trained on, so
the TypeScript implementation can be pinned against them number for number:

- Whisper (`whisper/audio.py::log_mel_spectrogram`): periodic Hann window,
  n_fft=400, hop=160, `center=True` with reflect padding, last frame dropped,
  power spectrum, librosa Slaney mel filters (80 or 128), log10 clamped at 1e-10,
  floored at max-8, then (x + 4) / 4.

Run (no install into the system Python):

    uv run --with numpy --with librosa python scripts/gen-log-mel-fixture.py

Writes little-endian float32 files into `src/audio/__fixtures__/`:
`log-mel-input.f32` (2 s at 16 kHz, deterministic) and
`log-mel-whisper80.f32` (80 x frames, row-major by mel bin).
"""

from pathlib import Path

import librosa
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "src" / "audio" / "__fixtures__"
SR = 16_000
N_FFT = 400
HOP = 160


def input_signal() -> np.ndarray:
    """Two seconds with structure in every band: a chirp, two tones, seeded noise."""
    t = np.arange(2 * SR) / SR
    chirp = 0.3 * np.sin(2 * np.pi * (100 * t + (7_000 - 100) / (2 * 2) * t**2))
    tones = 0.2 * np.sin(2 * np.pi * 440 * t) + 0.1 * np.sin(2 * np.pi * 3_100 * t)
    noise = 0.02 * np.random.default_rng(820).standard_normal(t.size)
    envelope = np.minimum(1.0, t * 4) * np.minimum(1.0, (2 - t) * 4)
    return ((chirp + tones + noise) * envelope).astype(np.float32)


def whisper_log_mel(audio: np.ndarray, n_mels: int) -> np.ndarray:
    """Port of whisper.audio.log_mel_spectrogram (torch.stft semantics)."""
    window = np.hanning(N_FFT + 1)[:-1].astype(np.float64)
    padded = np.pad(audio.astype(np.float64), N_FFT // 2, mode="reflect")
    frames = 1 + (padded.size - N_FFT) // HOP
    spec = np.empty((N_FFT // 2 + 1, frames))
    for i in range(frames):
        chunk = padded[i * HOP : i * HOP + N_FFT] * window
        spec[:, i] = np.abs(np.fft.rfft(chunk)) ** 2
    magnitudes = spec[:, :-1]
    filters = librosa.filters.mel(sr=SR, n_fft=N_FFT, n_mels=n_mels)
    mel = filters @ magnitudes
    log_spec = np.log10(np.clip(mel, 1e-10, None))
    log_spec = np.maximum(log_spec, log_spec.max() - 8.0)
    return ((log_spec + 4.0) / 4.0).astype(np.float32)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    audio = input_signal()
    audio.astype("<f4").tofile(OUT / "log-mel-input.f32")
    mel = whisper_log_mel(audio, 80)
    mel.astype("<f4").tofile(OUT / "log-mel-whisper80.f32")
    print(f"input {audio.size} samples, whisper80 {mel.shape}")


if __name__ == "__main__":
    main()
