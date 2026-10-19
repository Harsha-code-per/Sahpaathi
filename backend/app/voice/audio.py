"""ffmpeg steps of the pack pipeline: loudness-normalise to -16 LUFS, encode opus 16 kbps mono."""

import json
import re
import subprocess
from pathlib import Path

TARGET_LUFS = -16.0
TRUE_PEAK_DB = -1.5
LRA = 11.0
SETTLE_LU = 0.4  # stop adding gain once the encoded line is this close to the target
BITRATE = "16k"
SAMPLE_RATE = 24000  # opus-native rate; plenty for speech through a small speaker


class AudioError(RuntimeError):
    """ffmpeg failed or produced something unusable."""


def _ffmpeg(*args: str) -> str:
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-y", *args]
    try:
        run = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    except FileNotFoundError as e:
        raise AudioError("ffmpeg is not installed or not on PATH") from e
    if run.returncode != 0:
        raise AudioError(f"ffmpeg failed: {run.stderr.strip().splitlines()[-1:]}")
    return run.stderr


def _loudnorm(extra: str = "") -> str:
    return f"loudnorm=I={TARGET_LUFS}:TP={TRUE_PEAK_DB}:LRA={LRA}{extra}:print_format=json"


def _measure(src: Path) -> dict[str, str]:
    stderr = _ffmpeg("-i", str(src), "-af", _loudnorm(), "-f", "null", "-")
    block = re.findall(r"\{[^{}]*\}", stderr)
    if not block:
        raise AudioError(f"could not measure loudness of {src.name}")
    return json.loads(block[-1])


def _encode(src: Path, dst: Path, gain: float) -> None:
    ceiling = 10 ** (TRUE_PEAK_DB / 20)
    _ffmpeg(
        "-i", str(src),
        "-af", f"volume={gain:.2f}dB,alimiter=limit={ceiling:.3f}:level=disabled",
        "-ac", "1", "-ar", str(SAMPLE_RATE),
        "-c:a", "libopus", "-b:a", BITRATE, "-application", "voip",
        str(dst),
    )  # fmt: skip


def normalize_to_opus(src: Path, dst: Path) -> Path:
    """Gain to -16 LUFS, a limiter for peaks, then opus mono at 16 kbps.

    loudnorm's own linear mode refuses to apply the gain when it would break the true-peak limit,
    which left short, peaky TTS lines up to 4 LU too quiet. So we apply the gain ourselves with a
    limiter catching only the peaks. The limiter itself removes some loudness from very peaky
    lines, so we measure the encoded file and add the shortfall back, up to three more passes.
    """
    m = _measure(src)
    if m["input_i"] in ("-inf", "inf"):
        raise AudioError(f"{src.name} is silent")
    gain = TARGET_LUFS - float(m["input_i"])
    dst.parent.mkdir(parents=True, exist_ok=True)
    _encode(src, dst, gain)
    for _ in range(3):
        error = TARGET_LUFS - measure_lufs(dst)
        if abs(error) <= SETTLE_LU:
            break
        gain += error
        _encode(src, dst, gain)
    return dst


def measure_lufs(path: Path) -> float:
    """Integrated loudness of any audio file, for tests and the audio QA log."""
    return float(_measure(path)["input_i"])
