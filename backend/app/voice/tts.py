"""Text-to-speech layer: a provider interface and the episode-level synthesiser.

Real Indic providers implement `TTSProvider`; `FakeTTS` keeps tests and local runs offline.
Santali (`sat`) is never synthesised: its lines come from the phrase-bank splicer.
"""

import math
import struct
import wave
from pathlib import Path
from typing import Protocol

from app.factory.schema import Episode, Lang


class TTSError(RuntimeError):
    """Provider failed or does not support the request."""


class TTSProvider(Protocol):
    languages: frozenset[Lang]

    def synthesize(self, text: str, lang: Lang, speaker: str, dst: Path) -> Path:
        """Write speech for `text` to `dst` (wav/mp3 that ffmpeg can read) and return it."""
        ...


class FakeTTS:
    """Deterministic stand-in: a tone whose length follows the text. Not speech."""

    languages = frozenset({"ta", "hi", "or", "en"})
    RATE = 24000
    CHARS_PER_SEC = 14  # rough speaking rate

    def synthesize(self, text: str, lang: Lang, speaker: str, dst: Path) -> Path:
        if lang not in self.languages:
            raise TTSError(f"FakeTTS has no voice for {lang!r}")
        seconds = max(0.5, len(text) / self.CHARS_PER_SEC)
        pitch = {"guide": 220, "child": 330, "song": 262}[speaker]
        dst.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(dst), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(self.RATE)
            w.writeframes(
                b"".join(
                    struct.pack("<h", int(9000 * math.sin(2 * math.pi * pitch * i / self.RATE)))
                    for i in range(int(seconds * self.RATE))
                )
            )
        return dst


def synthesize_episode(
    episode: Episode,
    provider: TTSProvider,
    out_dir: Path,
    skip_langs: frozenset[Lang] = frozenset(),
) -> dict[str, Path]:
    """Voice every line of the episode into `out_dir/<line_id>.wav`; returns line id to file.

    Lines in `skip_langs` (e.g. Santali, handled by the splicer) are left out of the result.
    """
    out: dict[str, Path] = {}
    for line in episode.lines():
        if line.lang in skip_langs:
            continue
        if line.lang not in provider.languages:
            raise TTSError(f"line {line.id!r}: provider has no {line.lang!r} voice")
        out[line.id] = provider.synthesize(
            line.text, line.lang, line.speaker, out_dir / f"{line.id}.wav"
        )
    return out
