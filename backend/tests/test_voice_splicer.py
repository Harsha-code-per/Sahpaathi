import json
import wave
from pathlib import Path

import pytest

from app.voice.splicer import (
    SantaliVoice,
    SplicerError,
    load_phrasebank,
    splice,
    split_into_phrases,
)


def _clip(path: Path, seconds: float, rate: int = 16000, channels: int = 1) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x01\x00" * channels * int(seconds * rate))


def _seconds(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


@pytest.fixture
def bank_dir(tmp_path: Path) -> Path:
    entries = []
    for name, text, secs in [("a", "ab", 1.0), ("b", "abc", 2.0), ("c", "d", 0.5)]:
        _clip(tmp_path / f"{name}.wav", secs)
        entries.append({"text": text, "clip": f"{name}.wav", "consent": "form-001"})
    (tmp_path / "phrasebank.json").write_text(json.dumps(entries), encoding="utf-8")
    return tmp_path


def test_longest_phrase_wins_and_spaces_are_ignored(bank_dir):
    bank = load_phrasebank(bank_dir)
    assert [p.text for p in split_into_phrases("abc d ab", bank)] == ["abc", "d", "ab"]


def test_splice_joins_clips_with_gaps(bank_dir, tmp_path):
    out = splice("ab d", load_phrasebank(bank_dir), tmp_path / "out" / "x.wav")
    assert _seconds(out) == pytest.approx(1.0 + 0.15 + 0.5)


def test_text_outside_the_bank_is_rejected(bank_dir, tmp_path):
    with pytest.raises(SplicerError, match="not in the phrase bank"):
        splice("ab zzz", load_phrasebank(bank_dir), tmp_path / "x.wav")


def test_entry_without_consent_is_rejected(bank_dir):
    f = bank_dir / "phrasebank.json"
    entries = json.loads(f.read_text())
    entries[0]["consent"] = " "
    f.write_text(json.dumps(entries))
    with pytest.raises(SplicerError, match="no consent"):
        load_phrasebank(bank_dir)


def test_missing_clip_and_duplicates_are_rejected(bank_dir):
    f = bank_dir / "phrasebank.json"
    entries = json.loads(f.read_text())
    (bank_dir / "c.wav").unlink()
    with pytest.raises(SplicerError, match="clip missing"):
        load_phrasebank(bank_dir)
    (bank_dir / "c.wav").touch()
    f.write_text(json.dumps([*entries, entries[0]]))
    with pytest.raises(SplicerError, match="duplicate"):
        load_phrasebank(bank_dir)


def test_mismatched_or_stereo_clips_are_rejected(bank_dir, tmp_path):
    _clip(bank_dir / "c.wav", 0.5, rate=8000)
    with pytest.raises(SplicerError, match="sample rate"):
        splice("ab d", load_phrasebank(bank_dir), tmp_path / "x.wav")
    _clip(bank_dir / "c.wav", 0.5, channels=2)
    with pytest.raises(SplicerError, match="mono"):
        splice("ab d", load_phrasebank(bank_dir), tmp_path / "x.wav")


def test_santali_voice_matches_provider_shape(bank_dir, tmp_path):
    voice = SantaliVoice(bank_dir)
    assert voice.languages == {"sat"}
    assert voice.synthesize("abc", "sat", "guide", tmp_path / "y.wav").exists()
