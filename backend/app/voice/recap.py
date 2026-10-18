"""Absentee catch-up call audio: the episode's `ivr_recap` lines as one phone-quality file.

Telephony providers play 8 kHz, 16-bit, mono WAV. Each line is converted and loudness-matched,
then joined with its `pause_after_sec` of silence plus a short gap between lines.
"""

import subprocess
import wave
from pathlib import Path

from app.factory.schema import Episode
from app.voice.audio import AudioError

RATE = 8000
GAP_SEC = 0.4


def _pcm(src: Path) -> bytes:
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(src),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-",
    ]  # fmt: skip
    try:
        run = subprocess.run(cmd, capture_output=True)
    except FileNotFoundError as e:
        raise AudioError("ffmpeg is not installed or not on PATH") from e
    if run.returncode != 0:
        raise AudioError(
            f"ffmpeg failed on {src.name}: {run.stderr.decode(errors='replace')[-200:]}"
        )
    return run.stdout


def _silence(seconds: float) -> bytes:
    return b"\x00\x00" * int(seconds * RATE)


def build_ivr_recap(episode: Episode, wavs: dict[str, Path], dst: Path) -> Path:
    """`wavs` maps line ids to audio files; every `ivr_recap` line must be present."""
    missing = [line.id for line in episode.ivr_recap if line.id not in wavs]
    if missing:
        raise AudioError(f"no audio for recap lines: {missing}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dst), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        for line in episode.ivr_recap:
            out.writeframes(_pcm(wavs[line.id]))
            out.writeframes(_silence(line.pause_after_sec + GAP_SEC))
    return dst
