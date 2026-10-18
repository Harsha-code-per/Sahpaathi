"""Sarvam AI Bulbul text-to-speech for Tamil, Hindi, Odia and English.

Plain urllib, so no new dependency. `post` is injectable so tests never touch the network.
Docs: https://docs.sarvam.ai (text-to-speech). Key: TTS_API_KEY.
"""

import base64
import json
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

from app.factory.schema import Lang
from app.voice.tts import TTSError

URL = "https://api.sarvam.ai/text-to-speech"
MODEL = "bulbul:v2"
RATE = 24000
MAX_CHARS = 1500  # per request; longer lines are split on sentence ends
CODES = {"ta": "ta-IN", "hi": "hi-IN", "or": "od-IN", "en": "en-IN"}
# Bulbul v2 voices: a warm adult female guide, a male voice for the "child" and song parts.
VOICES = {"guide": "anushka", "child": "abhilash", "song": "anushka"}

Post = Callable[[dict, str], dict]


def _http_post(payload: dict, api_key: str) -> dict:
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "api-subscription-key": api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise TTSError(f"Sarvam returned HTTP {e.code}: {e.read()[:200]!r}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise TTSError(f"could not reach Sarvam: {e}") from e


def chunk(text: str, limit: int = MAX_CHARS) -> list[str]:
    """Split on sentence ends (। . ? !) into pieces under `limit` characters."""
    pieces, cur = [], ""
    for sentence in _sentences(text):
        if cur and len(cur) + len(sentence) > limit:
            pieces.append(cur)
            cur = ""
        cur += sentence
    return [p.strip() for p in [*pieces, cur] if p.strip()]


def _sentences(text: str) -> list[str]:
    out, cur = [], ""
    for ch in text:
        cur += ch
        if ch in "।.?!":
            out.append(cur)
            cur = ""
    return [*out, cur] if cur else out


class SarvamTTS:
    languages = frozenset(CODES)

    def __init__(self, api_key: str, post: Post = _http_post):
        if not api_key:
            raise TTSError("TTS_API_KEY is not set")
        self.api_key = api_key
        self.post = post

    def synthesize(self, text: str, lang: Lang, speaker: str, dst: Path) -> Path:
        if lang not in CODES:
            raise TTSError(f"Sarvam has no voice for {lang!r}")
        wavs = []
        for piece in chunk(text):
            reply = self.post(
                {
                    "text": piece,
                    "target_language_code": CODES[lang],
                    "speaker": VOICES[speaker],
                    "model": MODEL,
                    "speech_sample_rate": RATE,
                    "pace": 0.95,  # a touch slower for Grade 1 to 3 listeners
                },
                self.api_key,
            )
            if not reply.get("audios"):
                raise TTSError("Sarvam reply had no audio")
            wavs.append(base64.b64decode(reply["audios"][0]))
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(_join_wavs(wavs))
        return dst


def _join_wavs(wavs: list[bytes]) -> bytes:
    """Concatenate WAV byte strings that share one format (Sarvam returns identical params)."""
    import io
    import wave

    if len(wavs) == 1:
        return wavs[0]
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        for i, data in enumerate(wavs):
            with wave.open(io.BytesIO(data)) as src:
                if i == 0:
                    w.setparams(src.getparams())
                w.writeframes(src.readframes(src.getnframes()))
    return out.getvalue()
