import shutil
import subprocess
from pathlib import Path

import pytest

from app.voice import audio

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")


def _tone(path: Path, volume_db: float) -> Path:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", "sine=frequency=300:duration=4:sample_rate=44100",
         "-af", f"volume={volume_db}dB", "-ac", "2", str(path)],
        check=True,
    )  # fmt: skip
    return path


def _probe(path: Path, entry: str) -> str:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", entry,
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )  # fmt: skip
    return out.stdout.strip()


@pytest.mark.parametrize("gain", [-30, -6])
def test_quiet_and_loud_inputs_both_land_on_target(tmp_path, gain):
    out = audio.normalize_to_opus(_tone(tmp_path / "in.wav", gain), tmp_path / "out.opus")
    assert abs(audio.measure_lufs(out) - audio.TARGET_LUFS) < 1.0


def test_output_is_mono_opus_at_16kbps(tmp_path):
    out = audio.normalize_to_opus(_tone(tmp_path / "in.wav", -20), tmp_path / "a" / "out.opus")
    assert _probe(out, "stream=codec_name") == "opus"
    assert _probe(out, "stream=channels") == "1"
    assert out.stat().st_size < 4 * 16_000 / 8 * 1.5  # 4 s at 16 kbps, plus container slack


def test_silence_and_missing_input_raise(tmp_path):
    silent = tmp_path / "silent.wav"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", "anullsrc=r=44100:cl=mono", "-t", "2", str(silent)],
        check=True,
    )  # fmt: skip
    with pytest.raises(audio.AudioError, match="silent"):
        audio.normalize_to_opus(silent, tmp_path / "o.opus")
    with pytest.raises(audio.AudioError):
        audio.normalize_to_opus(tmp_path / "nope.wav", tmp_path / "o.opus")


def test_short_peaky_line_still_lands_on_target(tmp_path):
    """Sharp spikes make the limiter eat loudness; the closed-loop gain must win it back."""
    src = tmp_path / "peaky.wav"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
         r"aevalsrc=0.04*sin(2*PI*300*t)+if(lt(mod(t\,0.25)\,0.003)\,0.95\,0):d=1.5:s=24000",
         str(src)],
        check=True,
    )  # fmt: skip
    out = audio.normalize_to_opus(src, tmp_path / "out.opus")
    assert abs(audio.measure_lufs(out) - audio.TARGET_LUFS) < 1.0
