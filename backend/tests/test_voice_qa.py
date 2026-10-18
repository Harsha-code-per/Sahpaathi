import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest

from app.voice import audio, qa

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")


def _opus(tmp_path: Path, name: str, volume_db: float, seconds: float, normalise: bool) -> bytes:
    wav = tmp_path / f"{name}.wav"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", f"sine=frequency=300:duration={seconds}", "-af", f"volume={volume_db}dB", str(wav)],
        check=True,
    )  # fmt: skip
    out = tmp_path / f"{name}.opus"
    if normalise:
        audio.normalize_to_opus(wav, out)
    else:  # encoded as-is, so its loudness is whatever we set
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
             "-c:a", "libopus", "-b:a", "16k", str(out)],
            check=True,
        )  # fmt: skip
    return out.read_bytes()


def _pack(tmp_path: Path, files: dict[str, bytes]) -> Path:
    pack = tmp_path / "p.sahpaathi"
    with zipfile.ZipFile(pack, "w") as zf:
        for name, data in files.items():
            zf.writestr(f"audio/{name}.opus", data)
    return pack


def test_good_pack_passes(tmp_path):
    pack = _pack(tmp_path, {"a": _opus(tmp_path, "a", -20, 3, True)})
    report = qa.inspect_pack(pack)
    assert report.problems == []
    assert report.lines[0].line_id == "a"
    assert report.lines[0].seconds == pytest.approx(3, abs=0.2)
    assert "all checks passed" in qa.format_report(report)


def test_quiet_unnormalised_line_is_flagged(tmp_path):
    pack = _pack(tmp_path, {"loud": _opus(tmp_path, "l", -20, 3, True),
                            "quiet": _opus(tmp_path, "q", -45, 3, False)})  # fmt: skip
    problems = qa.inspect_pack(pack).problems
    assert len(problems) == 1 and problems[0].startswith("quiet: ")


def test_long_line_and_oversize_pack_are_flagged(tmp_path, monkeypatch):
    monkeypatch.setattr(qa, "MAX_LINE_SEC", 2)
    monkeypatch.setattr(qa, "MAX_PACK_KB", 0.001)
    report = qa.inspect_pack(_pack(tmp_path, {"a": _opus(tmp_path, "a", -20, 3, True)}))
    assert any("s long" in p for p in report.problems)
    assert any("budget" in p for p in report.problems)
