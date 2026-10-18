import wave
from pathlib import Path

import pytest

from app.factory.schema import Episode
from app.voice.tts import FakeTTS, TTSError, synthesize_episode

SAMPLE = Path(__file__).parents[2] / "content/samples/g1-counting-hi-ta.json"


@pytest.fixture
def episode() -> Episode:
    return Episode.model_validate_json(SAMPLE.read_text(encoding="utf-8"))


def _seconds(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def test_every_line_gets_a_wav(episode, tmp_path):
    files = synthesize_episode(episode, FakeTTS(), tmp_path)
    assert set(files) == {line.id for line in episode.lines()}
    assert all(f.exists() and f.parent == tmp_path for f in files.values())


def test_longer_text_is_longer_audio(tmp_path):
    tts = FakeTTS()
    short = tts.synthesize("ek", "hi", "guide", tmp_path / "s.wav")
    long = tts.synthesize("ek do teen char paanch chhah saat", "hi", "guide", tmp_path / "l.wav")
    assert _seconds(long) > _seconds(short)


def test_unsupported_language_is_an_error_unless_skipped(episode, tmp_path):
    episode.analogy[0].lang = "sat"
    with pytest.raises(TTSError, match=episode.analogy[0].id):
        synthesize_episode(episode, FakeTTS(), tmp_path)
    files = synthesize_episode(episode, FakeTTS(), tmp_path, skip_langs=frozenset({"sat"}))
    assert episode.analogy[0].id not in files
