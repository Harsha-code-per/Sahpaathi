import shutil
from pathlib import Path

import pytest

from app.factory.schema import Episode
from app.voice import build, ivr_prompts, signing
from app.voice.tts import FakeTTS

SAMPLE = Path(__file__).parents[2] / "content/samples/g1-counting-hi-ta.json"


@pytest.fixture
def episode() -> Episode:
    return Episode.model_validate_json(SAMPLE.read_text(encoding="utf-8"))


def test_menu_exists_for_every_language_we_can_synthesise():
    assert set(ivr_prompts.MENU) == {"ta", "hi", "or", "en"}
    assert all(len(t) > 20 for t in ivr_prompts.MENU.values())


def test_santali_families_get_the_menu_in_the_school_language(episode):
    assert ivr_prompts.menu_lang(episode) == "hi"  # the sample's home language is Hindi
    episode.home_lang, episode.school_lang = "sat", "or"
    assert ivr_prompts.menu_lang(episode) == "or"


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_pack_build_writes_recap_and_menu_as_opus(episode, tmp_path):
    ivr = tmp_path / "ivr"
    ivr.mkdir()
    build.build_episode_pack(
        episode, FakeTTS(), signing.generate_keypair()[0], tmp_path / "p.sahpaathi", ivr_dir=ivr
    )
    for name in ("recap.opus", "menu.opus"):
        assert (ivr / name).read_bytes().startswith(b"OggS")
