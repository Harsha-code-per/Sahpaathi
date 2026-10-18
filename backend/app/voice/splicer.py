"""Santali phrase-bank splicer. No TTS engine speaks Santali well, so every Santali line is built
from recordings of community speakers (content/voices/santali/, recorded with written consent).

A line's text must be made of whole phrase-bank phrases. We match the longest phrase at each
position and join the clips with a short gap. Clips are 16-bit mono WAV, all at one sample rate.
"""

import json
import wave
from dataclasses import dataclass
from pathlib import Path

GAP_SEC = 0.15
BANK_FILE = "phrasebank.json"


class SplicerError(ValueError):
    """Text is not covered by the phrase bank, or a clip is unusable."""


@dataclass(frozen=True)
class Phrase:
    text: str
    clip: Path


def load_phrasebank(directory: Path) -> list[Phrase]:
    """Read `<directory>/phrasebank.json`: [{text, clip, consent}, ...].

    `consent` (a reference to the speaker's signed form, never their name) is required, so a clip
    without recorded consent cannot enter a pack.
    """
    entries = json.loads((directory / BANK_FILE).read_text(encoding="utf-8"))
    phrases = []
    for e in entries:
        if not str(e.get("consent", "")).strip():
            raise SplicerError(f"phrase {e.get('text')!r} has no consent reference")
        clip = directory / e["clip"]
        if not clip.exists():
            raise SplicerError(f"clip missing for {e['text']!r}: {clip}")
        phrases.append(Phrase(e["text"].strip(), clip))
    texts = [p.text for p in phrases]
    if len(set(texts)) != len(texts):
        raise SplicerError("phrase bank has duplicate phrases")
    return phrases


def split_into_phrases(text: str, bank: list[Phrase]) -> list[Phrase]:
    """Longest-match split of `text` into phrase-bank phrases, ignoring spaces between them."""
    by_length = sorted(bank, key=lambda p: len(p.text), reverse=True)
    out: list[Phrase] = []
    rest = text.strip()
    while rest:
        hit = next((p for p in by_length if rest.startswith(p.text)), None)
        if hit is None:
            raise SplicerError(f"not in the phrase bank, starting at: {rest[:30]!r}")
        out.append(hit)
        rest = rest[len(hit.text) :].lstrip()
    return out


def splice(text: str, bank: list[Phrase], dst: Path) -> Path:
    """Write one WAV for `text` built from recorded phrases."""
    clips = [p.clip for p in split_into_phrases(text, bank)]
    if not clips:
        raise SplicerError("empty text")
    dst.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dst), "wb") as out:
        params = None
        for i, clip in enumerate(clips):
            with wave.open(str(clip)) as w:
                p = (w.getnchannels(), w.getsampwidth(), w.getframerate())
                if p[:2] != (1, 2):
                    raise SplicerError(f"{clip.name}: clips must be 16-bit mono WAV")
                if params is None:
                    params = p
                    out.setnchannels(1)
                    out.setsampwidth(2)
                    out.setframerate(p[2])
                elif p != params:
                    raise SplicerError(f"{clip.name}: sample rate differs from the other clips")
                if i:
                    out.writeframes(b"\x00\x00" * int(GAP_SEC * p[2]))
                out.writeframes(w.readframes(w.getnframes()))
    return dst


class SantaliVoice:
    """TTSProvider-shaped adapter, so Santali lines go through the same path as other languages."""

    languages = frozenset({"sat"})

    def __init__(self, directory: Path):
        self.bank = load_phrasebank(directory)

    def synthesize(self, text: str, lang: str, speaker: str, dst: Path) -> Path:
        return splice(text, self.bank, dst)
