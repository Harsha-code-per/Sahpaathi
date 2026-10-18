import json
import shutil
import wave
import zipfile
from pathlib import Path

import pytest

from app.factory.schema import Episode
from app.voice import build, signing
from app.voice.pack import verify_pack
from app.voice.splicer import SantaliVoice
from app.voice.tts import FakeTTS, TTSError

_Settings = build.VoiceSettings
SAMPLE = Path(__file__).parents[2] / "content/samples/g1-counting-hi-ta.json"
needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")


@pytest.fixture
def episode() -> Episode:
    return Episode.model_validate_json(SAMPLE.read_text(encoding="utf-8"))


@needs_ffmpeg
def test_full_pipeline_makes_a_verifiable_pack(episode, tmp_path):
    private, public = signing.generate_keypair()
    pack = build.build_episode_pack(episode, FakeTTS(), private, tmp_path / "e.sahpaathi")
    assert verify_pack(pack, public) == episode
    with zipfile.ZipFile(pack) as zf:
        opus = [n for n in zf.namelist() if n.endswith(".opus")]
    assert len(opus) == len(episode.lines())


def test_multivoice_routes_by_language(tmp_path):
    clip = tmp_path / "c.wav"
    with wave.open(str(clip), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 1600)
    (tmp_path / "phrasebank.json").write_text(
        json.dumps([{"text": "joar", "clip": "c.wav", "consent": "form-001"}]), encoding="utf-8"
    )
    voice = build.MultiVoice(FakeTTS(), SantaliVoice(tmp_path))
    assert voice.languages == {"ta", "hi", "or", "en", "sat"}
    assert voice.synthesize("joar", "sat", "guide", tmp_path / "s.wav").exists()
    assert voice.synthesize("namaste", "hi", "guide", tmp_path / "h.wav").exists()
    with pytest.raises(TTSError, match="no voice"):
        build.MultiVoice(FakeTTS()).synthesize("x", "sat", "guide", tmp_path / "x.wav")


def test_cli_keygen_and_missing_key(capsys, monkeypatch, tmp_path):
    assert build.main(["keygen"]) == 0
    assert "PACK_SIGNING_KEY=" in capsys.readouterr().out
    monkeypatch.setattr(
        build,
        "VoiceSettings",
        lambda: _Settings.model_construct(tts_api_key="", pack_signing_key=""),
    )
    assert build.main(["pack", str(SAMPLE), "-o", str(tmp_path / "x"), "--fake"]) == 2


@needs_ffmpeg
def test_cli_writes_pack_with_fake_voice(monkeypatch, tmp_path):
    private, public = signing.generate_keypair()
    monkeypatch.setattr(
        build,
        "VoiceSettings",
        lambda: _Settings.model_construct(tts_api_key="", pack_signing_key=private),
    )
    out = tmp_path / "e.sahpaathi"
    assert build.main(["pack", str(SAMPLE), "-o", str(out), "--fake"]) == 0
    verify_pack(out, public)


@needs_ffmpeg
def test_cli_recap_and_qa(monkeypatch, tmp_path, capsys):
    private, public = signing.generate_keypair()
    monkeypatch.setattr(
        build,
        "VoiceSettings",
        lambda: _Settings.model_construct(tts_api_key="", pack_signing_key=private),
    )
    out, recap = tmp_path / "e.sahpaathi", tmp_path / "recap.wav"
    assert build.main(["pack", str(SAMPLE), "-o", str(out), "--recap", str(recap), "--fake"]) == 0
    assert recap.stat().st_size > 0
    assert build.main(["qa", str(out)]) == 0
    assert "all checks passed" in capsys.readouterr().out
