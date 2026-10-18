import base64
import io
import wave

import pytest

from app.voice.sarvam import MAX_CHARS, SarvamTTS, chunk
from app.voice.tts import TTSError


def _wav_b64(frames: int) -> str:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(b"\x00\x00" * frames)
    return base64.b64encode(buf.getvalue()).decode()


class FakePost:
    def __init__(self):
        self.calls: list[dict] = []

    def __call__(self, payload: dict, api_key: str) -> dict:
        self.calls.append({**payload, "key": api_key})
        return {"audios": [_wav_b64(100)]}


def test_request_shape_and_output(tmp_path):
    post = FakePost()
    out = SarvamTTS("secret", post).synthesize(
        "ஒன்று இரண்டு", "ta", "guide", tmp_path / "a" / "x.wav"
    )
    call = post.calls[0]
    assert (call["target_language_code"], call["speaker"], call["key"]) == (
        "ta-IN",
        "anushka",
        "secret",
    )
    assert call["speech_sample_rate"] == 24000
    with wave.open(str(out)) as w:
        assert w.getnframes() == 100


def test_odia_uses_od_in_and_child_gets_the_other_voice(tmp_path):
    post = FakePost()
    SarvamTTS("k", post).synthesize("ଏକ", "or", "child", tmp_path / "x.wav")
    assert (post.calls[0]["target_language_code"], post.calls[0]["speaker"]) == (
        "od-IN",
        "abhilash",
    )


def test_long_text_is_chunked_and_joined(tmp_path):
    text = "एक दो तीन। " * 400
    assert len(text) > MAX_CHARS
    post = FakePost()
    out = SarvamTTS("k", post).synthesize(text, "hi", "guide", tmp_path / "x.wav")
    assert len(post.calls) == len(chunk(text)) > 1
    with wave.open(str(out)) as w:
        assert w.getnframes() == 100 * len(post.calls)


def test_chunks_respect_limit_and_lose_nothing():
    text = "ek. do. teen? char! " * 50
    parts = chunk(text, limit=60)
    assert all(len(p) <= 60 for p in parts)
    assert "".join(parts).replace(" ", "") == text.replace(" ", "")


def test_missing_key_santali_and_empty_reply_are_errors(tmp_path):
    with pytest.raises(TTSError, match="TTS_API_KEY"):
        SarvamTTS("")
    with pytest.raises(TTSError, match="no voice"):
        SarvamTTS("k", FakePost()).synthesize("x", "sat", "guide", tmp_path / "x.wav")
    with pytest.raises(TTSError, match="no audio"):
        SarvamTTS("k", lambda p, k: {"audios": []}).synthesize(
            "x", "hi", "guide", tmp_path / "x.wav"
        )
