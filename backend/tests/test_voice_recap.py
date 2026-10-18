import math
import shutil
import struct
import wave
from pathlib import Path

import pytest

from app.factory.schema import Episode
from app.voice.audio import AudioError
from app.voice.recap import GAP_SEC, build_ivr_recap

SAMPLE = Path(__file__).parents[2] / "content/samples/g1-counting-hi-ta.json"
pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")


@pytest.fixture
def episode() -> Episode:
    return Episode.model_validate_json(SAMPLE.read_text(encoding="utf-8"))


def _tone(path: Path, seconds: float, rate: int = 24000) -> Path:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(
            b"".join(
                struct.pack("<h", int(9000 * math.sin(2 * math.pi * 220 * i / rate)))
                for i in range(int(seconds * rate))
            )
        )
    return path


def _wavs(episode: Episode, tmp_path: Path) -> dict[str, Path]:
    return {line.id: _tone(tmp_path / f"{line.id}.wav", 1.0) for line in episode.ivr_recap}


def test_recap_is_8k_mono_and_keeps_the_pauses(episode, tmp_path):
    wavs = _wavs(episode, tmp_path)
    out = build_ivr_recap(episode, wavs, tmp_path / "out" / "recap.wav")
    with wave.open(str(out)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 8000)
        seconds = w.getnframes() / w.getframerate()
    speech = 1.0 * len(wavs)
    pauses = sum(line.pause_after_sec + GAP_SEC for line in episode.ivr_recap)
    assert seconds == pytest.approx(speech + pauses, abs=0.5 * len(wavs))


def test_missing_line_audio_is_refused(episode, tmp_path):
    wavs = _wavs(episode, tmp_path)
    gone = episode.ivr_recap[0].id
    del wavs[gone]
    with pytest.raises(AudioError, match=gone):
        build_ivr_recap(episode, wavs, tmp_path / "recap.wav")
