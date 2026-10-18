"""ffmpeg steps of the pack pipeline: loudness-normalise to -16 LUFS, encode opus 16 kbps mono."""

import json
import re
import subprocess
from pathlib import Path

TARGET_LUFS = -16.0
TRUE_PEAK_DB = -1.5
LRA = 11.0
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


def normalize_to_opus(src: Path, dst: Path) -> Path:
    """Two-pass loudnorm so the result lands on -16 LUFS, then opus mono at 16 kbps."""
    m = _measure(src)
    if m["input_i"] in ("-inf", "inf"):
        raise AudioError(f"{src.name} is silent")
    measured = (
        f":measured_I={m['input_i']}:measured_TP={m['input_tp']}"
        f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
        f":offset={m['target_offset']}:linear=true"
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg(
        "-i", str(src),
        "-af", _loudnorm(measured),
        "-ac", "1", "-ar", str(SAMPLE_RATE),
        "-c:a", "libopus", "-b:a", BITRATE, "-application", "voip",
        str(dst),
    )  # fmt: skip
    return dst


def measure_lufs(path: Path) -> float:
    """Integrated loudness of any audio file, for tests and the audio QA log."""
    return float(_measure(path)["input_i"])
