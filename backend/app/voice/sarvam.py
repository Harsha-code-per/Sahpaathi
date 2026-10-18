"""Sarvam AI Bulbul text-to-speech for Tamil, Hindi, Odia and English.

Plain urllib, so no new dependency. `post` is injectable so tests never touch the network.
Docs: https://docs.sarvam.ai (text-to-speech). Key: TTS_API_KEY.
"""

import base64
import hashlib
import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

from app.factory.schema import Lang
from app.voice.tts import TTSError

URL = "https://api.sarvam.ai/text-to-speech"
MODEL = "bulbul:v3"  # v2 is retired; v3 covers Tamil, Hindi, Odia and English
RATE = 24000
MAX_CHARS = 2000  # Sarvam allows 2500 per request; longer lines are split on sentence ends
CODES = {"ta": "ta-IN", "hi": "hi-IN", "or": "od-IN", "en": "en-IN"}
# Bulbul v3 voices are chosen per language: a calm female guide, and a male voice for the child and
# song parts, so a child's answer sounds different from the guide (names: Sarvam's v3 voice guide).
VOICES: dict[str, dict[str, str]] = {
    "ta": {"guide": "ritu", "child": "ratan", "song": "ritu"},
    "hi": {"guide": "priya", "child": "shubh", "song": "priya"},
    "or": {"guide": "ritu", "child": "shubh", "song": "ritu"},
    "en": {"guide": "ishita", "child": "ratan", "song": "ishita"},
}
PACE = 0.9  # Sarvam suggests 0.8 to 0.9 for tutorials; Grade 1 to 3 listeners need it unhurried

RETRIES = 6  # attempts per request when Sarvam says "slow down" or has a hiccup

Post = Callable[[dict, str], dict]


class Transient(TTSError):
    """Rate limit (429) or server error (5xx): worth retrying after a pause."""

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


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
        if e.code == 429 or e.code >= 500:
            wait = e.headers.get("Retry-After", "")
            raise Transient(
                f"Sarvam returned HTTP {e.code}", float(wait) if wait.isdigit() else None
            ) from e
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

    def __init__(
        self,
        api_key: str,
        post: Post = _http_post,
        cache_dir: Path | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        """`cache_dir` keeps every synthesised piece, so re-running a build never pays twice."""
        if not api_key:
            raise TTSError("TTS_API_KEY is not set")
        self.api_key = api_key
        self.post = post
        self.cache_dir = cache_dir
        self.sleep = sleep

    def _speak(self, payload: dict) -> bytes:
        cached = None
        if self.cache_dir is not None:
            key = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
            cached = self.cache_dir / f"{key}.wav"
            if cached.exists():
                return cached.read_bytes()
        for attempt in range(RETRIES):
            try:
                reply = self.post(payload, self.api_key)
                break
            except Transient as e:
                if attempt == RETRIES - 1:
                    raise TTSError(f"{e} after {RETRIES} tries; wait a minute and re-run") from e
                self.sleep(e.retry_after or min(2 ** (attempt + 1), 30))
        if not reply.get("audios"):
            raise TTSError("Sarvam reply had no audio")
        wav = base64.b64decode(reply["audios"][0])
        if cached is not None:
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(wav)
        return wav

    def synthesize(self, text: str, lang: Lang, speaker: str, dst: Path) -> Path:
        if lang not in CODES:
            raise TTSError(f"Sarvam has no voice for {lang!r}")
        wavs = []
        for piece in chunk(text):
            wav = self._speak(
                {
                    "text": piece,
                    "language_code": CODES[lang],
                    "speaker": VOICES[lang][speaker],
                    "model": MODEL,
                    "speech_sample_rate": RATE,
                    "pace": PACE,
                }
            )
            wavs.append(wav)
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
